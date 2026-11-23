const IST_MS = 5.5 * 3600 * 1000;
const DAY = 86400000;

export const istNow = () => new Date(Date.now() + IST_MS);
export const todayStr = () => istNow().toISOString().slice(0, 10);
export const monthStr = () => istNow().toISOString().slice(0, 7);
export const isMonth = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s));
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s));
export const nextMonth = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
};
export const prevMonth = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7);
};
export const monthStart = (m) => new Date(`${m}-01T00:00:00+05:30`);
export const dueDateFor = (m, dueDay) => new Date(`${m}-${String(dueDay).padStart(2, '0')}T23:59:59+05:30`);
export const daysLate = (due) => Math.max(0, Math.ceil((Date.now() - due.getTime()) / DAY));
export const daysSince = (d) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / DAY)) : 0);
export const normPhone = (p) => String(p || '').replace(/\D/g, '').slice(-10);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const weekDates = () => {
  const now = istNow();
  const dow = (now.getUTCDay() + 6) % 7; // Monday = 0
  return Array.from({ length: 7 }, (_, i) => new Date(now.getTime() + (i - dow) * DAY).toISOString().slice(0, 10));
};
