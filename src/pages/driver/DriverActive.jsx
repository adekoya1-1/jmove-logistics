import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { driversAPI, ordersAPI, routesAPI } from '../../api/client.js';
import { formatDistanceToNow, format } from 'date-fns';
import './DriverActive.css';

// Status flow for the main CTA button
const STATUS_FLOW = {
  assigned:         { label: '✓ Confirm Pickup',      next: 'picked_up',        cls: 'btn-primary' },
  picked_up:        { label: '🚚 Mark In Transit',    next: 'in_transit',       cls: 'btn-primary' },
  in_transit:       { label: '📍 Out for Delivery',   next: 'out_for_delivery', cls: 'btn-primary' },
  out_for_delivery: { label: '✅ Confirm Delivered',  next: 'delivered',        cls: 'btn-delivered' },
};

// Quick-select preset notes
const QUICK_NOTES = [
  { emoji: '📍', text: 'Arrived at pickup location' },
  { emoji: '📦', text: 'Package collected from sender' },
  { emoji: '🚗', text: 'En route to destination' },
  { emoji: '🏠', text: 'Arrived at delivery address' },
  { emoji: '🚦', text: 'Delayed due to traffic' },
  { emoji: '📵', text: 'Receiver not reachable, left message' },
  { emoji: '🔄', text: 'Will attempt re-delivery shortly' },
  { emoji: '✅', text: 'Delivered successfully, payment collected' },
];

export default function DriverActive() {
  const navigate    = useNavigate();
  const [order,     setOrder]      = useState(null);
  const [loading,   setLoading]    = useState(true);
  const [updating,  setUpdating]   = useState(false);
  const [gpsActive, setGpsActive]  = useState(false);
  const [location,  setLocation]   = useState('');

  // Delivery update state
  const [noteText,     setNoteText]     = useState('');
  const [noteLocation, setNoteLocation] = useState('');
  const [sendingNote,  setSendingNote]  = useState(false);
  const [noteSuccess,  setNoteSuccess]  = useState(false);
  const [notes,        setNotes]        = useState([]);   // driver notes from statusHistory

  const socketRef = useRef(null);
  const watchRef  = useRef(null);

  const loadOrder = () => {
    // Check for active route first — if found, redirect immediately
    routesAPI.activeRoute().then(r => {
      if (r.data) { navigate('/driver/route', { replace: true }); }
    }).catch(() => {});

    driversAPI.activeOrder()
      .then(r => {
        setOrder(r.data);
        if (r.data) {
          const history = r.data.statusHistory || [];
          const noteEntries = history.filter(h => h.note && h.note !== 'Driver self-accepted job');
          setNotes(noteEntries.reverse());
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOrder();
    return () => {
      // cleanup only — GPS watch cleared on unmount
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  // Auto-start GPS as soon as order loads
  useEffect(() => {
    if (order?._id && !watchRef.current) startGPS();
  }, [order?._id]);

  // Socket setup — GPS starts automatically, no manual toggle
  useEffect(() => {
    const tokens = JSON.parse(localStorage.getItem('jmove_auth') || '{}');
    if (!tokens.accessToken) return;
    import('socket.io-client').then(({ io }) => {
      const socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
        auth: { token: tokens.accessToken }, transports: ['websocket', 'polling'],
      });
      socketRef.current = socket;
    }).catch(() => {});
    return () => { socketRef.current?.disconnect(); };
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
      err => console.warn('GPS error:', err),
      { enableHighAccuracy: true, maximumAge: 4000 }
    );
  };

  const updateStatus = async (newStatus) => {
    setUpdating(true);
    try {
      await ordersAPI.updateStatus(order._id, newStatus, '', location);
      if (newStatus === 'delivered') {
        navigate('/driver');
      } else {
        loadOrder();
      }
    } catch (e) {
      alert(e?.response?.data?.message || 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  const selectQuickNote = (text) => {
    setNoteText(text);
  };

  const sendNote = async () => {
    if (!noteText.trim()) return;
    setSendingNote(true);
    try {
      await ordersAPI.addNote(order._id, noteText.trim(), noteLocation.trim());
      // Optimistically add to local notes list
      setNotes(prev => [{
        note:       noteText.trim(),
        location:   noteLocation.trim(),
        fromStatus: order.status,
        toStatus:   order.status,
        changedAt:  new Date().toISOString(),
      }, ...prev]);
      setNoteText('');
      setNoteLocation('');
      setNoteSuccess(true);
      setTimeout(() => setNoteSuccess(false), 3000);
    } catch (e) {
      alert(e?.response?.data?.message || 'Failed to send update');
    } finally {
      setSendingNote(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div className="spinner spinner-lg" />
    </div>
  );

  if (!order) return (
    <div className="empty-state" style={{ height: '60vh' }}>
      <div className="empty-icon">🚗</div>
      <h3>No active delivery</h3>
      <p>Accept a job from the Jobs page or wait for dispatch to assign you one.</p>
      <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/driver/jobs')}>
        Browse Available Jobs
      </button>
    </div>
  );

  const action = STATUS_FLOW[order.status];
  const isCOD  = order.paymentMethod === 'cod';
  const fmt    = n => Number(n || 0).toLocaleString('en-NG');

  const statusLabels = {
    assigned:         { label: 'Assigned',          color: 'var(--brand)' },
    picked_up:        { label: 'Picked Up',          color: 'var(--blue)' },
    in_transit:       { label: 'In Transit',         color: 'var(--purple, #7C3AED)' },
    out_for_delivery: { label: 'Out for Delivery',   color: 'var(--amber)' },
    delivered:        { label: 'Delivered',          color: 'var(--green)' },
  };
  const currentStatus = statusLabels[order.status] || { label: order.status, color: 'var(--text-muted)' };

  // Progress bar steps
  const steps = ['assigned', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'];
  const stepIdx = steps.indexOf(order.status);

  return (
    <div className="driver-active">

      {/* ── Header ── */}
      <div className="active-header">
        <div>
          <h1 className="page-title">Active Delivery</h1>
          <p className="active-waybill">{order.waybillNumber}</p>
        </div>
        <div className="active-header-right">
          <div className="gps-pill on" title="GPS tracking is always active">
            <span className="gps-dot" />
            GPS Live
          </div>
          <span
            className="status-pill"
            style={{ background: currentStatus.color + '18', color: currentStatus.color, border: `1.5px solid ${currentStatus.color}40` }}
          >
            {currentStatus.label}
          </span>
        </div>
      </div>

      {/* ── Progress Bar ── */}
      <div className="progress-bar-wrap">
        <div className="progress-steps">
          {steps.map((s, i) => (
            <div key={s} className={`progress-step ${i <= stepIdx ? 'done' : ''} ${i === stepIdx ? 'current' : ''}`}>
              <div className="ps-circle">
                {i < stepIdx ? '✓' : i === stepIdx ? '●' : ''}
              </div>
              <p className="ps-label">{statusLabels[s]?.label || s}</p>
            </div>
          ))}
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${(stepIdx / (steps.length - 1)) * 100}%` }} />
        </div>
      </div>

      {/* ── COD Alert ── */}
      {isCOD && (
        <div className="cod-alert">
          <span className="cod-icon">💵</span>
          <div>
            <p className="cod-title">Cash on Delivery — Collect ₦{fmt(order.codAmount)}</p>
            <p className="cod-sub">Do NOT hand over the package until payment is received and confirmed.</p>
          </div>
        </div>
      )}

      {/* ── Route Card ── */}
      <div className="card active-route">
        <p className="section-label">Route</p>
        <div className="ar-stop">
          <div className="ar-dot brand" />
          <div className="ar-info">
            <p className="ar-label">PICKUP · {order.originCity}</p>
            <p className="ar-name">{order.senderName}</p>
            <p className="ar-addr">{order.senderAddress || order.originCity}</p>
            <div style={{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap' }}>
              <a href={`tel:${order.senderPhone}`} className="ar-call">📞 {order.senderPhone}</a>
              {order.senderAddress && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.senderAddress + ' ' + order.originCity)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="ar-call" style={{ background:'var(--blue-light,#eff6ff)', color:'var(--blue,#3b82f6)' }}
                >
                  🗺 Navigate
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="ar-line" />
        <div className="ar-stop">
          <div className="ar-dot green" />
          <div className="ar-info">
            <p className="ar-label">DELIVERY · {order.destinationCity}</p>
            <p className="ar-name">{order.receiverName}</p>
            <p className="ar-addr">{order.receiverAddress}</p>
            <div style={{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap' }}>
              <a href={`tel:${order.receiverPhone}`} className="ar-call">📞 {order.receiverPhone}</a>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.receiverAddress + ' ' + order.destinationCity)}`}
                target="_blank" rel="noopener noreferrer"
                className="ar-call" style={{ background:'#f0fdf4', color:'#16a34a' }}
              >
                🗺 Navigate
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── Package Summary ── */}
      <div className="card active-pkg">
        <p className="section-label" style={{ gridColumn: '1/-1', marginBottom: 4 }}>Package Details</p>
        <div className="ap-item"><p className="ap-lbl">Item</p><p className="ap-val">{order.description}</p></div>
        <div className="ap-item"><p className="ap-lbl">Weight</p><p className="ap-val">{order.weight}kg × {order.quantity || 1}</p></div>
        <div className="ap-item"><p className="ap-lbl">Service</p><p className="ap-val" style={{ textTransform: 'capitalize' }}>{order.serviceType}</p></div>
        <div className="ap-item"><p className="ap-lbl">Est. Delivery</p><p className="ap-val">{order.estimatedDelivery}</p></div>
        {order.isFragile && (
          <div className="ap-item" style={{ gridColumn: '1/-1' }}>
            <p className="ap-val fragile-warn">⚠ Fragile — Handle with extreme care</p>
          </div>
        )}
        {order.specialInstructions && (
          <div className="ap-item" style={{ gridColumn: '1/-1' }}>
            <p className="ap-lbl">Special Instructions</p>
            <p className="ap-val">{order.specialInstructions}</p>
          </div>
        )}
      </div>

      {/* ── Status Update CTA ── */}
      {action && (
        <div className="card status-update-card">
          <p className="section-label">Update Delivery Status</p>
          <div className="field" style={{ marginBottom: 12 }}>
            <label className="label">Current Location (optional)</label>
            <input
              type="text" className="input"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. At Ikeja hub, On Lagos–Ibadan Expressway…"
            />
          </div>
          <button
            className={`action-btn ${action.cls}`}
            onClick={() => updateStatus(action.next)}
            disabled={updating}
          >
            {updating
              ? <span className="spinner spinner-sm" style={{ borderTopColor: '#fff' }} />
              : action.label
            }
          </button>
        </div>
      )}

      {/* ── Delivery Updates Section ── */}
      <div className="card updates-card">
        <div className="updates-header">
          <div>
            <p className="section-label">Send Update to Admin</p>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>
              Keep dispatch informed about your delivery progress.
            </p>
          </div>
          {noteSuccess && (
            <span className="update-sent-badge">✓ Sent!</span>
          )}
        </div>

        {/* Quick presets */}
        <div className="quick-notes">
          {QUICK_NOTES.map(qn => (
            <button
              key={qn.text}
              className={`quick-note-btn ${noteText === qn.text ? 'active' : ''}`}
              onClick={() => selectQuickNote(qn.text)}
            >
              {qn.emoji} {qn.text}
            </button>
          ))}
        </div>

        {/* Custom textarea */}
        <div className="field" style={{ marginTop: 12 }}>
          <label className="label">Your message</label>
          <textarea
            className="input update-textarea"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Type a custom update or select one above…"
            rows={3}
          />
        </div>

        <div className="field" style={{ marginTop: 8 }}>
          <label className="label">Location (optional)</label>
          <input
            type="text" className="input"
            value={noteLocation}
            onChange={e => setNoteLocation(e.target.value)}
            placeholder="e.g. Lagos Island, Ikeja GRA…"
          />
        </div>

        <button
          className="btn-primary send-update-btn"
          onClick={sendNote}
          disabled={sendingNote || !noteText.trim()}
        >
          {sendingNote
            ? <span className="spinner spinner-sm" style={{ borderTopColor: '#fff' }} />
            : '📤 Send Update'
          }
        </button>
      </div>

      {/* ── Updates Timeline ── */}
      {notes.length > 0 && (
        <div className="card updates-timeline">
          <p className="section-label">Update History</p>
          <div className="timeline">
            {notes.map((n, i) => (
              <div key={i} className="tl-item">
                <div className="tl-dot" />
                <div className="tl-content">
                  <p className="tl-note">{n.note}</p>
                  {n.location && <p className="tl-loc">📍 {n.location}</p>}
                  <p className="tl-time">
                    {n.changedAt
                      ? formatDistanceToNow(new Date(n.changedAt), { addSuffix: true })
                      : 'Just now'
                    }
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
