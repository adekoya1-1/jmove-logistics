import { useState, useEffect, useCallback, useRef } from 'react';
import { pricingAPI } from '../../api/client.js';
import './AdminPricing.css';

const fmt = n => new Intl.NumberFormat('en-NG').format(Number(n || 0));

const PALETTE = ['#3498DB','#8E44AD','#27AE60','#F39C12','#E74C3C','#2980B9','#E91E63','#16A085'];
const dirColor = idx => PALETTE[idx % PALETTE.length];

// ── Modal shell ───────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box ap-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="btn-ghost modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13"/>
            </svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ── Vehicle Type Form ─────────────────────────────────────────────────────
function TruckTypeForm({ initial, onSave, onCancel, saving }) {
  const ICONS = ['🚐', '🚛', '🚚', '🏗️', '🚜', '🛻'];
  const [form, setForm] = useState({
    name:         initial?.name         || '',
    description:  initial?.description  || '',
    capacityTons: initial?.capacityTons ?? '',
    icon:         initial?.icon         || '🚛',
    sortOrder:    initial?.sortOrder    ?? 0,
  });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const submit = e => {
    e.preventDefault();
    onSave({
      name: form.name.trim(), description: form.description.trim(),
      capacityTons: Number(form.capacityTons), icon: form.icon,
      sortOrder: Number(form.sortOrder),
    });
  };
  return (
    <form className="ap-form" onSubmit={submit}>
      <div className="ap-form-row">
        <div className="ap-field">
          <label className="ap-label">Vehicle Name *</label>
          <input className="ap-input" value={form.name} onChange={set('name')} placeholder="e.g. 2-Ton Truck" required />
        </div>
        <div className="ap-field ap-field--sm">
          <label className="ap-label">Capacity (tons) *</label>
          <input className="ap-input" type="number" min="0" step="0.5" value={form.capacityTons} onChange={set('capacityTons')} placeholder="2" required />
        </div>
      </div>
      <div className="ap-field">
        <label className="ap-label">Description</label>
        <input className="ap-input" value={form.description} onChange={set('description')} placeholder="What goods this truck handles" />
      </div>
      <div className="ap-field">
        <label className="ap-label">Icon</label>
        <div className="ap-icon-picker">
          {ICONS.map(ic => (
            <button key={ic} type="button"
              className={`ap-icon-btn${form.icon === ic ? ' selected' : ''}`}
              onClick={() => setForm(f => ({ ...f, icon: ic }))}>
              {ic}
            </button>
          ))}
        </div>
      </div>
      <div className="ap-form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <span className="spinner spinner-sm" /> : initial ? 'Save Changes' : 'Create Vehicle Type'}
        </button>
      </div>
    </form>
  );
}

// ── Inline-editable matrix cell ───────────────────────────────────────────
// Each cell manages its own edit state so only one cell at a time goes live.
function MatrixCell({ rule, fromDir, toDir, truckType, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value,   setValue]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const inputRef = useRef(null);

  const openEdit = () => {
    setValue(rule?.price?.toString() ?? '');
    setEditing(true);
    requestAnimationFrame(() => { inputRef.current?.select(); });
  };

  const commitSave = async () => {
    const num = Number(value);
    if (value === '' || isNaN(num) || num < 0) { setEditing(false); return; }
    if (rule && num === rule.price)             { setEditing(false); return; }
    setSaving(true);
    try {
      await pricingAPI.upsertRule({
        fromDirection: fromDir,
        toDirection:   toDir,
        truckTypeId:   truckType._id,
        price:         num,
      });
      await onSaved();
    } catch (err) {
      console.error('[MatrixCell] save failed', err);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const onKeyDown = e => {
    if (e.key === 'Enter')  { e.preventDefault(); commitSave(); }
    if (e.key === 'Escape') { setEditing(false); }
  };

  if (saving) {
    return (
      <td className="ap-matrix-cell ap-cell-saving">
        <span className="spinner spinner-sm" />
      </td>
    );
  }

  if (editing) {
    return (
      <td className="ap-matrix-cell ap-cell-editing">
        <div className="ap-inline-wrap">
          <span className="ap-inline-naira">₦</span>
          <input
            ref={inputRef}
            className="ap-inline-input"
            type="number"
            min="0"
            value={value}
            onChange={e => setValue(e.target.value)}
            onBlur={commitSave}
            onKeyDown={onKeyDown}
            autoFocus
          />
        </div>
      </td>
    );
  }

  return (
    <td
      className={`ap-matrix-cell ${rule ? 'ap-cell--set' : 'ap-cell--empty'}`}
      onClick={openEdit}
      title={rule ? `₦${fmt(rule.price)} — click to edit` : 'Click to set price'}
    >
      {rule
        ? <span className="ap-cell-price">₦{fmt(rule.price)}</span>
        : <span className="ap-cell-empty">—</span>}
    </td>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════
export default function AdminPricing() {
  const [tab,      setTab]     = useState('matrix');
  const [data,     setData]    = useState({ directions: [], truckTypes: [], rules: [], states: [] });
  const [truckIdx, setTruckIdx] = useState(0);
  const [loading,  setLoading] = useState(true);
  const [saving,   setSaving]  = useState(false);
  const [seeding,  setSeeding] = useState(false);
  const [error,    setError]   = useState('');
  const [success,  setSuccess] = useState('');
  const [modal,    setModal]   = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await pricingAPI.adminFull();
      setData(r.data);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load pricing data');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const flash = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); };

  // Sorted lists
  const sortedDirs   = data.directions || [];
  const sortedTrucks = [...(data.truckTypes || [])].sort(
    (a, b) => (a.sortOrder - b.sortOrder) || (a.capacityTons - b.capacityTons)
  );
  const activeTruck = sortedTrucks[truckIdx] || sortedTrucks[0];

  // Helper: find rule for a cell
  const getRule = (fromDir, toDir, truckId) =>
    data.rules.find(r =>
      r.fromDirection === fromDir &&
      r.toDirection   === toDir   &&
      (r.truckTypeId?._id || r.truckTypeId)?.toString() === truckId.toString()
    );

  // Coverage stats for the active truck type
  const totalCells = sortedDirs.length * sortedDirs.length;
  const filledCells = activeTruck
    ? sortedDirs.reduce((n, from) =>
        n + sortedDirs.filter(to => getRule(from, to, activeTruck._id)).length, 0)
    : 0;
  const allFilled = totalCells > 0 && filledCells === totalCells;

  // ── Vehicle Types CRUD ────────────────────────────────────────────────
  const saveTruckType = async fd => {
    setSaving(true);
    try {
      if (modal.mode === 'edit') {
        await pricingAPI.updateTruckType(modal.data._id, fd);
        flash('Vehicle type updated');
      } else {
        await pricingAPI.createTruckType(fd);
        flash('Vehicle type created');
      }
      setModal(null); await loadData();
    } catch (e) { setError(e?.response?.data?.message || 'Failed to save vehicle type'); }
    finally { setSaving(false); }
  };

  const deleteTruckType = async id => {
    if (!window.confirm('Deactivate this vehicle type? Linked pricing rules will be preserved.')) return;
    setSaving(true);
    try {
      await pricingAPI.deleteTruckType(id);
      flash('Vehicle type removed'); await loadData();
    } catch (e) { setError(e?.response?.data?.message || 'Failed to remove vehicle type'); }
    finally { setSaving(false); }
  };

  // ── Seed defaults ─────────────────────────────────────────────────────
  const handleSeed = async () => {
    if (!window.confirm(
      'Set up the 6 Nigerian compass directions, vehicle types, and a full starter pricing grid?'
    )) return;
    setSeeding(true); setError('');
    try {
      await pricingAPI.seedDefaults();
      flash('✅ Compass directions, vehicle types, and pricing grid initialised!');
      await loadData();
    } catch (e) { setError(e?.response?.data?.message || 'Failed to initialise pricing'); }
    finally { setSeeding(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="admin-pricing">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Pricing Management</h1>
          <p className="page-subtitle">
            Fixed direction-based pricing — Origin → Destination × Vehicle type
          </p>
        </div>
      </div>

      {/* ── Alerts ───────────────────────────────────────────────────────── */}
      {error   && <div className="order-error" style={{ marginBottom: 16 }}>⚠ {error}</div>}
      {success && <div className="ap-success">✓ {success}</div>}

      {/* ── Stats bar (only when data exists) ────────────────────────────── */}
      {sortedDirs.length > 0 && (
        <div className="ap-stats-row">
          {[
            { label: 'Directions',    val: sortedDirs.length,   icon: '🧭' },
            { label: 'Vehicle Types', val: sortedTrucks.length, icon: '🚛' },
            { label: 'Price Rules',   val: data.rules.length,   icon: '💰' },
            {
              label: 'Grid Coverage',
              val: totalCells > 0
                ? `${filledCells}/${totalCells} (${Math.round(filledCells / totalCells * 100)}%)`
                : '—',
              icon: allFilled ? '✅' : '⚠️',
            },
          ].map(s => (
            <div key={s.label} className="ap-stat-card">
              <span className="ap-stat-icon">{s.icon}</span>
              <div>
                <p className="ap-stat-val">{s.val}</p>
                <p className="ap-stat-label">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="ap-tabs">
        {[
          { id: 'matrix',   label: 'Pricing Matrix'                          },
          { id: 'vehicles', label: `Vehicle Types (${sortedTrucks.length})`  },
        ].map(t => (
          <button
            key={t.id}
            className={`ap-tab${tab === t.id ? ' ap-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          TAB — PRICING MATRIX
      ══════════════════════════════════════════════════════ */}
      {tab === 'matrix' && (
        <div className="card ap-matrix-card fade-in">

          {/* Loading skeletons */}
          {loading && (
            <div className="ap-loading-rows">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="shimmer" style={{ height: 44, borderRadius: 8, marginBottom: 8 }} />
              ))}
            </div>
          )}

          {/* Empty state — no directions seeded yet */}
          {!loading && sortedDirs.length === 0 && (
            <div className="ap-empty-setup">
              <div className="ap-setup-icon">🧭</div>
              <h3 className="ap-setup-title">No pricing configured yet</h3>
              <p className="ap-setup-sub">
                Initialise the 6 Nigerian compass directions, vehicle types, and a complete
                pricing grid. You can then click any cell to edit the price directly.
              </p>
              <button
                className="btn-primary ap-setup-btn"
                onClick={handleSeed}
                disabled={seeding}
              >
                {seeding
                  ? <><span className="spinner spinner-sm" /> Setting up…</>
                  : '⚡ Initialise Compass Directions & Pricing Grid'}
              </button>
            </div>
          )}

          {/* Matrix */}
          {!loading && sortedDirs.length > 0 && (
            <>
              {/* Top bar: hint + vehicle type pills */}
              <div className="ap-matrix-topbar">
                <div className="ap-matrix-hints">
                  <p className="ap-matrix-hint">
                    Click any cell to edit the price inline.&nbsp;
                    <kbd>Enter</kbd> to save · <kbd>Esc</kbd> to cancel.
                  </p>
                  {!allFilled && (
                    <p className="ap-coverage-warn">
                      ⚠&nbsp;
                      {totalCells - filledCells} cell{totalCells - filledCells !== 1 ? 's' : ''} not
                      set for this vehicle type — missing combinations will result in an error during quote calculations.
                    </p>
                  )}
                </div>
                <div className="ap-truck-tabs">
                  {sortedTrucks.map((tt, i) => (
                    <button
                      key={tt._id}
                      className={`ap-truck-tab${truckIdx === i ? ' ap-truck-tab--active' : ''}`}
                      onClick={() => setTruckIdx(i)}
                    >
                      <span>{tt.icon}</span>
                      <span>{tt.name}</span>
                      <span className="ap-truck-cap">{tt.capacityTons}t</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid */}
              <div className="ap-matrix-scroll">
                <table className="ap-matrix-table">
                  <thead>
                    <tr>
                      <th className="ap-matrix-corner">
                        <span className="ap-corner-from">Origin</span>
                        <span className="ap-corner-sep"> ↘ </span>
                        <span className="ap-corner-to">Destination</span>
                      </th>
                      {sortedDirs.map((d, i) => (
                        <th key={d} className="ap-matrix-th">
                          <span className="ap-mth-dot" style={{ background: dirColor(i) }} />
                          {d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDirs.map((fromDir, fi) => (
                      <tr key={fromDir}>
                        <td className="ap-matrix-zone-cell">
                          <span className="ap-mth-dot" style={{ background: dirColor(fi) }} />
                          {fromDir}
                        </td>
                        {sortedDirs.map(toDir => (
                          <MatrixCell
                            key={`${fromDir}-${toDir}`}
                            rule={activeTruck ? getRule(fromDir, toDir, activeTruck._id) : null}
                            fromDir={fromDir}
                            toDir={toDir}
                            truckType={activeTruck}
                            onSaved={loadData}
                          />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className="ap-legend">
                <span className="ap-legend-item">
                  <span className="ap-legend-swatch ap-legend-set" />Price set
                </span>
                <span className="ap-legend-item">
                  <span className="ap-legend-swatch ap-legend-empty" />Not configured
                </span>
                {sortedTrucks.length > 1 && (
                  <span className="ap-legend-truck">
                    Showing: {activeTruck?.icon} {activeTruck?.name}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB — VEHICLE TYPES
      ══════════════════════════════════════════════════════ */}
      {tab === 'vehicles' && (
        <div className="card fade-in">
          <div className="ap-list-header">
            <p className="ap-list-title">Vehicle / Truck Types</p>
            <button
              className="btn-primary ap-add-btn"
              onClick={() => setModal({ type: 'truck', mode: 'create', data: null })}
            >
              + Add Vehicle Type
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 20 }}>
              {[1,2,3].map(i => (
                <div key={i} className="shimmer" style={{ height: 60, borderRadius: 8, marginBottom: 10 }} />
              ))}
            </div>
          ) : sortedTrucks.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <div className="empty-icon">🚛</div>
              <h3>No vehicle types defined</h3>
              <p>Add vehicle types — customers select one when booking a shipment</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Capacity</th>
                    <th>Price Rules</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTrucks.map(tt => {
                    const ruleCount = data.rules.filter(r =>
                      (r.truckTypeId?._id || r.truckTypeId)?.toString() === tt._id.toString()
                    ).length;
                    return (
                      <tr key={tt._id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 22 }}>{tt.icon}</span>
                            <div>
                              <div className="ap-zone-name">{tt.name}</div>
                              {tt.description && <div className="td-sub">{tt.description}</div>}
                            </div>
                          </div>
                        </td>
                        <td><span className="ap-capacity-badge">{tt.capacityTons}t</span></td>
                        <td>
                          <span className={`badge ${ruleCount > 0 ? 'badge-paid' : 'badge-pending'}`}>
                            {ruleCount} rule{ruleCount !== 1 ? 's' : ''}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${tt.isActive !== false ? 'badge-delivered' : 'badge-cancelled'}`}>
                            {tt.isActive !== false ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <div className="td-actions">
                            <button
                              className="assign-btn"
                              onClick={() => setModal({ type: 'truck', mode: 'edit', data: tt })}
                            >
                              Edit
                            </button>
                            <button
                              className="btn-ghost"
                              style={{ padding: '5px 8px', fontSize: 13, color: 'var(--red)' }}
                              onClick={() => deleteTruckType(tt._id)}
                            >
                              {tt.isActive !== false ? 'Deactivate' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      {modal?.type === 'truck' && (
        <Modal
          title={modal.mode === 'edit' ? `Edit: ${modal.data.name}` : 'New Vehicle Type'}
          onClose={() => setModal(null)}
        >
          <TruckTypeForm
            initial={modal.data}
            onSave={saveTruckType}
            onCancel={() => setModal(null)}
            saving={saving}
          />
        </Modal>
      )}
    </div>
  );
}
