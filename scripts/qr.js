// Generates a print-ready QR PNG for every track in public/config.json.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import QRCode from 'qrcode';
import { trackLink } from '../src/track-link.js';

const publicDir = resolve(import.meta.dirname, '../public');
const config = JSON.parse(readFileSync(resolve(publicDir, 'config.json'), 'utf8'));

let missing = 0;
for (const track of config.tracks) {
  for (const path of [track.audio, track.cover]) {
    if (existsSync(resolve(publicDir, path))) continue;
    console.warn(`Трек ${track.id}: нет файла public/${path}`);
    missing++;
  }
  const url = trackLink(config.siteUrl, track.id);
  const target = resolve(publicDir, track.qr);
  mkdirSync(dirname(target), { recursive: true });
  await QRCode.toFile(target, url, { width: 1000, margin: 4, errorCorrectionLevel: 'M' });
  console.log(`public/${track.qr} → ${url}`);
}
if (missing) process.exitCode = 1;
