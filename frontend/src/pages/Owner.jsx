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
      setMsg({ text: `${r.sent} payment reminder(s) sent ✓` });
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
        <h1 className="font-headline text-2xl font-bold text-ink">Financial Overview</h1>
        <p className="font-body text-sm text-ink-2 tabular-nums">
          {monthName(month)} · {data.beds.occupied} / {data.beds.total} beds occupied
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
        <span className="text-xs font-semibold uppercase tracking-wider opacity-90">Collected This Month</span>
        <div className="font-display text-4xl font-bold tabular-nums">
          {inr(data.collected)}
        </div>
        <p className="font-body text-sm text-on-primary/90 tabular-nums">
          Pending {inr(data.pending)} · {data.pendingPeople} tenants pending
        </p>
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowDeposits(!showDeposits)}
            className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-surface/20 text-on-primary font-label text-xs font-semibold hover:bg-surface/30 transition-colors"
          >
            Deposits Held {inr(data.deposits)} {showDeposits ? '▴' : '▾'}
          </button>
        </div>
      </section>

      {/* Deposit Dropdown */}
      {showDeposits && deposits.data && (
        <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col gap-2">
          <h3 className="font-title text-sm font-bold text-ink mb-1">Tenant Security Deposits</h3>
          {deposits.data.map((d) => (
            <div key={d.id} className="flex justify-between items-center py-2 border-t border-line first:border-0 text-sm">
              <div>
                <b>{d.name}</b>
                <span className="block text-xs text-ink-2">Room {d.room} · Since {fmtDate(d.since)}</span>
              </div>
              <b className="font-semibold tabular-nums">{inr(d.deposit)}</b>
            </div>
          ))}
        </div>
      )}

      {/* Late Rent Section */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <h2 className="font-headline text-lg font-bold text-ink">Overdue Rent</h2>
        {data.overdue.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => remind()}
            className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-surface border border-line text-primary font-label text-xs font-bold hover:bg-primary-soft transition-colors"
          >
            Remind All
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
          No overdue rent! All monthly dues are clear ✓
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
                    {o.daysLate} days late {o.reminderSentAt ? '· Reminder Sent ✓' : ''}
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
                    <span>Collect</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remind(o.paymentId)}
                    className="px-3 py-1 rounded-full bg-surface border border-line text-primary font-label text-xs font-semibold hover:bg-primary-soft transition-colors"
                  >
                    Remind
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
            setMsg({ text: 'Payment recorded successfully ✓' });
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

const FLOOR_NAMES = [
  'Ground Floor',
  'First Floor',
  'Second Floor',
  'Third Floor',
  'Fourth Floor',
  'Fifth Floor',
  'Sixth Floor',
  'Seventh Floor',
  'Eighth Floor',
  'Ninth Floor',
  'Tenth Floor',
  'Eleventh Floor',
  'Twelfth Floor',
  'Thirteenth Floor',
  'Fourteenth Floor',
  'Fifteenth Floor',
  'Sixteenth Floor',
  'Seventeenth Floor',
  'Eighteenth Floor',
  'Nineteenth Floor',
  'Twentieth Floor',
];

function getFloorLabel(i) {
  if (i === 0) return 'Ground Floor';
  if (i < FLOOR_NAMES.length) return FLOOR_NAMES[i];
  return `Floor ${i}`;
}

function getSampleRoom(prefix, floor, idx) {
  const p = (prefix || '').trim();
  const pad = String(idx).padStart(2, '0');
  if (floor === 0) return `${p}0${pad}`;
  return `${p}${floor}${pad}`;
}

export function BulkBlockModal({ isOpen, onClose, onSuccess, sharingDefaults = [] }) {
  if (!isOpen) return null;

  const [blockName, setBlockName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [prefixEdited, setPrefixEdited] = useState(false);
  const [numFloors, setNumFloors] = useState(4);
  const [groundRooms, setGroundRooms] = useState(8);
  const [defaultBeds, setDefaultBeds] = useState(2);
  const [bedRent, setBedRent] = useState(7500);
  const [initialReading, setInitialReading] = useState(0);
  const [sameForAll, setSameForAll] = useState(true);
  const [floors, setFloors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Auto-fill rent from sharingDefaults
  useEffect(() => {
    const tier = sharingDefaults.find((d) => d.sharingType === Number(defaultBeds));
    if (tier?.rent) {
      setBedRent(tier.rent);
    } else {
      setBedRent(defaultBeds === 1 ? 12000 : defaultBeds === 2 ? 7500 : defaultBeds === 3 ? 6000 : 5000);
    }
  }, [defaultBeds, sharingDefaults]);

  // Derive room prefix from block name
  useEffect(() => {
    if (!prefixEdited) {
      const clean = blockName.trim().replace(/^Block\s+/i, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
      setPrefix(clean || (blockName ? blockName.slice(0, 1).toUpperCase() : 'A'));
    }
  }, [blockName, prefixEdited]);

  // Sync floors whenever numFloors, groundRooms, or sameForAll changes
  useEffect(() => {
    const count = Math.max(1, Math.min(20, Number(numFloors) || 1));
    const gRooms = Math.max(1, Math.min(100, Number(groundRooms) || 1));

    setFloors((prev) => {
      const next = [];
      for (let i = 0; i < count; i++) {
        const existing = prev.find((f) => f.floor === i);
        let roomsCount;
        if (i === 0) {
          roomsCount = gRooms;
        } else if (sameForAll) {
          roomsCount = gRooms;
        } else if (existing && existing.customized) {
          roomsCount = existing.rooms;
        } else {
          roomsCount = gRooms;
        }

        next.push({
          floor: i,
          name: getFloorLabel(i),
          rooms: roomsCount,
          customized: existing ? existing.customized && !sameForAll : false,
        });
      }
      return next;
    });
  }, [numFloors, groundRooms, sameForAll]);

  const handleFloorRoomChange = (floorIdx, val) => {
    const parsed = parseInt(val, 10);
    const rooms = isNaN(parsed) ? '' : Math.max(1, Math.min(100, parsed));
    setFloors((prev) =>
      prev.map((f) => {
        if (f.floor === floorIdx) {
          return { ...f, rooms, customized: true };
        }
        return f;
      })
    );
    if (sameForAll) {
      setSameForAll(false);
    }
  };

  const handleGroundRoomsChange = (val) => {
    const parsed = parseInt(val, 10);
    const num = isNaN(parsed) ? '' : Math.max(1, Math.min(100, parsed));
    setGroundRooms(num);
  };

  const handleNumFloorsChange = (val) => {
    const parsed = parseInt(val, 10);
    const num = isNaN(parsed) ? '' : Math.max(1, Math.min(20, parsed));
    setNumFloors(num);
  };

  const totalRooms = floors.reduce((s, f) => s + (Number(f.rooms) || 0), 0);
  const totalBeds = totalRooms * Number(defaultBeds || 1);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!blockName.trim()) {
      setError('Please enter a Block Name (e.g. "A" or "Tower 1")');
      return;
    }
    if (floors.some((f) => !f.rooms || Number(f.rooms) < 1)) {
      setError('All floors must have at least 1 room');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await api('/owner/blocks/bulk', {
        method: 'POST',
        body: {
          name: blockName.trim(),
          prefix: (prefix || 'A').trim().toUpperCase(),
          defaultBeds: Number(defaultBeds),
          bedRent: Number(bedRent),
          initialReading: Number(initialReading || 0),
          floors: floors.map((f) => ({
            floor: f.floor,
            rooms: Number(f.rooms),
          })),
        },
      });
      onSuccess?.({
        message: `Block "${res.block?.name}" generated successfully with ${res.stats?.floors} floors, ${res.stats?.rooms} rooms, and ${res.stats?.beds} beds ✓`,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div
        className="w-full max-w-2xl bg-surface rounded-3xl shadow-2xl border border-line flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface-2/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-soft text-primary flex items-center justify-center font-bold text-lg shrink-0">
              <span className="material-symbols-outlined text-[24px]">domain_add</span>
            </div>
            <div>
              <h2 className="font-headline text-lg font-bold text-ink">Smart Bulk Block Creation</h2>
              <p className="font-body text-xs text-ink-2">Generate an entire building block with floors, rooms & beds in one click</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          {/* Section 1: Basic Details */}
          <div className="flex flex-col gap-3">
            <span className="font-label text-xs uppercase tracking-wider font-bold text-primary">
              1. Basic Block Details
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <label className="flex flex-col gap-1.5">
                <span className="font-label text-xs font-semibold text-ink-2">
                  Block Name <b className="text-danger">*</b>
                </span>
                <input
                  type="text"
                  required
                  placeholder="e.g. A, Block B, North Wing"
                  value={blockName}
                  onChange={(e) => setBlockName(e.target.value)}
                  className="px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-label text-xs font-semibold text-ink-2">
                  Room Prefix (Auto-derived)
                </span>
                <input
                  type="text"
                  required
                  placeholder="e.g. A"
                  value={prefix}
                  onChange={(e) => {
                    setPrefix(e.target.value.toUpperCase());
                    setPrefixEdited(true);
                  }}
                  className="px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm font-mono uppercase focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-label text-xs font-semibold text-ink-2">
                  Number of Floors <b className="text-danger">*</b>
                </span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  required
                  value={numFloors}
                  onChange={(e) => handleNumFloorsChange(e.target.value)}
                  className="px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                />
                <span className="text-[11px] text-ink-2">Ground + {Math.max(0, numFloors - 1)} upper floor(s)</span>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-label text-xs font-semibold text-ink-2">
                  Ground Floor Rooms <b className="text-danger">*</b>
                </span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  required
                  value={groundRooms}
                  onChange={(e) => handleGroundRoomsChange(e.target.value)}
                  className="px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                />
                <span className="text-[11px] text-ink-2">Default room count for all floors</span>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-label text-xs font-semibold text-ink-2">
                  Default Beds per Room <b className="text-danger">*</b>
                </span>
                <select
                  value={defaultBeds}
                  onChange={(e) => setDefaultBeds(Number(e.target.value))}
                  className="px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  <option value={1}>Single Room (1 Bed)</option>
                  <option value={2}>2-Sharing (2 Beds)</option>
                  <option value={3}>3-Sharing (3 Beds)</option>
                  <option value={4}>4-Sharing (4 Beds)</option>
                  <option value={5}>5-Sharing (5 Beds)</option>
                  <option value={6}>6-Sharing (6 Beds)</option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-label text-xs font-semibold text-ink-2">
                  Default Rent / Bed (₹/mo)
                </span>
                <input
                  type="number"
                  min="0"
                  value={bedRent}
                  onChange={(e) => setBedRent(Number(e.target.value) || 0)}
                  className="px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </label>
            </div>
          </div>

          {/* Section 2: Automatic Floor Configuration */}
          <div className="flex flex-col gap-3 pt-2 border-t border-line">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-label text-xs uppercase tracking-wider font-bold text-primary">
                2. Automatic Floor Configuration
              </span>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sameForAll}
                  onChange={(e) => setSameForAll(e.target.checked)}
                  className="w-4 h-4 rounded text-primary border-line focus:ring-primary"
                />
                <span className="text-xs font-semibold text-ink">Use same room count for all floors</span>
              </label>
            </div>

            {/* Inline Floors Table */}
            <div className="border border-line rounded-2xl overflow-hidden bg-surface shadow-xs">
              <div className="grid grid-cols-12 bg-surface-2 px-4 py-2.5 text-[11px] font-bold text-ink-2 border-b border-line">
                <span className="col-span-4">Floor</span>
                <span className="col-span-3 text-center">Rooms</span>
                <span className="col-span-2 text-center">Beds</span>
                <span className="col-span-3 text-right">Sample Numbers</span>
              </div>

              <div className="divide-y divide-line/60">
                {floors.map((fl) => {
                  const roomsCount = Number(fl.rooms) || 0;
                  const bedsOnFloor = roomsCount * defaultBeds;
                  const sampleRange = roomsCount > 0
                    ? `${getSampleRoom(prefix, fl.floor, 1)}–${getSampleRoom(prefix, fl.floor, roomsCount)}`
                    : '—';

                  return (
                    <div
                      key={fl.floor}
                      className={`grid grid-cols-12 items-center px-4 py-2.5 text-xs transition-colors ${
                        fl.customized ? 'bg-primary-soft/20' : 'hover:bg-surface-2/40'
                      }`}
                    >
                      <div className="col-span-4 flex items-center gap-1.5">
                        <span className="font-bold text-ink">{fl.name}</span>
                        {fl.customized && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-primary-soft text-primary">
                            custom
                          </span>
                        )}
                      </div>

                      <div className="col-span-3 flex justify-center">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          required
                          value={fl.rooms}
                          onChange={(e) =>
                            fl.floor === 0
                              ? handleGroundRoomsChange(e.target.value)
                              : handleFloorRoomChange(fl.floor, e.target.value)
                          }
                          className="w-20 px-2.5 py-1 text-center font-bold rounded-lg border border-line bg-surface text-ink tabular-nums text-xs focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                      </div>

                      <div className="col-span-2 text-center tabular-nums text-ink-2 font-medium">
                        {bedsOnFloor}
                      </div>

                      <div className="col-span-3 text-right font-mono text-[11px] text-ink-2 font-semibold">
                        {sampleRange}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 3: Live Summary and Preview */}
          <div className="bg-primary-soft/30 border border-primary/20 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px]">analytics</span>
                <span>Live Block Generation Summary</span>
              </span>
              <span className="text-xs font-semibold text-ink-2">
                Potential: <b className="text-primary tabular-nums">{inr(totalBeds * bedRent)}/mo</b>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-surface rounded-xl p-2.5 border border-line flex flex-col text-center">
                <span className="text-[10px] text-ink-2 uppercase font-semibold">Block</span>
                <b className="text-sm font-bold text-ink truncate">{blockName || 'A'}</b>
              </div>
              <div className="bg-surface rounded-xl p-2.5 border border-line flex flex-col text-center">
                <span className="text-[10px] text-ink-2 uppercase font-semibold">Floors</span>
                <b className="text-sm font-bold text-ink tabular-nums">{floors.length}</b>
              </div>
              <div className="bg-surface rounded-xl p-2.5 border border-line flex flex-col text-center">
                <span className="text-[10px] text-ink-2 uppercase font-semibold">Rooms</span>
                <b className="text-sm font-bold text-primary tabular-nums">{totalRooms}</b>
              </div>
              <div className="bg-surface rounded-xl p-2.5 border border-line flex flex-col text-center">
                <span className="text-[10px] text-ink-2 uppercase font-semibold">Total Beds</span>
                <b className="text-sm font-bold text-success tabular-nums">{totalBeds}</b>
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-xl px-4 py-2.5 text-xs font-semibold bg-danger-soft text-on-danger-soft">
              {error}
            </p>
          )}

          {/* Footer Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 px-5 py-3 rounded-full bg-surface text-ink border border-line font-label text-sm font-semibold hover:bg-surface-2 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={busy || !blockName.trim() || totalRooms === 0}
              className="flex-2 w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-on-primary font-label text-sm font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
              <span>
                {busy ? 'Generating Block...' : `Generate Block (${totalRooms} Rooms · ${totalBeds} Beds)`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function EditRoomModal({ room, blocks = [], isOpen, onClose, onSuccess }) {
  if (!isOpen || !room) return null;

  const [roomNumber, setRoomNumber] = useState(room.number || '');
  const [floor, setFloor] = useState(room.floor ?? 0);
  const [blockId, setBlockId] = useState(room.blockId || (blocks[0]?.id ?? ''));
  const [initialReading, setInitialReading] = useState(room.initialReading || 0);
  const [beds, setBeds] = useState(
    () => (room.beds || []).map((b) => ({
      id: b.id,
      label: b.label || '',
      rent: b.rent || 7500,
      status: b.status || 'vacant',
      tenant: b.tenant || null,
      notice: b.notice || null,
      isNew: false,
    }))
  );
  const [bulkRent, setBulkRent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Bulk apply rent to all vacant beds
  const handleApplyBulkRent = () => {
    const val = Number(bulkRent);
    if (!val || val < 0) return;
    setBeds((prev) =>
      prev.map((b) => (b.status === 'vacant' ? { ...b, rent: val } : b))
    );
  };

  const handleBedChange = (idx, field, val) => {
    setBeds((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  const handleAddBed = () => {
    const nextNum = beds.length + 1;
    const defaultRent = Number(bulkRent) || (beds[0]?.rent ?? 7500);
    setBeds((prev) => [
      ...prev,
      {
        id: `temp_${Date.now()}_${Math.random()}`,
        label: `${roomNumber || room.number}-${nextNum}`,
        rent: defaultRent,
        status: 'vacant',
        tenant: null,
        notice: null,
        isNew: true,
      },
    ]);
  };

  const handleRemoveBed = (idx) => {
    const bed = beds[idx];
    if (bed.status !== 'vacant') {
      setError(`Cannot remove bed "${bed.label}" because it is currently occupied.`);
      return;
    }
    setBeds((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!roomNumber.trim()) {
      setError('Room number is required');
      return;
    }
    if (beds.length === 0) {
      setError('A room must have at least 1 bed');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const payload = {
        number: roomNumber.trim(),
        floor: Number(floor ?? 0),
        blockId: blockId || undefined,
        initialReading: Number(initialReading || 0),
        beds: beds.map((b) => ({
          id: b.isNew ? undefined : b.id,
          label: String(b.label || '').trim(),
          rent: Number(b.rent || 0),
          isNew: b.isNew,
        })),
      };

      await api(`/owner/rooms/${room.id}`, {
        method: 'PUT',
        body: payload,
      });

      onSuccess?.(`Room ${roomNumber.trim()} and its beds updated successfully ✓`);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update room');
    } finally {
      setBusy(false);
    }
  };

  const totalRentPotential = beds.reduce((s, b) => s + (Number(b.rent) || 0), 0);
  const vacantCount = beds.filter((b) => b.status === 'vacant').length;
  const occupiedCount = beds.length - vacantCount;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div
        className="w-full max-w-2xl bg-surface rounded-3xl shadow-2xl border border-line flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface-2/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-soft text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">meeting_room</span>
            </div>
            <div>
              <h2 className="font-title text-base font-bold text-ink">Edit Room {room.number}</h2>
              <p className="font-body text-xs text-ink-2">
                {room.blockName || 'Building Wing'} · Floor {room.floor} · {beds.length}-Sharing ({beds.length} Beds)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-ink-2 hover:text-ink text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 sm:p-6 flex flex-col gap-5">
          {error && (
            <div className="p-3.5 rounded-2xl bg-danger-soft text-on-danger-soft text-xs font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Room Details */}
          <div className="flex flex-col gap-3">
            <span className="font-label text-xs font-bold text-primary uppercase tracking-wider">
              1. Room Details
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="flex flex-col gap-1 col-span-1">
                <span className="font-label text-xs font-semibold text-ink-2">Room Number</span>
                <input
                  type="text"
                  required
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  className="px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-bold text-sm focus:border-primary focus:outline-none"
                  placeholder="e.g. A001"
                />
              </label>

              <label className="flex flex-col gap-1 col-span-1">
                <span className="font-label text-xs font-semibold text-ink-2">Floor</span>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                  className="px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-semibold text-sm focus:border-primary focus:outline-none"
                />
              </label>

              {blocks.length > 1 && (
                <label className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                  <span className="font-label text-xs font-semibold text-ink-2">Block</span>
                  <select
                    value={blockId}
                    onChange={(e) => setBlockId(e.target.value)}
                    className="px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-semibold text-sm focus:border-primary focus:outline-none"
                  >
                    {blocks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                <span className="font-label text-xs font-semibold text-ink-2">Meter Reading</span>
                <input
                  type="number"
                  min="0"
                  value={initialReading}
                  onChange={(e) => setInitialReading(e.target.value)}
                  className="px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-semibold text-sm focus:border-primary focus:outline-none"
                />
              </label>
            </div>
          </div>

          {/* Section 2: Beds & Rent */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-label text-xs font-bold text-primary uppercase tracking-wider">
                2. Beds & Monthly Rent ({beds.length} Total)
              </span>
              <button
                type="button"
                onClick={handleAddBed}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary-soft text-primary hover:opacity-90 font-label text-xs font-bold transition-opacity"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>+ Add Bed</span>
              </button>
            </div>

            {/* Quick Bulk Rent Tool */}
            <div className="p-3 rounded-2xl bg-surface-2 border border-line flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-ink-2">
                <span className="material-symbols-outlined text-[16px] text-primary">sell</span>
                <span>Set rent for all vacant beds:</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-2">₹</span>
                  <input
                    type="number"
                    placeholder="e.g. 15000"
                    value={bulkRent}
                    onChange={(e) => setBulkRent(e.target.value)}
                    className="w-28 pl-6 pr-2.5 py-1.5 rounded-xl bg-surface border border-line text-xs font-bold text-ink focus:border-primary focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApplyBulkRent}
                  className="px-3 py-1.5 rounded-xl bg-primary text-on-primary font-label text-xs font-bold hover:opacity-95"
                >
                  Apply
                </button>
              </div>
            </div>

            {/* Beds List */}
            <div className="flex flex-col gap-2">
              {beds.map((b, idx) => {
                const isVacant = b.status === 'vacant';
                return (
                  <div
                    key={b.id || idx}
                    className="p-3 rounded-2xl bg-surface border border-line flex items-center justify-between gap-3 flex-wrap"
                  >
                    {/* Bed identifier & status */}
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <span className="w-7 h-7 rounded-lg bg-surface-2 font-bold text-xs flex items-center justify-center text-ink shrink-0">
                        {idx + 1}
                      </span>
                      <div className="flex flex-col">
                        <input
                          type="text"
                          value={b.label}
                          onChange={(e) => handleBedChange(idx, 'label', e.target.value)}
                          placeholder="Bed Label"
                          className="font-bold text-xs text-ink bg-transparent border-b border-dashed border-line focus:border-primary focus:outline-none py-0.5 max-w-[110px]"
                        />
                        <span
                          className={`text-[10px] font-semibold ${
                            isVacant
                              ? 'text-success'
                              : b.status === 'notice'
                              ? 'text-warning'
                              : 'text-primary'
                          }`}
                        >
                          {isVacant
                            ? '● Vacant'
                            : b.status === 'notice'
                            ? `● Notice (${b.tenant || 'Tenant'})`
                            : `● ${b.tenant || 'Occupied'}`}
                        </span>
                      </div>
                    </div>

                    {/* Rent Input */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-ink-2">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={b.rent}
                        onChange={(e) => handleBedChange(idx, 'rent', e.target.value)}
                        className="w-28 px-2.5 py-1.5 rounded-xl bg-surface-2 border border-line text-xs font-bold text-ink tabular-nums focus:border-primary focus:outline-none"
                      />
                      <span className="text-[11px] text-ink-2">/mo</span>
                    </div>

                    {/* Bed Delete / Lock Action */}
                    <div>
                      {isVacant ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveBed(idx)}
                          className="w-7 h-7 rounded-full bg-danger-soft text-on-danger-soft hover:opacity-90 flex items-center justify-center transition-opacity"
                          title="Delete this bed"
                        >
                          <span className="material-symbols-outlined text-[15px]">delete</span>
                        </button>
                      ) : (
                        <span
                          className="w-7 h-7 rounded-full bg-surface-2 text-ink-2 flex items-center justify-center cursor-not-allowed"
                          title="Occupied bed cannot be deleted"
                        >
                          <span className="material-symbols-outlined text-[15px]">lock</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Summary Bar */}
          <div className="p-3.5 rounded-2xl bg-surface-2 border border-line flex items-center justify-between text-xs flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="font-bold text-ink">Capacity: {beds.length}-Sharing</span>
              <span className="text-success font-semibold">{vacantCount} Vacant</span>
              {occupiedCount > 0 && <span className="text-primary font-semibold">{occupiedCount} Occupied</span>}
            </div>
            <div className="font-bold text-ink">
              Potential: <span className="text-primary">{inr(totalRentPotential)}</span>/mo
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-5 py-2.5 rounded-full border border-line text-ink font-label text-xs font-semibold hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !roomNumber.trim() || beds.length === 0}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-primary text-on-primary font-label text-xs font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">save</span>
              <span>{busy ? 'Saving Changes...' : 'Save Room & Beds'}</span>
            </button>
          </div>
        </form>
      </div>
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
  const [addBlockOpen, setAddBlockOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);

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
    const text = `${bedsData.data?.counts.vacant || 0} vacant beds available. View here: ${link}`;
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
        if (!newRoom.newBlockName.trim()) throw new Error('Please enter new block name');
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
      setMsg({ text: `Room ${newRoom.number} and its ${newRoom.sharingType} beds created successfully ✓` });
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
    if (!window.confirm(`Delete Room ${roomNo} and its vacant beds?`)) return;
    try {
      await api(`/owner/rooms/${roomId}`, { method: 'DELETE' });
      setMsg({ text: `Room ${roomNo} deleted successfully ✓` });
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-headline text-2xl font-bold text-ink">Rooms & Beds Setup</h1>
          <p className="font-body text-sm text-ink-2">Hierarchy · Sharing types · Bed availability</p>
        </div>
        <button
          type="button"
          onClick={() => setAddBlockOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-primary text-on-primary font-label text-xs font-bold shadow-sm hover:opacity-95 transition-opacity shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">domain_add</span>
          <span>+ Add Block</span>
        </button>
      </div>

      {/* Stat Tiles */}
      <div className="grid grid-cols-3 gap-3 items-stretch">
        <div className="bg-surface border border-line rounded-xl p-4 shadow-sm flex flex-col items-center justify-center gap-1 h-full text-center">
          <span className="font-headline text-2xl font-bold text-ink tabular-nums">{counts.occupied}</span>
          <span className="font-body text-xs text-ink-2">Occupied</span>
        </div>
        <div className="bg-surface border border-line rounded-xl p-4 shadow-sm flex flex-col items-center justify-center gap-1 h-full text-center">
          <span className="font-headline text-2xl font-bold text-success tabular-nums">{counts.vacant}</span>
          <span className="font-body text-xs text-ink-2">Vacant</span>
        </div>
        <div className="bg-surface border border-line rounded-xl p-4 shadow-sm flex flex-col items-center justify-center gap-1 h-full text-center">
          <span className="font-headline text-2xl font-bold text-warning tabular-nums">{counts.notice}</span>
          <span className="font-body text-xs text-ink-2">On Notice</span>
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
          <span>New Room</span>
        </button>
      </div>

      {msg.text && (
        <p className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${msg.bad ? 'bg-danger-soft text-on-danger-soft' : 'bg-success-soft text-on-success-soft'}`}>
          {msg.text}
        </p>
      )}

      {/* Block Filter Chips */}
      {tab !== 'new' && (
        <div className="flex flex-wrap items-center gap-2">
          {blocks.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setBlockFilter('all')}
                className={`px-3.5 py-1.5 rounded-full font-label text-xs font-semibold transition-all ${
                  blockFilter === 'all'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface border border-line text-ink-2 hover:text-ink'
                }`}
              >
                All Blocks
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
            </>
          )}
          <button
            type="button"
            onClick={() => setAddBlockOpen(true)}
            className="px-3.5 py-1.5 rounded-full font-label text-xs font-semibold bg-primary-soft text-primary hover:opacity-90 inline-flex items-center gap-1 transition-opacity"
          >
            <span className="material-symbols-outlined text-[14px]">domain_add</span>
            <span>+ Add Block</span>
          </button>
        </div>
      )}

      {/* Hierarchy View */}
      {tab === 'hierarchy' && (
        <div className="flex flex-col gap-4">
          {filteredRooms.length === 0 && (
            <div className="bg-surface border border-line rounded-2xl p-8 text-center flex flex-col items-center gap-3">
              <span className="material-symbols-outlined text-ink-2 text-[44px]">domain_disabled</span>
              <div>
                <p className="font-bold text-ink text-sm">No rooms or blocks created yet</p>
                <p className="text-xs text-ink-2 mt-0.5">Use bulk block creation to generate an entire building in one click.</p>
              </div>
              <button
                type="button"
                onClick={() => setAddBlockOpen(true)}
                className="mt-1 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-primary text-on-primary font-label text-xs font-bold shadow-sm hover:opacity-95"
              >
                <span className="material-symbols-outlined text-[18px]">domain_add</span>
                <span>+ Add Block (Bulk Generate)</span>
              </button>
            </div>
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
                      <span className="block text-xs text-ink-2">{blk.description || 'Building Wing'}</span>
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
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-xs font-semibold tabular-nums ${rm.vacantBeds > 0 ? 'text-success' : 'text-ink-2'}`}>
                                    {rm.vacantBeds} / {rm.totalBeds} vacant
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setEditingRoom(rm)}
                                    className="px-2 py-0.5 rounded-full bg-primary-soft text-primary text-[10px] font-bold hover:opacity-90 inline-flex items-center gap-0.5 transition-opacity"
                                  >
                                    <span className="material-symbols-outlined text-[12px]">edit</span>
                                    <span>Edit</span>
                                  </button>
                                  {rm.vacantBeds === rm.totalBeds && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteRoom(rm.id, rm.number)}
                                      className="px-2 py-0.5 rounded-full bg-danger-soft text-on-danger-soft text-[10px] font-bold hover:opacity-90 transition-opacity"
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Beds list */}
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {rm.beds.map((b) => (
                                  <button
                                    key={b.id}
                                    type="button"
                                    onClick={() => setEditingRoom(rm)}
                                    title={b.notice ? `Notice: ${fmtDate(b.notice.vacatingDate)} (${b.notice.reason || 'Notice'}) - Click to edit` : 'Click to edit room & beds'}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all hover:scale-[1.02] cursor-pointer text-left ${
                                      b.status === 'vacant'
                                        ? 'bg-success-soft text-on-success-soft border-success/30 hover:border-success'
                                        : b.status === 'notice'
                                        ? 'bg-warning-soft text-on-warning-soft border-warning/30 hover:border-warning'
                                        : 'bg-surface-2 text-ink border-line hover:border-primary/50'
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
                                    <span className="material-symbols-outlined text-[12px] opacity-50">edit</span>
                                  </button>
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
                ? `Vacant · ${info.daysVacant} days · ${inr(info.rent)}/mo`
                : info.status === 'notice'
                ? `On Notice · ${info.tenant}`
                : `Occupied · ${info.tenant}`}
            </div>
          )}

          {counts.vacant > 0 && (
            <p className="rounded-xl p-3 text-xs font-semibold bg-success-soft text-on-success-soft text-center">
              🛏️ {counts.vacant} vacant beds · {inr(vacantRent)} / month potential rent
            </p>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={share}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-on-primary font-label text-sm font-bold shadow-sm hover:opacity-95 transition-opacity"
            >
              Share Vacant Beds Link
            </button>
            <a
              href="/vacancy"
              target="_blank"
              rel="noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-surface text-ink border border-line font-label text-sm font-semibold hover:bg-surface-2 transition-colors"
            >
              Open Public Vacancy Page
            </a>
          </div>
        </div>
      )}

      {/* New Room Form */}
      {tab === 'new' && (
        <form onSubmit={handleCreateRoom} className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex flex-col gap-4">
          <h2 className="font-headline text-lg font-bold text-ink">Create New Room & Beds</h2>

          <label className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">Block (Building / Wing)</span>
            <select
              value={newRoom.blockId}
              onChange={(e) => setNewRoom({ ...newRoom, blockId: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value="">Select Block (Default: Main)</option>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
              <option value="NEW">➕ Add New Block...</option>
            </select>
          </label>

          {newRoom.blockId === 'NEW' && (
            <label className="flex flex-col gap-1.5">
              <span className="font-label text-xs font-semibold text-ink-2">New Block Name</span>
              <input
                placeholder="e.g. Tower C or Boys Wing"
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
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:outline-none"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">Sharing Type (1 to 15 beds)</span>
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
              <span className="font-label text-xs font-semibold text-ink-2">Rent per Bed (₹/mo)</span>
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
            Upon creation, the system will automatically generate <b>{newRoom.sharingType} beds</b> ({newRoom.number || 'XXX'}-A, {newRoom.number || 'XXX'}-B...).
          </p>

          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-on-primary font-label text-sm font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
          >
            {busy ? 'Creating...' : `Create Room ${newRoom.number || ''} & ${newRoom.sharingType} Beds`}
          </button>
        </form>
      )}

      <BulkBlockModal
        isOpen={addBlockOpen}
        onClose={() => setAddBlockOpen(false)}
        onSuccess={(res) => {
          setMsg({ text: res.message });
          reloadAll();
        }}
        sharingDefaults={sharingDefaults}
      />

      <EditRoomModal
        room={editingRoom}
        blocks={blocks}
        isOpen={!!editingRoom}
        onClose={() => setEditingRoom(null)}
        onSuccess={(m) => {
          setMsg({ text: m });
          reloadAll();
        }}
      />
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
      setMsg({ text: 'Settings and sharing defaults saved successfully ✓' });
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
        <h2 className="font-title text-base font-bold text-ink">General PG Settings</h2>

        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">PG Name</span>
            <input
              type="text"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">Electricity Rate (₹/unit)</span>
            <input
              type="number"
              value={f.ratePerUnit}
              onChange={(e) => setF({ ...f, ratePerUnit: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">Rent Due Date (every month, 1–28)</span>
            <input
              type="number"
              value={f.dueDay}
              onChange={(e) => setF({ ...f, dueDay: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-sm tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">Contact Phone (shown on Vacancy page)</span>
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
            + Add Tier
          </button>
        </div>

        <p className="font-body text-xs text-ink-2">
          Whenever a new tenant is onboarded or a new room is created, these rates will pre-fill automatically.
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
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="font-label text-[11px] font-semibold text-ink-2">Rent (₹/mo)</span>
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
        {busy ? 'Saving...' : 'Save Settings'}
      </button>

      <p className="text-center font-body text-xs text-ink-2">
        New rates apply to future readings. Due day applies to subsequent months.
      </p>
    </div>
  );
}
