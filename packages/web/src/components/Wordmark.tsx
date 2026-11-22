const CSS = `
.wm { --wm-orange: #ee5a1e; display: inline-flex; align-items: center; gap: 0.22em; color: var(--ink); line-height: 1; white-space: nowrap; }
.wm-model { padding: 0.1em 0.2em 0.12em; border-radius: 0.14em; background: var(--wm-orange); color: #fff; font-weight: var(--w-black); letter-spacing: -0.02em; font-variation-settings: "ROND" 0; }
.wm-mate { font-weight: var(--w-display); letter-spacing: -0.02em; }
@media (forced-colors: active) { .wm-model { border: 0.06em solid CanvasText; } }
`;

/**
 * The ME-1 Mate wordmark: "ME-1" heavy, white on an orange plate, then
 * "Mate". Decorative; whoever uses it names the element it sits in.
 */
export const Wordmark = () => (
  <span className="wm" aria-hidden="true">
    <style>{CSS}</style>
    <span className="wm-model">ME-1</span>
    <span className="wm-mate">Mate</span>
  </span>
);
