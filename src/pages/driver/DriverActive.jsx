import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { driversAPI, ordersAPI } from '../../api/client.js';
import './DriverActive.css';

const STATUS_FLOW = {
  assigned:         { label:'✓ Confirm Pickup',      next:'picked_up',        cls:'btn-primary' },
  picked_up:        { label:'🚚 Mark In Transit',    next:'in_transit',       cls:'btn-primary' },
  in_transit:       { label:'📍 Out for Delivery',   next:'out_for_delivery', cls:'btn-primary' },
  out_for_delivery: { label:'✅ Confirm Delivered',  next:'delivered',        cls:'btn-delivered' },
};

export default function DriverActive() {
  const navigate    = useNavigate();
  const [order,     setOrder]    = useState(null);
  const [loading,   setLoading]  = useState(true);
  const [updating,  setUpdating] = useState(false);
  const [gpsActive, setGpsActive]= useState(false);
  const [location,  setLocation] = useState('');
  const socketRef   = useRef(null);
  const watchRef    = useRef(null);

  const loadOrder = () => driversAPI.activeOrder()
    .then(r => setOrder(r.data))
    .catch(console.error)
    .finally(() => setLoading(false));

  useEffect(() => {
    loadOrder();
    return () => stopGPS();
  }, []);

  // Auto-start GPS when order is loaded
  useEffect(() => {
    if (order?._id && !gpsActive) startGPS();
  }, [order?._id]);

  // Socket setup
  useEffect(() => {
    const tokens = JSON.parse(localStorage.getItem('jmove_auth') || '{}');
    if (!tokens.accessToken) return;
    import('socket.io-client').then(({ io }) => {
      const socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
        auth: { token: tokens.accessToken }, transports: ['websocket', 'polling'],
      });
      socketRef.current = socket;
    }).catch(console.error);
    return () => { socketRef.current?.disconnect(); stopGPS(); };
  }, []);

  const startGPS = () => {
    if (!navigator.geolocation || gpsActive) return;
    setGpsActive(true);
    watchRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        socketRef.current?.emit('driver:updateLocation', {
          lat: coords.latitude, lng: coords.longitude, orderId: order?._id,
        });
      },
      err => console.warn('GPS error:', err),
      { enableHighAccuracy: true, maximumAge: 4000 }
    );
  };

  const stopGPS = () => {
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    setGpsActive(false);
  };

  const updateStatus = async (newStatus) => {
    setUpdating(true);
    try {
      await ordersAPI.updateStatus(order._id, newStatus, '', location);
      if (newStatus === 'delivered') {
        stopGPS();
        navigate('/driver');
      } else {
        loadOrder();
      }
    } catch (e) { alert(e?.response?.data?.message || 'Update failed'); }
    finally { setUpdating(false); }
  };

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:60 }}><div className="spinner spinner-lg" /></div>;

  if (!order) return (
    <div className="empty-state" style={{ height:'60vh' }}>
      <div className="empty-icon">🚗</div>
      <h3>No active delivery</h3>
      <p>You'll see your assigned delivery here once dispatch assigns you a job.</p>
      <button className="btn-secondary" style={{ marginTop:8 }} onClick={() => navigate('/driver/jobs')}>View Jobs</button>
    </div>
  );

  const action  = STATUS_FLOW[order.status];
  const isCOD   = order.paymentMethod === 'cod';
  const fmt     = n => Number(n||0).toLocaleString('en-NG');

  return (
    <div className="driver-active">
      <div className="active-header">
        <div>
          <h1 className="page-title">Active Delivery</h1>
          <p className="page-subtitle" style={{ fontFamily:'var(--font-mono)', letterSpacing:'0.04em' }}>
            {order.waybillNumber}
          </p>
        </div>
        <div className="active-header-right">
          <div className={`gps-indicator ${gpsActive ? 'active' : ''}`}>
            <span className={gpsActive ? 'gps-pulse' : ''} />
            {gpsActive ? 'GPS Live' : 'GPS Off'}
          </div>
          <span className={`badge badge-${order.status.replace(/_/g,'-')}`} style={{ textTransform:'capitalize' }}>
            {order.status?.replace(/_/g,' ')}
          </span>
        </div>
      </div>

      {/* COD alert */}
      {isCOD && (
        <div className="cod-alert">
          <span className="cod-icon">💵</span>
          <div>
            <p className="cod-title">Cash on Delivery — Collect ₦{fmt(order.codAmount)} from receiver</p>
            <p className="cod-sub">Do NOT hand over the package until payment is received and confirmed.</p>
          </div>
        </div>
      )}

      {/* Route card */}
      <div className="card active-route">
        <div className="ar-stop">
          <div className="ar-dot brand" />
          <div className="ar-info">
            <p className="ar-label">PICKUP · {order.originCity}</p>
            <p className="ar-name">{order.senderName}</p>
            <p className="ar-addr">{order.senderAddress || order.originCity}</p>
            <a href={`tel:${order.senderPhone}`} className="ar-call">📞 {order.senderPhone}</a>
          </div>
        </div>
        <div className="ar-line" />
        <div className="ar-stop">
          <div className="ar-dot green" />
          <div className="ar-info">
            <p className="ar-label">DELIVERY · {order.destinationCity}</p>
            <p className="ar-name">{order.receiverName}</p>
            <p className="ar-addr">{order.receiverAddress}</p>
            <a href={`tel:${order.receiverPhone}`} className="ar-call">📞 {order.receiverPhone}</a>
          </div>
        </div>
      </div>

      {/* Package summary */}
      <div className="card active-pkg">
        <div className="ap-item"><p className="ap-lbl">Waybill</p><p className="ap-val" style={{ fontFamily:'var(--font-mono)' }}>{order.waybillNumber}</p></div>
        <div className="ap-item"><p className="ap-lbl">Item</p><p className="ap-val">{order.description}</p></div>
        <div className="ap-item"><p className="ap-lbl">Weight</p><p className="ap-val">{order.weight}kg × {order.quantity || 1}</p></div>
        <div className="ap-item"><p className="ap-lbl">Service</p><p className="ap-val" style={{ textTransform:'capitalize' }}>{order.serviceType}</p></div>
        <div className="ap-item"><p className="ap-lbl">Est. Delivery</p><p className="ap-val">{order.estimatedDelivery}</p></div>
        {order.isFragile && <div className="ap-item" style={{ gridColumn:'1/-1' }}><p className="ap-val" style={{ color:'var(--amber)' }}>⚠ Fragile — Handle with extreme care</p></div>}
        {order.specialInstructions && <div className="ap-item" style={{ gridColumn:'1/-1' }}><p className="ap-lbl">Instructions</p><p className="ap-val">{order.specialInstructions}</p></div>}
      </div>

      {/* Location note */}
      <div className="field">
        <label className="label">Current Location Note (optional)</label>
        <input type="text" className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Arrived at sender, Package picked up at Ikeja hub…" />
      </div>

      {/* Action button */}
      {action && (
        <button
          className={`action-btn ${action.cls}`}
          onClick={() => updateStatus(action.next)}
          disabled={updating}
        >
          {updating
            ? <span className="spinner spinner-sm" style={{ borderTopColor:'white' }} />
            : action.label
          }
        </button>
      )}
    </div>
  );
}
