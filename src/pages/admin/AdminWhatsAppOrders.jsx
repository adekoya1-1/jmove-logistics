/**
 * AdminWhatsAppOrders.jsx
 *
 * Admin panel for managing bookings that originated via the WhatsApp
 * payment flow. Displays all orders with status:
 *   • pending_contact      — customer redirected to WA, no proof sent yet
 *   • awaiting_confirmation — customer claims payment sent, admin must verify
 *
 * Actions
 * ────────
 *  Mark Awaiting   pending_contact → awaiting_confirmation
 *  Confirm Payment awaiting_confirmation (or pending_contact) → booked
 *                  with optional finalPrice override for negotiated amounts
 *  Cancel          any pre-booked WA status → cancelled
 *
 * Isolation
 * ─────────
 * This is a fully parallel flow — it does NOT touch the Paystack or
 * cash/COD flows. Remove this page (and the nav link + route) to
 * disable the WhatsApp management UI without touching anything else.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ordersAPI } from '../../api/client.js';
import { format } from 'date-fns';
import './AdminWhatsAppOrders.css';

/* ── Status badge config ─────────────────────────────── */
const STATUS_META = {
  pending_contact: {
    label: 'Pending',
    class: 'wab-pending',
    icon:  '⏳',
    desc:  'Redirected to WhatsApp — no payment proof received yet',
  },
  awaiting_confirmation: {
    label: 'Awaiting Confirmation',
    class: 'wab-awaiting',
    icon:  '🕵️',
    desc:  'Customer has sent payment proof — pending admin verification',
  },
};

const fmt = n => Number(n || 0).toLocaleString('en-NG');

/* ── Confirm-Payment modal ───────────────────────────── */
function ConfirmModal({ order, onClose, onConfirmed }) {
  const [finalPrice, setFinalPrice] = useState('');
  const [note,       setNote]       = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  const handleConfirm = async () => {
    setError(''); setLoading(true);
    try {
      const fp = finalPrice.trim() ? parseFloat(finalPrice) : undefined;
      await ordersAPI.confirmWhatsappPayment(order._id, fp, note.trim() || undefined);
      onConfirmed();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to confirm payment');
    } finally { setLoading(false); }
  };

  const systemQuote = order.systemQuote ?? order.totalAmount;
  const diff        = finalPrice.trim() ? parseFloat(finalPrice) - systemQuote : 0;

  return (
    <div className="wao-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="wao-modal">
        <div className="wao-modal-header">
          <h3 className="wao-modal-title">Confirm WhatsApp Payment</h3>
          <button className="wao-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="wao-modal-body">
          {/* Order summary */}
          <div className="wao-confirm-summary">
            <div className="wao-cs-row">
              <span className="wao-cs-lbl">Waybill</span>
              <span className="wao-cs-val mono">{order.waybillNumber}</span>
            </div>
            <div className="wao-cs-row">
              <span className="wao-cs-lbl">Customer</span>
              <span className="wao-cs-val">
                {order.customerId
                  ? `${order.customerId.firstName} ${order.customerId.lastName}`
                  : order.senderName}
              </span>
            </div>
            <div className="wao-cs-row">
              <span className="wao-cs-lbl">Route</span>
              <span className="wao-cs-val">{order.originCity} → {order.destinationCity}</span>
            </div>
            <div className="wao-cs-row">
              <span className="wao-cs-lbl">System Quote</span>
              <span className="wao-cs-val wao-cs-quote">₦{fmt(systemQuote)}</span>
            </div>
          </div>

          {/* Optional final price */}
          <div className="wao-modal-field">
            <label className="wao-modal-label">
              Final Agreed Price (₦)
              <span className="wao-modal-hint"> — leave blank to use system quote</span>
            </label>
            <input
              type="number"
              className="wao-modal-input"
              value={finalPrice}
              onChange={e => setFinalPrice(e.target.value)}
              placeholder={`${fmt(systemQuote)} (current quote)`}
              min="0"
            />
            {finalPrice.trim() && !isNaN(diff) && diff !== 0 && (
              <p className={`wao-price-diff ${diff < 0 ? 'negative' : 'positive'}`}>
                {diff > 0 ? `+₦${fmt(diff)} above quote` : `-₦${fmt(Math.abs(diff))} below quote`}
              </p>
            )}
          </div>

          {/* Admin note */}
          <div className="wao-modal-field">
            <label className="wao-modal-label">Confirmation Note (optional)</label>
            <textarea
              className="wao-modal-input"
              style={{ resize: 'none', height: 68 }}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Payment verified via Opay screenshot, ref #ABC123"
            />
          </div>

          {error && <p className="wao-modal-error">⚠ {error}</p>}
        </div>

        <div className="wao-modal-footer">
          <button className="wao-btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="wao-btn-confirm" onClick={handleConfirm} disabled={loading}>
            {loading
              ? <span className="wao-spinner" />
              : '✅ Confirm & Activate Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Cancel modal ───────────────────────────────────── */
function CancelModal({ order, onClose, onCancelled }) {
  const [reason,  setReason]  = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleCancel = async () => {
    setError(''); setLoading(true);
    try {
      await ordersAPI.whatsappCancel(order._id, reason.trim() || undefined);
      onCancelled();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to cancel order');
    } finally { setLoading(false); }
  };

  return (
    <div className="wao-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="wao-modal wao-modal-sm">
        <div className="wao-modal-header">
          <h3 className="wao-modal-title">Cancel WhatsApp Order</h3>
          <button className="wao-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="wao-modal-body">
          <p className="wao-cancel-warn">
            This will cancel waybill <strong>{order.waybillNumber}</strong> and it will be
            removed from the active queue. This action cannot be undone.
          </p>
          <div className="wao-modal-field">
            <label className="wao-modal-label">Cancellation Reason (optional)</label>
            <input
              type="text"
              className="wao-modal-input"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Payment not received after 24h"
            />
          </div>
          {error && <p className="wao-modal-error">⚠ {error}</p>}
        </div>
        <div className="wao-modal-footer">
          <button className="wao-btn-secondary" onClick={onClose} disabled={loading}>Keep Order</button>
          <button className="wao-btn-cancel-confirm" onClick={handleCancel} disabled={loading}>
            {loading ? <span className="wao-spinner" /> : '🗑 Cancel Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
══════════════════════════════════════════════════════ */
export default function AdminWhatsAppOrders() {
  const [orders,  setOrders]  = useState([]);
  const [counts,  setCounts]  = useState({ total: 0, pending_contact: 0, awaiting_confirmation: 0 });
  const [filter,  setFilter]  = useState('all');   // 'all' | 'pending_contact' | 'awaiting_confirmation'
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  /* ── Modals ── */
  const [confirmModal, setConfirmModal] = useState(null);  // order object
  const [cancelModal,  setCancelModal]  = useState(null);  // order object
  const [advancingId,  setAdvancingId]  = useState(null);  // order._id being advanced

  const load = useCallback(() => {
    setLoading(true); setError('');
    ordersAPI.whatsappPending()
      .then(r => { setOrders(r.data.orders); setCounts(r.data.counts); })
      .catch(e => setError(e?.response?.data?.message || e?.message || 'Failed to load orders'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Advance: pending_contact → awaiting_confirmation ── */
  const handleAdvance = async (order) => {
    setAdvancingId(order._id);
    try {
      await ordersAPI.whatsappAdvance(order._id, 'Customer has messaged — payment proof received');
      load();
    } catch (e) {
      alert(e?.response?.data?.message || 'Could not advance order status');
    } finally { setAdvancingId(null); }
  };

  /* ── Filter display ── */
  const displayed = filter === 'all'
    ? orders
    : orders.filter(o => o.status === filter);

  const customerName = (o) =>
    o.customerId
      ? `${o.customerId.firstName} ${o.customerId.lastName}`
      : o.senderName;

  const customerEmail = (o) => o.customerId?.email || o.senderEmail || '—';
  const customerPhone = (o) => o.customerId?.phone || o.senderPhone || '—';

  return (
    <div className="admin-whatsapp-orders">

      {/* ── Page header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span className="wao-title-icon">📱</span>
            WhatsApp Orders
          </h1>
          <p className="page-subtitle">
            Manually confirm bookings initiated via WhatsApp — verify payment and activate orders
          </p>
        </div>
        <button className="wao-refresh-btn" onClick={load} disabled={loading} title="Refresh">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.65 2.35A8 8 0 1014 8h-1.5a6.5 6.5 0 10-.47 2.53L14 8l-2.35-5.65z"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div className="wao-summary-cards">
        <div className="wao-sc wao-sc-total">
          <div className="wao-sc-num">{counts.total}</div>
          <div className="wao-sc-lbl">Total Actionable</div>
        </div>
        <div className="wao-sc wao-sc-pending">
          <div className="wao-sc-num">{counts.pending_contact}</div>
          <div className="wao-sc-lbl">⏳ Pending</div>
          <div className="wao-sc-sub">Redirected to WhatsApp</div>
        </div>
        <div className="wao-sc wao-sc-awaiting">
          <div className="wao-sc-num">{counts.awaiting_confirmation}</div>
          <div className="wao-sc-lbl">🕵️ Awaiting Confirmation</div>
          <div className="wao-sc-sub">Payment proof received</div>
        </div>
      </div>

      {/* ── Status filter tabs ── */}
      <div className="wao-filter-tabs">
        {[
          { key: 'all',                   label: `All (${counts.total})` },
          { key: 'pending_contact',        label: `Pending (${counts.pending_contact})` },
          { key: 'awaiting_confirmation',  label: `Awaiting (${counts.awaiting_confirmation})` },
        ].map(t => (
          <button
            key={t.key}
            className={`wao-filter-tab ${filter === t.key ? 'active' : ''}`}
            onClick={() => setFilter(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Main content ── */}
      {error && <div className="wao-error-banner">⚠ {error} <button onClick={load}>Retry</button></div>}

      {loading ? (
        <div className="wao-loading">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="wao-shimmer" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="wao-empty">
          <div className="wao-empty-icon">
            {filter === 'all' ? '🎉' : filter === 'pending_contact' ? '⏳' : '🕵️'}
          </div>
          <h3 className="wao-empty-title">
            {filter === 'all'
              ? 'No pending WhatsApp orders'
              : filter === 'pending_contact'
              ? 'No orders waiting for payment proof'
              : 'No orders awaiting confirmation'}
          </h3>
          <p className="wao-empty-sub">
            {filter === 'all'
              ? 'All WhatsApp bookings have been processed.'
              : 'Check back later or switch to the "All" tab.'}
          </p>
        </div>
      ) : (
        <div className="wao-order-list">
          {displayed.map(order => {
            const meta      = STATUS_META[order.status] || {};
            const isAdvancing = advancingId === order._id;
            const systemQuote = order.systemQuote ?? order.totalAmount;

            return (
              <div key={order._id} className={`wao-order-card ${meta.class}`}>

                {/* ── Card header ── */}
                <div className="wao-oc-header">
                  <div className="wao-oc-left">
                    <span className={`wao-status-badge ${meta.class}`}>
                      {meta.icon} {meta.label}
                    </span>
                    <Link
                      to={`/admin/orders/${order._id}`}
                      className="wao-waybill-link"
                    >
                      {order.waybillNumber}
                    </Link>
                  </div>
                  <div className="wao-oc-right">
                    <span className="wao-oc-time">
                      {format(new Date(order.createdAt), 'dd MMM yyyy, HH:mm')}
                    </span>
                  </div>
                </div>

                {/* ── Card body ── */}
                <div className="wao-oc-body">

                  {/* Customer */}
                  <div className="wao-oc-section">
                    <div className="wao-oc-section-title">👤 Customer</div>
                    <div className="wao-oc-customer">
                      <p className="wao-oc-name">{customerName(order)}</p>
                      <p className="wao-oc-contact">{customerEmail(order)}</p>
                      <p className="wao-oc-contact">{customerPhone(order)}</p>
                    </div>
                  </div>

                  {/* Route */}
                  <div className="wao-oc-section">
                    <div className="wao-oc-section-title">🚚 Route</div>
                    <div className="wao-oc-route">
                      <span className="wao-oc-city origin">{order.originCity}</span>
                      <span className="wao-oc-arrow">→</span>
                      <span className="wao-oc-city dest">{order.destinationCity}</span>
                    </div>
                    <p className="wao-oc-pkg">
                      {order.description} · {order.weight} kg
                      {order.quantity > 1 ? ` · ${order.quantity} items` : ''}
                      {order.isFragile ? ' · ⚠ Fragile' : ''}
                    </p>
                  </div>

                  {/* Price */}
                  <div className="wao-oc-section">
                    <div className="wao-oc-section-title">💰 Price</div>
                    <div className="wao-oc-price-block">
                      <div className="wao-oc-quote">
                        <span className="wao-oc-quote-lbl">System Quote</span>
                        <span className="wao-oc-quote-val">₦{fmt(systemQuote)}</span>
                      </div>
                      {order.finalPrice !== null && order.finalPrice !== undefined && (
                        <div className="wao-oc-final">
                          <span className="wao-oc-final-lbl">Final (negotiated)</span>
                          <span className="wao-oc-final-val">₦{fmt(order.finalPrice)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* WhatsApp note if any */}
                  {order.whatsappNote && (
                    <div className="wao-oc-section wao-oc-section-note">
                      <div className="wao-oc-section-title">📝 Note</div>
                      <p className="wao-oc-note">{order.whatsappNote}</p>
                    </div>
                  )}
                </div>

                {/* ── Card status description ── */}
                <div className="wao-oc-status-bar">
                  <span className="wao-oc-status-desc">{meta.desc}</span>
                </div>

                {/* ── Card actions ── */}
                <div className="wao-oc-actions">
                  {order.status === 'pending_contact' && (
                    <button
                      className="wao-btn-advance"
                      onClick={() => handleAdvance(order)}
                      disabled={isAdvancing}
                      title="Mark as: customer sent payment proof"
                    >
                      {isAdvancing
                        ? <span className="wao-spinner" />
                        : '🕵️ Mark Awaiting'}
                    </button>
                  )}

                  <button
                    className="wao-btn-confirm-action"
                    onClick={() => setConfirmModal(order)}
                    title="Verify payment and activate this order"
                  >
                    ✅ Confirm Payment
                  </button>

                  <button
                    className="wao-btn-cancel-action"
                    onClick={() => setCancelModal(order)}
                    title="Cancel this WhatsApp booking"
                  >
                    🗑 Cancel
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modals ── */}
      {confirmModal && (
        <ConfirmModal
          order={confirmModal}
          onClose={() => setConfirmModal(null)}
          onConfirmed={() => { setConfirmModal(null); load(); }}
        />
      )}
      {cancelModal && (
        <CancelModal
          order={cancelModal}
          onClose={() => setCancelModal(null)}
          onCancelled={() => { setCancelModal(null); load(); }}
        />
      )}
    </div>
  );
}
