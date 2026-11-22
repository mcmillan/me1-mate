import {
  buildME1Config,
  buildMEUConfig,
  type Key,
  LEVEL_MAX,
  PAN_CENTRE,
  PAN_MAX,
  PAN_MIN,
} from '@mcmillan/me1-mate-core';
import { describe, expect, it } from 'vitest';
import {
  blank,
  canMute,
  canPick,
  channelUses,
  clean,
  type Editable,
  groupHolding,
  hasPan,
  isBalance,
  isBlank,
  keyLabel,
  keyPlays,
  levelText,
  panSpoken,
  panText,
  pickChannel,
  setKey,
  setKeyMuted,
  setKeyName,
  setKeyPan,
  setKeyType,
  setMemberPan,
  setStereo,
} from '../src/lib/edit.ts';
import { example } from '../src/lib/example.ts';
import { phonePlaceOf } from '../src/lib/layout.ts';

const withKeys = (...keys: Key[]): Editable =>
  keys.reduce((system, key, i) => setKey(system, i, key), blank());

describe('pickChannel', () => {
  it('makes an unassigned key a channel key', () => {
    expect(pickChannel(blank(), 2, 5).keys[2]).toEqual({ type: 'channel', channel: 5 });
  });

  it('switches a channel key, keeping its name and level', () => {
    const system = withKeys({ type: 'channel', channel: 5, name: 'Kick', level: -3 });
    expect(pickChannel(system, 0, 7).keys[0]).toEqual({
      type: 'channel',
      channel: 7,
      name: 'Kick',
      level: -3,
    });
  });

  it("leaves a channel key alone when it's picked again", () => {
    const system = withKeys({ type: 'channel', channel: 5 });
    expect(pickChannel(system, 0, 5)).toBe(system);
  });

  it('adds to a group in channel order and removes on a second pick', () => {
    const system = withKeys({ type: 'group', members: [{ channel: 9, level: -6 }] });
    const added = pickChannel(system, 0, 3);
    expect(added.keys[0]).toEqual({
      type: 'group',
      members: [{ channel: 3 }, { channel: 9, level: -6 }],
    });
    expect(pickChannel(added, 0, 3).keys[0]).toEqual(system.keys[0]);
  });

  it('moves a channel out of another group', () => {
    const system = withKeys(
      { type: 'group', name: 'Drums', members: [{ channel: 1 }, { channel: 2 }] },
      { type: 'group', members: [] },
    );
    expect(groupHolding(system, 2, 1)).toBe(0);
    const moved = pickChannel(system, 1, 2);
    expect(moved.keys[0]).toMatchObject({ members: [{ channel: 1 }] });
    expect(moved.keys[1]).toMatchObject({ members: [{ channel: 2 }] });
  });

  it("doesn't take a channel away from a channel key", () => {
    const system = withKeys({ type: 'channel', channel: 4 }, { type: 'group', members: [] });
    const picked = pickChannel(system, 1, 4);
    expect(picked.keys[0]).toEqual({ type: 'channel', channel: 4 });
    expect(picked.keys[1]).toMatchObject({ members: [{ channel: 4 }] });
  });

  it('refers to a stereo pair by its first channel', () => {
    const system = setStereo(blank(), 6, true);
    expect(pickChannel(system, 0, 6).keys[0]).toEqual({ type: 'channel', channel: 5 });
  });

  it('leaves auto and unknown keys alone', () => {
    const system = withKeys({ type: 'auto' });
    expect(pickChannel(system, 0, 5)).toBe(system);
    expect(canPick(system.keys[0])).toBe(false);
    expect(canPick({ type: 'unassigned' })).toBe(true);
  });
});

describe('keyPlays and channelUses', () => {
  const system = setStereo(
    withKeys(
      { type: 'channel', channel: 5, name: 'OH' },
      { type: 'group', name: 'Drums', members: [{ channel: 1 }, { channel: 5 }] },
    ),
    5,
    true,
  );

  it('counts either channel of a stereo pair', () => {
    expect(keyPlays(system, system.keys[0], 6)).toBe(true);
    expect(keyPlays(system, system.keys[1], 6)).toBe(true);
    expect(keyPlays(system, system.keys[1], 2)).toBe(false);
    expect(keyPlays(system, system.keys[2], 5)).toBe(false);
  });

  it('lists the keys that use each channel', () => {
    const uses = channelUses(system);
    expect(uses[0]).toEqual([{ index: 1, type: 'group', label: 'Drums' }]);
    expect(uses[5]?.map((u) => u.index)).toEqual([0, 1]);
    expect(uses[6]).toEqual([]);
  });
});

describe('setKeyType', () => {
  it('keeps the channel as the first member when a channel key becomes a group', () => {
    const system = withKeys({ type: 'channel', channel: 5, name: 'Kick', level: -3 });
    expect(setKeyType(system, 0, 'group').keys[0]).toEqual({
      type: 'group',
      members: [{ channel: 5 }],
      name: 'Kick',
      level: -3,
    });
  });

  it("doesn't carry a channel another group already has", () => {
    const system = withKeys(
      { type: 'channel', channel: 5 },
      { type: 'group', members: [{ channel: 5 }] },
    );
    expect(setKeyType(system, 0, 'group').keys[0]).toEqual({ type: 'group', members: [] });
  });

  it("takes a group's first member when it becomes a channel key", () => {
    const system = withKeys({ type: 'group', name: 'Drums', members: [{ channel: 7 }] });
    expect(setKeyType(system, 0, 'channel').keys[0]).toEqual({
      type: 'channel',
      channel: 7,
      name: 'Drums',
    });
  });

  it('is a no-op for the type the key already has', () => {
    const system = withKeys({ type: 'group', members: [{ channel: 7 }] });
    expect(setKeyType(system, 0, 'group')).toBe(system);
  });

  it('makes a bare Aux Input or tone key from an empty one', () => {
    expect(setKeyType(blank(), 0, 'aux').keys[0]).toEqual({ type: 'aux' });
    expect(setKeyType(blank(), 0, 'tone').keys[0]).toEqual({ type: 'tone' });
  });

  it('carries label, level, pan and mute from a channel key to the Aux Input', () => {
    const system = withKeys({
      type: 'channel',
      channel: 5,
      name: 'Click',
      level: -3,
      pan: 20,
      muted: true,
    });
    expect(setKeyType(system, 0, 'aux').keys[0]).toEqual({
      type: 'aux',
      name: 'Click',
      level: -3,
      pan: 20,
      muted: true,
    });
  });

  it('drops the pan for a tone, which has none, and for Auto', () => {
    const system = withKeys({ type: 'aux', name: 'iPod', level: 2, pan: 50, muted: true });
    expect(setKeyType(system, 0, 'tone').keys[0]).toEqual({
      type: 'tone',
      name: 'iPod',
      level: 2,
      muted: true,
    });
    expect(setKeyType(system, 0, 'auto').keys[0]).toEqual({ type: 'auto', level: 2, muted: true });
  });

  it('gives an Aux Input its channel, with its balance, when it becomes a channel key', () => {
    const system = withKeys({ type: 'aux', pan: 10 });
    expect(setKeyType(system, 0, 'channel').keys[0]).toEqual({
      type: 'channel',
      channel: 1,
      pan: 10,
    });
  });

  it("moves pan between a channel key and its group's first member", () => {
    const channel = withKeys({ type: 'channel', channel: 5, pan: 60 });
    const group = setKeyType(channel, 0, 'group');
    expect(group.keys[0]).toEqual({ type: 'group', members: [{ channel: 5, pan: 60 }] });
    expect(setKeyType(group, 0, 'channel').keys[0]).toEqual({
      type: 'channel',
      channel: 5,
      pan: 60,
    });
    expect(setKeyType(group, 0, 'aux').keys[0], "a member's pan isn't the Aux's").toEqual({
      type: 'aux',
    });
  });

  it("never carries an unknown key's raw pan or flags, and empties a key completely", () => {
    const system = withKeys({ type: 'unknown', flags: 9, source: 44, pan: 200, level: 1 });
    expect(setKeyType(system, 0, 'aux').keys[0]).toEqual({ type: 'aux', level: 1 });
    const muted = withKeys({ type: 'tone', muted: true });
    expect(setKeyType(muted, 0, 'unassigned').keys[0]).toEqual({ type: 'unassigned' });
  });
});

describe('setKeyName', () => {
  it('names Aux Input and tone keys too, but not Auto', () => {
    const system = withKeys({ type: 'aux' }, { type: 'tone' }, { type: 'auto' });
    expect(setKeyName(system, 0, 'iPod').keys[0]).toEqual({ type: 'aux', name: 'iPod' });
    expect(setKeyName(system, 1, 'Test').keys[1]).toEqual({ type: 'tone', name: 'Test' });
    expect(setKeyName(system, 2, 'X')).toBe(system);
  });
});

describe('pan', () => {
  it('sets the pan of a channel or Aux Input key, and nothing else', () => {
    const system = withKeys(
      { type: 'channel', channel: 1 },
      { type: 'aux' },
      { type: 'tone' },
      { type: 'auto' },
      { type: 'group', members: [] },
    );
    expect(setKeyPan(system, 0, 12).keys[0]).toEqual({ type: 'channel', channel: 1, pan: 12 });
    expect(setKeyPan(system, 1, 74).keys[1]).toEqual({ type: 'aux', pan: 74 });
    for (const i of [2, 3, 4]) expect(setKeyPan(system, i, 12)).toBe(system);
    expect(hasPan(system.keys[0]) && hasPan(system.keys[1]) && !hasPan(system.keys[4])).toBe(true);
  });

  it("is a no-op when the pan doesn't change, including centre on an unset pan", () => {
    const system = withKeys({ type: 'channel', channel: 1 }, { type: 'aux', pan: 20 });
    expect(setKeyPan(system, 0, PAN_CENTRE)).toBe(system);
    expect(setKeyPan(system, 1, 20)).toBe(system);
  });

  it("sets one group member's pan", () => {
    const system = withKeys({
      type: 'group',
      members: [{ channel: 1, level: -2 }, { channel: 3 }],
    });
    expect(setMemberPan(system, 0, 3, 0).keys[0]).toEqual({
      type: 'group',
      members: [
        { channel: 1, level: -2 },
        { channel: 3, pan: 0 },
      ],
    });
    expect(setMemberPan(system, 0, 3, PAN_CENTRE)).toBe(system);
    expect(setMemberPan(system, 0, 5, 10), 'not a member').toBe(system);
  });

  it('calls a pan a balance on the Aux Input and on a stereo pair', () => {
    const system = setStereo(
      withKeys({ type: 'channel', channel: 5 }, { type: 'channel', channel: 7 }, { type: 'aux' }),
      5,
      true,
    );
    expect(isBalance(system, system.keys[0])).toBe(true);
    expect(isBalance(system, system.keys[1])).toBe(false);
    expect(isBalance(system, system.keys[2])).toBe(true);
  });

  it('reads out steps either side of centre', () => {
    expect(panText(undefined)).toBe('C');
    expect(panText(PAN_CENTRE)).toBe('C');
    expect(panText(PAN_MIN)).toBe('L 37');
    expect(panText(25)).toBe('L 12');
    expect(panText(PAN_MAX)).toBe('R 37');
    expect(panSpoken(67)).toBe('right 30');
    expect(panSpoken(37)).toBe('centre');
    expect(panSpoken(0)).toBe('left 37');
  });
});

describe('setKeyMuted', () => {
  it('mutes and unmutes any assigned key', () => {
    const system = withKeys({ type: 'tone' }, { type: 'group', members: [] });
    const muted = setKeyMuted(system, 0, true);
    expect(muted.keys[0]).toEqual({ type: 'tone', muted: true });
    expect(setKeyMuted(muted, 0, false).keys[0]).toEqual({ type: 'tone', muted: false });
    expect(setKeyMuted(system, 1, true).keys[1]).toMatchObject({ muted: true });
  });

  it('leaves empty keys alone, and keys already so', () => {
    const system = withKeys({ type: 'unassigned' }, { type: 'aux' });
    expect(setKeyMuted(system, 0, true)).toBe(system);
    expect(setKeyMuted(system, 1, false)).toBe(system);
    expect(canMute(system.keys[0])).toBe(false);
    expect(canMute(system.keys[1])).toBe(true);
  });
});

describe('Aux Input and tone keys', () => {
  it("take no channels and aren't shown on any", () => {
    const system = withKeys({ type: 'aux' }, { type: 'tone' });
    expect(canPick(system.keys[0])).toBe(false);
    expect(pickChannel(system, 1, 4)).toBe(system);
    expect(channelUses(system).every((u) => u.length === 0)).toBe(true);
    expect(keyLabel(system, system.keys[0] as Key)).toBe('Aux In');
    expect(keyLabel(system, system.keys[1] as Key)).toBe('Tone');
  });
});

describe('levelText', () => {
  it('shows levels as the editor does', () => {
    expect(levelText(undefined)).toBe('0 dB');
    expect(levelText('off')).toBe('OFF');
    expect(levelText(-3)).toBe('-3.0 dB');
    expect(levelText(4.25)).toBe('+4.3 dB');
    expect(levelText(LEVEL_MAX)).toBe('+9.6 dB');
  });
});

describe('setStereo', () => {
  it('points keys that used the second channel at the pair', () => {
    const system = withKeys(
      { type: 'channel', channel: 6, name: 'OH R' },
      { type: 'group', members: [{ channel: 5, level: -3 }, { channel: 6 }, { channel: 9 }] },
    );
    const linked = setStereo(system, 5, true);
    expect(linked.keys[0]).toEqual({ type: 'channel', channel: 5, name: 'OH R' });
    expect(linked.keys[1]).toEqual({
      type: 'group',
      members: [{ channel: 5, level: -3 }, { channel: 9 }],
    });
    expect(channelUses(linked)[5]?.map((u) => u.index)).toEqual([0, 1]);
    expect(channelUses(linked)[6]).toEqual([]);
  });

  it('keeps a pair in one group when both halves were in different groups', () => {
    const system = withKeys(
      { type: 'group', members: [{ channel: 6 }] },
      { type: 'group', members: [{ channel: 5 }, { channel: 8 }] },
    );
    const linked = setStereo(system, 6, true);
    expect(linked.keys[0]).toEqual({ type: 'group', members: [{ channel: 5 }] });
    expect(linked.keys[1]).toEqual({ type: 'group', members: [{ channel: 8 }] });
  });

  it('leaves the keys alone when nothing refers to the pair, and when unlinking', () => {
    const system = withKeys({ type: 'channel', channel: 3 });
    expect(setStereo(system, 5, true).keys).toBe(system.keys);
    const linked = setStereo(withKeys({ type: 'channel', channel: 5 }), 5, true);
    expect(setStereo(linked, 5, false).keys).toBe(linked.keys);
  });
});

describe('a file that refers to the second channel of a pair', () => {
  // Stereo flags set directly, as a loaded file would have them, without setStereo's tidy-up.
  const base = withKeys(
    { type: 'group', members: [{ channel: 6 }] },
    { type: 'channel', channel: 6 },
  );
  const system: Editable = {
    ...base,
    channels: base.channels.map((c, i) => (i === 4 || i === 5 ? { ...c, stereo: true } : c)),
  };

  it('shows the keys on the pair', () => {
    expect(keyPlays(system, system.keys[0], 5)).toBe(true);
    expect(keyPlays(system, system.keys[1], 5)).toBe(true);
    expect(channelUses(system)[4]?.map((u) => u.index)).toEqual([0, 1]);
    expect(channelUses(system)[6]).toEqual([]);
  });

  it('removes the stale member when the pair is picked again', () => {
    expect(pickChannel(system, 0, 5).keys[0]).toEqual({ type: 'group', members: [] });
  });

  it('mends a channel key when its pair is picked', () => {
    expect(pickChannel(system, 1, 6).keys[1]).toEqual({ type: 'channel', channel: 5 });
  });
});

describe('keyLabel', () => {
  it("uses the first channel's name for a key on a stereo pair", () => {
    const base = withKeys({ type: 'channel', channel: 8 });
    const system: Editable = {
      ...base,
      channels: base.channels.map((c, i) =>
        i === 6 ? { name: 'KitPad', stereo: true } : i === 7 ? { name: 'PadR', stereo: true } : c,
      ),
    };
    expect(keyLabel(system, system.keys[0] as Key)).toBe('KitPad');
  });
});

describe('example', () => {
  it('is a system the ME-1 and ME-U would accept', () => {
    const system = clean(example());
    expect(buildME1Config(system).isOk).toBe(true);
    expect(buildMEUConfig(system).isOk).toBe(true);
  });

  it('shows every kind of key', () => {
    const types = new Set(example().keys.map((k) => k.type));
    expect([...types].sort()).toEqual(['auto', 'channel', 'group', 'unassigned']);
  });
});

describe('isBlank', () => {
  it('is true only for a system with nothing set', () => {
    expect(isBlank(blank())).toBe(true);
    expect(isBlank(withKeys({ type: 'auto' }))).toBe(false);
    expect(isBlank(setStereo(blank(), 1, true))).toBe(false);
    expect(isBlank(example())).toBe(false);
  });
});

describe('phonePlaceOf', () => {
  it("sends a key's problems to that key's sheet", () => {
    expect(phonePlaceOf('keys[3].name')).toEqual({ screen: 'keys', key: 3 });
    expect(phonePlaceOf('keys[12].members[0].level')).toEqual({ screen: 'keys', key: 12 });
    expect(phonePlaceOf('keys[0]')).toEqual({ screen: 'keys', key: 0 });
  });

  it("sends a channel's problems to the Channels screen", () => {
    expect(phonePlaceOf('channels[4].name')).toEqual({ screen: 'channels' });
    expect(phonePlaceOf('channels[7].stereo')).toEqual({ screen: 'channels' });
    expect(phonePlaceOf('meu.Channels[2].Name')).toEqual({ screen: 'channels' });
  });

  it('leaves problems with the whole file where they are', () => {
    expect(phonePlaceOf('keys')).toEqual({ screen: undefined });
    expect(phonePlaceOf('channels')).toEqual({ screen: undefined });
    expect(phonePlaceOf('settings.version')).toEqual({ screen: undefined });
  });
});
