import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';
import { ErrorBox, FilePick, Loading, inr } from '../components.jsx';

export default function Onboard({ onLogin }) {
  const { token } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('form'); // 'form' | 'payment' | 'done'

  // Form State
  const [f, setF] = useState({
    aadhaarNumber: '',
    permanentAddress: '',
    collegeOrOffice: '',
    fatherName: '',
    fatherPhone: '',
    motherName: '',
    motherPhone: '',
    idProof: '',
    photo: '',
  });

  // Payment State
  const [payData, setPayData] = useState(null);
  const [isFullPayment, setIsFullPayment] = useState(false);
  const [customAmount, setCustomAmount] = useState('2000');
  const [paymentMethod, setPaymentMethod] = useState('upi');

  useEffect(() => {
    api(`/public/onboard/${token}`)
      .then((res) => {
        setData(res);
        setF({
          aadhaarNumber: res.aadhaarNumber || '',
          permanentAddress: res.permanentAddress || '',
          collegeOrOffice: res.collegeOrOffice || '',
          fatherName: res.parent?.fatherName || '',
          fatherPhone: res.parent?.fatherPhone || '',
          motherName: res.parent?.motherName || '',
          motherPhone: res.parent?.motherPhone || '',
          idProof: res.docs?.idProof || '',
          photo: res.docs?.photo || '',
        });
        setCustomAmount(String(res.bookingAmount || 2000));
        if (res.status === 'active') {
          setStep('done');
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const submitForm = async (e) => {
    e.preventDefault();
    if (!f.aadhaarNumber.trim() || f.aadhaarNumber.replace(/\D/g, '').length !== 12) {
      return setError('12-digit Aadhaar card number daalein');
    }
    if (!f.fatherName.trim() || f.fatherPhone.replace(/\D/g, '').length !== 10) {
      return setError('Pita/Mataji ka naam aur 10-digit mobile number zaroori hai');
    }

    setBusy(true);
    setError('');
    try {
      const res = await api(`/public/onboard/${token}/submit`, {
        method: 'POST',
        body: {
          aadhaarNumber: f.aadhaarNumber,
          permanentAddress: f.permanentAddress,
          collegeOrOffice: f.collegeOrOffice,
          parent: {
            fatherName: f.fatherName,
            fatherPhone: f.fatherPhone,
            motherName: f.motherName,
            motherPhone: f.motherPhone,
            parentAddress: f.permanentAddress,
          },
          docs: {
            idProof: f.idProof,
            photo: f.photo,
          },
        },
      });
      setPayData(res);
      setCustomAmount(String(res.bookingAmount || 2000));
      setStep('payment');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const processPayment = async () => {
    setBusy(true);
    setError('');
    const totalDue = payData?.totalDue || (data.rent + data.deposit);
    const amountToPay = isFullPayment ? totalDue : Number(customAmount || payData.bookingAmount || 2000);

    if (amountToPay <= 0 || (!isFullPayment && amountToPay > totalDue)) {
      setBusy(false);
      return setError('Sahi payment amount chuno');
    }

    try {
      const res = await api(`/public/onboard/${token}/pay`, {
        method: 'POST',
        body: {
          paymentId: payData?.paymentId,
          amount: amountToPay,
          method: paymentMethod === 'upi' ? 'upi_owner' : 'online',
          reference: `UPI-${Date.now().toString().slice(-6)}`,
        },
      });

      if (res.token) {
        setToken(res.token);
        if (onLogin) await onLogin();
      }
      setStep('done');
    } catch (err) {
      setError(err.message);
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

  if (error && !data) {
    return (
      <div className="min-h-screen bg-surface-2 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-surface p-6 rounded-2xl border border-line text-center flex flex-col gap-3">
          <span className="material-symbols-outlined text-danger text-[40px] mx-auto">error</span>
          <h2 className="text-lg font-bold text-ink">Link Invalid</h2>
          <p className="text-xs text-ink-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-2 flex flex-col justify-between text-ink p-4 sm:p-6">
      <div className="w-full max-w-lg mx-auto flex flex-col gap-5 pb-16">
        {/* Header Branding */}
        <header className="flex items-center gap-3 bg-surface p-4 rounded-2xl border border-line shadow-sm">
          <div className="w-12 h-12 rounded-full bg-primary-soft text-primary flex items-center justify-center font-bold text-lg shrink-0">
            🏢
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">{data.pg || 'Aapka PG'}</span>
            <h1 className="text-lg font-bold text-ink truncate">Welcome, {data.name}!</h1>
            <p className="text-xs text-ink-2">
              Room {data.room} · Bed {data.bed} · {data.block}
            </p>
          </div>
        </header>

        {error && <ErrorBox text={error} />}

        {/* STEP 1: Police Verification & Family Form */}
        {step === 'form' && (
          <form onSubmit={submitForm} className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex flex-col gap-4">
            <div className="border-b border-line pb-3">
              <span className="px-2.5 py-0.5 rounded-full bg-primary-soft text-primary text-[11px] font-bold">Step 1 of 2</span>
              <h2 className="text-base font-bold text-ink mt-1">Police Verification & Student Details</h2>
              <p className="text-xs text-ink-2">Kripya apna Aadhaar aur family contacts bharein</p>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink-2">Aadhaar Card Number *</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={14}
                required
                placeholder="12 digit Aadhaar number"
                value={f.aadhaarNumber}
                onChange={(e) => setF({ ...f, aadhaarNumber: e.target.value.replace(/[^\d\s]/g, '') })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink text-sm font-semibold tabular-nums focus:border-primary focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink-2">Ghar Ka Pata (Permanent Home Address) *</span>
              <input
                type="text"
                required
                placeholder="Makan No., Gali, Shahar, Pin Code"
                value={f.permanentAddress}
                onChange={(e) => setF({ ...f, permanentAddress: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink text-sm focus:border-primary focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink-2">College ya Company Ka Naam</span>
              <input
                type="text"
                placeholder="e.g. Chandigarh University / Infosys"
                value={f.collegeOrOffice}
                onChange={(e) => setF({ ...f, collegeOrOffice: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink text-sm focus:border-primary focus:outline-none"
              />
            </label>

            {/* Parent Section */}
            <div className="bg-surface-2 p-3.5 rounded-xl border border-line flex flex-col gap-3">
              <div className="flex items-center gap-1.5 text-ink font-bold text-xs">
                <span className="material-symbols-outlined text-[16px]">family_restroom</span>
                <span>Mata-Pita (Parent Details - Leave Approval Ke Liye) *</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-ink-2">Pita Ka Naam (Father's Name) *</span>
                  <input
                    type="text"
                    required
                    placeholder="Father's full name"
                    value={f.fatherName}
                    onChange={(e) => setF({ ...f, fatherName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-xs focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-ink-2">Pita Ka Phone Number *</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    required
                    placeholder="10 digit mobile"
                    value={f.fatherPhone}
                    onChange={(e) => setF({ ...f, fatherPhone: e.target.value.replace(/\D/g, '') })}
                    className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-xs tabular-nums focus:border-primary focus:outline-none"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-ink-2">Mataji Ka Naam (Mother's Name)</span>
                  <input
                    type="text"
                    placeholder="Mother's name"
                    value={f.motherName}
                    onChange={(e) => setF({ ...f, motherName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-xs focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-ink-2">Mataji Ka Phone (Optional)</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="10 digit mobile"
                    value={f.motherPhone}
                    onChange={(e) => setF({ ...f, motherPhone: e.target.value.replace(/\D/g, '') })}
                    className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-xs tabular-nums focus:border-primary focus:outline-none"
                  />
                </label>
              </div>
            </div>

            {/* Document Uploads */}
            <div className="flex flex-col gap-2 pt-1">
              <span className="text-xs font-semibold text-ink-2">Aadhaar & Photo Upload</span>
              <div className="grid grid-cols-2 gap-2.5">
                <FilePick
                  label="Aadhaar Card Photo"
                  value={f.idProof}
                  onChange={(v) => setF({ ...f, idProof: v })}
                  accept="image/*,application/pdf"
                />
                <FilePick
                  label="Apni Photo"
                  value={f.photo}
                  onChange={(v) => setF({ ...f, photo: v })}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-primary text-on-primary font-bold text-sm shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50 mt-2"
            >
              {busy ? 'Save ho raha hai...' : 'Submit & Aage Payment Karein →'}
            </button>
          </form>
        )}

        {/* STEP 2: Payment Option (Full vs Part Payment) */}
        {step === 'payment' && (
          <div className="bg-surface border border-line rounded-2xl p-5 shadow-sm flex flex-col gap-4">
            <div className="border-b border-line pb-3">
              <span className="px-2.5 py-0.5 rounded-full bg-success-soft text-on-success-soft text-[11px] font-bold">Step 2 of 2</span>
              <h2 className="text-base font-bold text-ink mt-1">Payment & Bed Confirmation</h2>
              <p className="text-xs text-ink-2">Aap part payment (token) ya full payment kar sakte hain</p>
            </div>

            {/* Total Due Breakdown */}
            <div className="bg-surface-2 rounded-xl p-4 flex flex-col gap-2 border border-line">
              <div className="flex justify-between text-xs text-ink-2">
                <span>Pehle Mahine Ka Kiraya:</span>
                <span className="font-semibold text-ink tabular-nums">{inr(data.rent)}</span>
              </div>
              <div className="flex justify-between text-xs text-ink-2">
                <span>Security Deposit (Refundable):</span>
                <span className="font-semibold text-ink tabular-nums">{inr(data.deposit)}</span>
              </div>
              <div className="border-t border-line pt-2 flex justify-between items-center">
                <b className="text-sm font-bold text-ink">Kul Total (Joining Dues):</b>
                <b className="text-xl font-bold text-primary tabular-nums">{inr(data.rent + data.deposit)}</b>
              </div>
            </div>

            {/* Part Payment vs Full Payment Toggle */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-ink-2">Payment Option Chuno</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsFullPayment(false)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    !isFullPayment ? 'bg-primary text-on-primary border-primary shadow-sm' : 'bg-surface text-ink border-line hover:bg-surface-2'
                  }`}
                >
                  <b className="block text-sm">Part Payment</b>
                  <span className="text-[11px] opacity-90">Booking Advance / Token</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsFullPayment(true)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isFullPayment ? 'bg-primary text-on-primary border-primary shadow-sm' : 'bg-surface text-ink border-line hover:bg-surface-2'
                  }`}
                >
                  <b className="block text-sm">Full Payment</b>
                  <span className="text-[11px] opacity-90">{inr(data.rent + data.deposit)} Poora Jama</span>
                </button>
              </div>
            </div>

            {!isFullPayment && (
              <label className="flex flex-col gap-1.5 bg-primary-soft/30 p-3.5 rounded-xl border border-primary-soft">
                <span className="text-xs font-bold text-primary">Kitna Token / Advance Jama Karna Hai:</span>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-ink">₹</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-surface border border-line text-sm font-bold tabular-nums focus:border-primary focus:outline-none"
                  />
                </div>
                <small className="text-[11px] text-ink-2">
                  Baaki bacha <b>{inr(Math.max(0, (data.rent + data.deposit) - Number(customAmount || 0)))}</b> PG aane par jama kar sakte hain.
                </small>
              </label>
            )}

            {/* Payment Method Selector */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-ink-2">Payment Mode</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('upi')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border text-left transition-all ${
                    paymentMethod === 'upi' ? 'bg-surface border-primary text-primary font-bold shadow-sm' : 'bg-surface text-ink border-line hover:bg-surface-2'
                  }`}
                >
                  📱 UPI / GPay / PhonePe
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('manager')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border text-left transition-all ${
                    paymentMethod === 'manager' ? 'bg-surface border-primary text-primary font-bold shadow-sm' : 'bg-surface text-ink border-line hover:bg-surface-2'
                  }`}
                >
                  💵 Manager Ko Diya (Cash)
                </button>
              </div>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={processPayment}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-primary text-on-primary font-bold text-sm shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50 mt-1"
            >
              {busy ? 'Payment verify ho rahi hai...' : `Confirm & Pay ${inr(isFullPayment ? (data.rent + data.deposit) : customAmount)}`}
            </button>
          </div>
        )}

        {/* STEP 3: Success Confirmation */}
        {step === 'done' && (
          <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-success-soft text-success flex items-center justify-center">
              <span className="material-symbols-outlined text-[36px]">check_circle</span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold text-ink">Bed Confirmed Ho Gaya!</h2>
              <p className="text-xs text-ink-2">
                Aapka bed <b>{data.bed}</b> (Room {data.room}) successfully allot ho chuka hai.
              </p>
            </div>

            <div className="w-full bg-surface-2 p-4 rounded-xl border border-line flex flex-col gap-2 text-xs text-left">
              <div className="flex justify-between">
                <span className="text-ink-2">Tenant Name:</span>
                <b className="text-ink">{data.name}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-2">Police Verification:</span>
                <span className="text-success font-semibold">Submitted ✓</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-2">Status:</span>
                <span className="text-primary font-bold">Active Tenant ✓</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('/kiraya')}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-primary text-on-primary font-bold text-sm shadow-sm hover:opacity-95 transition-opacity"
            >
              Apne App Dashboard Mein Jayein →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
