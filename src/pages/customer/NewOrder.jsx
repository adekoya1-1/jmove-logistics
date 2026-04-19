/**
 * NewOrder.jsx — State-Machine Booking Flow
 *
 * Architecture
 * ─────────────
 * Uses a strict finite-state machine instead of a raw step integer.
 * Valid transitions are declared up-front; calling transition() with
 * an invalid target is silently ignored, making URL/state manipulation safe.
 *
 * States
 * ──────
 *   route  →  package  →  quoted  →  paying  →  verifying  →  confirmed
 *                                   ↘  booked    (cash / COD path)
 *                                   ↘  whatsapp  (manual payment path)
 *
 * Persistence
 * ───────────
 * All booking state is written to sessionStorage on every change and
 * restored on mount. A page refresh never resets the wizard.
 * The session is cleared automatically when the flow reaches a terminal
 * state (confirmed / booked).
 *
 * Payment
 * ───────
 * Uses Paystack Inline JS loaded on demand. The backend returns an
 * access_code that is passed directly to PaystackPop.newTransaction().
 * The frontend NEVER controls the amount — it is locked inside the
 * access_code by the backend. No Paystack public key is needed in
 * the frontend when using the access_code path.
 *
 * Flow integrity
 * ──────────────
 *  Step 1  valid route  →  advance to package
 *  Step 2  valid package  →  server calculates quote  →  advance to quoted
 *  Step 3  quote shown (read-only)  →  user picks method  →  order created
 *            • online → payment initialised on backend → advance to paying
 *            • cash/COD → advance to booked (terminal)
 *  Step 4  Paystack popup opens with access_code
 *            → on success → backend verifies → advance to confirmed
 *            → on cancel  → stay on paying (retry)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ordersAPI, paymentsAPI, pricingAPI, authAPI } from '../../api/client.js';
import { useAuth } from '../../App.jsx';
import './NewOrder.css';

/* ═══════════════════════════════════════════════════════════
   FEATURE FLAGS
   ─────────────────────────────────────────────────────────
   VITE_ENABLE_ONLINE_PAYMENT=true   → full payment flow (Paystack + cash/COD)
   VITE_ENABLE_ONLINE_PAYMENT=false  → WhatsApp-only mode (all bookings via WA)

   To re-enable online payment: set VITE_ENABLE_ONLINE_PAYMENT=true in .env.local
   and restart the dev server. No code changes required.
═══════════════════════════════════════════════════════════ */
const PAYMENTS_ENABLED = import.meta.env.VITE_ENABLE_ONLINE_PAYMENT === 'true';

/* ═══════════════════════════════════════════════════════════
   STATE MACHINE
═══════════════════════════════════════════════════════════ */
const S = {
  ROUTE:     'route',      // Step 1
  PACKAGE:   'package',    // Step 2
  QUOTED:    'quoted',     // Step 3 — price locked by backend
  PAYING:    'paying',     // Step 4 — Paystack popup ready
  VERIFYING: 'verifying',  // Step 4 — backend verification in progress
  CONFIRMED: 'confirmed',  // Step 4 — paid & verified (terminal)
  BOOKED:    'booked',     // Step 4 — cash/COD, no upfront payment (terminal)
  WHATSAPP:  'whatsapp',   // Step 4 — manual WhatsApp payment (terminal)
};

// Which visual step number each machine state maps to
const VISUAL_STEP = { route: 1, package: 2, quoted: 3, paying: 4, verifying: 4, confirmed: 4, booked: 4, whatsapp: 4 };

// Forward transitions — only these are allowed
const VALID_NEXT = {
  [S.ROUTE]:     [S.PACKAGE],
  [S.PACKAGE]:   [S.QUOTED],
  [S.QUOTED]:    [S.PAYING, S.BOOKED, S.WHATSAPP],
  [S.PAYING]:    [S.VERIFYING],
  [S.VERIFYING]: [S.CONFIRMED],
};

// Back navigation — only permitted from non-terminal, non-terminal-adjacent states
const BACK_TO = { [S.PACKAGE]: S.ROUTE, [S.QUOTED]: S.PACKAGE, [S.PAYING]: S.QUOTED };

const STEPS_BAR = [
  { id: 1, label: 'Route' },
  { id: 2, label: 'Package' },
  { id: 3, label: 'Quote' },
  { id: 4, label: 'Payment' },
];

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════ */
const CATEGORIES = [
  'documents', 'electronics', 'clothing', 'food', 'furniture',
  'fragile items', 'general goods', 'health & beauty', 'auto parts',
];

const SERVICE_TYPES = [
  { value: 'standard', label: 'Standard Delivery',   desc: '2–5 business days interstate, 1–2 hrs intrastate', extra: ''        },
  { value: 'express',  label: 'Express (GoFaster)',   desc: '24–48 hours delivery guaranteed',                  extra: '+₦2,000' },
  { value: 'sameday',  label: 'Same Day Delivery',    desc: 'Available in select cities only',                  extra: '+₦3,000' },
];

const DELIVERY_MODES = [
  { value: 'door',  label: 'Door Delivery', desc: "We deliver directly to the receiver's address", extra: '+₦1,500', icon: '🏠' },
  { value: 'depot', label: 'Depot Pickup',  desc: 'Receiver picks up from our nearest office',     extra: 'Free',    icon: '🏢' },
];

const PAYMENT_METHODS = [
  { value: 'online',    label: 'Pay Online',          desc: 'Card, bank transfer or USSD via Paystack',   icon: '💳' },
  { value: 'cash',      label: 'Pay at Centre',        desc: 'Pay cash when you drop off at our office',   icon: '🏢' },
  { value: 'cod',       label: 'Cash on Delivery',     desc: 'Receiver pays on delivery (e-commerce)',     icon: '📦' },
  { value: 'whatsapp',  label: 'Pay via WhatsApp',     desc: 'Chat with us on WhatsApp & send proof of payment', icon: '📱' },
];

/* ═══════════════════════════════════════════════════════════
   SESSION PERSISTENCE
   All booking progress is saved to sessionStorage so a page
   refresh never loses the user's place in the wizard.
═══════════════════════════════════════════════════════════ */
const SESSION_KEY = 'jmove_booking_v2';

const saveSession = (data) => {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch { /* ignore QuotaExceededError */ }
};

const loadSession = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const clearSession = () => {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
};

/* ═══════════════════════════════════════════════════════════
   PAYSTACK INLINE LOADER
   Loads the Paystack inline JS script on demand (not on page
   load) and resolves with the PaystackPop global object.
   Using access_code means no public key needed in the frontend.
═══════════════════════════════════════════════════════════ */
let _psLoading = false;

const loadPaystackScript = () =>
  new Promise((resolve, reject) => {
    // Already loaded
    if (window.PaystackPop) { resolve(window.PaystackPop); return; }

    // Script tag was added but hasn't finished loading — poll for it
    if (_psLoading) {
      const poll = setInterval(() => {
        if (window.PaystackPop) { clearInterval(poll); resolve(window.PaystackPop); }
      }, 150);
      setTimeout(() => { clearInterval(poll); reject(new Error('Paystack load timeout — check your connection.')); }, 15000);
      return;
    }

    // First call: add the script tag
    _psLoading = true;
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.onload = () => {
      if (window.PaystackPop) resolve(window.PaystackPop);
      else reject(new Error('PaystackPop is not available after script load.'));
    };
    script.onerror = () => {
      _psLoading = false; // allow retry
      reject(new Error('Could not load the Paystack payment library. Please check your internet connection and try again.'));
    };
    document.head.appendChild(script);
  });

/* ═══════════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════════ */
export default function NewOrder() {
  const { user }   = useAuth();
  const { search } = useLocation();
  const navigate   = useNavigate();
  const rebookId   = new URLSearchParams(search).get('rebook');

  /* ── Machine state ── */
  const [machineState, setMachineState] = useState(S.ROUTE);
  const [pricing,      setPricing]      = useState(null);   // locked server quote
  const [orderId,      setOrderId]      = useState(null);
  const [paymentInit,  setPaymentInit]  = useState(null);   // { reference, access_code }
  const [payTab,       setPayTab]       = useState('card'); // payment method preview tab
  const [bookedOrder,  setBookedOrder]  = useState(null);   // { waybillNumber } after booking

  /* ── UI state ── */
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [cities,     setCities]     = useState([]);
  const [savedAddrs, setSavedAddrs] = useState([]);
  const [pricingCfg, setPricingCfg] = useState(null);

  /* ── Guards ── */
  const submitting    = useRef(false);
  const idempotencyKey = useRef(
    `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );

  /* ── Form ── */
  const [form, setForm] = useState({
    senderName:     `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
    senderPhone:    user?.phone  || '',
    senderEmail:    user?.email  || '',
    senderAddress:  '',
    originCity:     '',
    receiverName:   '', receiverPhone:   '', receiverEmail:   '',
    receiverAddress:'', destinationCity: '',
    description:    '', weight: '', quantity: '1',
    category:       'general goods', isFragile: false,
    declaredValue:  '', specialInstructions: '',
    truckTypeId:    '',
    serviceType:    'standard',
    deliveryMode:   'door',
    paymentMethod:  PAYMENTS_ENABLED ? 'online' : 'whatsapp',
    codAmount:      '',
  });

  /* ─────────────────────────────────────────────────────────
     RESTORE SESSION ON MOUNT
     If a session exists and is in a non-terminal mid-flow state
     (paying / verifying) we restore it so the user can continue
     without starting over after a page refresh.
  ───────────────────────────────────────────────────────── */
  useEffect(() => {
    const saved = loadSession();
    if (!saved) return;
    const { state: savedState } = saved;
    // Only restore non-terminal states; confirmed/booked/whatsapp sessions are stale
    if (savedState && savedState !== S.CONFIRMED && savedState !== S.BOOKED && savedState !== S.WHATSAPP) {
      setMachineState(savedState);
      if (saved.form)        setForm(saved.form);
      if (saved.pricing)     setPricing(saved.pricing);
      if (saved.orderId)     setOrderId(saved.orderId);
      if (saved.paymentInit) setPaymentInit(saved.paymentInit);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─────────────────────────────────────────────────────────
     PERSIST SESSION ON EVERY CHANGE
     Terminal states clear the session instead of saving it.
  ───────────────────────────────────────────────────────── */
  useEffect(() => {
    if (machineState === S.CONFIRMED || machineState === S.BOOKED || machineState === S.WHATSAPP) {
      clearSession();
    } else {
      saveSession({ state: machineState, form, pricing, orderId, paymentInit });
    }
  }, [machineState, form, pricing, orderId, paymentInit]);

  /* ─────────────────────────────────────────────────────────
     BOOTSTRAP — load reference data & handle rebook
  ───────────────────────────────────────────────────────── */
  useEffect(() => {
    ordersAPI.cities().then(r => setCities(r.data)).catch(() => {});
    pricingAPI.config().then(r => setPricingCfg(r.data)).catch(() => {});
    authAPI.listAddresses().then(r => setSavedAddrs(r.data || [])).catch(() => {});

    if (rebookId) {
      setLoading(true);
      ordersAPI.get(rebookId)
        .then(r => {
          const o = r.data.order;
          setForm(f => ({
            ...f,
            senderName:    o.senderName,    senderPhone:    o.senderPhone,
            senderEmail:   o.senderEmail,   senderAddress:  o.senderAddress,
            receiverName:  o.receiverName,  receiverPhone:  o.receiverPhone,
            receiverEmail: o.receiverEmail, receiverAddress: o.receiverAddress,
            originCity:    o.originCity,    destinationCity: o.destinationCity,
            description:   o.description,  weight:          String(o.weight),
            quantity:      String(o.quantity), category:    o.category,
            isFragile:     o.isFragile, declaredValue: String(o.declaredValue || ''),
            serviceType:   o.serviceType,
            truckTypeId:   o.truckTypeId?._id || o.truckTypeId || '',
          }));
        })
        .catch(() => setError('Could not load the shipment to rebook.'))
        .finally(() => setLoading(false));
    }
  }, [rebookId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ═══════════════════════════════════════════════════════
     HELPERS
  ═══════════════════════════════════════════════════════ */
  const set = key => e => {
    setError('');
    setForm(f => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  };

  const fmt = n => Number(n || 0).toLocaleString('en-NG');

  /* ── State machine transition ── */
  const transition = useCallback((next) => {
    if (!VALID_NEXT[machineState]?.includes(next)) {
      // Guard: silently reject invalid transitions — prevents step skipping
      console.warn(`[Booking] Rejected transition ${machineState} → ${next}`);
      return false;
    }
    setError('');
    setMachineState(next);
    return true;
  }, [machineState]);

  /* ── Back navigation ── */
  const goBack = () => {
    const prev = BACK_TO[machineState];
    if (prev) { setError(''); setMachineState(prev); }
  };

  /* ── Saved address picker ── */
  const handlePickAddress = (type, addr) => {
    if (type === 'origin') {
      setForm(f => ({ ...f, senderAddress: addr.address, originCity: addr.city }));
    } else {
      setForm(f => ({
        ...f,
        receiverAddress: addr.address, destinationCity: addr.city,
        receiverName:  addr.contactName  || f.receiverName,
        receiverPhone: addr.contactPhone || f.receiverPhone,
      }));
    }
  };

  /* ── Validation ── */
  const isOriginActive = form.originCity
    ? (cities.find(c => c.name === form.originCity)?.isActive !== false) : true;
  const isDestActive   = form.destinationCity
    ? (cities.find(c => c.name === form.destinationCity)?.isActive !== false) : true;
  const inactiveState  = !isOriginActive ? form.originCity : !isDestActive ? form.destinationCity : null;

  const step1Valid =
    form.senderName && form.senderPhone && form.originCity &&
    form.receiverName && form.receiverPhone && form.receiverAddress &&
    form.destinationCity && isOriginActive && isDestActive;

  const step2Valid =
    form.description && form.weight && +form.weight > 0 &&
    (pricingCfg
      ? (pricingCfg.hasDynamicPricing ? !!form.truckTypeId : true)
      : !!form.truckTypeId);

  /* ═══════════════════════════════════════════════════════
     ACTIONS
  ═══════════════════════════════════════════════════════ */

  /**
   * Step 2 → 3
   * Server calculates the price and locks the quote.
   * The returned `pricing` object is used read-only everywhere — the user
   * cannot alter any fee; the backend re-validates on order creation.
   */
  const getQuote = async () => {
    setError(''); setLoading(true);
    try {
      const r = await ordersAPI.calcPrice({
        originCity:      form.originCity,
        destinationCity: form.destinationCity,
        truckTypeId:     form.truckTypeId,
        weight:          +form.weight,
        serviceType:     form.serviceType,
        isFragile:       form.isFragile,
        declaredValue:   +form.declaredValue || 0,
        deliveryMode:    form.deliveryMode,
      });
      setPricing(r.data);
      transition(S.QUOTED);
    } catch (e) {
      setError(
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        'Failed to calculate price. Please try again.'
      );
    } finally { setLoading(false); }
  };

  /**
   * Step 3 → 4 (or → booked for cash/COD)
   *
   * Only creates the order and advances the machine state.
   * Payment initialisation is intentionally deferred to openPaystackPopup()
   * so that:
   *  • The user always sees the payment step even if Paystack is momentarily
   *    unreachable — they can retry without re-creating the order.
   *  • An order-creation failure (backend validation, pricing error, etc.)
   *    stays clearly separate from a payment failure.
   *  • The idempotency key guarantees the order is created exactly once even
   *    if the user double-clicks or the network retries.
   */
  const confirmQuote = async () => {
    if (submitting.current) return; // ref guard against double-clicks before re-render
    submitting.current = true;
    setError(''); setLoading(true);

    try {
      /*
       * If payments are disabled at the flag level, always send as whatsapp
       * regardless of what the form holds (handles stale sessionStorage restores).
       */
      const effectivePaymentMethod =
        !PAYMENTS_ENABLED && form.paymentMethod === 'online'
          ? 'whatsapp'
          : form.paymentMethod;

      /* Create the order (idempotent via idempotencyKey) */
      const orderRes = await ordersAPI.create({
        ...form,
        paymentMethod:  effectivePaymentMethod,
        weight:         +form.weight,
        quantity:       +form.quantity,
        declaredValue:  +form.declaredValue || 0,
        codAmount:      +form.codAmount || 0,
        truckTypeId:    form.truckTypeId || undefined,
        idempotencyKey: idempotencyKey.current,
      });

      const createdOrder = orderRes.data.order;
      setOrderId(createdOrder._id);

      if (effectivePaymentMethod === 'online') {
        /* Advance to the payment step — init happens when user clicks Pay */
        transition(S.PAYING);
      } else if (effectivePaymentMethod === 'whatsapp') {
        /* WhatsApp manual payment — reserve the order then open WA */
        setBookedOrder({ waybillNumber: createdOrder.waybillNumber });
        transition(S.WHATSAPP);
      } else {
        /* Cash / COD — no online payment needed */
        transition(S.BOOKED);
      }
    } catch (e) {
      setError(
        e?.response?.data?.message ||
        e?.message ||
        'Failed to book shipment. Please try again.'
      );
    } finally {
      setLoading(false);
      submitting.current = false;
    }
  };

  /**
   * Builds the wa.me redirect URL.
   *
   * When PAYMENTS_ENABLED is false (WhatsApp-only mode) the message uses the
   * full structured *BOOKING REQUEST* format so the operations team can triage
   * and confirm/adjust quickly.
   *
   * When PAYMENTS_ENABLED is true (normal mode, user chose WhatsApp method)
   * the same structured format is used for consistency — it includes all the
   * detail our team needs to verify manual payment.
   */
  const generateWhatsAppUrl = () => {
    const waNumber = import.meta.env.VITE_WHATSAPP_NUMBER || '2348000000000';
    const waybill  = bookedOrder?.waybillNumber || orderId || 'N/A';
    const amount   = pricing?.totalAmount ? `₦${fmt(pricing.totalAmount)}` : 'as quoted';

    const serviceLabel = {
      standard: 'Standard Delivery',
      express:  'Express (GoFaster)',
      sameday:  'Same Day',
    }[form.serviceType] || form.serviceType;

    const modeLabel = form.deliveryMode === 'door' ? 'Door Delivery' : 'Depot Pickup';

    const lines = [
      `🚚 *BOOKING REQUEST — JMove Logistics*`,
      ``,
      `📋 *Waybill:* ${waybill}`,
      ``,
      `📍 *Pickup Location:* ${form.originCity}${pricing?.fromZone ? ` (${pricing.fromZone})` : ''}`,
      `📍 *Delivery Location:* ${form.destinationCity}${pricing?.toZone ? ` (${pricing.toZone})` : ''}`,
      ``,
      `📦 *Package Details*`,
      `• Description:  ${form.description}`,
      `• Weight:       ${form.weight} kg${+form.quantity > 1 ? ` × ${form.quantity} items` : ''}`,
      `• Category:     ${form.category}`,
      ...(form.isFragile ? [`• Fragile:      Yes ⚠️`] : []),
      ...(+form.declaredValue > 0 ? [`• Declared Val: ₦${fmt(form.declaredValue)}`] : []),
      ``,
      `🚛 *Service Details*`,
      `• Vehicle:   ${pricing?.truckType ? `${pricing.truckType.icon} ${pricing.truckType.name}` : 'N/A'}`,
      `• Service:   ${serviceLabel}`,
      `• Mode:      ${modeLabel}`,
      ...(pricing?.distanceKm > 0 ? [`• Distance:  ${pricing.distanceKm} km`] : []),
      ...(pricing?.estimatedDelivery ? [`• ETA:       ${pricing.estimatedDelivery}`] : []),
      ``,
      `💰 *System Quote: ${amount}*`,
      ``,
      `──────────────────────`,
      `*Action Required:*`,
      `☐  Confirm Booking`,
      `☐  Request Adjustment`,
      `     Reason: _______________`,
    ];

    const msg = lines.join('\n');
    return `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
  };

  /**
   * Step 4 — Initialise payment then open Paystack Inline popup.
   *
   * Doing both in one handler means:
   *  1. We always have a fresh access_code (valid for ~10 min from Paystack).
   *  2. The backend idempotency check ensures one Payment record per order —
   *     calling initialize() multiple times is safe.
   *  3. If Paystack is unreachable the error is shown on the payment step,
   *     and the user can retry without losing their order.
   *
   * Security: the access_code is generated by our backend with a
   * server-set amount. Passing it to PaystackPop.newTransaction()
   * means the frontend has ZERO control over what gets charged.
   *
   * Fallback: if the backend returns no access_code (edge case on the
   * idempotency path) we redirect to the authorization_url instead.
   */
  const openPaystackPopup = async () => {
    if (!orderId) {
      setError('Order ID is missing. Please go back and confirm your quote again.');
      return;
    }
    setError(''); setLoading(true);

    let initData = null;
    try {
      /* Step 1 — initialise on backend to get a fresh access_code */
      const payRes = await paymentsAPI.initialize(orderId);
      initData = {
        reference:         payRes.data.reference,
        access_code:       payRes.data.access_code,
        authorization_url: payRes.data.authorization_url,
      };
      setPaymentInit(initData);
    } catch (e) {
      setLoading(false);
      setError(
        e?.response?.data?.message ||
        e?.message ||
        'Could not initialise payment. Please check your connection and try again.'
      );
      return;
    }

    /* Step 2 — open the Paystack popup with the backend-controlled access_code */
    try {
      /* Fallback: if no access_code (idempotency path returns only authorization_url) */
      if (!initData.access_code && initData.authorization_url) {
        setLoading(false);
        window.location.href = initData.authorization_url;
        return;
      }

      const PaystackPop = await loadPaystackScript();
      setLoading(false); // spinner off — popup UI takes over

      PaystackPop.newTransaction({
        access_code: initData.access_code,

        onSuccess: (tx) => {
          /*
           * Paystack popup reports success client-side.
           * We do NOT trust this alone — ask our backend to verify
           * via Paystack's server-side verification API before confirming.
           */
          setMachineState(S.VERIFYING);
          verifyPayment(tx.reference || initData.reference);
        },

        onCancel: () => {
          /* User closed without paying — stay on PAYING so they can retry. */
          setLoading(false);
          setError('Payment was cancelled. Click "Pay Now" to try again, or go back to choose a different payment method.');
        },
      });
    } catch (e) {
      setLoading(false);
      setError(
        e.message ||
        'Could not open the payment window. Please check your internet connection and try again.'
      );
    }
  };

  /**
   * Called immediately after the Paystack popup reports success.
   * Sends the reference to our backend for authoritative verification
   * via the Paystack Verify API. Only a successful backend response
   * advances the machine to CONFIRMED.
   */
  const verifyPayment = async (reference) => {
    setLoading(true);
    try {
      await paymentsAPI.verify(reference);
      setMachineState(S.CONFIRMED); // terminal — session is cleared in the effect
    } catch (e) {
      /*
       * Verification failed. This is rare (payment usually went through
       * if Paystack said success). Revert to PAYING so the user can see
       * a retry option. Include the reference so they can contact support.
       */
      const msg = e?.response?.data?.message || 'Payment verification failed.';
      setMachineState(S.PAYING);
      setError(
        `${msg} If your account was charged, please contact support with reference: ${reference}`
      );
    } finally { setLoading(false); }
  };

  /**
   * Reset everything for a new booking.
   * Generates a fresh idempotency key so the next order is never
   * treated as a retry of the previous one.
   */
  const bookAnother = () => {
    clearSession();
    idempotencyKey.current = `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    setMachineState(S.ROUTE);
    setPricing(null); setOrderId(null); setPaymentInit(null); setBookedOrder(null);
    setError('');
    setForm({
      senderName:    `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
      senderPhone:   user?.phone  || '',
      senderEmail:   user?.email  || '',
      senderAddress: '',    originCity: '',
      receiverName:  '',    receiverPhone:   '',   receiverEmail:   '',
      receiverAddress: '',  destinationCity: '',
      description:   '',    weight: '',            quantity: '1',
      category:      'general goods', isFragile: false,
      declaredValue: '',    specialInstructions: '',
      truckTypeId:   '',    serviceType: 'standard',
      deliveryMode:  'door', paymentMethod: PAYMENTS_ENABLED ? 'online' : 'whatsapp', codAmount: '',
    });
  };

  /* ═══════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════ */
  const currentVisualStep = VISUAL_STEP[machineState] || 1;
  const isTerminal = machineState === S.CONFIRMED || machineState === S.BOOKED || machineState === S.WHATSAPP;

  return (
    <div className="new-order">
      <div className="page-header">
        <div>
          <h1 className="page-title">Book a Haulage</h1>
          <p className="page-subtitle">
            {machineState === S.PAYING || machineState === S.VERIFYING
              ? 'Complete your payment to confirm your booking'
              : isTerminal
              ? 'Your booking is complete'
              : !PAYMENTS_ENABLED
              ? 'Get a quote and complete your booking via WhatsApp'
              : 'Fill in the details to get a price and book'}
          </p>
        </div>
      </div>

      {/* ── Step progress bar ── */}
      <div className="step-bar">
        {STEPS_BAR.map((s, i) => (
          <div key={s.id} className="step-item">
            <div className={`step-circle ${currentVisualStep > s.id ? 'done' : currentVisualStep === s.id ? 'active' : ''}`}>
              {currentVisualStep > s.id ? '✓' : s.id}
            </div>
            <span className={`step-label ${currentVisualStep === s.id ? 'active' : ''}`}>{s.label}</span>
            {i < STEPS_BAR.length - 1 && (
              <div className={`step-line ${currentVisualStep > s.id ? 'done' : ''}`} />
            )}
          </div>
        ))}
      </div>

      {error && <div className="order-error">⚠ {error}</div>}

      <div className="card order-card">

        {/* ════════════════════════════════════════════════
            STEP 1 — Route
        ════════════════════════════════════════════════ */}
        {machineState === S.ROUTE && (
          <div className="order-step fade-in">
            <h2 className="step-title">Sender &amp; Receiver Details</h2>
            <div className="order-fields">

              {savedAddrs.length > 0 && (
                <div className="saved-addr-quick">
                  <p className="ti-lbl" style={{ marginBottom: 8 }}>Quick Pick from Saved Addresses</p>
                  <div className="addr-pills">
                    {savedAddrs.map(a => (
                      <div key={a._id} className="addr-pill">
                        <span className="pill-label">{a.label}</span>
                        <div className="pill-actions">
                          <button onClick={() => handlePickAddress('origin', a)}>As Pickup</button>
                          <button onClick={() => handlePickAddress('dest', a)}>As Delivery</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="od-section">Sender Information</div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Sender Name *</label>
                  <input type="text" className="input" value={form.senderName} onChange={set('senderName')} placeholder="John Doe" />
                </div>
                <div className="field">
                  <label className="label">Sender Phone *</label>
                  <input type="tel" className="input" value={form.senderPhone} onChange={set('senderPhone')} placeholder="+234 801 234 5678" />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Sender Email</label>
                  <input type="email" className="input" value={form.senderEmail} onChange={set('senderEmail')} placeholder="sender@email.com" />
                </div>
                <div className="field">
                  <label className="label">Origin State *</label>
                  <select className={`input ${!isOriginActive ? 'input-error' : ''}`} value={form.originCity} onChange={set('originCity')}>
                    <option value="">Select state…</option>
                    {cities.map(c => <option key={c._id || c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label className="label">Sender Address / Pickup Address</label>
                <input type="text" className="input" value={form.senderAddress} onChange={set('senderAddress')} placeholder="Full address for pickup (optional)" />
              </div>

              <div className="od-divider" />

              <div className="od-section">Receiver Information</div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Receiver Name *</label>
                  <input type="text" className="input" value={form.receiverName} onChange={set('receiverName')} placeholder="Jane Doe" />
                </div>
                <div className="field">
                  <label className="label">Receiver Phone *</label>
                  <input type="tel" className="input" value={form.receiverPhone} onChange={set('receiverPhone')} placeholder="+234 801 234 5678" />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Receiver Email</label>
                  <input type="email" className="input" value={form.receiverEmail} onChange={set('receiverEmail')} placeholder="receiver@email.com" />
                </div>
                <div className="field">
                  <label className="label">Destination State *</label>
                  <select className={`input ${!isDestActive ? 'input-error' : ''}`} value={form.destinationCity} onChange={set('destinationCity')}>
                    <option value="">Select state…</option>
                    {cities.map(c => <option key={c._id || c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label className="label">Delivery Address *</label>
                <input type="text" className="input" value={form.receiverAddress} onChange={set('receiverAddress')} placeholder="Full delivery address" />
              </div>
            </div>

            {inactiveState && (
              <div className="order-error" style={{ marginBottom: 16, marginTop: 12 }}>
                <strong>⚠ Service currently unavailable in {inactiveState}.</strong>
              </div>
            )}

            <button
              className="btn-primary step-cta"
              onClick={() => transition(S.PACKAGE)}
              disabled={!step1Valid}
            >
              Continue to Package Details →
            </button>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            STEP 2 — Package & Service
        ════════════════════════════════════════════════ */}
        {machineState === S.PACKAGE && (
          <div className="order-step fade-in">
            <h2 className="step-title">Package &amp; Service Details</h2>
            <div className="order-fields">

              <div className="od-section">Package Information</div>
              <div className="field">
                <label className="label">Item Description *</label>
                <input type="text" className="input" value={form.description} onChange={set('description')} placeholder="e.g. Laptop computer, 2 pairs of shoes" />
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Weight (kg) *</label>
                  <input type="number" className="input" value={form.weight} onChange={set('weight')} placeholder="0.5" step="0.1" min="0.1" />
                </div>
                <div className="field">
                  <label className="label">Quantity (items)</label>
                  <input type="number" className="input" value={form.quantity} onChange={set('quantity')} placeholder="1" min="1" />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Category</label>
                  <select className="input" value={form.category} onChange={set('category')}>
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label">
                    Declared Value (₦)
                    <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 10 }}> for insurance</span>
                  </label>
                  <input type="number" className="input" value={form.declaredValue} onChange={set('declaredValue')} placeholder="e.g. 50000" min="0" />
                </div>
              </div>

              <label className="fragile-toggle">
                <input type="checkbox" checked={form.isFragile} onChange={set('isFragile')} />
                <div>
                  <p className="fragile-label">⚠ Fragile — Handle with care</p>
                  <p className="fragile-sub">Please ensure proper packaging</p>
                </div>
              </label>

              <div className="field">
                <label className="label">Special Instructions</label>
                <textarea
                  className="input" style={{ resize: 'none', height: 72 }}
                  value={form.specialInstructions} onChange={set('specialInstructions')}
                  placeholder="Any handling notes or delivery instructions…"
                />
              </div>

              {pricingCfg?.hasDynamicPricing && pricingCfg.truckTypes?.length > 0 && (
                <>
                  <div className="od-divider" />
                  <div className="od-section">Vehicle Type *</div>
                  <div className="service-type-grid">
                    {pricingCfg.truckTypes.map(tt => (
                      <label key={tt._id} className={`service-option ${form.truckTypeId === tt._id ? 'active' : ''}`}>
                        <input type="radio" name="truckTypeId" value={tt._id} checked={form.truckTypeId === tt._id} onChange={set('truckTypeId')} hidden />
                        <div className="so-header">
                          <p className="so-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 18 }}>{tt.icon}</span>
                            <span>{tt.name}</span>
                          </p>
                          <span className="so-extra">{tt.capacityTons}t Cap.</span>
                        </div>
                        {tt.description && <p className="so-desc">{tt.description}</p>}
                      </label>
                    ))}
                  </div>
                </>
              )}

              <div className="od-divider" />
              <div className="od-section">Service Type</div>
              <div className="service-type-grid">
                {SERVICE_TYPES.map(s => (
                  <label key={s.value} className={`service-option ${form.serviceType === s.value ? 'active' : ''}`}>
                    <input type="radio" name="serviceType" value={s.value} checked={form.serviceType === s.value} onChange={set('serviceType')} hidden />
                    <div className="so-header">
                      <p className="so-label">{s.label}</p>
                      {s.extra && <span className="so-extra">{s.extra}</span>}
                    </div>
                    <p className="so-desc">{s.desc}</p>
                  </label>
                ))}
              </div>

              <div className="od-divider" />
              <div className="od-section">Delivery Mode</div>
              <div className="service-type-grid">
                {DELIVERY_MODES.map(m => (
                  <label key={m.value} className={`service-option ${form.deliveryMode === m.value ? 'active' : ''}`}>
                    <input type="radio" name="deliveryMode" value={m.value} checked={form.deliveryMode === m.value} onChange={set('deliveryMode')} hidden />
                    <div className="so-header">
                      <p className="so-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{m.icon}</span> <span>{m.label}</span>
                      </p>
                      <span className="so-extra">{m.extra}</span>
                    </div>
                    <p className="so-desc">{m.desc}</p>
                  </label>
                ))}
              </div>
            </div>

            <div className="step-cta-row">
              <button className="btn-secondary" onClick={goBack}>← Back</button>
              <button className="btn-primary step-cta" onClick={getQuote} disabled={!step2Valid || loading}>
                {loading
                  ? <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} />
                  : 'Get Price Quote →'}
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            STEP 3 — Quote (read-only, backend-generated)
        ════════════════════════════════════════════════ */}
        {machineState === S.QUOTED && pricing && (
          <div className="order-step fade-in">
            <h2 className="step-title">Your Price Quote</h2>

            {/* Route summary */}
            <div className="quote-route">
              <div className="qr-city">
                <span className="qr-dot origin" />
                <div>
                  <p>{pricing.originCity}</p>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{pricing.fromZone}</span>
                </div>
              </div>
              <div className="qr-arrow">→</div>
              <div className="qr-city">
                <span className="qr-dot dest" />
                <div>
                  <p>{pricing.destinationCity}</p>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{pricing.toZone}</span>
                </div>
              </div>
              <div className="qr-badge">{pricing.deliveryType === 'intrastate' ? 'Intrastate' : 'Interstate'}</div>
              <div className="qr-eta">⏱ {pricing.estimatedDelivery}</div>
            </div>

            {pricing.truckType && (
              <div className="pricing-vehicle-tag">
                <span>{pricing.truckType.icon}</span>
                <span>{pricing.truckType.name}</span>
                <span className="pvt-cap">{pricing.truckType.capacityTons}t capacity</span>
                {pricing.distanceKm > 0 && <span className="pvt-badge">{pricing.distanceKm} km</span>}
              </div>
            )}

            {/* Price breakdown — READ ONLY. All values from backend. */}
            <div className="pricing-box">
              {[
                { label: 'Base Fee', val: pricing.baseFee },
                pricing.distanceFee > 0 && {
                  label: 'Distance Cost',
                  meta: `${pricing.billedKm} km × ₦${fmt(pricing.ratePerKm)}/km${pricing.routeFactor !== 1 ? ` × ${pricing.routeFactor}x route` : ''}`,
                  val: pricing.distanceFee,
                },
                pricing.deliveryModeFee > 0 && {
                  label: pricing.deliveryMode === 'door' ? 'Door Delivery' : 'Depot Pickup',
                  val: pricing.deliveryModeFee,
                },
                form.isFragile && {
                  label: 'Fragile Handling',
                  note: 'Price will be determined upon inspection',
                },
                pricing.serviceFee > 0     && {
                  label: form.serviceType === 'express' ? 'Express Delivery Fee' : 'Same Day Fee',
                  val: pricing.serviceFee,
                },
                pricing.insuranceFee > 0   && {
                  label: `Insurance (₦${fmt(form.declaredValue)} coverage)`,
                  val: pricing.insuranceFee,
                },
              ].filter(Boolean).map((row, i) => (
                <div key={i} className="pricing-row">
                  <span className="pr-label">
                    {row.label}
                    {row.meta && <span className="pr-meta">{row.meta}</span>}
                    {row.note && <span className="pr-meta">{row.note}</span>}
                  </span>
                  {row.note
                    ? <span className="pr-val" />
                    : <span className="pr-val">₦{fmt(row.val)}</span>}
                </div>
              ))}

              <div className="pricing-total" style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <span>Total Shipping Cost</span>
                <span className="pt-total">₦{fmt(pricing.totalAmount)}</span>
              </div>
            </div>

            <div className="pricing-route-info">
              <span>{pricing.fromZone}</span>
              <span className="pri-arrow">→</span>
              <span>{pricing.toZone}</span>
              {pricing.routeFactor !== 1 && (
                <span className="pri-factor">Route factor: ×{pricing.routeFactor}</span>
              )}
            </div>

            {/* ── Payments-disabled notice (feature flag) ── */}
            {!PAYMENTS_ENABLED && (
              <div className="payment-disabled-notice">
                <div className="pdn-icon">ℹ️</div>
                <div className="pdn-body">
                  <p className="pdn-title">Online payment is temporarily unavailable</p>
                  <p className="pdn-sub">
                    Please complete your booking via WhatsApp. Our team will confirm your shipment
                    and send payment details in the chat — usually within a few minutes.
                  </p>
                </div>
              </div>
            )}

            {/* Payment method selector — only shown when online payment is enabled */}
            {PAYMENTS_ENABLED && (
              <>
                <div className="od-section" style={{ marginTop: 20 }}>Payment Method</div>
                <div className="payment-method-grid">
                  {PAYMENT_METHODS.map(m => (
                    <label key={m.value} className={`pm-option ${form.paymentMethod === m.value ? 'active' : ''}`}>
                      <input type="radio" name="paymentMethod" value={m.value} checked={form.paymentMethod === m.value} onChange={set('paymentMethod')} hidden />
                      <div className="pm-icon">{m.icon}</div>
                      <div>
                        <p className="pm-label">{m.label}</p>
                        <p className="pm-desc">{m.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                {form.paymentMethod === 'cod' && (
                  <div className="field" style={{ marginTop: 12 }}>
                    <label className="label">Cash on Delivery Amount (₦) — amount receiver will pay</label>
                    <input type="number" className="input" value={form.codAmount} onChange={set('codAmount')} placeholder="e.g. 25000" min="0" />
                  </div>
                )}
              </>
            )}

            <div className="step-cta-row">
              <button className="btn-secondary" onClick={goBack}>← Back</button>

              {/* ── CTA adapts to feature-flag state ── */}
              {!PAYMENTS_ENABLED ? (
                <button className="btn-whatsapp-cta step-cta" onClick={confirmQuote} disabled={loading}>
                  {loading
                    ? <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} />
                    : (
                      <>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.570-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        Continue to WhatsApp →
                      </>
                    )
                  }
                </button>
              ) : (
                <button className="btn-primary step-cta" onClick={confirmQuote} disabled={loading}>
                  {loading
                    ? <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} />
                    : form.paymentMethod === 'online'
                    ? 'Confirm & Proceed to Payment →'
                    : form.paymentMethod === 'whatsapp'
                    ? '📱 Confirm & Chat on WhatsApp →'
                    : '📦 Confirm Booking'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            STEP 4a — Payment (online, Paystack inline)
        ════════════════════════════════════════════════ */}
        {(machineState === S.PAYING || machineState === S.VERIFYING) && (
          <div className="order-step fade-in">
            <h2 className="step-title">
              {machineState === S.VERIFYING ? 'Confirming Your Payment…' : 'Complete Payment'}
            </h2>

            {machineState === S.VERIFYING ? (
              /* ── Verifying: spinner while backend confirms with Paystack ── */
              <div className="payment-verifying">
                <span className="spinner payment-verify-spinner" />
                <p className="pv-title">Confirming with Paystack…</p>
                <p className="pv-sub">Please don't close this page. This takes just a moment.</p>
              </div>

            ) : (
              <>
                {/* ── Amount banner ── */}
                <div className="pf-amount-banner">
                  <div className="pf-ab-left">
                    <span className="pf-ab-label">Amount Due</span>
                    <span className="pf-ab-amount">₦{fmt(pricing?.totalAmount)}</span>
                  </div>
                  <div className="pf-ab-right">
                    <span className="pf-ab-route">{form.originCity} → {form.destinationCity}</span>
                    <span className="pf-ab-desc">{form.description} · {form.weight} kg</span>
                  </div>
                </div>

                {/* ── Payment method tabs ── */}
                <div className="pf-section-label">How would you like to pay?</div>
                <div className="pf-tabs">
                  <button
                    className={`pf-tab ${payTab === 'card' ? 'active' : ''}`}
                    onClick={() => setPayTab('card')}
                    type="button"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                      <path d="M2 10h20" stroke="currentColor" strokeWidth="1.8"/>
                      <rect x="5" y="14" width="5" height="2" rx="1" fill="currentColor"/>
                    </svg>
                    Card
                  </button>
                  <button
                    className={`pf-tab ${payTab === 'transfer' ? 'active' : ''}`}
                    onClick={() => setPayTab('transfer')}
                    type="button"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M3 9l9-6 9 6v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                      <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                    </svg>
                    Bank Transfer
                  </button>
                  <button
                    className={`pf-tab ${payTab === 'ussd' ? 'active' : ''}`}
                    onClick={() => setPayTab('ussd')}
                    type="button"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <rect x="5" y="2" width="14" height="20" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                      <circle cx="12" cy="17" r="1" fill="currentColor"/>
                      <path d="M9 6h6M9 9h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    USSD
                  </button>
                </div>

                {/* ── Card tab ── */}
                {payTab === 'card' && (
                  <div className="pf-tab-content fade-in">
                    {/* Visual card */}
                    <div className="pf-card-visual">
                      <div className="pf-cv-top">
                        <div className="pf-cv-chip">
                          <div className="pf-cv-chip-line" />
                          <div className="pf-cv-chip-line" />
                          <div className="pf-cv-chip-line" />
                        </div>
                        <div className="pf-cv-brands">
                          <span className="pf-cv-brand visa">VISA</span>
                          <span className="pf-cv-brand mc">MC</span>
                          <span className="pf-cv-brand verve">Verve</span>
                        </div>
                      </div>
                      <div className="pf-cv-number">•••• •••• •••• ••••</div>
                      <div className="pf-cv-bottom">
                        <div>
                          <p className="pf-cv-sublabel">CARDHOLDER NAME</p>
                          <p className="pf-cv-subval">YOUR NAME</p>
                        </div>
                        <div>
                          <p className="pf-cv-sublabel">EXPIRES</p>
                          <p className="pf-cv-subval">MM / YY</p>
                        </div>
                        <div>
                          <p className="pf-cv-sublabel">CVV</p>
                          <p className="pf-cv-subval">•••</p>
                        </div>
                      </div>
                    </div>

                    {/* Mock fields — clearly labelled as Paystack-handled */}
                    <div className="pf-mock-fields">
                      <div className="pf-mock-field">
                        <label className="pf-mock-label">Card Number</label>
                        <div className="pf-mock-input">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <rect x="2" y="5" width="20" height="14" rx="2" stroke="var(--text-faint)" strokeWidth="1.5"/>
                            <path d="M2 10h20" stroke="var(--text-faint)" strokeWidth="1.5"/>
                          </svg>
                          <span>Entered securely via Paystack</span>
                          <span className="pf-mock-lock">🔒</span>
                        </div>
                      </div>
                      <div className="pf-mock-row">
                        <div className="pf-mock-field">
                          <label className="pf-mock-label">Expiry Date</label>
                          <div className="pf-mock-input">
                            <span>MM / YY</span>
                            <span className="pf-mock-lock">🔒</span>
                          </div>
                        </div>
                        <div className="pf-mock-field">
                          <label className="pf-mock-label">CVV</label>
                          <div className="pf-mock-input">
                            <span>•••</span>
                            <span className="pf-mock-lock">🔒</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pf-method-note">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <rect x="1.5" y="5.5" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.4"/>
                        <path d="M4 5.5V4a2.5 2.5 0 015 0v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                      Your card details are entered directly on Paystack's encrypted, PCI-compliant form — JMove Logistics never sees your card number or CVV.
                    </div>
                  </div>
                )}

                {/* ── Bank Transfer tab ── */}
                {payTab === 'transfer' && (
                  <div className="pf-tab-content fade-in">
                    <div className="pf-transfer-steps">
                      {[
                        { n: '1', title: 'Click "Open Payment Form"', desc: 'A secure Paystack window will open on this page.' },
                        { n: '2', title: 'Select Bank Transfer',      desc: 'Choose your bank from the list in the payment window.' },
                        { n: '3', title: 'Get your account number',   desc: `Paystack generates a unique account number for this ₦${fmt(pricing?.totalAmount)} transaction.` },
                        { n: '4', title: 'Make the transfer',         desc: 'Transfer the exact amount from your mobile or internet banking app.' },
                        { n: '5', title: 'Automatic confirmation',    desc: 'Your booking is confirmed the moment Paystack detects the transfer.' },
                      ].map(s => (
                        <div key={s.n} className="pf-ts-row">
                          <div className="pf-ts-num">{s.n}</div>
                          <div>
                            <p className="pf-ts-title">{s.title}</p>
                            <p className="pf-ts-desc">{s.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pf-bank-logos">
                      {['GTBank', 'Access', 'Zenith', 'First Bank', 'UBA', 'Kuda', 'OPay', 'Moniepoint'].map(b => (
                        <span key={b} className="pf-bank-pill">{b}</span>
                      ))}
                      <span className="pf-bank-pill pf-bank-more">+ all Nigerian banks</span>
                    </div>

                    <div className="pf-method-note">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <rect x="1.5" y="5.5" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.4"/>
                        <path d="M4 5.5V4a2.5 2.5 0 015 0v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                      Transfer confirmation is usually instant. The account number is valid for this transaction only.
                    </div>
                  </div>
                )}

                {/* ── USSD tab ── */}
                {payTab === 'ussd' && (
                  <div className="pf-tab-content fade-in">
                    <p className="pf-ussd-intro">
                      Dial your bank's USSD code — no internet required. The code for this transaction will be shown in the payment window.
                    </p>
                    <div className="pf-ussd-grid">
                      {[
                        { bank: 'GTBank',      code: '*737#'  },
                        { bank: 'Access Bank', code: '*901#'  },
                        { bank: 'Zenith Bank', code: '*966#'  },
                        { bank: 'First Bank',  code: '*894#'  },
                        { bank: 'UBA',         code: '*919#'  },
                        { bank: 'Fidelity',    code: '*770#'  },
                        { bank: 'Sterling',    code: '*822#'  },
                        { bank: 'Ecobank',     code: '*326#'  },
                      ].map(u => (
                        <div key={u.bank} className="pf-ussd-item">
                          <span className="pf-ussd-bank">{u.bank}</span>
                          <span className="pf-ussd-code">{u.code}</span>
                        </div>
                      ))}
                    </div>

                    <div className="pf-method-note">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <rect x="1.5" y="5.5" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.4"/>
                        <path d="M4 5.5V4a2.5 2.5 0 015 0v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                      Click "Open Payment Form" below, then select USSD and your bank. You'll see the exact dial code on screen.
                    </div>
                  </div>
                )}

                {/* ── Payment reference (after first attempt) ── */}
                {paymentInit?.reference && (
                  <div className="payment-ref-tag">
                    Reference: <strong>{paymentInit.reference}</strong>
                  </div>
                )}

                {/* ── Main CTA — initialises payment AND opens Paystack popup ── */}
                <button
                  className="btn-paystack"
                  onClick={openPaystackPopup}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} />
                      {paymentInit ? 'Opening payment form…' : 'Preparing…'}
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <rect x="2" y="5" width="20" height="14" rx="2.5" stroke="white" strokeWidth="1.8"/>
                        <path d="M2 10h20" stroke="white" strokeWidth="1.8"/>
                        <rect x="5" y="14" width="5" height="2" rx="1" fill="white"/>
                        <rect x="12" y="14" width="3" height="2" rx="1" fill="white"/>
                      </svg>
                      Open Payment Form — ₦{fmt(pricing?.totalAmount)}
                    </>
                  )}
                </button>

                <div className="paystack-badges">
                  <span>🔒 256-bit SSL</span>
                  <span>·</span>
                  <span>🛡 PCI DSS</span>
                  <span>·</span>
                  <span>⚡ Instant</span>
                  <span>·</span>
                  <span>Secured by Paystack</span>
                </div>

                <div className="step-cta-row" style={{ marginTop: 8 }}>
                  <button className="btn-secondary" onClick={goBack} disabled={loading}>
                    ← Change Payment Method
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════
            STEP 4b — Confirmed (payment verified)
        ════════════════════════════════════════════════ */}
        {machineState === S.CONFIRMED && (
          <div className="order-step order-success fade-in">
            <div className="success-icon">✅</div>
            <h2 className="step-title" style={{ textAlign: 'center' }}>Payment Confirmed!</h2>
            <p className="success-sub">
              Your shipment is booked and your payment has been verified by Paystack.
              A driver will be assigned shortly.
            </p>
            {pricing && (
              <div className="success-amount">
                <p className="sa-val">₦{fmt(pricing.totalAmount)}</p>
                <p className="sa-lbl">Paid via Paystack</p>
              </div>
            )}
            {paymentInit?.reference && (
              <p className="success-ref">
                Reference: <strong>{paymentInit.reference}</strong>
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              <button className="btn-primary step-cta" onClick={() => navigate('/dashboard/orders')}>
                View My Shipments
              </button>
              <button
                className="btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={bookAnother}
              >
                Book Another Shipment
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            STEP 4c — Booked (cash / COD)
        ════════════════════════════════════════════════ */}
        {machineState === S.BOOKED && (
          <div className="order-step order-success fade-in">
            <div className="success-icon">✅</div>
            <h2 className="step-title" style={{ textAlign: 'center' }}>Shipment Booked!</h2>
            <p className="success-sub">
              {form.paymentMethod === 'cash'
                ? 'Please visit any JMove Logistics office to drop off your package and pay.'
                : 'Your shipment is booked. The receiver will pay upon delivery.'}
            </p>
            {pricing && (
              <div className="success-amount">
                <p className="sa-val">₦{fmt(pricing.totalAmount)}</p>
                <p className="sa-lbl">
                  {form.paymentMethod === 'cod' ? 'Payable on delivery' : 'Payable at centre'}
                </p>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              <button className="btn-primary step-cta" onClick={() => navigate('/dashboard/orders')}>
                View My Shipments
              </button>
              <button
                className="btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={bookAnother}
              >
                Book Another Shipment
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            STEP 4d — WhatsApp (manual payment)
        ════════════════════════════════════════════════ */}
        {machineState === S.WHATSAPP && (
          <div className="order-step fade-in">
            <div className="wa-header">
              <div className="wa-icon">📱</div>
              <h2 className="step-title" style={{ textAlign: 'center', marginBottom: 4 }}>
                Shipment Reserved!
              </h2>
              <p className="success-sub" style={{ marginBottom: 0 }}>
                Your booking request has been submitted. Please complete payment via WhatsApp and await confirmation from our team.
              </p>
            </div>

            {bookedOrder?.waybillNumber && (
              <div className="wa-waybill-tag">
                Waybill: <strong>{bookedOrder.waybillNumber}</strong>
              </div>
            )}

            {pricing && (
              <div className="success-amount">
                <p className="sa-val">₦{fmt(pricing.totalAmount)}</p>
                <p className="sa-lbl">Amount to pay</p>
              </div>
            )}

            {/* Pre-filled message preview */}
            <div className="wa-message-preview">
              <div className="wa-mp-header">
                <span className="wa-mp-icon">💬</span>
                <span className="wa-mp-title">Pre-filled WhatsApp Message</span>
              </div>
              <div className="wa-mp-body">
                <p>Hello JMove Logistics 👋</p>
                <p>I just booked a shipment and would like to make payment via WhatsApp.</p>
                <p>
                  📦 <strong>Waybill:</strong> {bookedOrder?.waybillNumber || orderId || 'N/A'}<br />
                  🚚 <strong>Route:</strong> {form.originCity} → {form.destinationCity}<br />
                  📦 <strong>Package:</strong> {form.description} ({form.weight} kg)<br />
                  💰 <strong>Amount:</strong> {pricing?.totalAmount ? `₦${fmt(pricing.totalAmount)}` : 'as quoted'}
                </p>
                <p>Please confirm receipt of payment once sent. Thank you!</p>
              </div>
            </div>

            <div className="wa-steps">
              {[
                { n: '1', t: 'Tap the button below',           d: 'WhatsApp will open with your booking details pre-filled.' },
                { n: '2', t: 'Make your payment',              d: 'Transfer the quoted amount to our account number.' },
                { n: '3', t: 'Send your payment proof',        d: 'Reply in the chat with your bank receipt or screenshot.' },
                { n: '4', t: 'Await confirmation (fast ⚡)',   d: 'Our team verifies and sends you a booking confirmation shortly.' },
              ].map(s => (
                <div key={s.n} className="wa-step-row">
                  <div className="wa-step-num">{s.n}</div>
                  <div>
                    <p className="wa-step-title">{s.t}</p>
                    <p className="wa-step-desc">{s.d}</p>
                  </div>
                </div>
              ))}
            </div>

            <a
              href={generateWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-whatsapp"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.570-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Chat on WhatsApp — ₦{fmt(pricing?.totalAmount)}
            </a>

            <p className="wa-disclaimer">
              Your shipment is reserved for <strong>24 hours</strong>. It will be cancelled automatically if payment is not confirmed within this window.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginTop: 8 }}>
              <button className="btn-primary step-cta" onClick={() => navigate('/dashboard/orders')}>
                View My Shipments
              </button>
              <button
                className="btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={bookAnother}
              >
                Book Another Shipment
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
