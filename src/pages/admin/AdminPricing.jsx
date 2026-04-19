import { useState, useEffect, useCallback, useRef } from 'react';
import { pricingAPI } from '../../api/client.js';
import './AdminPricing.css';

const ZONES = ['North West', 'North East', 'North Central', 'South West', 'South East', 'South South'];
const fmt = n => new Intl.NumberFormat('en-NG').format(Number(n || 0));

// ── Modal ─────────────────────────────────────────────────────────────────────
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

// ── Truck Type Form ───────────────────────────────────────────────────────────
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
    onSave({ name: form.name.trim(), description: form.description.trim(), capacityTons: Number(form.capacityTons), icon: form.icon, sortOrder: Number(form.sortOrder) });
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
            <button key={ic} type="button" className={`ap-icon-btn${form.icon === ic ? ' selected' : ''}`} onClick={() => setForm(f => ({ ...f, icon: ic }))}>
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

// ── Inline number cell (for multiplier / band grids) ──────────────────
function InlineCell({ value, prefix = '', suffix = '', onSave, className = '' }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState('');
  const ref = useRef(null);

  const open = () => { setVal(String(value ?? '')); setEditing(true); requestAnimationFrame(() => ref.current?.select()); };
  const commit = () => {
    setEditing(false);
    const n = parseFloat(val);
    if (!isNaN(n) && n !== value) onSave(n);
  };
  const onKey = e => {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { setEditing(false); }
  };

  if (editing) return (
    <td className="ap-matrix-cell ap-cell-editing">
      <div className="ap-inline-wrap">
        {prefix && <span className="ap-inline-naira">{prefix}</span>}
        <input ref={ref} className="ap-inline-input" type="number" step="any" value={val}
          onChange={e => setVal(e.target.value)} onBlur={commit} onKeyDown={onKey} autoFocus />
        {suffix && <span className="ap-inline-suffix">{suffix}</span>}
      </div>
    </td>
  );

  return (
    <td className={`ap-matrix-cell ap-cell--set ${className}`} onClick={open} title="Click to edit">
      <span className="ap-eng-val">{prefix}{value ?? '—'}{suffix}</span>
    </td>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function AdminPricing() {
  const [tab,      setTab]     = useState('fees');
  const [data,     setData]    = useState({ truckTypes: [], pricingConfig: null });
  const [cfg,      setCfg]     = useState(null);   // live editable copy of pricingConfig
  const [loading,  setLoading] = useState(true);
  const [saving,   setSaving]  = useState(false);
  const [seeding,  setSeeding] = useState(false);
  const [error,    setError]   = useState('');
  const [success,  setSuccess] = useState('');
  const [modal,    setModal]   = useState(null);

  // ── Load ─────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await pricingAPI.adminFull();
      setData(r.data);
      if (r.data.pricingConfig) setCfg(structuredClone(r.data.pricingConfig));
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load pricing data');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const flash = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); };

  // ── Save engine (partial merge) ───────────────────────────────────────────
  const saveEngine = async (patch) => {
    setSaving(true); setError('');
    try {
      const next = { ...cfg, ...patch };
      await pricingAPI.updateEngine(next);
      setCfg(next);
      setData(d => ({ ...d, pricingConfig: next }));
      flash('✓ Pricing config saved');
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to save config');
    } finally { setSaving(false); }
  };

  // ── Seed defaults ─────────────────────────────────────────────────────────
  const handleSeed = async () => {
    if (!window.confirm('Initialize Nigerian states, vehicle types, and default pricing config? Existing vehicle types will be replaced.')) return;
    setSeeding(true); setError('');
    try {
      await pricingAPI.seedDefaults();
      flash('✅ Defaults initialized!');
      await loadData();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to initialize');
    } finally { setSeeding(false); }
  };

  // ── Vehicle type CRUD ─────────────────────────────────────────────────────
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
    } catch (e) { setError(e?.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const deleteTruckType = async id => {
    if (!window.confirm('Deactivate this vehicle type?')) return;
    setSaving(true);
    try {
      await pricingAPI.deleteTruckType(id);
      flash('Vehicle type deactivated'); await loadData();
    } catch (e) { setError(e?.response?.data?.message || 'Failed to deactivate'); }
    finally { setSaving(false); }
  };

  const sortedTrucks = [...(data.truckTypes || [])].sort(
    (a, b) => (a.sortOrder - b.sortOrder) || (a.capacityTons - b.capacityTons)
  );

  const TABS = [
    { id: 'fees',        label: 'Fee Structure'     },
    { id: 'distance',    label: 'Distance Bands'    },
    { id: 'multipliers', label: 'Route Multipliers' },
    { id: 'vehicles',    label: `Vehicle Types (${sortedTrucks.length})` },
  ];

  // ── Empty state — PricingConfig not seeded yet ───────────────────────────
  // Show seed button whenever the pricing engine config is missing,
  // even if truck types already exist from an old seed run.
  const noData = !loading && !cfg;

  return (
    <div className="admin-pricing">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Pricing Management</h1>
          <p className="page-subtitle">Engine: distance × route × extras — all configurable</p>
        </div>
        {cfg && (
          <button className="btn-secondary ap-reseed-btn" onClick={handleSeed} disabled={seeding}>
            {seeding ? <span className="spinner spinner-sm" /> : '↺ Re-seed Defaults'}
          </button>
        )}
      </div>

      {/* Alerts */}
      {error   && <div className="order-error" style={{ marginBottom: 16 }}>⚠ {error}</div>}
      {success && <div className="ap-success">{success}</div>}

      {/* Stats */}
      {cfg && (
        <div className="ap-stats-row">
          {[
            { label: 'Vehicle Types',   val: sortedTrucks.length,          icon: '🚛' },
            { label: 'Distance Bands',  val: cfg.distanceBands?.length ?? 0,  icon: '📏' },
            { label: 'Route Factors',   val: cfg.routeMultipliers?.length ?? 0,icon: '🗺️' },
            { label: 'Minimum Charge',  val: `₦${fmt(cfg.minimumCharge)}`,     icon: '💰' },
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

      {/* Empty / Seed Setup */}
      {noData && (
        <div className="card ap-matrix-card">
          <div className="ap-empty-setup">
            <div className="ap-setup-icon">⚙️</div>
            <h3 className="ap-setup-title">Pricing engine not configured</h3>
            <p className="ap-eng-sub" style={{ maxWidth: 480 }}>
              {sortedTrucks.length > 0
                ? `Vehicle types exist but the pricing config is missing. Click below to seed the engine config (distance bands and zone multipliers) — existing vehicle types will be replaced.`
                : `Seed the 36 Nigerian states, 4 default vehicle types, and a complete pricing config with distance bands and zone multipliers.`}
            </p>
            <button className="btn-primary ap-setup-btn" onClick={handleSeed} disabled={seeding}>
              {seeding ? <><span className="spinner spinner-sm" /> Setting up…</> : '⚡ Initialize Pricing Engine'}
            </button>
          </div>
        </div>
      )}

      {/* Loading shimmer */}
      {loading && (
        <div className="card ap-matrix-card">
          <div className="ap-loading-rows">
            {[1,2,3,4,5].map(i => <div key={i} className="shimmer" style={{ height: 44, borderRadius: 8, marginBottom: 8 }} />)}
          </div>
        </div>
      )}

      {/* Only show tabs when config exists */}
      {!loading && cfg && (
        <>
          <div className="ap-tabs">
            {TABS.map(t => (
              <button key={t.id} className={`ap-tab${tab === t.id ? ' ap-tab--active' : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ══ TAB: FEE STRUCTURE ══════════════════════════════════════════ */}
          {tab === 'fees' && (
            <FeeStructureTab
              cfg={cfg}
              truckTypes={sortedTrucks}
              saving={saving}
              onSave={saveEngine}
            />
          )}

          {/* ══ TAB: DISTANCE BANDS ════════════════════════════════════════ */}
          {tab === 'distance' && (
            <DistanceBandsTab cfg={cfg} saving={saving} onSave={saveEngine} />
          )}

          {/* ══ TAB: ROUTE MULTIPLIERS ═════════════════════════════════════ */}
          {tab === 'multipliers' && (
            <RouteMultipliersTab cfg={cfg} saving={saving} onSave={saveEngine} />
          )}

          {/* ══ TAB: VEHICLE TYPES ═════════════════════════════════════════ */}
          {tab === 'vehicles' && (
            <div className="card fade-in">
              <div className="ap-list-header">
                <p className="ap-list-title">Vehicle / Truck Types</p>
                <button className="btn-primary ap-add-btn" onClick={() => setModal({ type: 'truck', mode: 'create', data: null })}>
                  + Add Vehicle Type
                </button>
              </div>
              {sortedTrucks.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 0' }}>
                  <div className="empty-icon">🚛</div>
                  <h3>No vehicle types defined</h3>
                  <p>Add vehicle types — customers select one when booking</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Vehicle</th>
                        <th>Capacity</th>
                        <th>Base Fee</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTrucks.map(tt => {
                        const baseFee = cfg.baseFees?.find(b => b.truckTypeId?.toString() === tt._id.toString())?.amount;
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
                            <td><span style={{ fontWeight: 700 }}>{baseFee ? `₦${fmt(baseFee)}` : '—'}</span></td>
                            <td>
                              <span className={`badge ${tt.isActive !== false ? 'badge-delivered' : 'badge-cancelled'}`}>
                                {tt.isActive !== false ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td>
                              <div className="td-actions">
                                <button className="assign-btn" onClick={() => setModal({ type: 'truck', mode: 'edit', data: tt })}>Edit</button>
                                <button className="btn-ghost" style={{ padding: '5px 8px', fontSize: 13, color: 'var(--red)' }} onClick={() => deleteTruckType(tt._id)}>
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
        </>
      )}

      {/* Modal */}
      {modal?.type === 'truck' && (
        <Modal title={modal.mode === 'edit' ? `Edit: ${modal.data.name}` : 'New Vehicle Type'} onClose={() => setModal(null)}>
          <TruckTypeForm initial={modal.data} onSave={saveTruckType} onCancel={() => setModal(null)} saving={saving} />
        </Modal>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  FEE STRUCTURE TAB
// ══════════════════════════════════════════════════════════════════════════════
function FeeStructureTab({ cfg, truckTypes, saving, onSave }) {
  // Build baseFees map: truckTypeId → amount
  const initialBaseMap = () => {
    const m = {};
    (cfg.baseFees || []).forEach(b => { m[b.truckTypeId?.toString()] = b.amount; });
    return m;
  };

  const [baseMap,      setBaseMap]      = useState(initialBaseMap);
  const [minCharge,    setMinCharge]    = useState(cfg.minimumCharge ?? 5000);
  const [doorFee,      setDoorFee]      = useState(cfg.deliveryFees?.doorDelivery ?? 1500);
  const [depotFee,     setDepotFee]     = useState(cfg.deliveryFees?.depotPickup  ?? 0);
  const [insurance,    setInsurance]    = useState(cfg.optionalFees?.insurancePercent  ?? 1);
  const [express,      setExpress]      = useState(cfg.optionalFees?.expressFee        ?? 2000);
  const [sameday,      setSameday]      = useState(cfg.optionalFees?.samedayFee        ?? 3000);

  const handleSave = () => {
    const baseFees = truckTypes.map(tt => ({
      truckTypeId: tt._id,
      amount:      Number(baseMap[tt._id.toString()] || 0),
    }));
    onSave({
      baseFees,
      minimumCharge: Number(minCharge),
      deliveryFees:  { doorDelivery: Number(doorFee), depotPickup: Number(depotFee) },
      optionalFees:  {
        insurancePercent: Number(insurance),
        expressFee:       Number(express),
        samedayFee:       Number(sameday),
      },
    });
  };

  const NInput = ({ label, value, onChange, prefix, suffix, hint }) => (
    <div className="ap-eng-field">
      <label className="ap-label">{label}</label>
      {hint && <span className="ap-field-hint">{hint}</span>}
      <div className="ap-eng-input-wrap">
        {prefix && <span className="ap-eng-prefix">{prefix}</span>}
        <input className="ap-input" type="number" min="0" step="any" value={value} onChange={e => onChange(e.target.value)} />
        {suffix && <span className="ap-eng-suffix">{suffix}</span>}
      </div>
    </div>
  );

  return (
    <div className="ap-engine-tab fade-in">

      {/* Base fees */}
      <div className="ap-eng-section">
        <h3 className="ap-eng-title">Base Fee by Vehicle Type</h3>
        <p className="ap-eng-sub">Fixed charge applied to every shipment regardless of distance.</p>
        <div className="ap-base-fees-grid">
          {truckTypes.map(tt => (
            <div key={tt._id} className="ap-base-fee-card">
              <div className="ap-bfc-header">
                <span className="ap-bfc-icon">{tt.icon}</span>
                <div>
                  <p className="ap-bfc-name">{tt.name}</p>
                  <p className="ap-bfc-cap">{tt.capacityTons}t capacity</p>
                </div>
              </div>
              <div className="ap-eng-input-wrap">
                <span className="ap-eng-prefix">₦</span>
                <input
                  className="ap-input"
                  type="number"
                  min="0"
                  step="500"
                  value={baseMap[tt._id.toString()] ?? ''}
                  onChange={e => setBaseMap(m => ({ ...m, [tt._id.toString()]: e.target.value }))}
                  placeholder="e.g. 5000"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Delivery mode fees */}
      <div className="ap-eng-section">
        <h3 className="ap-eng-title">Delivery Mode Fees</h3>
        <p className="ap-eng-sub">Charged based on whether the receiver gets door delivery or picks up at a depot.</p>
        <div className="ap-eng-row">
          <NInput label="🏠 Door Delivery" value={doorFee}  onChange={setDoorFee}  prefix="₦" hint="Added when delivery mode = door" />
          <NInput label="🏢 Depot Pickup"  value={depotFee} onChange={setDepotFee} prefix="₦" hint="Usually ₦0 — receiver picks up themselves" />
          <NInput label="💰 Minimum Charge" value={minCharge} onChange={setMinCharge} prefix="₦" hint="No order can be priced below this" />
        </div>
      </div>

      {/* Optional extras */}
      <div className="ap-eng-section">
        <h3 className="ap-eng-title">Optional Extras</h3>
        <p className="ap-eng-sub">Applied only when the customer selects the relevant option at checkout.</p>
        <div className="ap-eng-row">
          <NInput label="🛡 Insurance"         value={insurance} onChange={setInsurance} suffix="% of declared value" />
          <NInput label="⚡ Express Fee"        value={express}   onChange={setExpress}   prefix="₦" hint="Flat fee for express delivery" />
          <NInput label="🕐 Same Day Fee"      value={sameday}   onChange={setSameday}   prefix="₦" hint="Flat fee for same-day delivery" />
        </div>
      </div>

      <div className="ap-eng-save-row">
        <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ minWidth: 160 }}>
          {saving ? <span className="spinner spinner-sm" /> : 'Save Fee Structure'}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  DISTANCE BANDS TAB
// ══════════════════════════════════════════════════════════════════════════════
function DistanceBandsTab({ cfg, saving, onSave }) {
  const [bands, setBands] = useState(() =>
    (cfg.distanceBands || []).map((b, i) => ({ ...b, _key: i }))
  );
  const nextKey = useRef(bands.length);

  const update = (key, field, value) =>
    setBands(bs => bs.map(b => b._key === key ? { ...b, [field]: value === '' ? null : Number(value) } : b));

  const addBand = () => {
    const last = bands[bands.length - 1];
    setBands(bs => [...bs, { _key: nextKey.current++, minKm: (last?.maxKm ?? 0) + 1, maxKm: null, ratePerKm: 100, billedMinKm: 0 }]);
  };

  const removeBand = key => setBands(bs => bs.filter(b => b._key !== key));

  const handleSave = () => {
    const distanceBands = bands.map(({ _key, ...b }) => b);
    onSave({ distanceBands });
  };

  return (
    <div className="ap-engine-tab fade-in">
      <div className="ap-eng-section">
        <div className="ap-eng-section-header">
          <div>
            <h3 className="ap-eng-title">Distance Bands</h3>
            <p className="ap-eng-sub">Distance cost = billedKm × rate/km × route multiplier. Click any cell to edit.</p>
          </div>
          <button className="btn-secondary ap-add-row-btn" onClick={addBand}>+ Add Band</button>
        </div>
        <div className="ap-matrix-scroll" style={{ marginBottom: 0 }}>
          <table className="ap-matrix-table ap-eng-table">
            <thead>
              <tr>
                <th>Min KM</th>
                <th>Max KM</th>
                <th>Rate per KM (₦)</th>
                <th>Billed Min KM</th>
                <th>Example</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bands.map(b => (
                <tr key={b._key}>
                  <td className="ap-eng-td">
                    <input className="ap-inline-num" type="number" min="0" value={b.minKm ?? ''} onChange={e => update(b._key, 'minKm', e.target.value)} />
                  </td>
                  <td className="ap-eng-td">
                    <input className="ap-inline-num" type="number" min="0" value={b.maxKm ?? ''} placeholder="∞" onChange={e => update(b._key, 'maxKm', e.target.value === '' ? null : e.target.value)} />
                  </td>
                  <td className="ap-eng-td">
                    <div className="ap-inline-prefix-wrap">
                      <span className="ap-inline-label">₦</span>
                      <input className="ap-inline-num" type="number" min="0" value={b.ratePerKm ?? ''} onChange={e => update(b._key, 'ratePerKm', e.target.value)} />
                    </div>
                  </td>
                  <td className="ap-eng-td">
                    <input className="ap-inline-num" type="number" min="0" value={b.billedMinKm ?? 0} onChange={e => update(b._key, 'billedMinKm', e.target.value)} />
                  </td>
                  <td className="ap-eng-td ap-eng-example">
                    {b.ratePerKm > 0 && (b.billedMinKm > 0
                      ? `${b.billedMinKm}km min → ₦${new Intl.NumberFormat('en-NG').format(b.billedMinKm * b.ratePerKm)}`
                      : b.maxKm
                      ? `100km → ₦${new Intl.NumberFormat('en-NG').format(Math.min(100, b.maxKm) * b.ratePerKm)}`
                      : `—`
                    )}
                  </td>
                  <td style={{ padding: '0 12px', textAlign: 'center' }}>
                    <button className="ap-del-btn" onClick={() => removeBand(b._key)} title="Remove band">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ap-eng-table-hint">
          Set Max KM to empty (∞) for the last band. Billed Min KM ensures short trips pay a minimum distance fee.
        </div>
      </div>
      <div className="ap-eng-save-row">
        <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ minWidth: 160 }}>
          {saving ? <span className="spinner spinner-sm" /> : 'Save Distance Bands'}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  ROUTE MULTIPLIERS TAB
// ══════════════════════════════════════════════════════════════════════════════
function RouteMultipliersTab({ cfg, saving, onSave }) {
  // Build multiplier map: "fromZone||toZone" → multiplier
  const buildMap = mults =>
    Object.fromEntries((mults || []).map(m => [`${m.fromZone}||${m.toZone}`, m.multiplier]));

  const [multMap, setMultMap] = useState(() => buildMap(cfg.routeMultipliers));

  const get = (from, to) => multMap[`${from}||${to}`] ?? '';

  const set = (from, to, val) =>
    setMultMap(m => ({ ...m, [`${from}||${to}`]: val === '' ? undefined : Number(val) }));

  const handleSave = () => {
    const routeMultipliers = [];
    for (const from of ZONES) {
      for (const to of ZONES) {
        const v = multMap[`${from}||${to}`];
        if (v !== undefined) routeMultipliers.push({ fromZone: from, toZone: to, multiplier: Number(v) });
      }
    }
    onSave({ routeMultipliers });
  };

  const MultiplierCell = ({ from, to }) => {
    const val = get(from, to);
    const [editing, setEditing] = useState(false);
    const [local, setLocal]     = useState('');
    const ref = useRef(null);

    const open = () => { setLocal(String(val ?? '')); setEditing(true); requestAnimationFrame(() => ref.current?.select()); };
    const commit = () => { setEditing(false); set(from, to, local); };
    const onKey = e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') setEditing(false); };

    const mult = parseFloat(val);
    const isSame = from === to;
    const color = isSame ? '#6366f1' : mult >= 1.4 ? '#ef4444' : mult >= 1.2 ? '#f59e0b' : '#22c55e';

    if (editing) return (
      <td className="ap-matrix-cell ap-cell-editing">
        <div className="ap-inline-wrap">
          <input ref={ref} className="ap-inline-input" type="number" step="0.05" min="0.5" max="3"
            value={local} onChange={e => setLocal(e.target.value)} onBlur={commit} onKeyDown={onKey} autoFocus />
          <span className="ap-inline-suffix">×</span>
        </div>
      </td>
    );

    return (
      <td className="ap-matrix-cell ap-cell--set ap-mult-cell" onClick={open}
        title={`${from} → ${to}: ×${val || '—'} (click to edit)`}>
        <span className="ap-mult-val" style={{ color }}>
          {val !== '' && val !== undefined ? `×${val}` : '—'}
        </span>
      </td>
    );
  };

  return (
    <div className="ap-engine-tab fade-in">
      <div className="ap-eng-section">
        <div className="ap-eng-section-header">
          <div>
            <h3 className="ap-eng-title">Zone-to-Zone Route Multipliers</h3>
            <p className="ap-eng-sub">
              Applied to the raw distance cost. ×1.0 = no adjustment. ×1.3 = 30% more for that route.
              Click any cell to edit. Missing pairs default to ×1.0.
            </p>
          </div>
        </div>

        <div className="ap-mult-legend">
          <span className="ap-mult-dot" style={{ background: '#6366f1' }} /> Same zone (×1.0)
          <span className="ap-mult-dot" style={{ background: '#22c55e' }} /> Low (&lt;×1.2)
          <span className="ap-mult-dot" style={{ background: '#f59e0b' }} /> Medium (×1.2–1.39)
          <span className="ap-mult-dot" style={{ background: '#ef4444' }} /> High (≥×1.4)
        </div>

        <div className="ap-matrix-scroll">
          <table className="ap-matrix-table">
            <thead>
              <tr>
                <th className="ap-matrix-corner">
                  <span className="ap-corner-from">Origin</span>
                  <span className="ap-corner-sep"> ↘ </span>
                  <span className="ap-corner-to">Destination</span>
                </th>
                {ZONES.map(z => <th key={z} className="ap-matrix-th">{z}</th>)}
              </tr>
            </thead>
            <tbody>
              {ZONES.map(from => (
                <tr key={from}>
                  <td className="ap-matrix-zone-cell">{from}</td>
                  {ZONES.map(to => <MultiplierCell key={to} from={from} to={to} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ap-eng-table-hint">
          Changes take effect immediately after saving. The service recalculates on every new booking.
        </p>
      </div>
      <div className="ap-eng-save-row">
        <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ minWidth: 180 }}>
          {saving ? <span className="spinner spinner-sm" /> : 'Save Route Multipliers'}
        </button>
      </div>
    </div>
  );
}
