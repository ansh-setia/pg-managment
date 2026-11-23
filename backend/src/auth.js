import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { User } from './models.js';
import { HttpError, wrap } from './util.js';

export const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, { expiresIn: '30d' });

export const requireAuth = wrap(async (req, _res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) throw new HttpError(401, 'Login karo');
  let payload;
  try {
    payload = jwt.verify(h.slice(7), config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Session khatam ho gaya, dobara login karo');
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.active) throw new HttpError(401, 'Account active nahi hai');
  req.user = user;
  next();
});

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, 'Aapko ye dekhne ki permission nahi hai'));
