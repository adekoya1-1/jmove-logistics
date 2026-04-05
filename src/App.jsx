import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, createContext, useContext } from 'react';
import './App.css';
import api from './api/client.js';

// ── Auth Context ──────────────────────────────────────────────────────────────
export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  const stored    = api.getTokens();
  const [user,    setUser]    = useState(stored.user || null);
  const [loading, setLoading] = useState(!!stored.accessToken && !stored.user);

  useEffect(() => {
    if (stored.accessToken && !stored.user) {
      import('./api/client.js').then(({ authAPI }) =>
        authAPI.profile()
          .then(r => { setUser(r.data); api.saveTokens({ user: r.data }); })
          .catch(() => { api.clearTokens(); setUser(null); })
          .finally(() => setLoading(false))
      );
    }
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
