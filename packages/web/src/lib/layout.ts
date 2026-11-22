/**
 * The phone layout. Matching `PHONE_QUERY` the editor isn't one page: the key
 * grid is the home screen, a key opens in a sheet (`keySheetOpenAtom` in the
 * store) with its channel picker, and channels are named on a screen of their
 * own (`phoneScreenAtom`). Otherwise the editor is the one page it has always
 * been. The components are the same in both; this only says which
 * arrangement is showing.
 */

import { useSyncExternalStore } from 'react';

/**
 * Narrower than 700px, or a touch screen shorter than 500px (a phone on its
 * side), the editor uses the phone layout. Keep in step with styles.css.
 */
export const PHONE_QUERY = '(max-width: 699.98px), (max-height: 499.98px) and (pointer: coarse)';

const query = (): MediaQueryList | undefined =>
  typeof window === 'undefined' ? undefined : window.matchMedia(PHONE_QUERY);

const subscribe = (onChange: () => void): (() => void) => {
  const list = query();
  list?.addEventListener('change', onChange);
  return () => list?.removeEventListener('change', onChange);
};

/** Whether the window is narrow enough for the phone layout, now. */
export const isPhone = (): boolean => query()?.matches ?? false;

/** Whether the editor is in its phone layout; re-renders when the window crosses the line. */
export const usePhone = (): boolean => useSyncExternalStore(subscribe, isPhone, () => false);

/** The two screens of the phone editor, chosen with the Keys | Channels switch. */
export type PhoneScreen = 'keys' | 'channels';

/**
 * Where, in the phone layout, the field for an issue at `path` is: a key's
 * (0-based) sheet, the Channels screen, or nowhere in particular (a problem
 * with the whole file).
 */
export type PhonePlace =
  | { readonly screen: 'keys'; readonly key: number }
  | { readonly screen: 'channels' }
  | { readonly screen: undefined };

export const phonePlaceOf = (path: string): PhonePlace => {
  const key = path.match(/^keys\[(\d+)\]/);
  if (key) return { screen: 'keys', key: Number(key[1]) };
  if (/^(channels|meu\.Channels)\[/.test(path)) return { screen: 'channels' };
  return { screen: undefined };
};
