/**
 * Opening files. The Open button, the intro and a drop on the window all come
 * through here, so there is one file input on the page and one place that
 * decides whether opening has to ask first.
 */

import { atom, useAtom, useSetAtom } from 'jotai';
import type { Loaded } from '../lib/files.ts';
import { dirtyAtom, openLoadedAtom, readFilesAtom, toastAtom } from '../lib/store.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

/** Files that were read and are waiting for the user to confirm replacing unsaved edits. */
const pendingAtom = atom<{ readonly loaded: Loaded; readonly names: readonly string[] } | null>(
  null,
);

const isConfig = (file: File): boolean => /\.(me1|meu)$/i.test(file.name);

/**
 * Open picked or dropped files. They are read first, so a file that can't be
 * opened says so without a question; then, with unsaved edits, it asks, since
 * loading replaces the system. Files of other kinds are turned away.
 */
export const openFilesAtom = atom(null, async (get, set, files: readonly File[]) => {
  if (files.length === 0) return;
  if (!files.some(isConfig)) {
    set(toastAtom, { message: 'Only .ME1 and .meu files can be opened here', tone: 'error' });
    return;
  }
  const loaded = await set(readFilesAtom, files);
  if (loaded.ok && get(dirtyAtom)) {
    set(pendingAtom, { loaded, names: files.filter(isConfig).map((file) => file.name) });
  } else {
    set(openLoadedAtom, loaded);
  }
});

/** The page's one file input, rendered by `OpenFiles`. */
let picker: HTMLInputElement | null = null;

/** Show the browser's file chooser. Call it from a click, or the browser won't. */
export const chooseFiles = (): void => picker?.click();

/** The hidden file input and the confirmation. Render it once. */
export const OpenFiles = () => {
  const open = useSetAtom(openFilesAtom);
  const openLoaded = useSetAtom(openLoadedAtom);
  const [pending, setPending] = useAtom(pendingAtom);
  const names = pending?.names ?? [];
  return (
    <>
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
          void open(picked);
        }}
      />
      <ConfirmDialog
        open={pending !== null}
        title="Replace the current system?"
        confirmLabel="Replace"
        onClose={(confirmed) => {
          if (confirmed && pending) openLoaded(pending.loaded);
          setPending(null);
        }}
      >
        Opening {names.length > 0 && names.length <= 2 ? names.join(' and ') : 'these files'}{' '}
        replaces it, and your unsaved changes will be lost.
      </ConfirmDialog>
    </>
  );
};
