import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { driversAPI } from '../../api/client.js';
import { formatDistanceToNow } from 'date-fns';
import './DriverJobs.css';

export default function DriverJobs() {
  const navigate = useNavigate();
  const [jobs,        setJobs]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [activeOrder, setActiveOrder] = useState(null);  // existing delivery
  const [accepting,   setAccepting]   = useState(null);
  const [toast,       setToast]       = useState(null);
  const [confirmId,   setConfirmId]   = useState(null);

  const load = () => {
    setLoading(true);
    // Check for active delivery AND fetch available jobs in parallel
    Promise.all([
      driversAPI.activeOrder().catch(() => ({ data: null })),
      driversAPI.jobs().catch(() => ({ data: [] })),
    ]).then(([activeRes, jobsRes]) => {
      setActiveOrder(activeRes.data || null);
      setJobs(jobsRes.data || []);
    }).catch(() => showToast('error', 'Failed to load jobs'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Real-time: listen for new jobs via socket
  useEffect(() => {
    const tokens = JSON.parse(localStorage.getItem('jmove_auth') || '{}');
    if (!tokens.accessToken) return;
    let socket;
    import('socket.io-client').then(({ io }) => {
      socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
        auth: { token: tokens.accessToken },
        transports: ['websocket', 'polling'],
      });
      socket.on('job:new', (job) => {
        // Add new job to list if driver doesn't have an active order
        setActiveOrder(prev => {
          if (!prev) setJobs(current => {
            if (current.find(j => j._id === job.orderId)) return current;
            return [{ _id: job.orderId, ...job, createdAt: new Date() }, ...current];
          });
          return prev;
        });
        showToast('info', `New job available: ${job.waybillNumber}`);
      });
    }).catch(() => {});
    return () => { socket?.disconnect(); };
  }, []);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const handleAccept = async (orderId) => {
    setConfirmId(null);
    setAccepting(orderId);
    try {
      await driversAPI.acceptJob(orderId);
      showToast('success', '🎉 Job accepted! Opening active delivery…');
      // Remove accepted job from list immediately
      setJobs(prev => prev.filter(j => j._id !== orderId));
      setTimeout(() => navigate('/driver/active'), 1400);
    } catch (e) {
      const msg = e?.response?.data?.message || 'Failed to accept job';
      showToast('error', msg);
    } finally {
      setAccepting(null);
    }
  };

  const fmt = n => Number(n || 0).toLocaleString('en-NG');

  const serviceConfig = {
    express:  { label: 'Express',   cls: 'badge-assigned' },
    sameday:  { label: 'Same Day',  cls: 'badge-picked_up' },
    standard: { label: 'Standard',  cls: 'badge-pending' },
  };

  return (
    <div className="driver-jobs">

      {/* ── Toast ── */}
      {toast && (
        <div className={`dj-toast ${toast.type}`}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      {/* ── Confirm Modal ── */}
      {confirmId && (() => {
        const job = jobs.find(j => j._id === confirmId);
        return (
          <div className="dj-overlay" onClick={() => setConfirmId(null)}>
            <div className="dj-modal" onClick={e => e.stopPropagation()}>
              <p className="dj-modal-title">Accept this job?</p>
              <p className="dj-modal-sub">
                {job?.originCity} → {job?.destinationCity}
              </p>
              <p className="dj-modal-waybill">{job?.waybillNumber}</p>
              <p className="dj-modal-note">
                Once accepted you'll be set to <strong>On Delivery</strong> and this job will open as your active delivery.
              </p>
              <div className="dj-modal-actions">
                <button className="btn-secondary dj-btn-cancel" onClick={() => setConfirmId(null)}>
                  Cancel
                </button>
                <button className="btn-primary dj-btn-confirm" onClick={() => handleAccept(confirmId)}>
                  ✓ Confirm Accept
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Available Jobs</h1>
          <p className="page-subtitle">Pick a job and head out for delivery</p>
        </div>
        <div className="dj-header-right">
          {jobs.length > 0 && (
            <span className="dj-count-pill">
              {jobs.length} job{jobs.length !== 1 ? 's' : ''} available
            </span>
          )}
          <button className="btn-secondary dj-refresh-btn" onClick={load} disabled={loading}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
              <path d="M13.5 2.5A6.5 6.5 0 1 1 2 9" strokeLinecap="round"/>
              <path d="M2 4.5V9H6.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="dj-loading">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="shimmer dj-skeleton" />
          ))}
        </div>
      ) : activeOrder ? (
        /* ── Blocked: driver already has an active delivery ── */
        <div className="dj-blocked-card">
          <div className="dj-blocked-icon">🚚</div>
          <div className="dj-blocked-body">
            <p className="dj-blocked-title">You have an active delivery</p>
            <p className="dj-blocked-sub">
              Complete your current delivery before accepting a new job.
            </p>
            <div className="dj-blocked-order">
              <span className="dj-blocked-waybill">{activeOrder.waybillNumber}</span>
              <span className="dj-blocked-route">
                {activeOrder.originCity} → {activeOrder.destinationCity}
              </span>
              <span className={`badge badge-${activeOrder.status}`} style={{ textTransform:'capitalize' }}>
                {activeOrder.status?.replace(/_/g,' ')}
              </span>
            </div>
            <Link to="/driver/active" className="btn-primary dj-blocked-btn">
              Go to Active Delivery →
            </Link>
          </div>
        </div>
      ) : jobs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <h3>No available jobs right now</h3>
          <p>New deliveries will appear here once dispatched. Make sure your status is set to <strong>Available</strong>.</p>
          <button className="btn-secondary" style={{ marginTop: 12, fontSize: 13 }} onClick={load}>
            Check again
          </button>
        </div>
      ) : (
        <div className="jobs-list">
          {jobs.map(job => {
            const svc = serviceConfig[job.serviceType] || serviceConfig.standard;
            const isAccepting = accepting === job._id;
            return (
              <div key={job._id} className="card job-card fade-in">

                {/* ── Card Header ── */}
                <div className="job-card-header">
                  <div className="job-card-header-left">
                    <p className="job-num">{job.waybillNumber}</p>
                    <div className="job-badges">
                      <span className={`badge ${svc.cls}`}>{svc.label}</span>
                      <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                        {job.deliveryType}
                      </span>
                      {job.isFragile && (
                        <span className="badge" style={{ background: 'var(--amber-light)', color: 'var(--amber)' }}>
                          ⚠ Fragile
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="job-amount-block">
                    <p className="job-amount">₦{fmt(job.totalAmount)}</p>
                    <p className="job-time-ago">
                      {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>

                {/* ── Route ── */}
                <div className="job-route">
                  <div className="jr-row">
                    <div className="jr-dot brand" />
                    <div>
                      <p className="jr-lbl">Pickup from</p>
                      <p className="jr-city">{job.originCity}</p>
                      {job.senderAddress && <p className="jr-addr">{job.senderAddress}</p>}
                    </div>
                  </div>
                  <div className="jr-connector">
                    <div className="jr-connector-line" />
                    <span className="jr-connector-dist">
                      {job.estimatedDelivery ? `⏱ ${job.estimatedDelivery}` : '→'}
                    </span>
                  </div>
                  <div className="jr-row">
                    <div className="jr-dot green" />
                    <div>
                      <p className="jr-lbl">Deliver to</p>
                      <p className="jr-city">{job.destinationCity}</p>
                      <p className="jr-addr">{job.receiverAddress}</p>
                    </div>
                  </div>
                </div>

                {/* ── Contacts ── */}
                <div className="job-contacts">
                  <div className="jc-item">
                    <p className="jc-label">Sender</p>
                    <p className="jc-name">{job.senderName}</p>
                    <a href={`tel:${job.senderPhone}`} className="jc-phone">
                      📞 {job.senderPhone}
                    </a>
                  </div>
                  <div className="jc-divider" />
                  <div className="jc-item">
                    <p className="jc-label">Receiver</p>
                    <p className="jc-name">{job.receiverName}</p>
                    <a href={`tel:${job.receiverPhone}`} className="jc-phone">
                      📞 {job.receiverPhone}
                    </a>
                  </div>
                </div>

                {/* ── Special Instructions ── */}
                {job.specialInstructions && (
                  <div className="job-instructions">
                    📝 {job.specialInstructions}
                  </div>
                )}

                {/* ── Footer: tags + accept ── */}
                <div className="job-footer">
                  <div className="job-tags">
                    <span className="job-tag weight">{job.weight}kg × {job.quantity || 1}</span>
                    {job.paymentMethod === 'cod' && (
                      <span className="job-tag cod">💵 COD ₦{fmt(job.codAmount)}</span>
                    )}
                    {job.category && job.category !== 'general' && (
                      <span className="job-tag" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                        {job.category}
                      </span>
                    )}
                  </div>

                  <button
                    className={`job-accept-btn ${isAccepting ? 'loading' : ''}`}
                    onClick={() => setConfirmId(job._id)}
                    disabled={isAccepting || accepting !== null}
                  >
                    {isAccepting
                      ? <span className="spinner spinner-sm" style={{ borderTopColor: '#fff' }} />
                      : '✓ Accept Job'
                    }
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
