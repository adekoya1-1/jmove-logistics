import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../App.jsx';
import NotificationBell from '../shared/NotificationBell.jsx';
import '../admin/AdminLayout.css';

const nav = [
  { to: '/dashboard',           label: 'Overview',    end: true,
    icon: <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg> },
  { to: '/dashboard/orders',    label: 'My Shipments',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="1" width="12" height="14" rx="1.5"/><path d="M5 5h6M5 8h6M5 11h4"/></svg> },
  { to: '/dashboard/new-order', label: 'New Shipment',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v6M5 8h6"/></svg> },
  { to: '/dashboard/payments',  label: 'Payments',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="4" width="14" height="9" rx="1.5"/><path d="M1 7h14"/></svg> },
];

export default function CustomerLayout() {
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
          <button className="logout-btn" onClick={handleLogout}>Sign Out</button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setOpen(true)}>☰</button>
          <span className="topbar-date">Customer Dashboard</span>
          <div className="topbar-right">
            <NotificationBell />
            <div className="topbar-avatar">{user?.firstName?.[0]}{user?.lastName?.[0]}</div>
          </div>
        </header>
        <main className="page-content"><Outlet /></main>
      </div>
    </div>
  );
}
