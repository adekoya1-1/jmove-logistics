import { useState, useEffect } from 'react';
import { driversAPI, usersAPI } from '../../api/client.js';
import './AdminDrivers.css';

const STATUS_F = ['', 'available', 'busy', 'offline'];

const EMPTY_FORM = {
  firstName: '', lastName: '', email: '', phone: '', password: '',
  vehicleType: 'car', vehiclePlate: '', vehicleModel: '', licenseNumber: '', employeeId: '',
};

function CreateDriverModal({ onClose, onCreated }) {
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [showPw,  setShowPw]  = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await usersAPI.createDriver(form);
      onCreated();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to create driver');
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box create-driver-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add New Driver</h2>
          <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && (
            <div className="cd-error">⚠ {error}</div>
          )}
          <form onSubmit={handleSubmit} className="cd-form">

            <div className="cd-section-label">Personal Information</div>
            <div className="cd-row">
              <div className="field">
                <label className="label">First Name *</label>
                <input type="text" className="input" value={form.firstName} onChange={set('firstName')} placeholder="James" required />
              </div>
              <div className="field">
                <label className="label">Last Name *</label>
                <input type="text" className="input" value={form.lastName} onChange={set('lastName')} placeholder="Okafor" required />
              </div>
            </div>
            <div className="cd-row">
              <div className="field">
                <label className="label">Email Address *</label>
                <input type="email" className="input" value={form.email} onChange={set('email')} placeholder="james@company.com" required />
              </div>
              <div className="field">
                <label className="label">Phone Number</label>
                <input type="tel" className="input" value={form.phone} onChange={set('phone')} placeholder="+234 801 234 5678" />
              </div>
            </div>
            <div className="cd-row">
              <div className="field">
                <label className="label">Password * <span className="cd-pw-hint">(share with driver)</span></label>
                <div className="pw-wrap">
                  <input
                    type={showPw ? 'text' : 'password'} className="input"
                    value={form.password} onChange={set('password')}
                    placeholder="Minimum 8 characters" required minLength={8}
                  />
                  <button type="button" className="pw-toggle" onClick={() => setShowPw(!showPw)}>
                    {showPw ? '🙈' : '👁'}
                  </button>
                </div>
              </div>
              <div className="field">
                <label className="label">Employee ID</label>
                <input type="text" className="input" value={form.employeeId} onChange={set('employeeId')} placeholder="EMP-001" />
              </div>
            </div>

            <div className="cd-divider" />
            <div className="cd-section-label">Vehicle Information</div>

            <div className="cd-row">
              <div className="field">
                <label className="label">Vehicle Type *</label>
                <select className="input" value={form.vehicleType} onChange={set('vehicleType')} required>
                  {['bike', 'car', 'van', 'truck'].map(t => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label">Plate Number *</label>
                <input type="text" className="input" value={form.vehiclePlate} onChange={set('vehiclePlate')} placeholder="LAS-421AB" required />
              </div>
            </div>
            <div className="cd-row">
              <div className="field">
                <label className="label">Vehicle Model</label>
                <input type="text" className="input" value={form.vehicleModel} onChange={set('vehicleModel')} placeholder="Toyota HiAce" />
              </div>
              <div className="field">
                <label className="label">Driver's License No.</label>
                <input type="text" className="input" value={form.licenseNumber} onChange={set('licenseNumber')} placeholder="DRV-2024-001" />
              </div>
            </div>

            <div className="cd-notice">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="var(--green)" strokeWidth="1.2"/><path d="M5 7l1.5 1.5L9.5 5" stroke="var(--green)" strokeWidth="1.2" strokeLinecap="round"/></svg>
              The driver account will be marked as verified and active immediately. Share the email and password with the driver so they can log in.
            </div>

            <div className="cd-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} /> : 'Create Driver Account'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function AdminDrivers() {
  const [drivers,   setDrivers]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [status,    setStatus]    = useState('');
  const [search,    setSearch]    = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [verifying, setVerifying] = useState('');

  const load = () => {
    setLoading(true);
    driversAPI.list({ status })
      .then(r => setDrivers(r.data.drivers))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [status]);

  const toggleVerify = async (d) => {
    setVerifying(d._id);
    try { await driversAPI.verify(d._id, !d.isVerified); load(); }
    catch (e) { alert(e?.response?.data?.message || 'Failed'); }
    finally { setVerifying(''); }
  };

  const filtered = drivers.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${d.userId?.firstName} ${d.userId?.lastName} ${d.userId?.email} ${d.vehiclePlate}`.toLowerCase().includes(q);
  });

  return (
    <div className="admin-drivers">
      <div className="page-header">
        <div>
          <h1 className="page-title">Drivers</h1>
          <p className="page-subtitle">Managed staff drivers for JMove Logistics</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M7 1v12M1 7h12"/></svg>
          Add Driver
        </button>
      </div>

      <div className="orders-toolbar">
        <div className="search-wrap">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--text-faint)" strokeWidth="1.5"><circle cx="6" cy="6" r="4.5"/><path d="M9.5 9.5L13 13"/></svg>
          <input className="input" placeholder="Search by name, email, plate…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="status-filters">
          {STATUS_F.map(s => (
            <button key={s || 'all'} className={`filter-btn ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="drivers-grid">
          {Array(6).fill(0).map((_, i) => <div key={i} className="shimmer" style={{ height: 210, borderRadius: 12 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🚗</div>
          <h3>No drivers yet</h3>
          <p>Add your first driver to get started</p>
          <button className="btn-primary" style={{ marginTop: 8 }} onClick={() => setShowCreate(true)}>Add Driver</button>
        </div>
      ) : (
        <div className="drivers-grid">
          {filtered.map(d => (
            <div key={d._id} className="driver-card card slide-up">
              <div className="driver-top">
                <div className="driver-avatar">{d.userId?.firstName?.[0]}{d.userId?.lastName?.[0]}</div>
                <div className="driver-info">
                  <p className="driver-name">{d.userId?.firstName} {d.userId?.lastName}</p>
                  <p className="driver-email">{d.userId?.email}</p>
                </div>
                <span className={`badge badge-${d.status}`}>{d.status}</span>
              </div>

              {/* Employee ID if set */}
              {d.employeeId && (
                <div className="driver-empid">
                  <span className="driver-empid-label">Employee ID</span>
                  <span className="driver-empid-val">{d.employeeId}</span>
                </div>
              )}

              <div className="driver-stats">
                <div className="ds-item">
                  <p className="ds-lbl">Vehicle</p>
                  <p className="ds-val" style={{ textTransform: 'capitalize' }}>{d.vehicleType}</p>
                </div>
                <div className="ds-item">
                  <p className="ds-lbl">Plate</p>
                  <p className="ds-val" style={{ fontFamily: 'var(--font-mono)' }}>{d.vehiclePlate}</p>
                </div>
                <div className="ds-item">
                  <p className="ds-lbl">Deliveries</p>
                  <p className="ds-val">{d.totalDeliveries}</p>
                </div>
                <div className="ds-item">
                  <p className="ds-lbl">Rating</p>
                  <p className="ds-val">★ {Number(d.rating).toFixed(1)}</p>
                </div>
              </div>

              <div className="driver-card-footer">
                <span className={`badge ${d.isVerified ? 'badge-delivered' : 'badge-pending'}`}>
                  {d.isVerified ? '✓ Active Staff' : '⏳ Pending'}
                </span>
                <button
                  className={`verify-btn ${d.isVerified ? 'verified' : ''}`}
                  onClick={() => toggleVerify(d)}
                  disabled={verifying === d._id}
                  style={{ marginLeft: 'auto' }}
                >
                  {verifying === d._id
                    ? <span className="spinner spinner-sm" />
                    : d.isVerified ? 'Suspend' : 'Activate'
                  }
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateDriverModal onClose={() => setShowCreate(false)} onCreated={load} />
      )}
    </div>
  );
}
