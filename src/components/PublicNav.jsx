import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import './PublicNav.css';

export default function PublicNav() {
  const [open, setOpen] = useState(false);

  // Refs for focus management
  const hamburgerRef  = useRef(null);   // where focus returns when drawer closes
  const closeButtonRef = useRef(null);  // where focus lands when drawer opens
  const drawerRef     = useRef(null);   // the drawer panel itself

  // ── Open / close helpers ───────────────────────────────────────────────────
  const openDrawer  = () => setOpen(true);
  const closeDrawer = () => setOpen(false);

  // ── Focus management ───────────────────────────────────────────────────────
  // Move focus INTO the drawer when it opens,
  // and BACK to the trigger button when it closes.
  // This is what prevents the "aria-hidden with focused descendant" error.
  useEffect(() => {
    if (open) {
      // Small timeout lets the CSS transition start before stealing focus,
      // which prevents a visual jump.
      const id = setTimeout(() => closeButtonRef.current?.focus(), 50);
      return () => clearTimeout(id);
    } else {
      // Return focus to the element that opened the drawer.
      hamburgerRef.current?.focus();
    }
  }, [open]);

  // ── Set `inert` imperatively via the DOM property ─────────────────────────
  // `inert` is set as a DOM property (not an HTML attribute string) so it
  // works reliably in React 18 where `inert` isn't a recognised JSX prop.
  // `inert` does THREE things aria-hidden cannot:
  //   1. Hides the element from the accessibility tree (same as aria-hidden)
  //   2. Prevents ALL keyboard focus from entering the subtree
  //   3. Blocks pointer events on the element
  // Using aria-hidden alone is what caused the bug — it hides content from
  // screen readers but does NOT stop keyboard users tabbing into the drawer,
  // so the close button could still receive focus while hidden.
  useEffect(() => {
    if (drawerRef.current) {
      drawerRef.current.inert = !open;
    }
  }, [open]);

  // ── Focus trap ────────────────────────────────────────────────────────────
  // While the drawer is open, Tab/Shift+Tab should cycle only within it.
  // Escape closes the drawer.
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeDrawer();
        return;
      }

      if (e.key !== 'Tab') return;

      const drawer = drawerRef.current;
      if (!drawer) return;

      // Collect all focusable elements currently visible in the drawer
      const focusable = [
        ...drawer.querySelectorAll(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ),
      ].filter((el) => !el.closest('[inert]') && !el.hasAttribute('disabled'));

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last  = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        // Shift+Tab from first element → wrap to last
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        // Tab from last element → wrap to first
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // ── Prevent body scroll while drawer is open ──────────────────────────────
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      <nav className="landing-nav">
        <div className="nav-inner">
          <div className="nav-logo">
            <img src="/logo-dark.png" alt="JMove Logistics" style={{ height: 40, width: 'auto', objectFit: 'contain' }} />
          </div>

          {/* Desktop links */}
          <div className="nav-links nav-links-desktop">
            <a href="/#services" className="nav-item">Services</a>
            <Link to="/track"    className="nav-item">Track Shipment</Link>
            <a href="/#about"    className="nav-item">About Us</a>
            <a href="/#why-us"   className="nav-item">Why JMove</a>
            <Link to="/login"    className="nav-signin">Sign In</Link>
            <Link to="/register" className="btn-primary nav-register">Get Started</Link>
          </div>

          {/* Mobile hamburger — ref'd so focus returns here on close */}
          <button
            ref={hamburgerRef}
            className="nav-hamburger"
            onClick={openDrawer}
            aria-label="Open navigation menu"
            aria-expanded={open}
            aria-controls="mobile-nav-drawer"
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M3 6h16M3 11h16M3 16h16"/>
            </svg>
          </button>
        </div>
      </nav>

      {/* Backdrop — purely visual/click-to-close, hidden from AT */}
      {open && (
        <div
          className="nav-overlay"
          onClick={closeDrawer}
          aria-hidden="true"   /* decorative — legitimate use of aria-hidden */
        />
      )}

      {/*
        Side drawer
        ───────────────────────────────────────────────────────────────────
        role="dialog" + aria-modal="true" tells screen readers this is a
        modal dialog and that content behind it should be ignored.

        We do NOT put aria-hidden here anymore.
        Instead we use `inert` (set imperatively in the useEffect above)
        which correctly blocks both AT discovery AND keyboard focus when
        the drawer is closed.
      */}
      <div
        id="mobile-nav-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`nav-drawer ${open ? 'nav-drawer--open' : ''}`}
      >
        {/* Drawer header — close button is first focusable element */}
        <div className="nav-drawer-header">
          <img
            src="/logo-dark.png"
            alt="JMove Logistics"
            style={{ height: 34, width: 'auto', objectFit: 'contain' }}
          />
          <button
            ref={closeButtonRef}
            className="nav-drawer-close"
            onClick={closeDrawer}
            aria-label="Close navigation menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M4 4l12 12M16 4L4 16"/>
            </svg>
          </button>
        </div>

        {/* Nav links */}
        <div className="nav-drawer-links">
          <a href="/#services" className="nav-drawer-item" onClick={closeDrawer}>
            <span className="nav-drawer-icon" aria-hidden="true">📦</span> Services
          </a>
          <Link to="/track" className="nav-drawer-item" onClick={closeDrawer}>
            <span className="nav-drawer-icon" aria-hidden="true">📍</span> Track Shipment
          </Link>
          <a href="/#about" className="nav-drawer-item" onClick={closeDrawer}>
            <span className="nav-drawer-icon" aria-hidden="true">🏢</span> About Us
          </a>
          <a href="/#why-us" className="nav-drawer-item" onClick={closeDrawer}>
            <span className="nav-drawer-icon" aria-hidden="true">⭐</span> Why JMove
          </a>
        </div>

        {/* CTA buttons */}
        <div className="nav-drawer-actions">
          <Link to="/login"    className="nav-drawer-signin" onClick={closeDrawer}>Sign In</Link>
          <Link to="/register" className="btn-primary nav-drawer-cta" onClick={closeDrawer}>Get Started</Link>
        </div>

        <p className="nav-drawer-tagline">"On Time. Everytime."</p>
      </div>
    </>
  );
}
