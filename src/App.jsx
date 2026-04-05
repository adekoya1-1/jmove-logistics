import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, createContext, useContext } from 'react';
import './App.css';
import api from './api/client.js';

// ── Auth Context ──────────────────────────────────────────────────────────────
export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  // ── SECURITY: Never trust the user object cached in localStorage.
  //
  //    Previous approach: initialise user from localStorage, skip backend
  //    validation when an access token was also present.
  //    Attack: attacker writes { role: 'admin' } to jmove_auth in localStorage
  //    + any string to sessionStorage accessToken → RequireAuth let them
  //    straight through to all admin routes.
  //
  //    Fix: always start with user = null and ALWAYS validate with the backend
  //    before showing any protected content.  We only skip validation when
  //    there is genuinely nothing in storage (fresh visitor, or after logout).
  // ────────────────────────────────────────────────────────────────────────
  const { accessToken, refreshToken } = api.getTokens();
  const hasSession = !!(accessToken || refreshToken);

  const [user,    setUser]    = useState(null);          // never seeded from storage
  const [loading, setLoading] = useState(hasSession);    // spinner only when we have tokens to validate

  useEffect(() => {
    if (!hasSession) {
      // No tokens at all — clear any stale user data that might be in storage
      // and render immediately (no spinner needed).
      api.clearTokens();
      setLoading(false);
      return;
    }

    let cancelled = false; // cleanup for strict-mode double-invoke

    const validateSession = async () => {
      try {
        const { authAPI } = await import('./api/client.js');

        // Case: access token missing (e.g. new tab — sessionStorage wiped) but
        //       refresh token present in localStorage.  Refresh first so that
        //       the profile call below has a valid Bearer token to send.
        const current = api.getTokens();
        if (!current.accessToken && current.refreshToken) {
          await api.refreshSession();   // updates accessToken in memory + sessionStorage
        }

        // This call goes through fetchWithAuth which will:
        //   a) attach the (possibly just-refreshed) access token
        //   b) handle TOKEN_EXPIRED by rotating once more if needed
        //   c) throw on any other auth failure
        const r = await authAPI.profile();
        if (!cancelled) {
          setUser(r.data);
          api.saveTokens({ user: r.data });
        }
      } catch {
        // Token invalid, expired beyond refresh, or account deactivated —
        // wipe everything and force the user to log in again.
        api.clearTokens();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    validateSession();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = (userData, tokens) => {
    api.saveTokens({ ...tokens, user: userData });
    setUser(userData);
  };

  const logout = async () => {
    try { await import('./api/client.js').then(m => m.authAPI.logout()); } catch {}
    api.clearTokens();
    setUser(null);
  };

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <div className="spinner spinner-lg" />
    </div>
  );

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

// ── Route guards ──────────────────────────────────────────────────────────────
function RequireAuth({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    const map = { admin: '/admin', customer: '/dashboard', driver: '/driver' };
    return <Navigate to={map[user.role] || '/'} replace />;
  }
  return children;
}

// ── Lazy page imports ─────────────────────────────────────────────────────────
import Landing           from './pages/Landing.jsx';
import Login             from './pages/Login.jsx';
import Register          from './pages/Register.jsx';
import PaymentVerify     from './pages/PaymentVerify.jsx';
import TrackOrder        from './pages/TrackOrder.jsx';

import AdminLayout       from './components/admin/AdminLayout.jsx';
import AdminDashboard    from './pages/admin/AdminDashboard.jsx';
import AdminOrders       from './pages/admin/AdminOrders.jsx';
import AdminOrderDetail  from './pages/admin/AdminOrderDetail.jsx';
import AdminDrivers      from './pages/admin/AdminDrivers.jsx';
import AdminUsers        from './pages/admin/AdminUsers.jsx';
import AdminMap          from './pages/admin/AdminMap.jsx';
import AdminAnalytics    from './pages/admin/AdminAnalytics.jsx';
import AdminPayments     from './pages/admin/AdminPayments.jsx';

import CustomerLayout    from './components/customer/CustomerLayout.jsx';
import CustomerDashboard from './pages/customer/CustomerDashboard.jsx';
import CustomerOrders    from './pages/customer/CustomerOrders.jsx';
import CustomerOrderDetail from './pages/customer/CustomerOrderDetail.jsx';
import NewOrder          from './pages/customer/NewOrder.jsx';
import CustomerPayments  from './pages/customer/CustomerPayments.jsx';

import DriverLayout      from './components/driver/DriverLayout.jsx';
import DriverDashboard   from './pages/driver/DriverDashboard.jsx';
import DriverJobs        from './pages/driver/DriverJobs.jsx';
import DriverActive      from './pages/driver/DriverActive.jsx';
import DriverHistory     from './pages/driver/DriverHistory.jsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/"        element={<Landing />} />
          <Route path="/login"   element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/track"   element={<TrackOrder />} />
          <Route path="/payment/verify" element={<PaymentVerify />} />

          {/* Admin */}
          <Route path="/admin" element={<RequireAuth roles={['admin']}><AdminLayout /></RequireAuth>}>
            <Route index         element={<AdminDashboard />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="orders/:id" element={<AdminOrderDetail />} />
            <Route path="drivers"    element={<AdminDrivers />} />
            <Route path="users"      element={<AdminUsers />} />
            <Route path="map"        element={<AdminMap />} />
            <Route path="analytics"  element={<AdminAnalytics />} />
            <Route path="payments"   element={<AdminPayments />} />
          </Route>

          {/* Customer */}
          <Route path="/dashboard" element={<RequireAuth roles={['customer']}><CustomerLayout /></RequireAuth>}>
            <Route index            element={<CustomerDashboard />} />
            <Route path="orders"    element={<CustomerOrders />} />
            <Route path="orders/:id" element={<CustomerOrderDetail />} />
            <Route path="new-order"  element={<NewOrder />} />
            <Route path="payments"   element={<CustomerPayments />} />
          </Route>

          {/* Driver */}
          <Route path="/driver" element={<RequireAuth roles={['driver']}><DriverLayout /></RequireAuth>}>
            <Route index         element={<DriverDashboard />} />
            <Route path="jobs"   element={<DriverJobs />} />
            <Route path="active" element={<DriverActive />} />
            <Route path="history" element={<DriverHistory />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
