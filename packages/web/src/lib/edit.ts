/**
 * Pure edits on a system. The model from the core package is readonly plain data, so
 * every edit returns a new system and React state stays immutable.
 */

import {
  CHANNEL_COUNT,
  type Channel,
  KEY_COUNT,
  type Key,
  type Level,
  type System,
} from '@mcmillan/me1-mate-core';

/** A complete system as the editor holds it. */
export type Editable = Pick<System, 'channels' | 'keys' | 'source'>;

export type EditableKeyType = 'unassigned' | 'auto' | 'channel' | 'group';

export const blank = (): Editable => ({
  channels: Array.from({ length: CHANNEL_COUNT }, (): Channel => ({})),
  keys: Array.from({ length: KEY_COUNT }, (): Key => ({ type: 'unassigned' })),
});

export const fromSystem = (system: System): Editable => ({
  channels: system.channels,
  keys: system.keys,
  ...(system.source ? { source: system.source } : {}),
});

const without = <T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> => {
  const { [key]: _, ...rest } = obj;
  return rest;
};

/** The system as the library wants it: blank names dropped rather than sent as empty strings. */
export const clean = (system: Editable): Editable => ({
  ...system,
  channels: system.channels.map((c) => (c.name === '' ? without(c, 'name') : c)),
  keys: system.keys.map((k) => ('name' in k && k.name === '' ? (without(k, 'name') as Key) : k)),
});

export const isStereo = (system: Editable, channel: number): boolean =>
  system.channels[channel - 1]?.stereo === true;

export const pairStart = (channel: number): number => (channel % 2 === 1 ? channel : channel - 1);

// ---- channels ------------------------------------------------------------

export const setChannelName = (system: Editable, channel: number, name: string): Editable => ({
  ...system,
  channels: system.channels.map((c, i) => (i === channel - 1 ? { ...c, name } : c)),
});

/**
 * Keys as they should be once `first` and the channel after it are linked:
 * references to the second channel move to the first, which now stands for
 * the pair, without repeating it in a group or leaving it in two groups (the
 * lowest key keeps it).
 */
const referToPair = (keys: readonly Key[], first: number): readonly Key[] => {
  const second = first + 1;
  let holder: number | undefined;
  let changed = false;
  const next = keys.map((key, index): Key => {
    if (key.type === 'channel') {
      if (key.channel !== second) return key;
      changed = true;
      return { ...key, channel: first };
    }
    if (key.type !== 'group') return key;
    const hasPair = key.members.some((m) => m.channel === first || m.channel === second);
    if (!hasPair) return key;
    const keeps = holder === undefined;
    holder ??= index;
    const kept = key.members.find((m) => m.channel === first || m.channel === second);
    const members = key.members
      .filter((m) => m.channel !== first && m.channel !== second)
      .concat(keeps && kept ? [{ ...kept, channel: first }] : [])
      .sort((x, y) => x.channel - y.channel);
    const same =
      members.length === key.members.length &&
      members.every((m, i) => m.channel === key.members[i]?.channel);
    if (same) return key;
    changed = true;
    return { ...key, members };
  });
  return changed ? next : keys;
};

/**
 * Link or unlink the pair `channel` belongs to; both channels carry the flag.
 * Linking also points keys that used the second channel at the pair.
 */
export const setStereo = (system: Editable, channel: number, stereo: boolean): Editable => {
  const first = pairStart(channel);
  return {
    ...system,
    channels: system.channels.map((c, i) =>
      i + 1 === first || i + 1 === first + 1
        ? stereo
          ? { ...c, stereo: true }
          : without(c, 'stereo')
        : c,
    ),
    keys: stereo ? referToPair(system.keys, first) : system.keys,
  };
};

// ---- keys ----------------------------------------------------------------

export const setKey = (system: Editable, index: number, key: Key): Editable => ({
  ...system,
  keys: system.keys.map((k, i) => (i === index ? key : k)),
});

/** Channels a key may refer to: every channel except the second of a stereo pair. */
const selectableChannels = (system: Editable): number[] =>
  system.channels.flatMap((c, i) => (c.stereo && i % 2 === 1 ? [] : [i + 1]));

const firstFreeChannel = (system: Editable, except: number): number => {
  const used = new Set(
    system.keys.flatMap((k, i) =>
      i === except
        ? []
        : k.type === 'channel'
          ? [k.channel]
          : k.type === 'group'
            ? k.members.map((m) => m.channel)
            : [],
    ),
  );
  return selectableChannels(system).find((n) => !used.has(n)) ?? 1;
};

/** The index of a group other than key `except` that has `channel` as a member. */
export const groupHolding = (
  system: Editable,
  channel: number,
  except: number,
): number | undefined => {
  const target = pickTarget(system, channel);
  const found = system.keys.findIndex(
    (k, i) =>
      i !== except &&
      k.type === 'group' &&
      k.members.some((m) => pickTarget(system, m.channel) === target),
  );
  return found === -1 ? undefined : found;
};

/**
 * Change a key's type, keeping the name and level where the new type has
 * them. A channel key that becomes a group starts with its channel as the
 * first member (unless another group has it), and a group that becomes a
 * channel key takes its first member.
 */
export const setKeyType = (system: Editable, index: number, type: EditableKeyType): Editable => {
  const old = system.keys[index];
  if (!old || old.type === type) return system;
  const name = old.type === 'channel' || old.type === 'group' ? old.name : undefined;
  const level = old.type === 'unassigned' ? undefined : old.level;
  const named = name === undefined ? {} : { name };
  const levelled = level === undefined ? {} : { level };
  const carried =
    old.type === 'channel' && groupHolding(system, old.channel, index) === undefined
      ? [{ channel: old.channel }]
      : [];
  const next: Key =
    type === 'unassigned'
      ? { type }
      : type === 'auto'
        ? { type, ...levelled }
        : type === 'channel'
          ? {
              type,
              channel:
                (old.type === 'group' ? old.members[0]?.channel : undefined) ??
                firstFreeChannel(system, index),
              ...named,
              ...levelled,
            }
          : { type, members: carried, ...named, ...levelled };
  return setKey(system, index, next);
};

export const setKeyName = (system: Editable, index: number, name: string): Editable => {
  const key = system.keys[index];
  return key?.type === 'channel' || key?.type === 'group'
    ? setKey(system, index, { ...key, name })
    : system;
};

export const setKeyLevel = (system: Editable, index: number, level: Level): Editable => {
  const key = system.keys[index];
  return key && key.type !== 'unassigned' ? setKey(system, index, { ...key, level }) : system;
};

export const toggleMember = (system: Editable, index: number, channel: number): Editable => {
  const key = system.keys[index];
  if (key?.type !== 'group') return system;
  const has = key.members.some((m) => m.channel === channel);
  const members = has
    ? key.members.filter((m) => m.channel !== channel)
    : [...key.members, { channel }].sort((a, b) => a.channel - b.channel);
  return setKey(system, index, { ...key, members });
};

// ---- labels --------------------------------------------------------------

/** The label a key shows on the ME-1: its own name, else its channel's. */
export const keyLabel = (system: Editable, key: Key): string => {
  switch (key.type) {
    case 'unassigned':
      return '—';
    case 'auto':
      return 'Auto';
    case 'channel': {
      // A stereo pair goes by its first channel's name, whichever of the two the key refers to.
      const channel = pickTarget(system, key.channel);
      return key.name || system.channels[channel - 1]?.name || String(channel);
    }
    case 'group':
      return key.name || 'Group';
    case 'aux':
      return key.name || 'Aux In';
    case 'tone':
      return key.name || 'Tone';
    case 'unknown':
      return key.name || 'Unknown';
  }
};

/** Set one group member's level; returns the system unchanged if it isn't a member or the level is the same. */
export const setMemberLevel = (
  system: Editable,
  index: number,
  channel: number,
  level: Level,
): Editable => {
  const key = system.keys[index];
  if (key?.type !== 'group') return system;
  const member = key.members.find((m) => m.channel === channel);
  if (!member || member.level === level) return system;
  return setKey(system, index, {
    ...key,
    members: key.members.map((m) => (m.channel === channel ? { ...m, level } : m)),
  });
};

// ---- picking channels for a key --------------------------------------------

/** The channel a key refers to for `channel`: the first of its pair when it's stereo. */
export const pickTarget = (system: Editable, channel: number): number =>
  isStereo(system, channel) ? pairStart(channel) : channel;

/**
 * Whether a key plays `channel`. Either channel of a stereo pair counts, and
 * so does a reference to a pair's second channel, which a loaded file can
 * have.
 */
export const keyPlays = (system: Editable, key: Key | undefined, channel: number): boolean => {
  const target = pickTarget(system, channel);
  return key?.type === 'channel'
    ? pickTarget(system, key.channel) === target
    : key?.type === 'group'
      ? key.members.some((m) => pickTarget(system, m.channel) === target)
      : false;
};

/** Whether picking a channel does anything for a key of this type. */
export const canPick = (key: Key | undefined): boolean =>
  key?.type === 'unassigned' || key?.type === 'channel' || key?.type === 'group';

/**
 * Pick `channel` for key `index`, the one gesture that assigns channels:
 * an unassigned key becomes a channel key on it, a channel key switches to it,
 * and a group adds it, or removes it if it's already a member. A channel is in
 * at most one group, so adding it to a group takes it out of any other
 * (`groupHolding` says which, to tell the user). Auto and unknown keys are
 * left alone.
 */
export const pickChannel = (system: Editable, index: number, channel: number): Editable => {
  const key = system.keys[index];
  if (!key) return system;
  const target = pickTarget(system, channel);
  switch (key.type) {
    case 'unassigned':
      return setKey(system, index, { type: 'channel', channel: target });
    case 'channel':
      return key.channel === target ? system : setKey(system, index, { ...key, channel: target });
    case 'group': {
      const plays = (m: { readonly channel: number }) => pickTarget(system, m.channel) === target;
      if (key.members.some(plays)) {
        return setKey(system, index, { ...key, members: key.members.filter((m) => !plays(m)) });
      }
      const freed: Editable = {
        ...system,
        keys: system.keys.map((k, i) =>
          i !== index && k.type === 'group' && k.members.some(plays)
            ? { ...k, members: k.members.filter((m) => !plays(m)) }
            : k,
        ),
      };
      return toggleMember(freed, index, target);
    }
    default:
      return system;
  }
};

/** A key that plays a channel. */
export interface KeyUse {
  /** 0-based, like `selectedKeyAtom`. */
  readonly index: number;
  readonly type: Key['type'];
  readonly label: string;
}

/** For each channel (index = channel - 1), the keys that play it; a stereo reference covers both channels. */
export const channelUses = (system: Editable): KeyUse[][] => {
  const uses: KeyUse[][] = Array.from({ length: CHANNEL_COUNT }, () => []);
  const add = (channel: number, use: KeyUse) => {
    const first = pickTarget(system, channel);
    const covered = isStereo(system, channel) ? [first, first + 1] : [channel];
    for (const c of covered) {
      const list = uses[c - 1];
      if (list && !list.some((u) => u.index === use.index)) list.push(use);
    }
  };
  system.keys.forEach((k, index) => {
    const use = { index, type: k.type, label: keyLabel(system, k) };
    if (k.type === 'channel') add(k.channel, use);
    else if (k.type === 'group') for (const m of k.members) add(m.channel, use);
  });
  return uses;
};

/** A level as the editor shows it: one decimal place, `OFF`, and the default `0 dB`. */
export const levelText = (level: Level | undefined): string => {
  if (level === 'off') return 'OFF';
  const db = Math.round((level ?? 0) * 10) / 10;
  return db === 0 ? '0 dB' : `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
};

/** Whether a system is as a new one starts: no channel named or linked, no key assigned. */
export const isBlank = (system: Editable): boolean =>
  system.channels.every((c) => !c.name && !c.stereo) &&
  system.keys.every((k) => k.type === 'unassigned');
