const CSS = `
.wm { display: inline-flex; align-items: baseline; gap: 0.34em; color: var(--ink); line-height: 1; white-space: nowrap; text-transform: uppercase; }
.wm-model { font-weight: var(--w-black); letter-spacing: -0.02em; font-variation-settings: "ROND" 0; }
.wm-mate { margin-inline-end: -0.22em; font-size: 0.46em; font-weight: var(--w-strong); letter-spacing: 0.22em; font-variation-settings: "ROND" 0; }
`;

/**
 * The ME-1 Mate wordmark, in the plain manner of a hardware front panel:
 * "ME-1" heavy, then "MATE" small and widely spaced, in ink.
 * Decorative; whoever uses it names the element it sits in.
 */
export const Wordmark = () => (
  <span className="wm" aria-hidden="true">
    <style>{CSS}</style>
    <span className="wm-model">ME-1</span>
    <span className="wm-mate">Mate</span>
  </span>
);
