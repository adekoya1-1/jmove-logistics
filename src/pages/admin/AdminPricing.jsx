import { useState, useEffect, useCallback } from 'react';
import { pricingAPI } from '../../api/client.js';
import './AdminPricing.css';

const fmt = n => new Intl.NumberFormat('en-NG').format(Number(n || 0));

// ── All 37 Nigerian states + FCT ──────────────────────────────────────────
const NIGERIAN_STATES = [
  { key: 'abia',        name: 'Abia'        },
  { key: 'adamawa',     name: 'Adamawa'     },
  { key: 'akwa_ibom',   name: 'Akwa Ibom'   },
  { key: 'anambra',     name: 'Anambra'     },
  { key: 'bauchi',      name: 'Bauchi'      },
  { key: 'bayelsa',     name: 'Bayelsa'     },
  { key: 'benue',       name: 'Benue'       },
  { key: 'borno',       name: 'Borno'       },
  { key: 'cross_river', name: 'Cross River' },
  { key: 'delta',       name: 'Delta'       },
  { key: 'ebonyi',      name: 'Ebonyi'      },
  { key: 'edo',         name: 'Edo'         },
  { key: 'ekiti',       name: 'Ekiti'       },
  { key: 'enugu',       name: 'Enugu'       },
  { key: 'fct',         name: 'FCT – Abuja' },
  { key: 'gombe',       name: 'Gombe'       },
  { key: 'imo',         name: 'Imo'         },
  { key: 'jigawa',      name: 'Jigawa'      },
  { key: 'kaduna',      name: 'Kaduna'      },
  { key: 'kano',        name: 'Kano'        },
  { key: 'katsina',     name: 'Katsina'     },
  { key: 'kebbi',       name: 'Kebbi'       },
  { key: 'kogi',        name: 'Kogi'        },
  { key: 'kwara',       name: 'Kwara'       },
  { key: 'lagos',       name: 'Lagos'       },
  { key: 'nasarawa',    name: 'Nasarawa'    },
  { key: 'niger',       name: 'Niger'       },
  { key: 'ogun',        name: 'Ogun'        },
  { key: 'ondo',        name: 'Ondo'        },
  { key: 'osun',        name: 'Osun'        },
  { key: 'oyo',         name: 'Oyo'         },
  { key: 'plateau',     name: 'Plateau'     },
  { key: 'rivers',      name: 'Rivers'      },
  { key: 'sokoto',      name: 'Sokoto'      },
  { key: 'taraba',      name: 'Taraba'      },
  { key: 'yobe',        name: 'Yobe'        },
  { key: 'zamfara',     name: 'Zamfara'     },
];

const PALETTE = ['#3498DB','#8E44AD','#27AE60','#F39C12','#E74C3C','#2980B9','#E91E63','#16A085'];
const zoneColor = (idx) => PALETTE[idx % PALETTE.length];

// ── Modal ─────────────────────────────────────────────────────────────────
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

// ── Zone Form ─────────────────────────────────────────────────────────────
function ZoneForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name:        initial?.name        || '',
    description: initial?.description || '',
    states:      initial?.states?.join(', ') || '',
    sortOrder:   initial?.sortOrder   ?? 0,
  });
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const submit = e => {
    e.preventDefault();
    onSave({
      name:        form.name.trim(),
      description: form.description.trim(),
      states:      form.states.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
      sortOrder:   Number(form.sortOrder),
    });
  };
  return (
    <form className="ap-form" onSubmit={submit}>
      <div className="ap-form-row">
        <div className="ap-field">
          <label className="ap-label">Direction Name *</label>
          <input className="ap-input" value={form.name} onChange={set('name')} placeholder="e.g. South West" required />
        </div>
        <div className="ap-field ap-field--sm">
          <label className="ap-label">Sort Order</label>
          <input className="ap-input" type="number" min="0" value={form.sortOrder} onChange={set('sortOrder')} />
        </div>
      </div>
      <div className="ap-field">
        <label className="ap-label">Description</label>
        <input className="ap-input" value={form.description} onChange={set('description')} placeholder="Brief description" />
      </div>
      <div className="ap-field">
        <label className="ap-label">States <span className="ap-hint">(comma-separated lowercase keys, e.g. lagos, ogun, akwa_ibom)</span></label>
        <textarea className="ap-input ap-textarea" value={form.states} onChange={set('states')} placeholder="lagos, ogun, oyo, osun, ondo, ekiti" rows={3} />
      </div>
      <div className="ap-form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <span className="spinner spinner-sm" /> : initial ? 'Save Changes' : 'Create Direction'}
        </button>
      </div>
    </form>
  );
}

// ── Truck Type Form ───────────────────────────────────────────────────────
function TruckTypeForm({ initial, onSave, onCancel, saving }) {
  const ICONS = ['🚐','🚛','🚚','🏗️','🚜','🛻'];
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
            <button key={ic} type="button" className={`ap-icon-btn${form.icon === ic ? ' selected' : ''}`} onClick={() => setForm(f => ({ ...f, icon: ic }))}>{ic}</button>
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

// ── Rule Form (matrix cell) ───────────────────────────────────────────────
function RuleForm({ originZone, destZone, truckType, rule, onSave, onDelete, onCancel, saving }) {
  const [price, setPrice] = useState(rule?.price?.toString() ?? '');
  const submit = e => {
    e.preventDefault();
    onSave({ fromZoneId: originZone._id, toZoneId: destZone._id, truckTypeId: truckType._id, price: Number(price) });
  };
  return (
    <form className="ap-form" onSubmit={submit}>
      <div className="ap-rule-context">
        <div className="ap-rule-ctx-item">
          <span className="ap-rule-ctx-label">Direction Route</span>
          <span className="ap-rule-ctx-val">{originZone.name} → {destZone.name}</span>
        </div>
        <span className="ap-rule-ctx-sep">×</span>
        <div className="ap-rule-ctx-item">
          <span className="ap-rule-ctx-label">Vehicle</span>
          <span className="ap-rule-ctx-val">{truckType.icon} {truckType.name}</span>
        </div>
      </div>
      <div className="ap-field">
        <label className="ap-label">Price (₦) *</label>
        <input className="ap-input" type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 25000" required />
        <p className="ap-field-hint">Flat rate for this origin → destination direction with this vehicle type.</p>
      </div>
      <div className="ap-form-actions">
        {rule && <button type="button" className="ap-delete-rule-btn" onClick={onDelete} disabled={saving}>Remove Rule</button>}
        <button type="button" className="btn-secondary" onClick={onCancel} style={{ marginLeft: 'auto' }}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving || !price}>
          {saving ? <span className="spinner spinner-sm" /> : rule ? 'Update Price' : 'Set Price'}
        </button>
      </div>
    </form>
  );
}

// ── Quick Set Card ────────────────────────────────────────────────────────
// key={`qs-${zone._id}-${truckType?._id}-${version}`} forces remount on data change
function QuickSetCard({ zone, color, destZones, truckType, rules, onSave, saving }) {
  const initPrices = () => {
    const init = {};
    destZones.forEach(dz => {
      const r = rules.find(r =>
        (r.fromZoneId?._id  || r.fromZoneId )?.toString() === zone._id.toString() &&
        (r.toZoneId?._id    || r.toZoneId   )?.toString() === dz._id.toString()   &&
        (r.truckTypeId?._id || r.truckTypeId)?.toString() === truckType?._id?.toString()
      );
      init[dz._id.toString()] = r?.price?.toString() ?? '';
    });
    return init;
  };

  const [prices, setPrices]   = useState(initPrices);
  const [changed, setChanged] = useState({});

  const handleChange = (destId, val) => {
    setPrices(p  => ({ ...p,  [destId]: val }));
    setChanged(c => ({ ...c,  [destId]: true }));
  };

  const handleSave = async () => {
    const toSave = destZones
      .filter(dz => changed[dz._id.toString()] && prices[dz._id.toString()] !== '')
      .map(dz => ({
        fromZoneId:  zone._id,
        toZoneId:    dz._id,
        truckTypeId: truckType._id,
        price:       Number(prices[dz._id.toString()]),
      }));
    if (!toSave.length) return;
    await onSave(toSave);
  };

  const hasChanges = Object.values(changed).some(Boolean);
  const totalSet   = destZones.filter(dz => prices[dz._id.toString()] !== '').length;

  return (
    <div className="qs-card" style={{ borderTopColor: color }}>
      <div className="qs-card-header">
        <span className="qs-dot" style={{ background: color }} />
        <span className="qs-zone-name">{zone.name.toUpperCase()}</span>
        <span className="qs-set-count">{totalSet}/{destZones.length} set</span>
      </div>
      <p className="qs-states">
        {(zone.states || [])
          .map(k => NIGERIAN_STATES.find(s => s.key === k)?.name || k)
          .join(' · ') || 'No states assigned'}
      </p>

      <div className="qs-price-list">
        {destZones.map(dz => {
          const id = dz._id.toString();
          const isDirty = !!changed[id];
          return (
            <div key={id} className={`qs-price-row${isDirty ? ' qs-price-row--dirty' : ''}`}>
              <span className="qs-dest-name">→ {dz.name}</span>
              <div className="qs-input-wrap">
                <span className="qs-naira">₦</span>
                <input
                  className="qs-price-input"
                  type="number"
                  min="0"
                  placeholder="—"
                  value={prices[id] ?? ''}
                  onChange={e => handleChange(id, e.target.value)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {hasChanges && (
        <div className="qs-footer">
          <button className="btn-primary qs-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner spinner-sm" /> : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════
export default function AdminPricing() {
  const [tab,          setTab]          = useState('quickset');
  const [data,         setData]         = useState({ zones: [], truckTypes: [], rules: [] });
  const [activeTruck,  setActiveTruck]  = useState(0);   // index into sortedTruckTypes
  const [matrixTruck,  setMatrixTruck]  = useState('');  // _id string for matrix tab
  const [stateFilter,  setStateFilter]  = useState('all');
  const [stateEdits,   setStateEdits]   = useState({});  // { stateKey: zoneId }
  const [dirtyStates,  setDirtyStates]  = useState({});
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [savingStates, setSavingStates] = useState(false);
  const [seeding,      setSeeding]      = useState(false);
  const [qsVersion,    setQsVersion]    = useState(0);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState('');
  const [modal,        setModal]        = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await pricingAPI.adminFull();
      setData(r.data);
      if (r.data.truckTypes.length > 0 && !matrixTruck) {
        setMatrixTruck(r.data.truckTypes[0]._id.toString());
      }
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load pricing data');
    } finally { setLoading(false); }
  }, []); // eslint-disable-line

  useEffect(() => { loadData(); }, [loadData]);

  const flash = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); };

  // Sorted lists
  const sortedZones  = [...data.zones].sort((a, b) => a.sortOrder - b.sortOrder);
  const sortedTrucks = [...data.truckTypes].sort((a, b) => (a.sortOrder - b.sortOrder) || (a.capacityTons - b.capacityTons));
  const activeTruckObj = sortedTrucks[activeTruck] || sortedTrucks[0];

  // Helper: find pricing rule
  const getRule = (fromId, toId, truckId) =>
    data.rules.find(r =>
      (r.fromZoneId?._id  || r.fromZoneId )?.toString() === fromId.toString() &&
      (r.toZoneId?._id    || r.toZoneId   )?.toString() === toId.toString()   &&
      (r.truckTypeId?._id || r.truckTypeId)?.toString() === truckId.toString()
    );

  // Helper: find zone for a state
  const stateZone = stateKey =>
    data.zones.find(z => (z.states || []).includes(stateKey));

  // Color map by zone index
  const colorMap = sortedZones.reduce((m, z, i) => { m[z._id.toString()] = zoneColor(i); return m; }, {});

  // Stats
  const totalCells       = sortedZones.length * sortedZones.length * sortedTrucks.length;
  const configuredCells  = data.rules.filter(r => r.isActive !== false).length;
  const isDynamic        = totalCells > 0 && configuredCells === totalCells;
  const isPartial        = configuredCells > 0 && configuredCells < totalCells;

  // ── Zone CRUD ─────────────────────────────────────────────────────────
  const saveZone = async fd => {
    setSaving(true);
    try {
      if (modal.mode === 'edit') { await pricingAPI.updateZone(modal.data._id, fd); flash('Direction updated'); }
      else                       { await pricingAPI.createZone(fd); flash('Direction created'); }
      setModal(null); await loadData();
    } catch (e) { setError(e?.response?.data?.message || 'Failed to save direction'); }
    finally { setSaving(false); }
  };

  const deleteZone = async id => {
    if (!window.confirm('Deactivate this direction? Linked pricing rules will be preserved.')) return;
    setSaving(true);
    try {
      const r = await pricingAPI.deleteZone(id);
      flash(r.message || 'Direction removed'); await loadData();
    } catch (e) { setError(e?.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  // ── Truck type CRUD ───────────────────────────────────────────────────
  const saveTruckType = async fd => {
    setSaving(true);
    try {
      if (modal.mode === 'edit') { await pricingAPI.updateTruckType(modal.data._id, fd); flash('Vehicle type updated'); }
      else                       { await pricingAPI.createTruckType(fd); flash('Vehicle type created'); }
      setModal(null); await loadData();
    } catch (e) { setError(e?.response?.data?.message || 'Failed to save vehicle type'); }
    finally { setSaving(false); }
  };

  const deleteTruckType = async id => {
    if (!window.confirm('Deactivate this vehicle type? Linked pricing rules will be preserved.')) return;
    setSaving(true);
    try {
      const r = await pricingAPI.deleteTruckType(id);
      flash(r.message || 'Vehicle type removed'); await loadData();
    } catch (e) { setError(e?.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  // ── Rule CRUD (matrix cells) ──────────────────────────────────────────
  const saveRule = async fd => {
    setSaving(true);
    try {
      await pricingAPI.upsertRule(fd);
      flash('Price saved'); setModal(null); await loadData();
    } catch (e) { setError(e?.response?.data?.message || 'Failed to save rule'); }
    finally { setSaving(false); }
  };

  const deleteRule = async ruleId => {
    setSaving(true);
    try {
      await pricingAPI.deleteRule(ruleId);
      flash('Price rule removed'); setModal(null); await loadData();
    } catch (e) { setError(e?.response?.data?.message || 'Failed to delete rule'); }
    finally { setSaving(false); }
  };

  // ── Quick Set bulk save ───────────────────────────────────────────────
  const saveQuickSetRules = async rulesToSave => {
    setSaving(true);
    try {
      await Promise.all(rulesToSave.map(r => pricingAPI.upsertRule(r)));
      flash(`${rulesToSave.length} price${rulesToSave.length !== 1 ? 's' : ''} saved`);
      await loadData();
      setQsVersion(v => v + 1);
    } catch (e) { setError(e?.response?.data?.message || 'Failed to save prices'); }
    finally { setSaving(false); }
  };

  // ── State zone assignment ─────────────────────────────────────────────
  const saveOneState = async stateKey => {
    const newZoneId   = stateEdits[stateKey];
    const oldZone     = stateZone(stateKey);
    const oldZoneId   = oldZone?._id?.toString();
    if (newZoneId === oldZoneId) return;

    setSavingStates(true);
    try {
      const ops = [];
      if (oldZone) {
        const cleaned = (oldZone.states || []).filter(s => s !== stateKey);
        ops.push(pricingAPI.updateZone(oldZone._id, { states: cleaned }));
      }
      if (newZoneId) {
        const newZone = data.zones.find(z => z._id.toString() === newZoneId);
        if (newZone) {
          const updated = [...new Set([...(newZone.states || []), stateKey])];
          ops.push(pricingAPI.updateZone(newZoneId, { states: updated }));
        }
      }
      await Promise.all(ops);
      flash(`${NIGERIAN_STATES.find(s => s.key === stateKey)?.name || stateKey} direction updated`);
      setDirtyStates(p => { const n = { ...p }; delete n[stateKey]; return n; });
      setStateEdits(p =>  { const n = { ...p }; delete n[stateKey]; return n; });
      await loadData();
    } catch (e) { setError(e?.response?.data?.message || 'Failed to update state direction'); }
    finally { setSavingStates(false); }
  };

  const saveAllStates = async () => {
    const dirty = Object.keys(dirtyStates).filter(k => dirtyStates[k]);
    if (!dirty.length) return;
    setSavingStates(true);
    try {
      for (const stateKey of dirty) await saveOneState(stateKey);
    } finally { setSavingStates(false); }
  };

  // ── Seed defaults ─────────────────────────────────────────────────────
  const handleSeed = async () => {
    if (!window.confirm('Create the 7 Nigerian compass directions, vehicle types, and a full pricing matrix?')) return;
    setSeeding(true); setError('');
    try {
      const r = await pricingAPI.seedDefaults();
      flash(`✅ ${r.data.zones} directions, ${r.data.truckTypes} truck types, ${r.data.rules} pricing rules created.`);
      await loadData();
    } catch (e) { setError(e?.response?.data?.message || 'Failed to seed defaults'); }
    finally { setSeeding(false); }
  };

  // ── Filtered states (for states tab) ──────────────────────────────────
  const visibleStates = NIGERIAN_STATES.filter(s => {
    if (stateFilter === 'all') return true;
    const z = stateZone(s.key);
    return z?._id?.toString() === stateFilter;
  });

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="admin-pricing">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Pricing Management</h1>
          <p className="page-subtitle">Direction-based pricing — Origin direction → Destination direction → Vehicle type</p>
        </div>
        {data.zones.length === 0 && (
          <button className="btn-primary" onClick={handleSeed} disabled={seeding}>
            {seeding ? <span className="spinner spinner-sm" /> : '⚡ Initialise Compass Directions'}
          </button>
        )}
      </div>

      {/* Status banner */}
      <div className={`ap-status-banner ${isDynamic ? 'ap-status--active' : isPartial ? 'ap-status--partial' : 'ap-status--static'}`}>
        <span className="ap-status-dot" />
        <span>
          {isDynamic
            ? `Direction-based pricing active — ${configuredCells} rules covering ${sortedZones.length} directions × ${sortedTrucks.length} vehicle types`
            : isPartial
            ? `Partial config — ${configuredCells} of ${totalCells} cells configured. Unconfigured routes fall back to weight-based pricing.`
            : 'No direction pricing configured yet — all bookings use the built-in weight-based pricing engine.'}
        </span>
      </div>

      {/* Alerts */}
      {error   && <div className="order-error" style={{ marginBottom: 16 }}>⚠ {error}</div>}
      {success && <div className="ap-success">✓ {success}</div>}

      {/* Stats */}
      <div className="ap-stats-row">
        {[
          { label: 'Directions',      val: sortedZones.length,      icon: '🧭' },
          { label: 'Vehicle Types',  val: sortedTrucks.length,     icon: '🚛' },
          { label: 'Price Rules',    val: data.rules.length,       icon: '💰' },
          { label: 'Coverage',       val: totalCells > 0 ? `${Math.round(configuredCells / totalCells * 100)}%` : '—', icon: '📊' },
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

      {/* Tab bar */}
      <div className="ap-tabs">
        {[
          { id: 'quickset',   label: 'Direction Quick-Set'                        },
          { id: 'matrix',     label: 'Pricing Matrix'                             },
          { id: 'states',     label: `States (${NIGERIAN_STATES.length})`         },
          { id: 'zones',      label: `Directions (${sortedZones.length})`         },
          { id: 'truckTypes', label: `Vehicle Types (${sortedTrucks.length})`     },
        ].map(t => (
          <button key={t.id} className={`ap-tab${tab === t.id ? ' ap-tab--active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          TAB: ZONE QUICK-SET
      ══════════════════════════════════════════════════════ */}
      {tab === 'quickset' && (
        <div className="fade-in">
          <div className="qs-header-row">
            <div>
              <h3 className="qs-section-title">Direction Quick-Set</h3>
              <p className="qs-section-sub">Set the same delivery fee for all routes FROM each compass direction at once. Select a vehicle type, then enter prices.</p>
            </div>
          </div>

          {/* Vehicle type tabs */}
          {sortedTrucks.length > 0 && (
            <div className="ap-truck-tabs">
              {sortedTrucks.map((tt, i) => (
                <button
                  key={tt._id}
                  className={`ap-truck-tab${activeTruck === i ? ' ap-truck-tab--active' : ''}`}
                  onClick={() => setActiveTruck(i)}
                >
                  <span>{tt.icon}</span>
                  <span>{tt.name}</span>
                  <span className="ap-truck-cap">{tt.capacityTons}t</span>
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="ap-shimmer-grid">
              {[1,2,3,4,5,6].map(i => <div key={i} className="shimmer" style={{ height: 280, borderRadius: 10 }} />)}
            </div>
          ) : sortedZones.length === 0 ? (
            <div className="empty-state card">
              <div className="empty-icon">🧭</div>
              <h3>No directions configured</h3>
              <p>Click "Initialise Compass Directions" above to seed the 7 Nigerian compass directions, vehicle types, and a starter pricing matrix.</p>
            </div>
          ) : (
            <div className="qs-grid">
              {sortedZones.map((zone, idx) => (
                <QuickSetCard
                  key={`qs-${zone._id}-${activeTruckObj?._id}-${qsVersion}`}
                  zone={zone}
                  color={zoneColor(idx)}
                  destZones={sortedZones}
                  truckType={activeTruckObj}
                  rules={data.rules}
                  onSave={saveQuickSetRules}
                  saving={saving}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB: PRICING MATRIX
      ══════════════════════════════════════════════════════ */}
      {tab === 'matrix' && (
        <div className="card ap-matrix-card fade-in">
          {loading ? (
            <div className="ap-loading-rows">
              {[1,2,3,4].map(i => <div key={i} className="shimmer" style={{ height: 48, borderRadius: 8, marginBottom: 8 }} />)}
            </div>
          ) : sortedZones.length === 0 || sortedTrucks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🧭</div>
              <h3>No pricing configured yet</h3>
              <p>Use the "Direction Quick-Set" tab or click "Initialise Compass Directions" to get started.</p>
            </div>
          ) : (
            <>
              <div className="ap-matrix-toolbar">
                <p className="ap-matrix-legend">Click any cell to set or edit the price for that Origin Direction → Destination Direction route.</p>
                <select className="ap-input ap-truck-select" value={matrixTruck} onChange={e => setMatrixTruck(e.target.value)}>
                  {sortedTrucks.map(tt => <option key={tt._id} value={tt._id}>{tt.icon} {tt.name} ({tt.capacityTons}t)</option>)}
                </select>
              </div>
              <div className="ap-matrix-scroll">
                <table className="ap-matrix-table">
                  <thead>
                    <tr>
                      <th className="ap-matrix-corner">Origin Direction ↓ / Dest →</th>
                      {sortedZones.map((z, i) => (
                        <th key={z._id} className="ap-matrix-th">
                          <span className="ap-mth-dot" style={{ background: zoneColor(i) }} />
                          {z.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedZones.map((fromZ, fi) => (
                      <tr key={fromZ._id}>
                        <td className={`ap-matrix-zone-cell${!fromZ.isActive ? ' ap-inactive' : ''}`}>
                          <span className="ap-mth-dot" style={{ background: zoneColor(fi) }} />
                          {fromZ.name}
                          {!fromZ.isActive && <span className="ap-inactive-tag">inactive</span>}
                        </td>
                        {sortedZones.map((toZ, ti) => {
                          const tt    = sortedTrucks.find(t => t._id.toString() === matrixTruck);
                          const rule  = matrixTruck ? getRule(fromZ._id, toZ._id, matrixTruck) : null;
                          const dead  = !fromZ.isActive || !toZ.isActive || !tt?.isActive;
                          return (
                            <td
                              key={toZ._id}
                              className={`ap-matrix-cell${rule ? ' ap-cell--set' : ' ap-cell--empty'}${dead ? ' ap-cell--inactive' : ''}`}
                              onClick={() => !dead && tt && setModal({ type: 'rule', originZone: fromZ, destZone: toZ, truckType: tt, rule: rule || null })}
                              title={dead ? 'Direction or vehicle inactive' : rule ? `₦${fmt(rule.price)}` : 'Click to set price'}
                            >
                              {rule ? <span className="ap-cell-price">₦{fmt(rule.price)}</span>
                                    : dead ? <span className="ap-cell-dash">—</span>
                                    : <span className="ap-cell-hint">Set price</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="ap-legend">
                <span className="ap-legend-item"><span className="ap-legend-swatch ap-legend-set" />Price set</span>
                <span className="ap-legend-item"><span className="ap-legend-swatch ap-legend-empty" />Not configured</span>
                <span className="ap-legend-item"><span className="ap-legend-swatch ap-legend-inactive" />Inactive</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB: STATE-BY-STATE
      ══════════════════════════════════════════════════════ */}
      {tab === 'states' && (
        <div className="fade-in">
          <div className="qs-header-row">
            <div>
              <h3 className="qs-section-title">State-by-Direction Assignments</h3>
              <p className="qs-section-sub">Edit individual state direction assignments. Changes are highlighted in blue — click Save All or save individually.</p>
            </div>
            {Object.keys(dirtyStates).filter(k => dirtyStates[k]).length > 0 && (
              <button className="btn-primary" onClick={saveAllStates} disabled={savingStates}>
                {savingStates ? <span className="spinner spinner-sm" /> : `Save All Changes (${Object.keys(dirtyStates).filter(k => dirtyStates[k]).length})`}
              </button>
            )}
          </div>

          {/* Zone filter tabs */}
          <div className="ap-zone-filter-tabs">
            <button className={`ap-zf-tab${stateFilter === 'all' ? ' active' : ''}`} onClick={() => setStateFilter('all')}>
              All States
            </button>
            {sortedZones.map((z, i) => (
              <button
                key={z._id}
                className={`ap-zf-tab${stateFilter === z._id.toString() ? ' active' : ''}`}
                style={stateFilter === z._id.toString() ? { borderBottomColor: zoneColor(i), color: zoneColor(i) } : {}}
                onClick={() => setStateFilter(z._id.toString())}
              >
                {z.name}
              </button>
            ))}
          </div>

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>State</th>
                    <th>Direction</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStates.map(s => {
                    const curZone  = stateZone(s.key);
                    const curZoneId = curZone?._id?.toString() || '';
                    const editId   = stateEdits[s.key] !== undefined ? stateEdits[s.key] : curZoneId;
                    const isDirty  = !!dirtyStates[s.key];
                    const zIdx     = sortedZones.findIndex(z => z._id.toString() === (editId || curZoneId));
                    const badgeColor = zIdx >= 0 ? zoneColor(zIdx) : '#aaa';

                    return (
                      <tr key={s.key} className={isDirty ? 'ap-dirty-row' : ''}>
                        <td className="ap-state-name">{s.name}</td>
                        <td>
                          <select
                            className="ap-zone-select"
                            value={editId}
                            style={{ borderColor: badgeColor, color: badgeColor }}
                            onChange={e => {
                              const val = e.target.value;
                              setStateEdits(p => ({ ...p, [s.key]: val }));
                              setDirtyStates(p => ({ ...p, [s.key]: val !== curZoneId }));
                            }}
                          >
                            <option value="">— Unassigned —</option>
                            {sortedZones.map((z, i) => (
                              <option key={z._id} value={z._id.toString()}>{z.name}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <span className={`badge ${curZone ? 'badge-delivered' : 'badge-pending'}`}>
                            {curZone ? 'Active' : 'Unassigned'}
                          </span>
                        </td>
                        <td>
                          {isDirty && (
                            <button className="assign-btn" onClick={() => saveOneState(s.key)} disabled={savingStates}>
                              Save
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB: ZONES CRUD
      ══════════════════════════════════════════════════════ */}
      {tab === 'zones' && (
        <div className="card fade-in">
          <div className="ap-list-header">
            <p className="ap-list-title">Compass Directions</p>
            <button className="btn-primary ap-add-btn" onClick={() => setModal({ type: 'zone', mode: 'create', data: null })}>
              + Add Direction
            </button>
          </div>
          {loading ? (
            <div style={{ padding: 20 }}>
              {[1,2,3].map(i => <div key={i} className="shimmer" style={{ height: 60, borderRadius: 8, marginBottom: 10 }} />)}
            </div>
          ) : sortedZones.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <div className="empty-icon">🧭</div>
              <h3>No directions defined</h3>
              <p>Create compass directions (e.g. South West, North East) to enable direction-based pricing</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Direction</th><th>States</th><th>Rules</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {sortedZones.map((zone, idx) => {
                    const ruleCount = data.rules.filter(r =>
                      (r.fromZoneId?._id || r.fromZoneId)?.toString() === zone._id.toString() ||
                      (r.toZoneId?._id   || r.toZoneId  )?.toString() === zone._id.toString()
                    ).length;
                    const stateNames = (zone.states || []).map(k => NIGERIAN_STATES.find(s => s.key === k)?.name || k);
                    return (
                      <tr key={zone._id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="qs-dot" style={{ background: zoneColor(idx), flexShrink: 0 }} />
                            <div>
                              <div className="ap-zone-name">{zone.name}</div>
                              {zone.description && <div className="td-sub">{zone.description}</div>}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="ap-city-tags">
                            {stateNames.slice(0, 5).map(n => <span key={n} className="ap-city-tag">{n}</span>)}
                            {stateNames.length > 5 && <span className="ap-city-tag ap-city-more">+{stateNames.length - 5}</span>}
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
                            <button className="assign-btn" onClick={() => setModal({ type: 'zone', mode: 'edit', data: zone })}>Edit</button>
                            <button className="btn-ghost" style={{ padding: '5px 8px', fontSize: 13, color: 'var(--red)' }} onClick={() => deleteZone(zone._id)}>
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
          TAB: TRUCK TYPES CRUD
      ══════════════════════════════════════════════════════ */}
      {tab === 'truckTypes' && (
        <div className="card fade-in">
          <div className="ap-list-header">
            <p className="ap-list-title">Vehicle / Truck Types</p>
            <button className="btn-primary ap-add-btn" onClick={() => setModal({ type: 'truckType', mode: 'create', data: null })}>
              + Add Vehicle Type
            </button>
          </div>
          {loading ? (
            <div style={{ padding: 20 }}>
              {[1,2,3].map(i => <div key={i} className="shimmer" style={{ height: 60, borderRadius: 8, marginBottom: 10 }} />)}
            </div>
          ) : sortedTrucks.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <div className="empty-icon">🚛</div>
              <h3>No vehicle types defined</h3>
              <p>Add vehicle types to let customers choose the right truck for their load</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Vehicle</th><th>Capacity</th><th>Rules</th><th>Status</th><th>Actions</th></tr>
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
                        <td><span className={`badge ${ruleCount > 0 ? 'badge-paid' : 'badge-pending'}`}>{ruleCount} rule{ruleCount !== 1 ? 's' : ''}</span></td>
                        <td><span className={`badge ${tt.isActive !== false ? 'badge-delivered' : 'badge-cancelled'}`}>{tt.isActive !== false ? 'Active' : 'Inactive'}</span></td>
                        <td>
                          <div className="td-actions">
                            <button className="assign-btn" onClick={() => setModal({ type: 'truckType', mode: 'edit', data: tt })}>Edit</button>
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

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {modal?.type === 'zone' && (
        <Modal title={modal.mode === 'edit' ? `Edit Direction: ${modal.data.name}` : 'New Compass Direction'} onClose={() => setModal(null)}>
          <ZoneForm initial={modal.data} onSave={saveZone} onCancel={() => setModal(null)} saving={saving} />
        </Modal>
      )}
      {modal?.type === 'truckType' && (
        <Modal title={modal.mode === 'edit' ? `Edit: ${modal.data.name}` : 'New Vehicle Type'} onClose={() => setModal(null)}>
          <TruckTypeForm initial={modal.data} onSave={saveTruckType} onCancel={() => setModal(null)} saving={saving} />
        </Modal>
      )}
      {modal?.type === 'rule' && (
        <Modal title="Set Pricing Rule" onClose={() => setModal(null)}>
          <RuleForm
            originZone={modal.originZone} destZone={modal.destZone}
            truckType={modal.truckType}   rule={modal.rule}
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
