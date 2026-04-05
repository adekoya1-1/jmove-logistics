import { useState, useEffect, useCallback } from 'react';
import { pricingAPI } from '../../api/client.js';
import './AdminPricing.css';

const fmt = n => Number(n || 0).toLocaleString('en-NG');

// ── Shared modal shell ────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
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

// ── Zone form ─────────────────────────────────────────────────────────────
function ZoneForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name:        initial?.name        || '',
    description: initial?.description || '',
    zoneNumber:  initial?.zoneNumber  ?? '',
    cities:      initial?.cities?.join(', ') || '',
    sortOrder:   initial?.sortOrder   ?? 0,
  });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = e => {
    e.preventDefault();
    onSave({
      name:        form.name.trim(),
      description: form.description.trim(),
      zoneNumber:  Number(form.zoneNumber),
      cities:      form.cities.split(',').map(c => c.trim().toLowerCase()).filter(Boolean),
      sortOrder:   Number(form.sortOrder),
    });
  };

  return (
    <form className="ap-form" onSubmit={handleSubmit}>
      <div className="ap-form-row">
        <div className="ap-field">
          <label className="ap-label">Zone Name *</label>
          <input className="ap-input" value={form.name} onChange={set('name')} placeholder="e.g. Zone 1 — Lagos Metro" required />
        </div>
        <div className="ap-field ap-field--sm">
          <label className="ap-label">Zone Number *</label>
          <input className="ap-input" type="number" min="0" max="10" value={form.zoneNumber} onChange={set('zoneNumber')} placeholder="0–10" required />
        </div>
      </div>
      <div className="ap-field">
        <label className="ap-label">Description</label>
        <input className="ap-input" value={form.description} onChange={set('description')} placeholder="Brief description of this zone" />
      </div>
      <div className="ap-field">
        <label className="ap-label">Cities <span className="ap-hint">(comma-separated lowercase city keys)</span></label>
        <textarea className="ap-input ap-textarea" value={form.cities} onChange={set('cities')} placeholder="lagos, lekki, abeokuta" rows={3} />
      </div>
      <div className="ap-form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <span className="spinner spinner-sm" /> : initial ? 'Save Changes' : 'Create Zone'}
        </button>
      </div>
    </form>
  );
}

// ── Truck type form ───────────────────────────────────────────────────────
function TruckTypeForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name:         initial?.name         || '',
    description:  initial?.description  || '',
    capacityTons: initial?.capacityTons ?? '',
    icon:         initial?.icon         || '🚛',
    sortOrder:    initial?.sortOrder    ?? 0,
  });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const ICONS = ['🚐','🚛','🚚','🏗️','🚜','🛻'];

  const handleSubmit = e => {
    e.preventDefault();
    onSave({
      name:         form.name.trim(),
      description:  form.description.trim(),
      capacityTons: Number(form.capacityTons),
      icon:         form.icon,
      sortOrder:    Number(form.sortOrder),
    });
  };

  return (
    <form className="ap-form" onSubmit={handleSubmit}>
      <div className="ap-form-row">
        <div className="ap-field">
          <label className="ap-label">Vehicle Name *</label>
          <input className="ap-input" value={form.name} onChange={set('name')} placeholder="e.g. 2-Ton Truck" required />
        </div>
        <div className="ap-field ap-field--sm">
          <label className="ap-label">Capacity (tons) *</label>
          <input className="ap-input" type="number" min="0" step="0.5" value={form.capacityTons} onChange={set('capacityTons')} placeholder="e.g. 2" required />
        </div>
      </div>
      <div className="ap-field">
        <label className="ap-label">Description</label>
        <input className="ap-input" value={form.description} onChange={set('description')} placeholder="What goods / capacity this truck handles" />
      </div>
      <div className="ap-field">
        <label className="ap-label">Icon</label>
        <div className="ap-icon-picker">
          {ICONS.map(ic => (
            <button key={ic} type="button" className={`ap-icon-btn ${form.icon === ic ? 'selected' : ''}`} onClick={() => setForm(f => ({ ...f, icon: ic }))}>
              {ic}
            </button>
          ))}
        </div>
      </div>
      <div className="ap-form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <span className="spinner spinner-sm" /> : initial ? 'Save Changes' : 'Create Truck Type'}
        </button>
      </div>
    </form>
  );
}

// ── Rule form (used inside the matrix cell modal) ─────────────────────────
function RuleForm({ zone, truckType, rule, onSave, onDelete, onCancel, saving }) {
  const [basePrice,  setBasePrice]  = useState(rule?.basePrice  ?? '');
  const [pricePerKm, setPricePerKm] = useState(rule?.pricePerKm ?? 0);

  const handleSubmit = e => {
    e.preventDefault();
    onSave({ zoneId: zone._id, truckTypeId: truckType._id, basePrice: Number(basePrice), pricePerKm: Number(pricePerKm) });
  };

  return (
    <form className="ap-form" onSubmit={handleSubmit}>
      <div className="ap-rule-context">
        <div className="ap-rule-ctx-item">
          <span className="ap-rule-ctx-label">Zone</span>
          <span className="ap-rule-ctx-val">{zone.name}</span>
        </div>
        <span className="ap-rule-ctx-sep">×</span>
        <div className="ap-rule-ctx-item">
          <span className="ap-rule-ctx-label">Vehicle</span>
          <span className="ap-rule-ctx-val">{truckType.icon} {truckType.name}</span>
        </div>
      </div>

      <div className="ap-form-row">
        <div className="ap-field">
          <label className="ap-label">Base Price (₦) *</label>
          <input className="ap-input" type="number" min="0" value={basePrice} onChange={e => setBasePrice(e.target.value)} placeholder="e.g. 5000" required />
          <p className="ap-field-hint">Flat rate for this zone + vehicle combination</p>
        </div>
        <div className="ap-field">
          <label className="ap-label">Price per km (₦) <span className="ap-hint">optional</span></label>
          <input className="ap-input" type="number" min="0" step="10" value={pricePerKm} onChange={e => setPricePerKm(e.target.value)} placeholder="0" />
          <p className="ap-field-hint">Added on top of base price using estimated route km</p>
        </div>
      </div>

      {Number(pricePerKm) > 0 && (
        <div className="ap-per-km-note">
          ℹ️ Price per km is applied to estimated distances between cities in this zone. It is in addition to the base price.
        </div>
      )}

      <div className="ap-form-actions">
        {rule && (
          <button type="button" className="ap-delete-rule-btn" onClick={onDelete} disabled={saving}>
            Remove Rule
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={onCancel} style={{ marginLeft: 'auto' }}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving || !basePrice}>
          {saving ? <span className="spinner spinner-sm" /> : rule ? 'Update Price' : 'Set Price'}
        </button>
      </div>
    </form>
  );
}

// ══════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════
export default function AdminPricing() {
  const [tab,    setTab]    = useState('matrix'); // 'matrix' | 'zones' | 'truckTypes'
  const [data,   setData]   = useState({ zones: [], truckTypes: [], rules: [] });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [modal,   setModal]   = useState(null);
  // modal shapes:
  // { type: 'zone',      mode: 'create'|'edit', data: zoneObj|null }
  // { type: 'truckType', mode: 'create'|'edit', data: truckTypeObj|null }
  // { type: 'rule',      zone: zoneObj, truckType: truckTypeObj, rule: ruleObj|null }

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await pricingAPI.adminFull();
      setData(r.data);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load pricing data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const flash = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3500);
  };

  // ── Helper: find rule for a matrix cell ──────────────────────────────────
  const getCellRule = (zoneId, truckTypeId) =>
    data.rules.find(r =>
      (r.zoneId?._id || r.zoneId)?.toString() === zoneId.toString() &&
      (r.truckTypeId?._id || r.truckTypeId)?.toString() === truckTypeId.toString()
    );

  // ── Computed status ───────────────────────────────────────────────────────
  const totalCells    = data.zones.length * data.truckTypes.length;
  const configuredCells = data.rules.filter(r => r.isActive !== false).length;
  const isDynamic     = totalCells > 0 && configuredCells === totalCells;
  const isPartial     = configuredCells > 0 && configuredCells < totalCells;

  // ── Zone CRUD ─────────────────────────────────────────────────────────────
  const saveZone = async (formData) => {
    setSaving(true);
    try {
      if (modal.mode === 'edit') {
        await pricingAPI.updateZone(modal.data._id, formData);
        flash('Zone updated');
      } else {
        await pricingAPI.createZone(formData);
        flash('Zone created');
      }
      setModal(null);
      await loadData();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to save zone');
    } finally {
      setSaving(false);
    }
  };

  const deleteZone = async (id) => {
    if (!window.confirm('Deactivate this zone? Linked pricing rules will be preserved.')) return;
    setSaving(true);
    try {
      const r = await pricingAPI.deleteZone(id);
      flash(r.message || 'Zone removed');
      await loadData();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to delete zone');
    } finally {
      setSaving(false);
    }
  };

  // ── Truck type CRUD ───────────────────────────────────────────────────────
  const saveTruckType = async (formData) => {
    setSaving(true);
    try {
      if (modal.mode === 'edit') {
        await pricingAPI.updateTruckType(modal.data._id, formData);
        flash('Truck type updated');
      } else {
        await pricingAPI.createTruckType(formData);
        flash('Truck type created');
      }
      setModal(null);
      await loadData();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to save truck type');
    } finally {
      setSaving(false);
    }
  };

  const deleteTruckType = async (id) => {
    if (!window.confirm('Deactivate this truck type? Linked pricing rules will be preserved.')) return;
    setSaving(true);
    try {
      const r = await pricingAPI.deleteTruckType(id);
      flash(r.message || 'Truck type removed');
      await loadData();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to delete truck type');
    } finally {
      setSaving(false);
    }
  };

  // ── Rule CRUD ─────────────────────────────────────────────────────────────
  const saveRule = async (formData) => {
    setSaving(true);
    try {
      await pricingAPI.upsertRule(formData);
      flash('Price saved');
      setModal(null);
      await loadData();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async (ruleId) => {
    setSaving(true);
    try {
      await pricingAPI.deleteRule(ruleId);
      flash('Price rule removed');
      setModal(null);
      await loadData();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to delete rule');
    } finally {
      setSaving(false);
    }
  };

  // ── Seed defaults ─────────────────────────────────────────────────────────
  const handleSeedDefaults = async () => {
    if (!window.confirm('This will create the default 5 zones, 4 truck types, and full pricing matrix. Continue?')) return;
    setSeeding(true);
    setError('');
    try {
      const r = await pricingAPI.seedDefaults();
      flash(`✅ ${r.data.zones} zones, ${r.data.truckTypes} truck types, and ${r.data.rules} price rules created.`);
      await loadData();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to seed defaults');
    } finally {
      setSeeding(false);
    }
  };

  // ── Sorted lists ──────────────────────────────────────────────────────────
  const sortedZones      = [...data.zones].sort((a, b) => a.zoneNumber - b.zoneNumber);
  const sortedTruckTypes = [...data.truckTypes].sort((a, b) =>
    (a.sortOrder - b.sortOrder) || (a.capacityTons - b.capacityTons)
  );

  return (
    <div className="admin-pricing">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Pricing Management</h1>
          <p className="page-subtitle">Configure zones, vehicle types, and the pricing matrix</p>
        </div>
      </div>

      {/* ── Status banner ── */}
      <div className={`ap-status-banner ${isDynamic ? 'ap-status--active' : isPartial ? 'ap-status--partial' : 'ap-status--static'}`}>
        <span className="ap-status-dot" />
        <div className="ap-status-text">
          {isDynamic
            ? `Dynamic pricing active — ${configuredCells} rules covering ${data.zones.length} zones × ${data.truckTypes.length} vehicle types`
            : isPartial
            ? `Partial config — ${configuredCells} of ${totalCells} cells configured. Unconfigured routes fall back to weight-based pricing.`
            : 'No dynamic pricing configured — all bookings use the built-in weight-based pricing engine'}
        </div>
        {!isDynamic && !isPartial && data.zones.length === 0 && (
          <button className="ap-seed-btn" onClick={handleSeedDefaults} disabled={seeding}>
            {seeding ? <span className="spinner spinner-sm" /> : '⚡ Initialise Default Pricing'}
          </button>
        )}
      </div>

      {/* ── Alerts ── */}
      {error   && <div className="order-error" style={{ marginBottom: 16 }}>⚠ {error}</div>}
      {success && <div className="ap-success">✓ {success}</div>}

      {/* ── Summary stats ── */}
      <div className="ap-stats-row">
        {[
          { label: 'Zones',        val: data.zones.length,      icon: '🗺️' },
          { label: 'Vehicle Types',val: data.truckTypes.length, icon: '🚛' },
          { label: 'Price Rules',  val: data.rules.length,      icon: '💰' },
          { label: 'Coverage',     val: totalCells > 0 ? `${Math.round(configuredCells / totalCells * 100)}%` : '—', icon: '📊' },
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

      {/* ── Tabs ── */}
      <div className="ap-tabs">
        {[
          { id: 'matrix',     label: 'Pricing Matrix' },
          { id: 'zones',      label: `Zones (${data.zones.length})` },
          { id: 'truckTypes', label: `Vehicle Types (${data.truckTypes.length})` },
        ].map(t => (
          <button key={t.id} className={`ap-tab ${tab === t.id ? 'ap-tab--active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          MATRIX TAB
      ══════════════════════════════════════════════════════ */}
      {tab === 'matrix' && (
        <div className="card ap-matrix-card">
          {loading ? (
            <div className="ap-loading-rows">
              {Array(4).fill(0).map((_, i) => <div key={i} className="shimmer" style={{ height: 48, borderRadius: 8, marginBottom: 8 }} />)}
            </div>
          ) : data.zones.length === 0 || data.truckTypes.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">💰</div>
              <h3>No pricing configured yet</h3>
              <p>Click "Initialise Default Pricing" above to seed zones, vehicle types, and a starting price matrix. Or create zones and vehicle types manually using the tabs.</p>
            </div>
          ) : (
            <>
              <p className="ap-matrix-legend">Click any cell to set or edit the price for that zone × vehicle combination.</p>
              <div className="ap-matrix-scroll">
                <table className="ap-matrix-table">
                  <thead>
                    <tr>
                      <th className="ap-matrix-corner">Zone</th>
                      {sortedTruckTypes.map(tt => (
                        <th key={tt._id} className="ap-matrix-th">
                          <span className="ap-matrix-icon">{tt.icon}</span>
                          <span className="ap-matrix-th-name">{tt.name}</span>
                          <span className="ap-matrix-th-cap">{tt.capacityTons}t</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedZones.map(zone => (
                      <tr key={zone._id}>
                        <td className={`ap-matrix-zone-cell ${!zone.isActive ? 'ap-inactive' : ''}`}>
                          <p className="ap-zone-cell-name">{zone.name}</p>
                          <span className="ap-zone-num-badge">Zone {zone.zoneNumber}</span>
                          {!zone.isActive && <span className="ap-inactive-tag">inactive</span>}
                        </td>
                        {sortedTruckTypes.map(tt => {
                          const rule = getCellRule(zone._id, tt._id);
                          const inactive = !zone.isActive || !tt.isActive;
                          return (
                            <td key={tt._id}
                              className={`ap-matrix-cell ${rule ? 'ap-matrix-cell--set' : 'ap-matrix-cell--empty'} ${inactive ? 'ap-matrix-cell--inactive' : ''}`}
                              onClick={() => !inactive && setModal({ type: 'rule', zone, truckType: tt, rule: rule || null })}
                              title={inactive ? 'Zone or vehicle type is inactive' : rule ? `₦${fmt(rule.basePrice)} base${rule.pricePerKm > 0 ? ` + ₦${fmt(rule.pricePerKm)}/km` : ''}` : 'Click to set price'}
                            >
                              {rule ? (
                                <div className="ap-cell-price">
                                  <span className="ap-cell-base">₦{fmt(rule.basePrice)}</span>
                                  {rule.pricePerKm > 0 && (
                                    <span className="ap-cell-perkm">+₦{fmt(rule.pricePerKm)}/km</span>
                                  )}
                                </div>
                              ) : inactive ? (
                                <span className="ap-cell-dash">—</span>
                              ) : (
                                <span className="ap-cell-empty-hint">Set price</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="ap-matrix-footer">
                <div className="ap-legend">
                  <span className="ap-legend-item"><span className="ap-legend-swatch ap-legend-set" />Price set</span>
                  <span className="ap-legend-item"><span className="ap-legend-swatch ap-legend-empty" />Not configured (uses weight-based fallback)</span>
                  <span className="ap-legend-item"><span className="ap-legend-swatch ap-legend-inactive" />Inactive</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          ZONES TAB
      ══════════════════════════════════════════════════════ */}
      {tab === 'zones' && (
        <div className="card">
          <div className="ap-list-header">
            <p className="ap-list-title">Distance Zones</p>
            <button className="btn-primary ap-add-btn" onClick={() => setModal({ type: 'zone', mode: 'create', data: null })}>
              + Add Zone
            </button>
          </div>
          {loading ? (
            <div style={{ padding: 20 }}>
              {Array(3).fill(0).map((_, i) => <div key={i} className="shimmer" style={{ height: 60, borderRadius: 8, marginBottom: 10 }} />)}
            </div>
          ) : sortedZones.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <div className="empty-icon">🗺️</div>
              <h3>No zones defined</h3>
              <p>Create zones to enable dynamic zone-based pricing</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Zone</th>
                    <th>Cities</th>
                    <th>Rules</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedZones.map(zone => {
                    const ruleCount = data.rules.filter(r =>
                      (r.zoneId?._id || r.zoneId)?.toString() === zone._id.toString()
                    ).length;
                    return (
                      <tr key={zone._id}>
                        <td>
                          <div className="ap-zone-name">{zone.name}</div>
                          <div className="td-sub">Zone {zone.zoneNumber}{zone.description ? ` · ${zone.description}` : ''}</div>
                        </td>
                        <td>
                          <div className="ap-city-tags">
                            {(zone.cities || []).slice(0, 5).map(c => (
                              <span key={c} className="ap-city-tag">{c}</span>
                            ))}
                            {(zone.cities?.length || 0) > 5 && (
                              <span className="ap-city-tag ap-city-more">+{zone.cities.length - 5} more</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${ruleCount > 0 ? 'badge-paid' : 'badge-pending'}`}>
                            {ruleCount} rule{ruleCount !== 1 ? 's' : ''}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${zone.isActive !== false ? 'badge-delivered' : 'badge-cancelled'}`}>
                            {zone.isActive !== false ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <div className="td-actions">
                            <button className="assign-btn" onClick={() => setModal({ type: 'zone', mode: 'edit', data: zone })}>
                              Edit
                            </button>
                            <button className="btn-ghost" style={{ padding: '5px 8px', fontSize: 13, color: 'var(--red)' }}
                              onClick={() => deleteZone(zone._id)}>
                              {zone.isActive !== false ? 'Deactivate' : 'Delete'}
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

      {/* ══════════════════════════════════════════════════════
          TRUCK TYPES TAB
      ══════════════════════════════════════════════════════ */}
      {tab === 'truckTypes' && (
        <div className="card">
          <div className="ap-list-header">
            <p className="ap-list-title">Vehicle / Truck Types</p>
            <button className="btn-primary ap-add-btn" onClick={() => setModal({ type: 'truckType', mode: 'create', data: null })}>
              + Add Vehicle Type
            </button>
          </div>
          {loading ? (
            <div style={{ padding: 20 }}>
              {Array(3).fill(0).map((_, i) => <div key={i} className="shimmer" style={{ height: 60, borderRadius: 8, marginBottom: 10 }} />)}
            </div>
          ) : sortedTruckTypes.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <div className="empty-icon">🚛</div>
              <h3>No vehicle types defined</h3>
              <p>Add vehicle types to let customers choose the right truck for their load</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Capacity</th>
                    <th>Rules</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTruckTypes.map(tt => {
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
                        <td>
                          <span className="ap-capacity-badge">{tt.capacityTons} ton{tt.capacityTons !== 1 ? 's' : ''}</span>
                        </td>
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
                            <button className="assign-btn" onClick={() => setModal({ type: 'truckType', mode: 'edit', data: tt })}>
                              Edit
                            </button>
                            <button className="btn-ghost" style={{ padding: '5px 8px', fontSize: 13, color: 'var(--red)' }}
                              onClick={() => deleteTruckType(tt._id)}>
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

      {/* ══════════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════════ */}
      {modal?.type === 'zone' && (
        <Modal
          title={modal.mode === 'edit' ? `Edit Zone: ${modal.data.name}` : 'New Distance Zone'}
          onClose={() => setModal(null)}
        >
          <ZoneForm
            initial={modal.data}
            onSave={saveZone}
            onCancel={() => setModal(null)}
            saving={saving}
          />
        </Modal>
      )}

      {modal?.type === 'truckType' && (
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

      {modal?.type === 'rule' && (
        <Modal
          title="Set Pricing Rule"
          onClose={() => setModal(null)}
        >
          <RuleForm
            zone={modal.zone}
            truckType={modal.truckType}
            rule={modal.rule}
            onSave={saveRule}
            onDelete={() => modal.rule && deleteRule(modal.rule._id)}
            onCancel={() => setModal(null)}
            saving={saving}
          />
        </Modal>
      )}
    </div>
  );
}
