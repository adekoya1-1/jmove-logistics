import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ordersAPI, paymentsAPI, reviewsAPI } from '../../api/client.js';
import { format } from 'date-fns';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './CustomerOrderDetail.css';

// Fix for default marker icons in Leaflet + Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

const BADGE = {
  booked:'badge-pending', assigned:'badge-assigned', picked_up:'badge-picked_up',
  in_transit:'badge-in_transit', out_for_delivery:'badge-in_transit',
  delivered:'badge-delivered', returned:'badge-cancelled', cancelled:'badge-cancelled',
  paid:'badge-paid',
};

const STEPS = [
  { key:'booked',           label:'Booked'          },
  { key:'assigned',         label:'Driver Assigned'  },
  { key:'picked_up',        label:'Picked Up'        },
  { key:'in_transit',       label:'In Transit'       },
  { key:'out_for_delivery', label:'Out for Delivery' },
  { key:'delivered',        label:'Delivered'        },
];

export default function CustomerOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order,      setOrder]      = useState(null);
  const [payment,    setPayment]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [driverPos,  setDriverPos]  = useState(null);
  const [payLoading, setPayLoading] = useState(false);
  const [review,     setReview]     = useState(null);
  const [myRating,   setMyRating]   = useState(0);
  const [myComment,  setMyComment]  = useState('');
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);
  const mapRef       = useRef(null);
  const mapObj       = useRef(null);
  const driverMarker = useRef(null);
  const socketRef    = useRef(null);

  const load = () => ordersAPI.get(id)
    .then(r => { setOrder(r.data.order); setPayment(r.data.payment); })
    .catch(() => {})
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, [id]);

  // Load existing review
  useEffect(() => {
    reviewsAPI.forOrder(id)
      .then(r => { if (r.data) { setReview(r.data); setMyRating(r.data.rating); setMyComment(r.data.comment || ''); }})
      .catch(() => {});
  }, [id]);

  const handlePrintInvoice = () => {
    window.print();
  };

  const handleCancelOrder = async () => {
    if (!window.confirm('Are you sure you want to cancel this shipment? This cannot be undone.')) return;
    setLoading(true);
    try {
      await ordersAPI.cancel(id);
      load();
    } catch (e) {
      alert(e?.response?.data?.message || 'Failed to cancel order');
      setLoading(false);
    }
  };

  // Live socket for in-transit orders
  useEffect(() => {
    const tokens = JSON.parse(localStorage.getItem('jmove_auth') || '{}');
    if (!tokens.accessToken) return;

    let socket;
    import('socket.io-client').then(({ io }) => {
      socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
        auth: { token: tokens.accessToken },
        transports: ['websocket', 'polling'],
      });
      socketRef.current = socket;
      socket.emit('order:subscribe', { orderId: id });
      socket.on('driver:locationUpdate', ({ lat, lng, orderId }) => {
        if (orderId === id) setDriverPos({ lat, lng });
      });
      socket.on('order:statusUpdate', ({ orderId }) => {
        if (orderId === id) load();
      });
    }).catch(() => {});

    return () => { socket?.disconnect(); };
  }, [id]);

  const handlePay = async () => {
    setPayLoading(true);
    try {
      const r = await paymentsAPI.initialize(id);
      window.location.href = r.data.authorization_url;
    } catch (e) {
      alert(e?.response?.data?.message || 'Payment failed');
      setPayLoading(false);
    }
  };

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:60 }}><div className="spinner spinner-lg" /></div>;
  if (!order)  return <div className="empty-state"><div className="empty-icon">📦</div><h3>Shipment not found</h3></div>;

  const driver   = order.driverId;
  const stepIdx  = STEPS.findIndex(s => s.key === order.status);
  const needsPay = order.paymentMethod === 'online' && order.paymentStatus !== 'paid' && !['cancelled','returned'].includes(order.status);
  const fmt      = n => Number(n || 0).toLocaleString('en-NG');

  return (
    <div className="order-track">
      {/* Header */}
      <div className="track-header">
        <Link to="/dashboard/orders" className="btn-ghost">← Back</Link>
        <div className="track-header-info">
          <h1 className="page-title" style={{ fontFamily:'var(--font-mono)', letterSpacing:'0.04em' }}>
            {order.waybillNumber}
          </h1>
          <p className="page-subtitle">
            {order.deliveryType === 'intrastate' ? 'Local Delivery' : 'Interstate Delivery'}
            &nbsp;· Booked {format(new Date(order.createdAt), 'MMM d, yyyy')}
          </p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {order.paymentStatus === 'paid' && (
            <button className="btn-ghost" onClick={handlePrintInvoice} title="Print / Download Receipt" style={{ fontSize:12 }}>
              🖨 Receipt
            </button>
          )}
          <span className={`badge ${BADGE[order.status]}`} style={{ fontSize:13, padding:'5px 14px', textTransform:'capitalize' }}>
            {order.status?.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      <div style={{ display:'flex', gap: 10, marginBottom: 16 }}>
        {order.status === 'booked' && (
          <button className="btn-secondary" style={{ color:'var(--red)', borderColor:'var(--red)' }} onClick={handleCancelOrder}>
            ✕ Cancel Shipment
          </button>
        )}
        <Link to={`/dashboard/new-order?rebook=${id}`} className="btn-secondary">
          🔄 Rebook Again
        </Link>
      </div>

      {/* Payment banner */}
      {needsPay && (
        <div className="pay-banner card">
          <div className="pay-banner-content">
            <div className="pay-banner-icon">💳</div>
            <div>
              <p className="pay-banner-title">Payment Required</p>
              <p className="pay-banner-sub">Pay ₦{fmt(order.totalAmount)} to confirm your shipment</p>
            </div>
          </div>
          <button className="btn-primary" style={{ fontSize:13, flexShrink:0 }} onClick={handlePay} disabled={payLoading}>
            {payLoading ? <span className="spinner spinner-sm" style={{ borderTopColor:'white' }} /> : 'Pay Now'}
          </button>
        </div>
      )}

      {/* Progress stepper */}
      <div className="track-progress card">
        <div className="progress-steps">
          {STEPS.map((s, i) => {
            const done   = stepIdx > i;
            const active = stepIdx === i;
            const isLast = i === STEPS.length - 1;
            return (
              <div key={s.key} className="progress-step">
                {!isLast && <div className={`ps-connector ${done ? 'done' : ''}`} />}
                <div className={`ps-circle ${done ? 'done' : active ? 'active' : ''}`}>
                  {done ? '✓' : i + 1}
                </div>
                <p className={`ps-label ${done ? 'done' : active ? 'active' : ''}`}>
                  {s.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info grid */}
      <div className="track-info">
        <div className="card track-info-card" style={{ gridColumn: '1/-1', padding: 0, overflow: 'hidden', height: 300, minHeight: 300 }}>
          <MapContainer 
            center={[9.0820, 8.6753]} // Center of Nigeria
            zoom={6} 
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={false}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {driverPos && (
              <Marker position={[driverPos.lat, driverPos.lng]}>
                <Popup>Driver is here</Popup>
              </Marker>
            )}
            {/* If we had pickup/delivery coordinates, we'd place markers and a Polyline here */}
            {order.pickupLat && order.pickupLng && (
              <Marker position={[order.pickupLat, order.pickupLng]}>
                <Popup>Pickup: {order.originCity}</Popup>
              </Marker>
            )}
            {order.deliveryLat && order.deliveryLng && (
              <Marker position={[order.deliveryLat, order.deliveryLng]}>
                <Popup>Delivery: {order.destinationCity}</Popup>
              </Marker>
            )}
          </MapContainer>
        </div>

        {/* Route */}
        <div className="card track-info-card">
          <p className="ti-title">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6.5 1.5C4.5 1.5 3 3 3 5c0 3 3.5 6.5 3.5 6.5S10 8 10 5c0-2-1.5-3.5-3.5-3.5z"/><circle cx="6.5" cy="5" r="1.2"/></svg>
            Route
          </p>
          <div className="ti-route">
            <div className="ti-stop">
              <div className="ti-dot brand" />
              <div>
                <p className="ti-lbl">From</p>
                <p className="ti-addr">{order.originCity}</p>
                {order.senderAddress && <p className="ti-addr" style={{ color:'var(--text-faint)', fontSize:12 }}>{order.senderAddress}</p>}
              </div>
            </div>
            <div className="ti-line" />
            <div className="ti-stop">
              <div className="ti-dot green" />
              <div>
                <p className="ti-lbl">To</p>
                <p className="ti-addr">{order.destinationCity}</p>
                <p className="ti-addr" style={{ color:'var(--text-faint)', fontSize:12 }}>{order.receiverAddress}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Receiver */}
        <div className="card track-info-card">
          <p className="ti-title">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor"><path d="M6.5 1a2.5 2.5 0 100 5 2.5 2.5 0 000-5zm-5 10a5 5 0 0110 0H1.5z"/></svg>
            Receiver
          </p>
          <p style={{ fontSize:14, fontWeight:700 }}>{order.receiverName}</p>
          <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:3 }}>📞 {order.receiverPhone}</p>
          {order.receiverEmail && <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:2 }}>✉ {order.receiverEmail}</p>}
        </div>

        {/* Package details */}
        <div className="card track-info-card">
          <p className="ti-title">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="3" width="10" height="9" rx="1"/><path d="M4 3V2a2 2 0 014 0v1"/><path d="M1.5 6.5h10"/></svg>
            Package
          </p>
          <div className="ti-pkg-grid">
            <div className="ti-pkg-item"><p className="ti-lbl">Description</p><p className="ti-val">{order.description}</p></div>
            <div className="ti-pkg-item"><p className="ti-lbl">Weight</p><p className="ti-val">{order.weight}kg × {order.quantity || 1}</p></div>
            <div className="ti-pkg-item"><p className="ti-lbl">Service</p><p className="ti-val" style={{ textTransform:'capitalize' }}>{order.serviceType}</p></div>
            <div className="ti-pkg-item"><p className="ti-lbl">Est. Delivery</p><p className="ti-val">{order.estimatedDelivery}</p></div>
            {order.isFragile && <div className="ti-pkg-item"><p className="ti-lbl">Handling</p><p className="ti-val" style={{ color:'var(--amber)' }}>⚠ Fragile</p></div>}
          </div>
        </div>

        {/* Payment */}
        <div className="card track-info-card">
          <p className="ti-title">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="3" width="11" height="8" rx="1"/><path d="M1 6h11"/></svg>
            Payment
          </p>
          <div className="ti-pkg-grid">
            <div className="ti-pkg-item"><p className="ti-lbl">Total Amount</p><p className="ti-val text-brand">₦{fmt(order.totalAmount)}</p></div>
            <div className="ti-pkg-item"><p className="ti-lbl">Method</p><p className="ti-val" style={{ textTransform:'capitalize' }}>{order.paymentMethod?.replace('cod','Cash on Delivery')}</p></div>
            <div className="ti-pkg-item"><p className="ti-lbl">Status</p><span className={`badge ${order.paymentStatus === 'paid' ? 'badge-paid' : 'badge-pending'}`}>{order.paymentStatus}</span></div>
            {order.codAmount > 0 && <div className="ti-pkg-item"><p className="ti-lbl">COD Amount</p><p className="ti-val">₦{fmt(order.codAmount)}</p></div>}
          </div>
        </div>

        {/* Driver */}
        {driver && (
          <div className="card track-info-card">
            <p className="ti-title">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="4" width="11" height="7" rx="1"/><path d="M3 4V3a2 2 0 014 0v1M1 7h11"/></svg>
              Assigned Driver
            </p>
            <div className="driver-badge">
              <div className="db-avatar">{driver.userId?.firstName?.[0]}{driver.userId?.lastName?.[0]}</div>
              <div>
                <p className="db-name">{driver.userId?.firstName} {driver.userId?.lastName}</p>
                <p className="db-sub" style={{ textTransform:'capitalize' }}>{driver.vehicleType} · {driver.vehiclePlate}</p>
              </div>
              {driver.userId?.phone && (
                <div className="db-call">
                  <a href={`tel:${driver.userId.phone}`}>📞</a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Status history */}
        {order.statusHistory?.length > 0 && (
          <div className="card track-info-card" style={{ gridColumn:'1/-1' }}>
            <p className="ti-title">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6.5" cy="6.5" r="5.5"/><path d="M6.5 3.5v3l2 1.5"/></svg>
              Tracking History
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[...order.statusHistory].reverse().map((h, i) => (
                <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background: i===0 ? 'var(--brand)' : 'var(--border-strong)', flexShrink:0, marginTop:5 }} />
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span className={`badge ${BADGE[h.toStatus] || 'badge-pending'}`} style={{ textTransform:'capitalize' }}>
                        {h.toStatus?.replace(/_/g,' ')}
                      </span>
                      {h.location && <span style={{ fontSize:12, color:'var(--text-faint)' }}>@ {h.location}</span>}
                    </div>
                    <p style={{ fontSize:11, color:'var(--text-faint)', marginTop:3 }}>
                      {format(new Date(h.changedAt), 'MMM d, yyyy HH:mm')}
                      {h.note && ` · ${h.note}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rating card — only for delivered orders */}
        {order.status === 'delivered' && order.driverId && (
          <div className="card track-info-card" style={{ gridColumn:'1/-1' }}>
            <p className="ti-title">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="var(--amber)"><path d="M6.5 1l1.6 3.3 3.6.5-2.6 2.6.6 3.6-3.2-1.7-3.2 1.7.6-3.6L1.3 4.8l3.6-.5z"/></svg>
              Rate This Delivery
            </p>
            {review || ratingDone ? (
              <div className="rating-done">
                <span style={{ fontSize:28 }}>{'★'.repeat(myRating)}{'☆'.repeat(5 - myRating)}</span>
                <p style={{ fontSize:13, fontWeight:600, color:'var(--green)', marginTop:6 }}>Thank you for your feedback!</p>
                {myComment && <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:4, fontStyle:'italic' }}>"{myComment}"</p>}
              </div>
            ) : (
              <div className="rating-form">
                <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:12 }}>How was your delivery experience?</p>
                <div className="star-row">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} className={`star-btn ${myRating >= n ? 'active' : ''}`} onClick={() => setMyRating(n)}>★</button>
                  ))}
                  {myRating > 0 && (
                    <span className="rating-label">
                      {['','Poor','Fair','Good','Very Good','Excellent'][myRating]}
                    </span>
                  )}
                </div>
                <textarea
                  className="input"
                  placeholder="Leave an optional comment..."
                  value={myComment}
                  onChange={e => setMyComment(e.target.value)}
                  rows={2}
                  style={{ resize:'none', marginTop:10, fontSize:13 }}
                />
                <button
                  className="btn-primary"
                  style={{ marginTop:10, fontSize:13 }}
                  onClick={handleSubmitRating}
                  disabled={!myRating || ratingBusy}
                >
                  {ratingBusy ? <span className="spinner spinner-sm" style={{ borderTopColor:'white' }} /> : 'Submit Rating'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
