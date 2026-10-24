// Play is an upward triangle split into two halves and turned 90° by CSS; pause is two bars.
// Both shapes have the same commands and point count, so SMIL can morph one into the other
// while the rotation transitions. Corners are rounded by a same-colour stroke with round joins.
const PLAY = 'M16,5.8 L16,5.8 16,20.3 8.5,20.3 16,5.8 M16,5.8 L16,5.8 23.5,20.3 16,20.3 16,5.8';
const PAUSE = 'M9,9 L12.5,9 12.5,23 9,23 9,9 M19.5,9 L23,9 23,23 19.5,23 19.5,9';

export class PlayIcon {
  #svg;
  #path;
  #morph;
  #showsPause = false;

  constructor(svg) {
    this.#svg = svg;
    this.#path = svg.querySelector('path');
    this.#morph = svg.querySelector('animate');
    this.#path.setAttribute('d', PLAY);
    svg.classList.add('rotated');
  }

  showPause(pause) {
    if (pause === this.#showsPause) return;
    this.#showsPause = pause;
    const [from, to] = pause ? [PLAY, PAUSE] : [PAUSE, PLAY];
    this.#path.setAttribute('d', to);
    this.#morph.setAttribute('from', from);
    this.#morph.setAttribute('to', to);
    this.#morph.beginElement();
    this.#svg.classList.toggle('rotated', !pause);
  }
}
