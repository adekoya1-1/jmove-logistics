import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { routesAPI } from '../../api/client.js';
import api from '../../api/client.js';
import './DriverRoute.css';

const QUICK_NOTES = [
  { emoji: '📍', text: 'Arrived at location' },
  { emoji: '📦', text: 'Package collected from sender' },
  { emoji: '✅', text: 'Delivered successfully, payment collected' },
  { emoji: '🚦', text: 'Delayed due to traffic' },
  { emoji: '📵', text: 'Receiver not reachable, left message' },
  { emoji: '🔄', text: 'Will attempt re-delivery shortly' },
];

// ── Stop Action Panel ───────────────────────────────────────
function StopActions({ stop, onAction, busy }) {
  const [note, setNote] = useState('');

  const isPending   = stop.status === 'pending';
  const isArrived   = stop.status === 'arrived';
  const isDone      = stop.status === 'completed' || stop.status === 'skipped';

  if (isDone) return null;

  const completeLabel = stop.type === 'pickup' ? '📦 Mark Picked Up' : '✅ Confirm Delivered';

  return (
    <div className="stop-card-body">
      {/* COD notice on delivery stops */}
      {stop.type === 'delivery' && stop.orderId?.paymentMethod === 'cod' && (
        <div className="cod-notice">
          <span style={{ fontSize: 20 }}>💵</span>
          <div>
            <p style={{ fontWeight: 700 }}>Collect ₦{Number(stop.orderId.codAmount || 0).toLocaleString('en-NG')} Cash on Delivery</p>
            <p style={{ color: 'var(--text-muted)', marginTop: 2 }}>Do NOT hand over the package before receiving full payment.</p>
          </div>
        </div>
      )}

      {/* Package info for pickup stops */}
      {stop.type === 'pickup' && stop.orderId && (
        <div className="stop-pkg-grid">
          <div className="spg-item">
            <p className="spg-lbl">Item</p>
            <p className="spg-val">{stop.orderId.description || '—'}</p>
          </div>
          <div className="spg-item">
            <p className="spg-lbl">Weight</p>
            <p className="spg-val">{stop.orderId.weight}kg × {stop.orderId.quantity || 1}</p>
          </div>
          {stop.orderId.isFragile && (
            <div className="spg-item" style={{ gridColumn: '1/-1' }}>
              <p className="spg-val" style={{ color: 'var(--amber)', fontWeight: 700 }}>⚠ Fragile — Handle with care</p>
            </div>
          )}
          {stop.orderId.specialInstructions && (
            <div className="spg-item" style={{ gridColumn: '1/-1' }}>
              <p className="spg-lbl">Special Instructions</p>
              <p className="spg-val">{stop.orderId.specialInstructions}</p>
            </div>
          )}
        </div>
      )}

      {/* Note input */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
          {QUICK_NOTES.slice(0, stop.type === 'pickup' ? 2 : 3).map(qn => (
            <button
              key={qn.text}
              style={{
                fontSize: 11, padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                background: note === qn.text ? '#fff3eb' : 'var(--bg-elevated)',
                color: note === qn.text ? 'var(--brand)' : 'var(--text-faint)',
                border: `1px solid ${note === qn.text ? 'var(--brand)' : 'var(--border)'}`,
              }}
              onClick={() => setNote(qn.text)}
            >
              {qn.emoji} {qn.text}
            </button>
          ))}
        </div>
        <input
          className="input"
          style={{ fontSize: 13 }}
          placeholder="Add a note (optional)"
          value={note}
          onChange={e => setNote(e.target.value)}
        />
      </div>

      {/* Map link */}
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.address} ${stop.city}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="map-link"
      >
        🗺 Navigate to {stop.city}
      </a>

      {/* Action buttons */}
      <div className="stop-action-row" style={{ marginTop: 12 }}>
        {isPending && (
          <button className="btn-arrived" onClick={() => onAction(stop._id, 'arrived', note)} disabled={busy}>
            {busy ? <span className="spinner spinner-sm" /> : '📍 Mark Arrived'}
          </button>
        )}
        {(isArrived || isPending) && (
          <button className="btn-complete" onClick={() => onAction(stop._id, 'completed', note)} disabled={busy}>
            {busy ? <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} /> : completeLabel}
          </button>
        )}
        <button className="btn-skip" onClick={() => {
          if (confirm('Skip this stop? This cannot be undone.')) onAction(stop._id, 'skipped', note || 'Skipped');
        }} disabled={busy}>
          Skip
        </button>
      </div>
    </div>
  );
}

// ── Main DriverRoute Page ──────────────────────────────────
export default function DriverRoute() {
  const navigate    = useNavigate();
  const [route,     setRoute]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [busyStop,  setBusyStop]  = useState(null);  // stopId currently being updated
  const [expanded,  setExpanded]  = useState(null);  // stopId currently expanded
  const [error,     setError]     = useState('');
  const [gpsActive, setGpsActive] = useState(false);
  const socketRef   = useRef(null);
  const watchRef    = useRef(null);

  const loadRoute = () => {
    routesAPI.activeRoute()
      .then(r => {
        setRoute(r.data);
        // Auto-expand first non-completed stop
        if (r.data) {
          const sorted = [...(r.data.stops || [])].sort((a, b) => a.sequence - b.sequence);
          const first  = sorted.find(s => !['completed', 'skipped'].includes(s.status));
          if (first) setExpanded(first._id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRoute();
    return () => {
      socketRef.current?.disconnect();
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  // Socket + GPS
  useEffect(() => {
    const { accessToken } = api.getTokens();
    if (!accessToken) return;
    import('socket.io-client').then(({ io }) => {
      const socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
        auth: { token: accessToken },
        transports: ['websocket', 'polling'],
      });
      socketRef.current = socket;
      // GPS tracking — emit with routeId context
      if (navigator.geolocation && !watchRef.current) {
        setGpsActive(true);
        watchRef.current = navigator.geolocation.watchPosition(
          ({ coords }) => {
            socket.emit('driver:updateLocation', {
              lat: coords.latitude,
              lng: coords.longitude,
              routeId: route?._id,
            });
          },
          err => console.warn('GPS:', err),
          { enableHighAccuracy: true, maximumAge: 4000 }
        );
      }
    }).catch(console.error);
  }, [route?._id]);

  const handleStopAction = async (stopId, status, note) => {
    if (!route) return;
    setBusyStop(stopId);
    setError('');
    try {
      const r = await routesAPI.updateStop(route._id, stopId, { status, note });
      setRoute(r.data);
      // If completed, auto-expand next pending stop
      if (status === 'completed' || status === 'skipped') {
        const sorted = [...(r.data.stops || [])].sort((a, b) => a.sequence - b.sequence);
        const next   = sorted.find(s => !['completed', 'skipped'].includes(s.status));
        setExpanded(next?._id || null);
      }
      // If route completed, show completion for a moment then redirect
      if (r.data?.status === 'completed') {
        setTimeout(() => navigate('/driver'), 3500);
      }
    } catch (e) {
      setError(e.message || 'Failed to update stop');
    } finally {
      setBusyStop(null);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div className="spinner spinner-lg" />
    </div>
  );

  if (!route) return (
    <div className="empty-state" style={{ height: '60vh' }}>
      <div className="empty-icon">🗺</div>
      <h3>No active route</h3>
      <p>Your dispatch will assign you a delivery route when one is ready.</p>
      <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/driver')}>
        Back to Dashboard
      </button>
    </div>
  );

  const sortedStops = [...route.stops].sort((a, b) => a.sequence - b.sequence);
  const completed   = sortedStops.filter(s => ['completed', 'skipped'].includes(s.status)).length;
  const total       = sortedStops.length;
  const pct         = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isFinished  = route.status === 'completed';

  const seqCls = {
    pending:   'stop-seq-pending',
    arrived:   'stop-seq-arrived',
    completed: 'stop-seq-completed',
    skipped:   'stop-seq-skipped',
  };
  const statusBadgeCls = {
    pending:   'ssb-pending',
    arrived:   'ssb-arrived',
    completed: 'ssb-completed',
    skipped:   'ssb-skipped',
  };

  if (isFinished) {
    return (
      <div className="driver-route">
        <div className="card route-complete-banner">
          <p className="rcb-emoji">🎉</p>
          <p className="rcb-title">Route Complete!</p>
          <p className="rcb-sub">All {total} stops done. Great work!</p>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 8 }}>Redirecting to dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="driver-route">
      {/* Header */}
      <div className="route-header">
        <div className="route-header-left">
          <p className="route-number">{route.routeNumber}</p>
          <h1 className="page-title">Active Route</h1>
          <p className="page-subtitle">{total} stops · {completed} completed</p>
        </div>
        <div className="route-gps-pill">
          <span className="route-gps-dot" />
          GPS Live
        </div>
      </div>

      {/* Progress bar */}
      <div className="card route-progress-bar">
        <div className="rpb-stat">
          <p className="rpb-val">{completed}</p>
          <p className="rpb-lbl">Done</p>
        </div>
        <div className="rpb-track">
          <div className="rpb-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="rpb-stat">
          <p className="rpb-val">{total - completed}</p>
          <p className="rpb-lbl">Remaining</p>
        </div>
        <div className="rpb-stat">
          <p className="rpb-val">{pct}%</p>
          <p className="rpb-lbl">Progress</p>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {/* Stop cards */}
      <div className="stops-container">
        {sortedStops.map(stop => {
          const isExpanded = expanded === stop._id;
          const isDone     = ['completed', 'skipped'].includes(stop.status);
          const isActive   = !isDone && stop.sequence === sortedStops.find(s => !['completed', 'skipped'].includes(s.status))?.sequence;
          const order      = stop.orderId;

          return (
            <div
              key={stop._id}
              className={`stop-card stop-type-${stop.type} ${isActive ? 'is-active' : ''} ${stop.status === 'completed' ? 'is-completed' : ''} ${stop.status === 'skipped' ? 'is-skipped' : ''}`}
            >
              {/* Card header — always visible, click to expand */}
              <div className="stop-card-header" onClick={() => setExpanded(isExpanded ? null : stop._id)}>
                <div className={`stop-seq-circle ${seqCls[stop.status] || 'stop-seq-pending'}`}>
                  {stop.status === 'completed' ? '✓' : stop.status === 'skipped' ? '✕' : stop.sequence}
                </div>

                <div className="stop-card-info">
                  <span className="stop-type-badge">
                    {stop.type === 'pickup' ? '📦 PICKUP' : '🏠 DELIVERY'}
                  </span>
                  <p className="stop-card-city">{stop.city}</p>
                  <p className="stop-card-addr">{stop.address}</p>
                  {stop.contactName && (
                    <p className="stop-card-contact">{stop.contactName}</p>
                  )}
                  {stop.contactPhone && (
                    <a href={`tel:${stop.contactPhone}`} className="stop-card-phone"
                      onClick={e => e.stopPropagation()}>
                      📞 {stop.contactPhone}
                    </a>
                  )}
                  {order?.waybillNumber && (
                    <p className="stop-card-waybill">{order.waybillNumber}</p>
                  )}
                </div>

                <span className={`stop-status-badge ${statusBadgeCls[stop.status] || 'ssb-pending'}`}>
                  {stop.status}
                </span>
              </div>

              {/* Expanded actions — only for non-done stops */}
              {isExpanded && !isDone && (
                <StopActions
                  stop={stop}
                  onAction={handleStopAction}
                  busy={busyStop === stop._id}
                />
              )}

              {/* Completed detail (collapsed) */}
              {isExpanded && isDone && (
                <div className="stop-card-body">
                  <p style={{ fontSize: 13, color: stop.status === 'completed' ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                    {stop.status === 'completed' ? '✅ Completed' : '🚫 Skipped'}
                    {stop.completedAt && ` · ${new Date(stop.completedAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}`}
                  </p>
                  {stop.note && <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>"{stop.note}"</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Vehicle info */}
      {route.vehicleId && (
        <div className="card" style={{ marginTop: 16, padding: '12px 16px' }}>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
            Your Vehicle
          </p>
          <p style={{ fontSize: 14, fontWeight: 700 }}>
            {route.vehicleId.plateNumber} · {route.vehicleId.make} {route.vehicleId.model}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>
            {route.vehicleId.vehicleType} · {route.vehicleId.capacityTons}t capacity
          </p>
        </div>
      )}
    </div>
  );
}
