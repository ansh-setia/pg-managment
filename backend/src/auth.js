import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { User } from './models.js';
import { HttpError, wrap } from './util.js';

export const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, { expiresIn: '30d' });

export const requireAuth = wrap(async (req, _res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) throw new HttpError(401, 'Please sign in');
  let payload;
  try {
    payload = jwt.verify(h.slice(7), config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Session expired, please sign in again');
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.active) throw new HttpError(401, 'Account is not active');
  req.user = user;
  next();
});

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, 'You do not have permission to access this resource'));
