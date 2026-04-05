/**
 * ─────────────────────────────────────────────────────────
 *  HARDENED API CLIENT
 *
 *  Security improvements:
 *  1. Access token stored in memory (not localStorage)
 *     - Survives page navigation via sessionStorage fallback
 *     - Refresh token stays in localStorage (acceptable tradeoff
 *       without httpOnly cookies; see NOTE below)
 *  2. Request size guard (don't send body > 2MB)
 *  3. Refresh token rotation: on TOKEN_EXPIRED, rotate and retry
 *  4. Auto-logout on TOKEN_INVALIDATED (password changed)
 *  5. Request deduplication during token refresh
 *  6. URL sanitization to prevent param injection
 *
 *  NOTE ON TOKEN STORAGE:
 *  The ideal approach is httpOnly cookies (immune to XSS).
 *  Since this SPA uses localStorage, the access token is moved
 *  to in-memory (survives tab navigation via sessionStorage).
 *  The refresh token stays in localStorage — acceptable for SPAs
 *  when combined with short access token TTL (15 min) and HTTPS.
 * ─────────────────────────────────────────────────────────
 */

const BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || '/api')
  : '/api';

// ── Token storage ────────────────────────────────────────
// Access token: in-memory (cleared on tab close, NOT in localStorage)
// Refresh token: localStorage (survives tab close for UX)
let _accessToken = null;

const TOKEN_KEY = 'jmove_auth';

const getTokens = () => {
  // Restore access token from sessionStorage on page reload
  if (!_accessToken) {
    try {
      const s = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || '{}');
      _accessToken = s.accessToken || null;
    } catch {}
  }
  try {
    const stored = JSON.parse(localStorage.getItem(TOKEN_KEY) || '{}');
    return { accessToken: _accessToken, refreshToken: stored.refreshToken, user: stored.user };
  } catch { return {}; }
};

const saveTokens = (data) => {
  if (data.accessToken) {
    _accessToken = data.accessToken;
    // Store access token in sessionStorage (tab-scoped, XSS risk reduced vs localStorage)
    try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: _accessToken })); } catch {}
  }
  // Persist refresh token and user profile in localStorage
  try {
    const prev = JSON.parse(localStorage.getItem(TOKEN_KEY) || '{}');
    const next = { ...prev };
    if (data.refreshToken !== undefined) next.refreshToken = data.refreshToken;
    if (data.user !== undefined)         next.user         = data.user;
    localStorage.setItem(TOKEN_KEY, JSON.stringify(next));
  } catch {}
};

const clearTokens = () => {
  _accessToken = null;
  try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
  try { localStorage.removeItem(TOKEN_KEY);   } catch {}
};

// ── Refresh token state ──────────────────────────────────
let refreshing = false;
let queue      = [];

const doRefresh = async () => {
  const { refreshToken } = getTokens();
  if (!refreshToken) throw new Error('No refresh token');

  const r = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!r.ok) throw new Error('Refresh failed');
  const data = await r.json();
  if (!data.data?.accessToken) throw new Error('Invalid refresh response');

  saveTokens({ accessToken: data.data.accessToken, refreshToken: data.data.refreshToken });
  return data.data.accessToken;
};

// ── Core fetch with auth + auto-refresh ─────────────────
async function fetchWithAuth(url, options = {}) {
  const { accessToken } = getTokens();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE}${url}`, { ...options, headers });

  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));

    // Session invalidated (password changed) — force full logout
    if (body.code === 'TOKEN_INVALIDATED') {
      clearTokens();
      window.location.href = '/login?reason=session_expired';
      return res;
    }

    if (body.code === 'TOKEN_EXPIRED') {
      if (refreshing) {
        return new Promise((resolve, reject) => queue.push({ resolve, reject, url, options }));
      }
      refreshing = true;
      try {
        await doRefresh();
        queue.forEach(q => fetchWithAuth(q.url, q.options).then(q.resolve).catch(q.reject));
        queue      = [];
        refreshing = false;
        return fetchWithAuth(url, options);
      } catch {
        refreshing = false;
        queue      = [];
        clearTokens();
        window.location.href = '/login';
        return res;
      }
    }
  }

  return res;
}

// ── Request builder ──────────────────────────────────────
const MAX_BODY_SIZE = 2 * 1024 * 1024; // 2MB guard

async function request(method, url, data, options = {}) {
  const body = data instanceof FormData ? data : data ? JSON.stringify(data) : undefined;

  if (typeof body === 'string' && body.length > MAX_BODY_SIZE) {
    throw new Error('Request body too large');
  }

  const headers = data instanceof FormData ? {} : {};
  const res  = await fetchWithAuth(url, { method, body, headers, ...options });
  const json = await res.json().catch(() => ({ success: false, message: 'Network error' }));
  if (!res.ok) throw Object.assign(new Error(json.message || 'Request failed'), { response: { data: json } });
  return json;
}

// ── Public API ───────────────────────────────────────────
const api = {
  get:    (url, opts)       => request('GET',    url, null, opts),
  post:   (url, data, opts) => request('POST',   url, data, opts),
  put:    (url, data, opts) => request('PUT',    url, data, opts),
  delete: (url, opts)       => request('DELETE', url, null, opts),
  patch:  (url, data, opts) => request('PATCH',  url, data, opts),

  getTokens,
  saveTokens,
  clearTokens,

  // Exposed so AuthProvider can proactively refresh when there is a valid
  // refreshToken in localStorage but no access token (e.g. new tab opened
  // after the previous tab was closed — sessionStorage is wiped on tab close).
  refreshSession: doRefresh,
};

// ── Named API helpers ────────────────────────────────────
export const authAPI = {
  register:       (d) => api.post('/auth/register', d),
  login:          (d) => api.post('/auth/login', d),
  logout:         ()  => api.post('/auth/logout'),
  profile:        ()  => api.get('/auth/profile'),
  updateProfile:  (d) => api.put('/auth/profile', d),
  changePassword: (d) => api.put('/auth/change-password', d),
};

export const ordersAPI = {
  list:         (p)            => api.get(`/orders?${new URLSearchParams(p || {})}`),
  get:          (id)           => api.get(`/orders/${encodeURIComponent(id)}`),
  track:        (wb)           => api.get(`/orders/track/${encodeURIComponent(wb)}`),
  cities:       ()             => api.get('/orders/cities'),
  create:       (d)            => api.post('/orders', d),
  cancel:       (id)           => api.put(`/orders/${encodeURIComponent(id)}/cancel`),
  assign:       (id, driverId) => api.put(`/orders/${encodeURIComponent(id)}/assign`, { driverId }),
  updateStatus: (id, status, note, location) => api.put(`/orders/${encodeURIComponent(id)}/status`, { status, note, location }),
  addNote:      (id, note, location)          => api.post(`/orders/${encodeURIComponent(id)}/note`, { note, location }),
  calcPrice:    (d)            => api.post('/orders/calculate-price', d),
  stats:        ()             => api.get('/orders/stats'),
};

export const driversAPI = {
  list:         (p)       => api.get(`/drivers?${new URLSearchParams(p || {})}`),
  get:          (id)      => api.get(`/drivers/${encodeURIComponent(id)}`),
  map:          ()        => api.get('/drivers/map'),
  jobs:         ()        => api.get('/drivers/jobs'),
  acceptJob:    (orderId) => api.put(`/drivers/jobs/${encodeURIComponent(orderId)}/accept`),
  activeOrder:  ()        => api.get('/drivers/active-order'),
  updateStatus: (s)       => api.put('/drivers/status', { status: s }),
  pushLocation: (lat, lng, orderId) => api.post('/drivers/location', { lat, lng, orderId }),
  verify:       (id, verified)      => api.put(`/drivers/${encodeURIComponent(id)}/verify`, { verified }),
};

export const paymentsAPI = {
  initialize: (orderId)   => api.post('/payments/initialize', { orderId }),
  verify:     (reference) => api.get(`/payments/verify?reference=${encodeURIComponent(reference)}`),
  history:    ()          => api.get('/payments/history'),
  stats:      (p)         => api.get(`/payments/stats?period=${encodeURIComponent(p || '30d')}`),
};

export const usersAPI = {
  list:              (p)     => api.get(`/users?${new URLSearchParams(p || {})}`),
  get:               (id)    => api.get(`/users/${encodeURIComponent(id)}`),
  toggleStatus:      (id)    => api.put(`/users/${encodeURIComponent(id)}/toggle-status`),
  dashboard:         ()      => api.get('/users/admin/dashboard'),
  notifications:     ()      => api.get('/users/notifications'),
  createDriver:      (d)     => api.post('/users/admin/drivers', d),
  staff:             (p)     => api.get(`/users/staff?${new URLSearchParams(p || {})}`),
  createStaff:       (d)     => api.post('/users/admin/staff', d),
  updatePermissions: (id, d) => api.put(`/users/staff/${encodeURIComponent(id)}/permissions`, d),
};

export const trackingAPI = {
  events: (orderId) => api.get(`/tracking/${encodeURIComponent(orderId)}`),
};

export const reviewsAPI = {
  submit:    (d)        => api.post('/reviews', d),
  forOrder:  (orderId)  => api.get(`/reviews/order/${encodeURIComponent(orderId)}`),
  forDriver: (driverId) => api.get(`/reviews/driver/${encodeURIComponent(driverId)}`),
};

export const earningsAPI = {
  mine: (p) => api.get(`/drivers/earnings?${new URLSearchParams(p || {})}`),
};

export const notificationsAPI = {
  list:     ()    => api.get('/users/notifications'),
  markRead: (id)  => api.put(`/users/notifications/${encodeURIComponent(id)}/read`),
};

export default api;
