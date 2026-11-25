import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrorBox, FilePick, Loading, SecureImg, Stat, fmtDate, fmtTime, inr, monthName, thisMonth, useLoad } from '../components.jsx';

// ---- Meter reading ----
export function Meter() {
  const [month, setMonth] = useState(thisMonth());
  const { data, error, reload } = useLoad(() => api(`/manager/rooms?month=${month}`), [month]);
  const [vals, setVals] = useState({});
  const [photos, setPhotos] = useState({});
  const [msg, setMsg] = useState({ text: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { setVals({}); setPhotos({}); }, [month]);

  if (error) return <ErrorBox text={error} />;
  if (!data) return <Loading />;

  const cur = (r) => (vals[r.id] ?? r.current ?? '');
  const bill = (r) => {
    const c = cur(r);
    return c === '' || Number(c) < r.previous ? null : Math.round((Number(c) - r.previous) * data.rate);
  };
  const run = async (fn, ok) => {
    setBusy(true); setMsg({ text: '' });
    try { const r = await fn(); setMsg({ text: ok(r) }); setVals({}); reload(); }
    catch (e) { setMsg({ text: e.message, bad: true }); } finally { setBusy(false); }
  };
  const save = () => api('/manager/readings', { method: 'POST', body: { month, items: data.rooms.filter((r) => !r.sent && cur(r) !== '').map((r) => ({ roomId: r.id, current: cur(r), photo: photos[r.id] })) } });
  const saveAndSend = async () => { await save(); return api('/manager/readings/send', { method: 'POST', body: { month } }); };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-headline text-2xl font-bold text-ink">Meter Readings</h1>
        <p className="font-body text-sm text-ink-2">
          {monthName(month)} · ₹{data.rate} / unit
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="month"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          className="px-4 py-2 rounded-xl bg-surface border border-line text-ink font-semibold text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-3">
        {data.rooms.map((r) => (
          <article key={r.id} className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3">
            <div>
              <b className="text-base font-bold text-ink">Room {r.number}</b>
              <small className="block text-xs text-ink-2 mt-0.5">
                Previous: {r.previous} · {r.people} occupants
              </small>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              {r.sent ? (
                <span className="px-3 py-1 rounded-full bg-success-soft text-on-success-soft text-xs font-bold">
                  Sent · {inr(r.total)}
                </span>
              ) : (
                <div className="flex flex-col items-end gap-1">
                  <input
                    inputMode="numeric"
                    placeholder="Current reading"
                    value={cur(r)}
                    onChange={(e) => setVals({ ...vals, [r.id]: e.target.value.replace(/\D/g, '') })}
                    className="w-28 px-3 py-1.5 rounded-lg bg-surface border border-line text-ink text-sm text-right tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                  <small className="text-xs text-ink-2 font-semibold">
                    {bill(r) == null ? (cur(r) !== '' ? 'Lower than previous' : '') : inr(bill(r))}
                  </small>
                  <FilePick label="Photo" value={photos[r.id]} onChange={(f) => setPhotos({ ...photos, [r.id]: f })} capture="environment" />
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {msg.text && (
        <p className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${msg.bad ? 'bg-danger-soft text-on-danger-soft' : 'bg-success-soft text-on-success-soft'}`}>
          {msg.text}
        </p>
      )}

      <div className="flex flex-col gap-2.5 pt-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(save, (r) => `${r.saved} room readings saved ✓`)}
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-surface text-ink border border-line font-label text-sm font-semibold hover:bg-surface-2 transition-colors disabled:opacity-50"
        >
          Save Readings
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => window.confirm('Send electricity bills to all tenants? Readings cannot be changed after sending.') && run(saveAndSend, (r) => `${r.sent} room bills sent ✓${r.skippedEmptyRooms.length ? ` (vacant: ${r.skippedEmptyRooms.join(', ')})` : ''}`)}
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-on-primary font-label text-sm font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
        >
          Send Bills to All
        </button>
      </div>
    </div>
  );
}

// ---- Complaints ----
const CAT = { ac: '❄️ AC', wifi: '📶 WiFi', water: '💧 Water', cleaning: '🧹 Cleaning', other: '🔧 Other' };
const ST = { new: ['New', 'bg-danger-soft text-on-danger-soft'], in_progress: ['In Progress', 'bg-warning-soft text-on-warning-soft'], done: ['Resolved ✓', 'bg-success-soft text-on-success-soft'] };

export function Complaints() {
  const { data, error, reload } = useLoad(() => api('/manager/complaints'));
  const [err, setErr] = useState('');
  if (error) return <ErrorBox text={error} />;
  if (!data) return <Loading />;

  const set = async (id, status) => {
    setErr('');
    try { await api(`/manager/complaints/${id}`, { method: 'PATCH', body: { status } }); reload(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-headline text-2xl font-bold text-ink">Complaints</h1>
        <p className="font-body text-sm text-ink-2">{data.items.length} total complaints</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface border border-line rounded-xl p-4 shadow-sm flex flex-col items-center justify-center gap-1 text-center">
          <span className="font-headline text-2xl font-bold text-danger tabular-nums">{data.counts.new}</span>
          <span className="font-body text-xs text-ink-2">New</span>
        </div>
        <div className="bg-surface border border-line rounded-xl p-4 shadow-sm flex flex-col items-center justify-center gap-1 text-center">
          <span className="font-headline text-2xl font-bold text-warning tabular-nums">{data.counts.in_progress}</span>
          <span className="font-body text-xs text-ink-2">In Progress</span>
        </div>
        <div className="bg-surface border border-line rounded-xl p-4 shadow-sm flex flex-col items-center justify-center gap-1 text-center">
          <span className="font-headline text-2xl font-bold text-success tabular-nums">{data.counts.done}</span>
          <span className="font-body text-xs text-ink-2">Resolved</span>
        </div>
      </div>

      {err && <ErrorBox text={err} />}
      {data.items.length === 0 && (
        <p className="bg-surface border border-line rounded-xl p-6 text-center text-sm text-ink-2">
          No complaints registered. All systems operational! ✓
        </p>
      )}

      <div className="flex flex-col gap-3">
        {data.items.map((c) => (
          <article key={c._id} className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <b>{CAT[c.category] || c.category} · Room {c.room?.number}</b>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${ST[c.status][1]}`}>
                {ST[c.status][0]}
              </span>
            </div>
            <small className="text-xs text-ink-2">
              {c.tenant?.name} · {fmtDate(c.createdAt)}
            </small>
            {c.text && <p className="text-sm text-ink bg-surface-2 p-3 rounded-xl">{c.text}</p>}
            {c.photo && <SecureImg name={c.photo} className="w-full max-h-48 object-cover rounded-xl mt-1" alt="complaint" />}

            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-2 border border-line mt-1">
              {Object.entries(ST).map(([k, [label]]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => set(c._id, k)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                    c.status === k ? 'bg-surface text-primary shadow-sm font-bold' : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

// ---- Tenants ----
const blank = { name: '', phone: '', bedId: '', rent: '', foodCharge: '', deposit: '', docs: { idProof: '', photo: '', agreement: '', policeVerification: 'pending' } };

export function Tenants() {
  const { data, error, reload } = useLoad(() => api('/manager/tenants'));
  const beds = useLoad(() => api('/manager/beds/vacant'));
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState({ text: '' });
  const [busy, setBusy] = useState(false);

  // Modals state - must be at the top of the hook hierarchy
  const [payModalTenant, setPayModalTenant] = useState(null);
  const [noticeModalTenant, setNoticeModalTenant] = useState(null);
  const [checkoutModalTenant, setCheckoutModalTenant] = useState(null);
  const [receiptSlip, setReceiptSlip] = useState(null);
  const [settlementSlip, setSettlementSlip] = useState(null);

  // Quick Allot & Leaves View
  const [viewTab, setViewTab] = useState('tenants'); // 'tenants' | 'leaves'
  const [quickAllotOpen, setQuickAllotOpen] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(null);
  const leaves = useLoad(() => api('/manager/leaves'), [viewTab]);
  const [managerRemarks, setManagerRemarks] = useState({});
  const [actionBusy, setActionBusy] = useState(null);

  const handleManagerDecision = async (leaveId, action) => {
    const remarks = managerRemarks[leaveId] || '';
    if (action === 'denied' && !window.confirm('Are you sure you want to deny this leave request?')) return;
    setActionBusy(leaveId);
    try {
      await api(`/manager/leaves/${leaveId}/decide`, {
        method: 'POST',
        body: { action, remarks },
      });
      setMsg({
        text: action === 'approved'
          ? 'Leave pass approved successfully ✓ Student has been notified.'
          : 'Leave pass has been denied ✕',
        bad: action === 'denied',
      });
      leaves.reload();
    } catch (e) {
      setMsg({ text: e.message, bad: true });
    } finally {
      setActionBusy(null);
    }
  };

  if (error) return <ErrorBox text={error} />;
  if (!data) return <Loading />;

  const setDoc = (k, v) => setF({ ...f, docs: { ...f.docs, [k]: v } });
  const pickBed = (id) => {
    const b = beds.data?.find((x) => x._id === id);
    if (!b) return setF({ ...f, bedId: '' });
    setF({
      ...f,
      bedId: id,
      rent: b.rent || f.rent,
      deposit: b.deposit || (b.rent * 2) || f.deposit,
      foodCharge: f.foodCharge || 1000,
    });
  };

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true); setMsg({ text: '' });
    try {
      await api('/manager/tenants', { method: 'POST', body: f });
      setF(blank); setAdding(false); setMsg({ text: 'Tenant saved successfully. Bed is now marked occupied ✓' }); reload(); beds.reload();
    } catch (e) { setMsg({ text: e.message, bad: true }); } finally { setBusy(false); }
  };

  const act = async (path, body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    try { await api(path, { method: body ? 'PATCH' : 'POST' }); reload(); beds.reload(); } catch (e) { setMsg({ text: e.message, bad: true }); }
  };

  if (adding) {
    const selectedBed = beds.data?.find((b) => b._id === f.bedId);
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-headline text-2xl font-bold text-ink">New Tenant Onboarding</h1>
          <p className="font-body text-sm text-ink-2">Room, bed assignment, rent and verification documents</p>
        </div>

        <form onSubmit={submit} className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">Bed (Room & Sharing Type)</span>
            <select
              value={f.bedId}
              onChange={(e) => pickBed(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value="">Select vacant bed</option>
              {beds.data?.map((b) => (
                <option key={b._id} value={b._id}>
                  Room {b.room?.number || b.room} (Bed {b.label?.split('-')[1] || b.label}) · {b.room?.sharingType ? `${b.room.sharingType}-Sharing` : ''} · {b.room?.block || ''} · ₹{b.rent}/mo
                </option>
              ))}
            </select>
          </label>

          {selectedBed && (
            <div className="rounded-xl p-3 bg-primary-soft text-primary text-xs font-semibold">
              <b>🏢 {selectedBed.room?.block || 'Main Wing'} · Floor {selectedBed.room?.floor ?? 0}</b><br />
              Room {selectedBed.room?.number} ({selectedBed.room?.sharingType}-Sharing) · Bed {selectedBed.label}
              <div className="mt-1 text-ink-2">
                Default Rent: {inr(selectedBed.rent)} · Default Deposit: {inr(selectedBed.deposit)}
              </div>
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">Full Name</span>
            <input
              type="text"
              placeholder="Tenant's full name"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">Mobile Phone</span>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="10-digit mobile number"
              value={f.phone}
              onChange={(e) => setF({ ...f, phone: e.target.value })}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-3 gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="font-label text-xs font-semibold text-ink-2">Rent / Mo</span>
              <input
                type="number"
                value={f.rent}
                onChange={(e) => setF({ ...f, rent: e.target.value })}
                required
                className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-label text-xs font-semibold text-ink-2">Food Charge</span>
              <input
                type="number"
                value={f.foodCharge}
                onChange={(e) => setF({ ...f, foodCharge: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-label text-xs font-semibold text-ink-2">Deposit</span>
              <input
                type="number"
                value={f.deposit}
                onChange={(e) => setF({ ...f, deposit: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </label>
          </div>

          {/* Documents Section */}
          <div className="flex flex-col gap-2 pt-1">
            <h2 className="font-title text-sm font-bold text-ink">Documents</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <FilePick label="ID Proof (Required)" value={f.docs.idProof} onChange={(v) => setDoc('idProof', v)} accept="image/*,application/pdf" />
              <FilePick label="Photo" value={f.docs.photo} onChange={(v) => setDoc('photo', v)} />
              <FilePick label="Agreement" value={f.docs.agreement} onChange={(v) => setDoc('agreement', v)} accept="image/*,application/pdf" />
              <label className={`border border-dashed rounded-xl p-3 text-xs font-semibold text-center cursor-pointer transition-colors ${f.docs.policeVerification === 'done' ? 'bg-success-soft text-on-success-soft border-success' : 'bg-surface text-ink-2 border-line'}`}>
                <input type="checkbox" hidden checked={f.docs.policeVerification === 'done'} onChange={(e) => setDoc('policeVerification', e.target.checked ? 'done' : 'pending')} />
                <span>{f.docs.policeVerification === 'done' ? '✓ Police verification completed' : '+ Police verification done?'}</span>
              </label>
            </div>
          </div>

          {msg.text && (
            <p className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${msg.bad ? 'bg-danger-soft text-on-danger-soft' : 'bg-success-soft text-on-success-soft'}`}>
              {msg.text}
            </p>
          )}

          <div className="flex flex-col gap-2.5 pt-2">
            <button
              type="submit"
              disabled={busy || !f.bedId || !f.name || !f.phone || !f.rent || !f.docs.idProof}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-on-primary font-label text-sm font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Save Tenant'}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setMsg({ text: '' }); }}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-surface text-ink border border-line font-label text-sm font-semibold hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  const cancelNotice = async (t) => {
    if (!window.confirm(`Cancel vacating notice for ${t.name} and keep bed occupied?`)) return;
    try {
      await api(`/manager/tenants/${t._id}/cancel-notice`, { method: 'POST' });
      setMsg({ text: 'Notice cancelled successfully ✓' });
      reload();
      beds.reload();
    } catch (e) {
      setMsg({ text: e.message, bad: true });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-headline text-2xl font-bold text-ink">Tenants & Outpasses</h1>
        <p className="font-body text-sm text-ink-2 tabular-nums">Spot booking · Self onboarding · Leave approval</p>
      </div>

      {/* View Switcher: Tenants vs Leaves */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface-2 border border-line">
        <button
          type="button"
          onClick={() => setViewTab('tenants')}
          className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
            viewTab === 'tenants' ? 'bg-surface text-primary shadow-sm font-bold' : 'text-ink-2 hover:text-ink'
          }`}
        >
          Tenants ({data.length})
        </button>
        <button
          type="button"
          onClick={() => setViewTab('leaves')}
          className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
            viewTab === 'leaves' ? 'bg-surface text-primary shadow-sm font-bold' : 'text-ink-2 hover:text-ink'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">flight_takeoff</span>
          <span>Leave Passes</span>
          {leaves.data?.filter((l) => l.parentStatus === 'approved' && l.managerStatus !== 'approved' && l.managerStatus !== 'denied').length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-warning text-white text-[10px] font-bold">
              {leaves.data.filter((l) => l.parentStatus === 'approved' && l.managerStatus !== 'approved' && l.managerStatus !== 'denied').length}
            </span>
          )}
        </button>
      </div>

      {msg.text && (
        <p className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${msg.bad ? 'bg-danger-soft text-on-danger-soft' : 'bg-success-soft text-on-success-soft'}`}>
          {msg.text}
        </p>
      )}

      {viewTab === 'tenants' ? (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setQuickAllotOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-full bg-primary text-on-primary font-label text-xs font-bold shadow-sm hover:opacity-95 transition-opacity"
            >
              <span className="material-symbols-outlined text-[18px]">bolt</span>
              <span>⚡ Spot Allot (Quick)</span>
            </button>

            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-full bg-surface text-ink border border-line font-label text-xs font-semibold hover:bg-surface-2 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>Manual Form</span>
            </button>
          </div>

          {/* Tenants List */}
          <div className="flex flex-col gap-3">
            {data.map((t) => {
              const initials = (t.name || 'TN')
                .split(' ')
                .map((s) => s[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();
              const isOnNotice = t.status === 'notice';
              const isInvited = t.status === 'invited';

              return (
                <article key={t._id} className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                  <header className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-soft text-primary flex items-center justify-center font-bold text-sm shrink-0">
                        {initials}
                      </div>
                      <div className="flex flex-col">
                        <h2 className="font-title text-base font-bold text-ink">{t.name}</h2>
                        <p className="font-body text-xs text-ink-2 tabular-nums">
                          Room {t.room?.number} {t.room?.sharingType ? `(${t.room.sharingType}-Sharing)` : ''} · Bed {t.bed?.label} · {t.phone}
                        </p>
                      </div>
                    </div>
                    {isOnNotice && (
                      <span className="px-2.5 py-0.5 rounded-full bg-warning-soft text-on-warning-soft text-xs font-bold shrink-0">
                        Notice
                      </span>
                    )}
                    {isInvited && (
                      <span className="px-2.5 py-0.5 rounded-full bg-primary-soft text-primary text-xs font-bold shrink-0">
                        ⚡ Invite Sent
                      </span>
                    )}
                  </header>

                  {isInvited && (
                    <div className="bg-primary-soft/40 border border-primary-soft text-primary px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between">
                      <span>Verification link sent to student</span>
                      <button
                        type="button"
                        onClick={() => setInviteSuccess({
                          tenant: t,
                          inviteToken: t.inviteToken,
                          invitePath: `/onboard/${t.inviteToken}`,
                        })}
                        className="px-2.5 py-1 rounded-full bg-primary text-on-primary font-bold text-[11px] hover:opacity-90"
                      >
                        Send Link
                      </button>
                    </div>
                  )}

                  {isOnNotice && (
                    <div className="bg-warning-soft text-on-warning-soft px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between">
                      <span>⚠️ Move-out Date: <b>{fmtDate(t.notice?.vacatingDate || t.noticeDate)}</b></span>
                      <span className="opacity-80 capitalize">Reason: {t.notice?.reason || 'Notice'}</span>
                    </div>
                  )}

                  <p className="font-body text-xs text-ink-2 tabular-nums">
                    Rent {inr(t.rent)} · Deposit {inr(t.deposit)} · Police verification: {t.docs?.policeVerification === 'done' ? 'Completed ✓' : t.docs?.policeVerification === 'submitted' ? 'Submitted (Review Pending)' : 'Pending'}
                  </p>

                  <footer className="flex items-center gap-2 pt-1 border-t border-line flex-wrap">
                    <button
                      type="button"
                      onClick={() => setPayModalTenant(t)}
                      className="px-3 py-1.5 rounded-full bg-success-soft text-on-success-soft font-label text-xs font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[16px]">payments</span>
                      <span>Collect Rent</span>
                    </button>

                    {!isOnNotice ? (
                      <button
                        type="button"
                        onClick={() => setNoticeModalTenant(t)}
                        className="px-3 py-1.5 rounded-full bg-primary-soft text-primary font-label text-xs font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[16px]">schedule</span>
                        <span>Give Notice</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => cancelNotice(t)}
                        className="px-3 py-1.5 rounded-full bg-surface-2 text-ink-2 border border-line font-label text-xs font-semibold hover:text-ink transition-colors inline-flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[16px]">cancel</span>
                        <span>Cancel Notice</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setCheckoutModalTenant(t)}
                      className="px-3 py-1.5 rounded-full bg-danger-soft text-on-danger-soft font-label text-xs font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[16px]">logout</span>
                      <span>Checkout Settlement</span>
                    </button>
                  </footer>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        /* Leaves & Passes View */
        <div className="flex flex-col gap-3.5">
          {(!leaves.data || leaves.data.length === 0) ? (
            <p className="bg-surface border border-line rounded-2xl p-6 text-center text-sm text-ink-2">
              No leave passes on record.
            </p>
          ) : (
            leaves.data.map((l) => {
              const isParentApproved = l.parentStatus === 'approved';
              const isParentRejected = l.parentStatus === 'rejected';
              const isParentPending = l.parentStatus === 'pending';
              const isManagerApproved = l.managerStatus === 'approved' || l.managerStatus === 'acknowledged';
              const isManagerDenied = l.managerStatus === 'denied';
              const isManagerPending = !isManagerApproved && !isManagerDenied;
              const needsConfirmation = isParentApproved && isManagerPending;

              return (
                <article
                  key={l._id}
                  className={`bg-surface border rounded-2xl p-4 shadow-sm flex flex-col gap-3.5 transition-all ${
                    needsConfirmation ? 'border-primary ring-1 ring-primary/20' : 'border-line'
                  }`}
                >
                  <header className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-full bg-primary-soft text-primary font-bold text-sm flex items-center justify-center shrink-0">
                        {(l.tenant?.name || 'TN').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h2 className="font-title text-base font-bold text-ink">{l.tenant?.name}</h2>
                        <p className="text-xs text-ink-2 tabular-nums">
                          Room {l.tenant?.room?.number} (Bed {l.tenant?.bed?.label}) · <a href={`tel:${l.tenant?.phone}`} className="text-primary hover:underline">{l.tenant?.phone}</a>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      {/* Parent Status Badge */}
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        isParentApproved
                          ? 'bg-success-soft text-on-success-soft'
                          : isParentRejected
                          ? 'bg-danger-soft text-on-danger-soft'
                          : 'bg-warning-soft text-on-warning-soft'
                      }`}>
                        {isParentApproved ? 'Parent: Approved ✓' : isParentRejected ? 'Parent: Rejected ✕' : 'Parent: Pending ⏳'}
                      </span>

                      {/* Manager Status Badge */}
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        isManagerApproved
                          ? 'bg-success text-white font-bold'
                          : isManagerDenied
                          ? 'bg-danger text-white font-bold'
                          : needsConfirmation
                          ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
                          : 'bg-surface-2 text-ink-2'
                      }`}>
                        {isManagerApproved
                          ? 'Leave Approved ✓'
                          : isManagerDenied
                          ? 'Denied by Manager ✕'
                          : needsConfirmation
                          ? '📞 Call Parent to Confirm'
                          : 'Awaiting Parent'}
                      </span>
                    </div>
                  </header>

                  {/* Leave Details */}
                  <div className="bg-surface-2 rounded-xl p-3 text-xs flex flex-col gap-1.5 border border-line/60">
                    <div className="flex justify-between">
                      <span className="text-ink-2">Leave Dates:</span>
                      <b className="text-ink tabular-nums">{fmtDate(l.startDate)} to {fmtDate(l.endDate)}</b>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-2">Destination:</span>
                      <b className="text-ink">{l.destination || 'Home'}</b>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-2">Reason for Leave:</span>
                      <b className="text-ink">{l.reason}</b>
                    </div>
                  </div>

                  {/* Parent Contact & Call Bar */}
                  <div className="bg-primary-soft/30 border border-primary/20 rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-[20px]">contacts</span>
                        <div>
                          <span className="text-[10px] text-ink-2 uppercase tracking-wider font-bold">Parent Contact</span>
                          <p className="text-sm font-bold text-ink flex items-center gap-1.5">
                            <span>{l.parentName || 'Parent'}</span>
                            <span className="text-ink-2 font-normal">·</span>
                            <span className="font-mono tabular-nums text-primary">{l.parentPhone}</span>
                          </p>
                        </div>
                      </div>

                      {/* Quick Call & WhatsApp Buttons for Manager */}
                      <div className="flex items-center gap-2">
                        <a
                          href={`tel:${l.parentPhone}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-bold shadow-sm hover:opacity-90 transition-opacity"
                        >
                          <span className="material-symbols-outlined text-[16px]">call</span>
                          <span>Call Parent</span>
                        </a>
                        <a
                          href={`https://wa.me/91${l.parentPhone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#25D366] text-white text-xs font-bold shadow-sm hover:opacity-90 transition-opacity"
                        >
                          <span className="material-symbols-outlined text-[16px]">chat</span>
                          <span>WhatsApp</span>
                        </a>
                      </div>
                    </div>

                    {l.parentRemarks && (
                      <p className="text-xs text-ink-2 italic border-t border-line/60 pt-1.5">
                        Parent note: "{l.parentRemarks}" {l.parentActionAt ? `(${fmtDate(l.parentActionAt)})` : ''}
                      </p>
                    )}
                  </div>

                  {/* Manager Decision Section */}
                  {isManagerPending ? (
                    <div className="flex flex-col gap-2.5 pt-1 border-t border-line">
                      {needsConfirmation ? (
                        <>
                          <p className="text-xs text-primary font-semibold flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[16px]">info</span>
                            <span>Parent approved on {fmtDate(l.parentActionAt)}. Confirm with parent and decide:</span>
                          </p>

                          <input
                            type="text"
                            placeholder="Manager note (optional, e.g. Confirmed on call with father)"
                            value={managerRemarks[l._id] || ''}
                            onChange={(e) => setManagerRemarks({ ...managerRemarks, [l._id]: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-ink font-body text-xs focus:border-primary focus:outline-none"
                          />

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={actionBusy === l._id}
                              onClick={() => handleManagerDecision(l._id, 'approved')}
                              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-success text-white font-label text-xs font-bold shadow-sm hover:opacity-95 disabled:opacity-50 transition-opacity"
                            >
                              <span className="material-symbols-outlined text-[16px]">check_circle</span>
                              <span>{actionBusy === l._id ? 'Processing...' : 'Approve Leave'}</span>
                            </button>

                            <button
                              type="button"
                              disabled={actionBusy === l._id}
                              onClick={() => handleManagerDecision(l._id, 'denied')}
                              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-danger-soft text-on-danger-soft border border-danger/30 font-label text-xs font-bold hover:bg-danger-soft/80 disabled:opacity-50 transition-colors"
                            >
                              <span className="material-symbols-outlined text-[16px]">cancel</span>
                              <span>Deny Leave</span>
                            </button>
                          </div>
                        </>
                      ) : isParentPending ? (
                        <div className="bg-surface-2 rounded-xl p-2.5 text-xs text-ink-2 flex items-center justify-between">
                          <span>Waiting for parent to accept first via WhatsApp / link.</span>
                          <a href={`tel:${l.parentPhone}`} className="text-primary font-semibold hover:underline">
                            Call to Remind
                          </a>
                        </div>
                      ) : (
                        <div className="bg-danger-soft text-on-danger-soft rounded-xl p-2.5 text-xs font-semibold">
                          Parent rejected this leave request on {fmtDate(l.parentActionAt)}.
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Manager Decision Already Made */
                    <footer className={`rounded-xl p-3 text-xs flex flex-col gap-1 ${
                      isManagerApproved ? 'bg-success-soft text-on-success-soft' : 'bg-danger-soft text-on-danger-soft'
                    }`}>
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[16px]">
                            {isManagerApproved ? 'check_circle' : 'cancel'}
                          </span>
                          <span>{isManagerApproved ? 'Leave Confirmed & Approved by Manager' : 'Leave Denied by Manager'}</span>
                        </span>
                        {l.managerActionAt && (
                          <span className="text-[11px] font-normal opacity-80">
                            {fmtDate(l.managerActionAt)} · {fmtTime(l.managerActionAt)}
                          </span>
                        )}
                      </div>
                      {l.managerRemarks && (
                        <p className="text-[11px] opacity-90">Manager remarks: "{l.managerRemarks}"</p>
                      )}
                    </footer>
                  )}
                </article>
              );
            })
          )}
        </div>
      )}

      {/* Quick Allot Modal */}
      {quickAllotOpen && (
        <QuickAllotModal
          beds={beds.data}
          onClose={() => setQuickAllotOpen(false)}
          onSuccess={(res) => {
            setQuickAllotOpen(false);
            setInviteSuccess(res);
            reload();
            beds.reload();
          }}
        />
      )}

      {/* Invite Success Modal with WhatsApp CTA */}
      {inviteSuccess && (
        <InviteSuccessModal
          data={inviteSuccess}
          onClose={() => setInviteSuccess(null)}
        />
      )}

      {/* Offline Payment Collection Modal */}
      {payModalTenant && (
        <OfflinePaymentModal
          tenant={payModalTenant}
          onClose={() => setPayModalTenant(null)}
          onSuccess={(res) => {
            setPayModalTenant(null);
            setReceiptSlip(res);
            reload();
          }}
        />
      )}

      {/* Notice Management Modal */}
      {noticeModalTenant && (
        <NoticeModal
          tenant={noticeModalTenant}
          onClose={() => setNoticeModalTenant(null)}
          onSuccess={() => {
            setNoticeModalTenant(null);
            setMsg({ text: 'Notice recorded successfully. Bed marked on notice ✓' });
            reload();
            beds.reload();
          }}
        />
      )}

      {/* Checkout Settlement Modal */}
      {checkoutModalTenant && (
        <CheckoutSettlementModal
          tenant={checkoutModalTenant}
          onClose={() => setCheckoutModalTenant(null)}
          onSuccess={(res) => {
            setCheckoutModalTenant(null);
            setSettlementSlip(res);
            reload();
            beds.reload();
          }}
        />
      )}

      {/* Printable Receipt Voucher */}
      {receiptSlip && (
        <ReceiptVoucherModal
          data={receiptSlip}
          onClose={() => setReceiptSlip(null)}
        />
      )}

      {/* Printable Settlement Voucher */}
      {settlementSlip && (
        <SettlementVoucherModal
          data={settlementSlip}
          onClose={() => setSettlementSlip(null)}
        />
      )}
    </div>
  );
}

// ---- Subcomponent Modals ----

export function QuickAllotModal({ beds = [], onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [bedId, setBedId] = useState('');
  const [rent, setRent] = useState('');
  const [deposit, setDeposit] = useState('');
  const [bookingAmount, setBookingAmount] = useState('2000');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (beds && beds.length > 0 && !bedId) {
      const b0 = beds[0];
      setBedId(b0._id);
      setRent(String(b0.rent || 7500));
      setDeposit(String(b0.deposit || (b0.rent ? b0.rent * 2 : 15000)));
      setBookingAmount(String(b0.bookingAmount || 2000));
    }
  }, [beds, bedId]);

  const handleBedChange = (id) => {
    setBedId(id);
    const b = beds.find((x) => x._id === id);
    if (b) {
      setRent(String(b.rent || 7500));
      setDeposit(String(b.deposit || (b.rent ? b.rent * 2 : 15000)));
      setBookingAmount(String(b.bookingAmount || 2000));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setErr('Please enter student name');
    if (phone.replace(/\D/g, '').length !== 10) return setErr('Please enter 10-digit mobile number');
    if (!bedId) return setErr('Please select a bed');

    setBusy(true);
    setErr('');
    try {
      const res = await api('/manager/tenants/quick-allot', {
        method: 'POST',
        body: {
          name: name.trim(),
          phone: phone.replace(/\D/g, ''),
          bedId,
          rent: Number(rent),
          deposit: Number(deposit),
          bookingAmount: Number(bookingAmount),
        },
      });
      onSuccess(res);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-surface rounded-2xl p-6 shadow-xl flex flex-col gap-4 border border-line max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-primary-soft text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">bolt</span>
            </span>
            <div>
              <h2 className="font-title text-base font-bold text-ink">Spot Allotment (Instant)</h2>
              <small className="text-xs text-ink-2">New student arrival · Allot bed in 30 seconds</small>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-ink-2 hover:text-ink">
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3.5">
          {err && <p className="rounded-xl px-4 py-2 text-xs font-semibold bg-danger-soft text-on-danger-soft">{err}</p>}

          <label className="flex flex-col gap-1">
            <span className="font-label text-xs font-semibold text-ink-2">Student Name</span>
            <input
              required
              placeholder="e.g. Ansh Setia"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-label text-xs font-semibold text-ink-2">Mobile Number (WhatsApp)</span>
            <input
              required
              inputMode="tel"
              placeholder="10-digit number (e.g. 9149151900)"
              value={phone}
              maxLength={10}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              className="w-full px-3.5 py-2 rounded-xl bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-label text-xs font-semibold text-ink-2">Bed Allotment</span>
            {beds?.length === 0 ? (
              <p className="text-xs text-danger font-semibold py-2">No vacant beds available.</p>
            ) : (
              <select
                value={bedId}
                onChange={(e) => handleBedChange(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:outline-none"
              >
                {beds?.map((b) => (
                  <option key={b._id} value={b._id}>
                    Room {b.room?.number || b.roomNumber} · Bed {b.label} ({b.room?.sharingType || 2}-Sharing) · {inr(b.rent)}/mo
                  </option>
                ))}
              </select>
            )}
          </label>

          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="font-label text-xs font-semibold text-ink-2">Rent / Month</span>
              <input
                type="number"
                value={rent}
                onChange={(e) => setRent(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-label text-xs font-semibold text-ink-2">Security Deposit</span>
              <input
                type="number"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:outline-none"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="font-label text-xs font-semibold text-ink-2">Booking Token / Part Payment Allowed (₹)</span>
            <input
              type="number"
              value={bookingAmount}
              onChange={(e) => setBookingAmount(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:outline-none"
            />
            <small className="text-[11px] text-ink-2">Student can reserve and lock bed with this token amount</small>
          </label>

          <div className="bg-primary-soft/40 border border-primary-soft rounded-xl p-3 text-xs text-primary flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">info</span>
            <span>Upon allotment, an invite link will be sent to the student's WhatsApp for verification details and token/rent payment.</span>
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/3 py-2.5 rounded-full border border-line text-ink font-label text-xs font-semibold hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !beds?.length}
              className="w-2/3 py-2.5 rounded-full bg-primary text-on-primary font-label text-xs font-bold shadow-sm hover:opacity-95 disabled:opacity-50 transition-opacity flex items-center justify-center gap-1.5"
            >
              {busy ? 'Allotting...' : '⚡ Allot Bed & Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function InviteSuccessModal({ data, onClose }) {
  const [copied, setCopied] = useState(false);
  const tenant = data?.tenant;
  const inviteToken = data?.inviteToken || tenant?.inviteToken;
  const inviteUrl = `${window.location.origin}/onboard/${inviteToken}`;
  const phone = tenant?.phone || '';

  const waMsg = encodeURIComponent(
    `Hello ${tenant?.name || ''}! Your bed has been reserved at Your PG (Room ${tenant?.room?.number || ''}, Bed ${tenant?.bed?.label || ''}).\n\nPlease click this link to submit your verification details and confirm your booking:\n${inviteUrl}\n\nThank you!`
  );
  const waUrl = `https://wa.me/91${phone}?text=${waMsg}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-surface rounded-2xl p-6 shadow-xl flex flex-col gap-4 border border-line" onClick={(e) => e.stopPropagation()}>
        <div className="text-center flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-success-soft text-on-success-soft flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl font-bold">check_circle</span>
          </div>
          <h2 className="font-headline text-lg font-bold text-ink">Bed Reserved Successfully!</h2>
          <p className="font-body text-xs text-ink-2">
            Bed has been reserved for <b>{tenant?.name}</b> ({phone}).
          </p>
        </div>

        <div className="bg-surface-2 border border-line rounded-xl p-3 text-xs flex flex-col gap-1.5">
          <div className="flex justify-between">
            <span className="text-ink-2">Room & Bed:</span>
            <b className="text-ink">Room {tenant?.room?.number || ''} · Bed {tenant?.bed?.label || ''}</b>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-2">Monthly Rent:</span>
            <b className="text-ink">{inr(tenant?.rent || 0)}</b>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-2">Part Payment Allowed:</span>
            <b className="text-primary">{inr(tenant?.bookingAmount || 2000)}</b>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-label text-xs font-semibold text-ink-2">Student Onboarding Link:</span>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={inviteUrl}
              className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-line text-ink font-body text-xs truncate focus:outline-none"
            />
            <button
              type="button"
              onClick={copyLink}
              className="px-3 py-2 rounded-xl bg-surface border border-line text-ink font-label text-xs font-bold hover:bg-surface-2 shrink-0 transition-colors"
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#25D366] text-white font-label text-xs font-bold shadow-sm hover:opacity-95 transition-opacity"
          >
            <span className="material-symbols-outlined text-[18px]">chat</span>
            <span>Send Invite via WhatsApp</span>
          </a>

          <a
            href={inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-surface border border-line text-ink font-label text-xs font-semibold hover:bg-surface-2 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
            <span>Open Link Directly</span>
          </a>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-full text-ink-2 font-label text-xs font-semibold hover:text-ink transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Subcomponent Modals ----

export function OfflinePaymentModal({ tenant, onClose, onSuccess }) {
  const [dues, setDues] = useState([]);
  const [selectedPayId, setSelectedPayId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/manager/payments/due')
      .then((list) => {
        const tenantDues = list.filter((p) => String(p.tenantId) === String(tenant._id));
        setDues(tenantDues);
        if (tenantDues.length > 0) {
          setSelectedPayId(tenantDues[0].id);
          setAmount(String(tenantDues[0].balanceRemaining));
        } else {
          setErr('No pending dues found for this tenant.');
        }
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [tenant._id]);

  const activeDue = dues.find((d) => d.id === selectedPayId);

  const handleSelectPayment = (id) => {
    setSelectedPayId(id);
    const item = dues.find((d) => d.id === id);
    if (item) setAmount(String(item.balanceRemaining));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!selectedPayId) return setErr('Please select a payment');
    const amt = Number(amount);
    if (!amt || amt <= 0) return setErr('Please enter a valid amount');
    if (activeDue && amt > activeDue.balanceRemaining) {
      return setErr(`Amount cannot exceed remaining balance (${inr(activeDue.balanceRemaining)})`);
    }

    setBusy(true);
    setErr('');
    try {
      const res = await api('/manager/payments/record-offline', {
        method: 'POST',
        body: {
          paymentId: selectedPayId,
          amount: amt,
          method,
          reference,
          note,
        },
      });
      onSuccess({
        tenant,
        transaction: res.transaction,
        payment: res.payment,
        balanceRemaining: res.balanceRemaining,
        paidTotal: res.paidTotal,
      });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-surface rounded-2xl p-6 shadow-xl flex flex-col gap-4 border border-line max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h2 className="font-title text-base font-bold text-ink">Record Offline Payment</h2>
            <small className="text-xs text-ink-2">Tenant: <b>{tenant.name}</b> (Room {tenant.room?.number || tenant.room})</small>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-ink-2 hover:text-ink">
            ✕
          </button>
        </div>

        {loading ? (
          <p className="text-center py-6 text-sm text-ink-2">Loading pending dues...</p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            {err && <p className="rounded-xl px-4 py-2.5 text-xs font-semibold bg-danger-soft text-on-danger-soft">{err}</p>}

            {dues.length > 0 && (
              <label className="flex flex-col gap-1.5">
                <span className="font-label text-xs font-semibold text-ink-2">Select Pending Bill</span>
                <select
                  value={selectedPayId}
                  onChange={(e) => handleSelectPayment(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:outline-none"
                >
                  {dues.map((d) => (
                    <option key={d.id} value={d.id}>
                      {monthName(d.month)} ({d.kind}) · Due: {inr(d.balanceRemaining)} / Total: {inr(d.total)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {activeDue && (
              <div className="bg-surface-2 border border-line rounded-xl p-3.5 flex justify-between items-center text-xs">
                <div>
                  <span className="text-ink-2 block">Total Bill: <b>{inr(activeDue.total)}</b></span>
                  <span className="text-success font-semibold block">Paid Earlier: {inr(activeDue.paidAmount)}</span>
                </div>
                <div className="text-right">
                  <span className="text-ink-2 block">Balance Remaining:</span>
                  <span className="text-base font-bold text-primary tabular-nums">{inr(activeDue.balanceRemaining)}</span>
                </div>
              </div>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="font-label text-xs font-semibold text-ink-2">Payment Amount to Collect (Partial / Full)</span>
              <input
                type="number"
                inputMode="numeric"
                required
                placeholder="Amount ₹"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm font-bold tabular-nums focus:border-primary focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-label text-xs font-semibold text-ink-2">Payment Method</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['cash', '💵 Cash'],
                  ['upi_owner', '📱 UPI to Owner'],
                  ['cheque', '🏦 Cheque'],
                  ['neft', '💻 NEFT / IMPS'],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setMethod(k)}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border text-left transition-all ${
                      method === k
                        ? 'bg-primary text-on-primary border-primary shadow-sm'
                        : 'bg-surface text-ink border-line hover:bg-surface-2'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </label>

            {method !== 'cash' && (
              <label className="flex flex-col gap-1.5">
                <span className="font-label text-xs font-semibold text-ink-2">UTR / Reference / Cheque No.</span>
                <input
                  type="text"
                  placeholder="e.g. UPI Ref / Bank UTR / Cheque #"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:outline-none"
                />
              </label>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="font-label text-xs font-semibold text-ink-2">Note (Optional)</span>
              <input
                type="text"
                placeholder="e.g. Paid in cash / Installment 1"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:outline-none"
              />
            </label>

            <button
              type="submit"
              disabled={busy || !selectedPayId || !amount}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-on-primary font-label text-sm font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50 mt-2"
            >
              {busy ? 'Recording...' : `Record Payment (${inr(amount)})`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function NoticeModal({ tenant, onClose, onSuccess }) {
  const defaultDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const [vacatingDate, setVacatingDate] = useState(defaultDate);
  const [reason, setReason] = useState('personal');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!vacatingDate) return setErr('Please select a vacating date');
    setBusy(true);
    setErr('');
    try {
      await api(`/manager/tenants/${tenant._id}/notice`, {
        method: 'POST',
        body: { vacatingDate, reason, note },
      });
      onSuccess();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-surface rounded-2xl p-6 shadow-xl flex flex-col gap-4 border border-line" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h2 className="font-title text-base font-bold text-ink">Room Vacating Notice</h2>
            <small className="text-xs text-ink-2">Tenant: <b>{tenant.name}</b> (Bed {tenant.bed?.label || tenant.bed})</small>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-ink-2 hover:text-ink">
            ✕
          </button>
        </div>

        {err && <p className="rounded-xl px-4 py-2.5 text-xs font-semibold bg-danger-soft text-on-danger-soft">{err}</p>}

        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">Expected Move-out Date (Vacating Date)</span>
            <input
              type="date"
              required
              value={vacatingDate}
              onChange={(e) => setVacatingDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:outline-none"
            />
            <small className="text-[11px] text-ink-2">Standard notice period is 30 days.</small>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">Reason for Leaving</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:outline-none"
            >
              <option value="personal">Moving back home / Personal</option>
              <option value="job">New job / Office relocation</option>
              <option value="exam">Graduation / Course finished</option>
              <option value="budget">Budget / Shifting</option>
              <option value="other">Other reason</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">Remarks / Notes</span>
            <input
              type="text"
              placeholder="e.g. Flight booked on 15th, room inspection done"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={busy || !vacatingDate}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-on-primary font-label text-sm font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50 mt-1"
          >
            {busy ? 'Saving...' : 'Confirm Vacating Notice'}
          </button>
        </form>
      </div>
    </div>
  );
}

export function CheckoutSettlementModal({ tenant, onClose, onSuccess }) {
  const [preview, setPreview] = useState(null);
  const [deductions, setDeductions] = useState([]);
  const [refundMethod, setRefundMethod] = useState('upi');
  const [refundRef, setRefundRef] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api(`/manager/tenants/${tenant._id}/settlement-preview`)
      .then((data) => setPreview(data))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [tenant._id]);

  const addDeduction = (category = 'other', title = '', amount = 500) => {
    setDeductions([...deductions, { id: String(Date.now() + Math.random()), category, title, amount }]);
  };

  const removeDeduction = (id) => {
    setDeductions(deductions.filter((d) => d.id !== id));
  };

  const updateDeduction = (id, key, val) => {
    setDeductions(deductions.map((d) => (d.id === id ? { ...d, [key]: val } : d)));
  };

  const totalDeductions = deductions.reduce((s, d) => s + Number(d.amount || 0), 0);
  const depositHeld = preview?.depositHeld || 0;
  const pendingDues = preview?.pendingDues || 0;
  const netRefundable = depositHeld - pendingDues - totalDeductions;

  const submit = async (e) => {
    e.preventDefault();
    if (!window.confirm(`Confirm checkout settlement for ${tenant.name}? The bed will be marked vacant.`)) return;

    setBusy(true);
    setErr('');
    try {
      const res = await api(`/manager/tenants/${tenant._id}/checkout-settle`, {
        method: 'POST',
        body: {
          deductions: deductions.map((d) => ({
            category: d.category,
            title: d.title || 'Deduction',
            amount: Number(d.amount || 0),
          })),
          refundMethod,
          refundRef,
          notes,
        },
      });
      onSuccess(res.settlement);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-surface rounded-2xl p-6 shadow-xl flex flex-col gap-4 border border-line max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h2 className="font-title text-base font-bold text-ink">Checkout & Final Settlement</h2>
            <small className="text-xs text-ink-2">Tenant: <b>{tenant.name}</b> · Room {tenant.room?.number || tenant.room}</small>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-ink-2 hover:text-ink">
            ✕
          </button>
        </div>

        {loading ? (
          <p className="text-center py-6 text-sm text-ink-2">Calculating settlement statement...</p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            {err && <p className="rounded-xl px-4 py-2.5 text-xs font-semibold bg-danger-soft text-on-danger-soft">{err}</p>}

            {/* Deposit & Dues Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-2 border border-line rounded-xl p-3 text-center">
                <span className="text-xs text-ink-2 block">Security Deposit Held</span>
                <b className="text-lg font-bold text-success tabular-nums">{inr(depositHeld)}</b>
              </div>
              <div className="bg-surface-2 border border-line rounded-xl p-3 text-center">
                <span className="text-xs text-ink-2 block">Pending Rent / Bills</span>
                <b className="text-lg font-bold text-danger tabular-nums">{inr(pendingDues)}</b>
              </div>
            </div>

            {/* Pending Dues details if any */}
            {preview?.unpaidPayments?.length > 0 && (
              <div className="bg-danger-soft/20 border border-danger-soft rounded-xl p-3 text-xs flex flex-col gap-1">
                <b className="text-ink">Unpaid bills (adjusted from deposit):</b>
                {preview.unpaidPayments.map((p) => (
                  <div key={p.id} className="flex justify-between text-ink-2">
                    <span>{monthName(p.month)} ({p.kind})</span>
                    <b className="text-danger font-semibold">{inr(p.due)}</b>
                  </div>
                ))}
              </div>
            )}

            {/* Deductions Section */}
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-title text-sm font-bold text-ink">Deductions</h3>
                  <p className="text-xs text-ink-2">Deep cleaning, painting, repair, shortfall</p>
                </div>
                <button
                  type="button"
                  onClick={() => addDeduction('cleaning', 'Deep Cleaning & Sanitization', 500)}
                  className="px-3 py-1 rounded-full bg-surface border border-line text-xs font-semibold text-primary hover:bg-surface-2 inline-flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span>
                  <span>+ Deduction</span>
                </button>
              </div>

              {/* Preset buttons */}
              <div className="flex gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => addDeduction('painting', 'Room Painting & Touchup', 1000)}
                  className="px-2.5 py-1 rounded-lg bg-surface-2 border border-line text-[11px] font-semibold text-ink-2 hover:text-ink"
                >
                  + Painting (₹1,000)
                </button>
                <button
                  type="button"
                  onClick={() => addDeduction('damage', 'Wall / Switch Repair', 300)}
                  className="px-2.5 py-1 rounded-lg bg-surface-2 border border-line text-[11px] font-semibold text-ink-2 hover:text-ink"
                >
                  + Repair (₹300)
                </button>
                <button
                  type="button"
                  onClick={() => addDeduction('notice_shortfall', 'Short notice fee', 1500)}
                  className="px-2.5 py-1 rounded-lg bg-surface-2 border border-line text-[11px] font-semibold text-ink-2 hover:text-ink"
                >
                  + Short Notice
                </button>
              </div>

              {/* Deductions item rows */}
              <div className="flex flex-col gap-2 mt-1">
                {deductions.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 bg-surface-2 border border-line p-2.5 rounded-xl">
                    <select
                      value={d.category}
                      onChange={(e) => updateDeduction(d.id, 'category', e.target.value)}
                      className="text-xs bg-surface border border-line rounded-lg px-2 py-1.5 focus:outline-none"
                    >
                      <option value="painting">Painting 🎨</option>
                      <option value="cleaning">Cleaning 🧹</option>
                      <option value="damage">Damage 🛠️</option>
                      <option value="notice_shortfall">Short Notice ⏱️</option>
                      <option value="other">Other 🔧</option>
                    </select>

                    <input
                      type="text"
                      placeholder="Title / Description"
                      value={d.title}
                      onChange={(e) => updateDeduction(d.id, 'title', e.target.value)}
                      className="flex-1 text-xs px-2 py-1.5 bg-surface border border-line rounded-lg focus:outline-none"
                    />

                    <div className="w-24 flex items-center gap-1">
                      <span className="text-xs text-ink-2 font-bold">₹</span>
                      <input
                        type="number"
                        placeholder="Amt"
                        value={d.amount}
                        onChange={(e) => updateDeduction(d.id, 'amount', e.target.value)}
                        className="w-full text-xs px-2 py-1.5 bg-surface border border-line rounded-lg text-right font-bold tabular-nums focus:outline-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => removeDeduction(d.id)}
                      className="text-ink-2 hover:text-danger p-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Net Calculation Hero */}
            <div className={`rounded-xl p-4 flex flex-col gap-2 border ${
              netRefundable >= 0 ? 'bg-success-soft/30 border-success' : 'bg-danger-soft/30 border-danger'
            }`}>
              <div className="flex justify-between text-xs text-ink">
                <span>Deposit Held:</span>
                <span className="font-semibold tabular-nums">+{inr(depositHeld)}</span>
              </div>
              <div className="flex justify-between text-xs text-ink">
                <span>Pending Rent/Bills:</span>
                <span className="font-semibold tabular-nums">-{inr(pendingDues)}</span>
              </div>
              <div className="flex justify-between text-xs text-ink">
                <span>Total Deductions:</span>
                <span className="font-semibold tabular-nums">-{inr(totalDeductions)}</span>
              </div>
              <div className="border-t border-line pt-2 flex justify-between items-center">
                <b className="text-sm font-bold text-ink">
                  {netRefundable >= 0 ? 'Net Refund to Tenant:' : 'Extra Amount Due from Tenant:'}
                </b>
                <b className={`text-xl font-bold tabular-nums ${netRefundable >= 0 ? 'text-success' : 'text-danger'}`}>
                  {inr(Math.abs(netRefundable))}
                </b>
              </div>
            </div>

            {/* Refund Mode */}
            <div className="flex flex-col gap-2">
              <span className="font-label text-xs font-semibold text-ink-2">Refund Method</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['upi', '📱 UPI'],
                  ['cash', '💵 Cash'],
                  ['neft', '💻 Bank Transfer'],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setRefundMethod(k)}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold border text-center transition-all ${
                      refundMethod === k
                        ? 'bg-primary text-on-primary border-primary shadow-sm'
                        : 'bg-surface text-ink border-line hover:bg-surface-2'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="font-label text-xs font-semibold text-ink-2">UTR / Transaction Ref (Optional)</span>
              <input
                type="text"
                placeholder="UPI Ref ID / Cash voucher"
                value={refundRef}
                onChange={(e) => setRefundRef(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-label text-xs font-semibold text-ink-2">Settlement Notes</span>
              <input
                type="text"
                placeholder="e.g. Deposit settled, keys collected, room vacated"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:outline-none"
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-on-primary font-label text-sm font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50 mt-2"
            >
              {busy ? 'Processing...' : 'Confirm Settlement & Checkout'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function ReceiptVoucherModal({ data, onClose }) {
  const { tenant, transaction, payment, balanceRemaining } = data;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-surface rounded-2xl p-6 shadow-xl flex flex-col gap-4 border border-line print:m-0 print:border-none print:shadow-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h2 className="font-title text-base font-bold text-ink">Payment Receipt</h2>
            <small className="text-xs text-ink-2">Receipt No: <b>{transaction.receiptNo}</b></small>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-success-soft text-on-success-soft text-xs font-bold">
            {balanceRemaining === 0 ? 'PAID FULL ✓' : 'PARTIAL PAID'}
          </span>
        </div>

        <div className="text-xs text-ink-2 flex flex-col gap-1">
          <p>Tenant: <b className="text-ink">{tenant.name}</b> · Room: <b className="text-ink">{tenant.room?.number || tenant.room}</b></p>
          <p>Date: <b className="text-ink">{fmtDate(transaction.paidAt)} {fmtTime(transaction.paidAt)}</b></p>
          <p>Method: <b className="text-ink capitalize">{transaction.method}</b> {transaction.reference ? `(${transaction.reference})` : ''}</p>
        </div>

        <div className="bg-surface-2 rounded-xl p-4 flex flex-col gap-2 border border-line">
          <div className="flex justify-between items-center text-sm">
            <span>Amount Paid:</span>
            <b className="text-lg font-bold text-primary tabular-nums">{inr(transaction.amount)}</b>
          </div>
          <div className="flex justify-between items-center text-xs text-ink-2 border-t border-line pt-2">
            <span>Bill Total:</span>
            <span className="tabular-nums font-semibold">{inr(payment.total)}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span>Remaining Balance:</span>
            <b className={`tabular-nums ${balanceRemaining > 0 ? 'text-warning font-bold' : 'text-success font-semibold'}`}>
              {inr(balanceRemaining)}
            </b>
          </div>
        </div>

        <div className="flex gap-2 pt-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-primary text-on-primary font-bold text-xs shadow-sm hover:opacity-95"
          >
            <span className="material-symbols-outlined text-[16px]">print</span>
            <span>Print / PDF</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-full bg-surface text-ink border border-line text-xs font-semibold hover:bg-surface-2"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettlementVoucherModal({ data, onClose }) {
  const s = data;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-surface rounded-2xl p-6 shadow-xl flex flex-col gap-4 border border-line print:m-0 print:border-none print:shadow-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h2 className="font-title text-base font-bold text-ink">Checkout Settlement Voucher</h2>
            <small className="text-xs text-ink-2">Slip No: <b>{s.settlementNo}</b></small>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-success-soft text-on-success-soft text-xs font-bold">
            SETTLED ✓
          </span>
        </div>

        <div className="text-xs text-ink-2 flex flex-col gap-1">
          <p>Date: <b className="text-ink">{fmtDate(s.checkoutDate)}</b></p>
          <p>Payment Mode: <b className="text-ink capitalize">{s.refundMethod}</b> {s.refundRef ? `(${s.refundRef})` : ''}</p>
        </div>

        <table className="w-full text-xs border-t border-line">
          <tbody>
            <tr className="border-b border-line/60">
              <td className="py-2 text-ink-2">Security Deposit Held</td>
              <td className="text-right font-bold text-success tabular-nums">+{inr(s.depositHeld)}</td>
            </tr>
            <tr className="border-b border-line/60">
              <td className="py-2 text-ink-2">Pending Dues Adjusted</td>
              <td className="text-right font-bold text-danger tabular-nums">-{inr(s.pendingDues)}</td>
            </tr>

            {s.deductions?.map((d, i) => (
              <tr key={i} className="border-b border-line/40">
                <td className="py-1.5 text-ink-2 pl-2">↳ {d.title} ({d.category})</td>
                <td className="text-right font-semibold text-danger tabular-nums">-{inr(d.amount)}</td>
              </tr>
            ))}

            <tr className="border-b border-line/60">
              <td className="py-2 font-semibold text-ink">Total Deductions</td>
              <td className="text-right font-bold text-danger tabular-nums">-{inr(s.totalDeductions)}</td>
            </tr>
            <tr className="font-bold text-sm">
              <td className="pt-3 text-ink">
                {s.netRefundable >= 0 ? 'Net Refund Amount:' : 'Extra Collected:'}
              </td>
              <td className={`text-right pt-3 tabular-nums ${s.netRefundable >= 0 ? 'text-success text-base' : 'text-danger text-base'}`}>
                {inr(Math.abs(s.netRefundable))}
              </td>
            </tr>
          </tbody>
        </table>

        {s.notes && (
          <p className="text-xs text-ink-2 bg-surface-2 p-2.5 rounded-xl border border-line">
            <b>Note:</b> {s.notes}
          </p>
        )}

        <div className="flex gap-2 pt-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-primary text-on-primary font-bold text-xs shadow-sm hover:opacity-95"
          >
            <span className="material-symbols-outlined text-[16px]">print</span>
            <span>Print Slip</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-full bg-surface text-ink border border-line text-xs font-semibold hover:bg-surface-2"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Menu editor ----
export function MenuEdit() {
  const week = useLoad(() => api('/manager/menu'));
  const count = useLoad(() => api('/manager/food-count'));
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [f, setF] = useState({ nashta: '', lunch: '', dinner: '' });
  const [msg, setMsg] = useState({ text: '' });
  const days = Array.from({ length: 7 }, (_, i) => new Date(new Date(today).getTime() + i * 86400000).toISOString().slice(0, 10));

  useEffect(() => {
    const d = week.data?.find((x) => x.date === date);
    setF({ nashta: d?.nashta || '', lunch: d?.lunch || '', dinner: d?.dinner || '' });
  }, [date, week.data]);

  const save = async () => {
    try { await api(`/manager/menu/${date}`, { method: 'PUT', body: f }); setMsg({ text: 'Menu saved successfully ✓' }); week.reload(); }
    catch (e) { setMsg({ text: e.message, bad: true }); }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-headline text-2xl font-bold text-ink">Food Menu</h1>
        <p className="font-body text-sm text-ink-2">This menu will appear in all tenants' app</p>
      </div>

      {count.data && (
        <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex items-center justify-between text-sm">
          <span>Dining today:</span>
          <b>{count.data.eating} / {count.data.total} tenants ({count.data.skipped} skipped)</b>
        </div>
      )}

      {/* Days Selector */}
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDate(d)}
            className={`py-2 px-1 rounded-xl flex flex-col items-center gap-0.5 text-xs font-semibold border transition-all ${
              d === date
                ? 'bg-primary text-on-primary border-primary shadow-sm'
                : 'bg-surface text-ink border-line hover:bg-surface-2'
            }`}
          >
            <span className="text-[10px] opacity-80">{new Date(d).toLocaleDateString('en-IN', { weekday: 'short' })}</span>
            <b className="text-sm">{Number(d.slice(8))}</b>
          </button>
        ))}
      </div>

      {/* Meal Inputs */}
      <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex flex-col gap-3.5">
        {[
          ['nashta', 'Breakfast', '🌅'],
          ['lunch', 'Lunch', '☀️'],
          ['dinner', 'Dinner', '🌙'],
        ].map(([k, l, icon]) => (
          <label key={k} className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">{icon} {l}</span>
            <input
              value={f[k]}
              maxLength={200}
              placeholder="Enter menu items..."
              onChange={(e) => setF({ ...f, [k]: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </label>
        ))}
      </div>

      {msg.text && (
        <p className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${msg.bad ? 'bg-danger-soft text-on-danger-soft' : 'bg-success-soft text-on-success-soft'}`}>
          {msg.text}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-on-primary font-label text-sm font-bold shadow-sm hover:opacity-95 transition-opacity"
      >
        Save Menu
      </button>
    </div>
  );
}
