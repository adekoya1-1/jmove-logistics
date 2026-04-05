import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI, driversAPI } from '../../api/client.js';
import { useAuth } from '../../App.jsx';
import './DriverDashboard.css';

export default function DriverDashboard() {
  const { user }         = useAuth();
  const navigate         = useNavigate();
  const [profile,  setProfile]  = useState(null);
  const [order,    setOrder]    = useState(null);
  const [driverStatus, setDriverStatus] = useState('offline');
  const [statusLoading, setStatusLoading] = useState(false);
  const [gpsActive, setGpsActive] = useState(false); // read-only indicator
  const socketRef  = useRef(null);
  const watchRef   = useRef(null);

  useEffect(() => {
    authAPI.profile().then(r => {
      setProfile(r.data);
      setDriverStatus(r.data.driverProfile?.status || 'offline');
    }).catch(console.error);
    driversAPI.activeOrder().then(r => setOrder(r.data)).catch(console.error);
  }, []);

  // Socket — connect then immediately start GPS
  useEffect(() => {
    const tokens = JSON.parse(localStorage.getItem('jmove_auth') || '{}');
    if (!tokens.accessToken) return;
    import('socket.io-client').then(({ io }) => {
      const socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
        auth: { token: tokens.accessToken }, transports: ['websocket', 'polling'],
      });
      socketRef.current = socket;
      startGPS(); // GPS always on
    }).catch(console.error);
    return () => {
      socketRef.current?.disconnect();
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  const startGPS = () => {
    if (!navigator.geolocation || watchRef.current) return;
    setGpsActive(true);
    watchRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        socketRef.current?.emit('driver:updateLocation', {
          lat: coords.latitude, lng: coords.longitude, orderId: order?._id,
        });
      },
      err => console.warn('GPS:', err),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  };

  const cycleStatus = async () => {
    // Block status change while an active delivery is ongoing
    if (order) return;
    const next = { offline:'available', available:'offline', busy:'available' };
    const newStatus = next[driverStatus] || 'offline';
    setStatusLoading(true);
    try {
      await driversAPI.updateStatus(newStatus);
      setDriverStatus(newStatus);
      socketRef.current?.emit('driver:statusChange', { status: newStatus });
    } catch (e) { console.error(e); }
    finally { setStatusLoading(false); }
  };

  const hasActiveDelivery = !!order;

  const dp      = profile?.driverProfile;
  const verified = dp?.isVerified;
  const fmt     = n => Number(n||0).toLocaleString('en-NG');

  const statusColor = {
    available: { bg:'var(--green-light)',  color:'var(--green)',  label:'Available' },
    busy:      { bg:'var(--amber-light)',  color:'var(--amber)',  label:'On Delivery' },
    offline:   { bg:'#F3F4F6',            color:'#6B7280',        label:'Offline' },
  };
  const sc = statusColor[driverStatus] || statusColor.offline;

  return (
    <div className="driver-dash">
      <div className="page-header">
        <h1 className="page-title">Driver Hub</h1>
        <p className="page-subtitle">Your JMove Logistics driver console</p>
      </div>

      {/* Profile + status card */}
      <div className="card driver-status-card">
        <div className="driver-status-left">
          <div className="driver-avatar-lg">{user?.firstName?.[0]}{user?.lastName?.[0]}</div>
          <div>
            <p className="driver-fullname">{user?.firstName} {user?.lastName}</p>
            <p className="driver-vehicle" style={{ textTransform:'capitalize' }}>
              {dp?.vehicleType || 'Vehicle'} · {dp?.vehiclePlate || '—'}
              {dp?.employeeId && ` · ${dp.employeeId}`}
            </p>
          </div>
        </div>
        <div className="driver-status-right">
          <div className="gps-btn active" title="GPS tracking is always active">
            <span className="gps-pulse" />
            📡 GPS Active
          </div>
          <div className="status-btn-wrap">
            <button
              className="status-toggle-btn"
              style={{ background:sc.bg, color:sc.color, borderColor:sc.color+'40',
                opacity: hasActiveDelivery ? 0.55 : 1,
                cursor:  hasActiveDelivery ? 'not-allowed' : 'pointer' }}
              onClick={cycleStatus}
              disabled={statusLoading || hasActiveDelivery}
              title={hasActiveDelivery ? 'Complete your current delivery before changing status' : ''}
            >
              {statusLoading ? <span className="spinner spinner-sm" /> : `● ${sc.label}`}
            </button>
            {hasActiveDelivery && (
              <p className="status-locked-hint">🔒 Complete delivery first</p>
            )}
          </div>
        </div>
      </div>

      {/* Verification warning */}
      {!verified && (
        <div className="card" style={{ padding:'14px 18px', borderLeft:'4px solid var(--amber)', background:'var(--amber-light)', display:'flex', gap:10 }}>
          <span style={{ fontSize:18 }}>⚠</span>
          <div>
            <p style={{ fontSize:14, fontWeight:700, color:'var(--amber)' }}>Account Pending Activation</p>
            <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:3 }}>Your account is waiting for admin activation. Contact your operations manager.</p>
          </div>
        </div>
      )}

      {/* Active delivery preview */}
      {order ? (
        <div className="card active-preview">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <p style={{ fontSize:14, fontWeight:700 }}>🚚 Active Delivery</p>
            <span className={`badge badge-${order.status}`} style={{ textTransform:'capitalize' }}>
              {order.status?.replace(/_/g,' ')}
            </span>
          </div>
          <div style={{ background:'var(--bg-elevated)', borderRadius:8, padding:'12px 14px', marginBottom:12 }}>
            <p style={{ fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--brand)', marginBottom:8 }}>{order.waybillNumber}</p>
            <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13 }}>
              <span style={{ fontWeight:700 }}>{order.originCity}</span>
              <span style={{ color:'var(--text-faint)' }}>→</span>
              <span style={{ fontWeight:700 }}>{order.destinationCity}</span>
            </div>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>
              Deliver to: {order.receiverName} · {order.receiverPhone}
            </p>
            {order.paymentMethod === 'cod' && (
              <p style={{ fontSize:12, color:'var(--amber)', fontWeight:700, marginTop:6 }}>
                💵 Collect ₦{fmt(order.codAmount)} COD
              </p>
            )}
          </div>
          <Link to="/driver/active" className="btn-primary" style={{ width:'100%', justifyContent:'center', fontSize:14 }}>
            Open Active Delivery →
          </Link>
        </div>
      ) : (
        <div className="card" style={{ padding:'32px 24px', textAlign:'center' }}>
          <p style={{ fontSize:22, marginBottom:10 }}>📦</p>
          <p style={{ fontSize:15, fontWeight:600, color:'var(--text-muted)', marginBottom:6 }}>No active delivery</p>
          <p style={{ fontSize:13, color:'var(--text-faint)', marginBottom:16 }}>
            {driverStatus === 'available' ? 'You are available. Jobs assigned by dispatch will appear here.' : 'Set your status to Available to receive deliveries.'}
          </p>
          {driverStatus !== 'available' && (
            <button className="btn-primary" onClick={cycleStatus} disabled={statusLoading} style={{ margin:'0 auto' }}>
              Set to Available
            </button>
          )}
        </div>
      )}

      {/* Quick stats */}
      <div className="driver-quick-stats">
        <div className="card dqs-card">
          <p className="dqs-val">{dp?.totalDeliveries || 0}</p>
          <p className="dqs-lbl">✅ Total Deliveries</p>
        </div>
        <div className="card dqs-card">
          <p className="dqs-val">★ {Number(dp?.rating || 5).toFixed(1)}</p>
          <p className="dqs-lbl">Average Rating</p>
        </div>
      </div>
    </div>
  );
}
