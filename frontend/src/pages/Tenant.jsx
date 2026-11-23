import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, payNow } from '../api.js';
import { ErrorBox, FilePick, Loading, fmtDate, fmtTime, inr, monthName, useLoad } from '../components.jsx';
import { SettlementVoucherModal } from './Manager.jsx';

export function Rent() {
  const { data, error, reload } = useLoad(() => api('/tenant/dashboard'));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [receipt, setReceipt] = useState(null);
  const [settlementSlip, setSettlementSlip] = useState(null);

  // Self notice state
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const defaultDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const [vacatingDate, setVacatingDate] = useState(defaultDate);
  const [noticeReason, setNoticeReason] = useState('personal');
  const [noticeNote, setNoticeNote] = useState('');

  if (error) return <ErrorBox text={error} />;
  if (!data) return <Loading />;

  const sum = (k) => data.payments.reduce((s, p) => s + (p[k] || 0), 0);
  const totalPaidSoFar = data.payments.reduce((s, p) => s + (p.paidAmount || 0), 0);
  const totalBill = data.payments.reduce((s, p) => s + (p.total || 0), 0);
  const hasPartialPayments = data.payments.some((p) => (p.paidAmount || 0) > 0 && p.status !== 'paid');

  const pay = async () => {
    setBusy(true); setMsg({ text: '' });
    try {
      await payNow(data.month);
      setMsg({ text: 'Payment ho gayi! Receipt WhatsApp pe bhej di gayi ✓' });
      reload();
    } catch (e) {
      setMsg({ text: e.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

  const openReceipt = async (no) => {
    try { setReceipt(await api(`/tenant/receipt/${no}`)); }
    catch (e) { setMsg({ text: e.message, bad: true }); }
  };

  const viewSettlement = async () => {
    try {
      const res = await api('/tenant/settlement');
      setSettlementSlip(res.settlement);
    } catch (e) {
      setMsg({ text: e.message, bad: true });
    }
  };

  const submitNotice = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg({ text: '' });
    try {
      await api('/tenant/notice', {
        method: 'POST',
        body: { vacatingDate, reason: noticeReason, note: noticeNote },
      });
      setMsg({ text: 'Notice submit ho gaya! Manager ko suchit kar diya gaya hai ✓' });
      setShowNoticeForm(false);
      reload();
    } catch (e) {
      setMsg({ text: e.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-headline text-2xl font-bold text-ink">Mera kiraya</h1>
        <p className="font-body text-sm text-ink-2">
          Room {data.tenant.room} · Bed {data.tenant.bed?.split('-')[1]}
        </p>
      </div>

      {/* Hero Financial Card */}
      <section className={`rounded-2xl p-6 shadow-sm flex flex-col gap-3 text-on-primary ${data.paid ? 'bg-success' : 'bg-primary'}`}>
        <span className="text-xs font-semibold uppercase tracking-wider opacity-90">
          {monthName(data.month)} {data.paid ? '· PAID ✓' : hasPartialPayments ? '· PARTIAL PAID' : '· BAAKI'}
        </span>
        <div className="font-display text-4xl font-bold tabular-nums">
          {inr(data.paid ? sum('total') : data.dueTotal)}
        </div>
        <p className="font-body text-sm text-on-primary/90 tabular-nums">
          Kiraya {inr(sum('rent'))}
          {sum('food') > 0 ? ` + khaana ${inr(sum('food'))}` : ''}
          {sum('electricity') > 0 ? ` + bijli ${inr(sum('electricity'))}` : ''}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-surface/20 text-on-primary font-label text-xs font-semibold tabular-nums">
            Deposit {inr(data.tenant.deposit)} jama
          </span>
          {hasPartialPayments && (
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-surface/20 text-on-primary font-label text-xs font-semibold tabular-nums">
              Pehle jama: {inr(totalPaidSoFar)} / {inr(totalBill)}
            </span>
          )}
        </div>
      </section>

      {/* Installment History if partial payments exist */}
      {data.payments.some((p) => p.transactions?.length > 0) && (
        <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col gap-2.5">
          <div className="flex justify-between items-center text-xs">
            <h2 className="font-title text-sm font-bold text-ink">Kiraya Kisht / Installments</h2>
            <span className="text-success font-bold tabular-nums">{inr(totalPaidSoFar)} jama ho chuka</span>
          </div>
          <div className="flex flex-col gap-2">
            {data.payments.flatMap((p) => p.transactions || []).map((t, idx) => (
              <div key={idx} className="flex justify-between items-center py-2 border-t border-line first:border-0 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <b className="text-ink tabular-nums">{inr(t.amount)}</b>
                    <span className="px-2 py-0.5 rounded-full bg-primary-soft text-primary font-semibold text-[10px] capitalize">
                      {t.method}
                    </span>
                  </div>
                  <span className="text-ink-2 text-[11px] block mt-0.5">
                    {fmtDate(t.paidAt)} · Receipt #{t.receiptNo}
                  </span>
                </div>
                {t.note && <span className="text-ink-2 italic text-[11px] max-w-[120px] truncate">{t.note}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!data.paid && data.dueTotal > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={pay}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-primary text-on-primary font-label text-sm font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
          >
            {busy ? 'Payment load ho rahi hai...' : `${inr(data.dueTotal)} Pay Karo`}
          </button>
          <p className="text-center text-xs text-ink-2">
            UPI, Card ya Net Banking: payment gateway par select karein.
            {data.payments[0]?.dueDate && ` Due date: ${fmtDate(data.payments[0].dueDate)}`}
          </p>
        </div>
      )}

      {msg.text && (
        <p className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${msg.bad ? 'bg-danger-soft text-on-danger-soft' : 'bg-success-soft text-on-success-soft'}`}>
          {msg.text}
        </p>
      )}

      {/* Notice Management Section for Tenant */}
      {data.tenant.status === 'notice' ? (
        <div className="bg-warning-soft text-on-warning-soft border border-warning/30 rounded-2xl p-4 shadow-sm flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">warning</span>
            <b className="text-sm font-bold">Room Chhodne Ka Notice Active Hai</b>
          </div>
          <p className="text-xs">
            Aapki vacating date <b>{fmtDate(data.tenant.notice?.vacatingDate)}</b> hai.
            {data.tenant.notice?.reason && <span className="capitalize"> ({data.tenant.notice.reason})</span>}
          </p>
          <p className="text-[11px] opacity-80">
            Agar notice cancel karna ho ya vacating date badalni ho toh PG Manager se sampark karein.
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <b className="text-sm font-bold text-ink">Room Chhodna Chahte Hain?</b>
              <p className="text-xs text-ink-2">Vacating date ka notice manager ko submit karein</p>
            </div>
            <button
              type="button"
              onClick={() => setShowNoticeForm(!showNoticeForm)}
              className="px-3.5 py-1.5 rounded-full bg-surface border border-line text-xs font-semibold text-primary hover:bg-surface-2 transition-colors"
            >
              {showNoticeForm ? 'Cancel' : 'Notice Dein'}
            </button>
          </div>

          {showNoticeForm && (
            <form onSubmit={submitNotice} className="border-t border-line pt-3 flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-ink-2">Vacating Date (Kab room chhodenge)</span>
                <input
                  type="date"
                  required
                  min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                  value={vacatingDate}
                  onChange={(e) => setVacatingDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-xs font-medium focus:border-primary focus:outline-none"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-ink-2">Reason</span>
                <select
                  value={noticeReason}
                  onChange={(e) => setNoticeReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-xs font-medium focus:border-primary focus:outline-none"
                >
                  <option value="personal">Ghar wapas / Personal</option>
                  <option value="job">Nayi job / Office relocation</option>
                  <option value="exam">Exams khatam / College pura</option>
                  <option value="budget">Budget / Shift</option>
                  <option value="other">Other reason</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-ink-2">Notes (Optional)</span>
                <input
                  type="text"
                  placeholder="Kuch aur batana ho toh likhein..."
                  value={noticeNote}
                  onChange={(e) => setNoticeNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-xs focus:border-primary focus:outline-none"
                />
              </label>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-full bg-primary text-on-primary text-xs font-bold hover:opacity-95 transition-opacity disabled:opacity-50"
              >
                {busy ? 'Notice bheja ja raha hai...' : 'Notice Submit Karo'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Button to view settlement slip if checked out or available */}
      <div className="pt-1">
        <button
          type="button"
          onClick={viewSettlement}
          className="w-full py-2.5 rounded-xl bg-surface border border-line text-xs font-semibold text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors flex items-center justify-center gap-1.5"
        >
          <span className="material-symbols-outlined text-[16px]">receipt_long</span>
          <span>Settlement Slip Dekhein</span>
        </button>
      </div>

      {/* History */}
      <div className="flex flex-col gap-2.5 pt-2">
        <h2 className="font-headline text-lg font-bold text-ink">Pichhle mahine</h2>
        <div className="flex flex-col gap-2.5">
          {data.history.length === 0 && (
            <p className="bg-surface border border-line rounded-xl p-4 text-center text-xs text-ink-2">
              Abhi koi purani payment nahi hai.
            </p>
          )}
          {data.history.map((p) => (
            <article key={p._id} className="bg-surface border border-line rounded-xl p-3.5 shadow-sm flex items-center justify-between">
              <div>
                <b className="text-sm font-bold text-ink">{monthName(p.month)}</b>
                <small className="block text-xs text-ink-2">Paid · {fmtDate(p.paidAt)}</small>
              </div>
              <div className="flex items-center gap-3">
                <b className="text-sm font-bold text-ink tabular-nums">{inr(p.total)}</b>
                <button
                  type="button"
                  onClick={() => openReceipt(p.receiptNo)}
                  className="px-3 py-1 rounded-full bg-surface border border-line text-primary font-label text-xs font-semibold hover:bg-primary-soft transition-colors"
                >
                  Receipt
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Receipt Modal */}
      {receipt && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setReceipt(null)}>
          <div className="w-full max-w-md bg-surface rounded-2xl p-6 shadow-xl flex flex-col gap-4 border border-line" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h2 className="font-title text-base font-bold text-ink">{receipt.pg}</h2>
                <small className="text-xs text-ink-2">Receipt {receipt.receiptNo}</small>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-success-soft text-on-success-soft text-xs font-bold">PAID</span>
            </div>

            <p className="text-xs text-ink-2">
              Tenant: <b>{receipt.tenant}</b> · Room: <b>{receipt.room}</b><br />
              Month: {monthName(receipt.month)} · Paid on: {fmtDate(receipt.paidAt)}
            </p>

            <table className="w-full text-sm border-t border-line">
              <tbody>
                <tr className="border-b border-line/60"><td className="py-2 text-ink-2">Kiraya</td><td className="text-right font-semibold">{inr(receipt.rent)}</td></tr>
                {receipt.food > 0 && <tr className="border-b border-line/60"><td className="py-2 text-ink-2">Khaana</td><td className="text-right font-semibold">{inr(receipt.food)}</td></tr>}
                {receipt.electricity > 0 && <tr className="border-b border-line/60"><td className="py-2 text-ink-2">Bijli</td><td className="text-right font-semibold">{inr(receipt.electricity)}</td></tr>}
                <tr className="font-bold text-base text-primary"><td className="pt-3">Total Paid</td><td className="text-right pt-3">{inr(receipt.total)}</td></tr>
              </tbody>
            </table>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-full bg-primary text-on-primary font-bold text-xs shadow-sm hover:opacity-95"
              >
                Print / PDF Save Karo
              </button>
              <button
                type="button"
                onClick={() => setReceipt(null)}
                className="w-full inline-flex items-center justify-center px-4 py-2 rounded-full bg-surface text-ink border border-line text-xs font-semibold hover:bg-surface-2"
              >
                Band karo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settlement Voucher Modal */}
      {settlementSlip && (
        <SettlementVoucherModal
          data={settlementSlip}
          onClose={() => setSettlementSlip(null)}
        />
      )}
    </div>
  );
}

export function Bill() {
  const { data, error } = useLoad(() => api('/tenant/bill'));
  if (error) return <ErrorBox text={error} />;
  if (!data) return <Loading />;
  const b = data.reading;

  if (!b) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-headline text-2xl font-bold text-ink">Bijli ka bill</h1>
        <p className="bg-surface border border-line rounded-2xl p-6 text-center text-sm text-ink-2">
          Abhi bill nahi aaya hai. Manager reading bhejega toh yahan dikhega.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-headline text-2xl font-bold text-ink">Bijli ka bill</h1>
        <p className="font-body text-sm text-ink-2">
          Room {b.room} · {monthName(b.month)}
        </p>
      </div>

      <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-surface-2 rounded-xl p-3">
            <small className="block text-xs text-ink-2">Pichhli</small>
            <b className="text-lg font-bold text-ink tabular-nums">{b.previous}</b>
          </div>
          <div className="bg-surface-2 rounded-xl p-3">
            <small className="block text-xs text-ink-2">Abhi</small>
            <b className="text-lg font-bold text-ink tabular-nums">{b.current}</b>
          </div>
          <div className="bg-primary-soft text-primary rounded-xl p-3">
            <small className="block text-xs opacity-80">Units</small>
            <b className="text-lg font-bold tabular-nums">{b.units}</b>
          </div>
        </div>
        <small className="text-center text-xs text-ink-2">
          Reading li gayi: {fmtDate(b.readAt)} · Verified by Manager
        </small>
      </div>

      <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex flex-col gap-2.5 text-sm">
        <div className="flex justify-between py-1 border-b border-line">
          <span className="text-ink-2">Units × Rate</span>
          <b className="tabular-nums">{b.units} × ₹{b.rate}</b>
        </div>
        <div className="flex justify-between py-1 border-b border-line">
          <span className="text-ink-2">Room ka total</span>
          <b className="tabular-nums">{inr(b.total)}</b>
        </div>
        <div className="flex justify-between py-1 border-b border-line">
          <span className="text-ink-2">Room mein log</span>
          <b>{b.people}</b>
        </div>
        <div className="flex justify-between pt-2 text-base font-bold text-primary">
          <span>Aapka hissa</span>
          <span className="tabular-nums text-lg">{inr(b.share)}</span>
        </div>
      </div>

      <p className="text-center text-xs text-ink-2">
        Ye amount agle mahine ke kiraye ke bill mein judega.
      </p>

      <Link
        to="/kiraya"
        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-on-primary font-label text-sm font-bold shadow-sm hover:opacity-95 transition-opacity"
      >
        Kiraya page kholo
      </Link>
    </div>
  );
}

const CATS = [
  ['ac', '❄️', 'AC'],
  ['wifi', '📶', 'WiFi'],
  ['water', '💧', 'Paani'],
  ['cleaning', '🧹', 'Safai'],
  ['other', '🔧', 'Aur'],
];
const STATUS = { new: 'Complaint gayi', in_progress: 'Kaam chalu', done: 'Theek ho gaya' };

export function Complaint() {
  const list = useLoad(() => api('/tenant/complaints'));
  const [cat, setCat] = useState('ac');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '' });

  const send = async (e) => {
    e?.preventDefault();
    setBusy(true); setMsg({ text: '' });
    try {
      await api('/tenant/complaints', { method: 'POST', body: { category: cat, text, photo: photo || undefined } });
      setText(''); setPhoto(''); setMsg({ text: 'Complaint manager tak pahunch gayi ✓' }); list.reload();
    } catch (e) { setMsg({ text: e.message, bad: true }); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-headline text-2xl font-bold text-ink">Complaint</h1>
        <p className="font-body text-sm text-ink-2">Photo ke saath seedha manager tak</p>
      </div>

      <form onSubmit={send} className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex flex-col gap-4">
        {/* Category Picker */}
        <div className="grid grid-cols-5 gap-1.5">
          {CATS.map(([k, icon, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setCat(k)}
              className={`p-2 rounded-xl flex flex-col items-center gap-1 text-xs font-semibold border transition-all ${
                cat === k
                  ? 'bg-primary text-on-primary border-primary shadow-sm font-bold'
                  : 'bg-surface text-ink border-line hover:bg-surface-2'
              }`}
            >
              <span className="text-lg">{icon}</span>
              <span className="text-[11px]">{label}</span>
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="font-label text-xs font-semibold text-ink-2">Kya dikkat hai?</span>
          <textarea
            rows={3}
            maxLength={500}
            placeholder="Jaise: AC thanda nahi kar raha..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
          />
        </label>

        <FilePick label="Photo lagao (optional)" value={photo} onChange={setPhoto} capture="environment" />

        {msg.text && (
          <p className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${msg.bad ? 'bg-danger-soft text-on-danger-soft' : 'bg-success-soft text-on-success-soft'}`}>
            {msg.text}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-on-primary font-label text-sm font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
        >
          {busy ? 'Bhej rahe hain...' : 'Complaint bhejo'}
        </button>
      </form>

      {/* Complaint List */}
      <div className="flex flex-col gap-3 pt-1">
        <h2 className="font-headline text-lg font-bold text-ink">Meri complaints</h2>
        {list.error && <ErrorBox text={list.error} />}
        {list.data?.length === 0 && (
          <p className="bg-surface border border-line rounded-xl p-4 text-center text-xs text-ink-2">
            Abhi koi complaint darj nahi hai.
          </p>
        )}
        {list.data?.map((c) => (
          <article key={c._id} className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <b>{CATS.find((x) => x[0] === c.category)?.[2]} {c.text && `· ${c.text}`}</b>
            </div>
            <ul className="flex flex-col gap-1 pt-1 border-t border-line text-xs font-semibold text-success">
              {c.history.map((h, i) => (
                <li key={i} className="flex justify-between">
                  <span>✓ {STATUS[h.status] || h.status}</span>
                  <small className="text-ink-2 font-normal">{fmtDate(h.at)}, {fmtTime(h.at)}</small>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}

const MEALS = [
  ['nashta', 'Nashta', '7:30–9:30 AM'],
  ['lunch', 'Lunch', '12:30–2:30 PM'],
  ['dinner', 'Dinner', '8:00–10:00 PM'],
];

export function Menu() {
  const { data, error, reload } = useLoad(() => api('/tenant/menu'));
  const [sel, setSel] = useState(null);
  const [msg, setMsg] = useState('');

  if (error) return <ErrorBox text={error} />;
  if (!data) return <Loading />;

  const date = sel || data.today;
  const day = data.days.find((d) => d.date === date);
  const past = date <= data.today;
  const act = async (fn) => {
    setMsg('');
    try { await fn(); reload(); } catch (e) { setMsg(e.message); }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-headline text-2xl font-bold text-ink">Khaane ka menu</h1>
        <p className="font-body text-sm text-ink-2">Is hafte ka menu · roz update</p>
      </div>

      {/* Days Selector */}
      <div className="grid grid-cols-7 gap-1.5">
        {data.days.map((d) => (
          <button
            key={d.date}
            type="button"
            onClick={() => setSel(d.date)}
            className={`py-2 px-1 rounded-xl flex flex-col items-center gap-0.5 text-xs font-semibold border transition-all ${
              d.date === date
                ? 'bg-primary text-on-primary border-primary shadow-sm font-bold'
                : 'bg-surface text-ink border-line hover:bg-surface-2'
            }`}
          >
            <span className="text-[10px] opacity-80">{new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short' })}</span>
            <b className="text-sm">{Number(d.date.slice(8))}</b>
          </button>
        ))}
      </div>

      {/* Meals list */}
      <div className="flex flex-col gap-3">
        {MEALS.map(([k, label, time]) => (
          <article key={k} className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3">
            <div>
              <b className="text-sm font-bold text-ink">{label}</b>
              <small className="block text-xs text-ink-2 mt-0.5">{day[k] || 'Menu update hoga'}</small>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <small className="text-xs text-ink-2 font-semibold">{time}</small>
              {past && day[k] && (
                <div className="flex text-amber-400 text-sm">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-label={`${n} star`}
                      onClick={() => act(() => api('/tenant/menu/rate', { method: 'POST', body: { date, meal: k, stars: n } }))}
                      className={n <= (day.ratings?.[k] || 0) ? 'text-amber-400' : 'text-line'}
                    >
                      ★
                    </button>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {date >= data.today && (
        <button
          type="button"
          onClick={() => act(() => api('/tenant/menu/skip', { method: 'POST', body: { date, skip: !day.skipped } }))}
          className={`w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-label text-sm font-bold shadow-sm transition-all ${
            day.skipped
              ? 'bg-surface text-ink border border-line hover:bg-surface-2'
              : 'bg-ink text-on-primary hover:opacity-95'
          }`}
        >
          {day.skipped
            ? 'Khaana chahiye (cancel skip)'
            : date === data.today
            ? 'Aaj khaana nahi chahiye (Skip)'
            : 'Is din khaana nahi chahiye (Skip)'}
        </button>
      )}

      {day.skipped && (
        <p className="rounded-xl p-3 text-xs font-semibold bg-success-soft text-on-success-soft text-center">
          ✓ Kitchen ko inform kar diya gaya hai (Meal Skipped)
        </p>
      )}

      {msg && <p className="rounded-xl p-3 text-xs font-semibold bg-danger-soft text-on-danger-soft">{msg}</p>}
    </div>
  );
}
