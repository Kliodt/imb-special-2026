'use strict';
const $ = id => document.getElementById(id);
const tracks = window.GUIDE_TRACKS;
const publicOrigin = window.GUIDE_RUNTIME?.publicOrigin;
const allowedOrigins = [...new Set([location.origin, publicOrigin, ...(window.GUIDE_RUNTIME?.legacyOrigins || [])].filter(Boolean))];
const incoming = parseGuideCode(location.href, allowedOrigins);
let startScreen = !incoming || incoming.type === 'start';
let stream = null, frame = 0, cameraRun = 0, cameraTimeout = 0, photoRun = 0, photoPicking = false, wakeLock = null;
const player = new GuidePlayer({ tracks, onChange: render });
player.select(incoming?.index || 0, false);
function time(value) {
  if (!Number.isFinite(value)) return '0:00';
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function render(state = player.snapshot()) {
  const track = tracks[state.index];
  $('tracktitle').textContent = startScreen ? 'Начни своё путешествие' : track.title;
  $('category').textContent = startScreen ? 'ДОБРО ПОЖАЛОВАТЬ' : track.category;
  $('index').textContent = startScreen ? 'СТАРТ' : `0${state.index + 1} / 04`;
  $('artnum').textContent = startScreen ? '↗' : `0${state.index + 1}`;
  $('voice').textContent = startScreen ? 'Надень наушники и нажми ▶'
    : state.ended ? (state.background ? 'Фон играет · сканируй следующий код' : 'Фон на паузе')
    : `Голос 0${state.index + 1}${track.demo ? ' · Демо' : ''}`;
  const active = ['playing', 'loading', 'background'].includes(state.status);
  $('play').textContent = state.status === 'loading' ? '···' : active ? 'Ⅱ' : '▶';
  $('play').setAttribute('aria-label', active ? 'Приостановить' : 'Начать прослушивание');
  $('play').setAttribute('aria-busy', String(state.status === 'loading'));
  $('status').textContent = state.message;
  $('elapsed').textContent = time(state.position);
  $('duration').textContent = state.duration ? time(state.duration) : '—';
  $('bar').style.width = `${state.ended ? 100 : state.duration ? Math.min(100, state.position / state.duration * 100) : 0}%`;
  if (navigator.mediaSession) {
    navigator.mediaSession.playbackState = active ? 'playing' : 'paused';
  }
  if (active) acquireWakeLock();
  else releaseWakeLock();
}
async function acquireWakeLock() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || wakeLock) return;
  wakeLock = 'pending';
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (!player.isActive()) { await lock.release(); wakeLock = null; return; }
    wakeLock = lock;
    lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
  } catch { wakeLock = null; }
}
function releaseWakeLock() { if (wakeLock && wakeLock !== 'pending') wakeLock.release().catch(() => {}); }
function setURL(index) { history.replaceState(null, '', `?stop=${index + 1}`); }
function begin() {
  if (startScreen) { startScreen = false; setURL(player.index); }
  player.start();
}
function choose(index, autoplay = player.isActive()) {
  startScreen = false;
  setURL(index);
  player.select(index, autoplay);
  if ('mediaSession' in navigator && 'MediaMetadata' in window) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: tracks[index].title, artist: 'ITMO MEGA BATTLE', album: 'Аудиогид выставки' });
  }
}
$('play').onclick = () => player.isActive() ? player.pause() : begin();
$('next').onclick = () => choose((player.index + 1) % tracks.length);
$('back').onclick = () => choose((player.index + tracks.length - 1) % tracks.length);
setInterval(() => render(), 500);
if ('mediaSession' in navigator) {
  for (const [action, handler] of Object.entries({ play: begin, pause: () => player.pause(), previoustrack: () => choose((player.index + 3) % 4), nexttrack: () => choose((player.index + 1) % 4) })) {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Optional browser capability. */ }
  }
}
function stopCamera() {
  clearTimeout(cameraTimeout);
  ++cameraRun;
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  $('camera').pause();
  $('camera').srcObject = null;
}
function closeScanner() {
  photoPicking = false;
  ++photoRun;
  stopCamera();
  if ($('scanner').open) $('scanner').close();
}
function acceptQR(data) {
  const code = parseGuideCode(data, allowedOrigins);
  if (!code) return false;
  closeScanner();
  choose(code.index, true);
  navigator.vibrate?.(60);
  return true;
}
async function openCamera() {
  stopCamera();
  const run = cameraRun;
  $('retry').hidden = true;
  $('cameraStatus').textContent = 'Разреши доступ к камере';
  $('camera').parentElement.classList.remove('cameraUnavailable');
  if (!navigator.mediaDevices?.getUserMedia) {
    $('cameraStatus').textContent = 'Нажми «Снять QR-код» для камеры телефона. Живой сканер работает по HTTPS.';
    $('camera').parentElement.classList.add('cameraUnavailable');
    return;
  }
  cameraTimeout = setTimeout(() => { if (run === cameraRun && $('scanner').open && !stream) { $('cameraStatus').textContent = 'Разреши камеру в браузере или нажми «Снять QR-код» ниже.'; $('retry').hidden = false; } }, 8000);
  try {
    const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    clearTimeout(cameraTimeout);
    if (run !== cameraRun || !$('scanner').open) { next.getTracks().forEach(track => track.stop()); return; }
    stream = next;
    $('camera').srcObject = stream;
    await $('camera').play();
    if (run !== cameraRun) return;
    $('cameraStatus').textContent = 'Помести QR-код в рамку';
    const canvas = document.createElement('canvas');
    const cx = canvas.getContext('2d', { willReadFrequently: true });
    let last = 0;
    const decode = timestamp => {
      if (run !== cameraRun || !stream) return;
      if (timestamp - last > 180 && $('camera').readyState >= 2 && $('camera').videoWidth) {
        last = timestamp;
        canvas.width = Math.min(1000, $('camera').videoWidth);
        canvas.height = Math.round($('camera').videoHeight / $('camera').videoWidth * canvas.width);
        try {
          cx.drawImage($('camera'), 0, 0, canvas.width, canvas.height);
          const pixels = cx.getImageData(0, 0, canvas.width, canvas.height);
          const qr = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
          if (qr) {
            if (acceptQR(qr.data)) return;
            $('cameraStatus').textContent = 'Это не код выставки. Наведи на другой QR.';
          }
        } catch { $('cameraStatus').textContent = 'Поднеси код ближе и держи камеру ровно.'; }
      }
      frame = requestAnimationFrame(decode);
    };
    frame = requestAnimationFrame(decode);
  } catch (error) {
    if (run !== cameraRun) return;
    stopCamera();
    $('camera').parentElement.classList.add('cameraUnavailable');
    $('cameraStatus').textContent = error.name === 'NotAllowedError'
      ? 'Камера не разрешена. Разреши её в настройках браузера или нажми «Снять QR-код».'
      : error.name === 'NotFoundError' ? 'Камера не найдена. Выбери фото QR или введи номер точки.'
        : 'Камера недоступна. Повтори или выбери фото QR.';
    $('retry').hidden = false;
  }
}
$('scan').onclick = () => { $('scanner').showModal(); $('manual').value = String(player.index + 1); openCamera(); };
$('closeScanner').onclick = closeScanner;
$('scanner').addEventListener('close', () => { ++photoRun; stopCamera(); });
$('retry').onclick = openCamera;
$('manualGo').onclick = () => { const index = Number($('manual').value) - 1; closeScanner(); choose(index, true); };
// Stop the live preview before the native camera/photo picker takes over the device camera.
$('photo').addEventListener('click', () => { photoPicking = true; stopCamera(); $('cameraStatus').textContent = 'Сними QR целиком, вместе с белыми полями'; });
$('photo').onchange = async event => {
  const file = event.target.files[0];
  if (!file) { photoPicking = false; return; }
  stopCamera();
  const run = ++photoRun;
  const url = URL.createObjectURL(file);
  $('cameraStatus').textContent = 'Распознаём код…';
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (run !== photoRun || !$('scanner').open) return;
    let found = null;
    // Try both the full frame and its central area: a phone photo often has a small code in the middle.
    for (const crop of [1, 0.65, 0.4]) {
      const width = image.naturalWidth * crop, height = image.naturalHeight * crop;
      const scale = Math.min(1, 1800 / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
      const cx = canvas.getContext('2d', { willReadFrequently: true });
      cx.drawImage(image, (image.naturalWidth - width) / 2, (image.naturalHeight - height) / 2, width, height, 0, 0, canvas.width, canvas.height);
      const pixels = cx.getImageData(0, 0, canvas.width, canvas.height);
      found = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
      if (found) break;
    }
    if (run !== photoRun || !$('scanner').open) return;
    if (!found) $('cameraStatus').textContent = 'QR не виден. Сними ближе, без бликов и наклона.';
    else if (!acceptQR(found.data)) $('cameraStatus').textContent = 'На фото код другого сайта. Нужен QR выставки.';
  } catch { if (run === photoRun) $('cameraStatus').textContent = 'Фото не удалось прочитать. Выбери JPEG или PNG и повтори.'; }
  finally { photoPicking = false; URL.revokeObjectURL(url); event.target.value = ''; }
};
$('photo').addEventListener('cancel', () => { photoPicking = false; $('retry').hidden = false; $('cameraStatus').textContent = 'Фото не выбрано. Сними QR или включи сканер снова.'; });
window.addEventListener('pagehide', () => { closeScanner(); player.pause(); releaseWakeLock(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') stopCamera();
  else {
    if (player.isActive()) acquireWakeLock();
    if ($('scanner').open && !photoPicking && !stream) { $('retry').hidden = false; $('cameraStatus').textContent = 'Камера на паузе. Нажми «Повторить» или сними QR.'; }
  }
});
render();

// Keep the four small demo recordings in memory after loading. Exhibit switches
// then do not depend on another network request.
for (const [index, track] of tracks.entries()) {
  fetch(track.audio).then(response => {
    if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/')) throw new Error('Audio unavailable');
    return response.blob();
  }).then(blob => {
    if (!blob.size) return;
    const source = URL.createObjectURL(blob);
    track.audio = source;
    if (player.index === index && player.status === 'idle' && player.voice.currentTime === 0) {
      player.voice.src = source; player.voice.load();
    }
  }).catch(() => { /* Direct playback remains available and can be retried. */ });
}
