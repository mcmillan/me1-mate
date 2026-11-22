/**
 * A made-up band's setup, for seeing what a filled-in system looks like
 * before making one: named channels, stereo pairs, and keys of every kind.
 */

import type { Channel, Key } from '@mcmillan/2me2u-core';
import { blank, type Editable } from './edit.ts';

/** Channel names by number; a pair's name is its first channel's. */
const NAMES: Record<number, string> = {
  1: 'Kick',
  2: 'Snare',
  3: 'HiHat',
  4: 'Toms',
  5: 'OH',
  7: 'Bass',
  9: 'Keys',
  11: 'Gtr 1',
  12: 'Gtr 2',
  13: 'Vox 1',
  14: 'Vox 2',
  15: 'BV 1',
  16: 'BV 2',
  17: 'Tracks',
  19: 'Click',
  20: 'Talk',
};

/** The first channel of each stereo pair. */
const PAIRS = [5, 9, 17];

const KEYS: readonly Key[] = [
  {
    type: 'group',
    name: 'Drums',
    members: [
      { channel: 1, level: 2 },
      { channel: 2 },
      { channel: 3, level: -4 },
      { channel: 4, level: -2 },
      { channel: 5, level: -6 },
    ],
  },
  { type: 'channel', channel: 7, level: 1.5 },
  { type: 'channel', channel: 9, level: -3 },
  {
    type: 'group',
    name: 'Gtrs',
    level: -2,
    members: [{ channel: 11 }, { channel: 12, level: -3 }],
  },
  { type: 'channel', channel: 13, name: 'Me', level: 4 },
  {
    type: 'group',
    name: 'BVs',
    level: -4,
    members: [{ channel: 14 }, { channel: 15 }, { channel: 16 }],
  },
  { type: 'channel', channel: 17, level: -5 },
  { type: 'channel', channel: 19, level: -8 },
];

export const example = (): Editable => {
  const base = blank();
  return {
    channels: base.channels.map((_, i): Channel => {
      const n = i + 1;
      const first = n % 2 === 1 ? n : n - 1;
      const name = NAMES[n];
      return {
        ...(name === undefined ? {} : { name }),
        ...(PAIRS.includes(first) ? { stereo: true } : {}),
      };
    }),
    keys: base.keys.map((key, i): Key => KEYS[i] ?? (i === 15 ? { type: 'auto' } : key)),
  };
};
