import { useState, useEffect, useRef, useCallback } from 'react';
import { routesAPI, fleetAPI, driversAPI } from '../../api/client.js';
import { format, formatDistanceToNow } from 'date-fns';
import './AdminRoutes.css';

const fmt  = n => Number(n || 0).toLocaleString('en-NG');
const fmtW = n => Number(n || 0).toFixed(1);

const STATUS_CLS = {
  planned:   'badge rs-planned',
  active:    'badge rs-active',
  completed: 'badge rs-completed',
  cancelled: 'badge rs-cancelled',
};
const STATUS_ICON = { planned: '📋', active: '🚗', completed: '✅', cancelled: '🚫' };
const EFF_CLS    = { profitable: 'badge eff-profitable', break_even: 'badge eff-break_even', inefficient: 'badge eff-inefficient', pending: 'badge eff-pending' };
const EFF_LABEL  = { profitable: '✅ Profitable', break_even: '⚖ Break-even', inefficient: '⚠ Inefficient', pending: '— Pending' };

// ═══════════════════════════════════════════════════════════
//  ROUTE BUILDER MODAL
// ═══════════════════════════════════════════════════════════
function RouteBuilder({ onClose, onCreated }) {
  const [candidates,    setCandidates]    = useState([]);
  const [selectedIds,   setSelectedIds]   = useState([]);
  const [stops,         setStops]         = useState([]);
  const [drivers,       setDrivers]       = useState([]);
  const [vehicles,      setVehicles]      = useState([]);
  const [driverId,      setDriverId]      = useState('');
  const [vehicleId,     setVehicleId]     = useState('');
  const [notes,         setNotes]         = useState('');
  const [search,        setSearch]        = useState('');
  const [validation,    setValidation]    = useState(null);
  const [validating,    setValidating]    = useState(false);
  const [creating,      setCreating]      = useState(false);
  const [error,         setError]         = useState('');
  const [dragIdx,       setDragIdx]       = useState(null);
  const [dragOverIdx,   setDragOverIdx]   = useState(null);

  // Load candidates + drivers + vehicles
  useEffect(() => {
    routesAPI.candidates().then(r => setCandidates(r.data || [])).catch(() => {});
    driversAPI.list({ limit: 100, verified: true }).then(r => setDrivers(r.data?.drivers || r.data || [])).catch(() => {});
    fleetAPI.list({ status: 'active', limit: 100 }).then(r => setVehicles(r.data?.vehicles || r.data || [])).catch(() => {});
  }, []);

  // Debounced candidate search
  useEffect(() => {
    const t = setTimeout(() => {
      routesAPI.candidates({ search }).then(r => setCandidates(r.data || [])).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Re-validate when selection or vehicle changes
  useEffect(() => {
    if (selectedIds.length === 0) { setValidation(null); return; }
    setValidating(true);
    routesAPI.validate({ orderIds: selectedIds, vehicleId: vehicleId || undefined })
      .then(r => setValidation(r.data))
      .catch(() => {})
      .finally(() => setValidating(false));
  }, [selectedIds, vehicleId]);

  const toggleOrder = (order) => {
    const isSelected = selectedIds.includes(order._id);
    if (isSelected) {
      setSelectedIds(prev => prev.filter(id => id !== order._id));
      setStops(prev => prev.filter(s => s.orderId !== order._id));
    } else {
      setSelectedIds(prev => [...prev, order._id]);
      const nextSeq = stops.length;
      setStops(prev => [
        ...prev,
        { _key: `${order._id}-pickup`,   orderId: order._id, sequence: nextSeq + 1, type: 'pickup',   address: order.senderAddress || order.originCity,    city: order.originCity,      contactName: order.senderName,   contactPhone: order.senderPhone,   waybill: order.waybillNumber },
        { _key: `${order._id}-delivery`, orderId: order._id, sequence: nextSeq + 2, type: 'delivery', address: order.receiverAddress,                        city: order.destinationCity, contactName: order.receiverName, contactPhone: order.receiverPhone, waybill: order.waybillNumber },
      ]);
    }
  };

  const removeOrderFromStops = (orderId) => {
    setSelectedIds(prev => prev.filter(id => id !== orderId));
    setStops(prev => {
      const next = prev.filter(s => s.orderId !== orderId);
      return next.map((s, i) => ({ ...s, sequence: i + 1 }));
    });
  };

  // Drag-and-drop reorder
  const handleDragStart = (i) => setDragIdx(i);
  const handleDragOver  = (e, i) => { e.preventDefault(); setDragOverIdx(i); };
  const handleDrop      = (i) => {
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDragOverIdx(null); return; }
    const next = [...stops];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(i, 0, moved);
    setStops(next.map((s, idx) => ({ ...s, sequence: idx + 1 })));
    setDragIdx(null); setDragOverIdx(null);
  };

  const handleCreate = async () => {
    if (selectedIds.length === 0) return setError('Select at least one order');
    if (validation && !validation.valid) return setError(validation.errors[0]);
    setError('');
    setCreating(true);
    try {
      const payload = {
        orderIds:  selectedIds,
        vehicleId: vehicleId  || undefined,
        driverId:  driverId   || undefined,
        notes,
        stops: stops.map((s, i) => ({
          orderId:      s.orderId,
          sequence:     i + 1,
          type:         s.type,
          address:      s.address,
          city:         s.city,
          contactName:  s.contactName,
          contactPhone: s.contactPhone,
        })),
      };
      const r = await routesAPI.create(payload);
      onCreated(r.data);
    } catch (e) {
      setError(e.message || 'Could not create route');
      setCreating(false);
    }
  };

  // Vehicle capacity
  const selectedVehicle   = vehicles.find(v => v._id === vehicleId);
  const vehicleCapacityKg = (selectedVehicle?.capacityTons || 0) * 1000;
  const totalWeight       = validation?.totalWeight || 0;
  const weightPct         = vehicleCapacityKg > 0 ? Math.min((totalWeight / vehicleCapacityKg) * 100, 100) : 0;
  const weightBarColor    = weightPct > 90 ? '#ef4444' : weightPct > 70 ? '#f59e0b' : '#10b981';

  const filteredCandidates = candidates.filter(o =>
    !search || [o.waybillNumber, o.originCity, o.destinationCity, o.senderName, o.receiverName]
      .some(f => f?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="route-builder-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="route-builder-modal">
        {/* Header */}
        <div className="rbm-header">
          <div>
            <h2>Create Delivery Route</h2>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>
              Select orders → arrange stops → assign driver
            </p>
          </div>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div className="rbm-body">
          {/* ── LEFT: order selection ─────────────────────── */}
          <div className="rbm-left">
            <p className="rbm-section-title">
              Available Orders
              <span style={{ color: 'var(--brand)', marginLeft: 8 }}>
                {selectedIds.length} selected
              </span>
            </p>
            <input
              className="input"
              placeholder="Search by waybill, city, sender…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ marginBottom: 10, fontSize: 13 }}
            />
            {filteredCandidates.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-faint)', padding: '12px 0' }}>
                No eligible orders found. Orders must be in "Booked" or "Assigned" status.
              </p>
            ) : (
              filteredCandidates.map(order => (
                <div
                  key={order._id}
                  className={`order-candidate ${selectedIds.includes(order._id) ? 'selected' : ''}`}
                  onClick={() => toggleOrder(order)}
                >
                  <span className="oc-check">
                    {selectedIds.includes(order._id) ? '✅' : '⬜'}
                  </span>
                  <div className="oc-info">
                    <p className="oc-num">{order.waybillNumber}</p>
                    <p className="oc-route">{order.originCity} → {order.destinationCity}</p>
                    <p className="oc-meta">
                      {order.senderName} → {order.receiverName}
                      {order.isFragile && ' · ⚠ Fragile'}
                    </p>
                  </div>
                  <div className="oc-weight">
                    <p style={{ fontSize: 12, fontWeight: 700 }}>{fmtW(order.weight)}kg</p>
                    <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>₦{fmt(order.totalAmount)}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* ── RIGHT: stop ordering + assignment ──────────── */}
          <div className="rbm-right">
            {/* Validation / constraint panel */}
            {validating && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, color: 'var(--text-faint)' }}>
                <span className="spinner spinner-sm" /> Checking constraints…
              </div>
            )}
            {validation && !validating && (
              <div className={`constraint-panel ${!validation.valid ? 'has-errors' : validation.warnings?.length > 0 ? 'has-warnings' : 'valid'}`}>
                {validation.errors?.map((e, i) => (
                  <div key={i} className="cp-item"><span>❌</span><span>{e}</span></div>
                ))}
                {validation.warnings?.map((w, i) => (
                  <div key={i} className="cp-item"><span>⚠</span><span>{w}</span></div>
                ))}
                {validation.valid && validation.warnings?.length === 0 && (
                  <div className="cp-item"><span>✅</span><span>All constraints passed. Route is ready to create.</span></div>
                )}
              </div>
            )}

            {/* Vehicle weight bar */}
            {selectedVehicle && totalWeight > 0 && (
              <div className="weight-bar-wrap">
                <div className="weight-bar-label">
                  <span>Cargo: {fmtW(totalWeight)}kg</span>
                  <span>Capacity: {fmtW(vehicleCapacityKg)}kg ({Math.round(weightPct)}%)</span>
                </div>
                <div className="weight-bar-track">
                  <div className="weight-bar-fill" style={{ width: `${weightPct}%`, background: weightBarColor }} />
                </div>
              </div>
            )}

            {/* Assignment */}
            <div className="assign-row">
              <div>
                <p className="rbm-section-title" style={{ marginBottom: 6 }}>Driver</p>
                <select className="input" style={{ fontSize: 13 }} value={driverId} onChange={e => setDriverId(e.target.value)}>
                  <option value="">— Assign later —</option>
                  {drivers.map(d => (
                    <option key={d._id} value={d._id}>
                      {d.userId?.firstName} {d.userId?.lastName} · {d.vehicleType}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="rbm-section-title" style={{ marginBottom: 6 }}>Vehicle</p>
                <select className="input" style={{ fontSize: 13 }} value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
                  <option value="">— Select vehicle —</option>
                  {vehicles.map(v => (
                    <option key={v._id} value={v._id}>
                      {v.plateNumber} · {v.make} {v.model} ({v.capacityTons}t)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Stop list with drag-and-drop */}
            <p className="rbm-section-title">
              Stop Order ({stops.length} stops)
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>
                drag ⠿ to reorder
              </span>
            </p>
            {stops.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-faint)', padding: '8px 0' }}>
                Select orders on the left to generate stops automatically.
              </p>
            ) : (
              <div className="stops-list">
                {stops.map((stop, i) => (
                  <div
                    key={stop._key}
                    className={`stop-item ${dragIdx === i ? 'dragging' : ''} ${dragOverIdx === i ? 'drag-over' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={e => handleDragOver(e, i)}
                    onDrop={() => handleDrop(i)}
                    onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                  >
                    <span className="drag-handle">⠿</span>
                    <div className="stop-seq">{i + 1}</div>
                    <div className={`stop-dot-${stop.type}`} />
                    <div className="stop-info">
                      <p className={`stop-type-label ${stop.type}`}>{stop.type}</p>
                      <p className="stop-address">{stop.city}</p>
                      <p className="stop-contact">{stop.contactName} · {stop.contactPhone}</p>
                      <p className="stop-waybill">{stop.waybill}</p>
                    </div>
                    {/* Only show remove on pickup (removes both pickup+delivery) */}
                    {stop.type === 'pickup' && (
                      <span className="stop-remove" title="Remove this order"
                        onClick={e => { e.stopPropagation(); removeOrderFromStops(stop.orderId); }}>
                        ×
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Notes */}
            <p className="rbm-section-title" style={{ marginTop: 10 }}>Route Notes (optional)</p>
            <textarea
              className="input"
              rows={2}
              style={{ resize: 'vertical', fontSize: 13 }}
              placeholder="Internal notes for dispatch or driver…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="rbm-footer">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 0 }}>
            {error && <p style={{ fontSize: 13, color: 'var(--red)', flex: 1 }}>{error}</p>}
            {selectedIds.length > 0 && !error && (
              <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                {selectedIds.length} order{selectedIds.length !== 1 ? 's' : ''} · {stops.length} stops · {fmtW(totalWeight)}kg total
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-ghost" onClick={onClose} disabled={creating}>Cancel</button>
            <button
              className="btn-primary"
              style={{ fontSize: 13 }}
              onClick={handleCreate}
              disabled={creating || selectedIds.length === 0 || (validation && !validation.valid)}
            >
              {creating
                ? <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} />
                : `Create Route (${selectedIds.length} orders)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  ROUTE DETAIL DRAWER
// ═══════════════════════════════════════════════════════════
function RouteDetailDrawer({ routeId, onClose, onRefresh }) {
  const [route,      setRoute]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [activating, setActivating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error,      setError]      = useState('');

  const load = () => {
    setLoading(true);
    routesAPI.get(routeId)
      .then(r => setRoute(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [routeId]);

  const handleActivate = async () => {
    setActivating(true); setError('');
    try {
      await routesAPI.activate(routeId);
      load(); onRefresh();
    } catch (e) { setError(e.message || 'Activation failed'); }
    finally { setActivating(false); }
  };

  const handleCancel = async () => {
    if (!confirm('Cancel this route? All orders will be released back to unassigned.')) return;
    setCancelling(true); setError('');
    try {
      await routesAPI.cancel(routeId);
      onClose(); onRefresh();
    } catch (e) { setError(e.message || 'Cancel failed'); }
    finally { setCancelling(false); }
  };

  const stopStatusCls = { pending: 'rdd-stop-pending', arrived: 'rdd-stop-arrived', completed: 'rdd-stop-completed', skipped: 'rdd-stop-skipped' };

  return (
    <>
      <div className="route-detail-overlay" onClick={onClose} />
      <div className="route-detail-drawer">
        {/* Header */}
        <div className="rdd-header">
          <div>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-faint)', marginBottom: 3 }}>
              {route?.routeNumber || '…'}
            </p>
            <h2 style={{ fontSize: 17, fontWeight: 700 }}>Route Details</h2>
          </div>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 20 }}>
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="shimmer" style={{ height: 64, margin: '6px 0', borderRadius: 8 }} />
            ))}
          </div>
        ) : !route ? (
          <div className="empty-state"><h3>Route not found</h3></div>
        ) : (
          <div className="rdd-body">
            {/* Status row */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className={STATUS_CLS[route.status]}>{STATUS_ICON[route.status]} {route.status}</span>
              <span className={EFF_CLS[route.efficiency] || 'badge eff-pending'}>{EFF_LABEL[route.efficiency] || '—'}</span>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                {format(new Date(route.createdAt), 'MMM d, yyyy HH:mm')}
              </span>
            </div>

            {/* Metrics */}
            <div className="metrics-bar">
              <div className="metric-item">
                <p className="metric-val">{route.stops?.length || 0}</p>
                <p className="metric-lbl">Stops</p>
              </div>
              <div className="metric-item">
                <p className="metric-val">₦{fmt(route.totalRevenue)}</p>
                <p className="metric-lbl">Total Revenue</p>
              </div>
              <div className="metric-item">
                <p className="metric-val">{fmtW(route.totalWeight)}kg</p>
                <p className="metric-lbl">Total Weight</p>
              </div>
              <div className="metric-item">
                <p className="metric-val">{route.estimatedDistance || '—'}km</p>
                <p className="metric-lbl">Est. Distance</p>
              </div>
              <div className="metric-item">
                <p className="metric-val">₦{fmt(route.estimatedCost)}</p>
                <p className="metric-lbl">Est. Cost</p>
              </div>
            </div>

            {/* Driver + Vehicle */}
            <div className="rdd-section">
              <p className="rdd-section-title">Assignment</p>
              <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text)' }}>
                <div>
                  <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 2 }}>DRIVER</p>
                  {route.driverId
                    ? <p style={{ fontWeight: 600 }}>{route.driverId.userId?.firstName} {route.driverId.userId?.lastName} · {route.driverId.vehicleType}</p>
                    : <p style={{ color: 'var(--text-faint)' }}>Not assigned</p>}
                </div>
                <div>
                  <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 2 }}>VEHICLE</p>
                  {route.vehicleId
                    ? <p style={{ fontWeight: 600 }}>{route.vehicleId.plateNumber} · {route.vehicleId.make} {route.vehicleId.model}</p>
                    : <p style={{ color: 'var(--text-faint)' }}>Not assigned</p>}
                </div>
              </div>
            </div>

            {/* Stops */}
            <div className="rdd-section">
              <p className="rdd-section-title">Stops ({route.stops?.length || 0})</p>
              {[...(route.stops || [])].sort((a, b) => a.sequence - b.sequence).map((stop, i) => {
                const order = stop.orderId;
                return (
                  <div key={stop._id} className="rdd-stop">
                    <div className="rdd-stop-seq">{stop.sequence}</div>
                    <div className="rdd-stop-info">
                      <p className={`rdd-stop-type`} style={{ color: stop.type === 'pickup' ? 'var(--brand)' : 'var(--green)' }}>
                        {stop.type.toUpperCase()}
                      </p>
                      <p className="rdd-stop-addr">{stop.city} — {stop.address}</p>
                      <p className="rdd-stop-contact">{stop.contactName} · {stop.contactPhone}</p>
                      {order?.waybillNumber && (
                        <p className="rdd-stop-waybill">{order.waybillNumber}</p>
                      )}
                    </div>
                    <span className={`rdd-stop-status ${stopStatusCls[stop.status] || 'rdd-stop-pending'}`}>
                      {stop.status}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Notes */}
            {route.notes && (
              <div className="rdd-section">
                <p className="rdd-section-title">Notes</p>
                <p style={{ fontSize: 13, color: 'var(--text)' }}>{route.notes}</p>
              </div>
            )}

            {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          </div>
        )}

        {/* Footer actions */}
        {route && (
          <div className="rdd-footer">
            {route.status === 'planned' && (
              <button className="btn-primary" style={{ fontSize: 13 }} onClick={handleActivate} disabled={activating || !route.driverId}>
                {activating
                  ? <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} />
                  : !route.driverId ? 'Assign driver first' : '🚗 Activate Route'}
              </button>
            )}
            {['planned', 'active'].includes(route.status) && (
              <button className="btn-secondary" style={{ fontSize: 13, color: 'var(--red)' }} onClick={handleCancel} disabled={cancelling}>
                {cancelling ? <span className="spinner spinner-sm" /> : 'Cancel Route'}
              </button>
            )}
            <button className="btn-ghost" style={{ fontSize: 13 }} onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════
export default function AdminRoutes() {
  const [routes,       setRoutes]       = useState([]);
  const [stats,        setStats]        = useState({ planned: 0, active: 0, completed: 0, cancelled: 0 });
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading,      setLoading]      = useState(true);
  const [showBuilder,  setShowBuilder]  = useState(false);
  const [detailId,     setDetailId]     = useState(null);

  const LIMIT = 20;

  const load = useCallback(() => {
    setLoading(true);
    const p = { page, limit: LIMIT };
    if (statusFilter) p.status = statusFilter;
    routesAPI.list(p)
      .then(r => {
        setRoutes(r.data.routes || []);
        setTotal(r.data.pagination?.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Compute stats from loaded routes (rough — full stats would need a dedicated endpoint)
  useEffect(() => {
    const s = { planned: 0, active: 0, completed: 0, cancelled: 0 };
    routes.forEach(r => { if (s[r.status] !== undefined) s[r.status]++; });
    setStats(s);
  }, [routes]);

  const pages = Math.ceil(total / LIMIT);

  const handleCreated = () => {
    setShowBuilder(false);
    load();
  };

  return (
    <div className="admin-routes">
      {/* Builder modal */}
      {showBuilder && (
        <RouteBuilder onClose={() => setShowBuilder(false)} onCreated={handleCreated} />
      )}

      {/* Detail drawer */}
      {detailId && (
        <RouteDetailDrawer
          routeId={detailId}
          onClose={() => setDetailId(null)}
          onRefresh={load}
        />
      )}

      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Delivery Routes</h1>
          <p className="page-subtitle">Group multiple orders into optimised delivery routes</p>
        </div>
        <button className="btn-primary" onClick={() => setShowBuilder(true)}>+ Create Route</button>
      </div>

      {/* Stats */}
      <div className="routes-stats">
        {[
          { label: 'Planned',   value: stats.planned,   icon: '📋', cls: 'rs-planned' },
          { label: 'Active',    value: stats.active,    icon: '🚗', cls: 'rs-active' },
          { label: 'Completed', value: stats.completed, icon: '✅', cls: 'rs-completed' },
          { label: 'Cancelled', value: stats.cancelled, icon: '🚫', cls: 'rs-cancelled' },
        ].map(s => (
          <div key={s.label} className="card route-stat-card" style={{ cursor: 'pointer' }}
            onClick={() => { setStatusFilter(s.label.toLowerCase()); setPage(1); }}>
            <span className="rsc-icon">{s.icon}</span>
            <div>
              <p className="rsc-val">{s.value}</p>
              <p className="rsc-lbl">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="status-filters">
        {[['', 'All Routes'], ['planned', '📋 Planned'], ['active', '🚗 Active'], ['completed', '✅ Completed'], ['cancelled', '🚫 Cancelled']].map(([v, l]) => (
          <button key={v} className={`filter-btn ${statusFilter === v ? 'active' : ''}`}
            onClick={() => { setStatusFilter(v); setPage(1); }}>
            {l}
          </button>
        ))}
      </div>

      {/* Route list */}
      <div className="card">
        {loading ? (
          <div style={{ padding: 16 }}>
            {Array(5).fill(0).map((_, i) => (
              <div key={i} className="shimmer" style={{ height: 68, margin: '4px 0', borderRadius: 10 }} />
            ))}
          </div>
        ) : routes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🗺</div>
            <h3>No routes found</h3>
            <p>Create a delivery route to batch multiple orders for one driver.</p>
            <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => setShowBuilder(true)}>
              Create Route
            </button>
          </div>
        ) : (
          <>
            {routes.map(route => {
              const driver = route.driverId;
              const driverName = driver?.userId ? `${driver.userId.firstName || ''} ${driver.userId.lastName || ''}`.trim() : null;
              const stopCount = route.stops?.length ?? '?';

              return (
                <div key={route._id} className="route-row" onClick={() => setDetailId(route._id)}>
                  <span className="route-row-icon">{STATUS_ICON[route.status]}</span>
                  <div className="route-row-info">
                    <p className="route-row-num">
                      {route.routeNumber}
                      <span className={STATUS_CLS[route.status]}>{route.status}</span>
                      {route.efficiency && route.efficiency !== 'pending' && (
                        <span className={EFF_CLS[route.efficiency] || ''}>{EFF_LABEL[route.efficiency]}</span>
                      )}
                    </p>
                    <p className="route-row-meta">
                      {stopCount} stops ·{' '}
                      {driverName ? `Driver: ${driverName}` : 'No driver assigned'} ·{' '}
                      {route.vehicleId ? route.vehicleId.plateNumber : 'No vehicle'} ·{' '}
                      {fmtW(route.totalWeight)}kg
                    </p>
                  </div>
                  <div className="route-row-right">
                    <p className="route-row-rev">₦{fmt(route.totalRevenue)}</p>
                    <p className="route-row-time">
                      {formatDistanceToNow(new Date(route.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <span style={{ fontSize: 18, color: 'var(--text-faint)', marginLeft: 4 }}>›</span>
                </div>
              );
            })}
            {pages > 1 && (
              <div className="pagination">
                <span>{total} total routes</span>
                <div className="page-btns">
                  <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 13 }}
                    onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
                  <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 13 }}
                    onClick={() => setPage(p => p + 1)} disabled={page >= pages}>Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
