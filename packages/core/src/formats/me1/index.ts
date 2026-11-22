/**
 * The `.ME1` format: meaning for the records in `schema.ts`. Decoding turns them
 * into the model; encoding writes the model back over the records a file was
 * read from (or blank ones), replacing only what the model covers, so unknown
 * bits, unknown blocks and stale bytes are kept.
 */

import Result from 'true-myth/result';
import { check, collect, combine, type Issues, invalid, type Validated } from '../../issues.ts';
import {
  CHANNEL_COUNT,
  type Channel,
  isStereo,
  KEY_COUNT,
  type Key,
  type Level,
  type Member,
  PAN_CENTRE,
  pairStart,
} from '../../model.ts';
import type { System } from '../../system.ts';
import { KEY_NAME_PATTERN } from '../../validate.ts';
import {
  ConfigFile,
  type KeyRecord,
  KeyRecord as KeyRecords,
  LEVEL_NOMINAL,
  LEVEL_OFF,
  NAME_SIZE,
  NO_SOURCE,
  type SendRecord,
  type StatePage,
} from './schema.ts';

const KEY_STEREO = 0x01;
const KEY_MUTE = 0x08;
const KEY_CUSTOM_NAME = 0x10;
const KEY_GROUP = 0x20;
const KEY_AUTO = 0x40;
const KEY_KNOWN = KEY_STEREO | KEY_MUTE | KEY_CUSTOM_NAME | KEY_GROUP | KEY_AUTO;

/** The source byte of the Aux Input. */
const AUX_SOURCE = 40;
/** The source byte of the test tone. */
const TONE_SOURCE = 47;

const SEND_LINKED = 0x01;
const SEND_FIRST = 0x02;
const SEND_MEMBER = 0x04;
const SEND_KNOWN = SEND_LINKED | SEND_FIRST | SEND_MEMBER;

/** Something a file says about a channel's stereo link, and where it says it. */
export interface Link {
  readonly channel: number;
  readonly linked: boolean;
  readonly path: string;
}

/** What a config holds. */
export interface ME1Document {
  readonly keys: readonly Key[];
  readonly links: readonly Link[];
  readonly file: ConfigFile;
}

// ---- levels and names ----------------------------------------------------

const levelFromRaw = (raw: number): Level =>
  raw === LEVEL_OFF ? 'off' : (raw - LEVEL_NOMINAL) / 256;

const rawFromLevel = (level: Level = 0): number =>
  level === 'off' ? LEVEL_OFF : Math.round(level * 256) + LEVEL_NOMINAL;

/** The text of the name bytes: up to the first NUL, trailing spaces dropped. */
const textOf = (raw: Uint8Array): string => {
  const end = raw.indexOf(0);
  return new TextDecoder('latin1').decode(end === -1 ? raw : raw.subarray(0, end)).trimEnd();
};

/**
 * A record's custom name, if it has one. Without the custom-name flag the
 * bytes are stale (often NUL-led, sometimes spaces) and the key shows its
 * source's name.
 */
const nameOf = (r: KeyRecord): string | undefined => {
  if (!(r.flags & KEY_CUSTOM_NAME)) return undefined;
  return textOf(r.name) || undefined;
};

const ascii = (s: string): Uint8Array =>
  Uint8Array.from({ length: NAME_SIZE }, (_, i) => s.charCodeAt(i) || 0);

/** The name bytes and custom-name flag a record stores for a name. */
interface NameFields {
  readonly flag: number;
  readonly bytes: Uint8Array;
}

/**
 * The name fields for `name`, over `base`: the base's own if it already says
 * that name (so stale bytes survive), else a fresh encoding. Key names are
 * stored space-padded to 7 characters, then NUL.
 */
const nameFields = (
  name: string | undefined,
  base: KeyRecord,
  path: string,
): Validated<NameFields> =>
  nameOf(base) === name
    ? Result.ok({ flag: base.flags & KEY_CUSTOM_NAME, bytes: base.name })
    : name === undefined
      ? // As the ME-1 does when a key loses its name: zero the first byte, leave the rest stale.
        Result.ok({ flag: 0, bytes: Uint8Array.from(base.name, (b, i) => (i === 0 ? 0 : b)) })
      : KEY_NAME_PATTERN.test(name)
        ? Result.ok({ flag: KEY_CUSTOM_NAME, bytes: ascii(name.padEnd(NAME_SIZE - 1, ' ')) })
        : invalid(path, `invalid name ${JSON.stringify(name)}: use 1–6 of 0-9, A-Z, a-z, space`);

const muteFlag = (muted: boolean | undefined) => (muted ? KEY_MUTE : 0);

const named = (name: string | undefined) => (name === undefined ? {} : { name });

// ---- decode --------------------------------------------------------------

/** Which kind of key a record holds. Combinations not seen in any file are `unknown`. */
const kindOf = (r: KeyRecord): Key['type'] => {
  const group = (r.flags & KEY_GROUP) !== 0;
  const auto = (r.flags & KEY_AUTO) !== 0;
  if (group && !auto && r.source === NO_SOURCE) return 'group';
  if (group) return 'unknown';
  // Auto Mode keys may keep a channel in `source` (not modelled, carried).
  if (auto && (r.source === NO_SOURCE || r.source < CHANNEL_COUNT)) return 'auto';
  if (!auto && r.source < CHANNEL_COUNT) return 'channel';
  if (!auto && r.source === AUX_SOURCE) return 'aux';
  if (!auto && r.source === TONE_SOURCE) return 'tone';
  if (r.flags === 0 && r.source === NO_SOURCE) return 'unassigned';
  return 'unknown';
};

const keyFromRecord = (r: KeyRecord, path: string): [Key, Link[]] => {
  const name = nameOf(r);
  const level = levelFromRaw(r.level);
  const kind = kindOf(r);
  const muted = r.flags & KEY_MUTE ? { muted: true } : {};

  if (kind === 'channel') {
    const channel = r.source + 1;
    const linked = (r.flags & KEY_STEREO) !== 0;
    return [
      { type: 'channel', channel, ...named(name), level, pan: r.pan, ...muted },
      (linked ? [channel, channel + 1] : [channel]).map((ch) => ({ channel: ch, linked, path })),
    ];
  }
  if (kind === 'group') {
    const memberSends = r.sends
      .map((send, i) => ({ send, channel: i + 1 }))
      .filter(({ send }) => send.flags & SEND_MEMBER);
    const isPairSecond = (s: SendRecord) => s.flags & SEND_LINKED && !(s.flags & SEND_FIRST);
    return [
      {
        type: 'group',
        ...named(name),
        level,
        members: memberSends
          .filter(({ send }) => !isPairSecond(send))
          .map(({ send, channel }) => ({
            channel,
            level: levelFromRaw(send.level),
            pan: send.pan,
          })),
        ...muted,
      },
      memberSends.map(({ send, channel }) => ({
        channel,
        linked: (send.flags & SEND_LINKED) !== 0,
        path: `${path}.members`,
      })),
    ];
  }
  if (kind === 'auto') return [{ type: 'auto', level, ...muted }, []];
  if (kind === 'unassigned') return [{ type: 'unassigned' }, []];
  if (kind === 'aux') return [{ type: 'aux', ...named(name), level, pan: r.pan, ...muted }, []];
  if (kind === 'tone') return [{ type: 'tone', ...named(name), level, ...muted }, []];
  return [
    { type: 'unknown', flags: r.flags, source: r.source, ...named(name), level, pan: r.pan },
    [],
  ];
};

const keysFromPage = (page: StatePage, path: string): { keys: Key[]; links: Link[] } => {
  const decoded = page.keys.map((r, i) => keyFromRecord(r, `${path}[${i}]`));
  return { keys: decoded.map(([key]) => key), links: decoded.flatMap(([, links]) => links) };
};

const documentFrom = (file: ConfigFile): ME1Document => ({
  ...keysFromPage(file.state, 'me1.keys'),
  file,
});

// ---- encode --------------------------------------------------------------

const sendsFor = (
  base: readonly SendRecord[],
  members: readonly Member[],
  channels: readonly Channel[],
): SendRecord[] => {
  const byChannel = new Map(members.map((m) => [m.channel, m]));
  return base.map((send, i) => {
    const ch = i + 1;
    const stereo = isStereo(channels, ch);
    const start = stereo ? pairStart(ch) : ch;
    const member = byChannel.get(start);
    const kept = send.flags & ~SEND_KNOWN;
    if (member === undefined) {
      // Link bits left on a send that isn't a member are stale: keep them as read.
      return send.flags & SEND_MEMBER ? { ...send, flags: kept } : send;
    }
    const second = stereo && ch !== start;
    const link = stereo ? SEND_LINKED | (second ? 0 : SEND_FIRST) : 0;
    return {
      flags: kept | SEND_MEMBER | link,
      level: rawFromLevel(member.level),
      // A pair's pan (its balance) is the first send's; the second's is carried as read.
      pan: second ? send.pan : (member.pan ?? PAN_CENTRE),
    };
  });
};

const recordFromKey = (
  key: Key,
  base: KeyRecord,
  channels: readonly Channel[],
  path: string,
): Validated<KeyRecord> => {
  // Bits the model doesn't cover always pass through; so do the covered bits
  // a key type doesn't set, while the key keeps the type it was read as.
  const same = kindOf(base) === key.type;
  const kept = base.flags & ~KEY_KNOWN;
  const keptIfSame = (bits: number) => (same ? base.flags & bits : 0);
  const plain = { ...base, sends: sendsFor(base.sends, [], channels) };
  const at = `${path}.name`;

  switch (key.type) {
    case 'unassigned':
      return nameFields(undefined, base, at).map((n) => ({
        ...plain,
        flags: kept | n.flag,
        source: NO_SOURCE,
        name: n.bytes,
      }));
    case 'auto':
      // The model gives Auto keys no name; an Auto key keeps its own name bytes and source.
      return (
        same
          ? Result.ok<NameFields, Issues>({ flag: base.flags & KEY_CUSTOM_NAME, bytes: base.name })
          : nameFields(undefined, base, at)
      ).map((n) => ({
        ...plain,
        flags: kept | keptIfSame(KEY_STEREO) | n.flag | KEY_AUTO | muteFlag(key.muted),
        source: same ? base.source : NO_SOURCE,
        level: rawFromLevel(key.level),
        name: n.bytes,
      }));
    case 'channel':
      return nameFields(key.name, base, at).map((n) => ({
        ...plain,
        flags:
          kept | (isStereo(channels, key.channel) ? KEY_STEREO : 0) | n.flag | muteFlag(key.muted),
        source: key.channel - 1,
        level: rawFromLevel(key.level),
        pan: key.pan ?? PAN_CENTRE,
        name: n.bytes,
      }));
    case 'group':
      return nameFields(key.name, base, at).map((n) => ({
        ...base,
        // Bit 0 on a group key is seen in files but not understood: carried.
        flags: kept | keptIfSame(KEY_STEREO) | n.flag | KEY_GROUP | muteFlag(key.muted),
        source: NO_SOURCE,
        sends: sendsFor(base.sends, key.members, channels),
        level: rawFromLevel(key.level),
        name: n.bytes,
      }));
    case 'aux':
      return nameFields(key.name, base, at).map((n) => ({
        ...plain,
        // Every Aux Input key seen has bit 0 (stereo) set; one read with it clear keeps it clear.
        flags: kept | (same ? base.flags & KEY_STEREO : KEY_STEREO) | n.flag | muteFlag(key.muted),
        source: AUX_SOURCE,
        level: rawFromLevel(key.level),
        pan: key.pan ?? PAN_CENTRE,
        name: n.bytes,
      }));
    case 'tone':
      return nameFields(key.name, base, at).map((n) => ({
        ...plain,
        flags: kept | keptIfSame(KEY_STEREO) | n.flag | muteFlag(key.muted),
        source: TONE_SOURCE,
        level: rawFromLevel(key.level),
        // The model gives the tone no pan: a tone key keeps its byte, a new one is centred.
        pan: same ? base.pan : PAN_CENTRE,
        name: n.bytes,
      }));
    case 'unknown':
      return nameFields(key.name, base, at).map((n) => ({
        ...base,
        flags: (key.flags & ~KEY_CUSTOM_NAME) | n.flag,
        source: key.source,
        level: rawFromLevel(key.level),
        pan: key.pan ?? PAN_CENTRE,
        name: n.bytes,
      }));
  }
};

const pageFromKeys = (
  keys: readonly Key[],
  base: StatePage,
  channels: readonly Channel[],
  path: string,
): Validated<StatePage> =>
  combine([
    check(keys.length === KEY_COUNT, path, `must have ${KEY_COUNT} keys, got ${keys.length}`),
    collect(
      keys.map((key, i) =>
        recordFromKey(key, base.keys[i] ?? KeyRecords.blank, channels, `${path}[${i}]`),
      ),
    ),
  ]).map(([, records]) => ({ ...base, keys: records }));

/** A config holding `system`'s keys, written over `base`. Preset pages pass through untouched. */
const configFrom = (system: System, base: ConfigFile): Validated<ConfigFile> =>
  pageFromKeys(system.keys, base.state, system.channels, 'keys').map((state) => ({
    ...base,
    state,
  }));

export const ME1 = {
  /** Decode a 72 KB config. */
  decode: (data: Uint8Array | ArrayBuffer): Validated<ME1Document> =>
    ConfigFile.decode(data)
      .mapErr((e) => [
        { path: 'me1', reason: `a config is ${e.expected[0]} bytes, got ${e.actual}` },
      ])
      .map(documentFrom),

  /** Encode a complete system's mix as a config, over the config it was read from (if any). */
  encode: (system: System): Validated<Uint8Array> =>
    configFrom(system, system.source?.me1 ?? ConfigFile.blank()).andThen(ConfigFile.encode),
};
