import { type ReactNode, useEffect, useId, useRef } from 'react';
import { Theme, useThemeName } from 'tamagui';
import { Action } from './ui.tsx';

/**
 * The native modal gives the inert page, focus containment, Esc and focus
 * return. Tamagui's reset unsets the UA styles on `dialog`, so this restores
 * the closed state and the centred modal box, dims the backdrop and keeps
 * scrolling from chaining to the page behind. The box is a raised card; it
 * pops in where motion is welcome (`@starting-style` gives the first frame).
 */
const CSS = `
.confirm-dialog:not([open]) { display: none; }
.confirm-dialog[open] { display: block; box-sizing: border-box; padding: 22px; border: 1.5px solid var(--line); border-radius: 24px; background: var(--card); color: var(--ink); box-shadow: var(--shadow); }
.confirm-dialog:modal { position: fixed; inset: 0; margin: auto; width: min(420px, calc(100vw - 32px)); height: fit-content; max-height: calc(100dvh - 32px); overflow: auto; overscroll-behavior: contain; }
.confirm-dialog::backdrop { background: rgb(19 19 22 / 0.45); overflow: hidden; overscroll-behavior: contain; }
@media (prefers-color-scheme: dark) {
  .confirm-dialog::backdrop { background: rgb(0 0 0 / 0.6); }
}
.confirm-title { margin: 0; font-size: 1.375rem; font-weight: var(--w-display); line-height: 1.2; text-wrap: balance; }
.confirm-message { display: block; margin: 6px 0 0; font-size: 0.875rem; font-weight: var(--w-text); line-height: 1.45; overflow-wrap: break-word; text-wrap: pretty; }
.confirm-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-block-start: 20px; }
.confirm-actions button { min-block-size: max(38px, var(--target)); }
@media (prefers-reduced-motion: no-preference) {
  .confirm-dialog[open] { transition: opacity 150ms ease-out, scale 300ms var(--spring); }
  .confirm-dialog[open]::backdrop { transition: opacity 150ms ease-out; }
  @starting-style {
    .confirm-dialog[open] { opacity: 0; scale: 0.94; }
    .confirm-dialog[open]::backdrop { opacity: 0; }
  }
  .confirm-actions button { transition: scale 200ms var(--spring), background-color 120ms ease-out, border-color 120ms ease-out; }
  .confirm-actions button:active { scale: 0.96; }
}
`;

/**
 * The red pill: the red theme's primary `Action`, in the red the warning signs
 * use, with text that reads on it in each colour scheme. Spread it onto an
 * `Action kind="primary"` inside the red theme.
 */
export const useRedPill = () => {
  const dark = useThemeName().startsWith('dark');
  const fill = { default: 'color-7', hover: 'color-8', press: 'color-8' } as const;
  return { bg: fill, borderColor: fill, color: dark ? 'color-1' : '#fff' } as const;
};

/** Outside the dialog's box: the pointer, not the target, since padding also targets the dialog. */
const outside = (e: PointerEvent, dialog: HTMLDialogElement) => {
  const r = dialog.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
};

/**
 * A modal confirmation for a destructive action, on a native `<dialog>`.
 * Escape, the back gesture, a backdrop click and Cancel all report `false`;
 * only the confirm button reports `true`. Cancel takes focus, so Enter is safe.
 */
export const ConfirmDialog = ({
  open,
  title,
  children,
  confirmLabel,
  onClose,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly children: ReactNode;
  readonly confirmLabel: string;
  readonly onClose: (confirmed: boolean) => void;
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const id = useId();
  const redPill = useRedPill();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // Focus the safe action. Tamagui doesn't pass React's autoFocus through,
      // so set the attribute the dialog's own focusing steps read.
      dialog.querySelector('button[value="cancel"]')?.setAttribute('autofocus', '');
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const close = () => {
      const confirmed = dialog.returnValue === 'confirm';
      // Esc sets no value and browsers differ on clearing the last one.
      dialog.returnValue = '';
      onCloseRef.current(confirmed);
    };
    dialog.addEventListener('close', close);
    // `closedby="any"` light-dismisses natively; elsewhere (Safari), close on
    // a press and release both outside the box.
    let pressedOutside = false;
    const down = (e: PointerEvent) => {
      pressedOutside = outside(e, dialog);
    };
    const up = (e: PointerEvent) => {
      if (pressedOutside && outside(e, dialog)) dialog.close();
    };
    const fallback = !('closedBy' in HTMLDialogElement.prototype);
    if (fallback) {
      dialog.addEventListener('pointerdown', down);
      dialog.addEventListener('pointerup', up);
    }
    return () => {
      dialog.removeEventListener('close', close);
      dialog.removeEventListener('pointerdown', down);
      dialog.removeEventListener('pointerup', up);
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-message`}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <style>{CSS}</style>
      <form method="dialog">
        <h2 id={`${id}-title`} className="display confirm-title">
          {title}
        </h2>
        <p id={`${id}-message`} className="confirm-message">
          {children}
        </p>
        <div className="confirm-actions">
          <Action kind="subtle" px="4" type="submit" value="cancel">
            Cancel
          </Action>
          <Theme name="red">
            <Action kind="primary" px="4" type="submit" value="confirm" {...redPill}>
              {confirmLabel}
            </Action>
          </Theme>
        </div>
      </form>
    </dialog>
  );
};
