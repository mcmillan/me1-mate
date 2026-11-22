/**
 * The `.meu` format: ME-U hub channel setups. JSON with one entry per channel
 * holding the name and stereo link the hub sends to the ME-1s. The encoder
 * reproduces the hub's own formatting exactly.
 */

import { tryOrElse } from 'true-myth/result';
import { check, collect, combine, invalid, under, type Validated } from '../../issues.ts';
import { type Channel, channelName } from '../../model.ts';

interface MEUChannelRecord {
  /** Unnamed channels hold their number, e.g. "30"; one file has an empty name. */
  readonly name: string;
  readonly stereoLink: boolean;
  /**
   * `UseReceivedNameAndStereo`. True on every channel of one file and false on
   * every channel of another, both with user names set; presumably prefers
   * names and links from upstream when there are any. Not modelled, carried.
   */
  readonly useReceivedNameAndStereo: boolean;
}

/** The file as stored. */
export interface MEUFile {
  readonly channels: readonly MEUChannelRecord[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const recordFrom = (c: unknown, index: number): Validated<MEUChannelRecord> => {
  const path = `Channels[${index}]`;
  if (!isRecord(c)) return invalid(path, 'not an object');
  const { UserChannelName: name, UserStereoLink: link, UseReceivedNameAndStereo: received } = c;
  return combine([
    check(typeof name === 'string', `${path}.UserChannelName`, 'not a string'),
    check(typeof link === 'boolean', `${path}.UserStereoLink`, 'not a boolean'),
    check(typeof received === 'boolean', `${path}.UseReceivedNameAndStereo`, 'not a boolean'),
  ]).map(() => ({
    name: String(name),
    stereoLink: link === true,
    useReceivedNameAndStereo: received === true,
  }));
};

export const MEUFile = {
  decode: (data: string | Uint8Array): Validated<MEUFile> =>
    tryOrElse(
      (e) => [{ path: '', reason: `not JSON: ${e instanceof Error ? e.message : String(e)}` }],
      (): unknown => JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data)),
    )
      .andThen((json): Validated<MEUFile> => {
        const channels = isRecord(json) ? json.Channels : undefined;
        return Array.isArray(channels)
          ? collect(channels.map(recordFrom)).map((cs) => ({ channels: cs }))
          : invalid('Channels', 'missing "Channels" array');
      })
      .mapErr((issues) => under('meu', issues)),

  encode: (file: MEUFile): string =>
    `{\n"Channels" : [\n${file.channels
      .map(
        (c) =>
          `{ "UserChannelName" : ${JSON.stringify(c.name)}, "UserStereoLink" : ${c.stereoLink}, "UseReceivedNameAndStereo" : ${c.useReceivedNameAndStereo} }`,
      )
      .join(', \n')}\n]\n}\n`,
};

/** What a setup holds. */
export interface MEUDocument {
  readonly channels: readonly Channel[];
  readonly file: MEUFile;
}

/**
 * Whether a stored name leaves channel `n` unnamed: its own number, or empty.
 * What the ME-1 shows for an empty name isn't known; it's read as unnamed and
 * written back as it was read.
 */
const isUnnamed = (name: string, n: number): boolean => name === String(n) || name === '';

export const MEU = {
  decode: (data: string | Uint8Array): Validated<MEUDocument> =>
    MEUFile.decode(data).map((file) => ({
      channels: file.channels.map(
        (c, i): Channel => ({
          ...(isUnnamed(c.name, i + 1) ? {} : { name: c.name }),
          ...(c.stereoLink ? { stereo: true } : {}),
        }),
      ),
      file,
    })),

  /** Encode channels as a setup, keeping what the setup they were read from (if any) stores for them. */
  encode: (channels: readonly Channel[], base?: MEUFile): string =>
    MEUFile.encode({
      channels: channels.map((c, i) => {
        const was = base?.channels[i];
        return {
          name:
            c.name === undefined && was !== undefined && isUnnamed(was.name, i + 1)
              ? was.name
              : channelName(channels, i + 1),
          stereoLink: c.stereo === true,
          useReceivedNameAndStereo: was?.useReceivedNameAndStereo ?? true,
        };
      }),
    }),
};
