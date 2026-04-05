import { useState, useEffect } from 'react';
import { earningsAPI } from '../../api/client.js';
import { format } from 'date-fns';
import './DriverHistory.css';

export default function DriverHistory() {
  const [records,  setRecords]  = useState([]);
  const [summary,  setSummary]  = useState({});
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    earningsAPI.mine({ limit: 30 })
      .then(r => {
        setRecords(r.data.records || []);
        setSummary(r.data.summary || {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const fmt = n => Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });

  return (
    <div className="driver-history">
      <div className="page-header">
        <div>
          <h1 className="page-title">Earnings &amp; History</h1>
          <p className="page-subtitle">Your delivery record and commission breakdown</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="history-stats">
        <div className="card hs-card">
          <div className="hs-icon deliveries">📦</div>
          <div>
            <p className="hs-val">{summary.totalDeliveries || 0}</p>
            <p className="hs-lbl">Total Deliveries</p>
          </div>
        </div>
        <div className="card hs-card">
          <div className="hs-icon total">💰</div>
          <div>
            <p className="hs-val">₦{fmt(summary.totalEarnings)}</p>
            <p className="hs-lbl">All-Time Earnings</p>
          </div>
        </div>
        <div className="card hs-card">
          <div className="hs-icon monthly">📅</div>
          <div>
            <p className="hs-val">₦{fmt(summary.thisMonth)}</p>
            <p className="hs-lbl">This Month</p>
          </div>
        </div>
        <div className="card hs-card">
          <div className="hs-icon weekly">📈</div>
          <div>
            <p className="hs-val">₦{fmt(summary.thisWeek)}</p>
            <p className="hs-lbl">This Week</p>
          </div>
        </div>
      </div>

      {/* Commission notice */}
      <div className="notice-info" style={{ fontSize:12 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" style={{ flexShrink:0, marginTop:1 }}><circle cx="7" cy="7" r="6.5" opacity=".15"/><path d="M7 6v4M7 4.5a.5.5 0 110 1 .5.5 0 010-1z"/><circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>
        Your commission is <strong>15%</strong> of each order's total value, credited when marked delivered.
      </div>

      {/* Earnings table */}
      <div className="card">
        <div className="history-header">
          <p style={{ fontSize:14, fontWeight:700 }}>Delivery Log</p>
          <span className="badge badge-delivered">{records.length} completed</span>
        </div>

        {loading ? (
          <div style={{ padding:'12px 16px' }}>
            {Array(5).fill(0).map((_,i) => (
              <div key={i} className="shimmer" style={{ height:64, margin:'6px 0', borderRadius:8 }} />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>No deliveries yet</h3>
            <p>Completed deliveries and earnings will appear here</p>
          </div>
        ) : (
          <div className="history-list">
            {records.map(r => (
              <div key={r._id} className="history-row">
                <div className="hr-icon">✅</div>
                <div className="hr-info">
                  <p className="hr-num">{r.waybillNumber}</p>
                  <p className="hr-addr">{r.originCity} → {r.destinationCity}</p>
                </div>
                <div className="hr-right">
                  <div className="hr-earn">
                    <p className="hr-commission">+₦{Number(r.commission).toLocaleString()}</p>
                    <p className="hr-order-val">₦{Number(r.orderAmount).toLocaleString()} order</p>
                  </div>
                  <p className="hr-date">
                    {r.earnedAt ? format(new Date(r.earnedAt), 'MMM d, yyyy') : '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
