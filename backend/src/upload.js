import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { config } from './config.js';

export const uploadDir = path.resolve(config.uploadDir);
fs.mkdirSync(uploadDir, { recursive: true });

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };

// Files get random unguessable names and are only served to logged-in users (see /api/files).
// Render free / many hosts wipe local disk on redeploy: for production move this to
// Azure Blob Storage / S3 / Cloudinary (replace this module, keep the same filename-returning API).
export const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + EXT[file.mimetype]),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(EXT[file.mimetype] ? null : new Error('Sirf JPG, PNG, WEBP ya PDF chalega'), !!EXT[file.mimetype]),
});
