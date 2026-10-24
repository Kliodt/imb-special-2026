const BED_VOLUME = 0.22;

export const Problem = Object.freeze({
  NONE: 'none',
  BLOCKED: 'blocked',
  PLAY_FAILED: 'play-failed',
  VOICE_FAILED: 'voice-failed',
  BED_FAILED: 'bed-failed',
});

/** Narration ("voice") on top of a looping ambient bed that keeps playing between tracks. */
export class Player {
  #voice = new Audio();
  #bed;
  #emit;
  #problem = Problem.NONE;

  constructor({ ambient, onChange }) {
    this.#emit = onChange;
    this.#voice.preload = 'auto';
    this.#bed = new Audio(ambient);
    this.#bed.loop = true;
    this.#bed.preload = 'auto';

    for (const type of ['play', 'pause', 'playing', 'waiting', 'canplay', 'timeupdate', 'durationchange']) {
      this.#voice.addEventListener(type, () => this.#emit());
    }
    for (const type of ['play', 'pause']) {
      this.#bed.addEventListener(type, () => this.#emit());
    }
    this.#voice.addEventListener('error', () => this.#stop(Problem.VOICE_FAILED));
    this.#bed.addEventListener('error', () => {
      this.#problem = Problem.BED_FAILED;
      this.#emit();
    });
  }

  get problem() {
    return this.#problem;
  }

  get playing() {
    return !this.#voice.paused || !this.#bed.paused;
  }

  get loading() {
    return !this.#voice.paused && this.#voice.readyState < HTMLMediaElement.HAVE_FUTURE_DATA;
  }

  get speaking() {
    return !this.#voice.paused && !this.loading;
  }

  get ambientPlaying() {
    return !this.#bed.paused;
  }

  get position() {
    return this.#voice.currentTime;
  }

  get duration() {
    return Number.isFinite(this.#voice.duration) ? this.#voice.duration : 0;
  }

  // The same voice element is reused for every track: Safari may refuse play() on a fresh
  // element that was never unlocked by a tap, e.g. right after a camera scan.
  load(src, autoplay) {
    this.#voice.src = src;
    this.#problem = Problem.NONE;
    if (autoplay) this.play();
    else this.#emit();
  }

  // Both play() calls must run synchronously inside the tap handler to unlock audio on iOS.
  play() {
    this.#problem = Problem.NONE;
    this.#bed.play().catch(() => {});
    if (!this.#voice.ended) this.#playVoice();
    this.#emit();
  }

  pause() {
    this.#stop(Problem.NONE);
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(fraction) {
    if (!this.duration) return;
    this.#voice.currentTime = fraction * this.duration;
    if (this.ambientPlaying && this.#voice.paused) this.#playVoice();
  }

  setVolume(level) {
    this.#voice.volume = level;
    this.#bed.volume = BED_VOLUME * level;
  }

  #playVoice() {
    if (this.#voice.error) this.#voice.load();
    this.#voice.play().catch(error => {
      // AbortError: superseded by pause() or a track switch.
      if (error.name === 'AbortError') return;
      this.#stop(error.name === 'NotAllowedError' ? Problem.BLOCKED : Problem.PLAY_FAILED);
    });
  }

  #stop(problem) {
    this.#voice.pause();
    this.#bed.pause();
    this.#problem = problem;
    this.#emit();
  }
}
