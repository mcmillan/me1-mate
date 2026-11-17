import type { Key } from '@mcmillan/2me2u-core';
import { useAtom, useAtomValue } from 'jotai';
import { type KeyboardEvent, useId, useRef } from 'react';
import { SizableText, Theme, XStack, YStack } from 'tamagui';
import { type Editable, isStereo, keyLabel, levelText, pickTarget } from '../lib/edit.ts';
import { highlightKeyAtom, issuesAtom, selectedKeyAtom, systemAtom } from '../lib/store.ts';
import { ACCENT, DISPLAY_FONT, KEY_TYPE_LABEL, KEY_TYPE_THEME } from '../lib/theme.ts';
import { levelPosition } from './Fader.tsx';
import { Action, Panel, PanelTitle, TypeDot } from './ui.tsx';

/**
 * What a key plays: a few characters for the tile, and in words for its
 * accessible name. The tile drops `lead` when it's too narrow for both.
 */
const plays = (
  system: Editable,
  key: Key,
): { lead?: string; text: string; spoken: string } | undefined => {
  switch (key.type) {
    case 'unassigned':
      return undefined;
    case 'auto':
      return { lead: 'Next', text: 'free', spoken: 'next free channel' };
    case 'channel': {
      // A loaded file can refer to a pair by its second channel: show the pair.
      const first = pickTarget(system, key.channel);
      return isStereo(system, first)
        ? {
            lead: 'Ch',
            text: `${first}+${first + 1}`,
            spoken: `channels ${first} and ${first + 1}`,
          }
        : { lead: 'Ch', text: String(first), spoken: `channel ${first}` };
    }
    case 'group': {
      const n = key.members.length;
      return {
        text: `${n} ch`,
        spoken: n === 0 ? 'no channels' : `${n} channel${n === 1 ? '' : 's'}`,
      };
    }
    case 'unknown':
      return { lead: 'Kept', text: 'as-is', spoken: 'kept as-is' };
  }
};

type Direction = 'left' | 'right' | 'up' | 'down';

const DIRECTIONS: Partial<Record<string, Direction>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

/**
 * The tile an arrow key moves to, from where the tiles are on screen now rather
 * than their index, so it follows the 8-, 4- and 2-column layouts alike. A tile
 * is that way when its near edge is past the current tile's far edge; tiles in
 * the same row or column win, nearest first, then the best-aligned of the rest.
 */
const nearestTile = (
  current: HTMLElement,
  direction: Direction,
  tiles: readonly (HTMLElement | null)[],
): number | undefined => {
  const TOLERANCE = 1;
  const from = current.getBoundingClientRect();
  const horizontal = direction === 'left' || direction === 'right';
  let best: { index: number; aligned: boolean; gap: number; offset: number } | undefined;
  tiles.forEach((tile, index) => {
    if (!tile || tile === current || tile.checkVisibility?.() === false) return;
    const to = tile.getBoundingClientRect();
    const gap = {
      left: from.left - to.right,
      right: to.left - from.right,
      up: from.top - to.bottom,
      down: to.top - from.bottom,
    }[direction];
    if (gap < -TOLERANCE) return;
    const aligned = horizontal
      ? to.top < from.bottom - TOLERANCE && to.bottom > from.top + TOLERANCE
      : to.left < from.right - TOLERANCE && to.right > from.left + TOLERANCE;
    const offset = horizontal
      ? Math.abs(to.top + to.height / 2 - (from.top + from.height / 2))
      : Math.abs(to.left + to.width / 2 - (from.left + from.width / 2));
    const better =
      !best ||
      (aligned && !best.aligned) ||
      (aligned === best.aligned &&
        (aligned
          ? gap < best.gap || (gap === best.gap && offset < best.offset)
          : gap + 2 * offset < best.gap + 2 * best.offset));
    if (better) best = { index, aligned, gap, offset };
  });
  return best?.index;
};

/**
 * What Tamagui's props can't say. The grid asks its own width, not the
 * viewport's, how many columns fit (the panel sits beside the inspector or
 * above it), and each tile asks its own width how much text fits. Colours are
 * the tile's theme (`--color-N`: orange when selected, else neutral) mixed
 * into the panel, so light and dark come from the same rules.
 *
 * A tile's states are separate marks, so they show together: selected is a
 * solid 2px accent edge and tint (the inner 1px is an inset shadow, so nothing
 * moves), hover deepens the neutral fill and edge, a press shrinks it,
 * keyboard focus is the page's offset outline, and a key pointed at from one
 * of its markers in the Channels panel wears an edge in its type's colour,
 * the same edge its channels wear when the tile is pointed at.
 */
const CSS = `
.kg-box { container: kg / inline-size; }
/* Keys 1–8 and 9–16 are the ME-1's two rows: more room between them than within one. */
.kg-rows { display: grid; gap: 16px; }
.kg-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }

.kg-grid .kg-tile {
  --kg-dash: 65%;
  --kg-fill: color-mix(in srgb, var(--color-2) 40%, var(--panel));
  --kg-edge: color-mix(in srgb, var(--color-8) 28%, var(--panel));
  --kg-inner: transparent;
  position: relative;
  container: kg-tile / inline-size;
  min-block-size: 78px;
  padding: 8px;
  background-color: var(--kg-fill);
  box-shadow: inset 0 0 0 1px var(--kg-inner);
}
@media (prefers-color-scheme: dark) {
  .kg-grid .kg-tile { --kg-dash: 40%; }
}
.kg-grid .kg-tile[data-empty] {
  --kg-fill: transparent;
  --kg-edge: color-mix(in srgb, var(--color-8) var(--kg-dash), var(--panel));
}
.kg-grid .kg-tile[aria-checked="true"] {
  --kg-tint: var(--color-2);
  --kg-fill: color-mix(in srgb, var(--kg-tint) 55%, var(--panel));
  --kg-edge: var(--color-8);
  --kg-inner: var(--color-8);
}
/* Dark orange's 2 is a red-brown; tint the selected tile with the orange itself. */
@media (prefers-color-scheme: dark) {
  .kg-grid .kg-tile[aria-checked="true"] { --kg-tint: color-mix(in srgb, var(--color-8) 30%, var(--panel)); }
}
@media (hover: hover) {
  .kg-grid .kg-tile:hover {
    --kg-fill: color-mix(in srgb, var(--color-2) 90%, var(--panel));
    --kg-edge: color-mix(in srgb, var(--color-8) 55%, var(--panel));
  }
  .kg-grid .kg-tile[data-empty]:hover {
    --kg-fill: color-mix(in srgb, var(--color-2) 50%, var(--panel));
    --kg-edge: color-mix(in srgb, var(--color-8) 90%, var(--panel));
  }
  .kg-grid .kg-tile[aria-checked="true"]:hover {
    --kg-fill: color-mix(in srgb, var(--kg-tint) 80%, var(--panel));
    --kg-edge: var(--color-8);
  }
}
/* A press deepens the fill and shrinks the tile, in place of the button's default dimming. */
.kg-grid .kg-tile:active { --kg-fill: var(--color-2); scale: 0.97; opacity: 1; }
.kg-grid .kg-tile[aria-checked="true"]:active { --kg-fill: var(--kg-tint); }
/* Pointed at from a channel's marker: an edge in the key type's colour, over the tile's own. */
.kg-tile .kg-point {
  position: absolute;
  inset: -1px;
  border: 1.5px solid var(--color-6);
  border-radius: 8px;
  opacity: 0;
  pointer-events: none;
}
.kg-grid .kg-tile[data-highlight]:not([aria-checked="true"], :hover, :focus-visible) .kg-point { opacity: 1; }
.kg-grid .kg-tile:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@media (prefers-reduced-motion: no-preference) {
  .kg-grid .kg-tile {
    transition: background-color 130ms ease-out, border-color 130ms ease-out, box-shadow 130ms ease-out, scale 130ms ease-out;
  }
  .kg-tile .kg-point { transition: opacity 130ms ease-out; }
}
/*
 * Forced colours drop the fills and shadows, and make every edge the same: the
 * selected tile gets a thick edge in the system's selection colour instead
 * (padding makes up the difference, so nothing moves).
 */
@media (forced-colors: active) {
  .kg-grid .kg-tile[aria-checked="true"] { border: 3px solid Highlight !important; padding: 6px; }
  .kg-tile .kg-point { border-color: CanvasText; }
}

/*
 * The panel's own width decides the columns: the ME-1's two rows of eight once
 * each tile has room for a full label and what the key plays.
 */
@container kg (inline-size >= 664px) {
  .kg-grid { grid-template-columns: repeat(8, minmax(0, 1fr)); }
}
@container kg (inline-size < 300px) {
  .kg-rows { gap: 12px; }
  .kg-grid { gap: 4px; }
  .kg-grid .kg-tile { padding: 5px; }
}
@container kg (inline-size < 232px) {
  .kg-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/*
 * The number, then the level if there's room beside it: when there isn't, the
 * level wraps to a second line, and the row is one line tall.
 */
.kg-tile .kg-top {
  display: flex; flex-wrap: wrap; align-items: center; align-content: flex-start; column-gap: 6px;
  block-size: 14px; overflow: hidden;
}
.kg-tile .kg-top > * { flex: none; }
.kg-tile :is(.kg-num, .kg-count, .kg-level) { line-height: 14px; font-variant-numeric: tabular-nums; }
.kg-tile .kg-level { margin-inline-start: auto; }
.kg-tile .kg-unit { display: none; }
.kg-tile .kg-label {
  margin-block-start: 3px; font-size: 16px; line-height: 20px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.kg-tile .kg-label[data-empty] { font-size: 13px; }
.kg-tile .kg-meta { display: flex; align-items: center; gap: 5px; margin-block-start: 1px; block-size: 15px; }
.kg-tile .kg-dot { display: none; }
.kg-tile .kg-plays { min-inline-size: 0; line-height: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kg-tile .kg-meter { margin-block-start: auto; background: color-mix(in srgb, var(--color-8) 22%, transparent); }

/*
 * A tile's own width (its content box) decides how much it says. Six
 * characters of label always fit; the type dot joins what the key plays, and
 * the unit joins the level, once the longest of each fits.
 */
@container kg-tile (inline-size >= 70px) {
  .kg-tile .kg-dot { display: contents; }
}
@container kg-tile (inline-size >= 96px) {
  .kg-tile .kg-unit { display: inline; }
}
@container kg-tile (inline-size < 58px) {
  .kg-tile .kg-label { font-size: 14px; }
  .kg-tile .kg-lead { display: none; }
  .kg-tile .kg-lead + .kg-rest { text-transform: capitalize; }
}
`;

const Tile = ({
  index,
  keyValue: key,
  selected,
  highlighted,
  problems,
  onSelect,
  onKeyDown,
  onPoint,
  tileRef,
}: {
  index: number;
  keyValue: Key;
  selected: boolean;
  highlighted: boolean;
  problems: number;
  onSelect: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
  /** The pointer or focus arrived on this tile (`true`) or left it. */
  onPoint: (on: boolean) => void;
  tileRef: (el: HTMLElement | null) => void;
}) => {
  const system = useAtomValue(systemAtom);
  const empty = key.type === 'unassigned';
  const label = keyLabel(system, key);
  const playing = plays(system, key);
  const level = empty ? undefined : levelText(key.level);
  const [levelValue, levelUnit] = level?.split(' ') ?? [];
  const position = empty ? 0 : levelPosition(key.level ?? 0);
  const name = [
    `Key ${index + 1}: ${empty ? 'unassigned' : label}`,
    empty ? undefined : KEY_TYPE_LABEL[key.type],
    playing?.spoken,
    level,
    problems > 0 ? `${problems} problem${problems === 1 ? '' : 's'}` : undefined,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Theme name={selected ? ACCENT : null}>
      <Action
        ref={tileRef as never}
        className="kg-tile"
        role="radio"
        aria-checked={selected}
        aria-label={name}
        tabIndex={selected ? 0 : -1}
        data-empty={empty ? '' : undefined}
        data-highlight={highlighted ? '' : undefined}
        onPress={onSelect}
        onKeyDown={onKeyDown}
        onPointerEnter={() => onPoint(true)}
        onPointerLeave={() => onPoint(false)}
        onFocus={() => onPoint(true)}
        onBlur={() => onPoint(false)}
        h="auto"
        rounded="lg"
        flexDirection="column"
        items="stretch"
        justify="flex-start"
        gap="0"
        bg="transparent"
        borderStyle={empty && !selected ? 'dashed' : 'solid'}
        // The edge colour is a state of the tile, worked out in the CSS above.
        style={{ borderColor: 'var(--kg-edge)' }}
      >
        <span className="kg-top">
          <SizableText
            className="kg-num"
            size="xs"
            fontFamily={DISPLAY_FONT}
            fontWeight="600"
            color="color-8"
          >
            {String(index + 1).padStart(2, '0')}
          </SizableText>
          {problems > 0 && (
            <Theme name="red">
              <XStack
                render="span"
                items="center"
                justify="center"
                h={14}
                minW={14}
                px="1"
                rounded="full"
                bg="color-9"
              >
                <SizableText
                  className="kg-count"
                  size="xs"
                  fontFamily={DISPLAY_FONT}
                  fontWeight="700"
                  color="color-1"
                >
                  {problems}
                </SizableText>
              </XStack>
            </Theme>
          )}
          {level && (
            <SizableText className="kg-level" size="xs" fontFamily={DISPLAY_FONT} color="color-10">
              {levelValue}
              {levelUnit && <span className="kg-unit"> {levelUnit}</span>}
            </SizableText>
          )}
        </span>
        {empty ? (
          <SizableText className="kg-label" data-empty="" size="sm" color="color-8" text="left">
            Empty
          </SizableText>
        ) : (
          <SizableText
            className="kg-label"
            size="base"
            fontFamily={DISPLAY_FONT}
            fontWeight="600"
            color="color-11"
            text="left"
          >
            {label}
          </SizableText>
        )}
        {playing && (
          <span className="kg-meta">
            <span className="kg-dot">
              <TypeDot type={key.type} />
            </span>
            <SizableText className="kg-plays" size="xs" color="color-10">
              {playing.lead && <span className="kg-lead">{playing.lead} </span>}
              <span className="kg-rest">{playing.text}</span>
            </SizableText>
          </span>
        )}
        {!empty && (
          <YStack render="span" className="kg-meter" h={4} rounded="full" overflow="hidden">
            <Theme name={KEY_TYPE_THEME[key.type] ?? null}>
              <YStack render="span" h="100%" w={`${position * 100}%`} rounded="full" bg="color-9" />
            </Theme>
          </YStack>
        )}
        <Theme name={KEY_TYPE_THEME[key.type] ?? null}>
          <span className="kg-point" />
        </Theme>
      </Action>
    </Theme>
  );
};

const LEGEND: readonly Key['type'][] = ['channel', 'group', 'auto'];

/**
 * The key selector: the 16 select keys laid out as on the ME-1, 1–8 above
 * 9–16, with a wider gap between the two rows than between the keys of one.
 * A narrow panel folds each row of eight into two rows of four (the columns
 * follow the panel's width, not the viewport's). Each tile
 * shows the key at a glance (number, label, what it plays, level, type by
 * colour, problems); selecting one opens it in the inspector and makes it the
 * key that channel picks assign to. Pointing at or focusing a tile sets
 * `highlightKeyAtom`, so the Channels panel can point out its channels.
 */
export const KeyGrid = () => {
  const system = useAtomValue(systemAtom);
  const issues = useAtomValue(issuesAtom);
  const [selected, setSelected] = useAtom(selectedKeyAtom);
  const [highlight, setHighlight] = useAtom(highlightKeyAtom);
  const tiles = useRef<(HTMLElement | null)[]>([]);
  const titleId = useId();
  const count = system.keys.length;
  const half = Math.ceil(count / 2);
  const legend: readonly Key['type'][] = system.keys.some((k) => k.type === 'unknown')
    ? [...LEGEND, 'unknown']
    : LEGEND;

  const select = (i: number, focus = false) => {
    setSelected(i);
    if (focus) tiles.current[i]?.focus();
  };

  const onKeyDown = (i: number) => (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const current = tiles.current[i];
    // Only when the tile itself has focus, not something inside it.
    if (!current || e.nativeEvent.composedPath()[0] !== current) return;
    const direction = DIRECTIONS[e.key];
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? count - 1
          : direction && nearestTile(current, direction, tiles.current);
    // Nothing that way: leave the key to the browser, so the page can scroll.
    if (next === undefined || next === i || !tiles.current[next]) return;
    e.preventDefault();
    select(next, true);
    tiles.current[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  /** Point a tile out, or stop, unless something else has been pointed out since. */
  const point = (i: number) => (on: boolean) =>
    setHighlight((current) => (on ? i : current === i ? null : current));

  const problemsOf = (i: number) => issues.filter((x) => x.path.startsWith(`keys[${i}]`)).length;

  return (
    <Panel render="section" aria-labelledby={titleId} p={{ default: '3', sm: '4' }}>
      <style href="kg" precedence="default">
        {CSS}
      </style>
      <XStack items="center" justify="space-between" gap="3" flexWrap="wrap">
        <PanelTitle id={titleId}>Keys</PanelTitle>
        <XStack items="center" gap="3" aria-hidden>
          {legend.map((type) => (
            <XStack key={type} items="center" gap="1.5">
              <TypeDot type={type} />
              <SizableText size="xs" color="color-8">
                {KEY_TYPE_LABEL[type]}
              </SizableText>
            </XStack>
          ))}
        </XStack>
      </XStack>
      <div className="kg-box">
        <div role="radiogroup" aria-label="Keys" className="kg-rows">
          {[0, half].map((from) => (
            <div key={from} role="presentation" className="kg-grid">
              {system.keys.slice(from, from + half).map((key, offset) => {
                const index = from + offset;
                return (
                  <Tile
                    key={index}
                    index={index}
                    keyValue={key}
                    selected={index === selected}
                    highlighted={index === highlight}
                    problems={problemsOf(index)}
                    onSelect={() => select(index)}
                    onKeyDown={onKeyDown(index)}
                    onPoint={point(index)}
                    tileRef={(el) => {
                      tiles.current[index] = el;
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
};
