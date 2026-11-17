/**
 * The Channels panel: all 40 channels at once, as their 20 odd/even pairs. It
 * names channels, links pairs as stereo, and assigns channels to the key
 * selected in the Keys grid: each channel's number is a pick button. A linked
 * pair is one channel to the ME-1, with one pick button and one name (its
 * first channel's); the second channel's name is kept but not shown.
 */

import { CHANNEL_COUNT, type Key } from '@mcmillan/2me2u-core';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  type ClipboardEvent,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  memo,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Input, SizableText, type TamaguiElement, Theme, XStack } from 'tamagui';
import { announce } from '../lib/announce.ts';
import {
  canPick,
  channelUses,
  type Editable,
  groupHolding,
  isStereo,
  type KeyUse,
  keyLabel,
  keyPlays,
  pickChannel,
  pickTarget,
  setChannelName,
  setStereo,
} from '../lib/edit.ts';
import {
  editAtom,
  highlightKeyAtom,
  selectedKeyAtom,
  systemAtom,
  toastAtom,
} from '../lib/store.ts';
import { ACCENT, DISPLAY_FONT, KEY_TYPE_THEME } from '../lib/theme.ts';
import { FieldError, useTextFieldError } from './FieldError.tsx';
import { Action, Panel, PanelTitle } from './ui.tsx';

/*
 * Selectors start at `.ch-root` so they outrank Tamagui's one-class atomic
 * rules. Neutral colours are read from the base theme on `.ch-root` and
 * inherited; inside a `<Theme>` (the accent around a pick button, a key
 * type's around its marker) `--color-N` is that theme's scale.
 */
const CSS = `
.ch-root {
  container: ch / inline-size;
  --ch-ink: var(--color-11);
  --ch-muted: var(--color-8);
  --ch-icon: var(--color-7);
  --ch-line: var(--color-4);
  /* The edge of a Keys tile, for the outline of a linked pair. */
  --ch-edge: color-mix(in srgb, var(--color-8) 28%, var(--panel));
  --ch-fill: var(--color-2);
  --ch-fill-strong: var(--color-3);
  --ch-pick: 24px;
  --ch-h: 30px;
  --ch-gap: 2px;
  --ch-col-gap: 8px;
  --ch-row-gap: 12px;
  --ch-pair-min: 204px;
}
@media (pointer: coarse) {
  .ch-root { --ch-pick: 44px; --ch-h: 44px; --ch-row-gap: 18px; --ch-pair-min: 268px; }
}

.ch-root .ch-hint { flex: 1 1 16rem; min-inline-size: 0; }
.ch-root .ch-summary { margin-inline-start: auto; white-space: nowrap; }
/* With room, the counts; the rule for names takes their place while one is being typed. */
@container ch (min-width: 760px) {
  .ch-root:has(.ch-name:focus) .ch-stats,
  .ch-root:not(:has(.ch-name:focus)) .ch-stats + .ch-tip { display: none; }
}
@container ch (width < 760px) {
  .ch-root .ch-stats, .ch-root .ch-tip-more { display: none; }
}
/* Narrow: the rule sits beside the title and the instruction has the next line. */
@container ch (width < 600px) {
  .ch-root .ch-hint { order: 1; flex-basis: 100%; }
}

/* As many pairs per row as fit, four at most; one pair never overflows the panel. */
.ch-root .ch-grid {
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(min(100%, max(var(--ch-pair-min), calc((100% - 3 * var(--ch-col-gap)) / 4))), 1fr)
  );
  /* A pair with a problem under it grows alone; its neighbours stay put. */
  align-items: start;
  column-gap: var(--ch-col-gap);
  row-gap: var(--ch-row-gap);
}

.ch-root .ch-pair {
  display: grid;
  grid-template-columns: var(--ch-pick) minmax(0, 1fr) var(--ch-pick) var(--ch-pick) minmax(0, 1fr);
  align-items: center;
  column-gap: var(--ch-gap);
  min-inline-size: 0;
  padding: 3px;
  border: 1px solid transparent;
  border-radius: 8px;
}
/* A stereo pair is one unit: one outline, one pick button twice as wide, one name, then the link. */
.ch-root .ch-pair[data-linked] {
  grid-template-columns: calc(2 * var(--ch-pick) + var(--ch-gap)) minmax(0, 1fr) var(--ch-pick);
  border-color: var(--ch-edge);
  background: var(--well);
  --ch-fill: var(--color-3);
  --ch-fill-strong: var(--color-4);
}
/* Problems go under the pair, across both channels, on rows of their own. */
.ch-root .ch-err {
  grid-column: 1 / -1;
  grid-row: calc(var(--ch-rows, 1) + var(--ch-err));
  padding-inline: 2px;
  padding-block-end: 2px;
}
.ch-root .ch-err:empty { display: none; }
/* Too narrow for a pair of finger-sized controls in one row: a channel per row, the link beside both. */
@media (pointer: coarse) {
  @container ch (width < 280px) {
    .ch-root .ch-pair,
    .ch-root .ch-pair[data-linked] {
      grid-template-columns: var(--ch-pick) minmax(0, 1fr) var(--ch-pick);
      row-gap: var(--ch-gap);
    }
    .ch-root .ch-pair:not([data-linked]) { --ch-rows: 2; }
    .ch-root .ch-pair:not([data-linked]) .ch-link { grid-row: span 2; block-size: 100%; }
    /* The name has the row to itself, so its markers sit inside it. */
    .ch-root .ch-pair .ch-tags { inset-block-start: calc(50% - 10px); }
  }
}

/* ---- pick buttons ---- */
.ch-root .ch-pick {
  --ch-bg: transparent;
  --ch-fg: var(--ch-muted);
  --ch-bd: var(--ch-line);
  position: relative;
  isolation: isolate;
  inline-size: 100%;
  block-size: var(--ch-h);
  border-radius: 6px;
  background: var(--ch-bg);
  color: var(--ch-fg);
  box-shadow: inset 0 0 0 1px var(--ch-bd);
  cursor: pointer;
}
.ch-root .ch-pick[data-used] { --ch-bg: var(--ch-fill); --ch-fg: var(--ch-ink); --ch-bd: transparent; }
.ch-root .ch-pick[aria-pressed="true"] { --ch-bg: var(--color-8); --ch-fg: var(--color-1); --ch-bd: transparent; }
.ch-root .ch-num {
  font: 600 12px/1 ${DISPLAY_FONT};
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
@media (hover: hover) {
  .ch-root .ch-grid:not([data-mode="off"]) .ch-pick[aria-pressed="false"]:hover { --ch-bg: var(--color-2); --ch-fg: var(--color-10); --ch-bd: var(--color-6); }
  .ch-root .ch-grid[data-mode="many"] .ch-pick[aria-pressed="true"]:hover { --ch-bg: var(--color-9); }
}
.ch-root .ch-grid:not([data-mode="off"]) .ch-pick[aria-pressed="false"]:active { --ch-bg: var(--color-3); --ch-fg: var(--color-10); --ch-bd: var(--color-7); }
.ch-root .ch-grid[data-mode="many"] .ch-pick[aria-pressed="true"]:active { --ch-bg: var(--color-10); }
.ch-root .ch-grid[data-mode="one"] .ch-pick[aria-pressed="true"] { cursor: default; }
/* Off: the number fades, not the button, so its focus ring stays at full strength. */
.ch-root .ch-grid[data-mode="off"] .ch-pick { cursor: not-allowed; }
.ch-root .ch-grid[data-mode="off"] .ch-num { opacity: 0.5; }

/* What pressing will do, on the corner so the number stays: choose, add or remove. */
.ch-root .ch-pick::before {
  display: none;
  position: absolute;
  z-index: 2;
  inset-block-start: -6px;
  inset-inline-start: -6px;
  inline-size: 14px;
  block-size: 14px;
  border-radius: 999px;
  background: var(--color-8);
  color: var(--color-1);
  box-shadow: 0 0 0 1.5px var(--panel);
  font: 700 11px/14px system-ui, sans-serif;
  text-align: center;
  opacity: 0;
  scale: 0.6;
  pointer-events: none;
}
.ch-root .ch-grid[data-mode="one"] .ch-pick[aria-pressed="false"]::before { display: block; content: "✓"; }
.ch-root .ch-grid[data-mode="many"] .ch-pick[aria-pressed="false"]::before { display: block; content: "+"; }
.ch-root .ch-grid[data-mode="many"] .ch-pick[aria-pressed="true"]::before {
  display: block;
  content: "−";
  background: var(--panel);
  color: var(--color-8);
  box-shadow: 0 0 0 1.5px var(--color-8);
}
.ch-root .ch-pick:focus-visible::before { opacity: 1; scale: 1; }
@media (hover: hover) {
  .ch-root .ch-pick:hover::before { opacity: 1; scale: 1; }
}

/* The key being pointed at plays this channel: a quiet edge in that key type's colour, as on its tile. */
.ch-root .ch-ring {
  position: absolute;
  z-index: -1;
  inset: -2px;
  border: 1.5px solid var(--color-6);
  border-radius: 8px;
  opacity: 0;
  pointer-events: none;
}
.ch-root .ch-ring[data-on] { opacity: 1; }

/* ---- names ---- */
.ch-root .ch-slot { position: relative; display: flex; min-inline-size: 0; }
.ch-root .ch-name {
  inline-size: 100%;
  min-inline-size: 0;
  block-size: var(--ch-h);
  border-radius: 6px;
  background: transparent;
  color: var(--ch-ink);
}
/* A line to write on, like an input list on paper, rather than 40 boxes. */
.ch-root .ch-slot::after {
  content: "";
  position: absolute;
  inset-inline: 3px;
  inset-block-end: 4px;
  block-size: 1px;
  background: var(--ch-line);
  pointer-events: none;
}
.ch-root .ch-name:focus { background: var(--ch-fill); }
.ch-root .ch-slot:has(.ch-name:focus)::after { opacity: 0; }
@media (hover: hover) {
  .ch-root .ch-name:hover { background: var(--ch-fill); }
  .ch-root .ch-slot:has(.ch-name:hover)::after { opacity: 0; }
}
.ch-root .ch-bad {
  position: absolute;
  inset-inline: 3px;
  inset-block-end: 3px;
  block-size: 2px;
  border-radius: 1px;
  background: var(--color-7);
  pointer-events: none;
}

/* ---- key markers: on the name's top edge, so they never move the layout ---- */
.ch-root .ch-tags {
  position: absolute;
  z-index: 1;
  inset-block-start: -9px;
  inset-inline-end: 3px;
  display: flex;
  gap: 3px;
}
.ch-root .ch-tag {
  position: relative;
  block-size: 15px;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}
/* A 24px target around a 15px marker. */
.ch-root .ch-tag::after { content: ""; position: absolute; inset: -5px -3px -4px; }
.ch-root .ch-face {
  display: block;
  min-inline-size: 19px;
  block-size: 15px;
  padding-inline: 3px;
  border-radius: 4px;
  background: var(--color-3);
  color: var(--color-11);
  box-shadow: 0 0 0 1.5px var(--panel);
  font: 600 11px/15px ${DISPLAY_FONT};
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.ch-root .ch-tag[data-type="group"] .ch-face { border-radius: 999px; padding-inline: 4px; }
.ch-root .ch-tag:active .ch-face { background: var(--color-8); color: var(--color-1); }
@media (hover: hover) {
  .ch-root .ch-tag:hover .ch-face { background: var(--color-8); color: var(--color-1); }
}
/* A pasted name was cut to fit: said on the field for a moment, over its markers. */
.ch-root .ch-cut {
  position: absolute;
  z-index: 2;
  inset-block-start: -9px;
  inset-inline-end: 3px;
  block-size: 15px;
  padding-inline: 5px;
  border-radius: 4px;
  background: var(--ch-ink);
  color: var(--panel);
  box-shadow: 0 0 0 1.5px var(--panel);
  font: 600 11px/15px system-ui, sans-serif;
  white-space: nowrap;
  pointer-events: none;
}
@media (pointer: coarse) {
  .ch-root .ch-tags { inset-block-start: -13px; gap: 6px; }
  .ch-root .ch-tag, .ch-root .ch-face { block-size: 20px; }
  .ch-root .ch-face { min-inline-size: 26px; font-size: 12px; line-height: 20px; }
  .ch-root .ch-tag::after { inset: -9px -6px -12px; }
  .ch-root .ch-cut { inset-block-start: -13px; block-size: 20px; font-size: 12px; line-height: 20px; }
}

/*
 * Dark: the scales run the other way, so a theme's 2 and 3 are deep, saturated
 * solids (orange's are red-brown). Tints are mixed into the panel instead, and
 * the selected key's marker is the orange itself.
 */
@media (prefers-color-scheme: dark) {
  .ch-root .ch-face { background: color-mix(in srgb, var(--color-3) 60%, var(--panel)); color: var(--color-10); }
  .ch-root .ch-tag[aria-current] .ch-face { background: var(--color-8); color: var(--color-1); }
  .ch-root .ch-tag:active .ch-face { background: var(--color-8); color: var(--color-1); }
  .ch-root .ch-tag[aria-current]:active .ch-face { background: var(--color-9); }
  @media (hover: hover) {
    .ch-root .ch-tag:hover .ch-face { background: var(--color-8); color: var(--color-1); }
    .ch-root .ch-tag[aria-current]:hover .ch-face { background: var(--color-9); }
    .ch-root .ch-grid:not([data-mode="off"]) .ch-pick[aria-pressed="false"]:hover {
      --ch-bg: color-mix(in srgb, var(--color-8) 16%, var(--panel));
      --ch-fg: var(--color-8);
      --ch-bd: var(--color-7);
    }
  }
  .ch-root .ch-grid:not([data-mode="off"]) .ch-pick[aria-pressed="false"]:active {
    --ch-bg: color-mix(in srgb, var(--color-8) 28%, var(--panel));
    --ch-fg: var(--color-8);
    --ch-bd: var(--color-7);
  }
}

/* ---- stereo links ---- */
.ch-root .ch-link {
  inline-size: 100%;
  block-size: var(--ch-h);
  border-radius: 6px;
  background: transparent;
  color: var(--ch-icon);
  cursor: pointer;
}
.ch-root .ch-link[aria-pressed="true"] { color: var(--ch-ink); }
.ch-root .ch-link:active { background: var(--ch-fill-strong); color: var(--ch-ink); }
@media (hover: hover) {
  .ch-root .ch-link:hover { background: var(--ch-fill); color: var(--ch-ink); }
  .ch-root .ch-link:hover:active { background: var(--ch-fill-strong); }
}

.ch-root :is(.ch-pick, .ch-link, .ch-tag, .ch-name):focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.ch-root .ch-name:focus-visible { outline-offset: 1px; }
.ch-root .ch-tag:focus-visible { outline-offset: 3px; }

@media (prefers-reduced-motion: no-preference) {
  .ch-root :is(.ch-pick, .ch-link, .ch-face, .ch-name) {
    transition: background-color 130ms ease-out, color 130ms ease-out, box-shadow 130ms ease-out, scale 130ms ease-out;
  }
  .ch-root .ch-pick::before, .ch-root .ch-ring { transition: opacity 130ms ease-out, scale 130ms ease-out; }
  .ch-root .ch-grid:not([data-mode="off"]) .ch-pick:active, .ch-root .ch-link:active { scale: 0.94; }
  .ch-root .ch-grid[data-mode="one"] .ch-pick[aria-pressed="true"]:active { scale: 1; }
}

/*
 * Forced colours drop the fills and shadows and put a plate in the page's
 * colour behind text, so a state can't be a fill with text on it. States are
 * edges in system colours instead: a thick one in the selection colour means
 * on (a picked channel, a linked pair's toggle, the selected key's marker).
 */
@media (forced-colors: active) {
  .ch-root .ch-pair { border-color: Canvas; }
  .ch-root .ch-pair[data-linked] { border-color: CanvasText; }
  /* !important: Tamagui's border classes repeat themselves to outrank anything here. */
  .ch-root .ch-pick { border: 1px solid ButtonText !important; }
  .ch-root :is(.ch-pick, .ch-link)[aria-pressed="true"] { border: 3px solid Highlight !important; }
  .ch-root .ch-pick::before { border: 1px solid ButtonText; line-height: 12px; }
  .ch-root .ch-face { outline: 1px solid ButtonText; outline-offset: -1px; }
  .ch-root .ch-tag[aria-current] .ch-face { outline: 2px solid Highlight; outline-offset: 0; }
  .ch-root .ch-ring { border-color: CanvasText; }
  .ch-root .ch-cut { outline: 1px solid CanvasText; }
  .ch-root .ch-slot::after, .ch-root .ch-bad { background: ButtonText; }
}
`;

const PAIRS = Array.from({ length: CHANNEL_COUNT / 2 }, (_, i) => i * 2 + 1);

const nameId = (channel: number) => `channel-name-${channel}`;

/** The longest name a channel can have. */
const NAME_MAX = 6;

/** The pick button that takes Tab when focus arrives from outside. */
const FIRST_STOP = 'p1';

// ---- picking ---------------------------------------------------------------

/** What a channel is called in a sentence: its name, else its number(s). */
const spoken = (system: Editable, channel: number): string =>
  system.channels[channel - 1]?.name ||
  (isStereo(system, channel) ? `Channels ${channel}+${channel + 1}` : `Channel ${channel}`);

/** Pick `channel` for the selected key, and say so when that takes it from another group. */
const pickAtom = atom(null, (get, set, channel: number) => {
  const system = get(systemAtom);
  const index = get(selectedKeyAtom);
  const key = system.keys[index];
  if (!canPick(key)) return;
  const target = pickTarget(system, channel);
  const from =
    key?.type === 'group' && !keyPlays(system, key, target)
      ? groupHolding(system, target, index)
      : undefined;
  set(editAtom, (s) => pickChannel(s, index, channel));
  if (from !== undefined) {
    set(toastAtom, {
      message: `${spoken(system, target)} moved from key ${from + 1} to key ${index + 1}`,
      tone: 'success',
    });
  }
});

/** How picking behaves for the selected key: off, one channel, or many. */
type Mode = 'off' | 'one' | 'many';

const modeOf = (key: Key | undefined): Mode =>
  !canPick(key) ? 'off' : key?.type === 'group' ? 'many' : 'one';

/** The selected key, in orange so it reads as the tile lit in the Keys grid. */
const KeyRef = ({ children }: { children: ReactNode }) => (
  <Theme name={ACCENT}>
    <SizableText size="xs" color="color-8" fontWeight="700">
      {children}
    </SizableText>
  </Theme>
);

/** One line on what picking a channel will do for the selected key. */
const Instruction = ({ system, index }: { system: Editable; index: number }) => {
  const key = system.keys[index];
  const n = index + 1;
  switch (key?.type) {
    case 'unassigned':
      return (
        <>
          Pick a channel for <KeyRef>key {n}</KeyRef>
        </>
      );
    case 'channel': {
      // A loaded file can refer to a pair by its second channel: name the pair.
      const first = pickTarget(system, key.channel);
      return (
        <>
          <KeyRef>Key {n}</KeyRef> plays ch {first}
          {isStereo(system, first) ? `+${first + 1}` : ''}: pick another to change it
        </>
      );
    }
    case 'group':
      return (
        <>
          <KeyRef>
            Key {n} · <span style={{ fontFamily: DISPLAY_FONT }}>{keyLabel(system, key)}</span>
          </KeyRef>
          : pick channels to add or remove
        </>
      );
    case 'auto':
      return (
        <>
          <KeyRef>Key {n}</KeyRef> is Auto: it takes the next free channel
        </>
      );
    default:
      return (
        <>
          <KeyRef>Key {n}</KeyRef> is kept as it was loaded, so picking is off
        </>
      );
  }
};

// ---- moving with the arrow keys --------------------------------------------

type Direction = 'left' | 'right' | 'up' | 'down';

const DIRECTIONS: Partial<Record<string, Direction>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

/**
 * The control an arrow key moves to, from where the controls are on screen
 * now, so it follows the layout at any number of pairs per row. A control is
 * that way when its near edge is past the current one's far edge. ← and → stay
 * in the row, so there is nothing past the end of one. ↑ and ↓ go to the next
 * row that way, and in it to the control in line with this one, else the
 * closest to being in line.
 */
const nearest = (
  current: HTMLElement,
  direction: Direction,
  candidates: readonly HTMLElement[],
): HTMLElement | undefined => {
  const TOLERANCE = 1;
  const from = current.getBoundingClientRect();
  const horizontal = direction === 'left' || direction === 'right';
  const found: { el: HTMLElement; aligned: boolean; gap: number; offset: number }[] = [];
  for (const el of candidates) {
    if (el === current || el.checkVisibility?.() === false) continue;
    const to = el.getBoundingClientRect();
    const gap = {
      left: from.left - to.right,
      right: to.left - from.right,
      up: from.top - to.bottom,
      down: to.top - from.bottom,
    }[direction];
    if (gap < -TOLERANCE) continue;
    const aligned = horizontal
      ? to.top < from.bottom - TOLERANCE && to.bottom > from.top + TOLERANCE
      : to.left < from.right - TOLERANCE && to.right > from.left + TOLERANCE;
    // Sideways, a control in another row isn't that way at all.
    if (horizontal && !aligned) continue;
    const offset = horizontal
      ? Math.abs(to.top + to.height / 2 - (from.top + from.height / 2))
      : Math.abs(to.left + to.width / 2 - (from.left + from.width / 2));
    found.push({ el, aligned, gap, offset });
  }
  if (found.length === 0) return undefined;
  if (horizontal) {
    return found.reduce((a, b) =>
      b.gap < a.gap || (b.gap === a.gap && b.offset < a.offset) ? b : a,
    ).el;
  }
  // The next row is whatever starts within half a control's height of the closest.
  const reach = Math.min(...found.map((c) => c.gap)) + from.height / 2;
  return found
    .filter((c) => c.gap <= reach)
    .reduce((a, b) =>
      (b.aligned && !a.aligned) || (b.aligned === a.aligned && b.offset < a.offset) ? b : a,
    ).el;
};

// ---- parts -----------------------------------------------------------------

/** A native tooltip with the control's name; `Action` doesn't type `title`. */
const tooltip = (title: string) => ({ title }) as Record<string, string>;

const LinkIcon = ({ linked }: { linked: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {linked ? (
        <>
          <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
          <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
        </>
      ) : (
        <>
          <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
          <path d="M9 17H7A5 5 0 0 1 7 7h2" />
        </>
      )}
    </g>
  </svg>
);

interface PickProps {
  readonly channel: number;
  readonly linked: boolean;
  readonly name: string;
  readonly pressed: boolean;
  readonly used: boolean;
  /** The type of the key being pointed at, when it plays this channel. */
  readonly pointed: Key['type'] | undefined;
  readonly pickable: boolean;
  readonly hintId: string;
  readonly stop: string | null;
  readonly onPick: (channel: number) => void;
}

/** A channel's number, which assigns it to the selected key; a stereo pair has one for both. */
const Pick = ({
  channel,
  linked,
  name,
  pressed,
  used,
  pointed,
  pickable,
  hintId,
  stop,
  onPick,
}: PickProps) => {
  const id = `p${channel}`;
  const ref = useRef<TamaguiElement>(null);
  // Off for Auto and unknown keys, but still focusable, so the hint can say why.
  // Tamagui's Button writes aria-disabled from its own `disabled`, which would
  // take the button out of reach; set the attribute on the element.
  useEffect(() => {
    (ref.current as unknown as HTMLElement | null)?.setAttribute(
      'aria-disabled',
      String(!pickable),
    );
  }, [pickable]);
  const numbers = linked ? `Channels ${channel} and ${channel + 1}` : `Channel ${channel}`;
  return (
    <Theme name={ACCENT}>
      <Action
        className="ch-pick target"
        kind="ghost"
        p="0"
        minH={0}
        borderWidth={0}
        aria-pressed={pressed}
        ref={ref}
        aria-label={name ? `${numbers} ${name}` : numbers}
        aria-describedby={hintId}
        data-used={used ? '' : undefined}
        data-stop={id}
        tabIndex={stop === id ? 0 : -1}
        onPress={() => onPick(channel)}
      >
        <span className="ch-num">{linked ? `${channel}–${channel + 1}` : channel}</span>
        <Theme name={(pointed && KEY_TYPE_THEME[pointed]) ?? null}>
          <span className="ch-ring" data-on={pointed ? '' : undefined} />
        </Theme>
      </Action>
    </Theme>
  );
};

interface TagsProps {
  readonly channel: number;
  readonly uses: readonly KeyUse[];
  readonly selected: number;
  readonly stop: string | null;
  readonly onSelectKey: (index: number) => void;
}

/**
 * A marker for each key that plays a channel, in the key type's colour;
 * pressing one selects that key. Tab reaches them after the name of the
 * channel whose pick button has focus, so they don't slow the arrow keys down.
 */
const Tags = ({ channel, uses, selected, stop, onSelectKey }: TagsProps) =>
  uses.length === 0 ? null : (
    <div className="ch-tags">
      {uses.map((use) => {
        const current = use.index === selected;
        const label = `Used by key ${use.index + 1}, ${use.label}${current ? ' (selected)' : ': select it'}`;
        return (
          <Action
            key={use.index}
            className="ch-tag"
            kind="ghost"
            p="0"
            minH={0}
            borderWidth={0}
            aria-label={label}
            aria-current={current ? 'true' : undefined}
            {...tooltip(label)}
            data-type={use.type}
            data-key={use.index}
            data-of={`p${channel}`}
            tabIndex={stop === `p${channel}` ? 0 : -1}
            onPress={() => onSelectKey(use.index)}
          >
            {/* The theme is inside the button, so selecting the key doesn't remount it and drop focus. */}
            <Theme name={current ? ACCENT : (KEY_TYPE_THEME[use.type] ?? null)}>
              <span className="ch-face">{String(use.index + 1).padStart(2, '0')}</span>
            </Theme>
          </Action>
        );
      })}
    </div>
  );

/** Which of the rows under a pair's channels a problem goes on. */
const errorRowStyle = (row: number) => ({ '--ch-err': row }) as CSSProperties;

interface NameProps {
  readonly channel: number;
  readonly name: string;
  /** Which row under the pair this channel's problem goes on. */
  readonly errorRow: 1 | 2;
  /** No name field comes after this one. */
  readonly last: boolean;
  /** The channel's key markers, which sit on the field's edge. */
  readonly children?: ReactNode;
}

/** How long the field says a pasted name was cut. */
const CUT_SHOWN_MS = 2500;

const Name = ({ channel, name, errorRow, last, children }: NameProps) => {
  const edit = useSetAtom(editAtom);
  const path = `channels[${channel - 1}].name`;
  const { inputProps, error } = useTextFieldError(path);
  // Counts the pastes that were cut, so another one restarts the clock.
  const [cut, setCut] = useState(0);
  useEffect(() => {
    if (cut === 0) return;
    const timer = window.setTimeout(() => setCut(0), CUT_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [cut]);

  /** The field's `maxlength` cuts a long paste without a word; say that it did. */
  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement)) return;
    const pasted = e.clipboardData.getData('text').replace(/[\r\n]/g, '');
    const replaced = (input.selectionEnd ?? 0) - (input.selectionStart ?? 0);
    if (input.value.length - replaced + pasted.length <= NAME_MAX) return;
    setCut((n) => n + 1);
    announce(`Channel ${channel} name cut to ${NAME_MAX} characters`);
  };

  return (
    <>
      <div className="ch-slot" onPaste={onPaste}>
        <Input
          id={nameId(channel)}
          className="ch-name"
          name={`channel-${channel}-name`}
          size="sm"
          px={3}
          py="0"
          borderWidth={0}
          maxLength={NAME_MAX}
          value={name}
          fontFamily={DISPLAY_FONT}
          onChangeText={(next) => edit((s) => setChannelName(s, channel, next), path)}
          aria-label={`Channel ${channel} name`}
          data-issue-path={path}
          data-channel={channel}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint={last ? 'done' : 'next'}
          {...inputProps}
        />
        {inputProps['aria-invalid'] && (
          <Theme name="red">
            <span className="ch-bad" aria-hidden="true" />
          </Theme>
        )}
        {children}
        {cut > 0 && (
          <span className="ch-cut" aria-hidden="true">
            {NAME_MAX} max
          </span>
        )}
      </div>
      {error && (
        <div className="ch-err" style={errorRowStyle(errorRow)}>
          {error}
        </div>
      )}
    </>
  );
};

/** The problem with a pair's stereo flags, if a loaded file had them disagree. */
const StereoError = ({ first }: { first: number }) => (
  <div className="ch-err" style={errorRowStyle(3)}>
    <FieldError path={`channels[${first}].stereo`} />
  </div>
);

interface PairProps {
  readonly first: number;
  readonly nameA: string;
  readonly nameB: string;
  readonly linked: boolean;
  readonly pressedA: boolean;
  readonly pressedB: boolean;
  readonly usesA: readonly KeyUse[];
  readonly usesB: readonly KeyUse[];
  readonly pointedA: Key['type'] | undefined;
  readonly pointedB: Key['type'] | undefined;
  readonly selected: number;
  readonly pickable: boolean;
  readonly hintId: string;
  /** The roving tab stop, when it is in this pair. */
  readonly stop: string | null;
  readonly onPick: (channel: number) => void;
  readonly onLink: (first: number, linked: boolean) => void;
  readonly onSelectKey: (index: number) => void;
}

const sameUses = (a: readonly KeyUse[], b: readonly KeyUse[]): boolean =>
  a.length === b.length &&
  a.every((use, i) => {
    const other = b[i];
    return use.index === other?.index && use.type === other.type && use.label === other.label;
  });

/** Typing a name changes the system, but not most pairs: skip those. */
const samePair = (a: PairProps, b: PairProps): boolean =>
  (Object.keys(a) as (keyof PairProps)[]).every((k) =>
    k === 'usesA' || k === 'usesB' ? sameUses(a[k], b[k]) : a[k] === b[k],
  );

/** An odd/even pair of channels with the link between them. */
const Pair = memo((props: PairProps) => {
  const { first, linked, stop, hintId, pickable, selected } = props;
  const second = first + 1;
  const link = `Link channels ${first} and ${second} as a stereo pair`;
  const linkId = `l${first}`;
  const pick = { linked, pickable, hintId, stop, onPick: props.onPick };
  const tags = { selected, stop, onSelectKey: props.onSelectKey };
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset can't be the grid these controls are laid out on
    <div
      className="ch-pair"
      role="group"
      aria-label={`Channels ${first} and ${second}`}
      data-linked={linked ? '' : undefined}
    >
      <Pick
        {...pick}
        channel={first}
        name={props.nameA}
        pressed={props.pressedA}
        used={props.usesA.length > 0}
        pointed={props.pointedA}
      />
      <Name
        channel={first}
        name={props.nameA}
        errorRow={1}
        last={linked && second === CHANNEL_COUNT}
      >
        <Tags {...tags} channel={first} uses={props.usesA} />
      </Name>
      <Action
        className="ch-link target"
        kind="ghost"
        p="0"
        minH={0}
        borderWidth={0}
        aria-pressed={linked}
        aria-label={link}
        {...tooltip(link)}
        data-issue-path={`channels[${first}].stereo`}
        data-stop={linkId}
        tabIndex={stop === linkId ? 0 : -1}
        onPress={() => props.onLink(first, !linked)}
      >
        <LinkIcon linked={linked} />
      </Action>
      {/* The ME-1 names a stereo pair once, by its first channel: the second has no field while linked. */}
      {linked ? (
        <div className="ch-err" style={errorRowStyle(2)}>
          <FieldError path={`channels[${second - 1}].name`} />
        </div>
      ) : (
        <>
          <Pick
            {...pick}
            channel={second}
            name={props.nameB}
            pressed={props.pressedB}
            used={props.usesB.length > 0}
            pointed={props.pointedB}
          />
          <Name channel={second} name={props.nameB} errorRow={2} last={second === CHANNEL_COUNT}>
            <Tags {...tags} channel={second} uses={props.usesB} />
          </Name>
        </>
      )}
      <StereoError first={first} />
    </div>
  );
}, samePair);

// ---- the panel -------------------------------------------------------------

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The pair a tab stop (`p5` a pick button, `l5` a link) belongs to, by its first channel. */
const pairOfStop = (stop: string): number => {
  const channel = Number.parseInt(stop.slice(1), 10);
  return channel % 2 === 1 ? channel : channel - 1;
};

const keyOfMarker = (target: EventTarget | null): number | undefined => {
  const marker = target instanceof Element ? target.closest<HTMLElement>('[data-key]') : null;
  return marker ? Number(marker.dataset.key) : undefined;
};

/** The pick button or link a control belongs with: itself, or a key marker's channel. */
const stopOf = (el: HTMLElement): string | undefined => el.dataset.stop ?? el.dataset.of;

/**
 * The Channels panel. Tab reaches each name; the pick buttons and links are
 * one tab stop, moved through with the arrow keys, and Tab goes on from a pick
 * button to that channel's name and then its key markers. Each pair is a
 * group; the panel isn't a toolbar or a grid, because it holds text fields
 * that Tab has to reach.
 */
export const ChannelGrid = () => {
  const system = useAtomValue(systemAtom);
  const [selected, setSelected] = useAtom(selectedKeyAtom);
  const [highlight, setHighlight] = useAtom(highlightKeyAtom);
  const edit = useSetAtom(editAtom);
  const pick = useSetAtom(pickAtom);
  const titleId = useId();
  const hintId = useId();
  const grid = useRef<HTMLDivElement>(null);
  const [stop, setStop] = useState(FIRST_STOP);
  /** The pick button, link or key marker with focus: an edit or an undo can take it away. */
  const focused = useRef<{ el: HTMLElement; stop: string } | null>(null);

  const key = system.keys[selected];
  const pointed = highlight !== null && highlight !== selected ? system.keys[highlight] : undefined;
  const uses = useMemo(() => channelUses(system), [system]);
  // A linked pair has one name, its first channel's.
  const named = system.channels.filter((c, i) => c.name && !(c.stereo && i % 2 === 1)).length;
  const pairs = PAIRS.filter((first) => isStereo(system, first)).length;
  const unused = uses.filter((list) => list.length === 0).length;

  // A stop that has gone (a marker for a key that changed, the second pick of a pair now linked).
  // biome-ignore lint/correctness/useExhaustiveDependencies: checked after every change to the system
  useLayoutEffect(() => {
    if (!grid.current?.querySelector('[data-stop][tabindex="0"]')) setStop(FIRST_STOP);
  }, [system, stop]);

  // The focused control has gone (its pair was linked, its key no longer plays
  // the channel): focus stays in the pair, on the nearest pick button left.
  // biome-ignore lint/correctness/useExhaustiveDependencies: checked after every change to the system
  useLayoutEffect(() => {
    const lost = focused.current;
    if (!lost || lost.el.isConnected) return;
    focused.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const pickOf = (id: string) => grid.current?.querySelector<HTMLElement>(`[data-stop="${id}"]`);
    (pickOf(`p${lost.stop.slice(1)}`) ?? pickOf(`p${pairOfStop(lost.stop)}`))?.focus();
  }, [system]);

  // Don't leave a key pointed at when its marker goes away under the pointer.
  useEffect(() => () => setHighlight(null), [setHighlight]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.nativeEvent.isComposing)
      return;
    const target = e.nativeEvent.composedPath()[0];
    if (!(target instanceof HTMLElement)) return;
    const direction = DIRECTIONS[e.key];
    let next: HTMLElement | null | undefined;
    if (target instanceof HTMLInputElement && target.dataset.channel) {
      // Enter goes on to the next name, so a list can be typed straight through; ↑ and ↓ follow the layout.
      if (e.key === 'Enter') {
        // The second channel of a linked pair has no field: go on to the one after.
        const step = e.shiftKey ? -1 : 1;
        let channel = Number(target.dataset.channel) + step;
        while (channel >= 1 && channel <= CHANNEL_COUNT && !next) {
          next = document.getElementById(nameId(channel));
          channel += step;
        }
      } else if (!e.shiftKey && (direction === 'up' || direction === 'down'))
        next = nearest(target, direction, [
          ...e.currentTarget.querySelectorAll<HTMLElement>('input[data-channel]'),
        ]);
      if (next instanceof HTMLInputElement) next.select();
    } else if (!e.shiftKey && (target.dataset.stop || target.dataset.key)) {
      const all = (selector: string) => [
        ...e.currentTarget.querySelectorAll<HTMLElement>(selector),
      ];
      // From a key marker, move as if from its channel's pick button.
      const from = all('[data-stop]').find((el) => el.dataset.stop === target.dataset.of) ?? target;
      // ↑ and ↓ keep to the same kind of control, so a pick button leads to the pair's above or below.
      const kind = from.classList.contains('ch-link') ? '.ch-link' : '.ch-pick';
      const sideways = direction === 'left' || direction === 'right';
      next =
        e.key === 'Home'
          ? all('.ch-pick')[0]
          : e.key === 'End'
            ? all('.ch-pick').at(-1)
            : direction && nearest(from, direction, all(sideways ? '[data-stop]' : kind));
    }
    // Nothing that way: leave the key to the browser, so the page can scroll.
    if (!next || next === target) return;
    e.preventDefault();
    next.focus();
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const id = target.dataset.stop;
    if (id) setStop(id);
    const of = stopOf(target);
    focused.current = of ? { el: target, stop: of } : null;
    const marker = keyOfMarker(e.target);
    if (marker !== undefined) setHighlight(marker);
  };

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    // Still there, so focus was moved, not lost with the control.
    if (focused.current?.el === e.target && e.target.isConnected) focused.current = null;
    const marker = keyOfMarker(e.target);
    if (marker !== undefined) setHighlight((current) => (current === marker ? null : current));
    // Leaving the panel: Tab comes back in at the first pick button.
    if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget))
      setStop(FIRST_STOP);
  };

  const onMouseOver = (e: MouseEvent<HTMLDivElement>) => {
    const marker = keyOfMarker(e.target);
    if (marker !== undefined && marker !== keyOfMarker(e.relatedTarget)) setHighlight(marker);
  };

  const onMouseOut = (e: MouseEvent<HTMLDivElement>) => {
    const marker = keyOfMarker(e.target);
    if (marker !== undefined && marker !== keyOfMarker(e.relatedTarget))
      setHighlight((current) => (current === marker ? null : current));
  };

  // Stable, so a pair re-renders only when what it shows changes.
  const handlers = useMemo(
    () => ({
      onPick: (channel: number) => pick(channel),
      onLink: (first: number, linked: boolean) => edit((s) => setStereo(s, first, linked)),
      onSelectKey: (index: number) => setSelected(index),
    }),
    [pick, edit, setSelected],
  );

  const stats =
    named === 0 && pairs === 0
      ? undefined
      : [
          `${named} named`,
          pairs > 0 ? plural(pairs, 'stereo pair') : undefined,
          unused > 0 ? `${unused} not on a key` : undefined,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <Panel
      render="section"
      className="ch-root"
      aria-labelledby={titleId}
      p={{ default: '3', sm: '4' }}
    >
      <style>{CSS}</style>
      <XStack items="baseline" flexWrap="wrap" columnGap="3" rowGap="1">
        <PanelTitle id={titleId}>Channels</PanelTitle>
        <SizableText id={hintId} className="ch-hint" size="xs" color="color-10">
          <Instruction system={system} index={selected} />
        </SizableText>
        <SizableText className="ch-summary" size="xs" color="color-8">
          {stats && <span className="ch-stats">{stats}</span>}
          <span className="ch-tip">
            Names up to {NAME_MAX} characters
            <span className="ch-tip-more"> · Enter for the next</span>
          </span>
        </SizableText>
      </XStack>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: it listens for the controls inside it; the section is the landmark and each pair a group, so a role here would only add noise */}
      <div
        ref={grid}
        className="ch-grid"
        data-mode={modeOf(key)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        onMouseOver={onMouseOver}
        onMouseOut={onMouseOut}
      >
        {PAIRS.map((first) => {
          const second = first + 1;
          const linked = isStereo(system, first);
          return (
            <Pair
              key={first}
              first={first}
              nameA={system.channels[first - 1]?.name ?? ''}
              nameB={system.channels[second - 1]?.name ?? ''}
              linked={linked}
              pressedA={keyPlays(system, key, first)}
              pressedB={keyPlays(system, key, second)}
              usesA={uses[first - 1] ?? []}
              usesB={uses[second - 1] ?? []}
              pointedA={pointed && keyPlays(system, pointed, first) ? pointed.type : undefined}
              pointedB={pointed && keyPlays(system, pointed, second) ? pointed.type : undefined}
              selected={selected}
              pickable={canPick(key)}
              hintId={hintId}
              stop={pairOfStop(stop) === first ? stop : null}
              {...handlers}
            />
          );
        })}
      </div>
    </Panel>
  );
};
