/**
 * The key sheet, in the phone layout: the selected key open over the key grid,
 * with everything about it in one place. It is the inspector (`Inspector`),
 * with the channel picker for the key (`ChannelGrid variant="pick"`) inside
 * it, on a native modal `<dialog>` drawn as a sheet that rises from the
 * bottom of the window and nearly fills it. Only the sheet scrolls.
 *
 * `keySheetOpenAtom` opens and closes it. The browser gives the inert page,
 * focus containment, and Escape and the back gesture; `closedby="any"` also
 * closes it from the strip of page left above it, with a fallback where
 * `closedby` is missing. Closing goes back to the grid with the key that was
 * open focused (the ‹ › steps may have moved on from the tile that opened it).
 */

import { useAtom, useAtomValue } from 'jotai';
import { useEffect, useRef } from 'react';
import { keySheetOpenAtom, selectedKeyAtom } from '../lib/store.ts';
import { ChannelGrid } from './ChannelGrid.tsx';
import { useLightDismiss } from './ConfirmDialog.tsx';
import { Inspector } from './Inspector.tsx';

/*
 * Tamagui's reset unsets the dialog's UA styles, so the closed state and the
 * box are set here. The sheet leaves a strip of the dimmed page above it, so
 * it reads as lifted over the grid, and keeps clear of the home indicator.
 *
 * It rises into place and sinks away (`@starting-style` for the first frame;
 * `display` and `overlay` keep it drawn while it sinks, where the browser can
 * transition them, and `data-closing` does the same for Done elsewhere). With
 * reduced motion it only fades, quickly.
 *
 * Inside, the inspector's card is the sheet's surface: its hero, in the key's
 * colour, stays at the top while the rest scrolls under it.
 */
const CSS_TEXT = `
.sheet:not([open]) { display: none; }
.sheet:focus-visible { outline: none; }
.sheet {
  box-sizing: border-box; position: fixed; inset: auto 0 0; inline-size: 100%; max-inline-size: none;
  block-size: calc(100dvh - max(12px, env(safe-area-inset-top))); max-block-size: none;
  margin: 0; padding: 0; border: 0; border-radius: 24px 24px 0 0;
  background: var(--card); color: var(--ink); box-shadow: var(--shadow);
  overflow-y: auto; overscroll-behavior: contain;
  opacity: 0;
  transition-property: opacity, translate, display, overlay;
  transition-duration: 0.18s;
  transition-timing-function: ease-out;
  transition-behavior: allow-discrete;
}
.sheet:is([open]):where(:not([data-closing])) {
  opacity: 1;
  @starting-style { opacity: 0; }
}
.sheet::backdrop {
  overflow: hidden; overscroll-behavior: contain;
  background: rgb(19 19 22 / 0);
  transition-property: background-color, display, overlay;
  transition-duration: 0.28s;
  transition-behavior: allow-discrete;
}
.sheet:is([open]):where(:not([data-closing]))::backdrop {
  background: rgb(19 19 22 / 0.45);
  @starting-style { background: rgb(19 19 22 / 0); }
}
@media (prefers-color-scheme: dark) {
  .sheet:is([open]):where(:not([data-closing]))::backdrop { background: rgb(0 0 0 / 0.6); }
}
@media (prefers-reduced-motion: no-preference) {
  .sheet { translate: 0 100%; transition-duration: 0.26s; transition-timing-function: cubic-bezier(0.3, 0, 0.8, 0.15); }
  .sheet:is([open]):where(:not([data-closing])) {
    translate: 0 0;
    transition-duration: 0.42s;
    transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
    @starting-style { translate: 0 100%; }
  }
}
@media (prefers-reduced-motion: reduce) {
  .sheet { transition-duration: 0.1s; }
}
@media (forced-colors: active) {
  .sheet { border: 1px solid CanvasText; border-block-end: 0; }
}

/* The inspector is the sheet's surface: no card edge, and as tall as the sheet. */
.sheet > .insp { min-block-size: 100%; border-radius: inherit; box-shadow: none; overflow: clip; }
.sheet .insp-hero { position: sticky; inset-block-start: 0; z-index: 2; padding-block-start: 16px; }
/* The hairline a plain hero draws over itself would stay put while the hero sticks. */
.sheet > .insp::after { display: none; }
.sheet .insp-hero[data-plain] { box-shadow: inset 0 -1.5px 0 var(--line); }
.sheet .insp-body { padding-block-end: 22px; }
`;

const supportsExit = (): boolean => {
  if (!CSS.supports('overlay', 'auto')) return false;
  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.append(probe);
  getComputedStyle(probe).display;
  probe.style.display = 'none';
  const kept = getComputedStyle(probe).display === 'block';
  probe.remove();
  return kept;
};

/** Close with the sinking transition, where the browser can't keep a closing dialog drawn itself. */
const closeSheet = async (dialog: HTMLDialogElement) => {
  if (!supportsExit()) {
    dialog.setAttribute('data-closing', '');
    const running = dialog.getAnimations({ subtree: false });
    if (running.length > 0) {
      await Promise.race([
        Promise.allSettled(running.map((a) => a.finished)),
        new Promise((done) => setTimeout(done, 600)),
      ]);
    }
    if (!dialog.hasAttribute('data-closing')) return;
    dialog.removeAttribute('data-closing');
  }
  dialog.close();
};

/** The selected key's tile in the grid, which takes focus when the sheet closes. */
const selectedTile = () =>
  document.querySelector<HTMLElement>(
    '[role="radiogroup"][aria-label="Keys"] [role="radio"][aria-checked="true"]',
  );

export const KeySheet = () => {
  const [open, setOpen] = useAtom(keySheetOpenAtom);
  const index = useAtomValue(selectedKeyAtom);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.removeAttribute('data-closing');
      // React doesn't write `autofocus`; the dialog's focusing steps read the attribute.
      dialog.setAttribute('autofocus', '');
      dialog.scrollTop = 0;
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onClose = () => {
      dialog.removeAttribute('data-closing');
      setOpen(false);
      // After the browser has put focus back on the tile that opened the sheet.
      const tile = selectedTile();
      if (tile && tile !== document.activeElement) tile.focus({ focusVisible: false });
    };
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, [setOpen]);

  useLightDismiss(ref);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={`Key ${index + 1}`}
      // The sheet itself takes focus as it opens, so its name is read and Tab
      // starts at the top; the form inside isn't jumped into.
      tabIndex={-1}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <style>{CSS_TEXT}</style>
      <Inspector
        picker={<ChannelGrid variant="pick" />}
        onClose={() => {
          if (ref.current) void closeSheet(ref.current);
        }}
      />
    </dialog>
  );
};
