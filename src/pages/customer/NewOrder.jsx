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
 *                                   ↘  booked  (cash / COD path)
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
};

// Which visual step number each machine state maps to
const VISUAL_STEP = { route: 1, package: 2, quoted: 3, paying: 4, verifying: 4, confirmed: 4, booked: 4 };

// Forward transitions — only these are allowed
const VALID_NEXT = {
  [S.ROUTE]:     [S.PACKAGE],
  [S.PACKAGE]:   [S.QUOTED],
  [S.QUOTED]:    [S.PAYING, S.BOOKED],
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
  { value: 'online', label: 'Pay Online',       desc: 'Card, bank transfer or USSD via Paystack', icon: '💳' },
  { value: 'cash',   label: 'Pay at Centre',    desc: 'Pay cash when you drop off at our office', icon: '🏢' },
  { value: 'cod',    label: 'Cash on Delivery', desc: 'Receiver pays on delivery (e-commerce)',   icon: '📦' },
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
    paymentMethod:  'online',
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
    // Only restore non-terminal states; confirmed/booked sessions are stale
    if (savedState && savedState !== S.CONFIRMED && savedState !== S.BOOKED) {
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
    if (machineState === S.CONFIRMED || machineState === S.BOOKED) {
      clearSession();
    } else {
      saveSession({ state: machineState, form, pricing, orderId, paymentInit });
    }
  }, [machineState, form, pricing, orderId, paymentInit]);

  /* ─────────────────────────────────────────────────────────
     BOOTSTRAP — load reference data & handle rebook
  ───────────────────────────────────────────────────────── */
  useEffect(() => {
    ordersAPI.cities().then(r => setCities(r.data)).catch(console.error);
    pricingAPI.config().then(r => setPricingCfg(r.data)).catch(console.error);
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
      /* Create the order (idempotent via idempotencyKey) */
      const orderRes = await ordersAPI.create({
        ...form,
        weight:         +form.weight,
        quantity:       +form.quantity,
        declaredValue:  +form.declaredValue || 0,
        codAmount:      +form.codAmount || 0,
        truckTypeId:    form.truckTypeId || undefined,
        idempotencyKey: idempotencyKey.current,
      });

      setOrderId(orderRes.data.order._id);

      if (form.paymentMethod === 'online') {
        /* Advance to the payment step — init happens when user clicks Pay */
        transition(S.PAYING);
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
    setPricing(null); setOrderId(null); setPaymentInit(null);
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
      deliveryMode:  'door', paymentMethod: 'online', codAmount: '',
    });
  };

  /* ═══════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════ */
  const currentVisualStep = VISUAL_STEP[machineState] || 1;
  const isTerminal = machineState === S.CONFIRMED || machineState === S.BOOKED;

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
                pricing.weightFee > 0      && { label: `Weight Fee (${form.weight} kg)`, val: pricing.weightFee },
                pricing.deliveryModeFee > 0 && {
                  label: pricing.deliveryMode === 'door' ? 'Door Delivery' : 'Depot Pickup',
                  val: pricing.deliveryModeFee,
                },
                pricing.fragileFee > 0     && { label: 'Fragile Handling',  val: pricing.fragileFee },
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
                  </span>
                  <span className="pr-val">₦{fmt(row.val)}</span>
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

            {/* Payment method selector */}
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

            <div className="step-cta-row">
              <button className="btn-secondary" onClick={goBack}>← Back</button>
              <button className="btn-primary step-cta" onClick={confirmQuote} disabled={loading}>
                {loading
                  ? <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} />
                  : form.paymentMethod === 'online'
                  ? 'Confirm & Proceed to Payment →'
                  : '📦 Confirm Booking'}
              </button>
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
              /* ── Verifying state: spinner while we call our backend ── */
              <div className="payment-verifying">
                <span className="spinner payment-verify-spinner" />
                <p className="pv-title">Confirming with Paystack…</p>
                <p className="pv-sub">Please don't close this page. This takes just a moment.</p>
              </div>

            ) : (
              /* ── Paying state: show summary + "Pay Now" button ── */
              <>
                {/* Order summary card */}
                <div className="payment-order-summary">
                  <div className="pos-header">Order Summary</div>

                  <div className="pos-route">
                    <div className="pos-city">
                      <span className="pos-dot origin" />
                      <span>{form.originCity}</span>
                    </div>
                    <span className="pos-arrow">→</span>
                    <div className="pos-city">
                      <span className="pos-dot dest" />
                      <span>{form.destinationCity}</span>
                    </div>
                    <span className="pos-badge">
                      {pricing?.deliveryType === 'intrastate' ? 'Intrastate' : 'Interstate'}
                    </span>
                  </div>

                  <div className="pos-meta">
                    <span>{form.description}</span>
                    <span className="pos-meta-sep">·</span>
                    <span>{form.weight} kg</span>
                    {pricing?.truckType && (
                      <>
                        <span className="pos-meta-sep">·</span>
                        <span>{pricing.truckType.icon} {pricing.truckType.name}</span>
                      </>
                    )}
                  </div>

                  <div className="pos-divider" />

                  <div className="pos-amount-row">
                    <span className="pos-amount-label">Amount Due</span>
                    <span className="pos-amount-value">₦{fmt(pricing?.totalAmount)}</span>
                  </div>
                </div>

                {/* Security notice */}
                <div className="payment-secure-notice">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <rect x="1.5" y="5.5" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M4 5.5V4a2.5 2.5 0 015 0v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  Payments are processed securely by Paystack. JMove Logistics never sees or stores your card details.
                </div>

                {/* Payment reference — only shown after first init attempt */}
                {paymentInit?.reference && (
                  <div className="payment-ref-tag">
                    Reference: <strong>{paymentInit.reference}</strong>
                  </div>
                )}

                {/* Paystack CTA — clicking this initialises payment AND opens popup */}
                <button
                  className="btn-paystack"
                  onClick={openPaystackPopup}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} />
                      {paymentInit ? 'Opening payment window…' : 'Preparing payment…'}
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <rect x="2" y="5" width="20" height="14" rx="2.5" stroke="white" strokeWidth="1.8" />
                        <path d="M2 10h20" stroke="white" strokeWidth="1.8" />
                        <rect x="5" y="14" width="5" height="2" rx="1" fill="white" />
                        <rect x="12" y="14" width="3" height="2" rx="1" fill="white" />
                      </svg>
                      Pay ₦{fmt(pricing?.totalAmount)} with Paystack
                    </>
                  )}
                </button>

                <div className="paystack-badges">
                  <span>🔒 SSL Encrypted</span>
                  <span>·</span>
                  <span>🛡 PCI DSS Compliant</span>
                  <span>·</span>
                  <span>⚡ Instant Confirmation</span>
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

      </div>
    </div>
  );
}
