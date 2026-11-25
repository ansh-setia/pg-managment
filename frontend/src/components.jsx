import { useEffect, useState } from 'react';
import { fileBlobUrl, upload } from './api.js';

export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
export const monthName = (m) => new Date(`${m}-01T00:00:00`).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
export const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const fmtTime = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
export const thisMonth = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 7);

export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null });
  const [n, setN] = useState(0);
  useEffect(() => {
    let on = true;
    fn().then((data) => on && setState({ data, error: null })).catch((e) => on && setState({ data: null, error: e.message }));
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, ...deps]);
  return { ...state, reload: () => setN((x) => x + 1) };
}

export const Loading = () => <p className="muted pad">Loading…</p>;
export const ErrorBox = ({ text }) => <p className="notice bad">{text}</p>;
export const Page = ({ title, sub, children }) => (
  <section className="page">
    <h1>{title}</h1>
    {sub && <p className="muted sub">{sub}</p>}
    {children}
  </section>
);
export const Stat = ({ value, label, tone }) => (
  <div className={`stat ${tone || ''}`}><b>{value}</b><span>{label}</span></div>
);

export function SecureImg({ name, alt = '', className }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let u;
    fileBlobUrl(name).then((x) => { u = x; setUrl(x); }).catch(() => {});
    return () => u && URL.revokeObjectURL(u);
  }, [name]);
  if (!url) return <span className={`imgph ${className || ''}`} />;
  if (/\.pdf$/i.test(name)) return <a href={url} target="_blank" rel="noreferrer">Open PDF</a>;
  return <img src={url} alt={alt} className={className} />;
}

export function FilePick({ label, value, onChange, accept = 'image/*', capture }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setBusy(true); setErr('');
    try { onChange(await upload(f)); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <label className={`filepick ${value ? 'ok' : ''}`}>
      <input type="file" accept={accept} capture={capture} onChange={pick} hidden />
      <span>{busy ? 'Uploading…' : value ? `✓ ${label}` : `+ ${label}`}</span>
      {err && <small className="bad-text">{err}</small>}
    </label>
  );
}
