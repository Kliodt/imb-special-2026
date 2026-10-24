import '@fontsource-variable/raleway';
import './style.css';
import { PlayIcon } from './play-icon.js';
import { Player, Problem } from './player.js';
import { Scanner } from './scanner.js';
import { trackIdFrom, trackLink } from './track-link.js';
import { Waves } from './waves.js';

const coverGlow = document.getElementById('cover-glow');
const coverImage = document.getElementById('cover');
const previousCoverImage = document.getElementById('cover-previous');
const scanButton = document.getElementById('scan');
const viewfinder = document.getElementById('viewfinder');
const cameraVideo = document.getElementById('camera');
const cameraStatusText = document.getElementById('camera-status');
const retryButton = document.getElementById('retry');
const closeScannerButton = document.getElementById('close-scanner');
const titlesBlock = document.getElementById('titles');
const titleHeading = document.getElementById('title');
const artistText = document.getElementById('artist');
const timeline = document.getElementById('timeline');
const wavesCanvas = document.getElementById('waves');
const seekInput = document.getElementById('seek');
const elapsedLabel = document.getElementById('elapsed');
const durationLabel = document.getElementById('duration');
const backButton = document.getElementById('back');
const playButton = document.getElementById('play');
const playIconSvg = document.getElementById('play-icon');
const nextButton = document.getElementById('next');
const statusText = document.getElementById('status');

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

// Progress jumps larger than this (a tap on the line, a track switch) glide instead of snapping;
// smaller steps (normal playback) and dragging are applied as is.
const GLIDE_THRESHOLD = 0.02;
const GLIDE_MS = 120;

let current = 0;
let seeking = false;
let dragging = false;
let progressFrame = 0;
let shownProgress = 0;
let gliding = false;
let lastProgressFrame = 0;
const preloaded = new Map();
const preloadedUrl = path => preloaded.get(path) ?? path;

const player = new Player({ ambient: config.ambient, onChange: render });
const waves = new Waves(wavesCanvas);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const playIcon = new PlayIcon(playIconSvg);
new Scanner({
  trigger: scanButton,
  viewfinder,
  video: cameraVideo,
  status: cameraStatusText,
  retry: retryButton,
  closeButton: closeScannerButton,
  onCode: acceptCode,
});

// The old cover fades out over the new one and the new title rises in, so a switch never jumps.
function animateTrackChange(previousCover) {
  if (reducedMotion.matches) return;
  previousCoverImage.src = previousCover;
  previousCoverImage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, easing: 'ease-in-out' });
  titlesBlock.animate(
    [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
    { duration: 600, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
  );
}

function showTrack(index, autoplay) {
  current = index;
  const track = tracks[index];
  const cover = preloadedUrl(track.cover);
  const previousCover = coverImage.getAttribute('src');
  coverImage.src = cover;
  coverGlow.style.backgroundImage = `url("${cover}")`;
  titleHeading.textContent = track.title;
  artistText.textContent = track.artist;
  if (previousCover) animateTrackChange(previousCover);
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

/** Updates the dot and the time label; returns the progress actually shown, which may still be gliding. */
function renderProgress(now) {
  const { duration, position } = player;
  let progress = duration ? position / duration : 0;
  if (seeking) progress = seekInput.valueAsNumber / 100;
  else seekInput.value = String(progress * 100);
  progress = Math.min(progress, 1);

  const elapsedMs = Math.min(now - lastProgressFrame, 50);
  lastProgressFrame = now;
  if (dragging) gliding = false;
  else if (Math.abs(progress - shownProgress) > GLIDE_THRESHOLD) gliding = true;
  if (gliding && !reducedMotion.matches) shownProgress += (progress - shownProgress) * Math.min(1, elapsedMs / GLIDE_MS);
  else shownProgress = progress;
  if (Math.abs(progress - shownProgress) < 0.002) {
    shownProgress = progress;
    gliding = false;
  }

  timeline.style.setProperty('--progress', `${shownProgress * 100}%`);
  const elapsed = formatTime(progress * duration);
  if (elapsedLabel.textContent !== elapsed) elapsedLabel.textContent = elapsed;
  return shownProgress;
}

// `timeupdate` fires only about 4 times a second, so the dot and the waves are drawn every frame while
// narration plays, while the dot glides to a new position and until the waves have settled after a pause.
function followProgress(now) {
  const settling = waves.render(renderProgress(now), player.speaking, now);
  progressFrame = player.speaking || settling || gliding ? requestAnimationFrame(followProgress) : 0;
}

function render() {
  seekInput.disabled = !player.duration;
  durationLabel.textContent = player.duration ? formatTime(player.duration) : '—';
  playButton.dataset.state = playButtonState();
  playIcon.showPause(player.playing);
  playButton.setAttribute('aria-label', player.playing ? 'Пауза' : 'Слушать');
  statusText.textContent = problemText[player.problem];
  document.body.dataset.speaking = String(player.speaking);
  if (!progressFrame) progressFrame = requestAnimationFrame(followProgress);
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
  dragging = false;
  player.seek(seekInput.valueAsNumber / 100);
});
// A press that moves is a drag: the dot follows the finger directly. A plain tap glides.
seekInput.addEventListener('pointerdown', () => {
  dragging = false;
});
seekInput.addEventListener('pointermove', event => {
  if (event.buttons) dragging = true;
});

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

for (const button of [backButton, playButton, nextButton, scanButton]) button.disabled = false;
showTrack(Math.max(0, findTrack(location.href)), false);
preloadMedia();
