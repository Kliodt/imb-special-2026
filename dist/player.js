/* Audio lifecycle shared by the browser and regression tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.assign(root, factory());
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  class GuidePlayer {
    constructor({ tracks, audioFactory = src => new Audio(src), onChange = () => {} }) {
      this.tracks = tracks;
      this.makeAudio = audioFactory;
      this.onChange = onChange;
      this.index = 0;
      this.status = 'idle';
      this.message = '';
      this.token = 0;
      this.ended = false;
      this.voice = this.makeAudio(this.tracks[0].audio);
      this.bed = this.makeAudio('audio/ambient.wav');
      this.bed.loop = true;
      this.bed.volume = 0.22;
      this.bed.preload = 'auto';
      this.bed.onerror = () => {
        this.message = 'Фоновая дорожка недоступна. Рассказ можно слушать отдельно.';
        this.emit();
      };
    }
    snapshot() {
      return {
        index: this.index, status: this.status, message: this.message,
        position: Number(this.voice?.currentTime) || 0,
        duration: Number.isFinite(this.voice?.duration) ? this.voice.duration : 0,
        ended: this.ended, background: !this.bed.paused
      };
    }
    emit() { this.onChange(this.snapshot()); }
    isActive() { return ['loading', 'playing', 'background'].includes(this.status); }
    select(index, autoplay = this.isActive()) {
      if (!Number.isInteger(index) || index < 0 || index >= this.tracks.length) return false;
      ++this.token;
      if (this.voice) {
        this.voice.onended = this.voice.onerror = this.voice.onplaying = this.voice.onwaiting = null;
        this.voice.pause();
        this.voice.removeAttribute('src');
        this.voice.load();
      }
      // Reuse the initially unlocked element: Safari can block new audio elements after a camera scan.
      this.voice.src = this.tracks[index].audio;
      this.voice.load();
      this.index = index;
      this.ended = false;
      this.status = 'idle';
      this.message = '';
      if (autoplay) this.start();
      else { this.bed.pause(); this.emit(); }
      return true;
    }
    start() {
      const token = ++this.token;
      this.message = '';
      this.status = this.ended ? 'background' : 'loading';
      // Both play() calls run in the original user gesture; no network awaits before unlocking audio.
      try {
        Promise.resolve(this.bed.play()).then(() => {
          if (token !== this.token && this.status === 'paused') this.bed.pause();
        }).catch(() => {
          if (token !== this.token) return;
          this.message = 'Нажми ▶, чтобы разрешить звук.';
          this.emit();
        });
      } catch { /* Voice playback below still gets its own attempt. */ }
      if (this.ended) { this.emit(); return; }
      this.voice.preload = 'auto';
      if (this.voice.error) this.voice.load();
      const voice = this.voice;
      const valid = () => token === this.token && voice === this.voice;
      voice.onended = () => {
        if (!valid()) return;
        this.ended = true;
        this.status = this.bed.paused ? 'idle' : 'background';
        this.emit();
      };
      voice.onerror = () => {
        if (!valid()) return;
        this.status = 'error';
        this.message = 'Запись не загрузилась. Проверь подключение и нажми ▶ ещё раз.';
        voice.pause();
        this.emit();
      };
      voice.onwaiting = () => { if (valid()) { this.status = 'loading'; this.emit(); } };
      voice.onplaying = () => { if (valid()) { this.status = 'playing'; this.message = ''; this.emit(); } };
      try {
        Promise.resolve(voice.play()).then(() => {
          if (!valid()) { if (voice !== this.voice || this.status === 'paused') voice.pause(); return; }
          this.status = 'playing';
          this.emit();
        }).catch(error => {
          if (!valid()) return;
          this.status = error.name === 'NotAllowedError' ? 'blocked' : 'error';
          this.message = error.name === 'NotAllowedError'
            ? 'Точка выбрана. Нажми ▶, чтобы включить рассказ.'
            : 'Не удалось включить запись. Нажми ▶, чтобы повторить.';
          this.emit();
        });
      } catch {
        if (valid()) { this.status = 'error'; this.message = 'Не удалось включить запись. Повтори.'; this.emit(); }
      }
      this.emit();
    }
    pause() {
      ++this.token;
      this.voice?.pause();
      this.bed.pause();
      this.status = 'paused';
      this.message = '';
      this.emit();
    }
    toggle() { this.isActive() ? this.pause() : this.start(); }
    dispose() { this.pause(); this.voice?.removeAttribute('src'); this.voice?.load(); }
  }
  function parseGuideCode(value, allowedOrigins) {
    const text = String(value).trim();
    // Compact payloads are accepted for printed exhibition-only markers.
    if (/^MEGA:(START|[1-4])$/.test(text))
      return text === 'MEGA:START' ? { type: 'start', index: 0 } : { type: 'stop', index: Number(text.slice(-1)) - 1 };
    try {
      const url = new URL(text);
      if (!allowedOrigins.includes(url.origin) || url.pathname !== '/') return null;
      if (url.searchParams.get('start') === '1') return { type: 'start', index: 0 };
      const stop = url.searchParams.get('stop');
      if (/^[1-4]$/.test(stop || '')) return { type: 'stop', index: Number(stop) - 1 };
    } catch { /* An unrelated QR must never navigate the visitor away from the player. */ }
    return null;
  }
  return { GuidePlayer, parseGuideCode };
});
