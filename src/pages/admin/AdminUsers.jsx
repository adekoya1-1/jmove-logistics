import { useState, useEffect } from 'react';
import { usersAPI } from '../../api/client.js';
import { format } from 'date-fns';
import './AdminUsers.css';

const ROLES = ['','customer','driver'];

export default function AdminUsers() {
  const [users,    setUsers]    = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [role,     setRole]     = useState('');
  const [search,   setSearch]   = useState('');
  const [loading,  setLoading]  = useState(true);
  const [toggling, setToggling] = useState('');

  const load = () => {
    setLoading(true);
    usersAPI.list({ role, search, page, limit: 20 })
      .then(r => { setUsers(r.data.users); setTotal(r.data.pagination.total); })
      .catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [role, search, page]);

  const toggle = async (id) => {
    setToggling(id);
    try { await usersAPI.toggleStatus(id); load(); }
    catch (e) { alert(e?.response?.data?.message || 'Failed'); }
    finally { setToggling(''); }
  };

  const pages = Math.ceil(total / 20);

  return (
    <div className="admin-users">
      <div className="page-header">
        <div><h1 className="page-title">Users</h1><p className="page-subtitle">Manage customer and driver accounts</p></div>
      </div>

      <div className="orders-toolbar">
        <div className="search-wrap">
          🔍 <input className="input" placeholder="Search users…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="status-filters">
          {ROLES.map(r => (
            <button key={r||'all'} className={`filter-btn ${role===r?'active':''}`} onClick={() => { setRole(r); setPage(1); }}>{r||'All'}</button>
          ))}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding:16 }}>{Array(5).fill(0).map((_,i) => <div key={i} className="shimmer" style={{ height:52, margin:'4px 0', borderRadius:8 }} />)}</div>
        ) : users.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">👥</div><h3>No users found</h3></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>User</th><th>Role</th><th>Phone</th><th>Status</th><th>Joined</th><th>Action</th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u._id}>
                    <td>
                      <div className="user-cell">
                        <div className="user-cell-avatar">{u.firstName?.[0]}{u.lastName?.[0]}</div>
                        <div>
                          <p style={{ fontSize:14, fontWeight:600 }}>{u.firstName} {u.lastName}</p>
                          <p style={{ fontSize:12, color:'var(--text-faint)' }}>{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td><span className={`role-badge role-${u.role}`}>{u.role}</span></td>
                    <td style={{ fontSize:13, color:'var(--text-muted)' }}>{u.phone || '—'}</td>
                    <td><span className={`badge ${u.isActive ? 'badge-delivered' : 'badge-cancelled'}`}>{u.isActive ? '● Active' : '● Inactive'}</span></td>
                    <td style={{ fontSize:12, color:'var(--text-faint)' }}>{format(new Date(u.createdAt), 'MMM d, yyyy')}</td>
                    <td>
                      <button className={`toggle-btn ${u.isActive ? 'deactivate' : 'activate'}`} onClick={() => toggle(u._id)} disabled={toggling===u._id}>
                        {toggling===u._id ? <span className="spinner spinner-sm" /> : u.isActive ? 'Deactivate' : 'Activate'}
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
            <span>Total: {total} users</span>
            <div className="page-btns">
              <button className="btn-secondary" style={{ padding:'6px 14px', fontSize:13 }} onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}>Previous</button>
              <button className="btn-secondary" style={{ padding:'6px 14px', fontSize:13 }} onClick={() => setPage(p => p+1)} disabled={page>=pages}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
