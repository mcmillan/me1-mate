/**
 * Opening files. The Open buttons and a drop on the window all come through
 * here, so there is one file input on the page.
 */

import { atom, useSetAtom } from 'jotai';
import { kindsOf } from '../lib/files.ts';
import { openFilesAtom as openConfigFilesAtom, toastAtom } from '../lib/store.ts';

/**
 * Open picked or dropped files; files of other kinds are turned away with a
 * note. Opening never replaces anything (see `openFilesAtom` in the store),
 * so there's nothing to confirm.
 */
export const openFilesAtom = atom(null, (_get, set, files: readonly File[]) => {
  if (files.length === 0) return;
  if (kindsOf(files).length === 0) {
    set(toastAtom, { message: 'Only .ME1 and .meu files can be opened here', tone: 'error' });
    return;
  }
  void set(openConfigFilesAtom, files);
});

/** The page's one file input, rendered by `OpenFiles`. */
let picker: HTMLInputElement | null = null;

/** Show the browser's file chooser. Call it from a click, or the browser won't. */
export const chooseFiles = (): void => picker?.click();

/** The hidden file input. Render it once. */
export const OpenFiles = () => {
  const open = useSetAtom(openFilesAtom);
  return (
    <input
      ref={(el) => {
        picker = el;
        return () => {
          picker = null;
        };
      }}
      type="file"
      accept=".ME1,.me1,.meu"
      multiple
      hidden
      style={{ display: 'none' }}
      onChange={(e) => {
        // Copy before clearing: the FileList is live and empties with the value.
        const picked = Array.from(e.currentTarget.files ?? []);
        e.currentTarget.value = '';
        open(picked);
      }}
    />
  );
};
