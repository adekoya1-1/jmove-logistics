import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { authAPI } from '../api/client.js';
import './Register.css';
import SEO from '../components/SEO.jsx';

export default function Register() {
  const [showPw,  setShowPw]  = useState(false);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '',
  });
  const { login }  = useAuth();
  const navigate   = useNavigate();

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await authAPI.register({ ...form });
      // Registration no longer auto-logs in — account must be verified first.
      // Backend returns { data: { email } } — redirect to OTP page.
      const email = res.data?.email || form.email;
      navigate(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      if (err.isNetworkError) {
        setError('Network issue — check your connection and try again.');
      } else if (err.status === 409) {
        setError('An account with this email already exists. Try logging in instead.');
      } else if (err.status === 400) {
        const first = err?.response?.data?.errors?.[0]?.message;
        setError(first || err?.response?.data?.message || 'Please check your details and try again.');
      } else if (err.status >= 500) {
        setError('Something went wrong on our end — please try again in a moment.');
      } else {
        setError(err?.response?.data?.message || 'Registration failed — please try again.');
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page register">
      <SEO title="Create Account" description="Sign up for a free JMove Logistics account to book haulage services across Nigeria, track your shipments, and manage your deliveries online." canonical="/register" noindex />
      <div className="auth-panel wide slide-up">
        <div className="auth-logo">
          <img src="/logo-dark.png" alt="JMove Logistics" className="auth-logo-img" />
        </div>
        <h1 className="auth-title">Create Your JMove Account</h1>
        <p className="auth-sub">Book haulage services across Nigeria in minutes</p>

        {/* Driver notice */}
        <div className="driver-notice">
          <div className="driver-notice-icon">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--blue)"><circle cx="8" cy="8" r="7" stroke="var(--blue)" strokeWidth="1.5" fill="none"/><path d="M8 7v4M8 5v.5" stroke="var(--blue)" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
          <p>
            <strong>Are you a driver?</strong> Driver accounts are created by the JMove Logistics operations team.
            Contact your operations manager for login credentials.
          </p>
        </div>

        {error && <div className="auth-error">⚠ {error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field-row">
            <div className="field">
              <label className="label">First Name</label>
              <input type="text" className="input" value={form.firstName} onChange={set('firstName')} placeholder="John" required />
            </div>
            <div className="field">
              <label className="label">Last Name</label>
              <input type="text" className="input" value={form.lastName} onChange={set('lastName')} placeholder="Doe" required />
            </div>
          </div>
          <div className="field">
            <label className="label">Email Address</label>
            <input type="email" className="input" value={form.email} onChange={set('email')} placeholder="you@company.com" required />
          </div>
          <div className="field">
            <label className="label">Phone Number</label>
            <input type="tel" className="input" value={form.phone} onChange={set('phone')} placeholder="+234 801 234 5678" />
          </div>
          <div className="field">
            <label className="label">Password</label>
            <div className="pw-wrap">
              <input
                type={showPw ? 'text' : 'password'} className="input"
                value={form.password} onChange={set('password')}
                placeholder="Min. 8 chars, include uppercase & number"
                required minLength={8}
              />
              <button type="button" className="pw-toggle" onClick={() => setShowPw(!showPw)}>
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary auth-submit" disabled={loading}>
            {loading ? <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} /> : 'Create Account'}
          </button>
        </form>

        <p className="auth-footer">Already have an account? <Link to="/login">Sign in</Link></p>
      </div>

      <div className="auth-bg">
        <div className="auth-bg-content">
          <h2 className="auth-bg-title">JMove Logistics — Haulage You Can Trust</h2>
          <p className="auth-bg-sub">Safe, timely, and efficient movement of goods across local, regional, and national routes in Nigeria.</p>
          <div className="auth-bg-features">
            {[
              { icon: '💰', title: 'Transparent Pricing',   desc: 'Clear cost breakdowns upfront. No hidden charges.' },
              { icon: '📍', title: 'Live Tracking',          desc: 'Know where your goods are at every stage of the journey.' },
              { icon: '🚛', title: 'Modern Fleet',           desc: 'Well-maintained vehicles and experienced professional drivers.' },
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
