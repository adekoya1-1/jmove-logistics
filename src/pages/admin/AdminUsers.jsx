import { useState, useEffect } from 'react';
import { usersAPI } from '../../api/client.js';
import { format } from 'date-fns';
import './AdminUsers.css';

/* ─── Config ─────────────────────────────────────────────────────────────── */
const CATEGORIES = [
  { value: 'super_admin', label: 'Super Admin',        color: '#B91C1C', bg: '#FEF2F2' },
  { value: 'operations',  label: 'Operations Manager', color: '#1D4ED8', bg: '#EFF6FF' },
  { value: 'dispatch',    label: 'Dispatch Officer',   color: '#7C3AED', bg: '#F5F3FF' },
  { value: 'finance',     label: 'Finance Officer',    color: '#047857', bg: '#ECFDF5' },
  { value: 'support',     label: 'Customer Support',   color: '#B45309', bg: '#FFFBEB' },
  { value: 'supervisor',  label: 'Field Supervisor',   color: '#0369A1', bg: '#F0F9FF' },
];

const PERMISSIONS = [
  { value: 'orders',    label: 'Orders',    icon: '📦', desc: 'View and manage all orders' },
  { value: 'drivers',   label: 'Drivers',   icon: '🚗', desc: 'Manage driver accounts' },
  { value: 'payments',  label: 'Payments',  icon: '💳', desc: 'View payments and reports' },
  { value: 'analytics', label: 'Analytics', icon: '📊', desc: 'Access analytics dashboard' },
  { value: 'map',       label: 'Live Map',  icon: '🗺️', desc: 'Real-time driver tracking' },
  { value: 'staff',     label: 'Staff',     icon: '👥', desc: 'Manage staff accounts' },
];

const CATEGORY_DEFAULTS = {
  super_admin: ['orders','drivers','payments','analytics','map','staff'],
  operations:  ['orders','drivers','map'],
  dispatch:    ['orders','drivers','map'],
  finance:     ['payments','analytics'],
  support:     ['orders'],
  supervisor:  ['orders','drivers','map','analytics'],
};

const catOf = (v) => CATEGORIES.find(c => c.value === v) || { label: v, color: '#6B7280', bg: '#F3F4F6' };
const permOf = (v) => PERMISSIONS.find(p => p.value === v);

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function AdminUsers() {
  const [staff,    setStaff]    = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [search,   setSearch]   = useState('');
  const [loading,  setLoading]  = useState(true);
  const [toggling, setToggling] = useState('');

  /* Create modal */
  const [showCreate, setShowCreate] = useState(false);
  const [creating,   setCreating]   = useState(false);
  const [formErr,    setFormErr]    = useState('');
  const [form, setForm] = useState({
    firstName:'', lastName:'', email:'', phone:'',
    password:'', staffCategory:'', permissions:[],
  });

  /* Edit modal */
  const [editTarget, setEditTarget] = useState(null);
  const [editCat,    setEditCat]    = useState('');
  const [editPerms,  setEditPerms]  = useState([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = () => {
    setLoading(true);
    usersAPI.staff({ search, page, limit: 20 })
      .then(r => { setStaff(r.data.users); setTotal(r.data.pagination.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, page]);

  /* Toggle active */
  const toggle = async (id) => {
    setToggling(id);
    try { await usersAPI.toggleStatus(id); load(); }
    catch (e) { alert(e?.response?.data?.message || 'Failed'); }
    finally { setToggling(''); }
  };

  /* Create helpers */
  const handleCatChange = (cat) =>
    setForm(f => ({ ...f, staffCategory: cat, permissions: CATEGORY_DEFAULTS[cat] || [] }));

  const toggleFormPerm = (p) =>
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(p) ? f.permissions.filter(x => x !== p) : [...f.permissions, p],
    }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormErr('');
    if (!form.staffCategory) { setFormErr('Please select a staff category.'); return; }
    setCreating(true);
    try {
      await usersAPI.createStaff(form);
      setShowCreate(false);
      setForm({ firstName:'', lastName:'', email:'', phone:'', password:'', staffCategory:'', permissions:[] });
      load();
    } catch (err) {
      setFormErr(err?.response?.data?.message || 'Failed to create staff account');
    } finally { setCreating(false); }
  };

  /* Edit helpers */
  const openEdit = (u) => {
    setEditTarget(u);
    setEditCat(u.staffCategory || '');
    setEditPerms(u.permissions || []);
  };
  const handleEditCat = (cat) => { setEditCat(cat); setEditPerms(CATEGORY_DEFAULTS[cat] || []); };
  const toggleEditPerm = (p) =>
    setEditPerms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const saveEdit = async () => {
    setSavingEdit(true);
    try {
      await usersAPI.updatePermissions(editTarget._id, { permissions: editPerms, staffCategory: editCat });
      setEditTarget(null);
      load();
    } catch (e) {
      alert(e?.response?.data?.message || 'Failed to update');
    } finally { setSavingEdit(false); }
  };

  /* Derived counts */
  const activeCount   = staff.filter(s => s.isActive).length;
  const superCount    = staff.filter(s => s.staffCategory === 'super_admin').length;
  const pages = Math.ceil(total / 20);

  /* ─── Category / permission sub-form (shared by create + edit) ─── */
  const PermForm = ({ cat, perms, onCatChange, onPermToggle }) => {
    const isSuperAdmin = cat === 'super_admin';
    return (
      <>
        {/* Category */}
        <div>
          <p className="staff-field-label">Staff Category *</p>
          <div className="category-grid">
            {CATEGORIES.map(c => (
              <button type="button" key={c.value}
                className={`cat-btn ${cat === c.value ? 'selected' : ''}`}
                style={cat === c.value ? { background: c.bg, borderColor: c.color, color: c.color } : {}}
                onClick={() => onCatChange(c.value)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Permissions */}
        <div>
          <div className="perm-section-header">
            <p className="staff-field-label" style={{ marginBottom: 0 }}>Panel Access</p>
            {isSuperAdmin && <span className="perm-all-badge">✦ Full Access</span>}
          </div>
          <div className="perm-grid">
            {PERMISSIONS.map(p => {
              const checked = isSuperAdmin || perms.includes(p.value);
              return (
                <label key={p.value}
                  className={`perm-item ${checked ? 'checked' : ''} ${isSuperAdmin ? 'locked' : ''}`}>
                  <input type="checkbox" checked={checked} disabled={isSuperAdmin}
                    onChange={() => onPermToggle(p.value)} />
                  <span className="perm-icon">{p.icon}</span>
                  <div className="perm-text">
                    <p className="perm-label">{p.label}</p>
                    <p className="perm-desc">{p.desc}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </>
    );
  };

  /* ─── Render ──────────────────────────────────────────────────── */
  return (
    <div className="admin-users">

      {/* ══ Create Staff Modal ══════════════════════════════════════ */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-box staff-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Staff Member</h2>
              <button className="btn-ghost" style={{ padding:'6px 8px' }} onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form className="staff-modal-body" onSubmit={handleCreate}>

              {formErr && <div className="staff-form-err">⚠ {formErr}</div>}

              <div className="staff-form-row">
                <div className="field">
                  <label className="label">First Name *</label>
                  <input className="input" required placeholder="e.g. Adaeze"
                    value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="label">Last Name *</label>
                  <input className="input" required placeholder="e.g. Okonkwo"
                    value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
                </div>
              </div>

              <div className="field">
                <label className="label">Email Address *</label>
                <input className="input" type="email" required placeholder="staff@jmove.ng"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>

              <div className="staff-form-row">
                <div className="field">
                  <label className="label">Phone Number</label>
                  <input className="input" placeholder="08012345678"
                    value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="label">Password *</label>
                  <input className="input" type="password" required minLength={8}
                    placeholder="Min. 8 characters"
                    value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                </div>
              </div>

              <PermForm
                cat={form.staffCategory}
                perms={form.permissions}
                onCatChange={handleCatChange}
                onPermToggle={toggleFormPerm}
              />

              <button type="submit" className="btn-primary staff-submit-btn" disabled={creating}>
                {creating
                  ? <span className="spinner spinner-sm" style={{ borderTopColor:'#fff' }} />
                  : '+ Create Staff Account'
                }
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ══ Edit Permissions Modal ══════════════════════════════════ */}
      {editTarget && (
        <div className="modal-overlay" onClick={() => setEditTarget(null)}>
          <div className="modal-box staff-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Edit Access</h2>
                <p style={{ fontSize:12, color:'var(--text-faint)', marginTop:2 }}>
                  {editTarget.firstName} {editTarget.lastName} · {editTarget.email}
                </p>
              </div>
              <button className="btn-ghost" style={{ padding:'6px 8px' }} onClick={() => setEditTarget(null)}>✕</button>
            </div>
            <div className="staff-modal-body">
              <PermForm
                cat={editCat}
                perms={editPerms}
                onCatChange={handleEditCat}
                onPermToggle={toggleEditPerm}
              />
              <button className="btn-primary staff-submit-btn" onClick={saveEdit} disabled={savingEdit}>
                {savingEdit
                  ? <span className="spinner spinner-sm" style={{ borderTopColor:'#fff' }} />
                  : 'Save Changes'
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Page Header ════════════════════════════════════════════ */}
      <div className="page-header" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <div>
          <h1 className="page-title">Staff Management</h1>
          <p className="page-subtitle">Manage admin accounts and control their panel access</p>
        </div>
        <button className="btn-primary" style={{ fontSize:13 }}
          onClick={() => { setFormErr(''); setShowCreate(true); }}>
          + Add Staff
        </button>
      </div>

      {/* ══ Stats Strip ════════════════════════════════════════════ */}
      <div className="staff-stats">
        <div className="card staff-stat-card">
          <div className="staff-stat-icon" style={{ background:'#EFF6FF', color:'#1D4ED8' }}>👥</div>
          <div>
            <p className="staff-stat-val">{total}</p>
            <p className="staff-stat-lbl">Total Staff</p>
          </div>
        </div>
        <div className="card staff-stat-card">
          <div className="staff-stat-icon" style={{ background:'var(--green-light)', color:'var(--green)' }}>✅</div>
          <div>
            <p className="staff-stat-val">{activeCount}</p>
            <p className="staff-stat-lbl">Active</p>
          </div>
        </div>
        <div className="card staff-stat-card">
          <div className="staff-stat-icon" style={{ background:'#FEF2F2', color:'#B91C1C' }}>🔐</div>
          <div>
            <p className="staff-stat-val">{superCount}</p>
            <p className="staff-stat-lbl">Super Admins</p>
          </div>
        </div>
      </div>

      {/* ══ Toolbar ════════════════════════════════════════════════ */}
      <div className="staff-toolbar">
        <div className="staff-search-wrap">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ color:'var(--text-faint)', flexShrink:0 }}>
            <circle cx="6" cy="6" r="4.5"/><path d="M10 10l2.5 2.5" strokeLinecap="round"/>
          </svg>
          <input className="input" placeholder="Search by name or email…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <span className="staff-count">{total} staff member{total !== 1 ? 's' : ''}</span>
      </div>

      {/* ══ Table ══════════════════════════════════════════════════ */}
      <div className="card">
        {loading ? (
          <div style={{ padding:20, display:'flex', flexDirection:'column', gap:8 }}>
            {Array(4).fill(0).map((_,i) => (
              <div key={i} className="shimmer" style={{ height:62, borderRadius:8 }} />
            ))}
          </div>
        ) : staff.length === 0 ? (
          <div className="staff-empty">
            <div className="staff-empty-icon">👥</div>
            <h3>No staff members yet</h3>
            <p>Add your first staff member and set their level of access to the admin panel.</p>
            <button className="btn-primary" style={{ marginTop:14, fontSize:13 }} onClick={() => setShowCreate(true)}>
              + Add First Staff Member
            </button>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Staff Member</th>
                    <th>Category</th>
                    <th>Panel Access</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map(u => {
                    const cat = catOf(u.staffCategory);
                    const perms = u.permissions || [];
                    const isFull = perms.length === PERMISSIONS.length;
                    return (
                      <tr key={u._id} className="fade-in">
                        {/* Staff member info */}
                        <td>
                          <div className="user-cell">
                            <div className="user-cell-avatar" style={{ background: cat.bg, color: cat.color }}>
                              {u.firstName?.[0]}{u.lastName?.[0]}
                            </div>
                            <div>
                              <p className="user-cell-name">{u.firstName} {u.lastName}</p>
                              <p className="user-cell-email">{u.email}</p>
                              {u.phone && <p className="user-cell-phone">{u.phone}</p>}
                            </div>
                          </div>
                        </td>

                        {/* Category */}
                        <td>
                          {u.staffCategory ? (
                            <span className="cat-badge"
                              style={{ background: cat.bg, color: cat.color, borderColor: cat.color + '35' }}>
                              {cat.label}
                            </span>
                          ) : (
                            <span style={{ fontSize:12, color:'var(--text-faint)' }}>—</span>
                          )}
                        </td>

                        {/* Permissions */}
                        <td>
                          <div className="perm-pills">
                            {isFull ? (
                              <span className="perm-pill all">✦ Full Access</span>
                            ) : perms.length === 0 ? (
                              <span style={{ fontSize:12, color:'var(--text-faint)' }}>No access</span>
                            ) : (
                              perms.map(p => {
                                const pd = permOf(p);
                                return (
                                  <span key={p} className="perm-pill" title={pd?.desc}>
                                    {pd?.icon} {pd?.label || p}
                                  </span>
                                );
                              })
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td>
                          <span className={`badge ${u.isActive ? 'badge-delivered' : 'badge-cancelled'}`}>
                            {u.isActive ? '● Active' : '● Inactive'}
                          </span>
                        </td>

                        {/* Last login */}
                        <td style={{ fontSize:12, color:'var(--text-faint)', whiteSpace:'nowrap' }}>
                          {u.lastLogin ? format(new Date(u.lastLogin), 'MMM d, yyyy') : 'Never'}
                        </td>

                        {/* Actions */}
                        <td>
                          <div className="td-actions">
                            <button className="edit-access-btn" onClick={() => openEdit(u)}>
                              ✏ Edit Access
                            </button>
                            <button
                              className={`toggle-btn ${u.isActive ? 'deactivate' : 'activate'}`}
                              onClick={() => toggle(u._id)}
                              disabled={toggling === u._id}>
                              {toggling === u._id
                                ? <span className="spinner spinner-sm" />
                                : u.isActive ? 'Deactivate' : 'Activate'
                              }
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div className="pagination">
                <span>Showing {Math.min((page-1)*20+1, total)}–{Math.min(page*20, total)} of {total}</span>
                <div className="page-btns">
                  <button className="btn-secondary" style={{ padding:'6px 14px', fontSize:13 }}
                    onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>
                    Previous
                  </button>
                  <button className="btn-secondary" style={{ padding:'6px 14px', fontSize:13 }}
                    onClick={() => setPage(p => p+1)} disabled={page >= pages}>
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
