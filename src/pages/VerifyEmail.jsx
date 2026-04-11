import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { authAPI } from '../api/client.js';
import './VerifyEmail.css';
import SEO from '../components/SEO.jsx';

const OTP_TTL_SEC   = 10 * 60; // 10 minutes — must match backend
const RESEND_COOLDOWN_SEC = 60; // 60 seconds between resends

export default function VerifyEmail() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const { login }  = useAuth();

  const email = params.get('email') || '';

  // Six individual digit values
  const [digits,   setDigits]   = useState(Array(6).fill(''));
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  // Countdown until OTP expires (counts down from OTP_TTL_SEC)
  const [timeLeft,       setTimeLeft]       = useState(OTP_TTL_SEC);
  // Cooldown before Resend button re-enables
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading,  setResendLoading]  = useState(false);
  const [resendMsg,      setResendMsg]      = useState('');

  // Refs for the 6 input boxes
  const inputRefs = useRef([]);

  // ── Redirect if no email param ──────────────────────────
  useEffect(() => {
    if (!email) navigate('/register', { replace: true });
  }, [email, navigate]);

  // ── OTP expiry countdown ────────────────────────────────
  useEffect(() => {
    if (timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [timeLeft]);

  // ── Resend cooldown ticker ──────────────────────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown > 0]);

  // ── Format mm:ss ────────────────────────────────────────
  const fmt = (s) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ── Submit OTP ──────────────────────────────────────────
  const submitOtp = useCallback(async (codeStr) => {
    if (codeStr.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const res = await authAPI.verifyOtp({ email, otp: codeStr });
      setSuccess(true);
      login(res.data.user, {
        accessToken:  res.data.accessToken,
        refreshToken: res.data.refreshToken,
      });
      const map = { admin: '/admin', customer: '/dashboard', driver: '/driver' };
      setTimeout(() => navigate(map[res.data.user.role] || '/dashboard', { replace: true }), 1200);
    } catch (err) {
      if (err.isNetworkError) {
        setError('Network issue — check your connection and try again.');
      } else if (err.status === 429) {
        setError(err?.response?.data?.message || 'Too many attempts. Please request a new code.');
      } else {
        setError(err?.response?.data?.message || 'Invalid code. Please try again.');
      }
      // Clear inputs so user can re-enter
      setDigits(Array(6).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }, [email, login, navigate]);

  // ── Handle single-box input ─────────────────────────────
  const handleChange = (idx, raw) => {
    // Accept only one digit; take the last character if user types fast
    const val = raw.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[idx] = val;
    setDigits(next);
    setError('');

    if (val && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
    }

    // Auto-submit when all 6 filled
    const code = next.join('');
    if (code.length === 6 && !code.includes('')) {
      submitOtp(code);
    }
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && idx > 0)  inputRefs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < 5) inputRefs.current[idx + 1]?.focus();
  };

  // ── Paste support — distribute digits across all boxes ──
  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = Array(6).fill('');
    pasted.split('').forEach((ch, i) => { if (i < 6) next[i] = ch; });
    setDigits(next);
    setError('');
    // Focus last filled box
    const lastIdx = Math.min(pasted.length, 5);
    inputRefs.current[lastIdx]?.focus();
    if (pasted.length === 6) submitOtp(pasted);
  };

  // ── Resend OTP ──────────────────────────────────────────
  const handleResend = async () => {
    setResendLoading(true);
    setResendMsg('');
    setError('');
    try {
      await authAPI.resendOtp(email);
      setTimeLeft(OTP_TTL_SEC);
      setResendCooldown(RESEND_COOLDOWN_SEC);
      setDigits(Array(6).fill(''));
      inputRefs.current[0]?.focus();
      setResendMsg('A new code has been sent to your email.');
    } catch (err) {
      if (err.status === 429) {
        const waitSec = err?.response?.data?.data?.waitSeconds;
        setError(
          waitSec
            ? `Please wait ${waitSec}s before requesting a new code.`
            : (err?.response?.data?.message || 'Too many requests. Please wait.')
        );
        if (waitSec) setResendCooldown(waitSec);
      } else if (err.isNetworkError) {
        setError('Network issue — check your connection.');
      } else {
        setError('Could not resend code. Please try again.');
      }
    } finally {
      setResendLoading(false);
    }
  };

  const otp = digits.join('');
  const expired = timeLeft === 0;

  return (
    <div className="ve-page">
      <SEO title="Verify Your Email" description="Verify your JMove Logistics account email address with the OTP code sent to your inbox." noindex />
      <div className="ve-card fade-in">
        {/* Header */}
        <div className="ve-header">
          <div className="ve-logo">
            <img src="/logo-orange-white.png" alt="JMove Logistics" style={{ height: 30, width: 'auto', objectFit: 'contain' }} />
          </div>
        </div>

        <div className="ve-body">
          {success ? (
            /* ── Success state ── */
            <div className="ve-success">
              <div className="ve-icon success">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <path d="M6 16l7 7 13-14" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2>Email Verified!</h2>
              <p>Welcome to JMove Logistics. Redirecting you now…</p>
              <span className="spinner spinner-sm" style={{ marginTop: 8 }} />
            </div>
          ) : (
            /* ── Verification form ── */
            <>
              <div className="ve-icon-wrap">
                <div className="ve-icon-circle">
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <rect x="3" y="5" width="22" height="18" rx="2" stroke="var(--brand)" strokeWidth="2"/>
                    <path d="M3 10l11 7 11-7" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>

              <h2 className="ve-title">Check your email</h2>
              <p className="ve-sub">
                We sent a 6-digit verification code to<br />
                <strong>{email}</strong>
              </p>

              {/* Timer */}
              <div className={`ve-timer ${expired ? 've-timer--expired' : ''}`}>
                {expired ? (
                  <>⏰ Code expired — request a new one below</>
                ) : (
                  <>⏱ Code expires in <strong>{fmt(timeLeft)}</strong></>
                )}
              </div>

              {/* Error / resend message */}
              {error && (
                <div className="ve-error">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1" fill="none"/>
                    <path d="M7 4v3.5M7 9v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  {error}
                </div>
              )}
              {resendMsg && !error && (
                <div className="ve-resend-msg">✉ {resendMsg}</div>
              )}

              {/* 6-digit input grid */}
              <div className="ve-otp-row">
                {/* Group 1: boxes 0–2 */}
                <div className="ve-otp-group">
                  {[0, 1, 2].map(i => (
                    <input
                      key={i}
                      ref={el => (inputRefs.current[i] = el)}
                      className={`ve-box${digits[i] ? ' ve-box--filled' : ''}${error ? ' ve-box--error' : ''}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digits[i]}
                      disabled={loading || expired || success}
                      onChange={e => handleChange(i, e.target.value)}
                      onKeyDown={e => handleKeyDown(i, e)}
                      onPaste={handlePaste}
                      autoFocus={i === 0}
                      autoComplete="one-time-code"
                    />
                  ))}
                </div>
                <span className="ve-otp-sep">—</span>
                {/* Group 2: boxes 3–5 */}
                <div className="ve-otp-group">
                  {[3, 4, 5].map(i => (
                    <input
                      key={i}
                      ref={el => (inputRefs.current[i] = el)}
                      className={`ve-box${digits[i] ? ' ve-box--filled' : ''}${error ? ' ve-box--error' : ''}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digits[i]}
                      disabled={loading || expired || success}
                      onChange={e => handleChange(i, e.target.value)}
                      onKeyDown={e => handleKeyDown(i, e)}
                      onPaste={handlePaste}
                    />
                  ))}
                </div>
              </div>

              {/* Verify button */}
              <button
                className="btn-primary ve-submit"
                onClick={() => submitOtp(otp)}
                disabled={loading || otp.length < 6 || otp.includes('') || expired}
              >
                {loading
                  ? <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} />
                  : 'Verify Email'}
              </button>

              {/* Resend section */}
              <div className="ve-resend">
                <span className="ve-resend-label">Didn't receive a code?</span>
                {resendCooldown > 0 ? (
                  <span className="ve-resend-wait">Resend in {resendCooldown}s</span>
                ) : (
                  <button
                    className="ve-resend-btn"
                    onClick={handleResend}
                    disabled={resendLoading}
                  >
                    {resendLoading
                      ? <span className="spinner spinner-sm" />
                      : 'Resend code'}
                  </button>
                )}
              </div>

              <div className="ve-footer-links">
                <Link to="/register">← Wrong email? Re-register</Link>
              </div>
            </>
          )}
        </div>

        <div className="ve-footer">
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
