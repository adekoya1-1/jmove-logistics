import { useState, useEffect, useRef } from 'react';
import { supportAPI } from '../../api/client.js';
import { useAuth } from '../../App.jsx';
import { format, formatDistanceToNow } from 'date-fns';
import './CustomerSupport.css';

const CATEGORY_LABELS = {
  delivery_issue:    '🚚 Delivery Issue',
  payment_issue:     '💳 Payment Issue',
  damaged_goods:     '📦 Damaged Goods',
  missing_package:   '❓ Missing Package',
  driver_complaint:  '🚗 Driver Complaint',
  billing:           '🧾 Billing',
  other:             '💬 Other',
};

const STATUS_BADGE = {
  open:        'badge tkt-open',
  in_progress: 'badge tkt-in_progress',
  resolved:    'badge tkt-resolved',
  closed:      'badge tkt-closed',
};

const STATUS_ICONS = {
  open: '🔵', in_progress: '🟡', resolved: '🟢', closed: '⚫',
};

// ── Ticket Detail View ─────────────────────────────────────
function TicketDetail({ ticketId, onBack, userId }) {
  const [ticket,   setTicket]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [replyBody, setReplyBody] = useState('');
  const [sending,  setSending]  = useState(false);
  const [error,    setError]    = useState('');
  const bottomRef = useRef(null);

  const load = () => {
    setLoading(true);
    supportAPI.get(ticketId)
      .then(r => setTicket(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [ticketId]);

  useEffect(() => {
    if (ticket) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [ticket]);

  const handleReply = async () => {
    if (!replyBody.trim()) return setError('Reply cannot be empty');
    setError('');
    setSending(true);
    try {
      const r = await supportAPI.reply(ticketId, { body: replyBody.trim() });
      setTicket(r.data);
      setReplyBody('');
    } catch (e) {
      setError(e.message || 'Could not send reply');
    } finally { setSending(false); }
  };

  const handleClose = async () => {
    if (!confirm('Close this ticket? You can still open a new one for further assistance.')) return;
    try {
      const r = await supportAPI.close(ticketId);
      setTicket(r.data);
    } catch (e) {
      setError(e.message || 'Could not close ticket');
    }
  };

  if (loading) return (
    <div style={{ padding: 16 }}>
      {Array(3).fill(0).map((_, i) => (
        <div key={i} className="shimmer" style={{ height: 80, margin: '8px 0', borderRadius: 10 }} />
      ))}
    </div>
  );

  if (!ticket) return (
    <div className="empty-state">
      <div className="empty-icon">❓</div>
      <h3>Ticket not found</h3>
      <button className="btn-ghost" onClick={onBack}>← Back to tickets</button>
    </div>
  );

  const isClosed = ticket.status === 'closed';

  return (
    <div>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <button className="btn-ghost" style={{ fontSize: 13, marginBottom: 12 }} onClick={onBack}>
          ← Back to tickets
        </button>
        <div className="ticket-detail-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-faint)', marginBottom: 4 }}>
              {ticket.ticketNumber}
            </p>
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{ticket.subject}</h2>
            <div className="ticket-detail-meta">
              <span className={STATUS_BADGE[ticket.status]}>
                {STATUS_ICONS[ticket.status]} {ticket.status.replace('_', ' ')}
              </span>
              <span className="badge" style={{ background: '#f3f4f6', color: 'var(--text-faint)', fontSize: 11 }}>
                {CATEGORY_LABELS[ticket.category] || ticket.category}
              </span>
              {ticket.orderId && (
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                  📦 {ticket.orderId.waybillNumber}
                </span>
              )}
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                Opened {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
              </span>
            </div>
          </div>
          {!isClosed && ticket.status === 'resolved' && (
            <button className="btn-secondary" style={{ fontSize: 13 }} onClick={handleClose}>
              Close Ticket
            </button>
          )}
        </div>
      </div>

      {/* Message thread */}
      <div className="message-thread">
        {ticket.messages?.map((msg, i) => {
          const isCustomer = msg.senderRole === 'customer';
          const name = msg.senderId
            ? `${msg.senderId.firstName || ''} ${msg.senderId.lastName || ''}`.trim()
            : (isCustomer ? 'You' : 'Support Team');
          return (
            <div key={i} className={`msg-bubble ${isCustomer ? 'msg-customer' : 'msg-support'}`}>
              <div className="msg-header" style={{ justifyContent: isCustomer ? 'flex-end' : 'flex-start' }}>
                <span className="msg-sender-name">{isCustomer ? 'You' : name || 'Support Team'}</span>
                <span>·</span>
                <span>{format(new Date(msg.sentAt), 'MMM d, HH:mm')}</span>
              </div>
              <div className="msg-body">{msg.body}</div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      {!isClosed ? (
        <div className="reply-box">
          {error && <p style={{ fontSize: 13, color: 'var(--red)', marginBottom: 8 }}>{error}</p>}
          <textarea
            className="input reply-textarea"
            placeholder="Type your reply..."
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
          />
          <div className="reply-actions">
            <button className="btn-primary" style={{ fontSize: 13 }} onClick={handleReply} disabled={sending || !replyBody.trim()}>
              {sending ? <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} /> : 'Send Reply'}
            </button>
            {ticket.status !== 'resolved' && (
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                We typically respond within 24 hours
              </span>
            )}
          </div>
        </div>
      ) : (
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', textAlign: 'center' }}>
            This ticket is closed. <button className="btn-ghost" style={{ fontSize: 13 }}
              onClick={onBack}>Open a new ticket</button> for further help.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Create Ticket Form ────────────────────────────────────
function CreateTicketForm({ onCreated, onCancel, recentOrders = [] }) {
  const [form, setForm] = useState({
    subject: '', category: 'other', body: '', orderId: '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.subject.trim()) return setError('Subject is required');
    if (!form.body.trim())    return setError('Please describe your issue');
    setError('');
    setSaving(true);
    try {
      const r = await supportAPI.create({
        subject:  form.subject.trim(),
        category: form.category,
        body:     form.body.trim(),
        orderId:  form.orderId || undefined,
      });
      onCreated(r.data);
    } catch (e) {
      setError(e.message || 'Could not create ticket');
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <button className="btn-ghost" style={{ fontSize: 13 }} onClick={onCancel}>← Back</button>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginTop: 10 }}>New Support Ticket</h2>
        <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>
          Describe your issue and we'll get back to you within 24 hours.
        </p>
      </div>
      <div className="create-ticket-form">
        <div className="create-ticket-row">
          <div className="ctf-field">
            <label className="ctf-label">Category</label>
            <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="ctf-field">
            <label className="ctf-label">Related Shipment (optional)</label>
            <select className="input" value={form.orderId} onChange={e => set('orderId', e.target.value)}>
              <option value="">None</option>
              {recentOrders.map(o => (
                <option key={o._id} value={o._id}>
                  {o.waybillNumber} — {o.originCity} → {o.destinationCity}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="ctf-field">
          <label className="ctf-label">Subject *</label>
          <input className="input" placeholder="Brief description of the issue"
            value={form.subject} onChange={e => set('subject', e.target.value)} maxLength={200} />
        </div>
        <div className="ctf-field">
          <label className="ctf-label">Describe Your Issue *</label>
          <textarea
            className="input"
            rows={5}
            placeholder="Please provide as much detail as possible — shipment number, dates, what happened, etc."
            value={form.body}
            onChange={e => set('body', e.target.value)}
            maxLength={2000}
            style={{ resize: 'vertical' }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'right' }}>
            {form.body.length}/2000
          </span>
        </div>
        {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-primary" style={{ fontSize: 13 }} onClick={handleSubmit} disabled={saving}>
            {saving ? <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} /> : 'Submit Ticket'}
          </button>
          <button className="btn-ghost" style={{ fontSize: 13 }} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Support Page ─────────────────────────────────────
export default function CustomerSupport() {
  const { user } = useAuth();
  const [view,    setView]    = useState('list');  // 'list' | 'create' | 'detail'
  const [tickets, setTickets] = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [status,  setStatus]  = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);

  const LIMIT = 10;

  const load = () => {
    setLoading(true);
    supportAPI.list({ status, page, limit: LIMIT })
      .then(r => {
        setTickets(r.data.tickets || []);
        setTotal(r.data.pagination?.total || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [status, page]);

  // Pre-load recent orders for "related order" selector
  useEffect(() => {
    import('../../api/client.js').then(({ ordersAPI }) =>
      ordersAPI.list({ limit: 20 }).then(r => setRecentOrders(r.data.orders || [])).catch(() => {})
    );
  }, []);

  const pages = Math.ceil(total / LIMIT);

  const handleCreated = (ticket) => {
    setSelectedId(ticket._id);
    setView('detail');
    load();
  };

  const handleViewTicket = (id) => {
    setSelectedId(id);
    setView('detail');
  };

  // ── List view ────────────────────────────────────────────
  if (view === 'detail' && selectedId) {
    return (
      <div className="customer-support">
        <div className="card">
          <TicketDetail
            ticketId={selectedId}
            userId={user?._id}
            onBack={() => { setView('list'); setSelectedId(null); load(); }}
          />
        </div>
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div className="customer-support">
        <div className="card">
          <CreateTicketForm
            recentOrders={recentOrders}
            onCreated={handleCreated}
            onCancel={() => setView('list')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="customer-support">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Support</h1>
          <p className="page-subtitle">Get help with your shipments, payments and account</p>
        </div>
        <button className="btn-primary" style={{ fontSize: 13 }} onClick={() => setView('create')}>
          + New Ticket
        </button>
      </div>

      {/* Status filters */}
      <div className="status-filters">
        {[['', 'All'], ['open', 'Open'], ['in_progress', 'In Progress'], ['resolved', 'Resolved'], ['closed', 'Closed']].map(([v, l]) => (
          <button key={v} className={`filter-btn ${status === v ? 'active' : ''}`}
            onClick={() => { setStatus(v); setPage(1); }}>
            {v && STATUS_ICONS[v]} {l}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 16 }}>
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="shimmer" style={{ height: 72, margin: '4px 0', borderRadius: 10 }} />
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎫</div>
            <h3>{status ? 'No tickets found' : 'No support tickets yet'}</h3>
            <p>
              {status
                ? 'Try a different filter'
                : 'Have an issue? Our support team is here to help.'}
            </p>
            {!status && (
              <button className="btn-primary" style={{ marginTop: 10, fontSize: 13 }}
                onClick={() => setView('create')}>
                Open a Ticket
              </button>
            )}
          </div>
        ) : (
          <div className="ticket-list">
            {tickets.map(t => (
              <div key={t._id} className="ticket-row" onClick={() => handleViewTicket(t._id)}>
                <span className="ticket-row-icon">{STATUS_ICONS[t.status]}</span>
                <div className="ticket-row-info">
                  <div className="ticket-row-top">
                    <span className="ticket-row-num">{t.ticketNumber}</span>
                    <span className={STATUS_BADGE[t.status]}>{t.status.replace('_', ' ')}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      {CATEGORY_LABELS[t.category] || t.category}
                    </span>
                  </div>
                  <p className="ticket-row-subject">{t.subject}</p>
                  <p className="ticket-row-meta">
                    {t.orderId && `📦 ${t.orderId.waybillNumber} · `}
                    {formatDistanceToNow(new Date(t.updatedAt), { addSuffix: true })}
                  </p>
                </div>
                <div className="ticket-row-right">
                  <p className="ticket-row-time">
                    {format(new Date(t.createdAt), 'MMM d')}
                  </p>
                  <span style={{ fontSize: 18, color: 'var(--text-faint)', marginTop: 4, display: 'block' }}>›</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && pages > 1 && (
          <div className="pagination">
            <span>{total} total tickets</span>
            <div className="page-btns">
              <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 13 }}
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
              <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: 13 }}
                onClick={() => setPage(p => p + 1)} disabled={page >= pages}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
