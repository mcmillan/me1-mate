/**
 * Say something to screen readers without showing it: for a change the page
 * shows only by looking different, such as an undo made from the keyboard.
 */

let region: HTMLElement | undefined;

const regionElement = (): HTMLElement => {
  if (region?.isConnected) return region;
  const el = document.createElement('div');
  el.setAttribute('aria-live', 'polite');
  Object.assign(el.style, {
    position: 'absolute',
    clipPath: 'inset(50%)',
    overflow: 'hidden',
    width: '1px',
    height: '1px',
    margin: '-1px',
    whiteSpace: 'nowrap',
  });
  document.body.append(el);
  region = el;
  return el;
};

export const announce = (message: string): void => {
  const el = regionElement();
  // Clear first, so saying the same thing twice is announced twice.
  el.textContent = '';
  requestAnimationFrame(() => {
    el.textContent = message;
  });
};
