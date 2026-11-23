import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { User, OtpCode, Tenant } from '../models.js';
import { config } from '../config.js';
import { signToken, requireAuth } from '../auth.js';
import { sendOtpSms } from '../notify.js';
import { HttpError, normPhone, wrap } from '../util.js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const hash = (phone, otp) => crypto.createHash('sha256').update(`${phone}:${otp}:${config.jwtSecret}`).digest('hex');

r.post('/request-otp', limiter, wrap(async (req, res) => {
  const phone = normPhone(req.body.phone);
  if (phone.length !== 10) throw new HttpError(400, '10 digit ka mobile number daalo');
  const out = { ok: true, otpLength: config.otpLength };
  const user = await User.findOne({ phone, active: true });
  if (!user) return res.json(out); // same reply either way, so numbers can't be probed

  const last = await OtpCode.findOne({ phone });
  if (last && Date.now() - last.createdAt.getTime() < 30000) throw new HttpError(429, '30 second baad dobara OTP mangao');

  const otp = String(crypto.randomInt(0, 10 ** config.otpLength)).padStart(config.otpLength, '0');
  await OtpCode.findOneAndUpdate(
    { phone },
    { hash: hash(phone, otp), attempts: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
    { upsert: true },
  );
  await sendOtpSms(phone, otp);
  if (config.otpDev) out.devOtp = otp;
  res.json(out);
}));

r.post('/verify', limiter, wrap(async (req, res) => {
  const phone = normPhone(req.body.phone);
  const { otp, role } = req.body;
  const rec = await OtpCode.findOne({ phone });
  if (!rec || rec.expiresAt < new Date()) throw new HttpError(400, 'OTP expire ho gaya, dobara mangao');
  if (rec.attempts >= 5) throw new HttpError(429, 'Bahut galat try ho gaye, naya OTP mangao');
  if (hash(phone, String(otp)) !== rec.hash) {
    rec.attempts += 1;
    await rec.save();
    throw new HttpError(400, 'OTP galat hai');
  }
  const user = await User.findOne({ phone, active: true });
  if (!user || user.role !== role) throw new HttpError(403, 'Is number pe ye role nahi hai');
  await OtpCode.deleteOne({ phone });
  res.json({ token: signToken(user), user: { id: user._id, name: user.name, role: user.role } });
}));

r.get('/me', requireAuth, wrap(async (req, res) => {
  const u = req.user;
  const out = { id: u._id, name: u.name, role: u.role, phone: u.phone };
  if (u.role === 'tenant') {
    const t = await Tenant.findOne({ user: u._id, status: { $in: ['active', 'notice'] } }).populate('room bed');
    if (t) out.tenant = { room: t.room?.number, bed: t.bed?.label };
  }
  res.json(out);
}));

export default r;
