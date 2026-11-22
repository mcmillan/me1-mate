/**
 * Keyboard shortcuts for the editor: ⌘Z / Ctrl+Z undoes, ⇧⌘Z / Ctrl+Shift+Z /
 * Ctrl+Y redoes, while the editor is showing. What happened is announced,
 * since nothing else tells a screen reader.
 *
 * In a text field the browser's own undo wins: someone fixing a typo in a name
 * expects ⌘Z to take back their last characters, not to jump the whole system
 * back a step from under the caret. Outside text fields the app's history
 * applies. ⌘S is left to the browser.
 */

import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { useEffect } from 'react';
import { announce } from './announce.ts';
import { canRedoAtom, canUndoAtom, redoAtom, screenAtom, undoAtom } from './store.ts';

const isTextEntry = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'range', 'reset', 'submit', 'file', 'color'].includes(
      target.type,
    );
  }
  return false;
};

export const useShortcuts = (): void => {
  const editing = useAtomValue(screenAtom) === 'editor';
  const undo = useSetAtom(undoAtom);
  const redo = useSetAtom(redoAtom);
  const store = useStore();

  useEffect(() => {
    if (!editing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.altKey) return;
      if (!(e.metaKey || e.ctrlKey) || isTextEntry(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        announce(store.get(canUndoAtom) ? 'Undone' : 'Nothing to undo');
        undo();
      } else if ((key === 'z' && e.shiftKey) || (key === 'y' && e.ctrlKey && !e.shiftKey)) {
        e.preventDefault();
        announce(store.get(canRedoAtom) ? 'Redone' : 'Nothing to redo');
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editing, undo, redo, store]);
};
