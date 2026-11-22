/**
 * Sessions: the editor's work is saved as you go, and every system you've
 * worked on is kept in a list to come back to. What's saved is the original
 * file bytes plus the edited channels and keys; on opening, the files are
 * parsed again to recover `source`, so a re-export stays byte-exact.
 * Everything stays in this browser's localStorage.
 */

import type { Channel, Key } from '@mcmillan/me1-mate-core';
import { atom, type Setter, useAtomValue, useStore } from 'jotai';
import { useEffect, useRef } from 'react';
import { blank, type Editable, fromSystem, isBlank, keyLabel } from './edit.ts';
import { type LoadedFile, type LoadedFiles, load } from './files.ts';
import {
  configNameAtom,
  dirtyAtom,
  editAtom,
  filesAtom,
  replaceSystemAtom,
  screenAtom,
  sessionIdAtom,
  startedAtom,
  systemAtom,
  toastAtom,
} from './store.ts';

/** The list of sessions, newest first: enough to show them without reading each one. */
const INDEX_KEY = 'me1-mate:sessions:v1';
const bodyKey = (id: string): string => `me1-mate:session:v1:${id}`;
/** Older sessions beyond this many are dropped, oldest first. */
const MAX_SESSIONS = 12;
const DEBOUNCE_MS = 500;

interface SavedFile {
  readonly name: string;
  /** The file's bytes, base64. */
  readonly data: string;
}

/** A session as listed: what it's called, when it was last worked on, and a sketch of its keys. */
export interface SessionSummary {
  readonly id: string;
  /** When it was last saved, ms since the epoch. */
  readonly savedAt: number;
  readonly configName: string;
  /** The names of the files it was loaded from, if any. */
  readonly files: { readonly me1?: string; readonly meu?: string };
  /** Whether it has edits that haven't been exported. */
  readonly dirty: boolean;
  /** Each key's type and label, to draw a small picture of the system. */
  readonly keys: readonly { readonly type: Key['type']; readonly label: string }[];
}

/** A whole saved session, as stored. */
interface Session {
  readonly version: 1;
  readonly id: string;
  readonly savedAt: number;
  readonly configName: string;
  readonly files: { readonly me1?: SavedFile; readonly meu?: SavedFile };
  readonly channels: readonly Channel[];
  readonly keys: readonly Key[];
  readonly dirty: boolean;
}

// ---- base64 ----------------------------------------------------------------

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array => {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/** Encoding the files on every keystroke is waste; they only change on load. */
const encoded = new WeakMap<LoadedFile, SavedFile>();
const saveFile = (file: LoadedFile): SavedFile => {
  let saved = encoded.get(file);
  if (!saved) {
    saved = { name: file.name, data: toBase64(file.data) };
    encoded.set(file, saved);
  }
  return saved;
};

// ---- storage ---------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isSession = (value: unknown): value is Session =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.savedAt === 'number' &&
  typeof value.configName === 'string' &&
  isRecord(value.files) &&
  Array.isArray(value.channels) &&
  Array.isArray(value.keys);

const isSummary = (value: unknown): value is SessionSummary =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.savedAt === 'number' &&
  typeof value.configName === 'string' &&
  isRecord(value.files) &&
  Array.isArray(value.keys);

const readJSON = (key: string): unknown => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
};

const remove = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable: nothing to remove.
  }
};

type WriteResult = 'ok' | 'full' | 'unavailable';

const write = (key: string, value: unknown): WriteResult => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return 'ok';
  } catch (error) {
    return error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
      ? 'full'
      : 'unavailable';
  }
};

const summarise = (session: Session): SessionSummary => {
  const system: Editable = { channels: session.channels, keys: session.keys };
  return {
    id: session.id,
    savedAt: session.savedAt,
    configName: session.configName,
    files: {
      ...(session.files.me1 ? { me1: session.files.me1.name } : {}),
      ...(session.files.meu ? { meu: session.files.meu.name } : {}),
    },
    dirty: session.dirty,
    keys: session.keys.map((key) => ({ type: key.type, label: keyLabel(system, key) })),
  };
};

const newestFirst = (list: readonly SessionSummary[]): SessionSummary[] =>
  [...list].sort((a, b) => b.savedAt - a.savedAt);

/** The saved sessions, newest first. */
const readIndex = (): SessionSummary[] => {
  const stored = readJSON(INDEX_KEY);
  return newestFirst(Array.isArray(stored) ? stored.filter(isSummary) : []);
};

/**
 * Save a session and list it, dropping the oldest sessions beyond the limit,
 * and more of them if the browser's storage is full. Returns the new list, or
 * why it couldn't be saved.
 */
const storeSession = (
  session: Session,
  current: readonly SessionSummary[],
): { readonly list: SessionSummary[] } | { readonly failed: Exclude<WriteResult, 'ok'> } => {
  let others = newestFirst(current.filter((s) => s.id !== session.id));
  for (const dropped of others.slice(MAX_SESSIONS - 1)) remove(bodyKey(dropped.id));
  others = others.slice(0, MAX_SESSIONS - 1);
  for (;;) {
    const result = write(bodyKey(session.id), session);
    if (result === 'ok') break;
    const oldest = others.pop();
    if (result !== 'full' || !oldest) return { failed: result };
    remove(bodyKey(oldest.id));
  }
  const list = [summarise(session), ...others];
  const listed = write(INDEX_KEY, list);
  return listed === 'ok' ? { list } : { failed: listed };
};

// ---- the list --------------------------------------------------------------

/** Every saved session, newest first, for the home screen. */
export const sessionsAtom = atom<readonly SessionSummary[]>(readIndex());

/** Forget a session. */
export const deleteSessionAtom = atom(null, (get, set, id: string) => {
  remove(bodyKey(id));
  const list = get(sessionsAtom).filter((s) => s.id !== id);
  write(INDEX_KEY, list);
  set(sessionsAtom, list);
});

// ---- opening ---------------------------------------------------------------

const toFile = (saved: SavedFile): File =>
  new File([fromBase64(saved.data) as BlobPart], saved.name);

/** The system as it stood when a session was opened: opening one isn't a change worth saving. */
let asOpened: Editable | null = null;

/**
 * Rebuild the editor from a saved session: the files are parsed again for
 * their `source`, and the saved channels and keys go over the top. Unsaved
 * edits come back as one undoable step over the files as loaded (or a blank
 * system), so the session is still marked unsaved and Undo returns to where
 * it started. Resolves `false` if the files couldn't be read again, in which
 * case only the channels and keys came back.
 */
const restore = async (session: Session, set: Setter): Promise<boolean> => {
  const incoming = [session.files.me1, session.files.meu].flatMap((f) => (f ? [toFile(f)] : []));
  let base: Editable = blank();
  let files: LoadedFiles = {};
  let ok = true;
  if (incoming.length > 0) {
    const loaded = await load(incoming, {});
    if (loaded.ok) {
      base = fromSystem(loaded.system);
      files = loaded.files;
    } else {
      ok = false;
    }
  }
  const restored: Editable = { ...base, channels: session.channels, keys: session.keys };
  const identity = { files, configName: session.configName, sessionId: session.id };
  asOpened = restored;
  if (session.dirty && ok) {
    set(replaceSystemAtom, { system: base, ...identity });
    set(editAtom, () => restored);
  } else {
    set(replaceSystemAtom, { system: restored, ...identity });
  }
  return ok;
};

/**
 * Open a saved session in the editor. Resolves `false`, with a notice, if it
 * is gone or unreadable.
 */
export const openSessionAtom = atom(null, async (get, set, id: string): Promise<boolean> => {
  // Still open behind the home screen: go back to it as it is, undo history and all.
  if (id === get(sessionIdAtom) && get(startedAtom)) {
    set(screenAtom, 'editor');
    return true;
  }
  const session = readJSON(bodyKey(id));
  if (!isSession(session)) {
    set(
      sessionsAtom,
      get(sessionsAtom).filter((s) => s.id !== id),
    );
    set(toastAtom, { message: 'That session couldn’t be opened', tone: 'error' });
    return false;
  }
  const ok = await restore({ ...session, id }, set).catch(() => null);
  if (ok === null) {
    set(toastAtom, { message: 'That session couldn’t be opened', tone: 'error' });
    return false;
  }
  if (!ok) {
    set(toastAtom, {
      message: 'The original files couldn’t be read again; your channels and keys are back',
      tone: 'error',
    });
  }
  return true;
});

// ---- saving ----------------------------------------------------------------

/**
 * Save the open session to localStorage a moment after each change, and keep
 * the list of sessions in step. A blank system with nothing loaded isn't
 * worth keeping and is taken off the list. Storage that's unavailable or full
 * is skipped quietly, with one notice if it's full.
 */
export const useAutosave = (): void => {
  const store = useStore();
  const started = useAtomValue(startedAtom);
  const sessionId = useAtomValue(sessionIdAtom);
  const system = useAtomValue(systemAtom);
  const configName = useAtomValue(configNameAtom);
  const files = useAtomValue(filesAtom);
  const dirty = useAtomValue(dirtyAtom);
  const warned = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  /** What was last saved (or opened), so the same thing isn't saved twice. */
  const last = useRef<{
    system: Editable;
    configName: string;
    files: LoadedFiles;
    dirty: boolean;
  } | null>(null);

  useEffect(() => {
    if (!started) return;
    if (asOpened === system) {
      last.current = { system, configName, files, dirty };
      asOpened = null;
    }
    const before = last.current;
    if (
      before?.system === system &&
      before.configName === configName &&
      before.files === files &&
      before.dirty === dirty
    ) {
      return;
    }
    const save = () => {
      // Already saved early (going home, closing the tab): don't save it again later.
      if (pending.current !== save) return;
      pending.current = null;
      last.current = { system, configName, files, dirty };
      // A blank system with nothing loaded isn't a session worth keeping.
      if (!files.me1 && !files.meu && isBlank(system)) {
        if (store.get(sessionsAtom).some((s) => s.id === sessionId)) {
          store.set(deleteSessionAtom, sessionId);
        }
        return;
      }
      const result = storeSession(
        {
          version: 1,
          id: sessionId,
          savedAt: Date.now(),
          configName,
          files: {
            ...(files.me1 ? { me1: saveFile(files.me1) } : {}),
            ...(files.meu ? { meu: saveFile(files.meu) } : {}),
          },
          channels: system.channels,
          keys: system.keys,
          dirty,
        },
        store.get(sessionsAtom),
      );
      if ('list' in result) {
        store.set(sessionsAtom, result.list);
      } else if (result.failed === 'full' && !warned.current) {
        warned.current = true;
        store.set(toastAtom, {
          message: 'Browser storage is full, so this session won’t be kept after a reload',
          tone: 'info',
        });
      }
    };
    pending.current = save;
    const timer = setTimeout(save, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      // Leaving this session for another: save it now, before the other takes over.
      if (pending.current === save && store.get(sessionIdAtom) !== sessionId) save();
    };
  }, [store, started, sessionId, system, configName, files, dirty]);

  // The home screen lists sessions: have the open one saved before it's shown.
  const screen = useAtomValue(screenAtom);
  useEffect(() => {
    if (screen === 'home') pending.current?.();
  }, [screen]);

  // Don't lose the last half-second of edits when the tab closes.
  useEffect(() => {
    const flush = () => pending.current?.();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);
};
