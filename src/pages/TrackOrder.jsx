import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { ordersAPI } from '../api/client.js';
import { format } from 'date-fns';
import './TrackOrder.css';
import PublicNav from '../components/PublicNav.jsx';
import SEO from '../components/SEO.jsx';

const STEPS = [
  { key: 'booked',           label: 'Order Placed',     icon: '📋' },
  { key: 'assigned',         label: 'Driver Assigned',  icon: '🚗' },
  { key: 'picked_up',        label: 'Picked Up',        icon: '📦' },
  { key: 'in_transit',       label: 'In Transit',       icon: '🚚' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: '🏃' },
  { key: 'delivered',        label: 'Delivered',        icon: '✅' },
];

const STATUS_COLOR = {
  booked: 'var(--amber)',    assigned: 'var(--blue)',
  picked_up: 'var(--blue)',  in_transit: 'var(--blue)',
  out_for_delivery: 'var(--brand)',
  delivered: 'var(--green)', returned: 'var(--red)',
  cancelled: 'var(--red)',
};

export default function TrackOrder() {
  const [params, setParams] = useSearchParams();
  const [waybill,  setWaybill]  = useState(params.get('waybill') || '');
  const [order,    setOrder]    = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [searched, setSearched] = useState(false);

  const handleTrack = async (e) => {
    e?.preventDefault();
    const wb = waybill.trim().toUpperCase();
    if (!wb) return;
    setLoading(true); setError(''); setOrder(null); setSearched(true);
    setParams({ waybill: wb });
    try {
      const r = await ordersAPI.track(wb);
      setOrder(r.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Waybill not found. Please check the number and try again.');
    } finally { setLoading(false); }
  };

  // Auto-search if waybill in URL
  useEffect(() => {
    const wb = params.get('waybill');
    if (wb) { setWaybill(wb); handleTrack(); }
  }, []);

  const stepIdx = order ? STEPS.findIndex(s => s.key === order.status) : -1;
  const fmt = n => Number(n || 0).toLocaleString('en-NG');

  return (
    <div className="track-page">
      <SEO
        title="Track Your Shipment"
        description="Track your JMove Logistics shipment in real time. Enter your waybill number to see live delivery status, route updates, and estimated delivery time anywhere in Nigeria."
        canonical="/track"
      />
      <PublicNav />

      {/* Hero search */}
      <section className="track-hero">
        <div className="track-hero-content">
          <div className="track-hero-icon">🚚</div>
          <h1 className="track-hero-title">Track Your Shipment</h1>
          <p className="track-hero-sub">Enter your waybill number to get real-time delivery status</p>
          <form className="track-search-form" onSubmit={handleTrack}>
            <input
              className="track-input"
              type="text"
              value={waybill}
              onChange={e => setWaybill(e.target.value.toUpperCase())}
              placeholder="e.g. JMVLAG20240318XXXX"
              maxLength={30}
              autoFocus
            />
            <button className="track-search-btn" type="submit" disabled={loading}>
              {loading ? <span className="spinner spinner-sm" style={{ borderTopColor:'white' }} /> : 'Track'}
            </button>
          </form>
        </div>
      </section>

      {/* Result */}
      {searched && (
        <section className="track-result">
          {loading && (
            <div className="track-result-card">
              <div style={{ display:'flex', justifyContent:'center', padding:'48px 0' }}>
                <div className="spinner spinner-lg" />
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="track-result-card track-error">
              <div className="track-error-icon">🔍</div>
              <h3>Shipment Not Found</h3>
              <p>{error}</p>
              <p style={{ fontSize:12, color:'var(--text-faint)', marginTop:8 }}>
                Make sure you entered the waybill number exactly as shown on your receipt.
              </p>
            </div>
          )}

          {!loading && order && (
            <div className="track-order-result">
              {/* Header */}
              <div className="track-result-header">
                <div className="trh-left">
                  <p className="trh-waybill">{order.waybillNumber}</p>
                  <p className="trh-sub">
                    {order.deliveryType === 'intrastate' ? 'Local Delivery' : 'Interstate Delivery'}
                    &nbsp;·&nbsp;
                    <span style={{ textTransform:'capitalize' }}>{order.serviceType}</span>
                    &nbsp;·&nbsp;Booked {format(new Date(order.createdAt), 'MMM d, yyyy')}
                  </p>
                </div>
                <div className="trh-status" style={{ background: STATUS_COLOR[order.status] + '20', color: STATUS_COLOR[order.status], borderColor: STATUS_COLOR[order.status] + '40' }}>
                  {order.status?.replace(/_/g,' ')}
                </div>
              </div>

              {/* Progress stepper */}
              {!['returned','cancelled'].includes(order.status) && (
                <div className="track-stepper">
                  {STEPS.map((s, i) => {
                    const done   = stepIdx > i;
                    const active = stepIdx === i;
                    const isLast = i === STEPS.length - 1;
                    return (
                      <div key={s.key} className="ts-step">
                        <div className={`ts-circle ${done ? 'done' : active ? 'active' : ''}`}>
                          {done ? '✓' : s.icon}
                        </div>
                        {!isLast && <div className={`ts-line ${done ? 'done' : ''}`} />}
                        <p className={`ts-label ${done ? 'done' : active ? 'active' : ''}`}>{s.label}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {['returned','cancelled'].includes(order.status) && (
                <div className="track-cancelled-banner">
                  <span style={{ fontSize:24 }}>{order.status === 'returned' ? '↩️' : '❌'}</span>
                  <div>
                    <p style={{ fontWeight:700, fontSize:15 }}>Shipment {order.status === 'returned' ? 'Returned' : 'Cancelled'}</p>
                    <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:3 }}>
                      {order.status === 'returned'
                        ? 'This shipment was returned to the sender.'
                        : 'This shipment was cancelled.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Info cards */}
              <div className="track-info-grid">
                {/* Route */}
                <div className="tig-card">
                  <p className="tig-title">📍 Route</p>
                  <div className="tig-route">
                    <div className="tig-stop">
                      <div className="tig-dot" style={{ background:'var(--brand)' }} />
                      <div>
                        <p className="tig-lbl">From</p>
                        <p className="tig-city">{order.originCity}</p>
                      </div>
                    </div>
                    <div className="tig-line" />
                    <div className="tig-stop">
                      <div className="tig-dot" style={{ background:'var(--green)' }} />
                      <div>
                        <p className="tig-lbl">To</p>
                        <p className="tig-city">{order.destinationCity}</p>
                        <p className="tig-addr">{order.receiverAddress}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Receiver */}
                <div className="tig-card">
                  <p className="tig-title">👤 Recipient</p>
                  <p style={{ fontWeight:700, fontSize:14 }}>{order.receiverName}</p>
                  <p style={{ fontSize:13, color:'var(--text-muted)', marginTop:4 }}>📞 {order.receiverPhone}</p>
                  {order.estimatedDelivery && (
                    <div className="tig-eta">
                      <p className="tig-lbl">Estimated Delivery</p>
                      <p style={{ fontWeight:700, color:'var(--brand)', fontSize:13 }}>{order.estimatedDelivery}</p>
                    </div>
                  )}
                </div>

                {/* Package */}
                <div className="tig-card">
                  <p className="tig-title">📦 Package</p>
                  <div className="tig-pkg-grid">
                    <div><p className="tig-lbl">Item</p><p className="tig-val">{order.description}</p></div>
                    <div><p className="tig-lbl">Weight</p><p className="tig-val">{order.weight} kg</p></div>
                    <div><p className="tig-lbl">Qty</p><p className="tig-val">{order.quantity || 1}</p></div>
                    {order.isFragile && <div><p className="tig-lbl">Handling</p><p className="tig-val" style={{ color:'var(--amber)' }}>⚠ Fragile</p></div>}
                  </div>
                </div>

                {/* Tracking History */}
                {order.statusHistory?.length > 0 && (
                  <div className="tig-card" style={{ gridColumn: '1 / -1' }}>
                    <p className="tig-title">🕐 Tracking Timeline</p>
                    <div className="tig-timeline">
                      {[...order.statusHistory].reverse().map((h, i) => (
                        <div key={i} className="tig-event">
                          <div className={`tig-event-dot ${i === 0 ? 'latest' : ''}`} />
                          <div className="tig-event-body">
                            <div className="tig-event-status">{h.toStatus?.replace(/_/g,' ')}</div>
                            <p className="tig-event-time">
                              {format(new Date(h.changedAt), 'MMM d, yyyy · h:mm a')}
                              {h.location && ` · ${h.location}`}
                            </p>
                            {h.note && <p className="tig-event-note">"{h.note}"</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* CTA */}
              <div className="track-cta">
                <p className="track-cta-text">Need to ship something?</p>
                <Link to="/register" className="btn-primary" style={{ fontSize:13 }}>Create Free Account</Link>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Footer */}
      <footer className="track-footer">
        <p>© {new Date().getFullYear()} JMove Logistics · <Link to="/" style={{ color:'var(--brand)' }}>Back to Home</Link></p>
      </footer>
    </div>
  );
}
