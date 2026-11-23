import { useState } from 'react';
import { api } from '../api.js';
import { ErrorBox, Loading, inr, useLoad } from '../components.jsx';

export default function Vacancy() {
  const { data, error } = useLoad(() => api('/public/vacancy'));
  const [filterBlock, setFilterBlock] = useState('all');

  if (error) return <div className="min-h-screen bg-surface-2 p-4 flex items-center justify-center"><ErrorBox text={error} /></div>;
  if (!data) return <Loading />;

  const wa = data.contactPhone && `https://wa.me/91${data.contactPhone}?text=${encodeURIComponent(`Namaste, ${data.pg} mein bed available hai kya?`)}`;
  const blocks = Array.from(new Set(data.beds.map((b) => b.block || 'Main Wing')));
  const filteredBeds = data.beds.filter((b) => filterBlock === 'all' || (b.block || 'Main Wing') === filterBlock);

  return (
    <div className="w-full max-w-xl mx-auto min-h-screen flex flex-col justify-between bg-surface-2 text-ink">
      <header className="sticky top-0 z-20 bg-surface-2/95 backdrop-blur border-b border-line px-5 py-3.5 flex items-center justify-between">
        <div>
          <span className="font-label text-xs font-semibold text-primary block">Khaali bed</span>
          <strong className="font-title text-base font-bold text-ink">{data.pg}</strong>
        </div>
        <a
          href="/login"
          className="inline-flex items-center justify-center px-4 py-1.5 rounded-full bg-surface text-ink border border-line text-xs font-semibold hover:bg-surface-2 transition-colors"
        >
          Staff / Tenant Login
        </a>
      </header>

      <main className="flex-1 px-4 py-5 flex flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-headline text-2xl font-bold text-ink">
            {data.beds.length ? `${data.beds.length} bed khaali hain` : 'Abhi koi bed khaali nahi'}
          </h1>
          <p className="font-body text-sm text-ink-2">Live occupancy · Direct owner booking</p>
        </div>

        {/* Block Filter Chips */}
        {blocks.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterBlock('all')}
              className={`px-3.5 py-1.5 rounded-full font-label text-xs font-semibold transition-all ${
                filterBlock === 'all'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface border border-line text-ink-2 hover:text-ink'
              }`}
            >
              Sabhi ({data.beds.length})
            </button>
            {blocks.map((blk) => (
              <button
                key={blk}
                type="button"
                onClick={() => setFilterBlock(blk)}
                className={`px-3.5 py-1.5 rounded-full font-label text-xs font-semibold transition-all ${
                  filterBlock === blk
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface border border-line text-ink-2 hover:text-ink'
                }`}
              >
                {blk} ({data.beds.filter((b) => (b.block || 'Main Wing') === blk).length})
              </button>
            ))}
          </div>
        )}

        {/* Bed Cards */}
        <div className="flex flex-col gap-2.5">
          {filteredBeds.map((b) => (
            <article key={b.label} className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <b className="text-base font-bold text-ink">Room {b.room} · Bed {b.label.split('-')[1]}</b>
                  <span className="px-2 py-0.5 rounded-full bg-primary-soft text-primary text-xs font-bold">
                    {b.sharingType === 1 ? 'Single Room' : `${b.sharingType}-Sharing`}
                  </span>
                </div>
                <small className="block text-xs text-ink-2 mt-0.5">
                  🏢 {b.block} · Floor {b.floor ?? '-'} {b.daysVacant ? `· ${b.daysVacant} din se available` : ''}
                </small>
              </div>
              <div className="flex flex-col items-end">
                <b className="text-base font-bold text-primary tabular-nums">{inr(b.rent)}</b>
                <small className="text-[11px] text-ink-2">/mahina</small>
              </div>
            </article>
          ))}
        </div>

        {/* CTA buttons */}
        <div className="flex flex-col gap-2.5 pt-2">
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-success text-on-primary font-label text-sm font-bold shadow-sm hover:opacity-95 transition-opacity"
            >
              💬 WhatsApp pe poocho
            </a>
          )}
          {data.contactPhone && (
            <a
              href={`tel:+91${data.contactPhone}`}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-surface text-ink border border-line font-label text-sm font-semibold hover:bg-surface-2 transition-colors"
            >
              📞 Seedha call karo (+91 {data.contactPhone})
            </a>
          )}
        </div>
      </main>

      <footer className="text-center py-4 text-xs text-ink-2 border-t border-line bg-surface">
        Aapka PG · Verified Hostel & PG Management System
      </footer>
    </div>
  );
}
