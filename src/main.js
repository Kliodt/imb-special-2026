import '@fontsource-variable/raleway';
import './style.css';
import { Player, Problem } from './player.js';
import { Scanner } from './scanner.js';
import { trackIdFrom, trackLink } from './track-link.js';

const coverGlow = document.getElementById('cover-glow');
const coverImage = document.getElementById('cover');
const titleHeading = document.getElementById('title');
const progressBar = document.getElementById('bar');
const seekInput = document.getElementById('seek');
const elapsedLabel = document.getElementById('elapsed');
const durationLabel = document.getElementById('duration');
const backButton = document.getElementById('back');
const playButton = document.getElementById('play');
const nextButton = document.getElementById('next');
const volumeInput = document.getElementById('volume');
const statusText = document.getElementById('status');
const scanButton = document.getElementById('scan');
const scannerDialog = document.getElementById('scanner');
const cameraVideo = document.getElementById('camera');
const cameraStatusText = document.getElementById('camera-status');
const retryButton = document.getElementById('retry');

const problemText = {
  [Problem.NONE]: '',
  [Problem.BLOCKED]: 'Нажми ▶, чтобы включить звук.',
  [Problem.PLAY_FAILED]: 'Не удалось включить запись. Нажми ▶, чтобы повторить.',
  [Problem.VOICE_FAILED]: 'Запись не загрузилась. Проверь подключение и нажми ▶ ещё раз.',
  [Problem.BED_FAILED]: 'Фоновая дорожка недоступна. Рассказ можно слушать отдельно.',
};

async function loadConfig() {
  try {
    const response = await fetch('config.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`config.json: HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    statusText.textContent = 'Не удалось загрузить аудиогид. Проверь подключение и обнови страницу.';
    throw error;
  }
}

const config = await loadConfig();
const { tracks } = config;
const knownOrigins = new Set([location.origin, new URL(config.siteUrl).origin]);

/** QR codes and page links look like `<siteUrl>/?t=<track id>`. Returns -1 for anything else. */
function findTrack(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return -1;
  }
  if (!knownOrigins.has(url.origin)) return -1;
  return tracks.findIndex(track => track.id === trackIdFrom(url));
}

function formatTime(seconds) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

let current = 0;
let seeking = false;
const preloaded = new Map();
const preloadedUrl = path => preloaded.get(path) ?? path;

const player = new Player({ ambient: config.ambient, onChange: render });
const scanner = new Scanner({
  dialog: scannerDialog,
  video: cameraVideo,
  status: cameraStatusText,
  retry: retryButton,
  onCode: acceptCode,
});

function showTrack(index, autoplay) {
  current = index;
  const track = tracks[index];
  const cover = preloadedUrl(track.cover);
  coverImage.src = cover;
  coverGlow.style.backgroundImage = `url("${cover}")`;
  titleHeading.textContent = track.title;
  history.replaceState(null, '', trackLink(location.href, track.id));
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      artwork: [{ src: new URL(track.cover, location.href).href }],
    });
  }
  player.load(preloadedUrl(track.audio), autoplay);
}

async function preload(path, type) {
  try {
    const response = await fetch(path);
    if (!response.ok || !response.headers.get('content-type')?.startsWith(type)) return;
    preloaded.set(path, URL.createObjectURL(await response.blob()));
  } catch {
    // The file will be loaded from the network when shown.
  }
}

// Keeps every cover and recording in memory so that a scan at the next exhibit does not wait for venue Wi-Fi.
// Small covers go before audio; tracks after the current one go first, the current one (already loading) last.
async function preloadMedia() {
  const queue = tracks.map((_, offset) => tracks[(current + 1 + offset) % tracks.length]);
  for (const track of queue) await preload(track.cover, 'image/');
  for (const track of queue) await preload(track.audio, 'audio/');
}

function step(delta) {
  showTrack((current + delta + tracks.length) % tracks.length, player.playing);
}

function acceptCode(text) {
  const index = findTrack(text);
  if (index < 0) return false;
  showTrack(index, true);
  navigator.vibrate?.(60);
  return true;
}

function playButtonState() {
  if (player.loading) return 'loading';
  if (player.playing) return 'playing';
  return 'paused';
}

function render() {
  const { duration, position } = player;
  let progress = duration ? position / duration : 0;
  if (seeking) progress = seekInput.valueAsNumber / 100;
  else seekInput.value = String(progress * 100);

  seekInput.disabled = !duration;
  progressBar.style.width = `${Math.min(progress, 1) * 100}%`;
  elapsedLabel.textContent = formatTime(progress * duration);
  durationLabel.textContent = duration ? formatTime(duration) : '—';
  playButton.dataset.state = playButtonState();
  playButton.setAttribute('aria-label', player.playing ? 'Пауза' : 'Слушать');
  statusText.textContent = problemText[player.problem];
  document.body.dataset.speaking = String(player.speaking);
  document.body.dataset.ambient = String(player.ambientPlaying);
}

function applyVolume() {
  const level = volumeInput.valueAsNumber;
  player.setVolume(level / 100);
  volumeInput.style.setProperty('--level', `${level}%`);
}

playButton.addEventListener('click', () => player.toggle());
backButton.addEventListener('click', () => step(-1));
nextButton.addEventListener('click', () => step(1));
seekInput.addEventListener('input', () => {
  seeking = true;
  render();
});
seekInput.addEventListener('change', () => {
  seeking = false;
  player.seek(seekInput.valueAsNumber / 100);
});
volumeInput.addEventListener('input', applyVolume);
scanButton.addEventListener('click', () => scanner.open());

if ('mediaSession' in navigator) {
  const handlers = {
    play: () => player.play(),
    pause: () => player.pause(),
    previoustrack: () => step(-1),
    nexttrack: () => step(1),
  };
  for (const [action, handler] of Object.entries(handlers)) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // The browser does not support this action.
    }
  }
}

applyVolume();
for (const button of [backButton, playButton, nextButton, scanButton]) button.disabled = false;
showTrack(Math.max(0, findTrack(location.href)), false);
preloadMedia();
