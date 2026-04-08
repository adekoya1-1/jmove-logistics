import { useState, useEffect } from 'react';
import { driversAPI } from '../../api/client.js';
import { useAuth } from '../../App.jsx';
import { format } from 'date-fns';
import './DriverProfile.css';

export default function DriverProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    driversAPI.me()
      .then(r => setProfile(r.data))
      .catch(e => setError(e?.response?.data?.message || 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', padding:60 }}>
      <div className="spinner spinner-lg" />
    </div>
  );

  if (error) return (
    <div className="dp-error">⚠ {error}</div>
  );

  const dp = profile;
  const u  = dp?.userId;

  const vehicleIcons = { bike:'🏍', car:'🚗', van:'🚐', truck:'🚛' };
  const vehicleIcon  = vehicleIcons[dp?.vehicleType] || '🚗';

  const verifiedStatus = dp?.isVerified
    ? { label: '✅ Verified & Active',  cls:'dp-badge-verified' }
    : { label: '⏳ Pending Verification', cls:'dp-badge-pending' };

  return (
    <div className="driver-profile-page">
      <div className="page-header">
        <h1 className="page-title">My Profile</h1>
        <p className="page-subtitle">Your driver account and vehicle information</p>
      </div>

      {/* ── Verification Banner ── */}
      {!dp?.isVerified && (
        <div className="dp-verify-banner">
          <span>⚠</span>
          <div>
            <p className="dp-verify-title">Account Pending Activation</p>
            <p className="dp-verify-sub">Contact your operations manager or call our dispatch centre to activate your account.</p>
          </div>
        </div>
      )}

      {/* ── Identity Card ── */}
      <div className="card dp-card">
        <div className="dp-card-header">
          <div className="dp-avatar">{user?.firstName?.[0]}{user?.lastName?.[0]}</div>
          <div className="dp-card-info">
            <h2 className="dp-name">{u?.firstName || user?.firstName} {u?.lastName || user?.lastName}</h2>
            <p className="dp-role">🚚 JMove Logistics Driver</p>
            <span className={`dp-badge ${verifiedStatus.cls}`}>{verifiedStatus.label}</span>
          </div>
        </div>

        <div className="dp-divider" />

        <div className="dp-grid">
          <div className="dp-field">
            <p className="dp-label">Email Address</p>
            <p className="dp-value">{u?.email || user?.email}</p>
          </div>
          <div className="dp-field">
            <p className="dp-label">Phone Number</p>
            <p className="dp-value">{u?.phone || user?.phone || '—'}</p>
          </div>
          <div className="dp-field">
            <p className="dp-label">Employee ID</p>
            <p className="dp-value dp-mono">{dp?.employeeId || '—'}</p>
          </div>
          <div className="dp-field">
            <p className="dp-label">Member Since</p>
            <p className="dp-value">
              {u?.createdAt ? format(new Date(u.createdAt), 'MMM d, yyyy') : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Vehicle Card ── */}
      <div className="card dp-card">
        <div className="dp-section-header">
          <span className="dp-section-icon">{vehicleIcon}</span>
          <p className="dp-section-title">Assigned Vehicle</p>
        </div>
        <div className="dp-divider" />
        <div className="dp-grid">
          <div className="dp-field">
            <p className="dp-label">Vehicle Type</p>
            <p className="dp-value dp-capitalize">{dp?.vehicleType || '—'}</p>
          </div>
          <div className="dp-field">
            <p className="dp-label">Plate Number</p>
            <p className="dp-value dp-mono dp-plate">{dp?.vehiclePlate || '—'}</p>
          </div>
          <div className="dp-field">
            <p className="dp-label">Vehicle Model</p>
            <p className="dp-value">{dp?.vehicleModel || '—'}</p>
          </div>
          <div className="dp-field">
            <p className="dp-label">Current Status</p>
            <p className={`dp-status dp-status-${dp?.status}`}>{dp?.status || 'offline'}</p>
          </div>
        </div>
      </div>

      {/* ── Compliance / Licence Card ── */}
      <div className="card dp-card">
        <div className="dp-section-header">
          <span className="dp-section-icon">📋</span>
          <p className="dp-section-title">Compliance & Licence</p>
        </div>
        <div className="dp-divider" />
        <div className="dp-grid">
          <div className="dp-field">
            <p className="dp-label">Driver's Licence No.</p>
            <p className="dp-value dp-mono">{dp?.licenseNumber || '—'}</p>
          </div>
        </div>
        <div className="dp-notice">
          <span>ℹ</span>
          <p>To update your personal info, vehicle details or submit new licence documents, please contact your operations manager directly.</p>
        </div>
      </div>

      {/* ── Performance Summary ── */}
      <div className="card dp-card">
        <div className="dp-section-header">
          <span className="dp-section-icon">📊</span>
          <p className="dp-section-title">Quick Stats</p>
        </div>
        <div className="dp-divider" />
        <div className="dp-stats-row">
          <div className="dp-stat">
            <p className="dp-stat-val">{dp?.totalDeliveries || 0}</p>
            <p className="dp-stat-lbl">Total Deliveries</p>
          </div>
          <div className="dp-stat">
            <p className="dp-stat-val">★ {Number(dp?.rating || 5).toFixed(1)}</p>
            <p className="dp-stat-lbl">Avg Rating</p>
          </div>
        </div>
      </div>
    </div>
  );
}
