import { useState, useEffect, useCallback } from 'react';
import { usersAPI, ordersAPI } from '../../api/client.js';
import { format, formatDistanceToNow } from 'date-fns';
import './AdminCustomers.css';

const fmt = n => Number(n || 0).toLocaleString('en-NG');

const STATUS_BADGE = {
  booked: 'badge-pending', assigned: 'badge-assigned', picked_up: 'badge-picked_up',
  in_transit: 'badge-in_transit', delivered: 'badge-delivered',
  cancelled: 'badge-cancelled', returned: 'badge-cancelled',
};

// ── Customer Detail Drawer ──────────────────────────────────────────────────
function CustomerDrawer({ customer, onClose, onToggle, toggling }) {
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customer) return;
    setLoading(true);
    ordersAPI.list({ customerId: customer._id, limit: 10 })
      .then(r => setOrders(r.data?.orders || []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [customer?._id]);

  if (!customer) return null;

  const totalSpend = orders
    .filter(o => o.paymentStatus === 'paid')
    .reduce((s, o) => s + (o.totalAmount || 0), 0);

  const deliveries = orders.filter(o => o.status === 'delivered').length;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="customer-drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-avatar">
            {customer.firstName?.[0]}{customer.lastName?.[0]}
          </div>
          <div className="drawer-title-wrap">
            <h3 className="drawer-name">{customer.firstName} {customer.lastName}</h3>
            <p className="drawer-email">{customer.email}</p>
          </div>
          <button className="btn-ghost drawer-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13"/>
            </svg>
          </button>
        </div>

        <div className="drawer-stats">
          <div className="drawer-stat">
            <p className="ds-val">₦{fmt(totalSpend)}</p>
            <p className="ds-lbl">Total Spend</p>
          </div>
          <div className="drawer-stat">
            <p className="ds-val">{orders.length}</p>
            <p className="ds-lbl">Orders</p>
          </div>
          <div className="drawer-stat">
            <p className="ds-val">{deliveries}</p>
            <p className="ds-lbl">Delivered</p>
          </div>
        </div>

        <div className="drawer-info">
          {customer.phone && (
            <div className="di-row">
              <span className="di-label">Phone</span>
              <span className="di-val">{customer.phone}</span>
            </div>
          )}
          <div className="di-row">
            <span className="di-label">Joined</span>
            <span className="di-val">{format(new Date(customer.createdAt), 'MMM d, yyyy')}</span>
          </div>
          <div className="di-row">
            <span className="di-label">Last Login</span>
            <span className="di-val">
              {customer.lastLogin
                ? formatDistanceToNow(new Date(customer.lastLogin), { addSuffix: true })
                : 'Never'}
            </span>
          </div>
          <div className="di-row">
            <span className="di-label">Status</span>
            <span className={`badge ${customer.isActive ? 'badge-delivered' : 'badge-cancelled'}`}>
              {customer.isActive ? 'Active' : 'Suspended'}
            </span>
          </div>
        </div>

        <div className="drawer-section">
          <p className="drawer-section-title">Recent Orders</p>
          {loading ? (
            <div className="drawer-loading">
              {[1,2,3].map(i => <div key={i} className="shimmer" style={{ height: 52, borderRadius: 8, marginBottom: 6 }} />)}
            </div>
          ) : orders.length === 0 ? (
            <p className="drawer-empty">No orders yet</p>
          ) : (
            <div className="drawer-orders">
              {orders.map(o => (
                <div key={o._id} className="drawer-order-item">
                  <div className="doi-left">
                    <p className="doi-waybill">{o.waybillNumber}</p>
                    <p className="doi-route">{o.originCity} → {o.destinationCity}</p>
                    <p className="doi-date">{format(new Date(o.createdAt), 'MMM d, yyyy')}</p>
                  </div>
                  <div className="doi-right">
                    <span className={`badge ${STATUS_BADGE[o.status] || 'badge-pending'}`}>
                      {o.status?.replace('_', ' ')}
                    </span>
                    <p className="doi-amount">₦{fmt(o.totalAmount)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="drawer-actions">
          <button
            className={`btn-secondary drawer-toggle-btn ${!customer.isActive ? 'activate' : 'deactivate'}`}
            onClick={() => onToggle(customer._id)}
            disabled={toggling === customer._id}
          >
            {toggling === customer._id
              ? <span className="spinner spinner-sm" />
              : customer.isActive ? '⛔ Suspend Account' : '✅ Activate Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [search,    setSearch]    = useState('');
  const [filter,    setFilter]    = useState('');   // '' | 'active' | 'inactive'
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState(null);
  const [toggling,  setToggling]  = useState('');

  const LIMIT = 20;

  const load = useCallback(() => {
    setLoading(true);
    usersAPI.list({ role: 'customer', search, page, limit: LIMIT })
      .then(r => {
        const all = r.data?.users || [];
        const fil = filter === 'active'   ? all.filter(u =>  u.isActive)
                  : filter === 'inactive' ? all.filter(u => !u.isActive)
                  : all;
        setCustomers(fil);
        setTotal(r.data?.pagination?.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, page, filter]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async id => {
    setToggling(id);
    try {
      await usersAPI.toggleStatus(id);
      load();
      if (selected?._id === id) {
        setSelected(prev => ({ ...prev, isActive: !prev.isActive }));
      }
    } catch (e) { alert(e?.response?.data?.message || 'Failed to update status'); }
    finally { setToggling(''); }
  };

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="admin-customers">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">All registered customer accounts</p>
        </div>
        <div className="cust-header-stat">
          <p className="chs-val">{total}</p>
          <p className="chs-lbl">Registered</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="cust-toolbar">
        <div className="search-wrap">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--text-faint)" strokeWidth="1.5">
            <circle cx="6" cy="6" r="4.5"/><path d="M9.5 9.5L13 13" strokeLinecap="round"/>
          </svg>
          <input
            className="input"
            placeholder="Search by name, email, or phone…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="status-filters">
          {[['', 'All'], ['active', 'Active'], ['inactive', 'Suspended']].map(([v, l]) => (
            <button
              key={v}
              className={`filter-btn ${filter === v ? 'active' : ''}`}
              onClick={() => { setFilter(v); setPage(1); }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div style={{ padding: 16 }}>
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="shimmer" style={{ height: 56, borderRadius: 8, marginBottom: 8 }} />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <h3>No customers found</h3>
            <p>Try adjusting your search or filter</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Last Login</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c._id} className="cust-row">
                    <td>
                      <div className="cust-cell" onClick={() => setSelected(c)}>
                        <div className="cust-avatar">
                          {c.firstName?.[0]}{c.lastName?.[0]}
                        </div>
                        <div>
                          <p className="cust-name">{c.firstName} {c.lastName}</p>
                          <p className="cust-email">{c.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="td-sub">{c.phone || '—'}</td>
                    <td>
                      <span className={`badge ${c.isActive ? 'badge-delivered' : 'badge-cancelled'}`}>
                        {c.isActive ? '● Active' : '● Suspended'}
                      </span>
                    </td>
                    <td className="td-sub">{format(new Date(c.createdAt), 'MMM d, yyyy')}</td>
                    <td className="td-sub">
                      {c.lastLogin
                        ? formatDistanceToNow(new Date(c.lastLogin), { addSuffix: true })
                        : 'Never'}
                    </td>
                    <td>
                      <div className="td-actions">
                        <button
                          className="assign-btn"
                          onClick={() => setSelected(c)}
                        >
                          View
                        </button>
                        <button
                          className={`btn-ghost cust-toggle ${c.isActive ? 'red' : 'green'}`}
                          onClick={() => handleToggle(c._id)}
                          disabled={toggling === c._id}
                        >
                          {toggling === c._id
                            ? <span className="spinner spinner-sm" />
                            : c.isActive ? 'Suspend' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && pages > 1 && (
          <div className="pagination">
            <span>
              Showing {Math.min((page - 1) * LIMIT + 1, total)}–{Math.min(page * LIMIT, total)} of {total}
            </span>
            <div className="page-btns">
              <button
                className="btn-secondary"
                style={{ padding: '6px 14px', fontSize: 13 }}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </button>
              <button
                className="btn-secondary"
                style={{ padding: '6px 14px', fontSize: 13 }}
                onClick={() => setPage(p => p + 1)}
                disabled={page >= pages}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Drawer */}
      <CustomerDrawer
        customer={selected}
        onClose={() => setSelected(null)}
        onToggle={handleToggle}
        toggling={toggling}
      />
    </div>
  );
}
