import { useState, useEffect, useCallback } from 'react';
import { settingsAPI } from '../../api/client.js';
import './AdminSettings.css';

const CATEGORY_META = {
  general:       { label: 'General',       icon: '🏢', desc: 'Company identity and public-facing information' },
  pricing:       { label: 'Pricing',       icon: '💰', desc: 'Commission rates, fees, and order limits' },
  notifications: { label: 'Notifications', icon: '🔔', desc: 'Email and SMS delivery preferences' },
  operations:    { label: 'Operations',    icon: '⚙️', desc: 'Business rules and operational parameters' },
};

// ── Individual Setting Row ──────────────────────────────────────────────────
function SettingRow({ setting, onSave, saving }) {
  const [editing, setEditing] = useState(false);
  const [value,   setValue]   = useState('');

  const openEdit = () => {
    setValue(String(setting.value));
    setEditing(true);
  };

  const handleSave = async () => {
    let coerced = value;
    if (setting.valueType === 'number')  coerced = Number(value);
    if (setting.valueType === 'boolean') coerced = value === 'true' || value === true;
    await onSave(setting.key, coerced);
    setEditing(false);
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && setting.valueType !== 'json') handleSave();
    if (e.key === 'Escape') setEditing(false);
  };

  const renderEditor = () => {
    if (setting.valueType === 'boolean') {
      return (
        <div className="setting-bool-editor">
          <button
            className={`bool-btn ${value === 'true' ? 'active' : ''}`}
            onClick={() => setValue('true')}>
            Enabled
          </button>
          <button
            className={`bool-btn ${value === 'false' ? 'active' : ''}`}
            onClick={() => setValue('false')}>
            Disabled
          </button>
          <button className="btn-primary setting-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner spinner-sm" /> : 'Save'}
          </button>
          <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      );
    }

    return (
      <div className="setting-text-editor">
        <input
          className="input setting-input"
          type={setting.valueType === 'number' ? 'number' : 'text'}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <button className="btn-primary setting-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner spinner-sm" /> : 'Save'}
        </button>
        <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    );
  };

  const renderValue = () => {
    if (setting.valueType === 'boolean') {
      return (
        <span className={`setting-bool-badge ${setting.value ? 'enabled' : 'disabled'}`}>
          {setting.value ? '● Enabled' : '● Disabled'}
        </span>
      );
    }
    return <span className="setting-val">{String(setting.value)}</span>;
  };

  return (
    <div className={`setting-row ${editing ? 'editing' : ''}`}>
      <div className="setting-meta">
        <div className="setting-label-wrap">
          <p className="setting-label">{setting.label}</p>
          {!setting.isPublic && <span className="setting-private-tag">Private</span>}
        </div>
        {setting.description && <p className="setting-desc">{setting.description}</p>}
        {setting.updatedBy && (
          <p className="setting-updated-by">
            Last updated by {setting.updatedBy?.firstName} {setting.updatedBy?.lastName}
          </p>
        )}
      </div>
      <div className="setting-value-area">
        {editing ? renderEditor() : (
          <div className="setting-display" onClick={openEdit} title="Click to edit">
            {renderValue()}
            <button className="setting-edit-btn">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9.5 1.5l2 2L4 11H2v-2L9.5 1.5z"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function AdminSettings() {
  const [settings, setSettings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState('');
  const [seeding,  setSeeding]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  const flash = msg => { setSuccess(msg); setTimeout(() => setSuccess(''), 3500); };

  const load = useCallback(() => {
    setLoading(true);
    settingsAPI.list()
      .then(r => setSettings(r.data || []))
      .catch(e => setError(e?.response?.data?.message || 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (key, value) => {
    setSaving(key); setError('');
    try {
      await settingsAPI.update(key, value);
      setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
      flash(`Setting updated`);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to update setting');
    } finally { setSaving(''); }
  };

  const handleSeed = async () => {
    setSeeding(true); setError('');
    try {
      const r = await settingsAPI.seed();
      flash(`${r.data?.created || 0} default settings initialised`);
      load();
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to seed settings');
    } finally { setSeeding(false); }
  };

  // Group by category
  const grouped = settings.reduce((acc, s) => {
    const cat = s.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  const categoryOrder = ['general','pricing','notifications','operations'];

  return (
    <div className="admin-settings">
      <div className="page-header">
        <div>
          <h1 className="page-title">System Settings</h1>
          <p className="page-subtitle">Platform-wide configuration — changes take effect immediately</p>
        </div>
        <button
          className="btn-secondary"
          onClick={handleSeed}
          disabled={seeding}
          style={{ fontSize: 13 }}
        >
          {seeding ? <><span className="spinner spinner-sm" /> Seeding…</> : '⚡ Seed Defaults'}
        </button>
      </div>

      {error   && <div className="order-error" style={{ marginBottom: 16 }}>⚠ {error}</div>}
      {success && <div className="ap-success">✓ {success}</div>}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[1,2,3].map(i => <div key={i} className="shimmer" style={{ height: 200, borderRadius: 12 }} />)}
        </div>
      ) : settings.length === 0 ? (
        <div className="settings-empty card">
          <div className="settings-empty-icon">⚙️</div>
          <h3>No settings configured</h3>
          <p>Run the seed to initialise all default platform settings.</p>
          <button className="btn-primary" onClick={handleSeed} disabled={seeding}>
            {seeding ? <span className="spinner spinner-sm" /> : '⚡ Initialise Default Settings'}
          </button>
        </div>
      ) : (
        <div className="settings-grid">
          {categoryOrder.map(cat => {
            const items = grouped[cat];
            if (!items?.length) return null;
            const meta = CATEGORY_META[cat];
            return (
              <div key={cat} className="settings-card card">
                <div className="settings-card-header">
                  <span className="settings-cat-icon">{meta.icon}</span>
                  <div>
                    <p className="settings-cat-title">{meta.label}</p>
                    <p className="settings-cat-desc">{meta.desc}</p>
                  </div>
                </div>
                <div className="settings-rows">
                  {items.map(s => (
                    <SettingRow
                      key={s.key}
                      setting={s}
                      onSave={handleSave}
                      saving={saving === s.key}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
