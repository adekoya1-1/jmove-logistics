import { useState, useEffect, useRef } from 'react';
import { notificationsAPI } from '../../api/client.js';
import { format } from 'date-fns';

export default function NotificationBell() {
  const [notes,   setNotes]   = useState([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const unread = notes.filter(n => !n.isRead).length;

  const load = () => {
    setLoading(true);
    notificationsAPI.list()
      .then(r => setNotes(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Real-time: listen for new push notifications via socket
  useEffect(() => {
    const tokens = JSON.parse(localStorage.getItem('jmove_auth') || '{}');
    if (!tokens.accessToken) return;
    let socket;
    import('socket.io-client').then(({ io }) => {
      socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
        auth: { token: tokens.accessToken },
        transports: ['websocket', 'polling'],
      });
      socket.on('notification:new', (note) => {
        // Prepend a synthetic notification to the list
        setNotes(prev => [{
          _id: `live-${Date.now()}`, title: note.title, message: note.message,
          type: note.type || 'info', isRead: false, createdAt: new Date(),
        }, ...prev]);
      });
    }).catch(() => {});
    return () => { socket?.disconnect(); };
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = async (id) => {
    setNotes(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
    await notificationsAPI.markRead(id).catch(() => {});
  };

  const markAllRead = async () => {
    const unreadIds = notes.filter(n => !n.isRead).map(n => n._id);
    setNotes(prev => prev.map(n => ({ ...n, isRead: true })));
    await Promise.all(unreadIds.map(id => notificationsAPI.markRead(id))).catch(() => {});
  };

  const typeIcon = (type) => ({ success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' }[type] || 'ℹ️');

  return (
    <div className="nb-wrap" ref={ref}>
      <button className="topbar-badge nb-btn" onClick={() => { setOpen(v => !v); if (!open) load(); }} title="Notifications">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M7 1a1 1 0 00-1 1v.5A4 4 0 003 6.5v2L2 10h10l-1-1.5v-2A4 4 0 008 2.5V2a1 1 0 00-1-1zM5.5 11a1.5 1.5 0 003 0h-3z"/>
        </svg>
        {unread > 0 && <span className="nb-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="nb-dropdown">
          <div className="nb-header">
            <span className="nb-title">Notifications</span>
            {unread > 0 && (
              <button className="nb-mark-all" onClick={markAllRead}>Mark all read</button>
            )}
          </div>

          <div className="nb-list">
            {loading && (
              <div style={{ padding:'20px 0', textAlign:'center' }}>
                <div className="spinner" />
              </div>
            )}
            {!loading && notes.length === 0 && (
              <div className="nb-empty">
                <span style={{ fontSize:28 }}>🔔</span>
                <p>No notifications yet</p>
              </div>
            )}
            {!loading && notes.map(n => (
              <div
                key={n._id}
                className={`nb-item ${!n.isRead ? 'unread' : ''}`}
                onClick={() => markRead(n._id)}
              >
                <div className="nb-item-icon">{typeIcon(n.type)}</div>
                <div className="nb-item-body">
                  <p className="nb-item-title">{n.title}</p>
                  <p className="nb-item-msg">{n.message}</p>
                  <p className="nb-item-time">{format(new Date(n.createdAt), 'MMM d, h:mm a')}</p>
                </div>
                {!n.isRead && <div className="nb-dot" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
