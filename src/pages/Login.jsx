import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { authAPI } from '../api/client.js';
import './Login.css';
import SEO from '../components/SEO.jsx';

export default function Login() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const { login }  = useAuth();
  const navigate   = useNavigate();
  const [params]   = useSearchParams();

  // Show a message when redirected back after session expiry
  const sessionMsg = params.get('reason') === 'session_expired'
    ? 'Your session expired. Please log in again.'
    : null;

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await authAPI.login({ email, password });
      login(res.data.user, { accessToken: res.data.accessToken, refreshToken: res.data.refreshToken });
      const map = { admin: '/admin', customer: '/dashboard', driver: '/driver' };
      navigate(map[res.data.user.role] || '/dashboard');
    } catch (err) {
      if (err.isNetworkError) {
        setError('Network issue — check your connection and try again.');
      } else if (err.status === 423) {
        // Account locked (too many failed attempts)
        setError(err?.response?.data?.message || 'Account temporarily locked. Try again later.');
      } else if (err.status === 403 && err?.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        // Account exists but email not yet verified — offer to go verify
        const unverifiedEmail = err?.response?.data?.data?.email || email;
        setError(`Email not verified. Please check your inbox for a code.`);
        // Small delay so user sees the message, then navigate
        setTimeout(() => navigate(`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`), 1800);
      } else if (err.status === 401) {
        setError('Invalid email or password.');
      } else if (err.status === 400) {
        // Validation error from Zod — first field error or outer message
        const first = err?.response?.data?.errors?.[0]?.message;
        setError(first || err?.response?.data?.message || 'Please check your details and try again.');
      } else if (err.status >= 500) {
        setError('Something went wrong on our end — please try again in a moment.');
      } else {
        setError(err?.response?.data?.message || 'Login failed — please try again.');
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <SEO title="Sign In" description="Sign in to your JMove Logistics account to manage your haulage bookings, track shipments, and view payment history." canonical="/login" noindex />
      {/* Left: form */}
      <div className="auth-panel slide-up">
        <div className="auth-logo">
          <img src="/logo-dark.png" alt="JMove Logistics" className="auth-logo-img" />
        </div>

        <h1 className="auth-title">Welcome Back to JMove</h1>
        <p className="auth-sub">Sign in to manage your haulage bookings</p>

        {sessionMsg && !error && (
          <div className="auth-error" style={{ background: '#FFFBEB', borderColor: 'rgba(245,158,11,0.3)', color: '#92400E' }}>
            ⏰ {sessionMsg}
          </div>
        )}

        {error && (
          <div className="auth-error">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1" fill="none"/><path d="M7 4v4M7 9.5v.5"/></svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field">
            <label className="label">Email Address</label>
            <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required autoFocus />
          </div>
          <div className="field">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <label className="label" style={{ margin:0 }}>Password</label>
              <Link to="/forgot-password" className="auth-forgot">Forgot password?</Link>
            </div>
            <div className="pw-wrap">
              <input type={showPw?'text':'password'} className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
              <button type="button" className="pw-toggle" onClick={() => setShowPw(!showPw)}>
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <button type="submit" className="btn-primary auth-submit" disabled={loading}>
            {loading ? <span className="spinner spinner-sm" style={{ borderTopColor:'white' }} /> : 'Sign In'}
          </button>
        </form>

        <p className="auth-footer">Don't have an account? <Link to="/register">Create one free</Link></p>
      </div>

      {/* Right: branding */}
      <div className="auth-bg">
        <div className="auth-bg-content">
          <h2 className="auth-bg-title">Ship with confidence across Nigeria</h2>
          <p className="auth-bg-sub">Join thousands of businesses using JMove Logistics for reliable, trackable deliveries with instant payments.</p>
          <div className="auth-bg-features">
            {[
              { icon:'🚛', title:'Professional Drivers', desc:'Trained, licensed drivers with strong safety records.' },
              { icon:'📦', title:'All Types of Haulage', desc:'House moves, office moves, bulk goods and commercial.' },
              { icon:'🛡️', title:'Safe & Accountable', desc:'Every delivery tracked, insured, and fully accountable.' },
            ].map(f => (
              <div key={f.title} className="auth-bg-feature">
                <div className="abf-icon">{f.icon}</div>
                <div>
                  <p className="abf-title">{f.title}</p>
                  <p className="abf-desc">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="auth-bg-stripe" />
      </div>
    </div>
  );
}
