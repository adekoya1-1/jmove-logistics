import { useState, useEffect } from 'react';
import { driversAPI } from '../../api/client.js';
import { format } from 'date-fns';
import './DriverHistory.css';

export default function DriverHistory() {
  const [records,  setRecords]  = useState([]);
  const [summary,  setSummary]  = useState({});
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    // Fetch from the driver stats and earnings endpoints — strip all monetary data
    Promise.all([
      driversAPI.earnings({ limit: 50 }).catch(() => ({ data: { records: [], summary: {} } })),
      driversAPI.stats().catch(() => ({ data: {} })),
    ]).then(([earningsRes, statsRes]) => {
      setRecords(earningsRes.data.records || []);
      setSummary(statsRes.data || {});
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="driver-history">
      <div className="page-header">
        <div>
          <h1 className="page-title">Delivery History</h1>
          <p className="page-subtitle">Your completed deliveries log</p>
        </div>
      </div>

      {/* Summary stats — deliveries only, no money */}
      <div className="history-stats">
        <div className="card hs-card">
          <div className="hs-icon deliveries">📦</div>
          <div>
            <p className="hs-val">{summary.total?.count || 0}</p>
            <p className="hs-lbl">Total Deliveries</p>
          </div>
        </div>
        <div className="card hs-card">
          <div className="hs-icon monthly">📅</div>
          <div>
            <p className="hs-val">{summary.week?.count || 0}</p>
            <p className="hs-lbl">This Week</p>
          </div>
        </div>
        <div className="card hs-card">
          <div className="hs-icon weekly">🎯</div>
          <div>
            <p className="hs-val">{summary.today?.count || 0}</p>
            <p className="hs-lbl">Today</p>
          </div>
        </div>
      </div>

      {/* Delivery log — route + date only */}
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
            <p>Completed deliveries will appear here once you start delivering.</p>
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
