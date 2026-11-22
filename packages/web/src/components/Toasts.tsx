import { useAtomValue, useSetAtom } from 'jotai';
import { type FocusEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dismissToastAtom, screenAtom, type Toast, toastsAtom } from '../lib/store.ts';
import { keyStyle } from '../lib/theme.ts';
import { Action } from './ui.tsx';

/** The mark that leads each toast, so its tone isn't colour alone. */
const TONE_MARK = { success: '✓', error: '⚠', info: '●' } as const;
/**
 * How long a toast stays up, or `null` to stay until dismissed. Successes
 * ("Loaded…", "Saved…") are frequent and also shown elsewhere in the UI, so
 * they go by themselves; errors and notices stay until they're closed.
 */
const DURATION_MS = { success: 5000, info: null, error: null } as const;

const supportsPopover =
  typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover');

/**
 * The container is a manual popover, so it sits in the top layer above any
 * dialog or menu opened before it, and nothing light-dismisses it. Without
 * popover support it stays a fixed, z-indexed box (the `:popover-open` rules
 * are dropped). Its padding is the toasts' distance from the window's edges,
 * inside the box so their shadows aren't clipped. A toast fades in, and also
 * slides in where motion is welcome; the region is gone the moment its last
 * toast is, so a closed region never lingers on the page.
 *
 * A toast is an ink pill, the page's colours the other way round, so its
 * marks are picked for ink: a key's green for done, a key's blue for a note
 * (both deepened where ink is the light colour), and for a problem the red
 * theme's red from the other colour scheme. The dismiss button turns back to
 * the page's colours when focused, so the focus ring has the canvas to show
 * against.
 */
const CSS = `
.toasts { position: fixed; inset: auto 0 0 0; width: auto; height: auto; max-height: 100dvh; overflow-y: auto; margin: 0; padding: 16px; border: 0; background: transparent; color: inherit; z-index: 100; display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none; opacity: 1; }
@media (min-width: 768px) { .toasts { right: auto; padding: 24px; align-items: flex-start; } }
.toasts[popover] { transition: opacity 160ms ease-out; }
.toasts[popover]:not(:popover-open), .toasts:empty { display: none; }
@starting-style { .toasts[popover]:popover-open { opacity: 0; } }
.toast { box-sizing: border-box; display: flex; align-items: center; gap: 10px; max-inline-size: min(100%, 440px); min-block-size: 46px; padding: 4px 5px 4px 16px; border: 1.5px solid transparent; border-radius: 23px; background: var(--ink); color: var(--canvas); box-shadow: var(--shadow); pointer-events: auto; transition: opacity 160ms ease-out; }
@starting-style { .toast { opacity: 0; } }
@media (prefers-reduced-motion: no-preference) {
  .toast { transition: opacity 160ms ease-out, translate 300ms var(--spring); }
  @starting-style { .toast { translate: 0 12px; } }
}
.toast-mark { flex: none; font-size: 1rem; font-weight: var(--w-display); line-height: 1; }
.toast-mark-success { color: var(--k); }
.toast-mark-info { color: var(--k); font-size: 0.625rem; }
.toast-mark-error { color: #ff6467; }
@media (prefers-color-scheme: dark) {
  .toast-mark-success, .toast-mark-info { color: color-mix(in oklab, var(--k) 60%, black); }
  .toast-mark-error { color: #e7000b; }
}
.toast-text { flex: 1; min-inline-size: 0; padding-block: 6px; font-size: 0.875rem; font-weight: var(--w-ui); line-height: 1.3; overflow-wrap: break-word; }
.toast button { min-inline-size: max(34px, var(--target)); min-block-size: max(34px, var(--target)); }
.toast button.toast-x:focus-visible { background: var(--canvas); outline-offset: 0; }
.toast button.toast-x:focus-visible * { color: var(--ink); }
@media (prefers-reduced-motion: no-preference) {
  .toast button { transition: scale 200ms var(--spring), background-color 120ms ease-out; }
  .toast button:active { scale: 0.9; }
}
@media (forced-colors: active) {
  .toast { border-color: CanvasText; }
}
.toasts-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;

/** The key whose colour marks each tone; an error's red is set in the CSS. */
const TONE_KEY = { success: 11, info: 3, error: undefined } as const;

type AriaNotify = (announcement: string) => void;

/** True while a modal `<dialog>` is open; toasts wait until it closes. */
const useModalOpen = (): boolean => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => setOpen(document.querySelector('dialog:modal') !== null);
    const observer = new MutationObserver(check);
    observer.observe(document.body, { subtree: true, attributeFilter: ['open'], childList: true });
    check();
    return () => observer.disconnect();
  }, []);
  return open;
};

const ToastItem = ({
  toast,
  paused,
  onDismiss,
}: {
  readonly toast: Toast;
  readonly paused: boolean;
  readonly onDismiss: (id: number) => void;
}) => {
  const dismiss = useSetAtom(dismissToastAtom);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const duration = DURATION_MS[toast.tone];
  const running = duration !== null && !paused && !hovered && !focused;

  // Count down only while nobody is reading or using the toast.
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => dismiss(toast.id), duration);
    return () => window.clearTimeout(timer);
  }, [running, duration, dismiss, toast.id]);

  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
  };

  const key = TONE_KEY[toast.tone];
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover and focus only pause the countdown
    <div
      className="toast"
      data-toast-id={toast.id}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
    >
      <span
        className={`toast-mark toast-mark-${toast.tone}`}
        style={key === undefined ? undefined : keyStyle(key)}
        aria-hidden="true"
      >
        {TONE_MARK[toast.tone]}
      </span>
      <span className="toast-text">{toast.message}</span>
      <Action
        kind="ghost"
        className="toast-x"
        px="0"
        color="background"
        bg={{ default: 'transparent', hover: 'color-10', press: 'color-10' }}
        aria-label="Dismiss notification"
        onPress={() => onDismiss(toast.id)}
      >
        ✕
      </Action>
    </div>
  );
};

/**
 * Notifications from `toastsAtom`, stacked bottom-centre (bottom left on
 * wider screens) in one "Notifications" region on a manual popover. Each is
 * announced with `ariaNotify()`, or a live region where that's missing.
 * Successes dismiss themselves after a few seconds, waiting while hovered or
 * focused; errors and notices stay until closed. Toasts wait while a modal
 * dialog is open, and those up when the editor goes back to Home are cleared.
 */
export const Toasts = () => {
  const toasts = useAtomValue(toastsAtom);
  const dismiss = useSetAtom(dismissToastAtom);
  const modalOpen = useModalOpen();
  const region = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const announced = useRef(new Set<number>());
  const [liveText, setLiveText] = useState('');

  const open = toasts.length > 0 && !modalOpen;

  // Leaving the editor for Home: what the toasts said was about the editor's
  // work, so they go. Toasts raised on Home afterwards stay.
  const screen = useAtomValue(screenAtom);
  const lastScreen = useRef(screen);
  const toastsNow = useRef(toasts);
  toastsNow.current = toasts;
  useEffect(() => {
    const left = lastScreen.current === 'editor' && screen === 'home';
    lastScreen.current = screen;
    if (left) for (const t of toastsNow.current) dismiss(t.id);
  }, [screen, dismiss]);

  useLayoutEffect(() => {
    const el = region.current;
    if (!el || !supportsPopover) return;
    const isOpen = el.matches(':popover-open');
    if (open && !isOpen) el.showPopover();
    if (!open && isOpen) el.hidePopover();
  }, [open]);

  // Announce each toast's text once, when it's actually visible.
  useEffect(() => {
    if (modalOpen) return;
    const fresh = toasts.filter((t) => !announced.current.has(t.id));
    if (fresh.length === 0) return;
    for (const t of fresh) announced.current.add(t.id);
    const text = fresh.map((t) => t.message).join('. ');
    const notify = (document as Document & { ariaNotify?: AriaNotify }).ariaNotify;
    if (notify) {
      notify.call(document, text);
      return;
    }
    // Clear first so a repeated message is announced again.
    setLiveText('');
    const frame = requestAnimationFrame(() => setLiveText(text));
    return () => cancelAnimationFrame(frame);
  }, [toasts, modalOpen]);

  /** Remember where focus came from, to return it when the last toast closes. */
  const onFocus = (e: FocusEvent<HTMLElement>) => {
    const from = e.relatedTarget as HTMLElement | null;
    if (from && !e.currentTarget.contains(from)) returnFocus.current = from;
  };

  /** Close a toast; if it had focus, move it to the next toast or back where it was. */
  const close = (id: number) => {
    const el = region.current?.querySelector(`[data-toast-id="${id}"]`);
    const hadFocus = el?.contains(document.activeElement) ?? false;
    const index = toasts.findIndex((t) => t.id === id);
    const next = toasts[index + 1] ?? toasts[index - 1];
    dismiss(id);
    if (!hadFocus) return;
    requestAnimationFrame(() => {
      const target = next
        ? region.current?.querySelector<HTMLElement>(`[data-toast-id="${next.id}"] button`)
        : returnFocus.current?.isConnected
          ? returnFocus.current
          : null;
      target?.focus();
    });
  };

  return (
    <>
      <style>{CSS}</style>
      <section
        ref={region}
        className="toasts"
        aria-label="Notifications"
        inert={!open}
        onFocus={onFocus}
        {...(supportsPopover ? ({ popover: 'manual' } as Record<string, string>) : {})}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} paused={!open} onDismiss={close} />
        ))}
      </section>
      {/* Where ariaNotify is missing (Firefox, Safari). A named status, not a loose
          paragraph beside it, so nothing sits outside the page's landmarks. */}
      <div className="toasts-sr" role="status" aria-label="Notifications" aria-live="polite">
        {liveText}
      </div>
    </>
  );
};
