/**
 * Key records built byte by byte in a blank config, one case each: what they
 * decode to, that they re-encode identically, and that an edit writes only
 * the bytes it should.
 */

import { unwrap, unwrapErr } from 'true-myth/test-support';
import { describe, expect, it } from 'vitest';
import {
  buildME1Config,
  buildMEUConfig,
  type Key,
  parseME1Config,
  parseMEUConfig,
  type System,
} from '../src/index.ts';

const KEY = (k: number) => 7 + k * 205;
const SEND = (k: number, channel: number) => KEY(k) + 2 + (channel - 1) * 4;
const LEVEL = (k: number) => KEY(k) + 194;
const PAN = (k: number) => KEY(k) + 196;
const NAME = (k: number) => KEY(k) + 197;

interface RawKey {
  readonly flags: number;
  readonly source: number;
  readonly level?: number;
  readonly pan?: number;
  readonly name?: readonly number[];
  readonly sends?: Readonly<Record<number, readonly [flags: number, level: number, pan: number]>>;
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** A blank config with key `k` (0-based) replaced by `raw`. */
const configWith = (keys: Readonly<Record<number, RawKey>>): Uint8Array => {
  const bytes = unwrap(buildME1Config({})).slice();
  const view = new DataView(bytes.buffer);
  for (const [index, raw] of Object.entries(keys)) {
    const k = Number(index);
    bytes[KEY(k)] = raw.flags;
    bytes[KEY(k) + 1] = raw.source;
    if (raw.level !== undefined) view.setInt16(LEVEL(k), raw.level);
    if (raw.pan !== undefined) bytes[PAN(k)] = raw.pan;
    if (raw.name) bytes.set(raw.name, NAME(k));
    for (const [ch, [flags, level, pan]] of Object.entries(raw.sends ?? {})) {
      bytes[SEND(k, Number(ch))] = flags;
      view.setInt16(SEND(k, Number(ch)) + 1, level);
      bytes[SEND(k, Number(ch)) + 3] = pan;
    }
  }
  return bytes;
};

const changed = (a: Uint8Array, b: Uint8Array) => [...a.keys()].filter((i) => a[i] !== b[i]);

const roundTrips = (bytes: Uint8Array) => {
  const system = unwrap(parseME1Config(bytes));
  expect(unwrap(buildME1Config(system))).toEqual(bytes);
  return system;
};

const edit = (system: System, k: number, key: Key) =>
  unwrap(buildME1Config({ ...system, keys: system.keys.with(k, key) }));

describe('Auto Mode keys', () => {
  it('decode as Auto even with a stored source, and keep it', () => {
    const bytes = configWith({ 0: { flags: 0x40, source: 3, level: -2560 } });
    const system = roundTrips(bytes);
    expect(system.keys[0]).toEqual({ type: 'auto', level: 0 });
    const louder = edit(system, 0, { type: 'auto', level: 1.5 }); // 0xf600 → 0xf780
    expect(changed(bytes, louder)).toEqual([LEVEL(0), LEVEL(0) + 1]);
  });

  it('get no source when a key becomes Auto', () => {
    const bytes = configWith({ 0: { flags: 0x00, source: 4 } });
    const auto = edit(roundTrips(bytes), 0, { type: 'auto' });
    expect([auto[KEY(0)], auto[KEY(0) + 1]]).toEqual([0x40, 0xff]);
  });
});

describe('key names', () => {
  it('are absent without the custom-name flag, whatever the bytes hold', () => {
    const spaces = [...ascii('      '), 0, 0];
    const bytes = configWith({
      0: { flags: 0x40, source: 0, name: spaces },
      1: { flags: 0x00, source: 5, name: spaces },
      2: { flags: 0x00, source: 6, name: [0, ...ascii('ick   '), 0] },
    });
    const { keys } = roundTrips(bytes);
    expect(keys[0]).toEqual({ type: 'auto', level: 'off' });
    expect(keys[1]).not.toHaveProperty('name');
    expect(keys[2]).not.toHaveProperty('name');
  });

  it('when dropped, clear the flag and the first byte as the ME-1 does', () => {
    const bytes = configWith({ 0: { flags: 0x10, source: 2, name: [...ascii('Kick   '), 0] } });
    const system = roundTrips(bytes);
    expect(system.keys[0]).toMatchObject({ name: 'Kick' });
    const unnamed = edit(system, 0, { type: 'channel', channel: 3, level: 'off', pan: 37 });
    expect(changed(bytes, unnamed)).toEqual([KEY(0), NAME(0)]);
    expect(unnamed[KEY(0)]).toBe(0x00);
  });
});

describe('Aux Input and tone keys', () => {
  it('decode from sources 40 and 47 and re-encode identically', () => {
    const bytes = configWith({
      0: { flags: 0x01, source: 40, level: -6105, pan: 30 },
      1: { flags: 0x10, source: 47, level: -0x7fff, name: [...ascii('1kTone'), 0, 0] },
    });
    const { keys, channels } = roundTrips(bytes);
    expect(keys[0]).toEqual({ type: 'aux', level: (-6105 + 2560) / 256, pan: 30 });
    expect(keys[1]).toEqual({ type: 'tone', name: '1kTone', level: 'off' });
    expect(channels.every((c) => !c.stereo)).toBe(true); // the Aux Input links no channels
  });

  it('are built from scratch with the flags and source the ME-1 saves', () => {
    const bytes = unwrap(
      buildME1Config({
        keys: [
          { type: 'aux', pan: 0 },
          { type: 'tone', muted: true },
        ],
      }),
    );
    expect([bytes[KEY(0)], bytes[KEY(0) + 1], bytes[PAN(0)]]).toEqual([0x01, 40, 0]);
    expect([bytes[KEY(1)], bytes[KEY(1) + 1], bytes[PAN(1)]]).toEqual([0x08, 47, 37]);
    expect(unwrap(parseME1Config(bytes)).keys.slice(0, 2)).toEqual([
      { type: 'aux', level: 0, pan: 0 },
      { type: 'tone', level: 0, muted: true },
    ]);
  });

  it('leave other sources above 40 unknown, kept raw', () => {
    const bytes = configWith({ 0: { flags: 0x00, source: 45, level: -2560 } });
    expect(roundTrips(bytes).keys[0]).toEqual({
      type: 'unknown',
      flags: 0,
      source: 45,
      level: 0,
      pan: 37,
    });
  });
});

describe('mute', () => {
  it('is bit 3 on channel and group keys, and editing it writes only that bit', () => {
    const bytes = configWith({
      0: { flags: 0x08, source: 0 },
      1: { flags: 0x28, source: 0xff, sends: { 2: [0x04, -97, 37] } },
    });
    const system = roundTrips(bytes);
    expect(system.keys[0]).toMatchObject({ type: 'channel', muted: true });
    expect(system.keys[1]).toMatchObject({ type: 'group', muted: true });
    const key = system.keys[0];
    if (key?.type !== 'channel') throw new Error('expected a channel key');
    const unmuted = edit(system, 0, { ...key, muted: false });
    expect(changed(bytes, unmuted)).toEqual([KEY(0)]);
    expect(unmuted[KEY(0)]).toBe(0x00);
  });
});

describe('bytes the model does not cover', () => {
  // As in a real config: a group key with bit 0 set, a pair inside a group
  // whose second send has a different pan, and stale link bits on sends that
  // aren't members.
  const bytes = configWith({
    0: {
      flags: 0x31,
      source: 0xff,
      name: [...ascii('Toms   '), 0],
      sends: { 21: [0x04, -2854, 10], 22: [0x04, -97, 64] },
    },
    1: {
      flags: 0x30,
      source: 0xff,
      name: [...ascii('Keys   '), 0],
      sends: {
        5: [0x07, -4431, 38],
        6: [0x05, -4431, 37],
        27: [0x03, -0x7fff, 37],
        28: [0x01, -0x7fff, 37],
      },
    },
  });

  it('are written back as read', () => {
    const system = roundTrips(bytes);
    expect(system.keys[1]).toMatchObject({
      type: 'group',
      members: [{ channel: 5, pan: 38 }],
    });
    expect(system.channels[4]).toEqual({ stereo: true });
  });

  it('survive an edit to the same key', () => {
    const system = roundTrips(bytes);
    const toms = system.keys[0];
    const keys = system.keys[1];
    if (toms?.type !== 'group' || keys?.type !== 'group') throw new Error('expected groups');
    const renamed = edit(system, 0, { ...toms, name: 'Drums' });
    expect(changed(bytes, renamed).every((i) => i >= NAME(0) && i < NAME(0) + 8)).toBe(true);
    const louder = edit(system, 1, { ...keys, level: 1 });
    expect(changed(bytes, louder)).toEqual([LEVEL(1), LEVEL(1) + 1]);
  });
});

describe('pan', () => {
  const bytes = configWith({
    0: { flags: 0x00, source: 9, pan: 37 },
    1: {
      flags: 0x20,
      source: 0xff,
      sends: { 1: [0x04, -97, 37], 3: [0x07, -97, 37], 4: [0x05, -97, 37] },
    },
  });

  it('on a channel key writes only the key pan byte', () => {
    const system = roundTrips(bytes);
    const key = system.keys[0];
    if (key?.type !== 'channel') throw new Error('expected a channel key');
    const left = edit(system, 0, { ...key, pan: 0 });
    expect(changed(bytes, left)).toEqual([PAN(0)]);
    expect(left[PAN(0)]).toBe(0);
  });

  it('on a group member writes only that send pan byte; a pair, only its first send', () => {
    const system = roundTrips(bytes);
    const group = system.keys[1];
    if (group?.type !== 'group') throw new Error('expected a group');
    expect(group.members.map((m) => m.channel)).toEqual([1, 3]);
    const panned = edit(system, 1, {
      ...group,
      members: group.members.map((m) => ({ ...m, pan: m.channel === 1 ? 74 : 10 })),
    });
    expect(changed(bytes, panned)).toEqual([SEND(1, 1) + 3, SEND(1, 3) + 3]);
  });

  it('is checked against the range, with a path', () => {
    const issues = unwrapErr(
      buildME1Config({
        keys: [
          { type: 'channel', channel: 1, pan: 75 },
          { type: 'group', members: [{ channel: 2, pan: -1 }] },
          { type: 'aux', pan: 1.5 },
        ],
      }),
    );
    expect(issues).toEqual([
      { path: 'keys[0].pan', reason: 'pan must be a whole number 0–74' },
      { path: 'keys[1].members[0].pan', reason: 'pan must be a whole number 0–74' },
      { path: 'keys[2].pan', reason: 'pan must be a whole number 0–74' },
    ]);
  });
});

describe('.meu channel names', () => {
  it('read an empty name as unnamed and write it back empty', () => {
    const json = unwrap(buildMEUConfig({})).replace(
      '"UserChannelName" : "7"',
      '"UserChannelName" : ""',
    );
    const system = unwrap(parseMEUConfig(json));
    expect(system.channels[6]).toEqual({});
    expect(unwrap(buildMEUConfig(system))).toBe(json);
    const named = system.channels.with(6, { name: 'Bass' });
    expect(unwrap(buildMEUConfig({ ...system, channels: named }))).toContain('"Bass"');
  });
});
