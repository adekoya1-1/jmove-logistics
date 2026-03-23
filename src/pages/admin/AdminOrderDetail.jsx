import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ordersAPI } from '../../api/client.js';
import { format } from 'date-fns';
import './AdminOrderDetail.css';

const BADGE = {
  booked:'badge-pending', assigned:'badge-assigned', picked_up:'badge-picked_up',
  in_transit:'badge-in_transit', out_for_delivery:'badge-in_transit',
  delivered:'badge-delivered', returned:'badge-cancelled', cancelled:'badge-cancelled',
  paid:'badge-paid',
};
const NEXT = {
  assigned:         ['picked_up'],
  picked_up:        ['in_transit'],
  in_transit:       ['out_for_delivery','delivered'],
  out_for_delivery: ['delivered','returned'],
};

export default function AdminOrderDetail() {
  const { id } = useParams();
  const [order,    setOrder]   = useState(null);
  const [loading,  setLoading] = useState(true);
  const [updating, setUpdating]= useState(false);

  const load = () => ordersAPI.get(id)
    .then(r => setOrder(r.data.order))
    .catch(console.error)
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, [id]);

  const updateStatus = async (status) => {
    setUpdating(status);
    try { await ordersAPI.updateStatus(id, status); await load(); }
    catch (e) { alert(e?.response?.data?.message || 'Update failed'); }
    finally { setUpdating(false); }
  };

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:60 }}><div className="spinner spinner-lg" /></div>;
  if (!order)  return <div className="empty-state"><div className="empty-icon">📦</div><h3>Order not found</h3></div>;

  const driver   = order.driverId;
  const nextSteps = NEXT[order.status] || [];
  const fmt = n => Number(n||0).toLocaleString('en-NG');

  return (
    <div className="order-detail">
      {/* Header */}
      <div className="detail-header">
        <div className="detail-back">
          <Link to="/admin/orders" className="btn-ghost">← Orders</Link>
          <div>
            <h1 className="page-title" style={{ fontFamily:'var(--font-mono)', letterSpacing:'0.04em' }}>{order.waybillNumber}</h1>
            <p className="page-subtitle">
              {order.deliveryType === 'intrastate' ? 'Local Delivery' : 'Interstate'} ·
              {' '}{order.serviceType} · Created {format(new Date(order.createdAt), 'MMM d, yyyy HH:mm')}
            </p>
          </div>
        </div>
        <div className="detail-header-right">
          <span className={`badge ${BADGE[order.status]}`} style={{ fontSize:13, padding:'5px 14px', textTransform:'capitalize' }}>
            {order.status?.replace(/_/g,' ')}
          </span>
          {nextSteps.map(s => (
            <button key={s} className="btn-primary" style={{ fontSize:13 }}
              onClick={() => updateStatus(s)} disabled={!!updating}>
              {updating === s ? <span className="spinner spinner-sm" style={{ borderTopColor:'white' }} /> : `Mark ${s.replace(/_/g,' ')}`}
            </button>
          ))}
        </div>
      </div>

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
              {[...( order.statusHistory || [])].reverse().map((h, i) => (
                <div key={i} className="history-item">
                  <div className={`history-dot ${i===0?'active':''}`} />
                  <div>
                    <div className="history-top">
                      <span className={`badge ${BADGE[h.toStatus]||'badge-pending'}`} style={{ textTransform:'capitalize' }}>
                        {h.toStatus?.replace(/_/g,' ')}
                      </span>
                      {h.location && <span className="history-note">@ {h.location}</span>}
                      {h.note && <span className="history-note">— {h.note}</span>}
                    </div>
                    <p className="history-time">{format(new Date(h.changedAt), 'MMM d, yyyy HH:mm')}</p>
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
            {order.senderEmail && <p className="info-contact">✉ {order.senderEmail}</p>}
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
              <div className="info-item"><p className="info-lbl">Weight</p><p className="info-val">{order.weight}kg × {order.quantity||1}</p></div>
              <div className="info-item"><p className="info-lbl">Category</p><p className="info-val">{order.category}</p></div>
              <div className="info-item"><p className="info-lbl">Fragile</p><p className="info-val">{order.isFragile ? '⚠ Yes' : 'No'}</p></div>
              {order.declaredValue > 0 && <div className="info-item"><p className="info-lbl">Declared Value</p><p className="info-val">₦{fmt(order.declaredValue)}</p></div>}
            </div>
            {order.specialInstructions && <p className="info-desc">{order.specialInstructions}</p>}
          </div>

          {/* Payment */}
          <div className="card detail-info-card">
            <p className="detail-section-title">Payment</p>
            <div className="info-grid">
              <div className="info-item"><p className="info-lbl">Total</p><p className="info-val text-brand">₦{fmt(order.totalAmount)}</p></div>
              <div className="info-item"><p className="info-lbl">Method</p><p className="info-val" style={{ textTransform:'capitalize' }}>{order.paymentMethod?.replace('cod','COD')}</p></div>
              <div className="info-item"><p className="info-lbl">Status</p><span className={`badge ${order.paymentStatus==='paid'?'badge-paid':'badge-pending'}`}>{order.paymentStatus}</span></div>
              {order.codAmount > 0 && <div className="info-item"><p className="info-lbl">COD Amount</p><p className="info-val">₦{fmt(order.codAmount)}</p></div>}
            </div>
          </div>

          {/* Driver */}
          {driver && (
            <div className="card detail-info-card">
              <p className="detail-section-title">Assigned Driver</p>
              <p className="info-person">{driver.userId?.firstName} {driver.userId?.lastName}</p>
              <p className="info-contact">{driver.vehicleType} · {driver.vehiclePlate}</p>
              {driver.userId?.phone && <p className="info-contact">📞 {driver.userId.phone}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
