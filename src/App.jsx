import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect, createContext, useContext, lazy, Suspense } from 'react';
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

// ── Scroll to top on every navigation ────────────────────────────────────────
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
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

// ── Page imports ──────────────────────────────────────────────────────────────
// Eager: only the three pages a landing-page visitor might hit immediately.
// Everything else is lazy-loaded so the initial JS bundle only contains what's
// needed to render "/" — keeping Recharts, Leaflet, Socket.io, and 30+ page
// components out of the critical path entirely.
import Landing  from './pages/Landing.jsx';
import Login    from './pages/Login.jsx';
import Register from './pages/Register.jsx';

// ── Lazy public pages ─────────────────────────────────────────────────────────
const VerifyEmail    = lazy(() => import('./pages/VerifyEmail.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const PaymentVerify  = lazy(() => import('./pages/PaymentVerify.jsx'));
const TrackOrder     = lazy(() => import('./pages/TrackOrder.jsx'));
const ContactUs      = lazy(() => import('./pages/ContactUs.jsx'));
const HelpSupport    = lazy(() => import('./pages/HelpSupport.jsx'));
const Careers        = lazy(() => import('./pages/Careers.jsx'));
const PrivacyPolicy  = lazy(() => import('./pages/PrivacyPolicy.jsx'));
const TermsOfService = lazy(() => import('./pages/TermsOfService.jsx'));

// ── Lazy admin pages (Recharts + Leaflet live here) ───────────────────────────
const AdminLayout      = lazy(() => import('./components/admin/AdminLayout.jsx'));
const AdminDashboard   = lazy(() => import('./pages/admin/AdminDashboard.jsx'));
const AdminOrders      = lazy(() => import('./pages/admin/AdminOrders.jsx'));
const AdminOrderDetail = lazy(() => import('./pages/admin/AdminOrderDetail.jsx'));
const AdminDrivers     = lazy(() => import('./pages/admin/AdminDrivers.jsx'));
const AdminUsers       = lazy(() => import('./pages/admin/AdminUsers.jsx'));
const AdminMap         = lazy(() => import('./pages/admin/AdminMap.jsx'));
const AdminAnalytics   = lazy(() => import('./pages/admin/AdminAnalytics.jsx'));
const AdminPayments    = lazy(() => import('./pages/admin/AdminPayments.jsx'));
const AdminPricing     = lazy(() => import('./pages/admin/AdminPricing.jsx'));
const AdminCustomers   = lazy(() => import('./pages/admin/AdminCustomers.jsx'));
const AdminFleet       = lazy(() => import('./pages/admin/AdminFleet.jsx'));
const AdminSettings    = lazy(() => import('./pages/admin/AdminSettings.jsx'));
const AdminLogs        = lazy(() => import('./pages/admin/AdminLogs.jsx'));
const AdminStates      = lazy(() => import('./pages/admin/AdminStates.jsx'));
const AdminRoutes      = lazy(() => import('./pages/admin/AdminRoutes.jsx'));

// ── Lazy customer pages ───────────────────────────────────────────────────────
const CustomerLayout     = lazy(() => import('./components/customer/CustomerLayout.jsx'));
const CustomerDashboard  = lazy(() => import('./pages/customer/CustomerDashboard.jsx'));
const CustomerOrders     = lazy(() => import('./pages/customer/CustomerOrders.jsx'));
const CustomerOrderDetail = lazy(() => import('./pages/customer/CustomerOrderDetail.jsx'));
const NewOrder           = lazy(() => import('./pages/customer/NewOrder.jsx'));
const CustomerPayments   = lazy(() => import('./pages/customer/CustomerPayments.jsx'));

// ── Lazy driver pages (Socket.io lives here) ──────────────────────────────────
const DriverLayout      = lazy(() => import('./components/driver/DriverLayout.jsx'));
const DriverDashboard   = lazy(() => import('./pages/driver/DriverDashboard.jsx'));
const DriverJobs        = lazy(() => import('./pages/driver/DriverJobs.jsx'));
const DriverActive      = lazy(() => import('./pages/driver/DriverActive.jsx'));
const DriverHistory     = lazy(() => import('./pages/driver/DriverHistory.jsx'));
const DriverProfile     = lazy(() => import('./pages/driver/DriverProfile.jsx'));
const DriverPerformance = lazy(() => import('./pages/driver/DriverPerformance.jsx'));
const DriverRoute       = lazy(() => import('./pages/driver/DriverRoute.jsx'));

// ── Suspense fallback — same spinner used by the auth loader ──────────────────
function PageLoader() {
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <div className="spinner spinner-lg" />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public */}
          <Route path="/"                 element={<Landing />} />
          <Route path="/login"            element={<Login />} />
          <Route path="/register"         element={<Register />} />
          <Route path="/verify-email"     element={<VerifyEmail />} />
          <Route path="/forgot-password"  element={<ForgotPassword />} />
          <Route path="/track"            element={<TrackOrder />} />
          <Route path="/payment/verify"   element={<PaymentVerify />} />
          <Route path="/contact"          element={<ContactUs />} />
          <Route path="/help"             element={<HelpSupport />} />
          <Route path="/careers"          element={<Careers />} />
          <Route path="/privacy-policy"   element={<PrivacyPolicy />} />
          <Route path="/terms"            element={<TermsOfService />} />

          {/* Admin */}
          <Route path="/admin" element={<RequireAuth roles={['admin']}><AdminLayout /></RequireAuth>}>
            <Route index              element={<AdminDashboard />} />
            <Route path="orders"      element={<AdminOrders />} />
            <Route path="orders/:id"  element={<AdminOrderDetail />} />
            <Route path="drivers"     element={<AdminDrivers />} />
            <Route path="users"       element={<AdminUsers />} />
            <Route path="customers"   element={<AdminCustomers />} />
            <Route path="map"         element={<AdminMap />} />
            <Route path="analytics"   element={<AdminAnalytics />} />
            <Route path="payments"    element={<AdminPayments />} />
            <Route path="pricing"     element={<AdminPricing />} />
            <Route path="states"      element={<AdminStates />} />
            <Route path="fleet"       element={<AdminFleet />} />
            <Route path="routes"      element={<AdminRoutes />} />
            <Route path="settings"    element={<AdminSettings />} />
            <Route path="logs"        element={<AdminLogs />} />
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
            <Route path="performance" element={<DriverPerformance />} />
            <Route path="profile"     element={<DriverProfile />} />
            <Route path="route"       element={<DriverRoute />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
