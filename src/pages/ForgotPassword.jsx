import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../api/client.js';
import './ForgotPassword.css';

const OTP_TTL_SEC        = 10 * 60;
const RESEND_COOLDOWN_SEC = 60;

// ── Step indicator ──────────────────────────────────────
function StepDots({ step }) {
  const labels = ['Email', 'Verify', 'Password'];
  return (
    <div className="fp-steps">
      {labels.map((label, i) => (
        <div key={i} className={`fp-step ${i + 1 === step ? 'active' : i + 1 < step ? 'done' : ''}`}>
          <div className="fp-step-dot">
            {i + 1 < step
              ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              : <span>{i + 1}</span>}
          </div>
          <span className="fp-step-label">{label}</span>
          {i < 2 && <div className="fp-step-line" />}
        </div>
      ))}
    </div>
  );
}

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step,    setStep]    = useState(1);          // 1 = email, 2 = OTP, 3 = new password
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // ── Step 2: OTP ──────────────────────────────────────
  const [digits,         setDigits]         = useState(Array(6).fill(''));
  const [timeLeft,       setTimeLeft]       = useState(OTP_TTL_SEC);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading,  setResendLoading]  = useState(false);
  const [resendMsg,      setResendMsg]      = useState('');
  const inputRefs = useRef([]);

  // ── Step 3: New password ─────────────────────────────
  const [resetToken,       setResetToken]       = useState('');
  const [newPassword,      setNewPassword]      = useState('');
  const [confirmPassword,  setConfirmPassword]  = useState('');
  const [showPw,           setShowPw]           = useState(false);
  const [done,             setDone]             = useState(false);

  // ── Timers ───────────────────────────────────────────
  useEffect(() => {
    if (step !== 2 || timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [step, timeLeft]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown > 0]);

  const fmt = (s) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ═══════════════════════════
  //  STEP 1: Enter email
  // ═══════════════════════════
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authAPI.forgotPassword(email);
      // Always move to step 2 regardless — anti-enumeration is on backend
      setStep(2);
      setTimeLeft(OTP_TTL_SEC);
      setResendCooldown(RESEND_COOLDOWN_SEC);
    } catch (err) {
      if (err.isNetworkError) {
        setError('Network issue — check your connection and try again.');
      } else if (err.status >= 500) {
        setError('Something went wrong on our end. Please try again in a moment.');
      } else {
        // Even on error, move forward (anti-enumeration)
        setStep(2);
        setTimeLeft(OTP_TTL_SEC);
        setResendCooldown(RESEND_COOLDOWN_SEC);
      }
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════
  //  STEP 2: Verify OTP
  // ═══════════════════════════
  const submitOtp = useCallback(async (codeStr) => {
    if (codeStr.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const res = await authAPI.verifyResetOtp({ email, otp: codeStr });
      setResetToken(res.data.resetToken);
      setStep(3);
    } catch (err) {
      if (err.isNetworkError) {
        setError('Network issue — check your connection and try again.');
      } else if (err.status === 429) {
        setError(err?.response?.data?.message || 'Too many attempts. Please request a new code.');
      } else {
        setError(err?.response?.data?.message || 'Invalid code. Please try again.');
      }
      setDigits(Array(6).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleDigitChange = (idx, raw) => {
    const val = raw.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[idx] = val;
    setDigits(next);
    setError('');
    if (val && idx < 5) inputRefs.current[idx + 1]?.focus();
    const code = next.join('');
    if (code.length === 6 && !code.includes('')) submitOtp(code);
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) inputRefs.current[idx - 1]?.focus();
    if (e.key === 'ArrowLeft'  && idx > 0) inputRefs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < 5) inputRefs.current[idx + 1]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = Array(6).fill('');
    pasted.split('').forEach((ch, i) => { if (i < 6) next[i] = ch; });
    setDigits(next);
    setError('');
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
    if (pasted.length === 6) submitOtp(pasted);
  };

  const handleResend = async () => {
    setResendLoading(true);
    setResendMsg('');
    setError('');
    try {
      await authAPI.forgotPassword(email);
      setTimeLeft(OTP_TTL_SEC);
      setResendCooldown(RESEND_COOLDOWN_SEC);
      setDigits(Array(6).fill(''));
      inputRefs.current[0]?.focus();
      setResendMsg('A new code has been sent.');
    } catch (err) {
      if (err.status === 429) {
        setError(err?.response?.data?.message || 'Too many requests. Please wait.');
      } else if (err.isNetworkError) {
        setError('Network issue — check your connection.');
      } else {
        setResendMsg('New code sent (if account exists).');
      }
    } finally {
      setResendLoading(false);
    }
  };

  // ═══════════════════════════
  //  STEP 3: New password
  // ═══════════════════════════
  const handleReset = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await authAPI.resetPassword({ resetToken, newPassword });
      setDone(true);
    } catch (err) {
      if (err.isNetworkError) {
        setError('Network issue — check your connection and try again.');
      } else if (err.status === 401) {
        const code = err?.response?.data?.code;
        if (code === 'RESET_TOKEN_EXPIRED') {
          setError('Reset link expired. Please start over.');
        } else if (code === 'RESET_TOKEN_USED') {
          setError('This reset link has already been used. Please start over.');
        } else {
          setError(err?.response?.data?.message || 'Invalid reset session.');
        }
      } else if (err.status === 400) {
        setError(err?.response?.data?.message || 'Please check your password requirements.');
      } else if (err.status >= 500) {
        setError('Something went wrong on our end. Please try again.');
      } else {
        setError(err?.response?.data?.message || 'Password reset failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const otp     = digits.join('');
  const expired = timeLeft === 0;

  // ── Final success state ────────────────────────────
  if (done) {
    return (
      <div className="fp-page">
        <div className="fp-card fade-in">
          <div className="fp-nav"><img src="/logo-orange-white.png" alt="JMove" style={{ height: 30, width: 'auto' }} /></div>
          <div className="fp-body">
            <div className="fp-icon fp-icon--success">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M6 16l7 7 13-14" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 style={{ color: 'var(--green)' }}>Password Updated!</h2>
            <p>Your password has been changed successfully.<br />Please log in with your new password.</p>
            <Link to="/login" className="btn-primary" style={{ marginTop: 20, display: 'inline-block', textAlign: 'center', textDecoration: 'none' }}>
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fp-page">
      <div className="fp-card fade-in">
        {/* Header */}
        <div className="fp-nav">
          <img src="/logo-orange-white.png" alt="JMove Logistics" style={{ height: 30, width: 'auto', objectFit: 'contain' }} />
        </div>

        <div className="fp-body">
          <h2 className="fp-title">Reset Password</h2>
          <p className="fp-sub">
            {step === 1 && 'Enter your email and we\'ll send you a verification code.'}
            {step === 2 && `Enter the 6-digit code sent to ${email}.`}
            {step === 3 && 'Choose a strong new password for your account.'}
          </p>

          <StepDots step={step} />

          {/* Error */}
          {error && (
            <div className="fp-error">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1" fill="none"/>
                <path d="M7 4v3.5M7 9v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {error}
            </div>
          )}
          {resendMsg && !error && (
            <div className="fp-resend-ok">✉ {resendMsg}</div>
          )}

          {/* ── Step 1: Email ── */}
          {step === 1 && (
            <form onSubmit={handleEmailSubmit} className="fp-form">
              <div className="fp-field">
                <label className="label">Email Address</label>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoFocus
                />
              </div>
              <button type="submit" className="btn-primary fp-btn" disabled={loading || !email.trim()}>
                {loading
                  ? <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} />
                  : 'Send Reset Code →'}
              </button>
              <p className="fp-back"><Link to="/login">← Back to login</Link></p>
            </form>
          )}

          {/* ── Step 2: OTP ── */}
          {step === 2 && (
            <div className="fp-otp-section">
              {/* Timer */}
              <div className={`fp-timer ${expired ? 'fp-timer--expired' : ''}`}>
                {expired
                  ? '⏰ Code expired — request a new one below'
                  : <>⏱ Code expires in <strong>{fmt(timeLeft)}</strong></>}
              </div>

              {/* 6-box input */}
              <div className="fp-otp-row">
                <div className="fp-otp-group">
                  {[0, 1, 2].map(i => (
                    <input key={i}
                      ref={el => (inputRefs.current[i] = el)}
                      className={`ve-box${digits[i] ? ' ve-box--filled' : ''}${error ? ' ve-box--error' : ''}`}
                      type="text" inputMode="numeric" maxLength={1}
                      value={digits[i]}
                      disabled={loading || expired}
                      onChange={e => handleDigitChange(i, e.target.value)}
                      onKeyDown={e => handleKeyDown(i, e)}
                      onPaste={handlePaste}
                      autoFocus={i === 0}
                      autoComplete="one-time-code"
                    />
                  ))}
                </div>
                <span className="fp-otp-sep">—</span>
                <div className="fp-otp-group">
                  {[3, 4, 5].map(i => (
                    <input key={i}
                      ref={el => (inputRefs.current[i] = el)}
                      className={`ve-box${digits[i] ? ' ve-box--filled' : ''}${error ? ' ve-box--error' : ''}`}
                      type="text" inputMode="numeric" maxLength={1}
                      value={digits[i]}
                      disabled={loading || expired}
                      onChange={e => handleDigitChange(i, e.target.value)}
                      onKeyDown={e => handleKeyDown(i, e)}
                      onPaste={handlePaste}
                    />
                  ))}
                </div>
              </div>

              <button
                className="btn-primary fp-btn"
                onClick={() => submitOtp(otp)}
                disabled={loading || otp.length < 6 || otp.includes('') || expired}
              >
                {loading
                  ? <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} />
                  : 'Verify Code →'}
              </button>

              <div className="fp-resend">
                <span>Didn't receive it?</span>
                {resendCooldown > 0
                  ? <span className="fp-resend-wait">Resend in {resendCooldown}s</span>
                  : <button className="fp-resend-btn" onClick={handleResend} disabled={resendLoading}>
                      {resendLoading ? <span className="spinner spinner-sm" /> : 'Resend code'}
                    </button>}
              </div>

              <p className="fp-back">
                <button className="fp-link-btn" onClick={() => { setStep(1); setError(''); setDigits(Array(6).fill('')); }}>
                  ← Change email
                </button>
              </p>
            </div>
          )}

          {/* ── Step 3: New password ── */}
          {step === 3 && (
            <form onSubmit={handleReset} className="fp-form">
              <div className="fp-field">
                <label className="label">New Password</label>
                <div className="pw-wrap">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="input"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Min. 8 chars, uppercase & number"
                    required minLength={8}
                    autoFocus
                  />
                  <button type="button" className="pw-toggle" onClick={() => setShowPw(s => !s)}>
                    {showPw ? '🙈' : '👁'}
                  </button>
                </div>
              </div>
              <div className="fp-field">
                <label className="label">Confirm New Password</label>
                <input
                  type="password"
                  className="input"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  required
                />
              </div>

              {/* Password strength hints */}
              <ul className="fp-hints">
                {[
                  [/[A-Z]/.test(newPassword),       'Uppercase letter'],
                  [/[0-9]/.test(newPassword),       'Number'],
                  [/[^A-Za-z0-9]/.test(newPassword),'Special character'],
                  [newPassword.length >= 8,         'At least 8 characters'],
                ].map(([ok, txt]) => (
                  <li key={txt} className={ok ? 'fp-hint--ok' : ''}>
                    {ok ? '✓' : '·'} {txt}
                  </li>
                ))}
              </ul>

              <button
                type="submit"
                className="btn-primary fp-btn"
                disabled={loading || !newPassword || !confirmPassword}
              >
                {loading
                  ? <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} />
                  : 'Set New Password'}
              </button>
            </form>
          )}
        </div>

        <div className="fp-footer">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="var(--text-faint)" strokeWidth="1.5">
            <rect x="1.5" y="5.5" width="10" height="6" rx="1"/>
            <path d="M4 5.5V4a2.5 2.5 0 015 0v1.5"/>
          </svg>
          Secured by JMove Logistics
        </div>
      </div>
    </div>
  );
}
