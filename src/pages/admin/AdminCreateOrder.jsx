import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ordersAPI, pricingAPI } from '../../api/client.js';
import './AdminCreateOrder.css';

const SOURCE_OPTIONS = [
  { value: 'admin_walkin', label: 'Walk-in' },
  { value: 'admin_whatsapp', label: 'WhatsApp' },
  { value: 'admin_instagram', label: 'Instagram' },
  { value: 'admin_facebook', label: 'Facebook' },
  { value: 'admin_phone', label: 'Phone Call' },
  { value: 'admin_other', label: 'Other' },
];

const PAYMENT_OPTIONS = [
  { value: 'pending', label: 'Unpaid / Pending Payment' },
  { value: 'paid_offline', label: 'Paid Offline' },
  { value: 'whatsapp_contact', label: 'Pay via WhatsApp / Contact Rep' },
  { value: 'pay_later', label: 'Payment To Be Completed Later' },
];

const initForm = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  createCustomerRecord: true,
  sourceChannel: 'admin_walkin',

  originCity: '',
  destinationCity: '',
  truckTypeId: '',
  pickupAddress: '',
  deliveryAddress: '',
  pickupContactName: '',
  pickupContactPhone: '',
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
};

const fmtCurrency = (n) => `N${Number(n || 0).toLocaleString('en-NG')}`;

export default function AdminCreateOrder() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initForm);
  const [cities, setCities] = useState([]);
  const [truckTypes, setTruckTypes] = useState([]);
  const [pricing, setPricing] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const loadMeta = async () => {
      setLoadingMeta(true);
      try {
        const [cityRes, truckRes] = await Promise.all([
          ordersAPI.cities(),
          pricingAPI.truckTypes(),
        ]);
        setCities(cityRes.data || []);
        setTruckTypes((truckRes.data || []).filter((t) => t.isActive !== false));
      } catch (e) {
        setError(e?.response?.data?.message || 'Failed to load order form data');
      } finally {
        setLoadingMeta(false);
      }
    };
    loadMeta();
  }, []);

  const canCalculate = useMemo(() => (
    form.originCity &&
    form.destinationCity &&
    form.truckTypeId
  ), [form.originCity, form.destinationCity, form.truckTypeId]);

  const onChange = (key) => (e) => {
    const target = e.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
    if (pricing) setPricing(null);
  };

  const calculateEstimate = async () => {
    if (!canCalculate) return;
    setCalculating(true);
    setError('');
    try {
      const r = await ordersAPI.calcPrice({
        originCity: form.originCity,
        destinationCity: form.destinationCity,
        truckTypeId: form.truckTypeId,
        isFragile: form.isFragile,
        declaredValue: form.insuranceEnabled ? Number(form.declaredValue || 0) : 0,
        weight: Number(form.weight || 1),
      });
      setPricing(r.data);
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not calculate estimated shipping cost');
    } finally {
      setCalculating(false);
    }
  };

  const submitOrder = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!pricing) {
      setError('Please calculate estimated shipping cost before creating the order.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        customer: {
          fullName: form.customerName,
          phone: form.customerPhone,
          email: form.customerEmail,
          createCustomerRecord: !!form.createCustomerRecord,
        },
        sourceChannel: form.sourceChannel,
        shipment: {
          pickupAddress: form.pickupAddress,
          deliveryAddress: form.deliveryAddress,
          pickupContactName: form.pickupContactName,
          pickupContactPhone: form.pickupContactPhone,
          receiverContactName: form.receiverContactName,
          receiverContactPhone: form.receiverContactPhone,
          packageDescription: form.packageDescription,
          quantity: Number(form.quantity || 1),
          weight: Number(form.weight || 1),
          isFragile: !!form.isFragile,
          insuranceEnabled: !!form.insuranceEnabled,
          declaredValue: form.insuranceEnabled ? Number(form.declaredValue || 0) : 0,
          truckTypeId: form.truckTypeId,
          originCity: form.originCity,
          destinationCity: form.destinationCity,
          specialInstructions: form.specialInstructions,
        },
        payment: {
          outcome: form.paymentOutcome,
          note: form.paymentNote,
        },
        adminNotes: form.adminNotes,
      };

      const r = await ordersAPI.createManual(payload);
      const orderId = r?.data?.order?._id;
      setSuccess('Order created successfully. Redirecting to order details...');
      if (orderId) {
        setTimeout(() => navigate(`/admin/orders/${orderId}`), 600);
      } else {
        navigate('/admin/orders');
      }
    } catch (e2) {
      setError(e2?.response?.data?.message || 'Failed to create manual order');
    } finally {
      setSubmitting(false);
    }
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

      {error && <div className="notice-error">⚠ {error}</div>}
      {success && <div className="notice-success">✓ {success}</div>}

      {loadingMeta ? (
        <div className="card aco-loading">
          {Array(6).fill(0).map((_, i) => <div key={i} className="shimmer" style={{ height: 44, borderRadius: 8 }} />)}
        </div>
      ) : (
        <form className="aco-grid" onSubmit={submitOrder}>
          <section className="card aco-card">
            <h2 className="aco-title">Customer Details</h2>
            <div className="aco-fields">
              <div>
                <label className="label">Full Name</label>
                <input className="input" required value={form.customerName} onChange={onChange('customerName')} />
              </div>
              <div>
                <label className="label">Phone Number</label>
                <input className="input" required value={form.customerPhone} onChange={onChange('customerPhone')} />
              </div>
              <div>
                <label className="label">Email (Optional)</label>
                <input className="input" type="email" value={form.customerEmail} onChange={onChange('customerEmail')} />
              </div>
              <label className="aco-check">
                <input type="checkbox" checked={form.createCustomerRecord} onChange={onChange('createCustomerRecord')} />
                <span>Create/link customer profile in background if possible</span>
              </label>
            </div>
          </section>

          <section className="card aco-card">
            <h2 className="aco-title">Order Source & Payment</h2>
            <div className="aco-fields two-col">
              <div>
                <label className="label">Source Channel</label>
                <select className="input" value={form.sourceChannel} onChange={onChange('sourceChannel')}>
                  {SOURCE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Payment Outcome</label>
                <select className="input" value={form.paymentOutcome} onChange={onChange('paymentOutcome')}>
                  {PAYMENT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
              <div className="full">
                <label className="label">Payment Note (Optional)</label>
                <input className="input" value={form.paymentNote} onChange={onChange('paymentNote')} placeholder="Reference, teller info, follow-up note..." />
              </div>
            </div>
          </section>

          <section className="card aco-card">
            <h2 className="aco-title">Shipment Details</h2>
            <div className="aco-fields two-col">
              <div>
                <label className="label">Origin City</label>
                <select className="input" required value={form.originCity} onChange={onChange('originCity')}>
                  <option value="">Select state</option>
                  {cities.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Destination City</label>
                <select className="input" required value={form.destinationCity} onChange={onChange('destinationCity')}>
                  <option value="">Select state</option>
                  {cities.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Pickup Address</label>
                <input className="input" required value={form.pickupAddress} onChange={onChange('pickupAddress')} />
              </div>
              <div>
                <label className="label">Delivery Address</label>
                <input className="input" required value={form.deliveryAddress} onChange={onChange('deliveryAddress')} />
              </div>
              <div>
                <label className="label">Pickup Contact Name</label>
                <input className="input" required value={form.pickupContactName} onChange={onChange('pickupContactName')} />
              </div>
              <div>
                <label className="label">Pickup Contact Phone</label>
                <input className="input" required value={form.pickupContactPhone} onChange={onChange('pickupContactPhone')} />
              </div>
              <div>
                <label className="label">Receiver Contact Name</label>
                <input className="input" required value={form.receiverContactName} onChange={onChange('receiverContactName')} />
              </div>
              <div>
                <label className="label">Receiver Contact Phone</label>
                <input className="input" required value={form.receiverContactPhone} onChange={onChange('receiverContactPhone')} />
              </div>
              <div>
                <label className="label">Truck / Vehicle Type</label>
                <select className="input" required value={form.truckTypeId} onChange={onChange('truckTypeId')}>
                  <option value="">Select vehicle type</option>
                  {truckTypes.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Package / Item Description</label>
                <input className="input" required value={form.packageDescription} onChange={onChange('packageDescription')} />
              </div>
              <div>
                <label className="label">Quantity</label>
                <input className="input" type="number" min="1" value={form.quantity} onChange={onChange('quantity')} />
              </div>
              <div>
                <label className="label">Weight (kg)</label>
                <input className="input" type="number" min="0.1" step="0.1" value={form.weight} onChange={onChange('weight')} />
              </div>
              <label className="aco-check">
                <input type="checkbox" checked={form.isFragile} onChange={onChange('isFragile')} />
                <span>Fragile Handling (operational flag only)</span>
              </label>
              <label className="aco-check">
                <input type="checkbox" checked={form.insuranceEnabled} onChange={onChange('insuranceEnabled')} />
                <span>Add insurance based on declared value</span>
              </label>
              {form.insuranceEnabled && (
                <div>
                  <label className="label">Declared Value (NGN)</label>
                  <input className="input" type="number" min="0" value={form.declaredValue} onChange={onChange('declaredValue')} />
                </div>
              )}
              <div className="full">
                <label className="label">Special Instructions (Optional)</label>
                <textarea className="input aco-textarea" rows="3" value={form.specialInstructions} onChange={onChange('specialInstructions')} />
              </div>
              <div className="full">
                <label className="label">Internal Admin Notes (Optional)</label>
                <textarea className="input aco-textarea" rows="3" value={form.adminNotes} onChange={onChange('adminNotes')} />
              </div>
            </div>
          </section>

          <section className="card aco-card aco-sticky">
            <h2 className="aco-title">Estimate & Review</h2>
            <p className="aco-help">Use the same backend pricing engine as the public booking flow.</p>
            <button type="button" className="btn-secondary" onClick={calculateEstimate} disabled={!canCalculate || calculating}>
              {calculating ? <span className="spinner spinner-sm" /> : 'Calculate Estimated Shipping Cost'}
            </button>

            {pricing && (
              <div className="aco-estimate">
                <p><span>Distance Cost</span><strong>{fmtCurrency(pricing.distanceFee)}</strong></p>
                <p><span>Base Fee</span><strong>{fmtCurrency(pricing.baseFee)}</strong></p>
                {pricing.insuranceFee > 0 && <p><span>Insurance</span><strong>{fmtCurrency(pricing.insuranceFee)}</strong></p>}
                {form.isFragile && <p className="aco-note-line"><span>Fragile Handling</span><em>Price will be determined upon inspection</em></p>}
                <div className="divider" />
                <p className="aco-total"><span>Estimated Shipping Cost</span><strong>{fmtCurrency(pricing.totalAmount)}</strong></p>
                <small>Final cost may vary after inspection or additional handling requirements.</small>
              </div>
            )}

            <button type="submit" className="btn-primary aco-submit" disabled={submitting || calculating}>
              {submitting ? <span className="spinner spinner-sm" /> : 'Create Order'}
            </button>
          </section>
        </form>
      )}
    </div>
  );
}
