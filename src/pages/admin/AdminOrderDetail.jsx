import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ordersAPI, driversAPI } from '../../api/client.js';
import { format } from 'date-fns';
import './AdminOrderDetail.css';

const BADGE = {
  booked:'badge-pending', assigned:'badge-assigned', picked_up:'badge-picked_up',
  in_transit:'badge-in_transit', out_for_delivery:'badge-in_transit',
  delivered:'badge-delivered', returned:'badge-cancelled', cancelled:'badge-cancelled',
  paid:'badge-paid',
};

// Status labels shown in the tracking timeline
const STATUS_LABEL = {
  booked:'Booked', assigned:'Assigned', picked_up:'Picked Up',
  in_transit:'In Transit', out_for_delivery:'Out for Delivery',
  delivered:'Delivered', returned:'Returned', cancelled:'Cancelled',
};

const SOURCE_LABEL = {
  website: 'Website',
  admin_walkin: 'Walk-in',
  admin_whatsapp: 'WhatsApp',
  admin_instagram: 'Instagram',
  admin_facebook: 'Facebook',
  admin_phone: 'Phone Call',
  admin_other: 'Other',
};

export default function AdminOrderDetail() {
  const { id } = useParams();
  const [order,      setOrder]     = useState(null);
  const [loading,    setLoading]   = useState(true);

  // Assign modal state
  const [showAssign, setShowAssign] = useState(false);
  const [drivers,    setDrivers]   = useState([]);
  const [selDriver,  setSelDriver] = useState('');
  const [assigning,  setAssigning] = useState(false);
  const [drvLoading, setDrvLoading]= useState(false);

  const load = () =>
    ordersAPI.get(id)
      .then(r => setOrder(r.data.order))
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, [id]);

  const openAssign = () => {
    setShowAssign(true);
    setSelDriver('');
    setDrvLoading(true);
    driversAPI.list({ status: 'available' })
      .then(r => setDrivers(r.data.drivers))
      .catch(() => {})
      .finally(() => setDrvLoading(false));
  };

  const doAssign = async () => {
    if (!selDriver) return;
    setAssigning(true);
    try {
      await ordersAPI.assign(id, selDriver);
      setShowAssign(false);
      load();
    } catch (e) {
      alert(e?.response?.data?.message || 'Assignment failed');
    } finally {
      setAssigning(false);
    }
  };

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', padding:60 }}>
      <div className="spinner spinner-lg" />
    </div>
  );
  if (!order) return (
    <div className="empty-state">
      <div className="empty-icon">📦</div>
      <h3>Order not found</h3>
    </div>
  );

  const driver  = order.driverId;
  const canAssign = order.status === 'booked' && !order.driverId;
  const fmt = n => Number(n || 0).toLocaleString('en-NG');

  return (
    <div className="order-detail">

      {/* ── Assign Driver Modal ── */}
      {showAssign && (
        <div className="modal-overlay" onClick={() => setShowAssign(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Assign Driver</h2>
              <button className="btn-ghost" onClick={() => setShowAssign(false)}>✕</button>
            </div>
            <div className="modal-body">
              {drvLoading ? (
                <div style={{ display:'flex', justifyContent:'center', padding:24 }}>
                  <span className="spinner spinner-lg" />
                </div>
              ) : drivers.length === 0 ? (
                <div style={{ textAlign:'center', padding:'24px 0', color:'var(--text-muted)' }}>
                  <p style={{ fontSize:24, marginBottom:8 }}>🚗</p>
                  <p style={{ fontWeight:600 }}>No available drivers right now</p>
                  <p style={{ fontSize:13, marginTop:4 }}>All drivers are either offline or on a delivery.</p>
                </div>
              ) : (
                <div className="driver-options">
                  {drivers.map(d => (
                    <label key={d._id} className={`driver-option ${selDriver === d._id ? 'selected' : ''}`}>
                      <input type="radio" name="driver" value={d._id}
                        checked={selDriver === d._id} onChange={() => setSelDriver(d._id)} hidden />
                      <div className="driver-opt-avatar">
                        {d.userId?.firstName?.[0]}{d.userId?.lastName?.[0]}
                      </div>
                      <div className="driver-opt-info">
                        <p className="driver-opt-name">{d.userId?.firstName} {d.userId?.lastName}</p>
                        <p className="driver-opt-sub" style={{ textTransform:'capitalize' }}>
                          {d.vehicleType} · {d.vehiclePlate}
                        </p>
                        {d.userId?.phone && (
                          <p className="driver-opt-sub">📞 {d.userId.phone}</p>
                        )}
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        <span className="driver-opt-rating">⭐ {Number(d.rating).toFixed(1)}</span>
                        <p style={{ fontSize:11, color:'var(--text-faint)', marginTop:2 }}>
                          {d.totalDeliveries} deliveries
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <button
                className="btn-primary"
                style={{ width:'100%', marginTop:16 }}
                onClick={doAssign}
                disabled={!selDriver || assigning}
              >
                {assigning
                  ? <span className="spinner spinner-sm" style={{ borderTopColor:'#fff' }} />
                  : 'Confirm Assignment'
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="detail-header">
        <div className="detail-back">
          <Link to="/admin/orders" className="btn-ghost">← Orders</Link>
          <div>
            <h1 className="page-title" style={{ fontFamily:'var(--font-mono)', letterSpacing:'0.04em' }}>
              {order.waybillNumber}
            </h1>
            <p className="page-subtitle">
              {order.deliveryType === 'intrastate' ? 'Local Delivery' : 'Interstate'} ·{' '}
              {order.serviceType} · Created {format(new Date(order.createdAt), 'MMM d, yyyy HH:mm')}
            </p>
          </div>
        </div>
        <div className="detail-header-right">
          <span className={`badge ${BADGE[order.status]}`}
            style={{ fontSize:13, padding:'5px 14px', textTransform:'capitalize' }}>
            {order.status?.replace(/_/g,' ')}
          </span>

          {order.paymentStatus === 'paid' && (
            <button className="btn-ghost" style={{ fontSize:12 }} onClick={() => window.print()} title="Print/Download Receipt">
              🖨 Print Receipt
            </button>
          )}

          {/* Admin can ONLY assign — no status-change buttons */}
          {canAssign && (
            <button className="btn-primary" style={{ fontSize:13 }} onClick={openAssign}>
              🚗 Assign Driver
            </button>
          )}
        </div>
      </div>

      {/* ── Info banner: status is driver-managed ── */}
      {!canAssign && !['delivered','cancelled','returned'].includes(order.status) && (
        <div style={{
          padding:'10px 16px', borderRadius:'var(--radius)',
          background:'var(--bg-elevated)', border:'1px solid var(--border)',
          fontSize:13, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:8,
        }}>
          <span>ℹ️</span>
          <span>
            Status is managed by the assigned driver.
            Admin action is limited to assigning unbooked orders.
          </span>
        </div>
      )}

      <div className="detail-grid">
        <div className="detail-main">

          {/* Route summary */}
          <div className="card" style={{ padding:'18px 20px' }}>
            <p className="detail-section-title">Route</p>
            <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
              <div style={{ textAlign:'center' }}>
                <p style={{ fontSize:11, color:'var(--text-faint)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:3 }}>Origin</p>
                <p style={{ fontSize:20, fontWeight:700, color:'var(--brand)' }}>{order.originCity}</p>
              </div>
              <div style={{ fontSize:24, color:'var(--text-faint)', flex:1, textAlign:'center' }}>→</div>
              <div style={{ textAlign:'center' }}>
                <p style={{ fontSize:11, color:'var(--text-faint)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:3 }}>Destination</p>
                <p style={{ fontSize:20, fontWeight:700, color:'var(--green)' }}>{order.destinationCity}</p>
              </div>
              <div style={{ marginLeft:'auto', textAlign:'right' }}>
                <p style={{ fontSize:11, color:'var(--text-faint)' }}>Est. Delivery</p>
                <p style={{ fontSize:13, fontWeight:700 }}>{order.estimatedDelivery}</p>
              </div>
            </div>
          </div>

          {/* Status timeline */}
          <div className="card detail-history">
            <p className="detail-section-title">Tracking History</p>
            <div className="history-list">
              {[...(order.statusHistory || [])].reverse().map((h, i) => (
                <div key={i} className="history-item">
                  <div className={`history-dot ${i === 0 ? 'active' : ''}`} />
                  <div>
                    <div className="history-top">
                      <span className={`badge ${BADGE[h.toStatus] || 'badge-pending'}`}
                        style={{ textTransform:'capitalize' }}>
                        {STATUS_LABEL[h.toStatus] || h.toStatus?.replace(/_/g,' ')}
                      </span>
                      {/* Show note updates differently */}
                      {h.note && h.fromStatus === h.toStatus
                        ? <span className="history-note driver-note">📝 {h.note}</span>
                        : h.note && <span className="history-note">— {h.note}</span>
                      }
                      {h.location && <span className="history-note">📍 {h.location}</span>}
                    </div>
                    <p className="history-time">
                      {format(new Date(h.changedAt), 'MMM d, yyyy HH:mm')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="detail-sidebar">

          {/* Sender */}
          <div className="card detail-info-card">
            <p className="detail-section-title">Sender</p>
            <p className="info-person">{order.senderName}</p>
            <p className="info-contact">📞 {order.senderPhone}</p>
            {order.senderEmail   && <p className="info-contact">✉ {order.senderEmail}</p>}
            {order.senderAddress && <p className="info-contact">📍 {order.senderAddress}</p>}
            <p className="info-contact" style={{ color:'var(--brand)', fontWeight:700 }}>City: {order.originCity}</p>
          </div>

          {/* Receiver */}
          <div className="card detail-info-card">
            <p className="detail-section-title">Receiver</p>
            <p className="info-person">{order.receiverName}</p>
            <p className="info-contact">📞 {order.receiverPhone}</p>
            {order.receiverEmail && <p className="info-contact">✉ {order.receiverEmail}</p>}
            <p className="info-contact">📍 {order.receiverAddress}</p>
            <p className="info-contact" style={{ color:'var(--green)', fontWeight:700 }}>City: {order.destinationCity}</p>
          </div>

          {/* Package */}
          <div className="card detail-info-card">
            <p className="detail-section-title">Package</p>
            <div className="info-grid">
              <div className="info-item"><p className="info-lbl">Description</p><p className="info-val">{order.description}</p></div>
              <div className="info-item"><p className="info-lbl">Weight</p><p className="info-val">{order.weight}kg × {order.quantity || 1}</p></div>
              <div className="info-item"><p className="info-lbl">Category</p><p className="info-val">{order.category}</p></div>
              <div className="info-item"><p className="info-lbl">Fragile</p><p className="info-val">{order.isFragile ? '⚠ Yes' : 'No'}</p></div>
              {order.declaredValue > 0 && (
                <div className="info-item"><p className="info-lbl">Declared Value</p><p className="info-val">₦{fmt(order.declaredValue)}</p></div>
              )}
            </div>
            {order.specialInstructions && <p className="info-desc">{order.specialInstructions}</p>}
          </div>

          {/* Payment */}
          <div className="card detail-info-card">
            <p className="detail-section-title">Payment</p>
            <div className="info-grid">
              <div className="info-item"><p className="info-lbl">Total</p><p className="info-val text-brand">₦{fmt(order.totalAmount)}</p></div>
              <div className="info-item"><p className="info-lbl">Method</p><p className="info-val" style={{ textTransform:'capitalize' }}>{order.paymentMethod?.replace('cod','COD')}</p></div>
              <div className="info-item"><p className="info-lbl">Status</p><span className={`badge ${order.paymentStatus === 'paid' ? 'badge-paid' : 'badge-pending'}`}>{order.paymentStatus}</span></div>
              {order.codAmount > 0 && (
                <div className="info-item"><p className="info-lbl">COD Amount</p><p className="info-val">₦{fmt(order.codAmount)}</p></div>
              )}
            </div>
            {(order.sourceChannel || order.createdByStaff || order.manualPayment?.status) && (
              <>
                <div className="divider" style={{ margin: '8px 0 12px' }} />
                <div className="info-grid">
                  {order.sourceChannel && (
                    <div className="info-item">
                      <p className="info-lbl">Source</p>
                      <p className="info-val">{SOURCE_LABEL[order.sourceChannel] || order.sourceChannel}</p>
                    </div>
                  )}
                  {order.createdByStaff && (
                    <div className="info-item">
                      <p className="info-lbl">Created By</p>
                      <p className="info-val">Admin Staff</p>
                    </div>
                  )}
                  {order.manualPayment?.status && (
                    <div className="info-item">
                      <p className="info-lbl">Manual Payment</p>
                      <p className="info-val" style={{ textTransform: 'capitalize' }}>
                        {order.manualPayment.status.replace(/_/g, ' ')}
                      </p>
                    </div>
                  )}
                </div>
                {order.manualPayment?.note && <p className="info-desc">{order.manualPayment.note}</p>}
              </>
            )}
          </div>

          {/* Driver */}
          {driver ? (
            <div className="card detail-info-card">
              <p className="detail-section-title">Assigned Driver</p>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                <div style={{
                  width:36, height:36, borderRadius:'var(--radius-sm)',
                  background:'var(--brand)', color:'#fff',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontWeight:700, fontSize:14, flexShrink:0,
                }}>
                  {driver.userId?.firstName?.[0]}{driver.userId?.lastName?.[0]}
                </div>
                <div>
                  <p className="info-person" style={{ marginBottom:0 }}>
                    {driver.userId?.firstName} {driver.userId?.lastName}
                  </p>
                  <p className="info-contact" style={{ textTransform:'capitalize', marginTop:2 }}>
                    {driver.vehicleType} · {driver.vehiclePlate}
                  </p>
                </div>
              </div>
              {driver.userId?.phone && <p className="info-contact">📞 {driver.userId.phone}</p>}
            </div>
          ) : canAssign && (
            <div className="card detail-info-card" style={{ textAlign:'center', padding:'20px' }}>
              <p style={{ fontSize:22, marginBottom:8 }}>🚗</p>
              <p style={{ fontSize:13, fontWeight:600, color:'var(--text-muted)', marginBottom:12 }}>No driver assigned yet</p>
              <button className="btn-primary" style={{ fontSize:13, width:'100%' }} onClick={openAssign}>
                Assign a Driver
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
