import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ordersAPI, pricingAPI, corporateAPI } from '../../api/client.js';
import './AdminCreateOrder.css';

const SOURCE_OPTIONS = [
  { value: 'admin_walkin',    label: 'Walk-in' },
  { value: 'admin_whatsapp',  label: 'WhatsApp' },
  { value: 'admin_instagram', label: 'Instagram' },
  { value: 'admin_facebook',  label: 'Facebook' },
  { value: 'admin_phone',     label: 'Phone Call' },
  { value: 'admin_other',     label: 'Other' },
];

const PAYMENT_OPTIONS = [
  { value: 'pending',           label: 'Unpaid / Pending Payment' },
  { value: 'paid_offline',      label: 'Paid Offline' },
  { value: 'whatsapp_contact',  label: 'Pay via WhatsApp / Contact Rep' },
  { value: 'pay_later',         label: 'Payment To Be Completed Later' },
];

const initForm = {
  orderType: 'individual',
  corporateAccountId: '',

  customerName: '',
  customerPhone: '',
  customerEmail: '',
  createCustomerRecord: true,
  sourceChannel: 'admin_walkin',

  originCity: '',
  destinationCity: '',
  truckTypeId: '',
  pickupAddress: '',
  pickupContactName: '',
  pickupContactPhone: '',
  deliveryAddress: '',
  receiverContactName: '',
  receiverContactPhone: '',
  packageDescription: '',
  quantity: 1,
  weight: 1,
  isFragile: false,
  insuranceEnabled: false,
  declaredValue: 0,
  specialInstructions: '',
  adminNotes: '',

  paymentOutcome: 'pending',
  paymentNote: '',
  customPrice: '',
};

const fmtCurrency = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`;

// ── Corporate account search dropdown ────────────────────
function CorporateSearch({ onSelect }) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [showNew, setShowNew]   = useState(false);
  const [newForm, setNewForm]   = useState({ companyName:'', contactPersonName:'', contactPhone:'', contactEmail:'', address:'', industry:'' });
  const [saving, setSaving]     = useState(false);
  const [saveErr, setSaveErr]   = useState('');
  const debounce = useRef(null);

  const search = (q) => {
    setQuery(q);
    clearTimeout(debounce.current);
    if (!q.trim()) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await corporateAPI.list({ search: q, limit: 10 });
        setResults(r.data.accounts || []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
  };

  const handleNewChange = (k) => (e) => setNewForm(f => ({ ...f, [k]: e.target.value }));

  const saveNew = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (saving) return;
    if (!newForm.companyName.trim() || !newForm.contactPersonName.trim() || !newForm.contactPhone.trim()) {
      setSaveErr('Company Name, Contact Person, and Contact Phone are required.');
      return;
    }
    setSaveErr('');
    setSaving(true);
    try {
      const r = await corporateAPI.create(newForm);
      const account = r.data || r;
      onSelect(account);
      setShowNew(false);
      setNewForm({ companyName:'', contactPersonName:'', contactPhone:'', contactEmail:'', address:'', industry:'' });
    } catch (err) {
      const d = err?.response?.data;
      setSaveErr(d?.errors?.length ? d.errors.map(e => `${e.field}: ${e.message}`).join(' · ') : d?.message || 'Failed to create corporate account');
    } finally { setSaving(false); }
  };

  return (
    <div className="corp-search-wrap">
      <div className="corp-search-row">
        <div className="corp-search-field">
          <label className="label">Search Corporate Account</label>
          <input
            className="input"
            placeholder="Type company name or phone..."
            value={query}
            onChange={e => search(e.target.value)}
          />
          {loading && <span className="corp-search-loading">Searching...</span>}
          {results.length > 0 && (
            <div className="corp-results">
              {results.map(a => (
                <button key={a._id} type="button" className="corp-result-item"
                  onClick={() => { onSelect(a); setResults([]); setQuery(''); }}>
                  <strong>{a.companyName}</strong>
                  <span>{a.contactPersonName} · {a.contactPhone}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="btn-secondary corp-new-btn" onClick={() => setShowNew(v => !v)}>
          {showNew ? 'Cancel' : '+ New Corporate Account'}
        </button>
      </div>

      {showNew && (
        <div className="corp-new-form">
          <p className="aco-section" style={{ marginBottom: 10 }}>Register Corporate Account</p>
          {saveErr && <div className="notice-error" style={{ marginBottom: 10 }}>⚠ {saveErr}</div>}
          <div className="aco-field-row">
            <div>
              <label className="label">Company Name *</label>
              <input className="input" required value={newForm.companyName} onChange={handleNewChange('companyName')} />
            </div>
            <div>
              <label className="label">Contact Person *</label>
              <input className="input" required value={newForm.contactPersonName} onChange={handleNewChange('contactPersonName')} />
            </div>
          </div>
          <div className="aco-field-row">
            <div>
              <label className="label">Contact Phone *</label>
              <input className="input" required value={newForm.contactPhone} onChange={handleNewChange('contactPhone')} />
            </div>
            <div>
              <label className="label">Contact Email</label>
              <input className="input" type="email" value={newForm.contactEmail} onChange={handleNewChange('contactEmail')} />
            </div>
          </div>
          <div className="aco-field-row">
            <div>
              <label className="label">Company Address</label>
              <input className="input" value={newForm.address} onChange={handleNewChange('address')} />
            </div>
            <div>
              <label className="label">Industry</label>
              <input className="input" placeholder="e.g. Manufacturing, Retail..." value={newForm.industry} onChange={handleNewChange('industry')} />
            </div>
          </div>
          <button type="button" className="btn-primary" style={{ marginTop: 8 }} disabled={saving} onClick={saveNew}>
            {saving ? <span className="spinner spinner-sm" /> : 'Save Corporate Account'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────
export default function AdminCreateOrder() {
  const navigate = useNavigate();
  const [form, setForm]             = useState(initForm);
  const [selectedCorp, setSelectedCorp] = useState(null);
  const [cities, setCities]         = useState([]);
  const [truckTypes, setTruckTypes] = useState([]);
  const [pricing, setPricing]       = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');
  const [sameAsSender, setSameAsSender] = useState(false);

  useEffect(() => {
    const loadMeta = async () => {
      setLoadingMeta(true);
      try {
        const [cityRes, truckRes] = await Promise.all([ordersAPI.cities(), pricingAPI.truckTypes()]);
        setCities(cityRes.data || []);
        setTruckTypes((truckRes.data || []).filter(t => t.isActive !== false));
      } catch (e) {
        setError(e?.response?.data?.message || 'Failed to load form data');
      } finally { setLoadingMeta(false); }
    };
    loadMeta();
  }, []);

  const isCorporate = form.orderType === 'corporate';

  const set = (key) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(p => ({ ...p, [key]: val }));
    if (pricing && key !== 'customPrice') setPricing(null);
  };

  const setVal = (key, val) => {
    setForm(p => ({ ...p, [key]: val }));
    if (pricing) setPricing(null);
  };

  const handleOrderTypeToggle = (type) => {
    setForm({ ...initForm, orderType: type });
    setSelectedCorp(null);
    setSameAsSender(false);
    setPricing(null);
  };

  const handleCorporateSelect = (corp) => {
    setSelectedCorp(corp);
    setForm(p => ({
      ...p,
      corporateAccountId:   corp._id,
      customerName:         corp.companyName,
      customerPhone:        corp.contactPhone,
      customerEmail:        corp.contactEmail || '',
      createCustomerRecord: false,
      pickupContactName:    corp.contactPersonName,
      pickupContactPhone:   corp.contactPhone,
      pickupAddress:        corp.address || '',
    }));
    setPricing(null);
  };

  const handleSameAsSender = (checked) => {
    setSameAsSender(checked);
    if (checked) {
      setForm(p => ({
        ...p,
        receiverContactName:  p.pickupContactName || p.customerName,
        receiverContactPhone: p.pickupContactPhone || p.customerPhone,
      }));
    }
  };

  const canCalculate = useMemo(() => (
    form.originCity && form.destinationCity && form.truckTypeId
  ), [form.originCity, form.destinationCity, form.truckTypeId]);

  const calculateEstimate = async () => {
    if (!canCalculate) return;
    setCalculating(true);
    setError('');
    try {
      const r = await ordersAPI.calcPrice({
        originCity:      form.originCity,
        destinationCity: form.destinationCity,
        truckTypeId:     form.truckTypeId,
        isFragile:       form.isFragile,
        declaredValue:   form.insuranceEnabled ? Number(form.declaredValue || 0) : 0,
        weight:          Number(form.weight || 1),
      });
      setPricing(r.data);
      setForm(p => ({ ...p, customPrice: String(r.data.totalAmount) }));
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not calculate estimated shipping cost');
    } finally { setCalculating(false); }
  };

  const submitOrder = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!pricing) { setError('Please calculate the estimated shipping cost first.'); return; }
    if (isCorporate && !form.corporateAccountId) { setError('Please select a corporate account.'); return; }

    setSubmitting(true);
    try {
      const payload = {
        orderType: form.orderType,
        ...(isCorporate ? { corporateAccountId: form.corporateAccountId } : {}),
        customer: {
          fullName:             form.customerName,
          phone:                form.customerPhone,
          email:                form.customerEmail,
          createCustomerRecord: !!form.createCustomerRecord,
        },
        sourceChannel: form.sourceChannel,
        shipment: {
          pickupAddress:        form.pickupAddress,
          deliveryAddress:      form.deliveryAddress,
          pickupContactName:    form.pickupContactName,
          pickupContactPhone:   form.pickupContactPhone,
          receiverContactName:  form.receiverContactName,
          receiverContactPhone: form.receiverContactPhone,
          packageDescription:   form.packageDescription,
          quantity:             Number(form.quantity || 1),
          weight:               Number(form.weight || 1),
          isFragile:            !!form.isFragile,
          insuranceEnabled:     !!form.insuranceEnabled,
          declaredValue:        form.insuranceEnabled ? Number(form.declaredValue || 0) : 0,
          truckTypeId:          form.truckTypeId,
          originCity:           form.originCity,
          destinationCity:      form.destinationCity,
          specialInstructions:  form.specialInstructions,
        },
        payment: {
          outcome: form.paymentOutcome,
          note:    form.paymentNote,
          ...(form.customPrice !== '' && Number(form.customPrice) !== pricing?.totalAmount
            ? { customPrice: Number(form.customPrice) }
            : {}),
        },
        adminNotes: form.adminNotes,
      };

      const r = await ordersAPI.createManual(payload);
      const orderId = r?.data?.order?._id;
      setSuccess('Order created successfully. Redirecting...');
      setTimeout(() => orderId ? navigate(`/admin/orders/${orderId}`) : navigate('/admin/orders'), 600);
    } catch (e2) {
      const data = e2?.response?.data;
      if (data?.errors?.length) {
        setError(data.errors.map(e => `${e.field}: ${e.message}`).join(' · '));
      } else {
        setError(data?.message || 'Failed to create order');
      }
    } finally { setSubmitting(false); }
  };

  return (
    <div className="admin-create-order">
      <div className="page-header">
        <div>
          <h1 className="page-title">Create Order</h1>
          <p className="page-subtitle">Create operational orders for walk-ins and offline channels</p>
        </div>
        <Link to="/admin/orders" className="btn-secondary">Back to Orders</Link>
      </div>

      {error   && <div className="notice-error">⚠ {error}</div>}
      {success && <div className="notice-success">✓ {success}</div>}

      {loadingMeta ? (
        <div className="card aco-loading">
          {Array(6).fill(0).map((_, i) => <div key={i} className="shimmer" style={{ height: 44, borderRadius: 8 }} />)}
        </div>
      ) : (
        <form className="card aco-order-card" onSubmit={submitOrder}>
          <div className="aco-order-step">
            <h2 className="aco-step-title">Manual Order Details</h2>

            <div className="aco-fields">

              {/* ── Order Type ──────────────────────────────── */}
              <div className="aco-type-toggle">
                <button type="button"
                  className={`aco-type-btn ${!isCorporate ? 'active' : ''}`}
                  onClick={() => handleOrderTypeToggle('individual')}>
                  Individual Customer
                </button>
                <button type="button"
                  className={`aco-type-btn ${isCorporate ? 'active' : ''}`}
                  onClick={() => handleOrderTypeToggle('corporate')}>
                  Corporate Account
                </button>
              </div>

              {/* ── Corporate Account Selector ───────────────── */}
              {isCorporate && (
                <>
                  <p className="aco-section">Corporate Account</p>
                  {selectedCorp ? (
                    <div className="corp-selected-card">
                      <div className="corp-selected-info">
                        <strong>{selectedCorp.companyName}</strong>
                        <span>{selectedCorp.contactPersonName} · {selectedCorp.contactPhone}</span>
                        {selectedCorp.address && <span>{selectedCorp.address}</span>}
                      </div>
                      <button type="button" className="btn-ghost" onClick={() => {
                        setSelectedCorp(null);
                        setForm(p => ({ ...p, corporateAccountId: '', customerName: '', customerPhone: '', pickupContactName: '', pickupContactPhone: '', pickupAddress: '' }));
                      }}>Change</button>
                    </div>
                  ) : (
                    <CorporateSearch onSelect={handleCorporateSelect} />
                  )}
                  <div className="aco-divider" />
                </>
              )}

              {/* ── Individual Customer Details ──────────────── */}
              {!isCorporate && (
                <>
                  <p className="aco-section">Customer Details</p>
                  <div className="aco-field-row">
                    <div>
                      <label className="label">Full Name *</label>
                      <input className="input" required value={form.customerName} onChange={set('customerName')} />
                    </div>
                    <div>
                      <label className="label">Phone Number *</label>
                      <input className="input" required value={form.customerPhone} onChange={set('customerPhone')} />
                    </div>
                  </div>
                  <div>
                    <label className="label">Email (Optional)</label>
                    <input className="input" type="email" value={form.customerEmail} onChange={set('customerEmail')} />
                  </div>
                  <label className="aco-toggle">
                    <input type="checkbox" checked={form.createCustomerRecord} onChange={set('createCustomerRecord')} />
                    <div>
                      <p className="aco-toggle-label">Create/Link Customer Record</p>
                      <p className="aco-toggle-sub">Create a customer profile in the background if no match exists.</p>
                    </div>
                  </label>
                  <div className="aco-divider" />
                </>
              )}

              {/* ── Source & Payment ─────────────────────────── */}
              <p className="aco-section">Source & Payment</p>
              <div className="aco-field-row">
                <div>
                  <label className="label">Source Channel</label>
                  <select className="input" value={form.sourceChannel} onChange={set('sourceChannel')}>
                    {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Payment Outcome</label>
                  <select className="input" value={form.paymentOutcome} onChange={set('paymentOutcome')}>
                    {PAYMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Payment Note (Optional)</label>
                <input className="input" value={form.paymentNote} onChange={set('paymentNote')} placeholder="Reference, teller info, follow-up note..." />
              </div>

              <div className="aco-divider" />

              {/* ── Shipment Details ─────────────────────────── */}
              <p className="aco-section">Shipment Details</p>
              <div className="aco-field-row">
                <div>
                  <label className="label">Origin City *</label>
                  <select className="input" required value={form.originCity} onChange={set('originCity')}>
                    <option value="">Select state</option>
                    {cities.map(c => <option key={c._id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Destination City *</label>
                  <select className="input" required value={form.destinationCity} onChange={set('destinationCity')}>
                    <option value="">Select state</option>
                    {cities.map(c => <option key={c._id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Pickup / Sender */}
              <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
                {isCorporate ? 'Pickup (auto-filled from corporate account)' : 'Sender / Pickup'}
              </p>
              <div className="aco-field-row">
                <div>
                  <label className="label">Pickup Address *</label>
                  <input className="input" required value={form.pickupAddress} onChange={set('pickupAddress')} />
                </div>
                <div>
                  <label className="label">Pickup Contact Name *</label>
                  <input className="input" required value={form.pickupContactName} onChange={set('pickupContactName')} />
                </div>
              </div>
              <div className="aco-field-row">
                <div>
                  <label className="label">Pickup Contact Phone{!isCorporate ? ' *' : ''}</label>
                  <input className="input" required={!isCorporate} value={form.pickupContactPhone} onChange={set('pickupContactPhone')} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  {!isCorporate && (
                    <label className="aco-toggle" style={{ marginBottom: 0 }}>
                      <input type="checkbox" checked={sameAsSender} onChange={e => handleSameAsSender(e.target.checked)} />
                      <div>
                        <p className="aco-toggle-label">Receiver is same person</p>
                        <p className="aco-toggle-sub">Auto-fills receiver fields with sender info.</p>
                      </div>
                    </label>
                  )}
                </div>
              </div>

              {/* Receiver */}
              <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
                Receiver / Delivery
              </p>
              <div className="aco-field-row">
                <div>
                  <label className="label">Delivery Address *</label>
                  <input className="input" required value={form.deliveryAddress} onChange={set('deliveryAddress')} />
                </div>
                <div>
                  <label className="label">Receiver Name *</label>
                  <input className="input" required value={form.receiverContactName} onChange={set('receiverContactName')} />
                </div>
              </div>
              <div>
                <label className="label">
                  Receiver Phone{isCorporate ? ' (Optional)' : ' *'}
                </label>
                <input className="input" required={!isCorporate} value={form.receiverContactPhone} onChange={set('receiverContactPhone')}
                  placeholder={isCorporate ? 'Not required for corporate deliveries' : ''} />
              </div>

              {/* Package */}
              <div className="aco-divider" />
              <p className="aco-section">Package Details</p>
              <div className="aco-field-row">
                <div>
                  <label className="label">Truck / Vehicle Type *</label>
                  <select className="input" required value={form.truckTypeId} onChange={set('truckTypeId')}>
                    <option value="">Select vehicle type</option>
                    {truckTypes.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Package Description *</label>
                  <input className="input" required value={form.packageDescription} onChange={set('packageDescription')} />
                </div>
              </div>
              <div className="aco-field-row">
                <div>
                  <label className="label">Quantity</label>
                  <input className="input" type="number" min="1" value={form.quantity} onChange={set('quantity')} />
                </div>
                <div>
                  <label className="label">Weight (kg)</label>
                  <input className="input" type="number" min="0.1" step="0.1" value={form.weight} onChange={set('weight')} />
                </div>
              </div>
              <div className="aco-field-row">
                <label className="aco-toggle">
                  <input type="checkbox" checked={form.isFragile} onChange={set('isFragile')} />
                  <div>
                    <p className="aco-toggle-label">Fragile Handling</p>
                    <p className="aco-toggle-sub">Operational flag only, not auto-priced.</p>
                  </div>
                </label>
                <label className="aco-toggle">
                  <input type="checkbox" checked={form.insuranceEnabled} onChange={set('insuranceEnabled')} />
                  <div>
                    <p className="aco-toggle-label">Insurance</p>
                    <p className="aco-toggle-sub">Add insurance based on declared value.</p>
                  </div>
                </label>
              </div>
              {form.insuranceEnabled && (
                <div>
                  <label className="label">Declared Value (NGN)</label>
                  <input className="input" type="number" min="0" value={form.declaredValue} onChange={set('declaredValue')} />
                </div>
              )}
              <div>
                <label className="label">Special Instructions (Optional)</label>
                <textarea className="input aco-textarea" rows="3" value={form.specialInstructions} onChange={set('specialInstructions')} />
              </div>
              <div>
                <label className="label">Internal Admin Notes (Optional)</label>
                <textarea className="input aco-textarea" rows="3" value={form.adminNotes} onChange={set('adminNotes')} />
              </div>

              {/* Pricing */}
              <div className="aco-divider" />
              <p className="aco-section">Estimate & Review</p>
              <p className="aco-help">Use the same backend pricing engine as the customer booking flow.</p>
              <button type="button" className="btn-secondary aco-calc-btn" onClick={calculateEstimate} disabled={!canCalculate || calculating}>
                {calculating ? <span className="spinner spinner-sm" /> : 'Calculate Estimated Shipping Cost'}
              </button>

              {pricing && (
                <div className="aco-estimate">
                  <p><span>Distance Cost</span><strong>{fmtCurrency(pricing.distanceFee)}</strong></p>
                  <p><span>Base Fee</span><strong>{fmtCurrency(pricing.baseFee)}</strong></p>
                  {pricing.insuranceFee > 0 && <p><span>Insurance</span><strong>{fmtCurrency(pricing.insuranceFee)}</strong></p>}
                  {form.isFragile && <p className="aco-note-line"><span>Fragile Handling</span><em>Price will be determined upon inspection</em></p>}
                  <div className="divider" />
                  <p className="aco-total"><span>System Quote</span><strong>{fmtCurrency(pricing.totalAmount)}</strong></p>
                  <div style={{ marginTop: 12 }}>
                    <label className="label" style={{ marginBottom: 6, display: 'block' }}>
                      Amount Actually Paid (NGN)
                      <span style={{ fontWeight: 400, color: 'var(--text-faint)', marginLeft: 6 }}>— override if customer paid a different amount</span>
                    </label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="1"
                      value={form.customPrice}
                      onChange={set('customPrice')}
                    />
                    {form.customPrice !== '' && Number(form.customPrice) !== pricing.totalAmount && (
                      <p style={{ fontSize: 12, color: 'var(--brand)', marginTop: 4 }}>
                        ✎ Custom price: {fmtCurrency(form.customPrice)} (system quote: {fmtCurrency(pricing.totalAmount)})
                      </p>
                    )}
                  </div>
                  <small>Final cost may vary after inspection or additional handling requirements.</small>
                </div>
              )}

              <div className="aco-cta-row">
                <button type="button" className="btn-secondary" onClick={() => navigate('/admin/orders')}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary aco-submit" disabled={submitting || calculating}>
                  {submitting ? <span className="spinner spinner-sm" /> : 'Create Order'}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
