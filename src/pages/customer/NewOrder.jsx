import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ordersAPI, paymentsAPI, pricingAPI } from '../../api/client.js';
import { useAuth } from '../../App.jsx';
import './NewOrder.css';

const STEPS = [
  { id:1, label:'Route'   },
  { id:2, label:'Package' },
  { id:3, label:'Quote'   },
  { id:4, label:'Payment' },
];

const CATEGORIES = ['documents','electronics','clothing','food','furniture','fragile items','general goods','health & beauty','auto parts'];

const SERVICE_TYPES = [
  { value:'standard', label:'Standard Delivery',    desc:'2–5 business days interstate, 1–2 hrs intrastate', extra:'' },
  { value:'express',  label:'Express (GoFaster)',   desc:'24–48 hours delivery guaranteed',                  extra:'+₦2,000' },
  { value:'sameday',  label:'Same Day Delivery',    desc:'Available in select cities only',                  extra:'+₦3,000' },
];

const PAYMENT_METHODS = [
  { value:'online', label:'Pay Online',         desc:'Card, bank transfer or USSD via Paystack', icon:'💳' },
  { value:'cash',   label:'Pay at Centre',      desc:'Pay cash when you drop off at our office', icon:'🏢' },
  { value:'cod',    label:'Cash on Delivery',   desc:'Receiver pays on delivery (e-commerce)',   icon:'📦' },
];

export default function NewOrder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step,     setStep]    = useState(1);
  const [loading,  setLoading] = useState(false);
  const [cities,   setCities]  = useState([]);
  const [pricing,  setPricing] = useState(null);
  const [pricingConfig, setPricingConfig] = useState(null);
  const [orderId,  setOrderId] = useState(null);
  const [error,    setError]   = useState('');

  const [form, setForm] = useState({
    // Sender
    senderName:  `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
    senderPhone: user?.phone || '',
    senderEmail: user?.email || '',
    senderAddress: '',
    originCity: '',
    // Receiver
    receiverName: '', receiverPhone: '', receiverEmail: '', receiverAddress: '',
    destinationCity: '',
    // Package
    description: '', weight: '', quantity: '1',
    category: 'general goods', isFragile: false,
    declaredValue: '', specialInstructions: '',
    truckTypeId: '',
    // Service
    serviceType: 'standard',
    // Payment
    paymentMethod: 'online', codAmount: '',
  });

  useEffect(() => {
    ordersAPI.cities().then(r => setCities(r.data)).catch(console.error);
    pricingAPI.config().then(r => setPricingConfig(r.data)).catch(console.error);
  }, []);

  const set = k => e => setForm(f => ({
    ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value
  }));

  const calcQuote = async () => {
    setError(''); setLoading(true);
    try {
      const r = await ordersAPI.calcPrice({
        originCity: form.originCity, 
        destinationCity: form.destinationCity,
        truckTypeId: form.truckTypeId,
      });
      setPricing(r.data); setStep(3);
    } catch (e) { setError(e?.response?.data?.error || e?.response?.data?.message || 'Failed to calculate price'); }
    finally { setLoading(false); }
  };

  const createOrder = async () => {
    setError(''); setLoading(true);
    try {
      const r = await ordersAPI.create({
        ...form, weight: +form.weight, quantity: +form.quantity,
        declaredValue: +form.declaredValue || 0,
        codAmount: +form.codAmount || 0,
        truckTypeId: form.truckTypeId || undefined,
      });
      setOrderId(r.data.order._id);
      if (form.paymentMethod === 'online') {
        const pay = await paymentsAPI.initialize(r.data.order._id);
        window.location.href = pay.data.authorization_url;
      } else {
        setStep(4);
      }
    } catch (e) { setError(e?.response?.data?.error || e?.response?.data?.message || 'Failed to book shipment'); }
    finally { setLoading(false); }
  };

  const isOriginActive = form.originCity ? (cities.find(c => c.name === form.originCity)?.isActive !== false) : true;
  const isDestActive   = form.destinationCity ? (cities.find(c => c.name === form.destinationCity)?.isActive !== false) : true;
  const inactiveStateName = (!isOriginActive ? form.originCity : (!isDestActive ? form.destinationCity : null));
  const isPickupInactive = !isOriginActive;

  const step1Valid = form.senderName && form.senderPhone && form.originCity &&
                     form.receiverName && form.receiverPhone && form.receiverAddress && form.destinationCity &&
                     isOriginActive && isDestActive;
  const step2Valid = form.description && form.weight && +form.weight > 0 &&
                     (pricingConfig?.hasDynamicPricing ? !!form.truckTypeId : true);

  const fmt = n => Number(n||0).toLocaleString('en-NG');

  return (
    <div className="new-order">
      <div className="page-header">
        <div>
          <h1 className="page-title">Book a Haulage</h1>
          <p className="page-subtitle">Fill in the details to get a price and book</p>
        </div>
      </div>

      {/* Step bar */}
      <div className="step-bar">
        {STEPS.map((s, i) => (
          <div key={s.id} className="step-item">
            <div className={`step-circle ${step > s.id ? 'done' : step === s.id ? 'active' : ''}`}>
              {step > s.id ? '✓' : s.id}
            </div>
            <span className={`step-label ${step === s.id ? 'active' : ''}`}>{s.label}</span>
            {i < STEPS.length - 1 && <div className={`step-line ${step > s.id ? 'done' : ''}`} />}
          </div>
        ))}
      </div>

      {error && <div className="order-error">⚠ {error}</div>}

      <div className="card order-card">

        {/* ── Step 1: Route ── */}
        {step === 1 && (
          <div className="order-step fade-in">
            <h2 className="step-title">Sender & Receiver Details</h2>
            <div className="order-fields">

              <div className="od-section">Sender Information</div>
              <div className="field-row">
                <div className="field"><label className="label">Sender Name *</label><input type="text" className="input" value={form.senderName} onChange={set('senderName')} placeholder="John Doe" required /></div>
                <div className="field"><label className="label">Sender Phone *</label><input type="tel" className="input" value={form.senderPhone} onChange={set('senderPhone')} placeholder="+234 801 234 5678" required /></div>
              </div>
              <div className="field-row">
                <div className="field"><label className="label">Sender Email</label><input type="email" className="input" value={form.senderEmail} onChange={set('senderEmail')} placeholder="sender@email.com" /></div>
                <div className="field">
                  <select className={`input ${!isOriginActive ? 'input-error' : ''}`} value={form.originCity} onChange={set('originCity')} required>
                    <option value="">Select state…</option>
                    {cities.map(c => <option key={c._id || c.key || c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="field"><label className="label">Sender Address / Pickup Address</label><input type="text" className="input" value={form.senderAddress} onChange={set('senderAddress')} placeholder="Full address for pickup (optional)" /></div>

              <div className="od-divider" />

              <div className="od-section">Receiver Information</div>
              <div className="field-row">
                <div className="field"><label className="label">Receiver Name *</label><input type="text" className="input" value={form.receiverName} onChange={set('receiverName')} placeholder="Jane Doe" required /></div>
                <div className="field"><label className="label">Receiver Phone *</label><input type="tel" className="input" value={form.receiverPhone} onChange={set('receiverPhone')} placeholder="+234 801 234 5678" required /></div>
              </div>
              <div className="field-row">
                <div className="field"><label className="label">Receiver Email</label><input type="email" className="input" value={form.receiverEmail} onChange={set('receiverEmail')} placeholder="receiver@email.com" /></div>
                <div className="field">
                  <select className={`input ${!isDestActive ? 'input-error' : ''}`} value={form.destinationCity} onChange={set('destinationCity')} required>
                    <option value="">Select state…</option>
                    {cities.map(c => <option key={c._id || c.key || c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="field"><label className="label">Delivery Address *</label><input type="text" className="input" value={form.receiverAddress} onChange={set('receiverAddress')} placeholder="Full delivery address" required /></div>
            </div>
            {inactiveStateName && (
              <div className="order-error" style={{ marginBottom: 16 }}>
                <strong>⚠ We are currently unavailable for pickup or delivery in the selected state.</strong>
                <br />
                {isPickupInactive ? `Pickup from ${inactiveStateName}` : `Delivery to ${inactiveStateName}`} is currently unavailable.
              </div>
            )}
            <button className="btn-primary step-cta" onClick={() => setStep(2)} disabled={!step1Valid}>
              Continue to Package Details →
            </button>
          </div>
        )}

        {/* ── Step 2: Package ── */}
        {step === 2 && (
          <div className="order-step fade-in">
            <h2 className="step-title">Package & Service Details</h2>
            <div className="order-fields">

              <div className="od-section">Package Information</div>
              <div className="field"><label className="label">Item Description *</label><input type="text" className="input" value={form.description} onChange={set('description')} placeholder="e.g. Laptop computer, 2 pairs of shoes" required /></div>
              <div className="field-row">
                <div className="field"><label className="label">Weight (kg) *</label><input type="number" className="input" value={form.weight} onChange={set('weight')} placeholder="0.5" step="0.1" min="0.1" required /></div>
                <div className="field"><label className="label">Quantity (items)</label><input type="number" className="input" value={form.quantity} onChange={set('quantity')} placeholder="1" min="1" /></div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="label">Category</label>
                  <select className="input" value={form.category} onChange={set('category')}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
                  </select>
                </div>
                <div className="field"><label className="label">Declared Value (₦) <span style={{fontWeight:400,textTransform:'none',letterSpacing:0,fontSize:10}}>for insurance</span></label><input type="number" className="input" value={form.declaredValue} onChange={set('declaredValue')} placeholder="e.g. 50000" min="0" /></div>
              </div>

              <label className="fragile-toggle">
                <input type="checkbox" checked={form.isFragile} onChange={set('isFragile')} />
                <div>
                  <p className="fragile-label">⚠ Fragile — Handle with care</p>
                  <p className="fragile-sub">Please ensure proper packaging</p>
                </div>
              </label>

              <div className="field"><label className="label">Special Instructions</label><textarea className="input" style={{resize:'none',height:72}} value={form.specialInstructions} onChange={set('specialInstructions')} placeholder="Any handling notes or delivery instructions…" /></div>

              {pricingConfig?.hasDynamicPricing && pricingConfig.truckTypes?.length > 0 && (
                <>
                  <div className="od-divider" />
                  <div className="od-section">Vehicle Type *</div>
                  <div className="service-type-grid">
                    {pricingConfig.truckTypes.map(tt => (
                      <label key={tt._id} className={`service-option ${form.truckTypeId === tt._id ? 'active' : ''}`}>
                        <input type="radio" name="truckTypeId" value={tt._id} checked={form.truckTypeId === tt._id} onChange={set('truckTypeId')} hidden />
                        <div className="so-header">
                          <p className="so-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 18 }}>{tt.icon}</span> <span>{tt.name}</span>
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
            </div>
            <div className="step-cta-row">
              <button className="btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button className="btn-primary step-cta" onClick={calcQuote} disabled={!step2Valid || loading}>
                {loading ? <span className="spinner spinner-sm" style={{borderTopColor:'white'}} /> : 'Get Price Quote →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Quote + Payment Method ── */}
        {step === 3 && pricing && (
          <div className="order-step fade-in">
            <h2 className="step-title">Price Quote</h2>

            <div className="quote-route">
              <div className="qr-city"><span className="qr-dot origin" />{pricing.originCity}</div>
              <div className="qr-arrow">→</div>
              <div className="qr-city"><span className="qr-dot dest" />{pricing.destinationCity}</div>
              <div className="qr-badge">{pricing.deliveryType === 'intrastate' ? 'Intrastate' : 'Interstate'}</div>
              <div className="qr-eta">⏱ {pricing.estimatedDelivery}</div>
            </div>

            {pricing.truckType && (
              <div className="pricing-vehicle-tag">
                <span>{pricing.truckType.icon}</span>
                <span>{pricing.truckType.name}</span>
                <span className="pvt-cap">{pricing.truckType.capacityTons}t capacity</span>
                {pricing.isDynamic && <span className="pvt-badge">Zone Pricing</span>}
              </div>
            )}

            <div className="pricing-box">
              <div className="pricing-row" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="pr-label">Fixed Route Price</span>
                <span className="pr-val">₦{fmt(pricing.basePrice)}</span>
              </div>
              <div className="pricing-total">
                <span>Total Shipping Cost</span>
                <span className="pt-total">₦{fmt(pricing.totalAmount)}</span>
              </div>
            </div>

            <div className="od-section" style={{marginTop:20}}>Payment Method</div>
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
              <div className="field" style={{marginTop:12}}>
                <label className="label">Cash on Delivery Amount (₦) — amount receiver will pay</label>
                <input type="number" className="input" value={form.codAmount} onChange={set('codAmount')} placeholder="e.g. 25000" min="0" />
              </div>
            )}

            <div className="step-cta-row">
              <button className="btn-secondary" onClick={() => setStep(2)}>← Back</button>
              <button className="btn-primary step-cta" onClick={createOrder} disabled={loading}>
                {loading ? <span className="spinner spinner-sm" style={{borderTopColor:'white'}} />
                  : form.paymentMethod === 'online' ? '💳 Pay & Book Shipment'
                  : '📦 Confirm Booking'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Confirmed ── */}
        {step === 4 && (
          <div className="order-step order-success fade-in">
            <div className="success-icon">✅</div>
            <h2 className="step-title" style={{textAlign:'center'}}>Shipment Booked!</h2>
            <p className="success-sub">
              {form.paymentMethod === 'cash'
                ? 'Please visit any JMove Logistics office to drop off your package and pay.'
                : form.paymentMethod === 'cod'
                ? 'Your shipment is booked. The receiver will pay on delivery.'
                : 'Your shipment is confirmed.'}
            </p>
            {pricing && (
              <div className="success-amount">
                <p className="sa-val">₦{fmt(pricing.totalAmount)}</p>
                <p className="sa-lbl">{form.paymentMethod === 'cod' ? 'Shipping fee (prepaid)' : 'Total amount'}</p>
              </div>
            )}
            <div style={{display:'flex',flexDirection:'column',gap:8,width:'100%'}}>
              <button className="btn-primary step-cta" onClick={() => navigate('/dashboard/orders')}>
                View My Shipments
              </button>
              <button className="btn-secondary" style={{width:'100%',justifyContent:'center'}} onClick={() => { setStep(1); setPricing(null); setOrderId(null); }}>
                Book Another Shipment
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
