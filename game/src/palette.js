// NEON TIDE look plan, in one place. A rainy neon harbor at night: deep navy
// deck, teal for the Tidebreakers, magenta for the Wardens, amber lamps. The
// same names are the CSS custom properties in index.html.
export const PALETTE = {
  sky: '#05070f',
  canvas: '#070b14',
  deck: '#0e1626',
  surface: '#182234',
  hairline: '#26324a',
  containerTeal: '#0f6f66',
  containerRust: '#8a4a2b',
  containerAmber: '#a8761f',
  teal: '#19e3c2',
  magenta: '#ff2e88',
  amber: '#ffb347',
  ink: '#e8f1f2',
  muted: '#7d8aa3',
  red: '#ff4d5e',
};

export function shade(name) {
  return PALETTE[name];
}
