import { useState, useEffect } from 'react';
import { driversAPI } from '../../api/client.js';
import './DriverPerformance.css';

const Stars = ({ rating }) => {
  const r = Math.round(rating || 0);
  return (
    <span className="perf-stars">
      {[1,2,3,4,5].map(n => (
        <span key={n} className={n <= r ? 'star-on' : 'star-off'}>★</span>
      ))}
    </span>
  );
};

export default function DriverPerformance() {
  const [reviews, setReviews]   = useState([]);
  const [summary, setSummary]   = useState(null);
  const [stats,   setStats]     = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      driversAPI.reviews().catch(() => ({ data: { reviews: [], summary: {} } })),
      driversAPI.stats().catch(() => ({ data: {} })),
    ]).then(([rRes, sRes]) => {
      setReviews(rRes.data?.reviews || []);
      setSummary(rRes.data?.summary || {});
      setStats(sRes.data || {});
    }).finally(() => setLoading(false));
  }, []);

  const fmt = n => Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', padding:60 }}>
      <div className="spinner spinner-lg" />
    </div>
  );

  const deliveryRate = stats?.total?.count > 0
    ? ((stats.total.count / Math.max(stats.total.count, 1)) * 100).toFixed(0)
    : 100;

  return (
    <div className="driver-performance">
      <div className="page-header">
        <h1 className="page-title">Performance</h1>
        <p className="page-subtitle">Your delivery stats and customer ratings</p>
      </div>

      {/* ── Stats Grid ── */}
      <div className="perf-stats-grid">
        <div className="card perf-stat-card">
          <p className="psc-icon">📦</p>
          <p className="psc-val">{stats?.today?.count || 0}</p>
          <p className="psc-lbl">Today's Deliveries</p>
        </div>
        <div className="card perf-stat-card">
          <p className="psc-icon">📅</p>
          <p className="psc-val">{stats?.week?.count || 0}</p>
          <p className="psc-lbl">This Week</p>
        </div>
        <div className="card perf-stat-card">
          <p className="psc-icon">✅</p>
          <p className="psc-val">{stats?.total?.count || 0}</p>
          <p className="psc-lbl">All Time</p>
        </div>
        <div className="card perf-stat-card">
          <p className="psc-icon">★</p>
          <p className="psc-val">{Number(stats?.rating || 5).toFixed(1)}</p>
          <p className="psc-lbl">Avg Rating</p>
        </div>
      </div>

      {/* ── Rating Summary ── */}
      <div className="card perf-rating-card">
        <div className="prc-left">
          <p className="prc-score">{Number(summary?.avgRating || stats?.rating || 5).toFixed(1)}</p>
          <Stars rating={summary?.avgRating || stats?.rating || 5} />
          <p className="prc-total">{summary?.totalReviews || 0} reviews</p>
        </div>
        <div className="prc-right">
          {[
            { label: '5 ★', val: summary?.fiveStars || 0, total: summary?.totalReviews || 1 },
            { label: '4 ★', val: summary?.fourStars || 0, total: summary?.totalReviews || 1 },
            { label: '3 ★', val: summary?.threeStars || 0, total: summary?.totalReviews || 1 },
            { label: '<3 ★',val: summary?.belowThree || 0, total: summary?.totalReviews || 1 },
          ].map(row => (
            <div key={row.label} className="prc-bar-row">
              <span className="prc-bar-label">{row.label}</span>
              <div className="prc-bar-track">
                <div
                  className="prc-bar-fill"
                  style={{ width: `${(row.val / Math.max(row.total, 1)) * 100}%` }}
                />
              </div>
              <span className="prc-bar-count">{row.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Reviews ── */}
      <div className="card">
        <div className="perf-reviews-header">
          <p className="perf-section-label">Customer Feedback</p>
        </div>
        {reviews.length === 0 ? (
          <div className="empty-state" style={{ padding:'32px 0' }}>
            <div className="empty-icon">💬</div>
            <h3>No reviews yet</h3>
            <p>Customer ratings will appear here after deliveries marked complete.</p>
          </div>
        ) : (
          <div className="perf-reviews-list">
            {reviews.map(rv => (
              <div key={rv._id} className="perf-review-item">
                <div className="pri-top">
                  <Stars rating={rv.rating} />
                  <span className="pri-route">
                    {rv.orderId?.originCity} → {rv.orderId?.destinationCity}
                  </span>
                  <span className="pri-waybill">{rv.orderId?.waybillNumber}</span>
                </div>
                {rv.comment && <p className="pri-comment">"{rv.comment}"</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
