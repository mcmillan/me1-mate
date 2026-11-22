import { useSetAtom } from 'jotai';
import { type CSSProperties, useEffect, useState } from 'react';
import { keyStyle } from '../lib/theme.ts';
import { OpenFiles, openFilesAtom } from './OpenFiles.tsx';

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/**
 * The overlay: the canvas, nearly opaque, a fine dashed ring just inside the
 * window, and one huge line with the two file types on keys' colours. It
 * takes no pointer events, so the drop lands on the window.
 */
const CSS_TEXT = `
.drop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 48px 32px; background: color-mix(in oklab, var(--canvas) 92%, transparent); pointer-events: none; }
.drop-ring { position: absolute; inset: 14px; border: 2px dashed var(--muted); border-radius: 32px; }
.drop-line { display: block; margin: 0; font-size: clamp(2rem, 1rem + 5.5vw, 5rem); font-weight: var(--w-display); line-height: 1.2; text-align: center; text-wrap: balance; }
.drop-tag { display: inline-block; padding-inline: 0.3em; border: 2px solid transparent; border-radius: 999px; background: var(--k); color: var(--on-key); line-height: 1.15; rotate: var(--tilt); }
.drop-sub { display: block; margin: 20px 0 0; color: var(--muted); font-size: 1.125rem; font-weight: var(--w-ui); line-height: 1.4; text-align: center; text-wrap: balance; }
.drop-sub span { color: var(--k); }
.drop { animation: drop-fade 120ms ease-out both; }
@media (prefers-reduced-motion: no-preference) {
  .drop-ring { animation: drop-ring 350ms var(--spring) both; }
  .drop-tag { animation: drop-stick 400ms var(--spring) backwards; }
  .drop-tag + .drop-tag { animation-delay: 80ms; }
}
@keyframes drop-fade { from { opacity: 0; } }
@keyframes drop-ring { from { scale: 1.04; } }
@keyframes drop-stick { from { scale: 0.7; rotate: 0deg; } }
`;

/**
 * The whole window is a drop target for `.ME1` and `.meu` files, with an
 * overlay while files are dragged over it. What's dropped goes through the
 * same flow as the Open button (`OpenFiles`, rendered here), which starts a
 * new session and replaces nothing.
 */
export const WindowDrop = () => {
  const open = useSetAtom(openFilesAtom);
  const [over, setOver] = useState(false);

  useEffect(() => {
    // dragenter/dragleave fire for every child crossed, so count them.
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setOver(true);
    };
    const overHandler = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      // Copy now: the DataTransfer's file list is emptied once the event ends.
      open(Array.from(e.dataTransfer?.files ?? []));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', overHandler);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', overHandler);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [open]);

  return (
    <>
      <OpenFiles />
      {over && (
        <div className="drop" aria-hidden="true">
          <style>{CSS_TEXT}</style>
          <div className="drop-ring" />
          <div>
            <p className="display drop-line">
              Drop your{' '}
              <span
                className="drop-tag"
                style={{ ...keyStyle(0), '--tilt': '-3deg' } as CSSProperties}
              >
                .ME1
              </span>{' '}
              and{' '}
              <span
                className="drop-tag"
                style={{ ...keyStyle(3), '--tilt': '2deg' } as CSSProperties}
              >
                .meu
              </span>
            </p>
            <p className="drop-sub">
              One or both. <span style={keyStyle(0)}>♥</span> They’re read here in the browser,
              never uploaded.
            </p>
          </div>
        </div>
      )}
    </>
  );
};
