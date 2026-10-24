// Shared by the app and scripts/qr.js: printed QR codes must match what the app parses.
const TRACK_PARAM = 't';

export function trackLink(base, id) {
  const url = new URL(base);
  url.search = '';
  url.searchParams.set(TRACK_PARAM, id);
  return url.href;
}

export function trackIdFrom(url) {
  return url.searchParams.get(TRACK_PARAM);
}
