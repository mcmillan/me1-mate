/**
 * Visual vocabulary shared by every component. Each key has its own colour,
 * and everything that belongs to a key wears it: its tile, the channels it
 * plays, the inspector while it's selected.
 */

import type { Key } from '@mcmillan/me1-mate-core';
import type { CSSProperties } from 'react';

/** The typeface, for places that set a font family themselves; styles.css sets it for the page. */
export const FONT = 'Allo, system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * One colour per key, 1–16, ordered so neighbours on the 2×8 grid contrast.
 * All are bright enough for dark text (`--on-key`) in both colour schemes, and
 * none is the red that means a problem.
 */
export const KEY_COLORS = [
  '#ff6fa3',
  '#ffb000',
  '#00c2a8',
  '#4d9bff',
  '#ff8a3d',
  '#b78cff',
  '#7bd13a',
  '#f06bf0',
  '#1fc8ff',
  '#ffd60a',
  '#ffa8a0',
  '#2ed573',
  '#8f9bff',
  '#ffbe7a',
  '#c9a27a',
  '#5ee0c1',
] as const;

/** The colour of key `index` (0-based). */
export const keyColor = (index: number): string =>
  KEY_COLORS[((index % KEY_COLORS.length) + KEY_COLORS.length) % KEY_COLORS.length] ?? '#ffb000';

/** Sets `--k`, the key's colour, on an element; CSS inside it reads `var(--k)`. */
export const keyStyle = (index: number): CSSProperties =>
  ({ '--k': keyColor(index) }) as CSSProperties;

export const KEY_TYPE_LABEL: Record<Key['type'], string> = {
  unassigned: 'Empty',
  auto: 'Auto',
  channel: 'Channel',
  group: 'Group',
  aux: 'Aux In',
  tone: 'Tone',
  unknown: 'Unknown',
};
