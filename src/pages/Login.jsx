import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { authAPI } from '../api/client.js';
import './Login.css';

export default function Login() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const { login }  = useAuth();
  const navigate   = useNavigate();

  const fill = (role) => {
    const c = { admin:['admin@jmovelogistics.com','Admin@123'], customer:['customer@jmovelogistics.com','Customer@123'], driver:['driver@jmovelogistics.com','Driver@123'] };
    setEmail(c[role][0]); setPassword(c[role][1]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await authAPI.login({ email, password });
      login(res.data.user, { accessToken: res.data.accessToken, refreshToken: res.data.refreshToken });
      const map = { admin: '/admin', customer: '/dashboard', driver: '/driver' };
      navigate(map[res.data.user.role] || '/dashboard');
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid email or password');
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      {/* Left: form */}
      <div className="auth-panel slide-up">
        <div className="auth-logo">
          <img src="/logo-dark.png" alt="JMove Logistics" className="auth-logo-img" />
        </div>

        <h1 className="auth-title">Welcome Back to JMove</h1>
        <p className="auth-sub">Sign in to manage your haulage bookings</p>

        <div className="demo-bar">
          <span className="demo-label">Try demo:</span>
          {['admin','customer','driver'].map(r => (
            <button key={r} className="demo-btn" onClick={() => fill(r)}>{r}</button>
          ))}
        </div>

        {error && (
          <div className="auth-error">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1" fill="none"/><path d="M7 4v4M7 9.5v.5"/></svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field">
            <label className="label">Email Address</label>
            <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoFocus />
          </div>
          <div className="field">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <label className="label" style={{ margin:0 }}>Password</label>
              <a href="#" className="auth-forgot">Forgot password?</a>
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
