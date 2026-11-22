import type { CSSProperties } from 'react';
import { keyStyle } from '../lib/theme.ts';

const CSS = `
.wm { display: inline-flex; align-items: center; gap: 0.02em; font-weight: var(--w-black); letter-spacing: -0.03em; line-height: 1; }
.wm-key { display: inline-grid; place-items: center; box-sizing: border-box; inline-size: 0.9em; block-size: 0.98em; margin-inline: 0.05em; padding-block-end: 0.04em; border-radius: 0.2em; background: var(--k); color: var(--on-key); box-shadow: 0 0.05em 0 color-mix(in oklab, var(--k) 55%, var(--ink)); letter-spacing: 0; transform: rotate(var(--tilt)); }
.wm-key:first-of-type { margin-inline-start: 0; }
@media (prefers-reduced-motion: no-preference) {
  .wm-key { transition: transform 420ms var(--spring); }
  :is(button, a):hover > .wm .wm-key, .wm:hover .wm-key { transform: rotate(calc(var(--tilt) * -1.6)) translateY(-0.04em); }
}
@media (forced-colors: active) { .wm-key { border: 0.06em solid CanvasText; } }
`;

const Key = ({ index, tilt }: { readonly index: number; readonly tilt: string }) => (
  <span className="wm-key" style={{ ...keyStyle(index), '--tilt': tilt } as CSSProperties}>
    2
  </span>
);

/**
 * The 2me2u wordmark: each 2 on a tilted key, in two of the keys' colours
 * (amber and teal). Decorative; whoever uses it names the element it sits in.
 */
export const Wordmark = () => (
  <span className="wm" aria-hidden="true">
    <style>{CSS}</style>
    <Key index={1} tilt="-7deg" />
    me
    <Key index={2} tilt="5deg" />u
  </span>
);
