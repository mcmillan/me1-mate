import { atom, useAtom } from 'jotai';
import { Fragment, useEffect, useId, useRef } from 'react';
import { useLightDismiss } from './ConfirmDialog.tsx';
import { Action } from './ui.tsx';

/** Whether the keyboard shortcuts sheet is open; `?` in the editor opens it. */
export const shortcutsOpenAtom = atom(false);

const MAC = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');
const MOD = MAC ? '⌘' : 'Ctrl';

/** Each row: the keys (alternatives separated), then what they do. */
const SECTIONS: readonly {
  readonly title: string;
  readonly rows: readonly (readonly [readonly string[], string])[];
}[] = [
  {
    title: 'Anywhere in the editor',
    rows: [
      [[`${MOD} Z`], 'Undo'],
      [[MAC ? '⇧ ⌘ Z' : 'Ctrl Shift Z', ...(MAC ? [] : ['Ctrl Y'])], 'Redo'],
      [['?'], 'Show these shortcuts'],
      [['Esc'], 'Close a dialog, a menu or the tour'],
    ],
  },
  {
    title: 'Keys and channels',
    rows: [
      [['← → ↑ ↓'], 'Move between keys, or between channels'],
      [['Home', 'End'], 'First or last key'],
      [['Space', 'Enter'], 'Select a key, or pick a channel for it'],
      [['Enter'], 'In a channel name: go to the next name'],
      [['Shift Enter'], 'In a channel name: go back a name'],
    ],
  },
  {
    title: 'Levels and pan',
    rows: [
      [['← →'], 'Level down or up 0.5 dB'],
      [['Shift ← →', 'Page Up', 'Page Down'], 'Level down or up 3 dB'],
      [['0'], 'Level to 0 dB'],
      [['Home', 'End'], 'Level off, or to the most'],
      [['C', '0'], 'On pan: centre it'],
    ],
  },
];

const CSS = `
.sc-dialog:not([open]) { display: none; }
.sc-dialog[open] { display: block; box-sizing: border-box; padding: 22px; border: 1.5px solid var(--line); border-radius: 24px; background: var(--card); color: var(--ink); box-shadow: var(--shadow); }
.sc-dialog:modal { position: fixed; inset: 0; margin: auto; width: min(520px, calc(100vw - 32px)); height: fit-content; max-height: calc(100dvh - 32px); overflow: auto; overscroll-behavior: contain; }
.sc-dialog::backdrop { background: rgb(19 19 22 / 0.45); overflow: hidden; overscroll-behavior: contain; }
@media (prefers-color-scheme: dark) { .sc-dialog::backdrop { background: rgb(0 0 0 / 0.6); } }
.sc-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.sc-title { margin: 0; font-size: 1.375rem; font-weight: var(--w-display); line-height: 1.2; }
.sc-section { margin-block-start: 18px; }
.sc-section h3 { margin: 0 0 6px; color: var(--muted); font-size: 0.8125rem; font-weight: var(--w-ui); }
/* One key column for every section, so the descriptions line up down the sheet. */
.sc-list { display: grid; grid-template-columns: 11.5rem 1fr; gap: 8px 16px; align-items: baseline; margin: 0; }
.sc-list dt { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; }
.sc-list dd { margin: 0; font-size: 0.875rem; font-weight: var(--w-text); line-height: 1.4; text-wrap: pretty; }
.sc-or { color: var(--muted); font-size: 0.75rem; }
.sc-dialog kbd { display: inline-block; min-inline-size: 1.6em; padding: 1px 7px 2px; border: 1.5px solid var(--line); border-block-end-width: 2.5px; border-radius: 7px; background: var(--well); color: var(--ink); font: inherit; font-size: 0.8125rem; font-weight: var(--w-ui); text-align: center; white-space: nowrap; }
@media (max-width: 420px) {
  .sc-list { grid-template-columns: 1fr; gap: 2px; }
  .sc-list dd { margin-block-end: 8px; }
}
@media (prefers-reduced-motion: no-preference) {
  .sc-dialog[open] { transition: opacity 150ms ease-out, scale 300ms var(--spring); }
  .sc-dialog[open]::backdrop { transition: opacity 150ms ease-out; }
  @starting-style {
    .sc-dialog[open] { opacity: 0; scale: 0.96; }
    .sc-dialog[open]::backdrop { opacity: 0; }
  }
}
`;

/**
 * The keyboard shortcuts sheet: a native modal listing every shortcut the
 * editor has. Opened by `?` (`lib/shortcuts.ts`) or the phone's ⋯ menu; Esc,
 * Done and a click outside close it. Keep it in step with the handlers.
 */
export const Shortcuts = () => {
  const [open, setOpen] = useAtom(shortcutsOpenAtom);
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const close = () => setOpen(false);
    dialog.addEventListener('close', close);
    return () => dialog.removeEventListener('close', close);
  }, [setOpen]);
  useLightDismiss(ref);

  return (
    <dialog
      ref={ref}
      className="sc-dialog"
      aria-labelledby={`${id}-title`}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <style>{CSS}</style>
      <form method="dialog">
        <div className="sc-head">
          <h2 id={`${id}-title`} className="display sc-title">
            Keyboard shortcuts
          </h2>
          <Action kind="subtle" px="4" type="submit" value="done">
            Done
          </Action>
        </div>
        {SECTIONS.map((section) => (
          <section key={section.title} className="sc-section" aria-label={section.title}>
            <h3>{section.title}</h3>
            <dl className="sc-list">
              {section.rows.map(([keys, what]) => (
                <Fragment key={`${keys.join()}${what}`}>
                  <dt>
                    {keys.map((k, i) => (
                      <Fragment key={k}>
                        {i > 0 && <span className="sc-or">or</span>}
                        <kbd>{k}</kbd>
                      </Fragment>
                    ))}
                  </dt>
                  <dd>{what}</dd>
                </Fragment>
              ))}
            </dl>
          </section>
        ))}
      </form>
    </dialog>
  );
};
