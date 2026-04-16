import { useState, useEffect } from 'react';
import { authAPI } from '../../api/client.js';
import { useAuth } from '../../App.jsx';
import './CustomerProfile.css';

// ── Saved Address Item ────────────────────────────────────
function AddressItem({ addr, onDelete, onSetDefault, onEdit }) {
  return (
    <div className="address-item">
      <span className="addr-icon">📍</span>
      <div className="addr-info">
        <p className="addr-label">
          {addr.label}
          {addr.isDefault && <span className="addr-default-badge">Default</span>}
        </p>
        <p className="addr-text">{addr.address}</p>
        <p className="addr-city">{addr.city}</p>
        {addr.contactName && (
          <p className="addr-contact">
            {addr.contactName}{addr.contactPhone ? ` · ${addr.contactPhone}` : ''}
          </p>
        )}
      </div>
      <div className="addr-actions">
        {!addr.isDefault && (
          <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }}
            onClick={() => onSetDefault(addr._id)}>
            Set Default
          </button>
        )}
        <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }}
          onClick={() => onEdit(addr)}>
          Edit
        </button>
        <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 8px', color: 'var(--red)' }}
          onClick={() => onDelete(addr._id)}>
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Address Form (Add / Edit) ─────────────────────────────
function AddressForm({ initial, onSave, onCancel, cities = [] }) {
  const [form, setForm] = useState({
    label:        initial?.label        || '',
    address:      initial?.address      || '',
    city:         initial?.city         || '',
    contactName:  initial?.contactName  || '',
    contactPhone: initial?.contactPhone || '',
    isDefault:    initial?.isDefault    || false,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.label.trim())   return setError('Label is required');
    if (!form.address.trim()) return setError('Address is required');
    if (!form.city.trim())    return setError('City is required');
    setError('');
    setSaving(true);
    try {
      await onSave(form);
    } catch (e) {
      setError(e.message || 'Could not save address');
    } finally { setSaving(false); }
  };

  return (
    <div className="add-address-form">
      <div className="add-address-grid">
        <div className="profile-field">
          <label className="profile-label">Label *</label>
          <input className="input" placeholder="e.g. Home, Office" value={form.label}
            onChange={e => set('label', e.target.value)} />
        </div>
        <div className="profile-field">
          <label className="profile-label">City *</label>
          {cities.length > 0 ? (
            <select className="input" value={form.city} onChange={e => set('city', e.target.value)}>
              <option value="">Select city</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <input className="input" placeholder="City" value={form.city}
              onChange={e => set('city', e.target.value)} />
          )}
        </div>
        <div className="profile-field" style={{ gridColumn: '1/-1' }}>
          <label className="profile-label">Full Address *</label>
          <input className="input" placeholder="Street address, area, landmark" value={form.address}
            onChange={e => set('address', e.target.value)} />
        </div>
        <div className="profile-field">
          <label className="profile-label">Contact Name</label>
          <input className="input" placeholder="Name at this address" value={form.contactName}
            onChange={e => set('contactName', e.target.value)} />
        </div>
        <div className="profile-field">
          <label className="profile-label">Contact Phone</label>
          <input className="input" placeholder="Phone number" value={form.contactPhone}
            onChange={e => set('contactPhone', e.target.value)} />
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={form.isDefault} onChange={e => set('isDefault', e.target.checked)} />
        Set as default address
      </label>
      {error && <p className="profile-error-msg">{error}</p>}
      <div className="add-address-actions">
        <button className="btn-primary" style={{ fontSize: 13 }} onClick={handleSubmit} disabled={saving}>
          {saving ? <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} /> : 'Save Address'}
        </button>
        <button className="btn-ghost" style={{ fontSize: 13 }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── Main Profile Page ─────────────────────────────────────
export default function CustomerProfile() {
  const { user, login } = useAuth();

  // Profile form
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName,  setLastName]  = useState(user?.lastName  || '');
  const [phone,     setPhone]     = useState(user?.phone     || '');
  const [profSaving, setProfSaving] = useState(false);
  const [profMsg,    setProfMsg]    = useState('');
  const [profErr,    setProfErr]    = useState('');

  // Password form
  const [curPwd,  setCurPwd]  = useState('');
  const [newPwd,  setNewPwd]  = useState('');
  const [confPwd, setConfPwd] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg,    setPwdMsg]    = useState('');
  const [pwdErr,    setPwdErr]    = useState('');

  // Addresses
  const [addresses,   setAddresses]   = useState([]);
  const [addrLoading, setAddrLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAddr, setEditingAddr] = useState(null);
  const [cities,      setCities]      = useState([]);

  useEffect(() => {
    authAPI.listAddresses()
      .then(r => setAddresses(r.data || []))
      .catch(() => {})
      .finally(() => setAddrLoading(false));

    // Load cities for address form
    import('../../api/client.js').then(({ ordersAPI }) =>
      ordersAPI.cities().then(r => setCities(r.data || [])).catch(() => {})
    );
  }, []);

  // ── Profile save ──────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!firstName.trim()) return setProfErr('First name is required');
    if (!lastName.trim())  return setProfErr('Last name is required');
    setProfErr('');
    setProfSaving(true);
    try {
      const r = await authAPI.updateProfile({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() });
      // Update cached user in auth context
      login(r.data, {});
      setProfMsg('Profile updated successfully');
      setTimeout(() => setProfMsg(''), 3000);
    } catch (e) {
      setProfErr(e.message || 'Could not update profile');
    } finally { setProfSaving(false); }
  };

  // ── Password save ─────────────────────────────────────
  const handleChangePassword = async () => {
    if (!curPwd) return setPwdErr('Current password is required');
    if (!newPwd) return setPwdErr('New password is required');
    if (newPwd.length < 8) return setPwdErr('New password must be at least 8 characters');
    if (newPwd !== confPwd) return setPwdErr('New passwords do not match');
    setPwdErr('');
    setPwdSaving(true);
    try {
      await authAPI.changePassword({ currentPassword: curPwd, newPassword: newPwd });
      setPwdMsg('Password changed. You will be logged out of other devices.');
      setCurPwd(''); setNewPwd(''); setConfPwd('');
      setTimeout(() => setPwdMsg(''), 5000);
    } catch (e) {
      setPwdErr(e.message || 'Could not change password');
    } finally { setPwdSaving(false); }
  };

  // ── Address handlers ──────────────────────────────────
  const handleAddAddress = async (form) => {
    const r = await authAPI.addAddress(form);
    setAddresses(prev => [...prev, r.data]);
    setShowAddForm(false);
  };

  const handleEditAddress = async (form) => {
    const r = await authAPI.updateAddress(editingAddr._id, form);
    setAddresses(prev => prev.map(a => a._id === editingAddr._id ? r.data : a));
    setEditingAddr(null);
  };

  const handleDeleteAddress = async (id) => {
    if (!confirm('Delete this saved address?')) return;
    await authAPI.deleteAddress(id);
    setAddresses(prev => prev.filter(a => a._id !== id));
  };

  const handleSetDefault = async (id) => {
    const r = await authAPI.updateAddress(id, { isDefault: true });
    // Reflect the new default in the list
    setAddresses(prev => prev.map(a => ({ ...a, isDefault: a._id === id ? r.data.isDefault : false })));
  };

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`;

  return (
    <div className="customer-profile">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Profile</h1>
          <p className="page-subtitle">Manage your account details, password and saved addresses</p>
        </div>
      </div>

      {/* ── Personal Info ─────────────────────────────── */}
      <div className="profile-section">
        <p className="profile-section-title">Personal Information</p>
        <div className="card profile-section">
          <div className="profile-avatar-row">
            <div className="profile-avatar-circle">{initials}</div>
            <div className="profile-avatar-info">
              <p>{user?.firstName} {user?.lastName}</p>
              <p>{user?.email}</p>
            </div>
          </div>
          <div className="profile-form">
            <div className="profile-form-row">
              <div className="profile-field">
                <label className="profile-label">First Name</label>
                <input className="input" value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div className="profile-field">
                <label className="profile-label">Last Name</label>
                <input className="input" value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="profile-field">
              <label className="profile-label">Phone Number</label>
              <input className="input" type="tel" placeholder="e.g. 08012345678" value={phone}
                onChange={e => setPhone(e.target.value)} />
            </div>
            <div className="profile-field">
              <label className="profile-label">Email Address</label>
              <input className="input" value={user?.email || ''} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Email cannot be changed. Contact support if needed.</span>
            </div>
            {profErr && <p className="profile-error-msg">{profErr}</p>}
            <div className="profile-form-actions">
              {profMsg && <p className="profile-save-msg">✓ {profMsg}</p>}
              <button className="btn-primary" style={{ fontSize: 13 }} onClick={handleSaveProfile} disabled={profSaving}>
                {profSaving ? <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} /> : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Change Password ───────────────────────────── */}
      <div className="profile-section">
        <p className="profile-section-title">Security</p>
        <div className="card">
          <div className="password-form">
            <div className="profile-field">
              <label className="profile-label">Current Password</label>
              <input className="input" type="password" value={curPwd}
                onChange={e => setCurPwd(e.target.value)} placeholder="Enter current password" />
            </div>
            <div className="profile-form-row">
              <div className="profile-field">
                <label className="profile-label">New Password</label>
                <input className="input" type="password" value={newPwd}
                  onChange={e => setNewPwd(e.target.value)} placeholder="Min 8 characters" />
              </div>
              <div className="profile-field">
                <label className="profile-label">Confirm New Password</label>
                <input className="input" type="password" value={confPwd}
                  onChange={e => setConfPwd(e.target.value)} placeholder="Repeat new password" />
              </div>
            </div>
            {pwdErr && <p className="profile-error-msg">{pwdErr}</p>}
            <div className="profile-form-actions">
              {pwdMsg && <p className="profile-save-msg">✓ {pwdMsg}</p>}
              <button className="btn-primary" style={{ fontSize: 13 }} onClick={handleChangePassword} disabled={pwdSaving}>
                {pwdSaving ? <span className="spinner spinner-sm" style={{ borderTopColor: 'white' }} /> : 'Update Password'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Saved Addresses ───────────────────────────── */}
      <div className="profile-section">
        <p className="profile-section-title">Saved Addresses</p>
        <div className="card">
          {addrLoading ? (
            <div style={{ padding: 16 }}>
              {Array(2).fill(0).map((_, i) => (
                <div key={i} className="shimmer" style={{ height: 60, margin: '4px 0', borderRadius: 8 }} />
              ))}
            </div>
          ) : (
            <>
              {addresses.length === 0 && !showAddForm && (
                <div className="empty-state" style={{ padding: '32px 20px' }}>
                  <div className="empty-icon">📍</div>
                  <h3>No saved addresses</h3>
                  <p>Save your home, office or delivery addresses for faster booking</p>
                </div>
              )}
              {addresses.length > 0 && (
                <div className="addresses-list">
                  {addresses.map(addr => (
                    editingAddr?._id === addr._id ? (
                      <div key={addr._id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <AddressForm
                          initial={editingAddr}
                          cities={cities}
                          onSave={handleEditAddress}
                          onCancel={() => setEditingAddr(null)}
                        />
                      </div>
                    ) : (
                      <AddressItem
                        key={addr._id}
                        addr={addr}
                        onDelete={handleDeleteAddress}
                        onSetDefault={handleSetDefault}
                        onEdit={(a) => { setShowAddForm(false); setEditingAddr(a); }}
                      />
                    )
                  ))}
                </div>
              )}
              {showAddForm && (
                <AddressForm
                  cities={cities}
                  onSave={handleAddAddress}
                  onCancel={() => setShowAddForm(false)}
                />
              )}
              {!showAddForm && !editingAddr && addresses.length < 10 && (
                <div style={{ padding: '12px 20px', borderTop: addresses.length > 0 ? '1px solid var(--border)' : 'none' }}>
                  <button className="btn-secondary" style={{ fontSize: 13 }}
                    onClick={() => setShowAddForm(true)}>
                    + Add New Address
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
