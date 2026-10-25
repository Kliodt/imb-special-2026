// Brand background, ported from the quest teaser: bundles of contour lines in two corners and
// four-point sparkles. The player card covers most of a phone screen, so a few sparkles also sit
// on top of the card corners (`front`), the rest glow through the glass.
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The lines go in a bundle: one contour shifted step by step, like contour lines on a map. */
const LINE_SHIFTS = [0, 1, 2, 3, 4, 5, 6];
const CORNERS = [
  { className: 'contour contour-top-right', line: 'M120-60C210 50 140 150 250 205S345 315 470 470', shift: i => `translate(${i * 24} ${-i * 14})` },
  { className: 'contour contour-bottom-left', line: 'M-60 170C50 105 135 235 255 190S395 105 500 195', shift: i => `translate(${-i * 6} ${i * 26})` },
];

/** Four-point star: long rays and a blue core of the same shape. */
const SPARKLE_PATH = 'M0-50C3-13 13-3 50 0 13 3 3 13 0 50-3 13-13 3-50 0-13-3-3-13 0-50Z';
const SPARKLE_CORE_SCALE = 0.34;

/** Positions in % of the screen, size in px. */
const STARS = [
  { left: 3, top: 24, size: 20 },
  { left: 97, top: 9, size: 34, front: true },
  { left: 3, top: 47, size: 26, front: true },
  { left: 95, top: 74, size: 52 },
  { left: 8, top: 96, size: 30, front: true },
  { left: 60, top: 98, size: 18 },
];

function svg(className, viewBox) {
  const element = document.createElementNS(SVG_NS, 'svg');
  element.setAttribute('class', className);
  element.setAttribute('viewBox', viewBox);
  element.setAttribute('aria-hidden', 'true');
  return element;
}

function path(d, className, transform) {
  const element = document.createElementNS(SVG_NS, 'path');
  element.setAttribute('d', d);
  if (className) element.setAttribute('class', className);
  if (transform) element.setAttribute('transform', transform);
  return element;
}

function sparkle({ left, top, size }) {
  const star = svg('sparkle', '-60 -60 120 120');
  star.style.left = `${left}%`;
  star.style.top = `${top}%`;
  star.style.width = `${size}px`;
  star.append(path(SPARKLE_PATH, 'sparkle-rays'), path(SPARKLE_PATH, 'sparkle-core', `scale(${SPARKLE_CORE_SCALE})`));
  return star;
}

export function renderDecor(behind, front) {
  for (const corner of CORNERS) {
    const contour = svg(corner.className, '0 0 400 400');
    contour.append(...LINE_SHIFTS.map(i => path(corner.line, null, corner.shift(i))));
    behind.append(contour);
  }
  for (const star of STARS) (star.front ? front : behind).append(sparkle(star));
}
