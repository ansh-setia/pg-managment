import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoose from 'mongoose';
import { config } from './config.js';
import { requireAuth, requireRole } from './auth.js';
import { upload, uploadDir } from './upload.js';
import { Bed } from './models.js';
import { getSettings } from './billing.js';
import { daysSince, wrap } from './util.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import tenantRoutes from './routes/tenant.js';
import managerRoutes from './routes/manager.js';
import ownerRoutes from './routes/owner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../../frontend/dist');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);

app.post('/api/upload', requireAuth, requireRole('tenant', 'manager', 'malik'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File not provided' });
  res.status(201).json({ file: req.file.filename });
});

// Only logged-in users can read uploads (ID proofs, photos). Names are random UUIDs.
app.get('/api/files/:name', requireAuth, (req, res) => {
  const file = path.join(uploadDir, path.basename(req.params.name));
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(file);
});

app.use('/api/tenant', requireAuth, requireRole('tenant'), tenantRoutes);
app.use('/api/manager', requireAuth, requireRole('manager', 'malik'), managerRoutes);
app.use('/api/owner', requireAuth, requireRole('malik'), ownerRoutes);

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found' }));
app.use((req, res) => {
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    return res.sendFile(path.join(distDir, 'index.html'));
  }
  res.status(404).json({ error: 'Route not found' });
});
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.name === 'MulterError' || err.status) return res.status(err.status || 400).json({ error: err.message });
  if (err.message?.startsWith('Sirf JPG')) return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'An unexpected server error occurred, please try again shortly' });
});

mongoose.connect(config.mongoUri).then(() => {
  app.listen(config.port, () => console.log(`API ready on :${config.port}`));
}).catch((e) => { console.error('MongoDB connect failed', e.message); process.exit(1); });
