/**
 * The Channels region: all 40 channels at once, as their 20 odd/even pairs. It
 * names channels, links pairs as stereo, and assigns channels to the key
 * selected in the Keys grid: each channel's number is a pick chip, filled with
 * the colour of the key that plays it, so the region is a map of which key
 * plays what and what is left. A linked pair is one channel to the ME-1, with
 * one pick chip and one name (its first channel's); the second channel's name
 * is kept but not shown.
 */

import { CHANNEL_COUNT, KEY_COUNT, type Key } from '@mcmillan/me1-mate-core';
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
import { Input, type TamaguiElement, Theme } from 'tamagui';
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
import { keyColor, keyStyle } from '../lib/theme.ts';
import { FieldError, useTextFieldError } from './FieldError.tsx';
import { Action, Card, PanelTitle } from './ui.tsx';

/** The markers of the key being pointed at, on any channel: `data-spot` on the grid says which key. */
const SPOT_TAGS = Array.from(
  { length: KEY_COUNT },
  (_, i) => `.ch-root .ch-grid[data-spot="${i}"] .ch-tag[data-key="${i}"]`,
).join(',\n');

/** Their faces. */
const SPOT_MARKERS = SPOT_TAGS.replaceAll(',', ' .ch-face,').concat(' .ch-face');

/*
 * Selectors start at `.ch-root` so they outrank Tamagui's one-class atomic
 * rules. The neutrals are the page's (`--card`, `--well`, `--ink`, `--muted`,
 * `--line` in styles.css): the region is a card and each pair a well in it.
 * `--k` is a key's colour, set with `keyStyle` on whatever wears it, and
 * `--ch-sel` the selected key's.
 */
const CSS = `
.ch-root {
  container: ch / inline-size;
  --ch-chip: 26px;
  --ch-h: 44px;
  --ch-gap: 8px;
  --ch-pair-min: 200px;
  /* The track between an unlinked pair's two channels: the seam down its middle, and the link's room either side of it. */
  --ch-mid: 20px;
  /* A hairline for marks on a cell, where --line would vanish. */
  --ch-soft: color-mix(in oklab, var(--ink) 14%, transparent);
  /* What a pair's controls sit on, for the edge that lifts a marker off it. */
  --ch-under: var(--well);
  gap: 12px;
  padding: 16px 16px 18px;
}
@media (width < 640px) {
  .ch-root { padding: 14px 12px; }
}
@media (pointer: coarse) {
  .ch-root { --ch-chip: 44px; --ch-h: 56px; --ch-mid: 44px; --ch-pair-min: 300px; }
}

.ch-root .ch-vh {
  position: absolute;
  clip-path: inset(50%);
  overflow: hidden;
  inline-size: 1px;
  block-size: 1px;
  white-space: nowrap;
}

/* ---- heading: the title and what picking does for the selected key ---- */
.ch-root .ch-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 12px;
  row-gap: 4px;
}
.ch-root .ch-hint, .ch-root .ch-tip {
  margin: 0;
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: var(--w-text);
  line-height: 1.5;
}
.ch-root .ch-hint { flex: 1 1 16rem; min-inline-size: 0; }
/* The rule for names, there only while one is being typed. It keeps its place, so nothing moves when it shows. */
.ch-root .ch-tip { margin-inline-start: auto; white-space: nowrap; visibility: hidden; opacity: 0; }
.ch-root:has(.ch-name:focus) .ch-tip { visibility: visible; opacity: 1; }
@container ch (width < 800px) {
  .ch-root .ch-tip-more { display: none; }
}
@container ch (width < 640px) {
  .ch-root .ch-tip { display: none; }
}
/* The selected key, as a chip of its tile. */
.ch-root .ch-key {
  display: inline-block;
  margin-inline-end: 3px;
  padding-inline: 8px;
  border-radius: 999px;
  background: var(--k);
  color: var(--on-key);
  font-weight: var(--w-ui);
  white-space: nowrap;
}
/* An empty key has no colour yet: an open slot, like its tile. */
.ch-root .ch-key[data-empty] { background: transparent; box-shadow: inset 0 0 0 1.5px var(--line); color: var(--ink); }

/* As many pairs per row as fit, four at most; one pair never overflows the region. */
.ch-root .ch-grid {
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(min(100%, max(var(--ch-pair-min), calc((100% - 3 * var(--ch-gap)) / 4))), 1fr)
  );
  /* A pair with a problem under it grows alone; its neighbours stay put. */
  align-items: start;
  gap: var(--ch-gap);
}

/*
 * A pair is a cell of its own. Unlinked, a seam splits it into its two
 * channels, each a pick chip and a name; the link sits on the seam.
 */
.ch-root .ch-pair {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) var(--ch-mid) auto minmax(0, 1fr);
  grid-template-rows: repeat(var(--ch-rows, 1), minmax(var(--ch-h), auto));
  align-items: center;
  min-inline-size: 0;
  /* Room before a chip for the selected key's ring; little after a name, so six characters fit where four pairs share a row. */
  padding-inline: 8px 3px;
  border-radius: 14px;
  background: var(--ch-under);
  /* Names are sized to the pair, so six characters fit where four pairs share a row. */
  container-type: inline-size;
  /* What shows only where the pointer or the keyboard is: key markers, and the link of an unlinked pair. */
  --ch-show: 0;
}
.ch-root .ch-pair:has(:focus-visible) { --ch-show: 1; }
@media (hover: hover) {
  .ch-root .ch-pair:hover { --ch-show: 1; }
}
/* Nothing to hover with, or no colours to tell keys by: always there. */
@media (hover: none), (pointer: coarse), (forced-colors: active) {
  .ch-root .ch-grid .ch-pair { --ch-show: 1; }
}
/* The seam, in the first row only, so a problem under the pair reads across it. */
.ch-root .ch-pair::before {
  content: "";
  grid-area: 1 / 3;
  align-self: stretch;
  justify-self: center;
  inline-size: 2px;
  background: var(--card);
}
/* A stereo pair is one channel to the ME-1: one cell with no seam, in its key's colour, with one chip and one name, then the link. */
.ch-root .ch-pair[data-linked] {
  grid-template-columns: auto minmax(0, 1fr) auto;
  padding-inline: 8px 6px;
}
.ch-root .ch-pair[data-linked]::before { display: none; }
.ch-root .ch-pair[data-linked][data-owned] { --ch-under: color-mix(in oklab, var(--k) 20%, var(--card)); }
/* Problems go under the pair, across both channels, on rows of their own. */
.ch-root .ch-err {
  grid-column: 1 / -1;
  grid-row: calc(var(--ch-rows, 1) + var(--ch-err));
  padding-inline: 4px;
  padding-block-end: 8px;
}
.ch-root .ch-err:empty { display: none; }
@media (pointer: coarse) {
  .ch-root .ch-pair { padding-inline: 6px; }
  /* Too narrow for a pair of finger-sized controls in one row: a channel per row, the link beside both. */
  @container ch (width < 280px) {
    .ch-root .ch-pair,
    .ch-root .ch-pair[data-linked] { grid-template-columns: auto minmax(0, 1fr) var(--ch-mid); }
    .ch-root .ch-pair:not([data-linked]) { --ch-rows: 2; }
    .ch-root .ch-pair:not([data-linked])::before { display: none; }
    .ch-root .ch-pair:not([data-linked]) .ch-link { grid-row: 1 / span 2; }
  }
}

/* ---- pick chips: the channel's number, in the colour of the key that plays it ---- */
.ch-root .ch-pick {
  position: relative;
  isolation: isolate;
  min-inline-size: var(--ch-chip);
  block-size: auto;
  min-block-size: var(--ch-chip);
  padding-inline: 4px;
  border-radius: 999px;
  /* No key plays it: an open slot. */
  background: var(--card);
  color: var(--muted);
  box-shadow: inset 0 0 0 1.5px var(--ch-soft);
  cursor: pointer;
}
.ch-root .ch-pair[data-linked] .ch-pick { padding-inline: 9px; }
.ch-root .ch-num { font-size: 0.8125rem; font-weight: var(--w-ui); line-height: 1; white-space: nowrap; }
/* Wide enough for any pair's numbers, so every linked pair's name starts in the same place. */
.ch-root .ch-pair[data-linked] .ch-num { display: inline-block; min-inline-size: 3.2em; text-align: center; }
.ch-root .ch-pick[data-used] { background: var(--k); color: var(--on-key); box-shadow: none; }
.ch-root .ch-pick[data-used] .ch-num { font-weight: var(--w-strong); }
/* Another key plays it too: that key's colour, on the corner. Its number is among the markers. */
.ch-root .ch-dots {
  position: absolute;
  z-index: 1;
  inset-block-end: -3px;
  inset-inline-end: -3px;
  display: flex;
  pointer-events: none;
}
.ch-root .ch-dot {
  inline-size: 10px;
  block-size: 10px;
  border-radius: 50%;
  background: var(--k);
  box-shadow: 0 0 0 2px var(--ch-under);
}
.ch-root .ch-dot + .ch-dot { margin-inline-start: -3px; }

/* The selected key plays it: the ink ring its tile wears. */
.ch-root .ch-pick::after {
  content: "";
  position: absolute;
  inset: -4px;
  border: 2px solid var(--ink);
  border-radius: 999px;
  opacity: 0;
  scale: 0.8;
  pointer-events: none;
}
.ch-root .ch-pick[aria-pressed="true"]::after { opacity: 1; scale: 1; }

/* What pressing will do, on the corner so the number stays: add, remove or switch. */
.ch-root .ch-pick::before {
  display: none;
  position: absolute;
  z-index: 2;
  inset-block-start: -6px;
  inset-inline-start: -6px;
  place-items: center;
  inline-size: 1rem;
  block-size: 1rem;
  border-radius: 50%;
  background: var(--ink);
  color: var(--canvas);
  box-shadow: 0 0 0 1.5px var(--ch-under);
  font-size: 0.6875rem;
  font-weight: var(--w-strong);
  line-height: 1;
  opacity: 0;
  scale: 0.5;
  pointer-events: none;
}
.ch-root .ch-grid:not([data-mode="off"]) .ch-pick[aria-pressed="false"]::before { display: grid; content: "+"; }
.ch-root .ch-grid[data-mode="one"][data-switch] .ch-pick[aria-pressed="false"]::before { content: "✓"; }
.ch-root .ch-grid[data-mode="many"] .ch-pick[aria-pressed="true"]::before { display: grid; content: "−"; }
.ch-root .ch-pick:focus-visible::before { opacity: 1; scale: 1; }
/* Picking would give it the ring: a ghost of it, and on an open chip a wash of the selected key's colour. */
.ch-root .ch-grid:not([data-mode="off"]) .ch-pick[aria-pressed="false"]:focus-visible::after { opacity: 0.3; scale: 1; }
@media (hover: hover) {
  .ch-root .ch-pick:hover { background: var(--card); }
  .ch-root .ch-pick[data-used]:hover { background: var(--k); }
  .ch-root .ch-pick:hover::before { opacity: 1; scale: 1; }
  .ch-root .ch-grid:not([data-mode="off"]) .ch-pick[aria-pressed="false"]:hover::after { opacity: 0.3; scale: 1; }
  .ch-root .ch-grid:not([data-mode="off"]) .ch-pick[aria-pressed="false"]:not([data-used]):hover {
    background: color-mix(in oklab, var(--ch-sel) 30%, var(--card));
    color: var(--ink);
  }
  /*
   * A key's chip brightens under a wash rather than changing its fill, so its
   * background is always exactly its key's colour, the same as the key's tile.
   */
  .ch-root .ch-grid:not([data-mode="off"]) .ch-pick[data-used]:hover { box-shadow: inset 0 0 0 99px rgb(255 255 255 / 14%); }
  /* The one channel a channel key plays: pressing it again does nothing. */
  .ch-root .ch-grid[data-mode="one"] .ch-pick[aria-pressed="true"]:hover { box-shadow: none; }
}
.ch-root .ch-grid:not([data-mode="off"]) .ch-pick[aria-pressed="false"]:not([data-used]):active {
  background: color-mix(in oklab, var(--ch-sel) 55%, var(--card));
  color: var(--ink);
}
.ch-root .ch-grid[data-mode="one"] .ch-pick[aria-pressed="true"] { cursor: default; }
/* Off (an Auto or unknown key): washed out, still showing which key plays what. The focus ring stays at full strength. */
.ch-root .ch-grid[data-mode="off"] .ch-pick { cursor: not-allowed; }
.ch-root .ch-grid[data-mode="off"] .ch-pick[data-used],
.ch-root .ch-grid[data-mode="off"] .ch-pick[data-used]:hover { background: color-mix(in oklab, var(--k) 42%, var(--ch-under)); color: var(--ink); }
.ch-root .ch-grid[data-mode="off"] .ch-num { opacity: 0.55; }

/* ---- names: plain text until the pointer or the keyboard is there, then a line to write on ---- */
.ch-root .ch-slot { position: relative; display: flex; min-inline-size: 0; margin-inline-start: 6px; }
.ch-root .ch-name {
  inline-size: 100%;
  min-inline-size: 0;
  block-size: auto;
  min-block-size: 28px;
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
  /* 13px where four pairs share a row at 1280, 15px once a pair is 215px wide inside. */
  font-size: clamp(0.8125rem, 0.8125rem + (100cqi - 193px) * 0.09, 0.9375rem);
  font-weight: var(--w-ui);
  line-height: 1.2;
}
/* Being typed: a field, on the page's focus ring. */
.ch-root .ch-name:focus { background: var(--card); }
.ch-root .ch-slot::after {
  content: "";
  position: absolute;
  inset-inline: 2px;
  inset-block-end: 3px;
  border-block-end: 1.5px solid var(--ch-soft);
  opacity: var(--ch-show);
  pointer-events: none;
}
/* No name yet: a short dotted line to write on, there all the time. */
.ch-root .ch-slot:has(.ch-name:placeholder-shown)::after { border-block-end-style: dotted; border-block-end-color: color-mix(in oklab, var(--ink) 30%, transparent); opacity: 1; }
/* The focus ring takes the line's place. */
.ch-root .ch-slot:has(.ch-name:focus)::after { opacity: 0; }
@media (hover: hover) {
  .ch-root .ch-slot:has(.ch-name:hover:not(:focus))::after { border-block-end: 1.5px solid var(--ink); opacity: 1; }
}
/* With no hover the line would be on every name; the dotted one for a missing name is enough. */
@media (hover: none), (pointer: coarse) {
  .ch-root .ch-slot:not(:has(.ch-name:placeholder-shown))::after { opacity: 0; }
}
.ch-root .ch-bad {
  position: absolute;
  inset-inline: 2px;
  inset-block-end: 2px;
  block-size: 2.5px;
  border-radius: 2px;
  background: var(--color-7);
  pointer-events: none;
}

/* ---- key markers: each key that plays the channel, by number, on the name's top corner so they never move the layout ---- */
.ch-root .ch-tags, .ch-root .ch-cut {
  position: absolute;
  z-index: 1;
  inset-block-start: -6px;
  inset-inline-end: 6px;
}
.ch-root .ch-tags { display: flex; gap: 3px; }
/* A linked pair's one name has room for them at its end. */
.ch-root .ch-pair[data-linked] :is(.ch-tags, .ch-cut) { inset-block-start: calc(50% - 7px); inset-inline-end: 4px; }
/* At rest only the chip's colour says which key; the markers come with the pointer or the keyboard. */
.ch-root .ch-tag {
  position: relative;
  block-size: auto;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  opacity: var(--ch-show);
}
/* Those of a key being pointed at, wherever they are. */
${SPOT_TAGS} { opacity: 1; }
/* A 24px target around a 14px marker, reaching up rather than down over the name. */
.ch-root .ch-tag::after { content: ""; position: absolute; inset: -7px -3px -3px; }
.ch-root .ch-pair[data-linked] .ch-tag::after { inset: -5px -3px; }
.ch-root .ch-face, .ch-root .ch-cut {
  display: block;
  min-inline-size: 18px;
  padding-inline: 4px;
  border-radius: 999px;
  box-shadow: 0 0 0 1.5px var(--ch-under);
  font-size: 0.625rem;
  font-weight: var(--w-strong);
  line-height: 1.4;
  text-align: center;
  white-space: nowrap;
}
/* Quiet, a tint of the key's colour, since the chip beside it has the colour itself; the selected key's, and those of a key being pointed at, in full. */
.ch-root .ch-face { background: color-mix(in oklab, var(--k) 36%, var(--card)); color: var(--ink); }
.ch-root .ch-tag:is([aria-current], :focus-visible, :active) .ch-face,
${SPOT_MARKERS} { background: var(--k); color: var(--on-key); }
@media (hover: hover) {
  .ch-root .ch-tag:hover .ch-face { background: var(--k); color: var(--on-key); }
}
/* A pasted name was cut to fit: said on the field for a moment, over its markers. */
.ch-root .ch-cut { z-index: 2; padding-inline: 6px; background: var(--ink); color: var(--canvas); pointer-events: none; }
@media (pointer: coarse) {
  .ch-root .ch-num { font-size: 0.9375rem; }
  .ch-root .ch-name { min-block-size: 44px; }
  .ch-root .ch-tags, .ch-root .ch-cut { inset-block-start: -5px; inset-inline-end: 2px; }
  .ch-root .ch-tags { gap: 6px; }
  .ch-root .ch-pair[data-linked] :is(.ch-tags, .ch-cut) { inset-block-start: calc(50% - 10px); }
  .ch-root .ch-face, .ch-root .ch-cut { min-inline-size: 26px; font-size: 0.75rem; line-height: 1.667; }
  .ch-root .ch-tag::after { inset: -12px -9px; }
  /* A channel per row: every name has the row to itself, so its markers sit inside it. */
  @container ch (width < 280px) {
    .ch-root .ch-pair :is(.ch-tags, .ch-cut) { inset-block-start: calc(50% - 10px); inset-inline-end: 2px; }
  }
}

/* ---- stereo links ---- */
.ch-root .ch-link {
  position: relative;
  isolation: isolate;
  min-inline-size: 0;
  min-block-size: 0;
  inline-size: 24px;
  block-size: 24px;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
/* Linked: it explains the merge, so it stays, quietly. */
.ch-root .ch-link[aria-pressed="true"] { color: color-mix(in oklab, var(--ink) 55%, transparent); }
/*
 * Unlinked: a knot on the seam, there with the pointer or the keyboard. It
 * is drawn 16px wide, so it keeps clear of the chip beside it; its hit area
 * fills the track and 2px either side, a 24px target, and sits above its
 * neighbours, so those pixels are the link's.
 */
.ch-root .ch-pair:not([data-linked]) .ch-link {
  z-index: 1;
  grid-area: 1 / 3;
  justify-self: center;
  inline-size: 16px;
  border-radius: 999px;
  background: var(--card);
  box-shadow: inset 0 0 0 1.5px var(--ch-soft);
  opacity: var(--ch-show);
}
.ch-root .ch-pair:not([data-linked]) .ch-link::after { content: ""; position: absolute; inset-block: 0; inset-inline: -4px; }
.ch-root .ch-pair:not([data-linked]) .ch-link svg { inline-size: 12px; block-size: 12px; }
.ch-root .ch-link:active { background: var(--ch-soft); color: var(--ink); }
.ch-root .ch-pair:not([data-linked]) .ch-link:active { background: var(--well); color: var(--ink); }
@media (hover: hover) {
  .ch-root .ch-link:hover { background: var(--ch-soft); color: var(--ink); }
  .ch-root .ch-pair:not([data-linked]) .ch-link:hover { background: var(--card); box-shadow: inset 0 0 0 1.5px var(--ink); color: var(--ink); }
}
@media (pointer: coarse) {
  /* A 44px target; the knot is drawn inside it. */
  .ch-root .ch-link,
  .ch-root .ch-pair:not([data-linked]) .ch-link {
    justify-self: center;
    inline-size: 44px;
    block-size: 44px;
    margin: 0;
    background: transparent;
    box-shadow: none;
  }
  .ch-root .ch-pair:not([data-linked]) .ch-link::after { inset-inline: 0; }
  .ch-root .ch-pair:not([data-linked]) .ch-link svg { inline-size: 14px; block-size: 14px; }
  .ch-root .ch-pair:not([data-linked]) .ch-link::before {
    content: "";
    position: absolute;
    z-index: -1;
    inset: 8px;
    border-radius: 999px;
    background: var(--card);
    box-shadow: inset 0 0 0 1.5px var(--ch-soft);
  }
  .ch-root .ch-pair:not([data-linked]) .ch-link:active::before { background: var(--well); }
}

/*
 * Pointing at a key in the Keys grid, or at one of its markers here, fades
 * every channel it doesn't play. Only where there is a pointer to point with:
 * a tapped key keeps the focus, and would leave the rest faded.
 */
@media (hover: hover) {
  .ch-root [data-dim] { opacity: 0.35; }
  /* Not the control in use, though. */
  .ch-root [data-dim]:is(:focus-visible, :focus-within) { opacity: 1; }
}

/* The page's focus ring, said again because Tamagui zeroes outlines on its inputs and buttons. On a picked chip it goes outside the ink ring. */
.ch-root :is(.ch-pick, .ch-link, .ch-tag, .ch-name):focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.ch-root .ch-pick[aria-pressed="true"]:focus-visible { outline-offset: 5px; }
.ch-root .ch-name:focus-visible { outline-offset: 0; }
/* Close round the knot, so the ring stays off the chip beside it. */
.ch-root .ch-pair:not([data-linked]) .ch-link:focus-visible { outline-offset: 1px; }

/* Text on a key's colour: dark on all sixteen, and worked out from the colour where the browser can. */
@supports (color: contrast-color(red)) {
  .ch-root .ch-key:not([data-empty]),
  .ch-root .ch-tag:is([aria-current], :focus-visible, :active) .ch-face,
  ${SPOT_MARKERS},
  .ch-root .ch-grid:not([data-mode="off"]) .ch-pick[data-used] { color: contrast-color(var(--k)); }
  @media (hover: hover) {
    .ch-root .ch-tag:hover .ch-face { color: contrast-color(var(--k)); }
  }
}

/* Asked for more contrast: cells and open chips get a full stroke, and every name its line. */
@media (prefers-contrast: more) {
  .ch-root .ch-pair { box-shadow: inset 0 0 0 1px var(--muted); }
  .ch-root .ch-pair::before { background: var(--muted); }
  .ch-root .ch-pick:not([data-used]) { box-shadow: inset 0 0 0 1.5px var(--muted); color: var(--ink); }
  .ch-root .ch-slot::after { border-block-end-color: var(--muted); opacity: 1; }
  .ch-root .ch-key[data-empty] { box-shadow: inset 0 0 0 1.5px var(--muted); }
}

@media (prefers-reduced-motion: no-preference) {
  .ch-root :is(.ch-pick, .ch-link, .ch-tag, .ch-face, .ch-pair, .ch-slot, .ch-key, .ch-tip) {
    transition: background-color 150ms ease-out, color 150ms ease-out, box-shadow 150ms ease-out, scale 150ms ease-out, opacity 150ms ease-out;
  }
  /* A key's chip takes its key's colour at once, with the pop: it never shows a colour no key has. */
  .ch-root .ch-pick[data-used] { transition-duration: 0ms, 150ms, 150ms, 150ms, 150ms; }
  .ch-root .ch-slot::after { transition: opacity 150ms ease-out, border-color 150ms ease-out; }
  /* A sweep across the keys doesn't flicker: fading waits a moment, coming back doesn't. */
  .ch-root [data-dim] { transition-delay: 0ms, 0ms, 0ms, 0ms, 80ms; }
  .ch-root .ch-pick::before { transition: opacity 120ms ease-out, scale 220ms var(--spring); }
  /* Unpicking settles; picking pops, the ring springing out of the chip. */
  .ch-root .ch-pick::after { transition: opacity 160ms ease-out, scale 160ms ease-out; }
  .ch-root .ch-pick[aria-pressed="true"]::after { transition: opacity 100ms ease-out, scale 320ms var(--spring); }
  .ch-root .ch-pick[aria-pressed="true"] { animation: ch-pop 320ms var(--spring); }
  .ch-root .ch-grid:not([data-mode="off"]) .ch-pick:active, .ch-root .ch-link:active, .ch-root .ch-tag:active .ch-face { scale: 0.92; }
  .ch-root .ch-grid[data-mode="one"] .ch-pick[aria-pressed="true"]:active { scale: 1; }
  @media (hover: hover) {
    .ch-root .ch-tag:hover .ch-face { scale: 1.18; }
    .ch-root .ch-tag:hover:active .ch-face { scale: 1.05; }
  }
}
@keyframes ch-pop { from { scale: 0.86; } }

/*
 * Forced colours drop the fills and shadows and put a plate in the page's
 * colour behind text, so a cell can't be a fill, a state can't be a fill with
 * text on it, and a key can't be a colour: its number on the markers says
 * which, so they are always there. Cells and states are edges in system
 * colours: a thick one in the selection colour means on (a picked channel, a
 * linked pair's toggle, the selected key's marker).
 */
@media (forced-colors: active) {
  .ch-root .ch-pair { outline: 1px solid CanvasText; outline-offset: -1px; }
  .ch-root .ch-pair::before { background: CanvasText; inline-size: 1px; }
  /* !important: Tamagui's border classes repeat themselves to outrank anything here. */
  .ch-root .ch-pick { border: 1px solid ButtonText !important; }
  .ch-root .ch-pick[data-used] { border-width: 2px !important; }
  .ch-root .ch-pair:not([data-linked]) .ch-link { border: 1px solid ButtonText !important; }
  .ch-root :is(.ch-pick, .ch-link)[aria-pressed="true"] { border: 3px solid Highlight !important; }
  .ch-root .ch-pick::after { border-color: Highlight; }
  .ch-root .ch-pick::before { border: 1px solid ButtonText; }
  .ch-root .ch-dot { border: 1px solid ButtonText; }
  .ch-root .ch-key { outline: 1px solid CanvasText; outline-offset: -1px; }
  .ch-root .ch-face { outline: 1px solid ButtonText; outline-offset: -1px; }
  .ch-root .ch-tag[aria-current] .ch-face { outline: 2px solid Highlight; outline-offset: 0; }
  .ch-root .ch-cut { outline: 1px solid CanvasText; }
  .ch-root .ch-bad { background: ButtonText; }
  .ch-root .ch-slot::after { border-block-end-color: CanvasText; }
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

/** The selected key as a chip of its tile: its number and label on its colour. An empty key has no colour yet. */
const KeyPill = ({ index, label }: { index: number; label?: string }) => (
  <span
    className="ch-key"
    style={label === undefined ? undefined : keyStyle(index)}
    data-empty={label === undefined ? '' : undefined}
  >
    {label === undefined ? (
      `Key ${index + 1}`
    ) : (
      <>
        <span className="ch-vh">Key </span>
        {String(index + 1).padStart(2, '0')} {label}
      </>
    )}
  </span>
);

/** One line on what picking a channel will do for the selected key. */
const Instruction = ({ system, index }: { system: Editable; index: number }) => {
  const key = system.keys[index];
  switch (key?.type) {
    case 'unassigned':
      return (
        <>
          Pick a channel for <KeyPill index={index} />
        </>
      );
    case 'channel': {
      // A loaded file can refer to a pair by its second channel: name the pair.
      const first = pickTarget(system, key.channel);
      return (
        <>
          <KeyPill index={index} label={keyLabel(system, key)} /> plays ch {first}
          {isStereo(system, first) ? `+${first + 1}` : ''}: pick another to change it
        </>
      );
    }
    case 'group':
      return (
        <>
          <KeyPill index={index} label={keyLabel(system, key)} /> pick channels to add or remove
        </>
      );
    case 'auto':
      return (
        <>
          <KeyPill index={index} label="Auto" /> takes the next free channel, so picking is off
        </>
      );
    default:
      return (
        <>
          <KeyPill index={index} label={key ? keyLabel(system, key) : 'Unknown'} /> is kept as it
          was loaded, so picking is off
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
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <g stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
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
  /** The keys that play the channel; the chip wears the first one's colour. */
  readonly uses: readonly KeyUse[];
  /** Faded, because the key being pointed at doesn't play it. */
  readonly dim: boolean;
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
  uses,
  dim,
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
  // The name starts with the numbers as they're shown, so voice control can use them.
  const shown = linked ? `${channel}–${channel + 1}` : String(channel);
  const numbers = `${linked ? 'Channels' : 'Channel'} ${shown}`;
  const [owner, ...others] = uses;
  return (
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
      data-used={owner ? '' : undefined}
      data-dim={dim ? '' : undefined}
      data-stop={id}
      tabIndex={stop === id ? 0 : -1}
      style={owner && keyStyle(owner.index)}
      onPress={() => onPick(channel)}
    >
      <span className="ch-num">{shown}</span>
      {others.length > 0 && (
        <span className="ch-dots" aria-hidden="true">
          {others.map((use) => (
            <span key={use.index} className="ch-dot" style={keyStyle(use.index)} />
          ))}
        </span>
      )}
    </Action>
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
 * A marker for each key that plays a channel: the key's number, in its colour,
 * so the colour of a chip is never the only way to tell. Pressing one selects
 * that key. Tab reaches them after the name of the
 * channel whose pick button has focus, so they don't slow the arrow keys down.
 */
const Tags = ({ channel, uses, selected, stop, onSelectKey }: TagsProps) =>
  uses.length === 0 ? null : (
    <div className="ch-tags">
      {uses.map((use) => {
        const current = use.index === selected;
        // The key's number as the marker shows it (two digits), for voice control.
        const label = `Used by key ${String(use.index + 1).padStart(2, '0')}, ${use.label}${current ? ' (selected)' : ': select it'}`;
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
            data-key={use.index}
            data-of={`p${channel}`}
            tabIndex={stop === `p${channel}` ? 0 : -1}
            onPress={() => onSelectKey(use.index)}
          >
            <span className="ch-face" style={keyStyle(use.index)}>
              {String(use.index + 1).padStart(2, '0')}
            </span>
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
  /** The selected key plays the channel. */
  readonly on: boolean;
  /** Faded, because the key being pointed at doesn't play it. */
  readonly dim: boolean;
  /** Which row under the pair this channel's problem goes on. */
  readonly errorRow: 1 | 2;
  /** No name field comes after this one. */
  readonly last: boolean;
  /** The channel's key markers, which sit on the field's edge. */
  readonly children?: ReactNode;
}

/** How long the field says a pasted name was cut. */
const CUT_SHOWN_MS = 2500;

const Name = ({ channel, name, on, dim, errorRow, last, children }: NameProps) => {
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
      <div
        className="ch-slot"
        data-on={on ? '' : undefined}
        data-dim={dim ? '' : undefined}
        // Tamagui's Input drops `spellCheck`; the field inherits it from here.
        spellCheck={false}
        onPaste={onPaste}
      >
        <Input
          id={nameId(channel)}
          className="ch-name"
          name={`channel-${channel}-name`}
          size="sm"
          // No room to spare on the right: six characters just fit where four pairs share a row.
          pl={2}
          pr={0}
          py="0"
          borderWidth={0}
          maxLength={NAME_MAX}
          value={name}
          // Blank, so CSS can tell a channel with no name yet (`:placeholder-shown`).
          placeholder=" "
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
  /** Faded, because the key being pointed at doesn't play the channel. */
  readonly dimA: boolean;
  readonly dimB: boolean;
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
  // The whole pair fades as one; otherwise each channel does.
  const dim = props.dimA && (linked || props.dimB);
  // A linked pair is tinted with the colour of the key that plays it.
  const owner = linked ? props.usesA[0] : undefined;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset can't be the grid these controls are laid out on
    <div
      className="ch-pair"
      role="group"
      aria-label={`Channels ${first} and ${second}`}
      data-linked={linked ? '' : undefined}
      data-owned={owner ? '' : undefined}
      data-dim={dim ? '' : undefined}
      style={owner && keyStyle(owner.index)}
    >
      <Pick
        {...pick}
        channel={first}
        name={props.nameA}
        pressed={props.pressedA}
        uses={props.usesA}
        dim={!dim && props.dimA}
      />
      <Name
        channel={first}
        name={props.nameA}
        on={props.pressedA}
        dim={!dim && props.dimA}
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
            uses={props.usesB}
            dim={!dim && props.dimB}
          />
          <Name
            channel={second}
            name={props.nameB}
            on={props.pressedB}
            dim={!dim && props.dimB}
            errorRow={2}
            last={second === CHANNEL_COUNT}
          >
            <Tags {...tags} channel={second} uses={props.usesB} />
          </Name>
        </>
      )}
      <StereoError first={first} />
    </div>
  );
}, samePair);

// ---- the panel -------------------------------------------------------------

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
 * The Channels region. Tab reaches each name; the pick buttons and links are
 * one tab stop, moved through with the arrow keys, and Tab goes on from a pick
 * button to that channel's name and then its key markers. Each pair is a
 * group; the region isn't a toolbar or a grid, because it holds text fields
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
  const uses = useMemo(() => channelUses(system), [system]);
  // The key being pointed at, in the Keys grid or on a marker here, when it plays anything:
  // its channels stand out because the rest fade.
  const plays = (index: number, channel: number) =>
    (uses[channel - 1] ?? []).some((use) => use.index === index);
  const spot =
    highlight !== null && uses.some((list) => list.some((use) => use.index === highlight))
      ? highlight
      : null;

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

  // Don't leave a key pointed at when the region goes away under the pointer.
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

  return (
    <Card render="section" className="ch-root" aria-labelledby={titleId}>
      <style>{CSS}</style>
      <div className="ch-head">
        <PanelTitle id={titleId}>Channels</PanelTitle>
        <p id={hintId} className="ch-hint">
          <Instruction system={system} index={selected} />
        </p>
        <p className="ch-tip">
          Names up to {NAME_MAX} characters
          <span className="ch-tip-more"> · Enter for the next</span>
        </p>
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: it listens for the controls inside it; the section is the landmark and each pair a group, so a role here would only add noise */}
      <div
        ref={grid}
        className="ch-grid"
        data-mode={modeOf(key)}
        data-switch={key?.type === 'channel' ? '' : undefined}
        data-spot={spot ?? undefined}
        style={{ '--ch-sel': keyColor(selected) } as CSSProperties}
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
              dimA={spot !== null && !plays(spot, first)}
              dimB={spot !== null && !plays(spot, second)}
              selected={selected}
              pickable={canPick(key)}
              hintId={hintId}
              stop={pairOfStop(stop) === first ? stop : null}
              {...handlers}
            />
          );
        })}
      </div>
    </Card>
  );
};
