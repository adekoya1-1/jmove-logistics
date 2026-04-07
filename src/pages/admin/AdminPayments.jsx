import { useState, useEffect, useCallback } from 'react';
import { paymentsAPI } from '../../api/client.js';
import { format } from 'date-fns';
import './AdminPayments.css';

const fmt = n => Number(n || 0).toLocaleString('en-NG');

const BADGE = {
  paid:     'badge-paid',
  pending:  'badge-pending',
  failed:   'badge-failed',
  refunded: 'badge-assigned',
};

const STATUS_OPTS = [
  { value: '',         label: 'All Statuses' },
  { value: 'paid',     label: '✓ Paid'       },
  { value: 'pending',  label: '⏳ Pending'    },
  { value: 'failed',   label: '✕ Failed'     },
  { value: 'refunded', label: '↩ Refunded'   },
];

// ── CSV Export ─────────────────────────────────────────────────────────────
const exportCSV = (payments) => {
  const headers = ['Reference', 'Customer', 'Email', 'Order', 'Route', 'Amount (NGN)', 'Method', 'Status', 'Date'];
  const rows = payments.map(p => [
    p.paystackReference || '',
    `${p.customerId?.firstName || ''} ${p.customerId?.lastName || ''}`.trim(),
    p.customerId?.email || '',
    p.orderId?.waybillNumber || '',
    p.orderId?.originCity && p.orderId?.destinationCity
      ? `${p.orderId.originCity} → ${p.orderId.destinationCity}` : '',
    p.amount,
    p.orderId?.paymentMethod || '',
    p.status,
    p.paidAt ? format(new Date(p.paidAt), 'yyyy-MM-dd HH:mm') : format(new Date(p.createdAt), 'yyyy-MM-dd'),
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `payments-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ── Main ──────────────────────────────────────────────────────────────────
export default function AdminPayments() {
  const [payments, setPayments] = useState([]);
  const [stats,    setStats]    = useState(null);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [status,   setStatus]   = useState('');
  const [from,     setFrom]     = useState('');
  const [to,       setTo]       = useState('');

  const LIMIT = 25;

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, limit: LIMIT };
    if (status) params.status = status;
    if (from)   params.from   = from;
    if (to)     params.to     = to;

    Promise.all([
      paymentsAPI.history(params),
      page === 1 ? paymentsAPI.stats('30d') : Promise.resolve(null),
    ])
      .then(([r, s]) => {
        setPayments(r.data || []);
        setTotal(r.pagination?.total || (r.data || []).length);
        if (s) setStats(s.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, status, from, to]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = { page: 1, limit: 1000 };
      if (status) params.status = status;
      if (from)   params.from   = from;
      if (to)     params.to     = to;
      const r = await paymentsAPI.history(params);
      exportCSV(r.data || []);
    } catch (e) { alert('Export failed: ' + (e?.response?.data?.message || e.message)); }
    finally { setExporting(false); }
  };

  const clearFilters = () => { setStatus(''); setFrom(''); setTo(''); setPage(1); };
  const hasFilters   = status || from || to;

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="admin-payments">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">All transaction records with real-time Paystack data</p>
        </div>
        <button
          className="btn-secondary pay-export-btn"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting
            ? <><span className="spinner spinner-sm" /> Exporting…</>
            : '↓ Export CSV'}
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="pay-stats">
          <div className="pay-stat-card card">
            <p className="psc-icon">💰</p>
            <div>
              <p className="psc-val" style={{ color: 'var(--green)' }}>₦{fmt(stats.summary?.totalRevenue)}</p>
              <p className="psc-lbl">Revenue (period)</p>
            </div>
          </div>
          <div className="pay-stat-card card">
            <p className="psc-icon">✅</p>
            <div>
              <p className="psc-val">{fmt(stats.summary?.successfulPayments)}</p>
              <p className="psc-lbl">Successful</p>
            </div>
          </div>
          <div className="pay-stat-card card">
            <p className="psc-icon">✕</p>
            <div>
              <p className="psc-val" style={{ color: 'var(--red)' }}>{fmt(stats.summary?.failedPayments)}</p>
              <p className="psc-lbl">Failed</p>
            </div>
          </div>
          <div className="pay-stat-card card">
            <p className="psc-icon">⌀</p>
            <div>
              <p className="psc-val">₦{fmt(Math.round(stats.summary?.avgPayment || 0))}</p>
              <p className="psc-lbl">Avg. Transaction</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="pay-filters">
        <div className="status-filters">
          {STATUS_OPTS.map(s => (
            <button key={s.value}
              className={`filter-btn ${status === s.value ? 'active' : ''}`}
              onClick={() => { setStatus(s.value); setPage(1); }}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="pay-date-filters">
          <div className="pay-date-group">
            <label className="pay-date-label">From</label>
            <input className="input pay-date-input" type="date" value={from}
              onChange={e => { setFrom(e.target.value); setPage(1); }} />
          </div>
          <div className="pay-date-group">
            <label className="pay-date-label">To</label>
            <input className="input pay-date-input" type="date" value={to}
              onChange={e => { setTo(e.target.value); setPage(1); }} />
          </div>
          {hasFilters && (
            <button className="btn-ghost pay-clear-btn" onClick={clearFilters}>
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div style={{ padding: 16 }}>
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="shimmer" style={{ height: 52, margin: '4px 0', borderRadius: 8 }} />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💳</div>
            <h3>No payments found</h3>
            {hasFilters && <button className="btn-ghost" onClick={clearFilters}>Clear filters</button>}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Customer</th>
                  <th>Order / Route</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p._id}>
                    <td>
                      <span className="pay-ref">{p.paystackReference || '—'}</span>
                    </td>
                    <td>
                      <p className="pay-customer">{p.customerId?.firstName} {p.customerId?.lastName}</p>
                      <p className="pay-customer-email">{p.customerId?.email}</p>
                    </td>
                    <td>
                      <p className="pay-waybill">{p.orderId?.waybillNumber}</p>
                      {p.orderId?.originCity && (
                        <p className="pay-route">{p.orderId.originCity} → {p.orderId.destinationCity}</p>
                      )}
                    </td>
                    <td>
                      <span className="pay-amount">₦{fmt(p.amount)}</span>
                    </td>
                    <td>
                      <span className="pay-method">
                        {p.orderId?.paymentMethod
                          ? p.orderId.paymentMethod.toUpperCase()
                          : 'ONLINE'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${BADGE[p.status] || 'badge-pending'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="pay-date">
                      {p.paidAt
                        ? format(new Date(p.paidAt), 'MMM d, yyyy HH:mm')
                        : format(new Date(p.createdAt), 'MMM d, yyyy')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && pages > 1 && (
          <div className="pagination">
            <span>
              Showing {Math.min((page - 1) * LIMIT + 1, total)}–{Math.min(page * LIMIT, total)} of {total}
            </span>
            <div className="page-btns">
              <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 13 }}
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </button>
              <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 13 }}
                onClick={() => setPage(p => p + 1)} disabled={page >= pages}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
