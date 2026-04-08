import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../App.jsx';
import NotificationBell from '../shared/NotificationBell.jsx';
import '../admin/AdminLayout.css';

const nav = [
  { to: '/driver',             label: 'Dashboard',       end: true,
    icon: <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg> },
  { to: '/driver/jobs',         label: 'Available Jobs',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="1" width="12" height="14" rx="1.5"/><path d="M5 5h6M5 8h6M5 11h4"/></svg> },
  { to: '/driver/active',       label: 'Active Delivery',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 11l3-7h8l3 7H1z"/><circle cx="4.5" cy="13" r="1.5"/><circle cx="11.5" cy="13" r="1.5"/></svg> },
  { to: '/driver/history',      label: 'History',
    icon: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 14h14v1H1zM3 10h2v4H3zm4-3h2v7H7zm4-4h2v11h-2z"/></svg> },
  { to: '/driver/performance',  label: 'Performance',
    icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 12l4-4 3 3 5-6"/><circle cx="2" cy="12" r="1"/><circle cx="6" cy="8" r="1"/><circle cx="9" cy="11" r="1"/><circle cx="14" cy="5" r="1"/></svg> },
  { to: '/driver/profile',      label: 'My Profile',
    icon: <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a3 3 0 100 6 3 3 0 000-6zM2 14a6 6 0 0112 0H2z"/></svg> },
];

export default function DriverLayout() {
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
          <span className="topbar-date">Driver Hub</span>
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
