# @mcmillan/me1-mate-core

One model of an Allen & Heath ME personal monitoring system, parsed from and
built into ME-1 configs (`.ME1`) and ME-U channel setups (`.meu`).

```ts
import {
  parseME1Config,
  parseMEUConfig,
  parseConfig, // files → System
  buildME1Config,
  buildMEUConfig, // System → files
} from '@mcmillan/me1-mate-core';
```

Every function returns a true-myth `Result`. On failure the error is a list
of `{ path, reason }` issues, one per problem found, never just the first.

## Parse

```ts
import { readFileSync } from 'node:fs';

parseME1Config(readFileSync('ME1CFG/JOSEPH.ME1')); // Result<System, Issue[]>
parseMEUConfig(readFileSync('ChannelSetup.meu', 'utf8')); // Result<System, Issue[]>
parseConfig({
  me1: readFileSync('ME1CFG/JOSEPH.ME1'),
  meu: readFileSync('ChannelSetup.meu', 'utf8'),
}); // Result<System, Issue[]>
```

The `.meu` carries the channel names and stereo links; the `.ME1` carries the
keys. Each parses to a complete `System` with the other half at its
defaults: from an `.ME1` alone the channels are unnamed but stereo pairs are
known; from a `.meu` alone the keys are unassigned. `parseConfig` takes both
and fails if they disagree about which channels are stereo.

## The model

A `System` is plain, readonly data. Channels are numbered 1–40 as the hardware
shows them; the `channels` array is positional, so `channels[17]` is channel 18.

```ts
system.map((s) => {
  s.channels[0]; // { name: 'Kick' }
  s.channels[6]; // { name: 'OH', stereo: true }
  s.keys[0]; // { type: 'group', name: 'Kit', level: 0, members: [{ channel: 1, level: 4.6, pan: 37 }, …] }
  s.keys[2]; // { type: 'channel', channel: 18, level: -0.4, pan: 37 }
  s.keys[15]; // { type: 'auto', level: 0 }
});
```

A key is one of:

| `type`       | Meaning                                                                      | Fields                                             |
| ------------ | ---------------------------------------------------------------------------- | -------------------------------------------------- |
| `unassigned` | No source.                                                                   |                                                    |
| `auto`       | Auto Mode: takes the first channel no other key uses.                        | `level?`, `muted?`                                 |
| `channel`    | One channel, or a stereo pair by its first (odd) channel.                    | `channel`, `name?`, `level?`, `pan?`, `muted?`     |
| `group`      | Several channels under one master level. A channel can be in only one group. | `name?`, `level?`, `members`, `muted?`             |
| `aux`        | The ME-1's Aux Input, the stereo socket on its rear panel.                   | `name?`, `level?`, `pan?` (the balance), `muted?`  |
| `tone`       | The ME-1's built-in test tone (the guide's 1kHz Sine).                       | `name?`, `level?`, `muted?`                        |
| `unknown`    | A flag or source combination not yet explained, kept raw.                    | `flags`, `source`, `name?`, `level?`, `pan?` (raw) |

`KEY_TYPES` lists the types a system can be given (all but `unknown`, which
only comes from files), and `KeyType` is the union of every `type`. A
group member is `{ channel, level?, pan? }`. Optional fields default to:
no custom name (the key shows its source's name), level `0`, pan
`PAN_CENTRE`, not muted. Reading a file sets every level and pan, and
`muted: true` only on muted keys.

Levels are dB relative to the `0` marker on the ME-1's level bar, or `'off'`.
The bar runs from off through `0` to +10. The ME-1 stores 1/256 dB steps, so
a level read from a file can be `-0.37890625`; anything you write is rounded
to the nearest step. The highest level an ME-1 has been seen to save is
`+9.62109375`, short of the guide's +10, so the dB scale is a close
estimate rather than a measurement.

Pan is the ME-1's own step, from `PAN_MIN` (`0`, hard left) through
`PAN_CENTRE` (`37`) to `PAN_MAX` (`74`, hard right); these were read
from presets saved on an ME-1 panned left, centre and right. On a stereo pair
(a channel key, a group member or the Aux Input) pan is the balance.

## Build

`buildME1Config` and `buildMEUConfig` take a `System`, or a draft of one: anything
left out gets the ME-1's default (unnamed channels, unassigned keys).

```ts
buildME1Config({
  channels: [
    { name: 'Kick' },
    { name: 'Snare' },
    { name: 'KeysL', stereo: true }, // links channels 3 and 4
    { name: 'KeysR' },
    { name: 'Vox' },
  ],
  keys: [
    {
      type: 'group',
      name: 'Drums',
      level: 2,
      members: [{ channel: 1 }, { channel: 2, level: -3 }],
    },
    { type: 'channel', channel: 3, name: 'Keys' }, // the pair, by its first channel
    { type: 'channel', channel: 5, level: 'off' },
    { type: 'auto' },
  ],
}); // Result<Uint8Array, Issue[]>
```

To edit a file, parse it, spread the changes and build:

```ts
const edited = parseConfig(files).map((s) => ({
  ...s,
  keys: s.keys.with(2, { type: 'channel', channel: 18, name: 'Bass', level: -3 }),
}));

edited.andThen(buildME1Config); // Result<Uint8Array, Issue[]>
edited.andThen(buildMEUConfig); // Result<string, Issue[]>
```

Keep the `source` field when you spread a parsed system: it carries the bytes
the model doesn't cover (global settings, unexplained flag bits, old names) so
the rewrite changes only what you changed. Drop it and you get a fresh file
built on the defaults seen in real ones.

## Rules that are checked

Both build functions check the draft before encoding:

- 40 channels and 16 keys; drafts are padded, surplus is an error.
- Channel references are 1–40, and a stereo pair is referred to by its odd channel.
- Both channels of a pair are stereo or neither (setting `stereo` on either channel of a pair in a draft marks both).
- A channel is in at most one group.
- Key names: 1–6 of `0-9 A-Z a-z` and space. Channel names: up to 6 characters.
- Levels are `'off'` or within the bar's range; pan is a whole number
  `PAN_MIN`–`PAN_MAX` (an `unknown` key's raw pan is a byte); `muted` is a
  boolean.

```ts
buildME1Config({ keys: [{ type: 'channel', channel: 99, level: 50 }] });
// Err([
//   { path: 'keys[0].channel', reason: 'channel must be 1–40' },
//   { path: 'keys[0].level',   reason: "level must be 'off' or -118.00…10 dB" },
// ])
```

## File formats

The binary layout is documented at the top of
[`src/formats/me1/schema.ts`](src/formats/me1/schema.ts), and the JSON layout
in [`src/formats/meu/index.ts`](src/formats/meu/index.ts). In short:

- **`.ME1` config**, 72 KB: 18 flash pages of 4 KB. Page 0 is the current
  state (16 key records, then a settings block); pages 1–17 hold the ME-1's
  preset table and snapshots, which this library doesn't model and carries
  through untouched. The config's name is its 8.3 file name.
- **`.meu`**, JSON: one entry per channel with the name and stereo link the
  hub sends to the mixers.

Not modelled, and carried through untouched: the settings block (EQ, limiter,
mic mute, dimmer); the source an Auto Mode key stores; bit 0 on a group key;
a group key's own pan; the second send of a linked pair in a group, whose pan
can differ from the first's; stale bytes (names without the custom-name flag,
link bits on sends that aren't members); the ME-U's
`UseReceivedNameAndStereo`; and an empty ME-U channel name, read as
unnamed and written back empty. Sources above 40 other than the tone (47)
haven't been seen and read as `unknown`. No generated file has been loaded
on real hardware yet.

## Layout

```
src
├── index.ts             public API
├── model.ts             Channel, Key, Level and the constants
├── system.ts            System and SystemDraft; parse* and build*; defaults
├── validate.ts          the ME-1's rules
├── issues.ts            Issue, Validated<T>, helpers for collecting every issue
├── codec.ts             building blocks for fixed-size binary records
└── formats
    ├── me1/schema.ts    bytes ⇄ plain records, nothing interpreted
    ├── me1/index.ts     records ⇄ model
    └── meu/index.ts     JSON ⇄ model
```

Tests and sample files live in `test`. Three fixtures are real ME-1 configs
and one is the ME-U setup one of them was built from; the tests check that
each re-encodes to the identical bytes.
