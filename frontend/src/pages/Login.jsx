import { useState } from 'react';
import { api, setToken } from '../api.js';

export default function Login({ onLogin }) {
  const [role, setRole] = useState('tenant');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('phone');
  const [otpLength, setOtpLength] = useState(6);
  const [hint, setHint] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const sendOtp = () => run(async () => {
    const r = await api('/auth/request-otp', { method: 'POST', body: { phone } });
    setOtpLength(r.otpLength);
    if (r.devOtp) {
      setHint(r.devOtp);
      setOtp(r.devOtp); // pre-fill dev OTP for instant 1-tap testing
    }
    setStep('otp');
  });
  const verify = () => run(async () => {
    const r = await api('/auth/verify', { method: 'POST', body: { phone, otp, role } });
    setToken(r.token);
    await onLogin();
  });

  return (
    <main className="min-h-screen bg-surface-2 flex items-center justify-center p-4">
      <section className="w-full max-w-md bg-surface border border-line rounded-2xl p-7 shadow-sm flex flex-col gap-6">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary text-on-primary flex items-center justify-center shadow-sm">
            <span className="material-symbols-outlined text-[28px]">bed</span>
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="font-headline text-2xl font-bold text-ink">PG Management</h1>
            <p className="font-body text-sm text-ink-2">Sign in with mobile number</p>
          </div>
        </div>

        {/* Role Selector */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-2 border border-line" role="tablist">
          {[
            { id: 'tenant', label: 'Tenant' },
            { id: 'manager', label: 'Manager' },
            { id: 'malik', label: 'Owner' },
          ].map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={step === 'otp'}
              onClick={() => {
                setRole(r.id);
                // Pre-fill demo numbers for convenience
                if (!phone || ['9000000001', '9000000002', '9000000011'].includes(phone)) {
                  setPhone(r.id === 'malik' ? '9000000001' : r.id === 'manager' ? '9000000002' : '9000000011');
                }
              }}
              className={`py-2 px-3 rounded-lg font-label text-sm font-semibold transition-all ${
                role === r.id
                  ? 'bg-surface text-primary shadow-sm'
                  : 'text-ink-2 hover:text-ink'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); step === 'phone' ? sendOtp() : verify(); }}>
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-xs font-semibold text-ink-2">Mobile Number</span>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="98XXXXXXXX"
              maxLength={14}
              value={phone}
              disabled={step === 'otp'}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-body text-base placeholder:text-ink-2 tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </label>

          {step === 'otp' && (
            <div className="flex flex-col gap-1.5">
              <label className="flex flex-col gap-1.5">
                <span className="font-label text-xs font-semibold text-ink-2">One-Time Password (OTP)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={otpLength}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  placeholder="Enter 6-digit OTP"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-title text-xl text-center tracking-widest tabular-nums focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                />
              </label>
              {hint && (
                <div className="flex items-center justify-between text-xs text-primary bg-primary-soft px-3 py-1.5 rounded-lg mt-1 font-semibold">
                  <span>Demo Mode OTP: <b>{hint}</b></span>
                  <button type="button" onClick={() => setOtp(hint)} className="underline">Auto-fill</button>
                </div>
              )}
            </div>
          )}

          {err && (
            <p className="rounded-xl px-3.5 py-2 text-xs font-semibold bg-danger-soft text-on-danger-soft">
              {err}
            </p>
          )}

          <div className="flex flex-col gap-2.5 pt-2">
            {step === 'phone' ? (
              <button
                type="submit"
                disabled={busy || phone.replace(/\D/g, '').length < 10}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-on-primary font-label text-sm font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
              >
                {busy ? 'Sending OTP...' : 'Send OTP'}
              </button>
            ) : (
              <>
                <button
                  type="submit"
                  disabled={busy || otp.length !== otpLength}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-on-primary font-label text-sm font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
                >
                  {busy ? 'Verifying...' : 'Sign In'}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep('phone'); setOtp(''); setErr(''); }}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-surface text-ink border border-line font-label text-sm font-semibold hover:bg-surface-2 transition-colors"
                >
                  Change Mobile Number
                </button>
              </>
            )}
          </div>
        </form>

        <p className="text-center font-body text-xs text-ink-2">
          Demo Accounts: Owner <code>9000000001</code> · Manager <code>9000000002</code> · Tenant <code>9000000011</code>
        </p>
      </section>
    </main>
  );
}
