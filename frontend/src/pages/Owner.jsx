import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrorBox, Loading, fmtDate, inr, monthName, thisMonth, useLoad } from '../components.jsx';
import { OfflinePaymentModal, ReceiptVoucherModal } from './Manager.jsx';

export function Hisaab() {
  const [month, setMonth] = useState(thisMonth());
  const { data, error, reload } = useLoad(() => api(`/owner/summary?month=${month}`), [month]);
  const [showDeposits, setShowDeposits] = useState(false);
  const deposits = useLoad(() => (showDeposits ? api('/owner/deposits') : Promise.resolve(null)), [showDeposits]);
  const [msg, setMsg] = useState({ text: '' });
  const [busy, setBusy] = useState(false);
  const [collectPay, setCollectPay] = useState(null);
  const [receiptSlip, setReceiptSlip] = useState(null);

  if (error) return <ErrorBox text={error} />;
  if (!data) return <Loading />;

  const remind = async (paymentId) => {
    setBusy(true);
    try {
      const r = await api('/owner/remind', { method: 'POST', body: { month, paymentId } });
      setMsg({ text: `${r.sent} reminder bhej diye ✓` });
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
        <h1 className="font-headline text-2xl font-bold text-ink">Kiraya ka hisaab</h1>
        <p className="font-body text-sm text-ink-2 tabular-nums">
          {monthName(month)} · {data.beds.occupied} / {data.beds.total} bed occupied
        </p>
      </div>

      {/* Date Picker */}
      <div className="flex items-center gap-2">
        <input
          type="month"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          className="px-4 py-2 rounded-xl bg-surface border border-line text-ink font-semibold text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
        />
      </div>

      {/* Financial Summary Hero Card */}
      <section className="bg-primary text-on-primary rounded-2xl p-6 shadow-sm flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider opacity-90">Is mahine mila</span>
        <div className="font-display text-4xl font-bold tabular-nums">
          {inr(data.collected)}
        </div>
        <p className="font-body text-sm text-on-primary/90 tabular-nums">
          Baaki {inr(data.pending)} · {data.pendingPeople} log baaki
        </p>
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowDeposits(!showDeposits)}
            className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-surface/20 text-on-primary font-label text-xs font-semibold hover:bg-surface/30 transition-colors"
          >
            Deposit {inr(data.deposits)} {showDeposits ? '▴' : '▾'}
          </button>
        </div>
      </section>

      {/* Deposit Dropdown */}
      {showDeposits && deposits.data && (
        <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col gap-2">
          <h3 className="font-title text-sm font-bold text-ink mb-1">Tenants Security Deposit List</h3>
          {deposits.data.map((d) => (
            <div key={d.id} className="flex justify-between items-center py-2 border-t border-line first:border-0 text-sm">
              <div>
                <b>{d.name}</b>
                <span className="block text-xs text-ink-2">Room {d.room} · {fmtDate(d.since)} se</span>
              </div>
              <b className="font-semibold tabular-nums">{inr(d.deposit)}</b>
            </div>
          ))}
        </div>
      )}

      {/* Late Rent Section */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <h2 className="font-headline text-lg font-bold text-ink">Late kiraya</h2>
        {data.overdue.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => remind()}
            className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-surface border border-line text-primary font-label text-xs font-bold hover:bg-primary-soft transition-colors"
          >
            Sabko reminder
          </button>
        )}
      </div>

      {msg.text && (
        <p className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${msg.bad ? 'bg-danger-soft text-on-danger-soft' : 'bg-success-soft text-on-success-soft'}`}>
          {msg.text}
        </p>
      )}

      {data.overdue.length === 0 && (
        <p className="rounded-xl p-4 text-sm font-semibold bg-success-soft text-on-success-soft text-center">
          Koi late nahi hai! Sabhi dues clear hain ✓
        </p>
      )}

      {/* Late Rent Cards */}
      <div className="flex flex-col gap-3">
        {data.overdue.map((o) => {
          const initials = (o.tenant || 'TN')
            .split(' ')
            .map((s) => s[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
          return (
            <article
              key={o.paymentId}
              className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-primary-soft text-primary flex items-center justify-center font-bold text-sm shrink-0">
                  {initials}
                </div>
                <div className="flex flex-col min-w-0">
                  <h3 className="font-title text-sm font-bold text-ink truncate">
                    Room {o.room} · {o.tenant}
                  </h3>
                  <p className="font-body text-xs text-ink-2 tabular-nums">
                    {o.daysLate} din late {o.reminderSentAt ? '· Reminder gaya ✓' : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className="font-title text-sm font-bold text-warning tabular-nums">
                  {inr(o.amount)}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCollectPay(o)}
                    className="px-3 py-1 rounded-full bg-success-soft text-on-success-soft font-label text-xs font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-1"
                  >
                    <span>Jama Lo</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remind(o.paymentId)}
                    className="px-3 py-1 rounded-full bg-surface border border-line text-primary font-label text-xs font-semibold hover:bg-primary-soft transition-colors"
                  >
                    Reminder
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {collectPay && (
        <OfflinePaymentModal
          tenant={{ _id: collectPay.tenantId || collectPay.tenant, name: collectPay.tenant, room: collectPay.room }}
          onClose={() => setCollectPay(null)}
          onSuccess={(res) => {
            setCollectPay(null);
            setReceiptSlip(res);
            setMsg({ text: 'Kiraya jama ho gaya ✓' });
            reload();
          }}
        />
      )}

      {receiptSlip && (
        <ReceiptVoucherModal
          data={receiptSlip}
          onClose={() => setReceiptSlip(null)}
        />
      )}
    </div>
  );
}

export function Beds() {
  const [tab, setTab] = useState('hierarchy'); // 'hierarchy' | 'grid' | 'new'
  const bedsData = useLoad(() => api('/owner/beds'));
  const hierarchyData = useLoad(() => api('/owner/hierarchy'));
  const [pick, setPick] = useState(null);
  const [blockFilter, setBlockFilter] = useState('all');
  const [msg, setMsg] = useState({ text: '' });
  const [busy, setBusy] = useState(false);

  // New room form state
  const [newRoom, setNewRoom] = useState({
    blockId: '',
    newBlockName: '',
    floor: 1,
    number: '',
    sharingType: 2,
    rent: '',
    initialReading: 0,
  });

  const reloadAll = () => {
    bedsData.reload();
    hierarchyData.reload();
  };

  const link = `${window.location.origin}/vacancy`;
  const share = async () => {
    const text = `${bedsData.data?.counts.vacant || 0} bed khaali hain. Dekho: ${link}`;
    if (navigator.share) {
      try { await navigator.share({ text, url: link }); } catch { /* cancelled */ }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  if (bedsData.error || hierarchyData.error) return <ErrorBox text={bedsData.error || hierarchyData.error} />;
  if (!bedsData.data || !hierarchyData.data) return <Loading />;

  const { items, counts, vacantRent } = bedsData.data;
  const { blocks, rooms, sharingDefaults } = hierarchyData.data;

  const handleSharingChange = (val) => {
    const st = Number(val);
    const tier = sharingDefaults.find((d) => d.sharingType === st);
    setNewRoom({
      ...newRoom,
      sharingType: st,
      rent: tier?.rent || (st === 1 ? 12000 : st === 2 ? 7500 : st === 3 ? 6000 : 5000),
    });
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg({ text: '' });
    try {
      let bId = newRoom.blockId;
      if (newRoom.blockId === 'NEW') {
        if (!newRoom.newBlockName.trim()) throw new Error('Naye block ka naam daalo');
        const blk = await api('/owner/blocks', { method: 'POST', body: { name: newRoom.newBlockName.trim() } });
        bId = blk.id || blk._id;
      }
      await api('/owner/rooms', {
        method: 'POST',
        body: {
          blockId: bId || undefined,
          floor: Number(newRoom.floor),
          number: newRoom.number.trim(),
          sharingType: Number(newRoom.sharingType),
          rent: Number(newRoom.rent),
          initialReading: Number(newRoom.initialReading || 0),
        },
      });
      setMsg({ text: `Room ${newRoom.number} aur uske ${newRoom.sharingType} beds ban gaye ✓` });
      setNewRoom({ blockId: '', newBlockName: '', floor: 1, number: '', sharingType: 2, rent: '', initialReading: 0 });
      setTab('hierarchy');
      reloadAll();
    } catch (err) {
      setMsg({ text: err.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRoom = async (roomId, roomNo) => {
    if (!window.confirm(`Room ${roomNo} aur uske khaali beds delete karein?`)) return;
    try {
      await api(`/owner/rooms/${roomId}`, { method: 'DELETE' });
      setMsg({ text: `Room ${roomNo} delete ho gaya ✓` });
      reloadAll();
    } catch (err) {
      setMsg({ text: err.message, bad: true });
    }
  };

  const filteredRooms = rooms.filter((r) => blockFilter === 'all' || String(r.blockId) === blockFilter || r.blockName === blockFilter);
  const filteredBeds = items.filter((b) => blockFilter === 'all' || b.block === blockFilter);
  const info = pick && items.find((b) => b.id === pick);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-headline text-2xl font-bold text-ink">Block, Room & Bed Setup</h1>
        <p className="font-body text-sm text-ink-2">Hierarchy · Sharing type · Khaali bed status</p>
      </div>

      {/* Stat Tiles */}
      <div className="grid grid-cols-3 gap-3 items-stretch">
        <div className="bg-surface border border-line rounded-xl p-4 shadow-sm flex flex-col items-center justify-center gap-1 h-full text-center">
          <span className="font-headline text-2xl font-bold text-ink tabular-nums">{counts.occupied}</span>
          <span className="font-body text-xs text-ink-2">Bhare Bed</span>
        </div>
        <div className="bg-surface border border-line rounded-xl p-4 shadow-sm flex flex-col items-center justify-center gap-1 h-full text-center">
          <span className="font-headline text-2xl font-bold text-success tabular-nums">{counts.vacant}</span>
          <span className="font-body text-xs text-ink-2">Khaali Bed</span>
        </div>
        <div className="bg-surface border border-line rounded-xl p-4 shadow-sm flex flex-col items-center justify-center gap-1 h-full text-center">
          <span className="font-headline text-2xl font-bold text-warning tabular-nums">{counts.notice}</span>
          <span className="font-body text-xs text-ink-2">Notice</span>
        </div>
      </div>

      {/* View Switcher */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-2 border border-line">
        <button
          type="button"
          onClick={() => setTab('hierarchy')}
          className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg font-label text-xs font-semibold transition-all ${
            tab === 'hierarchy' ? 'bg-surface text-primary shadow-sm' : 'text-ink-2 hover:text-ink'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">account_tree</span>
          <span>Hierarchy</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('grid')}
          className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg font-label text-xs font-semibold transition-all ${
            tab === 'grid' ? 'bg-surface text-primary shadow-sm' : 'text-ink-2 hover:text-ink'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">grid_view</span>
          <span>Bed Grid</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('new')}
          className={`inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg font-label text-xs font-semibold transition-all ${
            tab === 'new' ? 'bg-surface text-primary shadow-sm' : 'text-ink-2 hover:text-ink'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          <span>Naya Room</span>
        </button>
      </div>

      {msg.text && (
        <p className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${msg.bad ? 'bg-danger-soft text-on-danger-soft' : 'bg-success-soft text-on-success-soft'}`}>
          {msg.text}
        </p>
      )}

      {/* Block Filter Chips */}
      {tab !== 'new' && blocks.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setBlockFilter('all')}
            className={`px-3.5 py-1.5 rounded-full font-label text-xs font-semibold transition-all ${
              blockFilter === 'all'
                ? 'bg-primary text-on-primary'
                : 'bg-surface border border-line text-ink-2 hover:text-ink'
            }`}
          >
            Sabhi Blocks
          </button>
          {blocks.map((blk) => (
            <button
              key={blk.id}
              type="button"
              onClick={() => setBlockFilter(blk.name)}
              className={`px-3.5 py-1.5 rounded-full font-label text-xs font-semibold transition-all ${
                blockFilter === blk.name
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface border border-line text-ink-2 hover:text-ink'
              }`}
            >
              {blk.name}
            </button>
          ))}
        </div>
      )}

      {/* Hierarchy View */}
      {tab === 'hierarchy' && (
        <div className="flex flex-col gap-4">
          {filteredRooms.length === 0 && (
            <p className="bg-surface border border-line rounded-xl p-4 text-center text-sm text-ink-2">
              Koi room nahi mila.
            </p>
          )}

          {blocks
            .filter((blk) => blockFilter === 'all' || blk.name === blockFilter)
            .map((blk) => {
              const blkRooms = filteredRooms.filter((r) => String(r.blockId) === String(blk.id) || r.blockName === blk.name);
              if (!blkRooms.length) return null;
              const floors = Array.from(new Set(blkRooms.map((r) => r.floor))).sort((a, b) => a - b);

              return (
                <div key={blk.id} className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm flex flex-col">
                  {/* Block Header */}
                  <div className="bg-surface-2 px-5 py-3.5 border-b border-line flex items-center justify-between">
                    <div>
                      <strong className="font-title text-sm font-bold text-ink">🏢 {blk.name}</strong>
                      <span className="block text-xs text-ink-2">{blk.description || 'Block Wing'}</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-primary-soft text-primary text-xs font-bold">
                      {blkRooms.reduce((s, r) => s + r.totalBeds, 0)} Beds
                    </span>
                  </div>

                  {/* Floor rows */}
                  {floors.map((fl) => (
                    <div key={fl} className="border-t border-line first:border-0 p-3.5">
                      <div className="text-xs font-bold text-ink-2 px-1 mb-2">
                        📍 Floor {fl}
                      </div>

                      <div className="flex flex-col gap-2.5">
                        {blkRooms
                          .filter((r) => r.floor === fl)
                          .map((rm) => (
                            <div key={rm.id} className="border border-line rounded-xl p-3 bg-surface flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <b className="text-sm font-bold text-ink">Room {rm.number}</b>
                                  <span className="px-2 py-0.5 rounded-full bg-primary-soft text-primary text-[11px] font-bold">
                                    {rm.sharingType}-Sharing
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-semibold tabular-nums ${rm.vacantBeds > 0 ? 'text-success' : 'text-ink-2'}`}>
                                    {rm.vacantBeds} / {rm.totalBeds} khaali
                                  </span>
                                  {rm.vacantBeds === rm.totalBeds && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteRoom(rm.id, rm.number)}
                                      className="px-2 py-0.5 rounded-full bg-danger-soft text-on-danger-soft text-[10px] font-bold"
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Beds list */}
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {rm.beds.map((b) => (
                                  <div
                                    key={b.id}
                                    title={b.notice ? `Notice: ${fmtDate(b.notice.vacatingDate)} (${b.notice.reason || 'Notice'})` : ''}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                                      b.status === 'vacant'
                                        ? 'bg-success-soft text-on-success-soft border-success/30'
                                        : b.status === 'notice'
                                        ? 'bg-warning-soft text-on-warning-soft border-warning/30'
                                        : 'bg-surface-2 text-ink border-line'
                                    }`}
                                  >
                                    <span className="font-bold">{b.label.split('-')[1] || b.label}</span>
                                    <span className="text-[11px] opacity-90">
                                      {b.status === 'vacant'
                                        ? `${inr(b.rent)}`
                                        : b.status === 'notice'
                                        ? `${b.tenant} (Notice: ${b.notice?.vacatingDate ? fmtDate(b.notice.vacatingDate) : 'Soon'})`
                                        : b.tenant}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
        </div>
      )}

      {/* Bed Grid View */}
      {tab === 'grid' && (
        <div className="flex flex-col gap-4">
          <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm grid grid-cols-4 gap-2">
            {filteredBeds.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setPick(b.id)}
                className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                  b.status === 'vacant'
                    ? 'bg-success-soft text-on-success-soft border-success/40'
                    : b.status === 'notice'
                    ? 'bg-warning-soft text-on-warning-soft border-warning/40'
                    : 'bg-surface-2 text-ink-2 border-line'
                } ${pick === b.id ? 'ring-2 ring-primary ring-offset-1' : ''}`}
              >
                {b.label}
              </button>
            ))}
          </div>

          {info && (
            <div className="bg-surface border border-line rounded-xl p-4 shadow-sm text-sm">
              <b className="text-primary font-bold">{info.label}</b> ({info.block} · Floor {info.floor} · {info.sharingType}-Sharing):{' '}
              {info.status === 'vacant'
                ? `Khaali · ${info.daysVacant} din se · ${inr(info.rent)}/mo`
                : info.status === 'notice'
                ? `Notice pe · ${info.tenant}`
                : `Bhara · ${info.tenant}`}
            </div>
          )}

          {counts.vacant > 0 && (
            <p className="rounded-xl p-3 text-xs font-semibold bg-success-soft text-on-success-soft text-center">
              🛏️ {counts.vacant} bed khaali · {inr(vacantRent)} / mahina potential rent
            </p>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={share}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-on-primary font-label text-sm font-bold shadow-sm hover:opacity-95 transition-opacity"
            >
              Khaali bed ka link share karo
            </button>
            <a
              href="/vacancy"
              target="_blank"
              rel="noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-surface text-ink border border-line font-label text-sm font-semibold hover:bg-surface-2 transition-colors"
            >
              Public vacancy page dekho
            </a>
          </div>
        </div>
      )}

      {/* Naya Room Form */}
      {tab === 'new' && (
        <form onSubmit={handleCreateRoom} className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex flex-col gap-4">
          <h2 className="font-headline text-lg font-bold text-ink">Naya Room aur Beds Banao</h2>

          <label className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">Block (Building / Wing)</span>
            <select
              value={newRoom.blockId}
              onChange={(e) => setNewRoom({ ...newRoom, blockId: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value="">Block chuno (Default: Main)</option>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
              <option value="NEW">➕ Naya Block banayein...</option>
            </select>
          </label>

          {newRoom.blockId === 'NEW' && (
            <label className="flex flex-col gap-1.5">
              <span className="font-label text-xs font-semibold text-ink-2">Naye Block ka Naam</span>
              <input
                placeholder="e.g. Tower C ya Boys Wing"
                value={newRoom.newBlockName}
                onChange={(e) => setNewRoom({ ...newRoom, newBlockName: e.target.value })}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-label text-xs font-semibold text-ink-2">Floor</span>
              <input
                type="number"
                min="0"
                max="50"
                value={newRoom.floor}
                onChange={(e) => setNewRoom({ ...newRoom, floor: e.target.value })}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-label text-xs font-semibold text-ink-2">Room Number</span>
              <input
                placeholder="e.g. 203"
                value={newRoom.number}
                onChange={(e) => setNewRoom({ ...newRoom, number: e.target.value })}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">Sharing Type (1 se 15 beds)</span>
            <select
              value={newRoom.sharingType}
              onChange={(e) => handleSharingChange(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            >
              {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => {
                const tier = sharingDefaults.find((d) => d.sharingType === n);
                return (
                  <option key={n} value={n}>
                    {n === 1 ? 'Single Room (1-Bed)' : `${n}-Sharing (${n} Beds)`} {tier ? `· Default: ${inr(tier.rent)}` : ''}
                  </option>
                );
              })}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-label text-xs font-semibold text-ink-2">Kiraya per Bed (₹/mo)</span>
              <input
                type="number"
                value={newRoom.rent}
                onChange={(e) => setNewRoom({ ...newRoom, rent: e.target.value })}
                placeholder="Auto-filled"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-label text-xs font-semibold text-ink-2">Initial Meter Reading</span>
              <input
                type="number"
                value={newRoom.initialReading}
                onChange={(e) => setNewRoom({ ...newRoom, initialReading: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </label>
          </div>

          <p className="font-body text-xs text-ink-2 mt-1">
            Room bante hi system automatically <b>{newRoom.sharingType} beds</b> ({newRoom.number || 'XXX'}-A, {newRoom.number || 'XXX'}-B...) generate kar dega.
          </p>

          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-on-primary font-label text-sm font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
          >
            {busy ? 'Ban raha hai...' : `Room ${newRoom.number || ''} aur ${newRoom.sharingType} Beds Banao`}
          </button>
        </form>
      )}
    </div>
  );
}

export function Settings() {
  const { data, error, reload } = useLoad(() => api('/owner/settings'));
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState({ text: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setF({
        name: data.name,
        ratePerUnit: data.ratePerUnit,
        dueDay: data.dueDay,
        contactPhone: data.contactPhone,
        sharingDefaults: data.sharingDefaults || [],
      });
    }
  }, [data]);

  if (error) return <ErrorBox text={error} />;
  if (!f) return <Loading />;

  const updateTier = (idx, field, val) => {
    const list = [...f.sharingDefaults];
    list[idx] = { ...list[idx], [field]: val };
    setF({ ...f, sharingDefaults: list });
  };

  const addTier = () => {
    const nextType = (f.sharingDefaults.reduce((max, d) => Math.max(max, d.sharingType), 0) || 0) + 1;
    if (nextType > 15) return;
    setF({
      ...f,
      sharingDefaults: [
        ...f.sharingDefaults,
        {
          sharingType: nextType,
          name: `${nextType}-Sharing`,
          rent: 5000,
          deposit: 10000,
          maintenance: 1000,
          bookingAmount: 1000,
        },
      ],
    });
  };

  const removeTier = (idx) => {
    const list = f.sharingDefaults.filter((_, i) => i !== idx);
    setF({ ...f, sharingDefaults: list });
  };

  const save = async () => {
    setBusy(true); setMsg({ text: '' });
    try {
      await api('/owner/settings', {
        method: 'PUT',
        body: {
          ...f,
          ratePerUnit: Number(f.ratePerUnit),
          dueDay: Number(f.dueDay),
          sharingDefaults: f.sharingDefaults,
        },
      });
      setMsg({ text: 'Settings aur Sharing Defaults save ho gaye ✓' });
      reload();
    } catch (e) {
      setMsg({ text: e.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-headline text-2xl font-bold text-ink">Settings</h1>
      </div>

      {/* General Settings Card */}
      <article className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex flex-col gap-4">
        <h2 className="font-title text-base font-bold text-ink">PG Ki General Settings</h2>

        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">PG ka naam</span>
            <input
              type="text"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">Bijli rate (₹/unit)</span>
            <input
              type="number"
              value={f.ratePerUnit}
              onChange={(e) => setF({ ...f, ratePerUnit: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">Kiraya due date (har mahine, 1–28)</span>
            <input
              type="number"
              value={f.dueDay}
              onChange={(e) => setF({ ...f, dueDay: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">Vacancy page par dikhne wala phone</span>
            <input
              type="tel"
              value={f.contactPhone}
              onChange={(e) => setF({ ...f, contactPhone: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </label>
        </div>
      </article>

      {/* Sharing Type Pricing Defaults Card */}
      <article className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-title text-base font-bold text-ink">Sharing Type Pricing Defaults</h2>
          <button
            type="button"
            onClick={addTier}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary-soft text-primary font-label text-xs font-bold hover:opacity-90 transition-opacity"
          >
            + Naya Tier
          </button>
        </div>

        <p className="font-body text-xs text-ink-2">
          Jab bhi naya tenant onboard hoga ya naya room banega, ye rates automatically pre-fill honge.
        </p>

        <div className="flex flex-col gap-3">
          {f.sharingDefaults.map((d, idx) => (
            <div key={d.sharingType || idx} className="border border-line rounded-xl p-3.5 bg-surface flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-title text-sm font-bold text-ink">
                  {d.sharingType === 1 ? 'Single Room (1-Bed)' : `${d.sharingType}-Sharing`}
                </h3>
                {f.sharingDefaults.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTier(idx)}
                    className="px-2.5 py-1 rounded-full bg-danger-soft text-on-danger-soft font-label text-xs font-semibold"
                  >
                    Hatao
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="font-label text-[11px] font-semibold text-ink-2">Kiraya (Rent ₹/mo)</span>
                  <input
                    type="number"
                    value={d.rent}
                    onChange={(e) => updateTier(idx, 'rent', Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-label text-[11px] font-semibold text-ink-2">Deposit (₹)</span>
                  <input
                    type="number"
                    value={d.deposit}
                    onChange={(e) => updateTier(idx, 'deposit', Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-label text-[11px] font-semibold text-ink-2">Maintenance (₹)</span>
                  <input
                    type="number"
                    value={d.maintenance}
                    onChange={(e) => updateTier(idx, 'maintenance', Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-label text-[11px] font-semibold text-ink-2">Booking Amount (₹)</span>
                  <input
                    type="number"
                    value={d.bookingAmount}
                    onChange={(e) => updateTier(idx, 'bookingAmount', Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </article>

      {msg.text && (
        <p className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${msg.bad ? 'bg-danger-soft text-on-danger-soft' : 'bg-success-soft text-on-success-soft'}`}>
          {msg.text}
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={save}
        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-on-primary font-label text-sm font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
      >
        {busy ? 'Save ho raha hai...' : 'Save karo'}
      </button>

      <p className="text-center font-body text-xs text-ink-2">
        Naya rate sirf aage ki readings par lagta hai. Due date naye mahine par lagti hai.
      </p>
    </div>
  );
}
