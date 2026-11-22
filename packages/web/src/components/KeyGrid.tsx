import type { Key } from '@mcmillan/2me2u-core';
import { useAtom, useAtomValue } from 'jotai';
import { type CSSProperties, type KeyboardEvent, useId, useRef } from 'react';
import { Theme } from 'tamagui';
import { type Editable, isStereo, keyLabel, levelText, pickTarget } from '../lib/edit.ts';
import { highlightKeyAtom, issuesAtom, selectedKeyAtom, systemAtom } from '../lib/store.ts';
import { KEY_TYPE_LABEL, keyStyle } from '../lib/theme.ts';
import { levelPosition } from './Fader.tsx';
import { Action, Panel, PanelTitle } from './ui.tsx';

/**
 * What a key plays: a few characters for the tile's one quiet line, and in
 * words for its accessible name. The narrowest tiles drop `lead`.
 */
const plays = (
  system: Editable,
  key: Key,
): { lead?: string; text: string; spoken: string } | undefined => {
  switch (key.type) {
    case 'unassigned':
      return undefined;
    case 'auto':
      return { lead: 'next', text: 'free', spoken: 'next free channel' };
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
      return { lead: 'kept', text: 'as-is', spoken: 'kept as-is' };
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
 * How wide each printable ASCII character (space to `~`) is in the label's
 * voice (Allo at `--w-display`, fully round), in hundredths of an em, so a
 * label's width is known without laying it out. Measured as the page renders
 * it, each at its widest beside other letters and at the label's smallest
 * size, where Allo's optical sizing sets it widest.
 */
const ADVANCES = [
  25, 34, 51, 70, 65, 97, 71, 34, 37, 36, 67, 68, 33, 47, 33, 42, 68, 68, 68, 68, 68, 68, 68, 68,
  68, 68, 33, 34, 68, 68, 68, 56, 103, 72, 67, 75, 73, 62, 59, 77, 75, 38, 59, 67, 57, 93, 76, 78,
  66, 79, 66, 65, 66, 73, 71, 103, 74, 66, 66, 38, 42, 37, 58, 52, 35, 59, 64, 59, 64, 60, 40, 64,
  62, 27, 28, 54, 38, 90, 62, 62, 64, 64, 43, 56, 41, 62, 57, 82, 57, 57, 57, 38, 34, 37, 68,
];

/**
 * A label's width in ems, a little over (the label's tight tracking isn't
 * counted, and anything outside ASCII counts as the widest letter). The tile
 * divides its own width by this, so six wide letters shrink to fit and a
 * short label stays big.
 */
const labelEms = (label: string): number => {
  let hundredths = 0;
  for (const char of label) hundredths += ADVANCES[char.charCodeAt(0) - 0x20] ?? 103;
  return Math.max(1, hundredths / 100);
};

/**
 * What Tamagui's props can't say. The grid asks its own width, not the
 * viewport's, how many columns fit (the region sits beside the inspector or
 * above it), and each tile asks its own width how much it can say.
 *
 * An assigned tile is a solid block of its key's colour (`--k`, from
 * `keyStyle`) with dark text (`--on-key`) in both schemes; an empty one is an
 * open slot, neutral until it's pointed at or selected, when it takes a tint
 * of the colour it would get.
 *
 * A tile's states are separate marks, so they show together: selected is an
 * ink ring standing off the tile (`.kg-ring`, which springs out from the
 * tile's edge), hover lifts and brightens it, a press dips it, keyboard focus
 * is the page's blue outline (outside the ink ring when both show), and a key
 * pointed at from the Channels region wears a thinner ink ring (`.kg-point`).
 */
const CSS = `
.kg-box { container: kg / inline-size; }
/* Keys 1–8 and 9–16 are the ME-1's two rows: more room between them than within one. */
.kg-rows { display: grid; gap: 16px; }
.kg-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }

.kg-grid .kg-tile {
  --kg-bg: var(--k);
  --kg-edge: transparent;
  position: relative;
  container: kg-tile / inline-size;
  display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start; gap: 0;
  min-block-size: 88px;
  block-size: auto;
  padding: 9px 11px 10px;
  border-radius: 16px;
  background-color: var(--kg-bg);
  color: var(--on-key);
  font: inherit;
  text-align: start;
  opacity: 1;
}
/*
 * The edge is transparent on a key's colour; forced colours turn it into the
 * tile's outline. (The selector is repeated to outweigh the button's own border.)
 */
.kg-tile.kg-tile.kg-tile.kg-tile { border: 1.5px solid var(--kg-edge); }
.kg-grid .kg-tile[data-kind="unknown"] { --kg-bg: var(--well); --kg-edge: var(--line); color: var(--ink); }
.kg-grid .kg-tile[data-kind="empty"] {
  --kg-bg: transparent;
  --kg-edge: var(--line);
  color: var(--muted);
}
/* The selected slot is the one a pick will fill: it shows the colour it would get. */
.kg-grid .kg-tile[data-kind="empty"][aria-checked="true"] {
  --kg-bg: color-mix(in oklab, var(--k) 16%, var(--canvas));
  --kg-edge: color-mix(in oklab, var(--k) 60%, var(--canvas));
  color: var(--ink);
}

@media (hover: hover) {
  .kg-grid .kg-tile:hover { --kg-bg: color-mix(in oklab, var(--k), white 22%); }
  .kg-grid .kg-tile[data-kind="unknown"]:hover { --kg-bg: var(--line); }
  .kg-grid .kg-tile[data-kind="empty"]:hover {
    --kg-bg: color-mix(in oklab, var(--k) 14%, var(--canvas));
    --kg-edge: color-mix(in oklab, var(--k) 60%, var(--canvas));
    color: var(--ink);
  }
}
.kg-grid .kg-tile:active { --kg-bg: color-mix(in oklab, var(--k), black 10%); }
.kg-grid .kg-tile[data-kind="unknown"]:active { --kg-bg: var(--line); }
.kg-grid .kg-tile[data-kind="empty"]:active { --kg-bg: color-mix(in oklab, var(--k) 26%, var(--canvas)); }

/* Selected: a 3px ink ring, 3px clear of the tile. At rest it hides at the tile's edge. */
.kg-tile .kg-ring, .kg-tile .kg-point {
  position: absolute;
  border-style: solid;
  border-color: var(--ink);
  opacity: 0;
  pointer-events: none;
}
.kg-tile .kg-ring { inset: -7.5px; border-width: 3px; border-radius: 22px; scale: 0.89 0.87; }
.kg-tile[aria-checked="true"] .kg-ring { opacity: 1; scale: 1; }
/* Pointed at from one of its channels: a lighter ring, closer in. */
.kg-tile .kg-point { inset: -5.5px; border-width: 2px; border-radius: 20px; }
.kg-tile[data-highlight]:not([aria-checked="true"], :hover, :focus-visible) .kg-point { opacity: 0.85; }

/*
 * Keyboard focus: the page's blue ring. On the selected tile (where the arrow
 * keys always leave it) the ink ring draws in a little and the blue ring goes
 * outside it, with the canvas showing between the two.
 */
.kg-grid .kg-tile:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; z-index: 1; }
.kg-grid .kg-tile[aria-checked="true"]:focus-visible { outline-offset: 7.5px; }
.kg-tile[aria-checked="true"]:focus-visible .kg-ring { scale: 0.982 0.98; }

@media (prefers-reduced-motion: no-preference) {
  .kg-grid .kg-tile {
    transition: background-color 140ms ease-out, border-color 140ms ease-out, color 140ms ease-out,
      translate 160ms ease-out, scale 160ms ease-out;
  }
  @media (hover: hover) {
    .kg-grid .kg-tile:hover { translate: 0 -2px; }
  }
  .kg-grid .kg-tile:active { translate: 0 0; scale: 0.96; transition-duration: 60ms; }
  .kg-tile .kg-ring { transition: opacity 100ms ease-out, scale 100ms ease-out; }
  .kg-tile[aria-checked="true"] .kg-ring { transition: opacity 80ms ease-out, scale 300ms var(--spring); }
  .kg-tile .kg-point { transition: opacity 120ms ease-out; }
  .kg-tile .kg-meter-fill { transition: translate 200ms ease-out; }
  .kg-tile .kg-plus > span {
    transition: background-color 140ms ease-out, color 140ms ease-out, scale 260ms var(--spring);
  }
  @media (hover: hover) {
    .kg-tile:hover .kg-plus > span { scale: 1.1; }
  }
}

/*
 * A tile says four things, top to bottom, and only the label is loud: the
 * key's number, its label, what it plays, and its level as a meter. The exact
 * level is in the inspector and in the tile's accessible name.
 *
 * The number and the line under the label are set in plain figures (the
 * page's tabular, slashed-zero ones look typewritten this small). 78% of ink
 * is the least that keeps small text at 4.5:1 on every key colour.
 */
.kg-tile .kg-num, .kg-tile .kg-meta {
  display: block; font-feature-settings: normal; white-space: nowrap; opacity: 0.78;
}
.kg-tile .kg-num { font-size: 0.6875rem; line-height: 1.3; font-weight: var(--w-ui); letter-spacing: 0.02em; }
/*
 * The label, in the display voice. Its line is always as tall as the full
 * size; the text inside shrinks only as far as its own width needs
 * (\`--kg-ems\`, from \`labelEms\`) to fit the tile's.
 */
.kg-tile .kg-label {
  /* 21px on the tiles of the two rows of eight, more where a tile is wider. */
  --kg-full: clamp(1.3125rem, 22cqi, 1.75rem);
  display: block; margin-block-start: 2px;
  font-size: var(--kg-full); line-height: 1.15; font-weight: var(--w-display);
  /* The page's x-height matching is worked out for body text; here it would upset the fit. */
  font-size-adjust: none;
  white-space: nowrap; overflow: hidden; text-overflow: clip;
}
.kg-tile .kg-label > span {
  font-size: clamp(0.5625rem, calc(100cqi / var(--kg-ems, 4)), var(--kg-full));
  letter-spacing: -0.02em;
}
/* What it plays, in a few characters. */
.kg-tile .kg-meta {
  margin-block: 1px 5px; overflow: hidden; text-overflow: ellipsis;
  font-size: 0.75rem; line-height: 1.3; font-weight: var(--w-text);
}
/* The level, as a thin meter along the bottom. */
.kg-tile .kg-meter {
  display: block; flex: none; margin-block-start: auto;
  block-size: 4px; border-radius: 9px; overflow: hidden;
  background-color: rgb(19 19 22 / 0.14);
}
.kg-tile .kg-meter-fill {
  display: block; block-size: 100%; inline-size: 100%; border-radius: 9px;
  background-color: currentColor; opacity: 0.82;
  translate: calc(var(--kg-level, 0) * 100% - 100%) 0;
}
.kg-tile[data-kind="unknown"] .kg-meter { background-color: var(--line); }
/*
 * An open slot: its number and a plus, both quiet, so the keys that play
 * something are what the eye finds. Pointed at or selected, the plus sits on
 * the colour the key would get.
 */
.kg-tile .kg-plus { flex: 1; display: grid; place-items: center; padding-block-end: 12px; }
.kg-tile .kg-plus > span {
  display: grid; place-items: center;
  inline-size: 1.625rem; block-size: 1.625rem; border-radius: 999px;
  background-color: transparent;
  color: var(--muted);
  font-size: 1.125rem; line-height: 1; font-weight: var(--w-text);
}
.kg-tile[aria-checked="true"] .kg-plus > span { background-color: var(--k); color: var(--on-key); }
@media (hover: hover) {
  .kg-tile:hover .kg-plus > span { background-color: var(--k); color: var(--on-key); }
}
.kg-tile[data-kind="empty"] .kg-num { opacity: 1; }
/* Problems: a red count on its own backing, so it reads on any key colour. */
.kg-tile .kg-badge {
  position: absolute; inset-block-start: -10.5px; inset-inline-end: -8.5px;
  display: flex; align-items: center; gap: 2px;
  min-block-size: 18px; padding: 0 6px;
  border-radius: 999px;
  background-color: var(--card);
  box-shadow: 0 0 0 1.5px var(--color-9);
  color: var(--color-10);
  font-size: 0.75rem; line-height: 1; font-weight: var(--w-ui);
}

/*
 * Forced colours drop the fills: every tile gets a real edge, the selected
 * one a thick edge in the system's selection colour as well as its ring, and
 * the meter is drawn in system colours.
 */
@media (forced-colors: active) {
  .kg-grid .kg-tile { --kg-edge: ButtonBorder; }
  .kg-tile.kg-tile.kg-tile.kg-tile[aria-checked="true"] { border: 3px solid Highlight; }
  .kg-grid .kg-tile[aria-checked="true"] { padding: 7.5px 9.5px 8.5px; }
  .kg-tile .kg-ring { border-color: Highlight; }
  .kg-tile .kg-point { border-color: CanvasText; }
  .kg-tile .kg-meter { background-color: ButtonFace; border: 1px solid ButtonText; }
  .kg-tile .kg-meter-fill { background-color: ButtonText; opacity: 1; }
  .kg-tile .kg-badge { border: 1px solid CanvasText; }
}

/*
 * The region's own width decides the columns: the ME-1's two rows of eight
 * once each tile has room for a full label and what the key plays.
 */
@container kg (inline-size >= 664px) {
  .kg-grid { grid-template-columns: repeat(8, minmax(0, 1fr)); }
}
@container kg (inline-size >= 664px) and (inline-size < 780px) {
  .kg-grid { gap: 10px; }
  .kg-grid .kg-tile { padding-inline: 9px; }
}
@container kg (inline-size < 420px) {
  .kg-rows { gap: 12px; }
  .kg-grid { gap: 8px; }
  .kg-grid .kg-tile { padding: 8px 8px 9px; }
}
@container kg (inline-size < 232px) {
  .kg-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* A tile too narrow for "Ch 29+30" says "29+30". */
@container kg-tile (inline-size < 56px) {
  .kg-tile .kg-lead { display: none; }
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
    <Action
      ref={tileRef as never}
      className="kg-tile"
      role="radio"
      aria-checked={selected}
      aria-label={name}
      tabIndex={selected ? 0 : -1}
      data-kind={empty ? 'empty' : key.type}
      data-highlight={highlighted ? '' : undefined}
      onPress={onSelect}
      onKeyDown={onKeyDown}
      onPointerEnter={() => onPoint(true)}
      onPointerLeave={() => onPoint(false)}
      onFocus={() => onPoint(true)}
      onBlur={() => onPoint(false)}
      h="auto"
      bg="transparent"
      // The key's colour, `--k`; what wears it is worked out in the CSS above.
      style={keyStyle(index)}
    >
      <span className="kg-ring" />
      <span className="kg-point" />
      <span className="kg-num">{String(index + 1).padStart(2, '0')}</span>
      {empty ? (
        <span className="kg-plus">
          <span>+</span>
        </span>
      ) : (
        <span className="kg-label display">
          <span style={{ '--kg-ems': labelEms(label) } as CSSProperties}>{label}</span>
        </span>
      )}
      {playing && (
        <span className="kg-meta">
          {playing.lead && <span className="kg-lead">{playing.lead} </span>}
          {playing.text}
        </span>
      )}
      {!empty && (
        <span className="kg-meter">
          <span className="kg-meter-fill" style={{ '--kg-level': position } as CSSProperties} />
        </span>
      )}
      {problems > 0 && (
        <Theme name="red">
          <span className="kg-badge">
            <span>⚠</span>
            {problems}
          </span>
        </Theme>
      )}
    </Action>
  );
};

/**
 * The key selector: the 16 select keys laid out as on the ME-1, 1–8 above
 * 9–16, with a wider gap between the two rows than between the keys of one.
 * A narrow region folds each row of eight into two rows of four (the columns
 * follow the region's width, not the viewport's). Each tile is a block of its
 * key's colour and shows the key at a glance (number, label, what it plays,
 * a level meter, problems); selecting one opens it in the inspector and makes it the
 * key that channel picks assign to. Pointing at or focusing a tile sets
 * `highlightKeyAtom`, so the Channels region can point out its channels.
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
    <Panel render="section" aria-labelledby={titleId}>
      <style href="kg" precedence="default">
        {CSS}
      </style>
      <PanelTitle id={titleId}>Keys</PanelTitle>
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
