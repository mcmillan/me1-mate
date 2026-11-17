/**
 * App state as Jotai atoms. The source of truth is one editable system; what
 * it builds to, and whether the ME-1 would accept it, are derived from it.
 * Every edit goes through `editAtom`, which records history for undo.
 */

import { buildME1Config, buildMEUConfig, type Issue } from '@mcmillan/2me2u-core';
import { atom } from 'jotai';
import { blank, clean, type Editable, fromSystem } from './edit.ts';
import { configNameOf, type Loaded, type LoadedFiles, load } from './files.ts';

// ---- the system ------------------------------------------------------------

/** The system the page opens with: one object, so it isn't taken for an edit. */
const initial = blank();

export const systemAtom = atom<Editable>(initial);
export const filesAtom = atom<LoadedFiles>({});
/** The 8.3 stem the `.ME1` is saved under; the ME-1 shows it as the config's name. */
export const configNameAtom = atom('NEWMIX');
/** Problems reading the last dropped files. */
export const loadIssuesAtom = atom<readonly Issue[]>([]);

/**
 * False until the user loads files, starts a new system or makes an edit, or
 * the last session is brought back. Until then the page shows how to begin,
 * and nothing is autosaved.
 */
export const startedAtom = atom(false);

const draftAtom = atom((get) => clean(get(systemAtom)));
export const me1Atom = atom((get) => buildME1Config(get(draftAtom)));
export const meuAtom = atom((get) => buildMEUConfig(get(draftAtom)));

/** Each file's contents as last loaded, created or exported; `null` where it couldn't be built. */
interface Saved {
  readonly me1: Uint8Array | null;
  readonly meu: string | null;
}

const built = (system: Editable): Saved => {
  const draft = clean(system);
  const me1 = buildME1Config(draft);
  const meu = buildMEUConfig(draft);
  return { me1: me1.isOk ? me1.value : null, meu: meu.isOk ? meu.value : null };
};

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

const savedAtom = atom<Saved>(built(initial));
/** The system as last loaded or created, for when the files can't be built to compare. */
const baselineAtom = atom<Editable>(initial);

/**
 * Whether either file would come out different from the one last loaded or
 * exported. The files are tracked separately, so exporting only the `.ME1`
 * doesn't hide unsaved channel names, and an edit that is undone, or changes
 * nothing in the files, isn't unsaved work.
 */
export const dirtyAtom = atom((get) => {
  const saved = get(savedAtom);
  const me1 = get(me1Atom);
  const meu = get(meuAtom);
  if (!me1.isOk || !meu.isOk || saved.me1 === null || saved.meu === null) {
    return get(systemAtom) !== get(baselineAtom);
  }
  return !sameBytes(me1.value, saved.me1) || meu.value !== saved.meu;
});
/** Why the ME-1 would reject the system as it stands; empty when it's valid. */
export const issuesAtom = atom((get): readonly Issue[] => {
  const me1 = get(me1Atom);
  return me1.isErr ? me1.error : [];
});

// ---- the editor ------------------------------------------------------------

/** The key open in the inspector (0-based); picking a channel assigns it to this key. */
export const selectedKeyAtom = atom(0);
/**
 * A key (0-based) the pointer or focus is on, so the channels it plays can be
 * pointed out, and a channel's key can be pointed out on the key grid.
 */
export const highlightKeyAtom = atom<number | null>(null);

// ---- history ---------------------------------------------------------------

const HISTORY_LIMIT = 200;
const pastAtom = atom<readonly Editable[]>([]);
const futureAtom = atom<readonly Editable[]>([]);
export const canUndoAtom = atom((get) => get(pastAtom).length > 0);
export const canRedoAtom = atom((get) => get(futureAtom).length > 0);

/** Edits with the same merge key this close together become one undo step. */
const MERGE_WINDOW_MS = 1500;
let lastMerge: { key: string; at: number } | null = null;

/**
 * Apply a pure edit to the system, recording it for undo. No-op edits aren't
 * recorded. Pass a `mergeKey` (e.g. the field's issue path, `keys[3].name`) for
 * edits made by typing, so a word typed into one field undoes in one step.
 */
export const editAtom = atom(
  null,
  (get, set, edit: (system: Editable) => Editable, mergeKey?: string) => {
    const before = get(systemAtom);
    const after = edit(before);
    if (after === before) return;
    const now = Date.now();
    const merge =
      mergeKey !== undefined &&
      lastMerge?.key === mergeKey &&
      now - lastMerge.at < MERGE_WINDOW_MS &&
      get(pastAtom).length > 0;
    if (!merge) set(pastAtom, [...get(pastAtom), before].slice(-HISTORY_LIMIT));
    lastMerge = mergeKey === undefined ? null : { key: mergeKey, at: now };
    set(futureAtom, []);
    set(systemAtom, after);
    set(startedAtom, true);
  },
);

export const undoAtom = atom(null, (get, set) => {
  lastMerge = null;
  set(highlightKeyAtom, null);
  const past = get(pastAtom);
  const previous = past.at(-1);
  if (!previous) return;
  set(pastAtom, past.slice(0, -1));
  set(futureAtom, [get(systemAtom), ...get(futureAtom)]);
  set(systemAtom, previous);
});

export const redoAtom = atom(null, (get, set) => {
  lastMerge = null;
  set(highlightKeyAtom, null);
  const [next, ...rest] = get(futureAtom);
  if (!next) return;
  set(futureAtom, rest);
  set(pastAtom, [...get(pastAtom), get(systemAtom)]);
  set(systemAtom, next);
});

// ---- toasts ----------------------------------------------------------------

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly tone: 'info' | 'success' | 'error';
}
export const toastsAtom = atom<readonly Toast[]>([]);
let nextToast = 1;
export const toastAtom = atom(null, (get, set, toast: Omit<Toast, 'id'>) => {
  set(toastsAtom, [...get(toastsAtom), { ...toast, id: nextToast++ }]);
});
export const dismissToastAtom = atom(null, (get, set, id: number) => {
  set(
    toastsAtom,
    get(toastsAtom).filter((t) => t.id !== id),
  );
});

// ---- lifecycle -------------------------------------------------------------

/** Replace the whole system (load, new, restore): resets history and the unsaved marker. */
export const replaceSystemAtom = atom(
  null,
  (_get, set, next: { system: Editable; files?: LoadedFiles; configName?: string }) => {
    lastMerge = null;
    set(systemAtom, next.system);
    set(baselineAtom, next.system);
    set(savedAtom, built(next.system));
    set(highlightKeyAtom, null);
    set(pastAtom, []);
    set(futureAtom, []);
    set(filesAtom, next.files ?? {});
    set(configNameAtom, next.configName ?? 'NEWMIX');
    set(loadIssuesAtom, []);
    set(selectedKeyAtom, 0);
    set(startedAtom, true);
  },
);

/** Start a blank system. */
export const resetAtom = atom(null, (_get, set) => {
  set(replaceSystemAtom, { system: blank() });
});

/** Mark one file as saved, after it's exported. */
export const markSavedAtom = atom(null, (get, set, file: 'me1' | 'meu') => {
  const now = built(get(systemAtom));
  set(savedAtom, { ...get(savedAtom), [file]: now[file] });
});

/** Read dropped or picked files on top of whatever is already loaded, changing nothing yet. */
export const readFilesAtom = atom(null, (get, _set, incoming: Iterable<File>) =>
  load(incoming, get(filesAtom)),
);

/**
 * Put files that were read into the editor, or note why they couldn't be:
 * `loadIssuesAtom` holds the reasons, which the page shows as a notice.
 */
export const openLoadedAtom = atom(null, (get, set, loaded: Loaded) => {
  if (loaded.ok) {
    set(replaceSystemAtom, {
      system: fromSystem(loaded.system),
      files: loaded.files,
      configName: loaded.files.me1 ? configNameOf(loaded.files.me1.name) : get(configNameAtom),
    });
    const names = [loaded.files.me1?.name, loaded.files.meu?.name].filter(Boolean).join(' and ');
    set(toastAtom, { message: `Loaded ${names}`, tone: 'success' });
  } else if (loaded.issues) {
    set(loadIssuesAtom, loaded.issues);
  }
});
