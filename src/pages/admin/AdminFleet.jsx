import { useState, useEffect, useCallback } from 'react';
import { fleetAPI, driversAPI } from '../../api/client.js';
import { format, differenceInDays } from 'date-fns';
import './AdminFleet.css';

const VEHICLE_TYPES = ['bike','car','van','truck'];
const STATUSES      = ['active','maintenance','retired'];

const typeIcon = t => ({ bike:'🏍️', car:'🚗', van:'🚐', truck:'🚛' }[t] || '🚗');

const expiryClass = (date) => {
  if (!date) return '';
  const days = differenceInDays(new Date(date), new Date());
  if (days < 0)  return 'expired';
  if (days < 30) return 'expiring';
  return 'ok';
};

const fmtDate = d => d ? format(new Date(d), 'MMM d, yyyy') : '—';

// ── Vehicle Form Modal ─────────────────────────────────────────────────────
function VehicleModal({ initial, onSave, onClose, saving }) {
  const empty = {
    plateNumber:'', make:'', model:'', year: new Date().getFullYear(),
    color:'', vehicleType:'truck', capacityTons:'',
    insuranceExpiry:'', roadworthinessExpiry:'',
    lastServiceDate:'', nextServiceDate:'', mileage:'', notes:'',
  };
  const [form, setForm] = useState(initial ? {
    ...initial,
    insuranceExpiry:      initial.insuranceExpiry      ? format(new Date(initial.insuranceExpiry),      'yyyy-MM-dd') : '',
    roadworthinessExpiry: initial.roadworthinessExpiry ? format(new Date(initial.roadworthinessExpiry), 'yyyy-MM-dd') : '',
    lastServiceDate:      initial.lastServiceDate      ? format(new Date(initial.lastServiceDate),      'yyyy-MM-dd') : '',
    nextServiceDate:      initial.nextServiceDate      ? format(new Date(initial.nextServiceDate),      'yyyy-MM-dd') : '',
  } : empty);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box fleet-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{initial ? 'Edit Vehicle' : 'Add Vehicle'}</h2>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body fleet-form">

          <div className="fleet-form-section">Vehicle Information</div>
          <div className="fleet-form-row">
            <div className="field">
              <label className="label">Plate Number *</label>
              <input className="input" placeholder="LAS-421-AB" value={form.plateNumber}
                onChange={set('plateNumber')} required disabled={!!initial} />
            </div>
            <div className="field">
              <label className="label">Vehicle Type *</label>
              <select className="input" value={form.vehicleType} onChange={set('vehicleType')}>
                {VEHICLE_TYPES.map(t => <option key={t} value={t}>{typeIcon(t)} {t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <div className="fleet-form-row">
            <div className="field">
              <label className="label">Make *</label>
              <input className="input" placeholder="Toyota" value={form.make} onChange={set('make')} required />
            </div>
            <div className="field">
              <label className="label">Model *</label>
              <input className="input" placeholder="HiAce" value={form.model} onChange={set('model')} required />
            </div>
          </div>

          <div className="fleet-form-row">
            <div className="field">
              <label className="label">Year *</label>
              <input className="input" type="number" min="2000" max="2030" value={form.year}
                onChange={set('year')} required />
            </div>
            <div className="field">
              <label className="label">Color</label>
              <input className="input" placeholder="White" value={form.color} onChange={set('color')} />
            </div>
          </div>

          <div className="fleet-form-row">
            <div className="field">
              <label className="label">Capacity (tons)</label>
              <input className="input" type="number" min="0" step="0.5"
                value={form.capacityTons} onChange={set('capacityTons')} placeholder="2" />
            </div>
            <div className="field">
              <label className="label">Mileage (km)</label>
              <input className="input" type="number" min="0"
                value={form.mileage} onChange={set('mileage')} placeholder="45000" />
            </div>
          </div>

          {initial && (
            <div className="field">
              <label className="label">Status</label>
              <select className="input" value={form.status || 'active'} onChange={set('status')}>
                {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          )}

          <div className="fleet-form-section fleet-form-section--spaced">Compliance & Maintenance</div>

          <div className="fleet-form-row">
            <div className="field">
              <label className="label">Insurance Expiry</label>
              <input className="input" type="date" value={form.insuranceExpiry} onChange={set('insuranceExpiry')} />
            </div>
            <div className="field">
              <label className="label">Roadworthiness Expiry</label>
              <input className="input" type="date" value={form.roadworthinessExpiry} onChange={set('roadworthinessExpiry')} />
            </div>
          </div>

          <div className="fleet-form-row">
            <div className="field">
              <label className="label">Last Service Date</label>
              <input className="input" type="date" value={form.lastServiceDate} onChange={set('lastServiceDate')} />
            </div>
            <div className="field">
              <label className="label">Next Service Date</label>
              <input className="input" type="date" value={form.nextServiceDate} onChange={set('nextServiceDate')} />
            </div>
          </div>

          <div className="field">
            <label className="label">Notes</label>
            <textarea className="input fleet-textarea" rows="2"
              placeholder="Any additional notes about this vehicle…"
              value={form.notes} onChange={set('notes')} />
          </div>

          <div className="fleet-form-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={() => onSave(form)} disabled={saving}>
              {saving ? <span className="spinner spinner-sm" /> : initial ? 'Save Changes' : 'Add to Fleet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Assign Driver Modal ────────────────────────────────────────────────────
function AssignModal({ vehicle, onAssign, onClose, saving }) {
  const [drivers, setDrivers] = useState([]);
  const [sel,     setSel]     = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    driversAPI.list({ status: 'available' })
      .then(r => setDrivers(r.data?.drivers || []))
      .catch(() => setDrivers([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Assign Driver</h2>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>
              Vehicle: {vehicle.plateNumber} — {vehicle.make} {vehicle.model}
            </p>
          </div>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {vehicle.assignedDriverId && (
            <div className="assign-current">
              <p>Currently assigned to: <strong>
                {vehicle.assignedDriverId?.userId?.firstName} {vehicle.assignedDriverId?.userId?.lastName}
              </strong></p>
              <button className="btn-secondary" style={{ marginTop: 8, width: '100%' }}
                onClick={() => onAssign(null)} disabled={saving}>
                {saving ? <span className="spinner spinner-sm" /> : 'Unassign Driver'}
              </button>
              <div className="assign-divider">or choose a different driver</div>
            </div>
          )}
          {loading ? (
            <p style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-faint)' }}>Loading available drivers…</p>
          ) : drivers.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-faint)' }}>No available drivers right now</p>
          ) : (
            <div className="driver-options">
              {drivers.map(d => (
                <label key={d._id} className={`driver-option ${sel === d._id ? 'selected' : ''}`}>
                  <input type="radio" name="driver" value={d._id} hidden
                    checked={sel === d._id} onChange={() => setSel(d._id)} />
                  <div className="driver-opt-avatar">{d.userId?.firstName?.[0]}{d.userId?.lastName?.[0]}</div>
                  <div className="driver-opt-info">
                    <p className="driver-opt-name">{d.userId?.firstName} {d.userId?.lastName}</p>
                    <p className="driver-opt-sub">{d.vehicleType} · {d.vehiclePlate}</p>
                  </div>
                  <span className="driver-opt-rating">★ {Number(d.rating).toFixed(1)}</span>
                </label>
              ))}
            </div>
          )}
          {sel && (
            <button className="btn-primary" style={{ width: '100%', marginTop: 12 }}
              onClick={() => onAssign(sel)} disabled={saving}>
              {saving ? <span className="spinner spinner-sm" /> : 'Confirm Assignment'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function AdminFleet() {
  const [vehicles, setVehicles] = useState([]);
  const [stats,    setStats]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [search,   setSearch]   = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page,     setPage]     = useState(1);
  const [total,    setTotal]    = useState(0);
  const [modal,    setModal]    = useState(null);  // { type: 'vehicle'|'assign', data: … }
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  const LIMIT = 20;

  const flash = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); };

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, limit: LIMIT };
    if (search)       params.search      = search;
    if (typeFilter)   params.vehicleType = typeFilter;
    if (statusFilter) params.status      = statusFilter;

    Promise.all([
      fleetAPI.list(params),
      fleetAPI.stats(),
    ])
      .then(([r, s]) => {
        setVehicles(r.data?.vehicles || []);
        setTotal(r.data?.pagination?.total || 0);
        setStats(s.data);
      })
      .catch(e => setError(e?.response?.data?.message || 'Failed to load fleet data'))
      .finally(() => setLoading(false));
  }, [search, typeFilter, statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async form => {
    setSaving(true); setError('');
    try {
      if (modal.mode === 'edit') {
        await fleetAPI.update(modal.data._id, form);
        flash(`${form.plateNumber || modal.data.plateNumber} updated`);
      } else {
        await fleetAPI.create(form);
        flash(`${form.plateNumber.toUpperCase()} added to fleet`);
      }
      setModal(null); load();
    } catch (e) { setError(e?.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleAssign = async driverId => {
    setSaving(true); setError('');
    try {
      if (driverId) {
        await fleetAPI.assign(modal.data._id, driverId);
        flash('Driver assigned successfully');
      } else {
        await fleetAPI.unassign(modal.data._id);
        flash('Driver unassigned');
      }
      setModal(null); load();
    } catch (e) { setError(e?.response?.data?.message || 'Assignment failed'); }
    finally { setSaving(false); }
  };

  const handleRetire = async vehicle => {
    if (!window.confirm(`Retire vehicle ${vehicle.plateNumber}? This will remove it from active fleet.`)) return;
    setSaving(true);
    try {
      await fleetAPI.retire(vehicle._id);
      flash(`${vehicle.plateNumber} retired`);
      load();
    } catch (e) { setError(e?.response?.data?.message || 'Failed to retire vehicle'); }
    finally { setSaving(false); }
  };

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="admin-fleet">
      <div className="page-header">
        <div>
          <h1 className="page-title">Fleet Management</h1>
          <p className="page-subtitle">Company vehicle pool — assignment, compliance, and maintenance</p>
        </div>
        <button className="btn-primary" onClick={() => setModal({ type: 'vehicle', mode: 'create', data: null })}>
          + Add Vehicle
        </button>
      </div>

      {error   && <div className="order-error" style={{ marginBottom: 16 }}>⚠ {error}</div>}
      {success && <div className="ap-success">✓ {success}</div>}

      {/* Stats */}
      {stats && (
        <div className="fleet-stats">
          {[
            { label: 'Total',        val: stats.total,        icon: '🚛', color: 'var(--brand)'  },
            { label: 'Active',       val: stats.active,       icon: '✅', color: 'var(--green)'  },
            { label: 'Maintenance',  val: stats.maintenance,  icon: '🔧', color: 'var(--blue)'   },
            { label: 'Unassigned',   val: stats.unassigned,   icon: '🅿️', color: 'var(--purple)' },
            { label: 'Expiring Soon',val: stats.expiringSoon, icon: '⚠️', color: stats.expiringSoon > 0 ? 'var(--red)' : 'var(--text-faint)' },
          ].map(s => (
            <div key={s.label} className="fleet-stat-card card">
              <span className="fsc-icon">{s.icon}</span>
              <div>
                <p className="fsc-val" style={{ color: s.color }}>{s.val}</p>
                <p className="fsc-lbl">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="fleet-toolbar">
        <div className="search-wrap">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--text-faint)" strokeWidth="1.5">
            <circle cx="6" cy="6" r="4.5"/><path d="M9.5 9.5L13 13" strokeLinecap="round"/>
          </svg>
          <input className="input" placeholder="Search plate, make, model…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="status-filters">
          <button className={`filter-btn ${!typeFilter ? 'active' : ''}`} onClick={() => { setTypeFilter(''); setPage(1); }}>All Types</button>
          {VEHICLE_TYPES.map(t => (
            <button key={t} className={`filter-btn ${typeFilter === t ? 'active' : ''}`}
              onClick={() => { setTypeFilter(t); setPage(1); }}>
              {typeIcon(t)} {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="status-filters">
          {[['','All Status'],['active','Active'],['maintenance','Maintenance'],['retired','Retired']].map(([v,l]) => (
            <button key={v} className={`filter-btn ${statusFilter === v ? 'active' : ''}`}
              onClick={() => { setStatusFilter(v); setPage(1); }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div style={{ padding: 16 }}>
            {Array(5).fill(0).map((_, i) => <div key={i} className="shimmer" style={{ height: 60, borderRadius: 8, marginBottom: 8 }} />)}
          </div>
        ) : vehicles.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🚛</div>
            <h3>No vehicles in fleet</h3>
            <p>Add your first vehicle to start managing your fleet</p>
            <button className="btn-primary" style={{ marginTop: 12 }}
              onClick={() => setModal({ type: 'vehicle', mode: 'create', data: null })}>
              + Add Vehicle
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Type</th>
                  <th>Assigned Driver</th>
                  <th>Insurance</th>
                  <th>Roadworthy</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map(v => (
                  <tr key={v._id}>
                    <td>
                      <div className="fleet-vehicle-cell">
                        <span className="fleet-type-icon">{typeIcon(v.vehicleType)}</span>
                        <div>
                          <p className="fleet-plate">{v.plateNumber}</p>
                          <p className="fleet-model">{v.year} {v.make} {v.model}</p>
                          {v.capacityTons > 0 && <p className="fleet-cap">{v.capacityTons}t capacity</p>}
                        </div>
                      </div>
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>{v.vehicleType}</td>
                    <td>
                      {v.assignedDriverId
                        ? <div>
                            <p className="fleet-driver-name">
                              {v.assignedDriverId.userId?.firstName} {v.assignedDriverId.userId?.lastName}
                            </p>
                            <p className="fleet-driver-phone">{v.assignedDriverId.userId?.phone}</p>
                          </div>
                        : <span className="fleet-unassigned">Unassigned</span>}
                    </td>
                    <td>
                      <span className={`fleet-date fleet-date--${expiryClass(v.insuranceExpiry)}`}>
                        {fmtDate(v.insuranceExpiry)}
                        {v.insuranceWarning && ' ⚠'}
                      </span>
                    </td>
                    <td>
                      <span className={`fleet-date fleet-date--${expiryClass(v.roadworthinessExpiry)}`}>
                        {fmtDate(v.roadworthinessExpiry)}
                        {v.roadworthinessWarning && ' ⚠'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge fleet-status-badge fleet-status--${v.status}`}>
                        {v.status.charAt(0).toUpperCase() + v.status.slice(1)}
                      </span>
                    </td>
                    <td>
                      <div className="td-actions">
                        <button className="assign-btn"
                          onClick={() => setModal({ type: 'vehicle', mode: 'edit', data: v })}>
                          Edit
                        </button>
                        <button className="assign-btn"
                          onClick={() => setModal({ type: 'assign', data: v })}>
                          {v.assignedDriverId ? 'Reassign' : 'Assign'}
                        </button>
                        {v.status !== 'retired' && (
                          <button
                            className="btn-ghost"
                            style={{ padding: '5px 8px', fontSize: 12, color: 'var(--red)' }}
                            onClick={() => handleRetire(v)}
                          >
                            Retire
                          </button>
                        )}
                      </div>
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

      {/* Modals */}
      {modal?.type === 'vehicle' && (
        <VehicleModal
          initial={modal.data}
          onSave={handleSave}
          onClose={() => setModal(null)}
          saving={saving}
        />
      )}
      {modal?.type === 'assign' && (
        <AssignModal
          vehicle={modal.data}
          onAssign={handleAssign}
          onClose={() => setModal(null)}
          saving={saving}
        />
      )}
    </div>
  );
}
