import type { Key } from '@mcmillan/me1-mate-core';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Input, SizableText, type TamaguiElement, Theme, XStack } from 'tamagui';
import {
  canMute,
  type Editable,
  type EditableKeyType,
  hasPan,
  isBalance,
  isStereo,
  keyLabel,
  levelText,
  pairStart,
  pickTarget,
  setKeyLevel,
  setKeyMuted,
  setKeyName,
  setKeyPan,
  setKeyType,
  setMemberLevel,
  setMemberPan,
  toggleMember,
} from '../lib/edit.ts';
import { editAtom, selectedKeyAtom, systemAtom } from '../lib/store.ts';
import { KEY_TYPE_LABEL, keyStyle } from '../lib/theme.ts';
import { Fader, Pan } from './Fader.tsx';
import { FieldError, useTextFieldError, WarningIcon } from './FieldError.tsx';
import { Action, Card } from './ui.tsx';

/**
 * The inspector is the page's one raised surface, a card. Its top is the hero:
 * a block of the selected key's colour (`--k`, set on the card, so the faders
 * inside wear it too) with the key's label in the big voice.
 *
 * The card is a size container: in the side column the body is one column;
 * where it sits full width between the keys and the channels it puts what the
 * key is on the left and what it plays on the right. The areas are named, so
 * the order in the markup is the reading and Tab order in both layouts.
 *
 * Tamagui's own border and padding classes repeat themselves up to four
 * times; `&&&&` matches that where an Action or Input is restyled here.
 */
const CSS = `
.insp { container: insp / inline-size; position: relative; overflow: hidden; }
/* A hero without a colour covers the card's hairline, so it's drawn again on top. */
.insp:has(> .insp-hero[data-plain])::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  box-shadow: inset 0 0 0 1.5px var(--line);
}
.insp-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
/* The fader draws its own ring (Fader.tsx). */
.insp :is(button, input:not(.fader), [tabindex]):focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }

/* ---- hero ---- */
.insp-hero {
  display: grid; gap: 2px; padding: 14px 18px 16px;
  --insp-on: var(--on-key); --insp-quiet: color-mix(in oklab, var(--insp-on) 80%, transparent);
  background: var(--k); color: var(--insp-on);
}
/* An empty key has no colour, and neither does one this editor only keeps. */
/* (Its quiet text is ink thinned the same way: --muted is a little too light to read on --well.) */
.insp-hero[data-plain] {
  --insp-on: var(--ink); --insp-quiet: color-mix(in oklab, var(--ink) 72%, transparent); background: var(--well);
}
.insp-hero-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-block-size: 20px; }
/*
 * Text that is mostly figures (the eyebrow, the summary, channel numbers) is
 * set in plain ones: the page's slashed zero looks typewritten in small sizes.
 */
.insp-eyebrow, .insp-sum, .insp-chip, .insp-row-meta { font-feature-settings: "tnum"; }
.insp-eyebrow {
  margin: 0; font-size: 0.6875rem; font-weight: var(--w-ui); line-height: 1.3; letter-spacing: 1px;
  text-transform: uppercase; color: var(--insp-quiet);
}
/* Pulled out so two round buttons don't make the top row taller than its text. */
.insp-steps { display: flex; gap: 4px; margin-block: -6px; margin-inline-end: -6px; }
.insp .insp-step {
  inline-size: max(28px, var(--target)); block-size: max(28px, var(--target)); min-block-size: 0;
  border-radius: 999px; color: var(--insp-on); opacity: 1;
  background: color-mix(in oklab, currentColor 10%, transparent);
  &&&& { padding: 0; border: 0; }
}
@media (hover: hover) {
  .insp .insp-step:not([aria-disabled="true"]):hover { background: color-mix(in oklab, currentColor 20%, transparent); }
}
.insp .insp-step:not([aria-disabled="true"]):active { background: color-mix(in oklab, currentColor 28%, transparent); }
/*
 * At either end the disc goes and the chevron fades: the same button, with
 * nothing to press. Only its insides fade, so its focus ring stays at full strength.
 */
.insp .insp-step[aria-disabled="true"] {
  background: transparent; color: color-mix(in oklab, var(--insp-on) 30%, transparent); cursor: default;
}
/* Done, in the key sheet: the steps' disc, stretched to a pill for its word. */
.insp .insp-done { inline-size: auto; padding-inline: 14px; font-size: 0.875rem; font-weight: var(--w-strong); &&&& { padding: 0 14px; } }
/* On a key's colour the ring gets a band of the card's colour inside it, so it shows on any of them. */
.insp .insp-step:focus-visible { box-shadow: 0 0 0 2px var(--card); }
/*
 * The label, as big as the card allows: six wide letters still fit the
 * narrowest card. Its size is the emphasis, so it takes the strong weight
 * rather than the display one, which looks heavy this big.
 */
.insp-big {
  margin: 0; font-size: clamp(1.75rem, 13.2cqi, 2.75rem); font-weight: var(--w-strong); line-height: 1.08;
  letter-spacing: -0.027em; white-space: nowrap; overflow-x: clip; text-overflow: ellipsis;
}
.insp-big[data-long] { font-size: clamp(1.5rem, 9.6cqi, 2.25rem); }
.insp-big[data-standin] { color: color-mix(in oklab, currentColor 58%, transparent); }
.insp-hero[data-plain] .insp-big:is([data-standin], [data-empty]) { color: var(--muted); }
.insp-sum { margin: 0; font-size: 0.8125rem; font-weight: var(--w-text); line-height: 1.35; color: var(--insp-quiet); }

/* ---- body ---- */
.insp-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; padding: 14px 18px 18px; }
.insp-body > * { min-inline-size: 0; }
.insp-fields, .insp-plays { display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; }
.insp-fields { gap: 12px; }
.insp-plays { gap: 6px; }
.insp-plays .insp-make { justify-self: start; margin-block-start: 6px; }

/*
 * The type switch: six on a well, three to a row (what a key plays from the
 * channels, then what it plays by itself), so each word has room even on a
 * phone. The pressed one is an ink pill that slides between them.
 */
.insp-type {
  position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px;
  padding: 4px; border-radius: 20px; background: var(--well);
}
.insp-pill {
  position: absolute; inset-block-start: 4px; inset-inline-start: 4px;
  inline-size: calc((100% - 16px) / 3); block-size: calc((100% - 12px) / 2);
  border-radius: 999px; background: var(--ink); pointer-events: none;
  translate: calc(var(--insp-col) * (100% + 4px)) calc(var(--insp-row) * (100% + 4px));
}
.insp-pill:dir(rtl) { translate: calc(var(--insp-col) * (-100% - 4px)) calc(var(--insp-row) * (100% + 4px)); }
.insp-pill[data-off] { opacity: 0; }
.insp .insp-seg {
  position: relative; min-inline-size: 0; block-size: max(30px, var(--target)); min-block-size: 0;
  border-radius: 999px; background: transparent; color: var(--ink); opacity: 1;
  font-size: 0.8125rem; font-weight: var(--w-ui); line-height: 1.2;
  &&&& { padding: 0 2px; border: 0; }
}
.insp .insp-seg:hover { background: color-mix(in oklab, var(--ink) 8%, transparent); }
.insp .insp-seg:active { background: color-mix(in oklab, var(--ink) 14%, transparent); }
.insp .insp-seg[aria-pressed="true"] { background: transparent; color: var(--canvas); }

/* Mute, at the end of the level's head: an outlined pill; pressed, an ink one with the speaker crossed out. */
.insp .insp-mute {
  block-size: max(28px, var(--target)); min-block-size: 0; gap: 5px; border-radius: 999px;
  background: transparent; color: var(--ink); opacity: 1;
  font-size: 0.75rem; font-weight: var(--w-ui); line-height: 1;
  &&&& { padding: 0 11px 0 9px; border: 1.5px solid var(--line); }
}
@media (hover: hover) {
  .insp .insp-mute:hover { background: color-mix(in oklab, var(--ink) 8%, transparent); }
}
.insp .insp-mute[aria-pressed="true"] { background: var(--ink); color: var(--canvas); &&&& { border-color: var(--ink); } }
@media (forced-colors: active) {
  .insp .insp-mute[aria-pressed="true"] { forced-color-adjust: none; background: Highlight; color: HighlightText; }
}

/* A field: a small quiet label, a quieter hint on the same row, the control, then its problem. */
.insp-field { display: grid; grid-template-columns: minmax(0, 1fr); gap: 5px; }
.insp-field-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; column-gap: 8px; }
.insp-label { margin: 0; font-size: 0.75rem; font-weight: var(--w-ui); line-height: 1.35; color: var(--muted); }
.insp-label small { font-size: inherit; font-weight: var(--w-text); }
.insp-hint { margin: 0; font-size: 0.75rem; font-weight: var(--w-text); line-height: 1.35; color: var(--muted); }
.insp .insp-input {
  block-size: auto; min-block-size: max(40px, var(--target)); border-radius: 12px; background: transparent;
  color: var(--ink); font-size: 1.0625rem; font-weight: var(--w-ui); line-height: 1.3;
  &&&& { padding: 6px 12px; border: 1.5px solid var(--line); }
  &&&&:hover { border-color: color-mix(in oklab, var(--ink) 28%, var(--line)); }
  /* A field with a problem: the red theme's colour, as the icon under it. */
  &&&&[aria-invalid="true"] { border-color: var(--c-color-red-600); }
}
.insp .insp-input::placeholder { color: var(--muted); opacity: 0.6; font-weight: var(--w-text); }
@media (prefers-color-scheme: dark) {
  .insp .insp-input { &&&&[aria-invalid="true"] { border-color: var(--c-color-red-400); } }
}

/* What a channel key plays: the channel's chip, as in Channels, and its name, on a tint of the key's colour. */
.insp-chan {
  display: flex; align-items: center; gap: 8px; min-block-size: 38px; padding: 4px; padding-inline-end: 14px;
  border-radius: 999px; background: color-mix(in oklab, var(--k) 20%, var(--card));
}
.insp-chip {
  flex: none; display: grid; place-items: center; min-inline-size: 30px; min-block-size: 30px; padding-inline: 8px;
  border-radius: 999px; background: var(--k); color: var(--on-key);
  font-size: 0.8125rem; font-weight: var(--w-strong); line-height: 1;
}
.insp-chan-name {
  flex: 1 1 0; min-inline-size: 0; font-size: 0.9375rem; font-weight: var(--w-ui); line-height: 1.3;
  white-space: nowrap; overflow-x: clip; text-overflow: ellipsis;
}
.insp-chan-name[data-none] { font-weight: var(--w-text); color: var(--muted); }
.insp-copy { margin: 0; font-size: 0.875rem; font-weight: var(--w-text); line-height: 1.4; text-wrap: pretty; }

/*
 * A group's channels, a row each, on one grid so every row's columns line up:
 * the channel (its name in ink, then its number and, for a stereo pair,
 * "Balance", quieter), the sliders, and the way out in a column of its own so
 * it never covers anything. The level is on the first line and the pan under
 * it, in the same column: the two tracks share both edges, and each value
 * slot is the same fixed width at the end. A header names the column once.
 * Rows are parted by a hairline; the way out is faint until the row is
 * pointed at or holds focus (full strength where there is no hover).
 */
.insp-members { display: grid; grid-template-columns: minmax(0, 1fr); margin: 0; padding: 0; list-style: none; }
.insp-members-head, .insp-row {
  --insp-row-x: max(24px, var(--target));
  display: grid; grid-template-columns: 72px minmax(0, 1fr) var(--insp-row-x); column-gap: 6px;
}
.insp-members-head { margin-block-end: -2px; }
.insp-members-head > .insp-hint { grid-column: 2; }
.insp-row {
  grid-template-areas: "name level x" "meta pan ." "error error error";
  align-items: center; padding-block: 4px 6px;
}
.insp-row + .insp-row { border-block-start: 1px solid var(--line); }
.insp-row > .insp-row-name { grid-area: name; }
.insp-row > .insp-row-meta { grid-area: meta; }
.insp-row > .insp-row-level { grid-area: level; }
.insp-row > .insp-row-pan { grid-area: pan; }
.insp-row > .insp-remove { grid-area: x; }
.insp-row > .insp-row-error { grid-area: error; }
.insp-row-name {
  font-size: 0.84375rem; font-weight: var(--w-ui); line-height: 1.2;
  white-space: nowrap; overflow-x: clip; text-overflow: ellipsis;
}
.insp-row-name[data-none] { color: var(--muted); }
.insp-row-meta {
  display: flex; flex-wrap: wrap; column-gap: 5px; min-inline-size: 0;
  font-size: 0.75rem; font-weight: var(--w-text); line-height: 1.2; color: var(--muted); white-space: nowrap;
}
.insp .insp-remove {
  inline-size: max(24px, var(--target)); block-size: max(24px, var(--target)); min-block-size: 0;
  border-radius: 999px; background: transparent; color: var(--muted); opacity: 1;
  font-size: 0.75rem; font-weight: var(--w-ui); line-height: 1;
  &&&& { padding: 0; border: 0; }
}
/* At rest a faint ✕ (still 3:1) says a row can go; pointing at the row or focusing into it brings it up. */
@media (hover: hover) and (prefers-contrast: no-preference) {
  .insp-row:not(:hover, :focus-within) .insp-remove { color: color-mix(in oklab, var(--muted) 72%, var(--card)); }
}
@media (hover: hover) {
  .insp .insp-remove:hover { background: var(--well); color: var(--ink); }
}
.insp .insp-remove:active { background: color-mix(in oklab, var(--ink) 14%, var(--well)); color: var(--ink); }

/* Nothing here yet: an open slot, in the key's colour when the key has one. */
.insp-invite {
  display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 16px;
  border: 1.5px dashed var(--line); color: var(--muted);
}
.insp-invite[data-key] {
  border-color: color-mix(in oklab, var(--k) 70%, var(--ink));
  background: color-mix(in oklab, var(--k) 14%, var(--card)); color: var(--ink);
}
.insp-invite strong { font-weight: var(--w-strong); color: var(--ink); }
.insp-invite-mark {
  flex: none; display: grid; place-items: center; inline-size: 24px; block-size: 24px; border-radius: 999px;
  background: var(--k); color: var(--on-key); font-size: 1rem; font-weight: var(--w-ui); line-height: 1;
}

/*
 * The one-page editor's way to Channels, for a key that takes channels: with
 * none yet, the invite above says it with an arrow toward the channels (down
 * where they're under the inspector, to the side where the inspector is a
 * column beside them); with some, a quiet line says it again.
 */
.insp-invite .insp-cue-arrow {
  flex: none; display: grid; place-items: center; inline-size: 24px; block-size: 24px; border-radius: 999px;
  background: var(--ink); color: var(--canvas);
}
.insp-invite[data-key] .insp-cue-arrow { background: var(--k); color: var(--on-key); }
.insp-cue-arrow svg { display: block; }
@media (min-width: 1100px) {
  .insp-cue-arrow svg { rotate: 90deg; }
  .insp-cue-arrow:dir(rtl) svg { rotate: -90deg; }
}
.insp-cue-line { margin: 0; }
@media (prefers-reduced-motion: no-preference) {
  /* A nudge toward the channels when the key is selected. */
  .insp-cue-arrow svg { animation: insp-nudge 900ms var(--spring) 300ms 2 both; }
}
@keyframes insp-nudge { 50% { translate: 0 3px; } }

/*
 * In the side column (from 1100px, styles.css) the inspector's wrapper scrolls
 * when a long group is taller than the window. A shadow at an edge says there
 * is more that way; it needs scroll-state queries, or else scroll-driven
 * animations, and without either the scrollbar is the cue. Below 1100px the
 * wrapper doesn't scroll, and a scroll() timeline there would follow the page.
 */
@media (min-width: 1100px) {
  .workspace-inspector:has(> .insp) { container-type: scroll-state; --insp-shade: rgb(0 0 0 / 0.16); }
  @media (prefers-color-scheme: dark) { .workspace-inspector:has(> .insp) { --insp-shade: rgb(0 0 0 / 0.55); } }
  .workspace-inspector:has(> .insp)::before,
  .workspace-inspector:has(> .insp)::after {
    content: ""; display: block; position: sticky; z-index: 1; block-size: 12px;
    pointer-events: none; opacity: 0;
  }
  .workspace-inspector:has(> .insp)::before {
    inset-block-start: 0; margin-block-end: -12px;
    background: radial-gradient(farthest-side at 50% 0, var(--insp-shade), transparent);
  }
  .workspace-inspector:has(> .insp)::after {
    inset-block-end: 0; margin-block-start: -12px;
    background: radial-gradient(farthest-side at 50% 100%, var(--insp-shade), transparent);
  }
  @container scroll-state(scrollable: block-start) { .workspace-inspector:has(> .insp)::before { opacity: 1; } }
  @container scroll-state(scrollable: block-end) { .workspace-inspector:has(> .insp)::after { opacity: 1; } }
  @supports not (container-type: scroll-state) {
    .workspace-inspector:has(> .insp)::before,
    .workspace-inspector:has(> .insp)::after { animation: insp-shade linear both; animation-timeline: scroll(); }
    .workspace-inspector:has(> .insp)::before { animation-range: 0 2rem; }
    .workspace-inspector:has(> .insp)::after { animation-direction: reverse; animation-range: calc(100% - 2rem) 100%; }
  }
  @media (prefers-reduced-motion: no-preference) {
    .workspace-inspector:has(> .insp)::before,
    .workspace-inspector:has(> .insp)::after { transition: opacity 150ms ease-out; }
  }
}
@keyframes insp-shade { to { opacity: 1; } }

/* Full width, between the keys and the channels: what the key is beside what it plays. */
@container insp (inline-size >= 580px) {
  .insp-hero { padding-inline: 24px; }
  .insp-body {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: auto 1fr;
    grid-template-areas: "type plays" "fields plays";
    column-gap: 24px; padding-inline: 24px;
  }
  .insp-type { grid-area: type; }
  .insp-fields { grid-area: fields; }
  .insp-plays { grid-area: plays; padding-inline-start: 24px; border-inline-start: 1.5px solid var(--line); }
}

@media (prefers-reduced-motion: no-preference) {
  .insp-hero { transition: background-color 260ms ease-out; }
  /* A newly selected key's label rises into place. */
  .insp-big, .insp-sum { animation: insp-rise 320ms var(--spring) both; }
  .insp-sum { animation-delay: 40ms; }
  .insp-pill { transition: translate 320ms var(--spring), opacity 160ms ease-out; }
  .insp .insp-seg { transition: background-color 140ms ease-out, color 180ms ease-out, scale 140ms ease-out; }
  .insp .insp-seg:active { scale: 0.96; }
  .insp .insp-step, .insp .insp-remove {
    transition: background-color 140ms ease-out, color 140ms ease-out, opacity 140ms ease-out, scale 140ms ease-out;
  }
  .insp .insp-step:not([aria-disabled="true"]):active, .insp .insp-remove:active { scale: 0.9; }
  .insp .insp-input { transition: border-color 140ms ease-out; }
  .insp-chan, .insp-chip, .insp-invite, .insp-invite-mark { transition: background-color 260ms ease-out, border-color 260ms ease-out; }
  /* A channel added to the group slides into the list. */
  .insp-row { transition: opacity 220ms ease-out, translate 320ms var(--spring); }
  @starting-style { .insp-row { opacity: 0; translate: -10px 0; } }
}
@keyframes insp-rise { from { opacity: 0; translate: 0 10px; } }

@media (prefers-contrast: more) {
  .insp .insp-input { &&&& { border-color: var(--muted); } }
  .insp-type { box-shadow: inset 0 0 0 1.5px var(--muted); }
}

/*
 * Forced colours drop author backgrounds and shadows, so every filled shape
 * gets an outline and "pressed" the system's highlight pair. The pressed
 * segment opts out of forcing (the text's backplate would hide it on the
 * highlight), with its background and text both set from that pair.
 */
@media (forced-colors: active) {
  .insp { border: 1px solid CanvasText; }
  .insp-hero { border-block-end: 1px solid CanvasText; }
  .insp-type, .insp-chan, .insp-chip, .insp-invite-mark, .insp-cue-arrow { border: 1px solid CanvasText; }
  .insp-pill { display: none; }
  .insp :is(.insp-step, .insp-remove) { &&&& { border: 1.5px solid ButtonText; } }
  .insp .insp-step[aria-disabled="true"] { color: GrayText; &&&& { border-color: GrayText; } }
  .insp .insp-seg[aria-pressed="true"] {
    forced-color-adjust: none; background: Highlight; color: HighlightText;
  }
  .insp .insp-seg[aria-pressed="true"]:focus-visible { outline-color: CanvasText; }
}
`;

const NATIVE_FOCUSGROUP = 'focusGroup' in HTMLElement.prototype;

/** The type switch's buttons, in reading order: three to a row. */
const TYPES: readonly EditableKeyType[] = ['unassigned', 'channel', 'group', 'auto', 'aux', 'tone'];
const TYPE_COLUMNS = 3;

const Chevron = ({ back = false }: { readonly back?: boolean }) => (
  <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path
      d={back ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5'}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** An arrow toward the Channels panel; CSS turns it to the side where the panel is beside the inspector. */
const CueArrow = () => (
  <span className="insp-cue-arrow" aria-hidden="true">
    <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M8 2.5v10.5M3.5 8.5 8 13l4.5-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
);

/** What to press to give a key channels, on the one-page editor. */
const PICK_CUE = 'Press a channel’s number in Channels to give it to this key.';

/**
 * A step to the previous or next key. At the ends it stays focusable, so focus
 * isn't dropped there. Tamagui's Button writes aria-disabled from its own
 * `disabled`, which would take the button out of reach; the attribute is set
 * on the element instead.
 */
const Step = ({
  label,
  back = false,
  off,
  onPress,
}: {
  label: string;
  back?: boolean;
  off: boolean;
  onPress: () => void;
}) => {
  const ref = useRef<TamaguiElement>(null);
  useEffect(() => {
    (ref.current as unknown as HTMLElement | null)?.setAttribute('aria-disabled', String(off));
  }, [off]);
  return (
    <Action
      ref={ref}
      className="insp-step"
      kind="ghost"
      aria-label={label}
      onPress={() => {
        if (!off) onPress();
      }}
    >
      <Chevron back={back} />
    </Action>
  );
};

/** The heading of a part of the inspector, which looks like a field's label. */
const Sub = ({ children, id }: { children: ReactNode; id?: string }) => (
  <h3 className="insp-label" {...(id ? { id } : {})}>
    {children}
  </h3>
);

const Hint = ({ children, id }: { children: ReactNode; id?: string }) => (
  <span className="insp-hint" {...(id ? { id } : {})}>
    {children}
  </span>
);

/**
 * "7", or "7+8" for a stereo pair, which a key refers to by its first channel.
 * (A reference to the second is a problem the field reports, and reads as "8".)
 */
const numbersOf = (system: Editable, channel: number, plus = '+'): string =>
  isStereo(system, channel) && pairStart(channel) === channel
    ? `${channel}${plus}${channel + 1}`
    : String(channel);

/** How a channel is read out: "KitPad 7+8 stereo", "Channel 3". */
const spokenName = (system: Editable, channel: number): string =>
  `${system.channels[channel - 1]?.name || 'Channel'} ${numbersOf(system, channel)}${
    isStereo(system, channel) ? ' stereo' : ''
  }`;

/** The line under the big label: what the key plays and how loud, in a few words. */
const summary = (system: Editable, key: Key, named: boolean): string => {
  // Said where the big label is a stand-in (an unnamed group, a channel number) and not what the ME-1 shows.
  const standIn = named ? [] : ['no label'];
  const muted = 'muted' in key && key.muted ? ['muted'] : [];
  switch (key.type) {
    case 'unassigned':
      return 'no channel assigned';
    case 'auto':
      return ['next free channel', levelText(key.level), ...muted].join(' · ');
    case 'channel':
      return [
        `Ch ${numbersOf(system, key.channel)}`,
        system.channels[key.channel - 1]?.name,
        ...standIn,
        levelText(key.level),
        ...muted,
      ]
        .filter(Boolean)
        .join(' · ');
    case 'group': {
      const count = key.members.length;
      return [
        ...standIn,
        count === 0 ? 'no channels yet' : `${count} channel${count === 1 ? '' : 's'}`,
        levelText(key.level),
        ...muted,
      ].join(' · ');
    }
    case 'aux':
      return ['Aux in', ...standIn, levelText(key.level), ...muted].join(' · ');
    case 'tone':
      return ['1 kHz tone', ...standIn, levelText(key.level), ...muted].join(' · ');
    case 'unknown':
      return [...standIn, 'kept as it is'].join(' · ');
  }
};

/**
 * The top of the card: a block of the key's colour with its number and type,
 * the steps to the keys either side, and its label, large, the way the ME-1
 * writes it. Only a label the key or its channel really has is said to be
 * what the ME-1 shows; a stand-in (an unnamed group, Auto, a channel number)
 * is quieter, and the line under it says there is no label. An empty key has
 * no colour, and says so in the same big voice; a key of a kind this editor
 * only keeps has none either, like its tile.
 */
const Hero = ({
  system,
  index,
  onStep,
  onClose,
}: {
  system: Editable;
  index: number;
  onStep: (to: number) => void;
  onClose?: (() => void) | undefined;
}) => {
  const key = system.keys[index];
  if (!key) return null;
  const n = index + 1;
  const empty = key.type === 'unassigned';
  const plain = empty || key.type === 'unknown';
  const named =
    key.type === 'channel'
      ? Boolean(key.name || system.channels[key.channel - 1]?.name)
      : (key.type === 'group' ||
          key.type === 'aux' ||
          key.type === 'tone' ||
          key.type === 'unknown') &&
        Boolean(key.name);
  const label = empty ? 'Empty' : keyLabel(system, key);
  return (
    <div className="insp-hero" data-plain={plain ? '' : undefined}>
      <div className="insp-hero-top">
        <h2 className="insp-eyebrow">
          <span className="insp-sr">
            Key {n}
            {empty ? '' : `: ${KEY_TYPE_LABEL[key.type]}`}
          </span>
          <span aria-hidden="true">
            Key {String(n).padStart(2, '0')}
            {empty ? '' : ` · ${KEY_TYPE_LABEL[key.type]}`}
          </span>
        </h2>
        <div className="insp-steps">
          <Step label="Previous key" back off={index <= 0} onPress={() => onStep(index - 1)} />
          <Step
            label="Next key"
            off={index >= system.keys.length - 1}
            onPress={() => onStep(index + 1)}
          />
          {onClose && (
            <Action className="insp-step insp-done" kind="ghost" onPress={onClose}>
              {/* In a span, so it takes the hero's colour rather than Tamagui's text colour. */}
              <span>Done</span>
            </Action>
          )}
        </div>
      </div>
      {/* Keyed by the key, so the label rises in when another is selected and stays put while it's typed. */}
      <p
        key={`big-${index}`}
        className="insp-big display"
        data-empty={empty ? '' : undefined}
        data-standin={!empty && !named && key.type !== 'auto' ? '' : undefined}
        data-long={label.length > 6 ? '' : undefined}
      >
        {named && <span className="insp-sr">The ME-1 shows </span>}
        {label}
      </p>
      <p key={`sum-${index}`} className="insp-sum">
        {summary(system, key, named || key.type === 'auto')}
      </p>
    </div>
  );
};

/**
 * The key's type: six toggle buttons, three to a row, that are one stop in
 * the Tab order. Tab lands on the pressed one (the first, for a type that
 * isn't offered); Left and Right (wrapping from one row to the next), Home
 * and End move between them, and Space or Enter chooses.
 *
 * `focusgroup` does this where the browser has it (`nomemory`, so the way in
 * is always the pressed button, marked `focusgroupstart`). Elsewhere a roving
 * tabindex does the same: the stop follows focus while it is inside, so Tab
 * always leaves the group, and goes back to the pressed button after.
 *
 * The ink pill behind the pressed button is one element that slides to it.
 */
const TypeSwitch = ({ index, type }: { index: number; type: Key['type'] }) => {
  const edit = useSetAtom(editAtom);
  const [focused, setFocused] = useState<EditableKeyType | null>(null);
  const at = TYPES.indexOf(type as EditableKeyType);
  const pressed = TYPES[at] ?? 'unassigned';
  const stop = focused ?? pressed;
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const buttons = [...e.currentTarget.querySelectorAll<HTMLElement>('button')];
    const from = buttons.indexOf(e.target as HTMLElement);
    if (from < 0) return;
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key];
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? buttons.length - 1
          : step === undefined
            ? undefined
            : (from + step + buttons.length) % buttons.length;
    if (next === undefined) return;
    e.preventDefault();
    buttons[next]?.focus();
  };
  return (
    <XStack
      className="insp-type"
      role="group"
      aria-label={`Key ${index + 1} type`}
      {...({ focusgroup: 'toolbar wrap nomemory' } as Record<string, string>)}
      {...(NATIVE_FOCUSGROUP
        ? {}
        : {
            onKeyDown,
            onBlur: (e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(null);
            },
          })}
    >
      <span
        className="insp-pill"
        aria-hidden="true"
        data-off={at < 0 ? '' : undefined}
        style={
          {
            '--insp-col': Math.max(at, 0) % TYPE_COLUMNS,
            '--insp-row': Math.floor(Math.max(at, 0) / TYPE_COLUMNS),
          } as CSSProperties
        }
      />
      {TYPES.map((t) => (
        <Action
          key={t}
          className="insp-seg"
          kind="ghost"
          aria-pressed={type === t}
          {...(NATIVE_FOCUSGROUP
            ? ((t === pressed ? { focusgroupstart: '' } : {}) as Record<string, string>)
            : { tabIndex: t === stop ? 0 : -1, onFocus: () => setFocused(t) })}
          onPress={() => edit((s) => setKeyType(s, index, t))}
        >
          <span>{KEY_TYPE_LABEL[t]}</span>
        </Action>
      ))}
    </XStack>
  );
};

/** A label, an optional hint beside it, the control, then its problem. */
const Field = ({
  label,
  htmlFor,
  hint,
  hintId,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  hintId?: string;
  error: ReactNode;
  children: ReactNode;
}) => (
  <div className="insp-field">
    <div className="insp-field-head">
      {htmlFor ? (
        <label className="insp-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="insp-label">{label}</span>
      )}
      {hint && <Hint {...(hintId ? { id: hintId } : {})}>{hint}</Hint>}
    </div>
    {children}
    {error}
  </div>
);

const LabelField = ({
  index,
  value,
  placeholder,
  hint,
}: {
  index: number;
  value: string;
  placeholder: string;
  hint: string;
}) => {
  const edit = useSetAtom(editAtom);
  const id = useId();
  const path = `keys[${index}].name`;
  const { inputProps, error } = useTextFieldError(path, `${id}-hint`);
  return (
    <Field label="Label" htmlFor={id} hint={hint} hintId={`${id}-hint`} error={error}>
      <Input
        id={id}
        className="insp-input target"
        maxLength={6}
        pattern="[0-9A-Za-z ]{1,6}"
        value={value}
        placeholder={placeholder}
        onChangeText={(name) => edit((s) => setKeyName(s, index, name), path)}
        data-issue-path={path}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="done"
        {...inputProps}
      />
    </Field>
  );
};

const SpeakerIcon = ({ muted }: { readonly muted: boolean }) => (
  <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M2 6h2.5L8 3v10L4.5 10H2z" fill="currentColor" />
    <path
      d={muted ? 'M10.5 6l4 4m0-4-4 4' : 'M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6.3 6.3 0 0 1 0 9'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * Mute: a toggle button (`aria-pressed`), named "Mute" whichever way it is;
 * pressed, it's an ink pill with a crossed-out speaker.
 */
const MuteToggle = ({ index, muted }: { index: number; muted: boolean }) => {
  const edit = useSetAtom(editAtom);
  const path = `keys[${index}].muted`;
  return (
    <Action
      className="insp-mute target"
      kind="ghost"
      aria-pressed={muted}
      aria-label={`Mute key ${index + 1}`}
      data-issue-path={path}
      onPress={() => edit((s) => setKeyMuted(s, index, !muted))}
    >
      <SpeakerIcon muted={muted} />
      <span>Mute</span>
    </Action>
  );
};

const LevelField = ({ index, keyValue: key }: { index: number; keyValue: Key }) => {
  const edit = useSetAtom(editAtom);
  if (!canMute(key)) return null;
  const path = `keys[${index}].level`;
  const master = key.type === 'group';
  return (
    <div className="insp-field">
      <Fader
        title={<span className="insp-label">{master ? 'Master level' : 'Level'}</span>}
        aside={<MuteToggle index={index} muted={key.muted === true} />}
        issuePath={path}
        value={key.level}
        onChange={(level, { merge }) =>
          edit((s) => setKeyLevel(s, index, level), merge ? path : undefined)
        }
        label={`Key ${index + 1} ${master ? 'master level' : 'level'}`}
      />
      <FieldError path={path} />
    </div>
  );
};

/**
 * A channel or Aux Input key's pan, called Balance where the key plays a
 * stereo pair or the Aux Input (the ME-1's pan control is a balance there).
 * It is laid out as the level field above it, so the two tracks line up.
 */
const PanField = ({ index, keyValue: key }: { index: number; keyValue: Key }) => {
  const system = useAtomValue(systemAtom);
  const edit = useSetAtom(editAtom);
  if (!hasPan(key)) return null;
  const path = `keys[${index}].pan`;
  const balance = isBalance(system, key);
  return (
    <div className="insp-field">
      <Pan
        title={<span className="insp-label">{balance ? 'Balance' : 'Pan'}</span>}
        issuePath={path}
        value={key.pan}
        onChange={(pan, { merge }) =>
          edit((s) => setKeyPan(s, index, pan), merge ? path : undefined)
        }
        label={`Key ${index + 1} ${balance ? 'balance' : 'pan'}`}
      />
      <FieldError path={path} />
    </div>
  );
};

/** The one channel a channel key plays. It changes by picking another in the Channels panel. */
const PlaysChannel = ({
  index,
  channel,
  where,
  onGroup,
}: {
  index: number;
  channel: number;
  where: string;
  onGroup: () => void;
}) => {
  const system = useAtomValue(systemAtom);
  const id = useId();
  const path = `keys[${index}].channel`;
  const name = system.channels[channel - 1]?.name;
  return (
    <div className="insp-plays">
      <Sub id={`${id}-h`}>Channel</Sub>
      {/* biome-ignore lint/a11y/useSemanticElements: a named group of two facts, not a form's fieldset */}
      <div
        className="insp-chan"
        role="group"
        aria-labelledby={`${id}-h`}
        aria-describedby={`${id}-more`}
        tabIndex={-1}
        data-issue-path={path}
      >
        <span className="insp-sr">{spokenName(system, channel)}</span>
        <span className="insp-chip" aria-hidden="true">
          {numbersOf(system, channel, '–')}
        </span>
        <span className="insp-chan-name" data-none={name ? undefined : ''} aria-hidden="true">
          {name || 'No name'}
        </span>
      </div>
      <div id={`${id}-more`}>
        <Hint>
          {where === 'below'
            ? 'Pick another channel below to change it.'
            : 'Press another channel’s number in Channels to change it.'}
        </Hint>
        <FieldError path={path} />
      </div>
      <Action kind="subtle" className="insp-make target" onPress={onGroup}>
        Make it a group
      </Action>
    </div>
  );
};

/** A group's channels, each with its level in the group and a way out of it. */
const PlaysGroup = ({
  index,
  keyValue: key,
  where,
}: {
  index: number;
  keyValue: Key;
  where: string;
}) => {
  const system = useAtomValue(systemAtom);
  const edit = useSetAtom(editAtom);
  const root = useRef<HTMLDivElement>(null);
  /** The row a channel was just removed from with its button, to keep focus in the list. */
  const removedAt = useRef<number | null>(null);
  const members = key.type === 'group' ? key.members : [];
  const n = index + 1;

  // Runs after every render: a removal's row is gone by then.
  useEffect(() => {
    const at = removedAt.current;
    if (at === null) return;
    removedAt.current = null;
    const list = root.current;
    const buttons = list?.querySelectorAll<HTMLElement>('[data-insp-remove]') ?? [];
    (buttons[Math.min(at, buttons.length - 1)] ?? list)?.focus();
  });

  return (
    // biome-ignore lint/a11y/useSemanticElements: a named group of rows, not a form's fieldset
    <div
      className="insp-plays"
      ref={root}
      tabIndex={-1}
      role="group"
      aria-label={`Key ${n} channels`}
    >
      <div className="insp-field-head">
        <Sub>
          Channels
          {members.length > 0 && <small>{` · ${members.length}`}</small>}
        </Sub>
      </div>
      {members.length > 0 && where !== 'below' && (
        <p className="insp-hint insp-cue-line" data-cue="">
          Press a number in Channels to add or remove one.
        </p>
      )}
      {members.length === 0 ? (
        <div className="insp-invite" data-key="" data-cue={where === 'below' ? undefined : ''}>
          {where === 'below' ? (
            <>
              <span className="insp-invite-mark" aria-hidden="true">
                +
              </span>
              <p className="insp-copy">
                <strong>No channels yet.</strong> Pick channels below to add them to this group.
                Each gets its own level here.
              </p>
            </>
          ) : (
            <>
              <CueArrow />
              <p className="insp-copy">
                <strong>No channels yet.</strong> {PICK_CUE} Each gets its own level here.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="insp-members-head" aria-hidden="true">
            <span className="insp-hint">Level, with pan below</span>
          </div>
          {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops the list role from a list without markers */}
          <ul className="insp-members" role="list">
            {members.map((m, j) => {
              const name = system.channels[m.channel - 1]?.name;
              const numbers = numbersOf(system, m.channel);
              const spoken = spokenName(system, m.channel);
              const stereo = isStereo(system, pickTarget(system, m.channel));
              const path = `keys[${index}].members[${j}]`;
              // An unnamed channel's number is its name; only a pair's second number is left to add.
              const more = name ? numbers : numbers.slice(String(m.channel).length);
              return (
                <li key={m.channel} className="insp-row" data-issue-path={path}>
                  <span className="insp-sr">{spoken}</span>
                  <span
                    className="insp-row-name"
                    data-none={name ? undefined : ''}
                    aria-hidden="true"
                  >
                    {name || `Ch ${m.channel}`}
                  </span>
                  <span className="insp-row-meta" aria-hidden="true">
                    {more && <span>{more}</span>}
                    {stereo && <span>Balance</span>}
                  </span>
                  <div className="insp-row-level">
                    <Fader
                      variant="row"
                      issuePath={`${path}.level`}
                      value={m.level}
                      onChange={(level, { merge }) =>
                        edit(
                          (s) => setMemberLevel(s, index, m.channel, level),
                          merge ? `${path}.level` : undefined,
                        )
                      }
                      label={`${spoken} level in key ${n}`}
                    />
                  </div>
                  <div className="insp-row-pan">
                    <Pan
                      variant="row"
                      issuePath={`${path}.pan`}
                      value={m.pan}
                      onChange={(pan, { merge }) =>
                        edit(
                          (s) => setMemberPan(s, index, m.channel, pan),
                          merge ? `${path}.pan` : undefined,
                        )
                      }
                      label={`${spoken} ${stereo ? 'balance' : 'pan'} in key ${n}`}
                    />
                  </div>
                  <Action
                    className="insp-remove"
                    kind="ghost"
                    data-insp-remove
                    // Where the Problems list lands for a problem with the channel itself.
                    data-issue-focus
                    aria-label={`Remove ${spoken} from key ${n}`}
                    onPress={() => {
                      removedAt.current = j;
                      edit((s) => toggleMember(s, index, m.channel));
                    }}
                  >
                    <span aria-hidden="true">✕</span>
                  </Action>
                  <div className="insp-row-error">
                    <FieldError path={path} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
};

/**
 * The selected key's editor, a card in the key's colour: its label as the
 * ME-1 shows it, its type, and by type its label, level and then what it
 * plays, in that order for every type. Channels are picked in the Channels
 * panel; this shows the result and holds the rest.
 *
 * In the phone's key sheet the channel picker comes inside the card, after
 * the rest (`picker`), the hero stays at the top while the sheet scrolls,
 * and it has a Done button (`onClose`).
 */
export const Inspector = ({
  picker,
  onClose,
}: {
  readonly picker?: ReactNode;
  readonly onClose?: () => void;
} = {}) => {
  const system = useAtomValue(systemAtom);
  const edit = useSetAtom(editAtom);
  const [index, setIndex] = useAtom(selectedKeyAtom);
  const body = useRef<HTMLDivElement>(null);
  /** Set when an action replaces itself with the type switch's state, to send focus there. */
  const focusType = useRef(false);
  const key = system.keys[index];
  const type = key?.type;

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the type changes
  useEffect(() => {
    if (!focusType.current) return;
    focusType.current = false;
    body.current?.querySelector<HTMLElement>('.insp-type [aria-pressed="true"]')?.focus();
  }, [type]);

  if (!key) return null;
  const n = index + 1;
  const where = picker ? 'below' : 'in Channels';

  return (
    <Card
      className="insp"
      render="section"
      aria-label={`Key ${n}`}
      data-issue-path={`keys[${index}]`}
      // An empty or unknown key has no colour; nothing inside it asks for one.
      {...(key.type === 'unassigned' || key.type === 'unknown' ? {} : { style: keyStyle(index) })}
    >
      <style href="insp" precedence="default">
        {CSS}
      </style>
      <Hero system={system} index={index} onStep={setIndex} onClose={onClose} />

      <div className="insp-body" ref={body}>
        <TypeSwitch index={index} type={key.type} />

        {key.type === 'unassigned' && (
          <div className="insp-plays">
            {picker ? (
              <div className="insp-invite">
                <p className="insp-copy">
                  This key is empty. Pick a channel below to give it one, or choose a type.
                </p>
              </div>
            ) : (
              <div className="insp-invite" data-cue="">
                <CueArrow />
                <p className="insp-copy">
                  <strong>{PICK_CUE}</strong> Or choose a type.
                </p>
              </div>
            )}
          </div>
        )}

        {key.type === 'unknown' && (
          <div className="insp-plays">
            <Theme name="red">
              <XStack
                gap="2"
                p="3"
                rounded={16}
                bg="color-1"
                borderWidth={1.5}
                borderColor="color-6"
              >
                <SizableText size="sm" color="color-9" pt="0.5" shrink={0}>
                  <WarningIcon />
                </SizableText>
                <SizableText size="sm" color="color-11">
                  A source or setting this editor doesn’t know yet; it’s kept as-is. Choose a type
                  to reset it.
                </SizableText>
              </XStack>
            </Theme>
            <FieldError path={`keys[${index}]`} />
          </div>
        )}

        {canMute(key) && (
          <div key={`fields-${index}`} className="insp-fields">
            {key.type !== 'auto' && (
              <LabelField
                index={index}
                value={key.name ?? ''}
                placeholder={
                  key.type === 'channel'
                    ? system.channels[key.channel - 1]?.name || String(key.channel)
                    : KEY_TYPE_LABEL[key.type]
                }
                hint={
                  key.type === 'channel'
                    ? 'Leave empty to show the channel name'
                    : 'Up to 6 letters, numbers or spaces'
                }
              />
            )}
            <LevelField index={index} keyValue={key} />
            <PanField index={index} keyValue={key} />
          </div>
        )}

        {key.type === 'auto' && (
          <div className="insp-plays">
            <Sub>Source</Sub>
            <p className="insp-copy">
              Auto takes the first channel that no other key or group uses.
            </p>
          </div>
        )}

        {key.type === 'aux' && (
          <div className="insp-plays">
            <Sub>Source</Sub>
            <p className="insp-copy">
              The ME-1’s Aux Input, the stereo socket on its back panel, for a click or a player. It
              takes no channels.
            </p>
          </div>
        )}

        {key.type === 'tone' && (
          <div className="insp-plays">
            <Sub>Source</Sub>
            <p className="insp-copy">
              A 1 kHz test tone from the ME-1 itself, for checking the outputs. It takes no
              channels.
            </p>
          </div>
        )}

        {key.type === 'channel' && (
          <PlaysChannel
            index={index}
            channel={key.channel}
            where={where}
            onGroup={() => {
              focusType.current = true;
              edit((s) => setKeyType(s, index, 'group'));
            }}
          />
        )}

        {key.type === 'group' && (
          <PlaysGroup key={`plays-${index}`} index={index} keyValue={key} where={where} />
        )}
      </div>
      {picker}
    </Card>
  );
};
