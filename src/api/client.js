// Dev: relative path → Vite proxy forwards to :5000 (avoids CORS entirely)
// Prod: set VITE_API_URL in your hosting env to point at your deployed backend
const BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || '/api')
  : '/api';

const getTokens = () => {
  try { return JSON.parse(localStorage.getItem('jmove_auth') || '{}'); }
  catch { return {}; }
};

const saveTokens = (data) => {
  const prev = getTokens();
  localStorage.setItem('jmove_auth', JSON.stringify({ ...prev, ...data }));
};

let refreshing = false;
let queue = [];

async function fetchWithAuth(url, options = {}) {
  const { accessToken } = getTokens();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE}${url}`, { ...options, headers });

  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    if (body.code === 'TOKEN_EXPIRED') {
      if (refreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject, url, options });
        });
      }
      refreshing = true;
      try {
        const { refreshToken } = getTokens();
        const r = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!r.ok) throw new Error('Refresh failed');
        const data = await r.json();
        saveTokens({ accessToken: data.data.accessToken, refreshToken: data.data.refreshToken });
        queue.forEach(q => fetchWithAuth(q.url, q.options).then(q.resolve).catch(q.reject));
        queue = [];
        refreshing = false;
        return fetchWithAuth(url, options);
      } catch {
        refreshing = false; queue = [];
        localStorage.removeItem('jmove_auth');
        window.location.href = '/login';
      }
    }
  }
  return res;
}

async function request(method, url, data, options = {}) {
  const body = data instanceof FormData ? data : data ? JSON.stringify(data) : undefined;
  const headers = data instanceof FormData ? {} : {};
  const res = await fetchWithAuth(url, { method, body, headers, ...options });
  const json = await res.json().catch(() => ({ success: false, message: 'Network error' }));
  if (!res.ok) throw Object.assign(new Error(json.message || 'Request failed'), { response: { data: json } });
  return json;
}

const api = {
  get:    (url, opts)      => request('GET',    url, null, opts),
  post:   (url, data, opts)=> request('POST',   url, data, opts),
  put:    (url, data, opts)=> request('PUT',    url, data, opts),
  delete: (url, opts)      => request('DELETE', url, null, opts),
  patch:  (url, data, opts)=> request('PATCH',  url, data, opts),

  getTokens,
  saveTokens,
  clearTokens: () => localStorage.removeItem('jmove_auth'),
};

// Named API helpers
export const authAPI = {
  register:       (d) => api.post('/auth/register', d),
  login:          (d) => api.post('/auth/login', d),
  logout:         ()  => api.post('/auth/logout'),
  profile:        ()  => api.get('/auth/profile'),
  updateProfile:  (d) => api.put('/auth/profile', d),
  changePassword: (d) => api.put('/auth/change-password', d),
};

export const ordersAPI = {
  list:          (p)   => api.get(`/orders?${new URLSearchParams(p || {})}`),
  get:           (id)  => api.get(`/orders/${id}`),
  track:         (wb)  => api.get(`/orders/track/${wb}`),   // public waybill tracking
  cities:        ()    => api.get('/orders/cities'),
  create:        (d)   => api.post('/orders', d),
  cancel:        (id)  => api.put(`/orders/${id}/cancel`),
  assign:        (id, driverId) => api.put(`/orders/${id}/assign`, { driverId }),
  updateStatus:  (id, status, note, location) => api.put(`/orders/${id}/status`, { status, note, location }),
  calcPrice:     (d)   => api.post('/orders/calculate-price', d),
  stats:         ()    => api.get('/orders/stats'),
};

export const driversAPI = {
  list:        (p)   => api.get(`/drivers?${new URLSearchParams(p || {})}`),
  get:         (id)  => api.get(`/drivers/${id}`),
  map:         ()    => api.get('/drivers/map'),
  jobs:        ()    => api.get('/drivers/jobs'),
  activeOrder: ()    => api.get('/drivers/active-order'),
  updateStatus:(s)   => api.put('/drivers/status', { status: s }),
  pushLocation:(lat, lng, orderId) => api.post('/drivers/location', { lat, lng, orderId }),
  verify:      (id, verified) => api.put(`/drivers/${id}/verify`, { verified }),
};

export const paymentsAPI = {
  initialize: (orderId) => api.post('/payments/initialize', { orderId }),
  verify:     (reference) => api.get(`/payments/verify?reference=${reference}`),
  history:    ()  => api.get('/payments/history'),
  stats:      (p) => api.get(`/payments/stats?period=${p || '30d'}`),
};

export const usersAPI = {
  list:         (p)  => api.get(`/users?${new URLSearchParams(p || {})}`),
  get:          (id) => api.get(`/users/${id}`),
  toggleStatus: (id) => api.put(`/users/${id}/toggle-status`),
  dashboard:    ()   => api.get('/users/admin/dashboard'),
  notifications:()   => api.get('/users/notifications'),
  createDriver: (d)  => api.post('/users/admin/drivers', d),
};

export const trackingAPI = {
  events: (orderId) => api.get(`/tracking/${orderId}`),
};

export default api;
