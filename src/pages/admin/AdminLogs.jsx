import { useState, useEffect, useCallback } from 'react';
import { logsAPI } from '../../api/client.js';
import { format, formatDistanceToNow } from 'date-fns';
import './AdminLogs.css';

const SEVERITY_BADGE = {
  info:     'log-sev-info',
  warning:  'log-sev-warning',
  critical: 'log-sev-critical',
};

const SEVERITY_ICONS = {
  info:     'ℹ',
  warning:  '⚠',
  critical: '🚨',
};

const ACTION_ICONS = {
  'order.':    '📦',
  'staff.':    '👥',
  'user.':     '👤',
  'driver.':   '🚗',
  'fleet.':    '🚛',
  'settings.': '⚙️',
  'auth.':     '🔐',
  'payment.':  '💳',
};

const getActionIcon = action => {
  for (const [prefix, icon] of Object.entries(ACTION_ICONS)) {
    if (action?.startsWith(prefix)) return icon;
  }
  return '📋';
};

const formatAction = str => str?.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || str;

// ── Log Detail Modal ────────────────────────────────────────────────────────
function LogDetail({ log, onClose }) {
  if (!log) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box log-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Log Entry Detail</h2>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="log-detail-grid">
            <div className="ld-row"><span className="ld-label">Timestamp</span><span className="ld-val">{format(new Date(log.createdAt), 'MMM d, yyyy HH:mm:ss')}</span></div>
            <div className="ld-row"><span className="ld-label">Action</span><span className="ld-val ld-action">{log.action}</span></div>
            <div className="ld-row"><span className="ld-label">Severity</span>
              <span className={`log-sev-badge ${SEVERITY_BADGE[log.severity]}`}>
                {SEVERITY_ICONS[log.severity]} {log.severity}
              </span>
            </div>
            {log.entity && <div className="ld-row"><span className="ld-label">Entity</span><span className="ld-val">{log.entity}</span></div>}
            {log.entityId && <div className="ld-row"><span className="ld-label">Entity ID</span><span className="ld-val ld-mono">{log.entityId}</span></div>}
            {log.userId && (
              <div className="ld-row">
                <span className="ld-label">Performed By</span>
                <span className="ld-val">{log.userId?.firstName} {log.userId?.lastName} ({log.userId?.email})</span>
              </div>
            )}
            {log.ip && <div className="ld-row"><span className="ld-label">IP Address</span><span className="ld-val ld-mono">{log.ip}</span></div>}
          </div>
          {log.details && Object.keys(log.details).length > 0 && (
            <div className="ld-details">
              <p className="ld-details-title">Change Details</p>
              <pre className="ld-details-pre">{JSON.stringify(log.details, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function AdminLogs() {
  const [logs,     setLogs]     = useState([]);
  const [stats,    setStats]    = useState(null);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);

  // Filters
  const [severity, setSeverity] = useState('');
  const [entity,   setEntity]   = useState('');
  const [from,     setFrom]     = useState('');
  const [to,       setTo]       = useState('');

  const LIMIT = 30;

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, limit: LIMIT };
    if (severity) params.severity = severity;
    if (entity)   params.entity   = entity;
    if (from)     params.from     = from;
    if (to)       params.to       = to;

    Promise.all([logsAPI.list(params), page === 1 ? logsAPI.stats() : Promise.resolve(null)])
      .then(([r, s]) => {
        setLogs(r.data?.logs || []);
        setTotal(r.data?.pagination?.total || 0);
        if (s) setStats(s.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, severity, entity, from, to]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.ceil(total / LIMIT);

  const ENTITIES = ['Order','User','Driver','Vehicle','SystemSetting','Payment'];

  return (
    <div className="admin-logs">
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Logs</h1>
          <p className="page-subtitle">Immutable record of all admin actions and system events</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="log-stats">
          <div className="log-stat-card card">
            <p className="lsc-val">{stats.total?.toLocaleString()}</p>
            <p className="lsc-lbl">Total Events</p>
          </div>
          <div className="log-stat-card card">
            <p className="lsc-val">{stats.last24h}</p>
            <p className="lsc-lbl">Last 24 Hours</p>
          </div>
          <div className="log-stat-card card">
            <p className="lsc-val">{stats.last7d}</p>
            <p className="lsc-lbl">Last 7 Days</p>
          </div>
          <div className="log-stat-card card log-stat--warn">
            <p className="lsc-val">{stats.bySeverity?.warning || 0}</p>
            <p className="lsc-lbl">Warnings</p>
          </div>
          <div className="log-stat-card card log-stat--crit">
            <p className="lsc-val">{stats.bySeverity?.critical || 0}</p>
            <p className="lsc-lbl">Critical</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="log-filters card">
        <div className="log-filter-group">
          <label className="log-filter-label">Severity</label>
          <div className="status-filters">
            {[['','All'],['info','Info'],['warning','Warning'],['critical','Critical']].map(([v,l]) => (
              <button key={v} className={`filter-btn ${severity === v ? 'active' : ''}`}
                onClick={() => { setSeverity(v); setPage(1); }}>
                {v && SEVERITY_ICONS[v]} {l}
              </button>
            ))}
          </div>
        </div>
        <div className="log-filter-group">
          <label className="log-filter-label">Entity Type</label>
          <select className="input log-select"
            value={entity} onChange={e => { setEntity(e.target.value); setPage(1); }}>
            <option value="">All Entities</option>
            {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div className="log-filter-group">
          <label className="log-filter-label">Date Range</label>
          <div className="log-date-range">
            <input className="input log-date-input" type="date" value={from}
              onChange={e => { setFrom(e.target.value); setPage(1); }} />
            <span className="log-date-sep">to</span>
            <input className="input log-date-input" type="date" value={to}
              onChange={e => { setTo(e.target.value); setPage(1); }} />
          </div>
        </div>
        {(severity || entity || from || to) && (
          <button className="btn-ghost log-clear-btn"
            onClick={() => { setSeverity(''); setEntity(''); setFrom(''); setTo(''); setPage(1); }}>
            ✕ Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div style={{ padding: 16 }}>
            {Array(6).fill(0).map((_, i) => <div key={i} className="shimmer" style={{ height: 52, borderRadius: 8, marginBottom: 8 }} />)}
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>No log entries</h3>
            <p>Audit logs appear here as admin actions are performed</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="log-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th>Action</th>
                  <th>Performed By</th>
                  <th>Entity</th>
                  <th>Severity</th>
                  <th>IP</th>
                  <th>Time</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l._id} className={`log-row log-row--${l.severity}`}>
                    <td className="log-action-icon">{getActionIcon(l.action)}</td>
                    <td>
                      <p className="log-action-text">{formatAction(l.action)}</p>
                    </td>
                    <td>
                      <p className="log-user">{l.userId?.firstName} {l.userId?.lastName}</p>
                      <p className="log-user-email">{l.userId?.email}</p>
                    </td>
                    <td>
                      {l.entity && (
                        <div>
                          <p className="log-entity">{l.entity}</p>
                          {l.entityId && <p className="log-entity-id">{String(l.entityId).slice(-8)}</p>}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`log-sev-badge ${SEVERITY_BADGE[l.severity]}`}>
                        {SEVERITY_ICONS[l.severity]} {l.severity}
                      </span>
                    </td>
                    <td className="log-ip">{l.ip || '—'}</td>
                    <td className="log-time">
                      <p>{format(new Date(l.createdAt), 'MMM d, HH:mm')}</p>
                      <p className="log-time-rel">{formatDistanceToNow(new Date(l.createdAt), { addSuffix: true })}</p>
                    </td>
                    <td>
                      <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }}
                        onClick={() => setSelected(l)}>
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && pages > 1 && (
          <div className="pagination">
            <span>Showing {Math.min((page - 1) * LIMIT + 1, total)}–{Math.min(page * LIMIT, total)} of {total}</span>
            <div className="page-btns">
              <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 13 }}
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</button>
              <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 13 }}
                onClick={() => setPage(p => p + 1)} disabled={page >= pages}>Next</button>
            </div>
          </div>
        )}
      </div>

      <LogDetail log={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
