/**
 * Putting focus back after something closes (the key sheet, the tour, a
 * menu): with the keyboard's ring when it was closed from the keyboard, and
 * without it when it was closed with a tap or a click, which would otherwise
 * leave a ring on a phone's key for no reason.
 *
 * `focus({ focusVisible: false })` asks for that, but some browsers (Safari)
 * ignore it and draw the ring for any focus they move. So the element is also
 * marked `data-quiet-focus`, which styles.css uses to hide its ring, until it
 * loses focus or the next key is pressed. Keyboard users always get the ring:
 * any key press clears every mark.
 */

/** Whether the last input was a pointer (a tap or a click) rather than a key. */
let pointerLast = false;

const QUIET = 'data-quiet-focus';

if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    () => {
      pointerLast = true;
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    'keydown',
    () => {
      pointerLast = false;
      for (const el of document.querySelectorAll(`[${QUIET}]`)) el.removeAttribute(QUIET);
    },
    { capture: true },
  );
}

const unmark = (e: Event) => (e.currentTarget as Element).removeAttribute(QUIET);

/**
 * Focus `el` after something has closed, without the ring if the last input
 * was a pointer (or `fromPointer` says so) and with it after a key.
 */
export const returnFocus = (el: HTMLElement, fromPointer: boolean = pointerLast): void => {
  if (fromPointer) {
    el.setAttribute(QUIET, '');
    el.removeEventListener('blur', unmark);
    el.addEventListener('blur', unmark, { once: true });
  } else {
    el.removeAttribute(QUIET);
  }
  if (document.activeElement !== el) el.focus({ preventScroll: true, focusVisible: !fromPointer });
};
