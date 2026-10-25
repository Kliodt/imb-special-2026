// Each layer morphs in place through three keyframe shapes (1 → 2 → 3 → 1), like CSS keyframes.
// A shape is a sum of harmonics [cycles per wavelength, weight, phase]; frequencies are shared by all
// shapes of a layer so that weights and phases interpolate smoothly. The wavelength is fixed in px:
// a longer passed part reveals more crests instead of stretching them.
const LAYERS = [
  {
    height: 0.9,
    alpha: 0.35,
    wavelength: 220,
    morphMs: 2600,
    shapes: [
      [[1, 0.6, 0], [2, 0.3, 1.2], [3.5, 0.1, 0.5]],
      [[1, 0.35, 1.4], [2, 0.5, 2.4], [3.5, 0.15, 1.6]],
      [[1, 0.7, 2.4], [2, 0.2, 0.6], [3.5, 0.1, 2.6]],
    ],
  },
  {
    height: 0.65,
    alpha: 0.6,
    wavelength: 150,
    morphMs: 1900,
    shapes: [
      [[1, 0.5, 2], [1.7, 0.35, 0.4], [3, 0.15, 1.5]],
      [[1, 0.7, 0.8], [1.7, 0.2, 1.8], [3, 0.1, 0.2]],
      [[1, 0.4, 2.8], [1.7, 0.45, 2.6], [3, 0.15, 2.4]],
    ],
  },
];
// Next to the dot the crest is capped by a slope rising from the line: over `width` px up to `height` px,
// shaped by `curve` exactly like CSS cubic-bezier(x1, y1, x2, y2). With the linear curve [0, 0, 1, 1]
// the angle is atan(height / width): 30 px over 52 px ≈ 30°. [0, 0.6, 0.4, 1] starts steeper and rounds off.
// The corner where the slope meets the crest is rounded over EDGE_ROUNDING_PX.
const EDGE = { width: 52, height: 30, curve: [0, 0, 1, 1] };
const EDGE_ROUNDING_PX = 4;
const RISE_MS = 160;
const SETTLE_MS = 320;
const STEP_PX = 3;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const smoothstep = t => t * t * (3 - 2 * t);
const softMin = (a, b, k) => (a + b - Math.sqrt((a - b) ** 2 + k * k)) / 2;

/** y for a given x on a CSS-style cubic-bezier easing curve (x solved by bisection). */
function cubicBezier([x1, y1, x2, y2]) {
  const point = (t, p1, p2) => 3 * p1 * t * (1 - t) ** 2 + 3 * p2 * t * t * (1 - t) + t ** 3;
  return x => {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 20; i++) {
      const t = (low + high) / 2;
      if (point(t, x1, x2) < x) low = t;
      else high = t;
    }
    return point((low + high) / 2, y1, y2);
  };
}

const edgeCurve = cubicBezier(EDGE.curve);

/** Two morphing wave layers drawn above the passed part of the progress line; they ease into it at the dot. */
export class Waves {
  #canvas;
  #context;
  #colors;
  #level = 0;
  #time = 0;
  #lastFrame = 0;

  constructor(canvas) {
    this.#canvas = canvas;
    this.#context = canvas.getContext('2d');
    const styles = getComputedStyle(document.documentElement);
    this.#colors = [styles.getPropertyValue('--sky').trim(), styles.getPropertyValue('--blush').trim()];
  }

  /** Draws one frame; returns true while the waves are still rising or settling. */
  render(progress, active, now) {
    const elapsed = this.#lastFrame ? Math.min(now - this.#lastFrame, 50) : 16;
    this.#lastFrame = now;
    const target = active ? 1 : 0;
    this.#level += (target - this.#level) * Math.min(1, elapsed / (active ? RISE_MS : SETTLE_MS));
    if (reducedMotion.matches || Math.abs(target - this.#level) < 0.01) this.#level = target;
    if (active && !reducedMotion.matches) this.#time += elapsed;

    this.#draw(progress);
    const settling = this.#level !== target;
    if (!settling && !active) this.#lastFrame = 0;
    return settling;
  }

  #draw(progress) {
    const canvas = this.#canvas;
    const context = this.#context;
    const ratio = devicePixelRatio;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio);
    if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const end = progress * width;
    if (!this.#level || end < 1) return;
    const gradient = context.createLinearGradient(0, 0, end, 0);
    gradient.addColorStop(0, this.#colors[0]);
    gradient.addColorStop(1, this.#colors[1]);
    context.fillStyle = gradient;

    for (const layer of LAYERS) {
      const harmonics = this.#currentShape(layer);
      const total = harmonics.reduce((sum, [, weight]) => sum + weight, 0);
      context.globalAlpha = layer.alpha;
      context.beginPath();
      context.moveTo(0, height);
      for (let x = 0; x <= end + STEP_PX; x += STEP_PX) {
        const at = Math.min(x, end);
        let shape = 0;
        for (const [frequency, weight, phase] of harmonics) {
          shape += weight * Math.sin((at / layer.wavelength) * Math.PI * 2 * frequency + phase);
        }
        const crest = layer.height * this.#level * (0.5 + 0.5 * (shape / total)) * height;
        const edge = EDGE.height * edgeCurve(Math.min(1, (end - at) / EDGE.width));
        context.lineTo(at, height - Math.max(0, softMin(crest, edge, EDGE_ROUNDING_PX)));
      }
      context.lineTo(end, height);
      context.closePath();
      context.fill();
    }
  }

  /** Harmonics of the layer at the current moment, eased between two neighbouring keyframe shapes. */
  #currentShape(layer) {
    const position = this.#time / layer.morphMs;
    const from = layer.shapes[Math.floor(position) % layer.shapes.length];
    const to = layer.shapes[(Math.floor(position) + 1) % layer.shapes.length];
    const mix = smoothstep(position % 1);
    return from.map(([frequency, weight, phase], i) => [
      frequency,
      weight + (to[i][1] - weight) * mix,
      phase + (to[i][2] - phase) * mix,
    ]);
  }
}
