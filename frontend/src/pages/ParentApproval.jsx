import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, Loading, fmtDate } from '../components.jsx';

export default function ParentApproval() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', bad: false });

  useEffect(() => {
    api(`/public/leave-approval/${token}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAction = async (action) => {
    setBusy(true);
    setMsg({ text: '', bad: false });
    try {
      const res = await api(`/public/leave-approval/${token}/action`, {
        method: 'POST',
        body: { action, remarks },
      });
      setData({ ...data, parentStatus: res.status, parentRemarks: remarks, parentActionAt: new Date() });
      setMsg({
        text: action === 'approved' ? '✓ Leave successfully approved!' : 'Leave request has been rejected.',
        bad: action === 'rejected',
      });
    } catch (e) {
      setMsg({ text: e.message, bad: true });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-2 flex items-center justify-center p-4">
        <Loading />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-surface-2 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-surface p-6 rounded-2xl border border-line text-center flex flex-col gap-3">
          <span className="material-symbols-outlined text-danger text-[40px] mx-auto">error</span>
          <h2 className="text-lg font-bold text-ink">Link Expired or Invalid</h2>
          <p className="text-xs text-ink-2">{error || 'Leave request record not found.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-2 flex flex-col justify-between text-ink p-4 sm:p-6">
      <div className="w-full max-w-md mx-auto flex flex-col gap-5 pb-16">
        {/* Header */}
        <header className="bg-surface p-5 rounded-2xl border border-line shadow-sm flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-primary-soft text-primary flex items-center justify-center font-bold text-xl shrink-0">
            👨‍👩‍👦
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary">{data.pg}</span>
            <h1 className="text-base font-bold text-ink">Parent Leave Approval</h1>
            <p className="text-xs text-ink-2">Approval request for student night-out / leave</p>
          </div>
        </header>

        {/* Leave Details Card */}
        <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <span className="text-[11px] text-ink-2">Student Name:</span>
              <h2 className="text-lg font-bold text-ink">{data.wardName}</h2>
              <span className="text-xs text-ink-2">Room {data.room} (Bed {data.bed})</span>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              data.parentStatus === 'approved'
                ? 'bg-success-soft text-on-success-soft'
                : data.parentStatus === 'rejected'
                ? 'bg-danger-soft text-on-danger-soft'
                : 'bg-warning-soft text-on-warning-soft'
            }`}>
              {data.parentStatus === 'approved' ? 'Approved ✓' : data.parentStatus === 'rejected' ? 'Rejected ✕' : 'Pending ⏳'}
            </span>
          </div>

          <div className="bg-surface-2 rounded-xl p-3.5 flex flex-col gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-ink-2">Leave From:</span>
              <b className="text-ink tabular-nums">{fmtDate(data.startDate)}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-2">Expected Return:</span>
              <b className="text-ink tabular-nums">{fmtDate(data.endDate)}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-2">Destination:</span>
              <b className="text-ink">{data.destination || 'Home'}</b>
            </div>
            <div className="flex justify-between border-t border-line/60 pt-2">
              <span className="text-ink-2">Reason:</span>
              <b className="text-ink">{data.reason}</b>
            </div>
          </div>

          {msg.text && (
            <p className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${msg.bad ? 'bg-danger-soft text-on-danger-soft' : 'bg-success-soft text-on-success-soft'}`}>
              {msg.text}
            </p>
          )}

          {data.parentStatus === 'pending' ? (
            <div className="flex flex-col gap-3 pt-1">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-ink-2">Your Note / Remarks (Optional)</span>
                <input
                  type="text"
                  placeholder="e.g. Approved, coming home"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-line text-xs focus:border-primary focus:outline-none"
                />
              </label>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleAction('approved')}
                  className="py-3 px-4 rounded-full bg-success text-on-primary font-bold text-xs shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">check</span>
                  <span>Approve Leave</span>
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleAction('rejected')}
                  className="py-3 px-4 rounded-full bg-surface text-danger border border-line font-bold text-xs hover:bg-danger-soft transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                  <span>Reject Leave</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl p-3.5 bg-surface-2 border border-line text-center text-xs text-ink-2 flex flex-col gap-1">
              <span>Your decision has been recorded:</span>
              <b className={data.parentStatus === 'approved' ? 'text-success' : 'text-danger'}>
                {data.parentStatus === 'approved' ? '✓ Leave Approved' : '✕ Leave Rejected'}
              </b>
              {data.parentRemarks && <span>"{data.parentRemarks}"</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
