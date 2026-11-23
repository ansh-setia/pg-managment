import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pgapp',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  otpLength: Number(process.env.OTP_LENGTH || 6),
  otpDev: process.env.OTP_DEV_MODE === 'true' && !isProd,
  razorpay: { keyId: process.env.RAZORPAY_KEY_ID || '', keySecret: process.env.RAZORPAY_KEY_SECRET || '' },
  allowMock: process.env.ALLOW_MOCK_PAYMENTS === 'true',
};

if (isProd && config.jwtSecret === 'dev-only-secret') {
  throw new Error('Set a strong JWT_SECRET in production');
}
