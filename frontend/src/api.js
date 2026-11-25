const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
let token = localStorage.getItem('pg_token');

export const setToken = (t) => {
  token = t;
  if (t) localStorage.setItem('pg_token', t);
  else localStorage.removeItem('pg_token');
};
export const hasToken = () => !!token;

const authHeader = () => (token ? { Authorization: `Bearer ${token}` } : {});

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    setToken(null);
    window.location.href = '/';
  }
  if (!res.ok) throw new Error(data.error || 'Something went wrong, please try again');
  return data;
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...authHeader() },
    body: body ? JSON.stringify(body) : undefined,
  });
  return handle(res);
}

// Returns the stored filename; pass it back to the API in the relevant field.
export async function upload(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(BASE + '/upload', { method: 'POST', headers: authHeader(), body: fd });
  return (await handle(res)).file;
}

// Files need the login token, so <img src> can't be used directly: fetch as blob.
export async function fileBlobUrl(name) {
  const res = await fetch(`${BASE}/files/${encodeURIComponent(name)}`, { headers: authHeader() });
  if (!res.ok) throw new Error('File not found');
  return URL.createObjectURL(await res.blob());
}

const loadRazorpay = () =>
  new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load payment gateway'));
    document.body.appendChild(s);
  });

export async function payNow(month) {
  const o = await api('/tenant/pay/order', { method: 'POST', body: { month } });
  const confirm = (extra) => api('/tenant/pay/confirm', { method: 'POST', body: { month, orderId: o.orderId, ...extra } });
  if (o.mode === 'mock') return confirm({});
  await loadRazorpay();
  return new Promise((resolve, reject) => {
    const rz = new window.Razorpay({
      key: o.keyId, amount: o.amount, currency: 'INR', order_id: o.orderId, name: o.name,
      prefill: { contact: o.phone }, theme: { color: '#6c47d9' },
      handler: (r) => confirm({ paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }).then(resolve, reject),
      modal: { ondismiss: () => reject(new Error('Payment was cancelled')) },
    });
    rz.open();
  });
}
