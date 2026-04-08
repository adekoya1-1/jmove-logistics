import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../App.jsx';
import NotificationBell from '../shared/NotificationBell.jsx';
import './AdminLayout.css';

const nav = [
  { to: '/admin',            label: 'Dashboard',  end: true,
    icon: <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg> },
  { to: '/admin/orders',     label: 'Orders',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="1" width="12" height="14" rx="1.5"/><path d="M5 5h6M5 8h6M5 11h4"/></svg> },
  { to: '/admin/customers',  label: 'Customers',
    icon: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 1a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM1 13a4.5 4.5 0 019 0H1zm8.5-9a2 2 0 100 4 2 2 0 000-4zm1.5 6a3.5 3.5 0 016 0h-6z"/></svg> },
  { to: '/admin/drivers',    label: 'Drivers',
    icon: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a3 3 0 100 6 3 3 0 000-6zM2 14a6 6 0 0112 0H2z"/></svg> },
  { to: '/admin/fleet',      label: 'Fleet',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="5" width="14" height="7" rx="1.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="12.5" r="1.5"/><path d="M1 8h14M4 5V3.5A1.5 1.5 0 015.5 2h5A1.5 1.5 0 0112 3.5V5"/></svg> },
  { to: '/admin/users',      label: 'Staff',
    icon: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a3 3 0 100 6 3 3 0 000-6zM4 14a4 4 0 018 0H4zm7-8.5a.5.5 0 01.5-.5H13v-1.5a.5.5 0 011 0V5h1.5a.5.5 0 010 1H14v1.5a.5.5 0 01-1 0V6h-1.5a.5.5 0 01-.5-.5z"/></svg> },
  { to: '/admin/map',        label: 'Live Map',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6c0 3.5 4.5 8.5 4.5 8.5S12.5 9.5 12.5 6c0-2.5-2-4.5-4.5-4.5z"/><circle cx="8" cy="6" r="1.5"/></svg> },
  { to: '/admin/analytics',  label: 'Analytics',
    icon: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 14h14v1H1zM3 10h2v4H3zm4-3h2v7H7zm4-4h2v11h-2z"/></svg> },
  { to: '/admin/payments',   label: 'Payments',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="4" width="14" height="9" rx="1.5"/><path d="M1 7h14"/></svg> },
  { to: '/admin/pricing',    label: 'Pricing',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 4v1.5M8 10.5V12M5.5 9.5A1.5 1.5 0 007 11h2a1.5 1.5 0 000-3H7a1.5 1.5 0 010-3h2A1.5 1.5 0 0110.5 6.5"/></svg> },
  { to: '/admin/states',     label: 'States (Regions)',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 4A6 6 0 1 0 2 4c0 3 6 10 6 10s6-7 6-10z"/><circle cx="8" cy="4" r="2"/></svg> },
  { to: '/admin/logs',       label: 'Audit Logs',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="1" width="12" height="14" rx="1.5"/><path d="M5 4h6M5 7h6M5 10h4"/><circle cx="12" cy="12" r="3" fill="var(--brand)" stroke="none"/><path d="M11 12h2M12 11v2" stroke="#fff" strokeWidth="1.2"/></svg> },
  { to: '/admin/settings',   label: 'Settings',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.41 1.41M11.66 11.66l1.41 1.41M2.93 13.07l1.41-1.41M11.66 4.34l1.41-1.41"/></svg> },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  return (
    <div className="app-layout">
      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}

      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <img
            src="/logo-orange-white.png"
            alt="JMove Logistics"
            style={{ height:36, width:'auto', objectFit:'contain', maxWidth:170 }}
          />
        </div>
        <nav className="sidebar-nav">
          {nav.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <span className="nav-icon">{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">{user?.firstName?.[0]}{user?.lastName?.[0]}</div>
            <div className="user-info">
              <p className="user-name">{user?.firstName} {user?.lastName}</p>
              <p className="user-email">{user?.email}</p>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{marginRight:6}}><path d="M5 1H2a1 1 0 00-1 1v8a1 1 0 001 1h3M8 9l3-3-3-3M11 6H5"/></svg>
            Sign Out
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setOpen(true)}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 5h14v1.5H3V5zm0 4.5h14V11H3V9.5zm0 4.5h14V15.5H3V14z"/></svg>
          </button>
          <span className="topbar-date">
            {new Date().toLocaleDateString('en-NG', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
          </span>
          <div className="topbar-right">
            <NotificationBell />
            <div className="topbar-avatar">{user?.firstName?.[0]}{user?.lastName?.[0]}</div>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
