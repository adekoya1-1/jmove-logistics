import { useState, useEffect, useCallback } from 'react';
import { usersAPI, ordersAPI, corporateAPI } from '../../api/client.js';
import { format, formatDistanceToNow } from 'date-fns';
import './AdminCustomers.css';

const fmt = n => Number(n || 0).toLocaleString('en-NG');

const STATUS_BADGE = {
  booked: 'badge-pending', assigned: 'badge-assigned', picked_up: 'badge-picked_up',
  in_transit: 'badge-in_transit', delivered: 'badge-delivered',
  cancelled: 'badge-cancelled', returned: 'badge-cancelled',
};

// ── Corporate Account Modal ──────────────────────────────────────────────────
function CorporateAccountModal({ account, onClose, onSaved }) {
  const [form, setForm] = useState({
    companyName: account?.companyName || '',
    contactPersonName: account?.contactPersonName || '',
    contactPhone: account?.contactPhone || '',
    contactEmail: account?.contactEmail || '',
    address: account?.address || '',
    industry: account?.industry || '',
    notes: account?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async e => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      if (account?._id) {
        await corporateAPI.update(account._id, form);
      } else {
        await corporateAPI.create(form);
      }
      onSaved();
      onClose();
    } catch (ex) {
      setErr(ex?.response?.data?.message || 'Failed to save corporate account');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <h2>{account?._id ? 'Edit Corporate Account' : 'New Corporate Account'}</h2>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={submit} className="modal-body">
          {err && <div className="banner error" style={{ marginBottom: 12 }}>{err}</div>}
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label className="label">Company Name *</label>
              <input className="input" required value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="label">Contact Person *</label>
                <input className="input" required value={form.contactPersonName} onChange={e => setForm({ ...form, contactPersonName: e.target.value })} />
              </div>
              <div>
                <label className="label">Contact Phone *</label>
                <input className="input" required value={form.contactPhone} onChange={e => setForm({ ...form, contactPhone: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="label">Contact Email</label>
                <input className="input" type="email" value={form.contactEmail} onChange={e => setForm({ ...form, contactEmail: e.target.value })} />
              </div>
              <div>
                <label className="label">Industry</label>
                <input className="input" value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} placeholder="e.g. FMCG, Logistics" />
              </div>
            </div>
            <div>
              <label className="label">Office Address</label>
              <input className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input" rows="2" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <span className="spinner spinner-sm" /> : (account?._id ? 'Save Changes' : 'Create Account')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
  const [activeTab, setActiveTab] = useState('individual'); // 'individual' | 'corporate'
  const [customers, setCustomers] = useState([]);
  const [corpAccounts, setCorpAccounts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');   // '' | 'active' | 'inactive'
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [toggling, setToggling] = useState('');
  const [corpModal, setCorpModal] = useState(null); // null | {} (for new) | corpObj (for edit)

  const LIMIT = 20;

  const load = useCallback(() => {
    setLoading(true);
    if (activeTab === 'individual') {
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
    } else {
      corporateAPI.list({ search, page, limit: LIMIT })
        .then(r => {
          const all = r.data?.accounts || [];
          const fil = filter === 'active'   ? all.filter(c =>  c.isActive)
                    : filter === 'inactive' ? all.filter(c => !c.isActive)
                    : all;
          setCorpAccounts(fil);
          setTotal(r.data?.pagination?.total || 0);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [activeTab, search, page, filter]);

  useEffect(() => { load(); }, [load]);

  const handleToggleIndividual = async id => {
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

  const handleToggleCorporate = async corp => {
    setToggling(corp._id);
    try {
      if (corp.isActive) {
        await corporateAPI.remove(corp._id);
      } else {
        await corporateAPI.update(corp._id, { isActive: true });
      }
      load();
    } catch (e) { alert(e?.response?.data?.message || 'Failed to update status'); }
    finally { setToggling(''); }
  };

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="admin-customers">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers & Corporate Accounts</h1>
          <p className="page-subtitle">Manage individual customers and corporate clients</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {activeTab === 'corporate' && (
            <button className="btn-primary" onClick={() => setCorpModal({})}>
              + Add Corporate Account
            </button>
          )}
          <div className="cust-header-stat">
            <p className="chs-val">{total}</p>
            <p className="chs-lbl">{activeTab === 'individual' ? 'Registered' : 'Accounts'}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="cust-tabs" style={{ display: 'flex', gap: 12, borderBottom: '1.5px solid var(--border)', marginBottom: 16 }}>
        <button
          className={`tab-btn ${activeTab === 'individual' ? 'active' : ''}`}
          onClick={() => { setActiveTab('individual'); setPage(1); setSearch(''); setFilter(''); }}
          style={{
            padding: '10px 16px', fontWeight: 700, fontSize: 14, background: 'none', border: 'none',
            borderBottom: activeTab === 'individual' ? '2.5px solid var(--brand)' : '2.5px solid transparent',
            color: activeTab === 'individual' ? 'var(--brand)' : 'var(--text-muted)', cursor: 'pointer'
          }}
        >
          👤 Individual Customers
        </button>
        <button
          className={`tab-btn ${activeTab === 'corporate' ? 'active' : ''}`}
          onClick={() => { setActiveTab('corporate'); setPage(1); setSearch(''); setFilter(''); }}
          style={{
            padding: '10px 16px', fontWeight: 700, fontSize: 14, background: 'none', border: 'none',
            borderBottom: activeTab === 'corporate' ? '2.5px solid var(--brand)' : '2.5px solid transparent',
            color: activeTab === 'corporate' ? 'var(--brand)' : 'var(--text-muted)', cursor: 'pointer'
          }}
        >
          🏢 Corporate Accounts
        </button>
      </div>

      {/* Toolbar */}
      <div className="cust-toolbar">
        <div className="search-wrap">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--text-faint)" strokeWidth="1.5">
            <circle cx="6" cy="6" r="4.5"/><path d="M9.5 9.5L13 13" strokeLinecap="round"/>
          </svg>
          <input
            className="input"
            placeholder={activeTab === 'individual' ? "Search by name, email, or phone…" : "Search company, contact person, or phone…"}
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
        ) : activeTab === 'individual' ? (
          customers.length === 0 ? (
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
                            onClick={() => handleToggleIndividual(c._id)}
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
          )
        ) : (
          corpAccounts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🏢</div>
              <h3>No corporate accounts found</h3>
              <p>Try adjusting your search or create a new corporate account</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Company Name</th>
                    <th>Contact Person</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Industry</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {corpAccounts.map(corp => (
                    <tr key={corp._id} className="cust-row">
                      <td>
                        <div className="cust-cell" onClick={() => setCorpModal(corp)}>
                          <div className="cust-avatar" style={{ background: 'var(--brand-dim)', color: 'var(--brand)' }}>
                            🏢
                          </div>
                          <div>
                            <p className="cust-name">{corp.companyName}</p>
                            {corp.address && <p className="cust-email">📍 {corp.address}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="td-sub" style={{ fontWeight: 600, color: 'var(--text)' }}>{corp.contactPersonName}</td>
                      <td className="td-sub">{corp.contactPhone}</td>
                      <td className="td-sub">{corp.contactEmail || '—'}</td>
                      <td className="td-sub" style={{ textTransform: 'capitalize' }}>{corp.industry || '—'}</td>
                      <td>
                        <span className={`badge ${corp.isActive ? 'badge-delivered' : 'badge-cancelled'}`}>
                          {corp.isActive ? '● Active' : '● Deactivated'}
                        </span>
                      </td>
                      <td>
                        <div className="td-actions">
                          <button
                            className="assign-btn"
                            onClick={() => setCorpModal(corp)}
                          >
                            Edit
                          </button>
                          <button
                            className={`btn-ghost cust-toggle ${corp.isActive ? 'red' : 'green'}`}
                            onClick={() => handleToggleCorporate(corp)}
                            disabled={toggling === corp._id}
                          >
                            {toggling === corp._id
                              ? <span className="spinner spinner-sm" />
                              : corp.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
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

      {/* Customer Drawer (Individual) */}
      <CustomerDrawer
        customer={selected}
        onClose={() => setSelected(null)}
        onToggle={handleToggleIndividual}
        toggling={toggling}
      />

      {/* Corporate Account Modal */}
      {corpModal !== null && (
        <CorporateAccountModal
          account={corpModal._id ? corpModal : null}
          onClose={() => setCorpModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
