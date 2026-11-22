import {
  LEVEL_MAX,
  LEVEL_MIN,
  type Level,
  PAN_CENTRE,
  PAN_MAX,
  PAN_MIN,
} from '@mcmillan/me1-mate-core';
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Input, type TamaguiElement } from 'tamagui';
import { panSpoken, panText } from '../lib/edit.ts';
import { Action } from './ui.tsx';

/**
 * Where a slider sits. `field` is a field of its own in the inspector: a head
 * row (its label, and an action at the far end), the track with its value
 * beside it, and a scale under the track. `row` is a group member's line: the
 * track and its value only, so a level and a pan stacked in one row line up.
 */
export type SliderVariant = 'field' | 'row';

export interface FaderProps {
  readonly value: Level | undefined;
  /**
   * The user changed the level. `merge` says whether it was one of a run of
   * small steps (arrow keys, the typed readout), which undo together; a drag
   * or a click on the track is one change, made once, and undoes by itself.
   */
  readonly onChange: (level: Level, how: { readonly merge: boolean }) => void;
  /** Accessible name, e.g. "Key 3 level". */
  readonly label: string;
  readonly variant?: SliderVariant;
  /** The field's label, at the start of the head row (`field` only). */
  readonly title?: ReactNode;
  /** An action at the end of the head row, such as Mute (`field` only). */
  readonly aside?: ReactNode;
  /** The core's issue path for the level, set on the track and its readout. */
  readonly issuePath?: string;
}

/**
 * The fader law: travel position (0 at the left, 1 at the right) against level
 * in dB, as piecewise-linear segments between these points. `off` sits at 0;
 * the long tail from `off` through LEVEL_MIN to -40 dB gets the first fifth of
 * the travel, and -40 dB to the top gets the rest, with 0 dB at 78% like a
 * mixer. The top is LEVEL_MAX, the most an ME-1 saves (+9.62 dB on the
 * core's scale, the guide's +10), so the fader never writes a level the
 * hardware wouldn't.
 */
const LAW: readonly (readonly [position: number, db: number])[] = [
  [0.03, LEVEL_MIN],
  [0.1, -60],
  [0.2, -40],
  [0.42, -20],
  [0.6, -10],
  [0.78, 0],
  [1, LEVEL_MAX],
];

/** Below this position a drag or click means off. */
const OFF_BELOW = 0.015;

const clamp = (db: number) => Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, db));

/** The law's segments, each from one point to the next. */
const SEGMENTS = LAW.slice(1).map((end, i) => [LAW[i] ?? end, end] as const);

/** Where a level sits on the fader's travel, 0…1; also drives the level meters on the key tiles. */
export const levelPosition = (level: Level): number => {
  if (level === 'off') return 0;
  const db = clamp(level);
  for (const [[p0, d0], [p1, d1]] of SEGMENTS) {
    if (db <= d1) return p0 + ((db - d0) / (d1 - d0)) * (p1 - p0);
  }
  return 1;
};

/** The level at a travel position, rounded to 0.1 dB. */
const fromPosition = (position: number): Level => {
  if (position < OFF_BELOW) return 'off';
  if (position <= (LAW[0]?.[0] ?? 0)) return LEVEL_MIN;
  for (const [[p0, d0], [p1, d1]] of SEGMENTS) {
    if (position <= p1) {
      const db = d0 + ((position - p0) / (p1 - p0)) * (d1 - d0);
      return clamp(Math.round(db * 10) / 10);
    }
  }
  return LEVEL_MAX;
};

/** A level to 0.1 dB with its sign, or OFF. */
const format = (level: Level): string => {
  if (level === 'off') return 'OFF';
  const text = (Math.round(level * 10) / 10).toFixed(1);
  return level > 0 && text !== '0.0' ? `+${text}` : text === '-0.0' ? '0.0' : text;
};

/** What the user typed, or undefined if it isn't a level. */
const parse = (text: string): Level | undefined => {
  const t = text.trim().toLowerCase();
  if (t === 'off' || t === '-inf' || t === '-∞') return 'off';
  const n = Number.parseFloat(t.replace(/db$/, ''));
  return Number.isFinite(n) ? clamp(n) : undefined;
};

/** The next level a key press moves to: up or down onto the next multiple of `step`. */
const stepped = (level: Level, step: number): Level => {
  if (level === 'off') return step > 0 ? LEVEL_MIN : 'off';
  if (step < 0 && level <= LEVEL_MIN) return 'off';
  const size = Math.abs(step);
  const grid =
    step > 0
      ? (Math.floor(level / size + 1e-9) + 1) * size
      : (Math.ceil(level / size - 1e-9) - 1) * size;
  return clamp(grid);
};

/** The marks under a level field's track: its two ends, and 0 dB at the tick in the track. */
const LEVEL_MARKS: readonly (readonly [at: number, label: string])[] = [
  [0, 'off'],
  [levelPosition(0), '0'],
  [1, `+${(Math.round(LEVEL_MAX * 10) / 10).toFixed(1)}`],
];

/** The marks under a pan field's track: hard left, centre at the tick, hard right. */
const PAN_MARKS: readonly (readonly [at: number, label: string])[] = [
  [0, 'L'],
  [(PAN_CENTRE - PAN_MIN) / (PAN_MAX - PAN_MIN), 'C'],
  [1, 'R'],
];

/** The thumb's diameter in px, the same on every slider: the pointer handling needs it, and the CSS takes it from here. */
const THUMB = 16;

/** The native range's integer steps across the level's travel; positions map onto these. */
const STEPS = 1000;

const stepOf = (level: Level) => Math.round(levelPosition(level) * STEPS);

/**
 * Every slider here is the same: a native range over a groove, a fill and a
 * tick that are drawn behind it, and a round ink thumb with a halo of the
 * surface colour so it reads on the fill. The range keeps its semantics,
 * focus and pointer handling. Level and pan differ only in meaning: the
 * level's fill runs from off up to the thumb and its tick marks 0 dB; the
 * pan's fill runs from the centre out to the thumb and its tick marks the
 * centre. The fill wears the key's colour (`--k`, set by whatever the slider
 * sits in), ink where there is none.
 *
 * Each sits in a line of two columns, the track and a value slot of a fixed
 * width (`--fader-out`), so sliders of either kind stacked in one container
 * share both edges and nothing moves as the value's text changes. In a field
 * the head row above has the label and an action (Mute, Centre), and a quiet
 * scale sits under the track.
 *
 * The range is as wide as the track, so the thumb's centre travels from half
 * a thumb inside one end to half a thumb inside the other; the fill, the tick
 * and the scale are placed on that same travel. It is as tall as a press
 * target (`--target`: taller for fingers).
 *
 * WebKit and Firefox pseudo-elements stay in separate rules, since a browser
 * drops a whole rule over a pseudo-element it doesn't know.
 *
 * The focus ring is drawn around the whole track (`.fader-track::after`),
 * clear of the thumb and its halo.
 *
 * Tamagui's own border and padding classes repeat themselves up to four
 * times; `&&&&` matches that where the readout and the buttons set them.
 *
 * In forced colours author backgrounds and shadows go, so the track, the fill,
 * the tick and the thumb are given system colours there.
 */
const CSS = `
.fader-root {
  --fader-thumb: ${THUMB}px; --fader-groove: 6px; --fader-halo: 2px;
  --fader-fill: var(--k, var(--ink));
  --fader-hit: max(calc(var(--fader-thumb) + 2 * var(--fader-halo)), var(--target, 24px));
  --fader-span: calc(100% - var(--fader-thumb));
  --fader-out: 5.375rem;
  display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 2px; inline-size: 100%;
}
.fader-root[data-variant="row"] { --fader-out: 3.5rem; }

/* The head: the label at the start, an action at the end, both on one line. */
.fader-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  min-block-size: max(28px, var(--target, 24px));
}
.fader-line {
  display: grid; grid-template-columns: minmax(0, 1fr) var(--fader-out); column-gap: 8px; align-items: start;
}
.fader-travel { min-inline-size: 0; }
.fader-track { position: relative; block-size: var(--fader-hit); }
.fader-groove, .fader-fill, .fader-tick {
  position: absolute; inset-block-start: calc(50% - var(--fader-groove) / 2);
  block-size: var(--fader-groove); border-radius: 999px; pointer-events: none;
}
/* A well with a hairline edge, so the travel still to go shows on the card in both schemes. */
.fader-groove { inset-inline: 0; background: var(--well); box-shadow: inset 0 0 0 1.5px var(--line); }
.fader-fill {
  inset-inline-start: calc(var(--fader-thumb) / 2 + var(--fader-from) * var(--fader-span));
  inline-size: calc((var(--fader-to) - var(--fader-from)) * var(--fader-span));
}
/* The level's fill starts at the groove's end, so off is an empty groove and the lowest level a sliver. */
.fader-fill[data-from-end] {
  inset-inline-start: 0; inline-size: calc(var(--fader-thumb) / 2 + var(--fader-to) * var(--fader-span));
}
.fader-fill { background: var(--fader-fill); }
/* 0 dB on a level, the centre on a pan: a tick through the groove that shows through the fill as well. */
.fader-tick {
  inset-block-start: calc(50% - var(--fader-groove) / 2 - 3px); block-size: calc(var(--fader-groove) + 6px);
  inset-inline-start: calc(var(--fader-thumb) / 2 + var(--fader-tick-at) * var(--fader-span) - 1px);
  inline-size: 2px; border-radius: 1px; background: color-mix(in oklab, var(--ink) 40%, transparent);
}
.fader {
  -webkit-appearance: none; appearance: none; position: absolute;
  inset-block-start: 0; inset-inline: 0; inline-size: 100%; block-size: var(--fader-hit);
  margin: 0; padding: 0; border: 0; border-radius: 999px; background: transparent;
  cursor: pointer; touch-action: pan-y;
}
.fader:focus-visible { outline: none; }
.fader-track::after {
  content: ""; position: absolute; border-radius: 999px; pointer-events: none;
  inset-block: calc((var(--fader-hit) - var(--fader-thumb)) / 2 - var(--fader-halo) - 1px);
  inset-inline: -4px;
}
.fader-track:has(> .fader:focus-visible)::after { outline: 3px solid var(--focus); }
.fader::-webkit-slider-runnable-track { block-size: 100%; border: 0; background: transparent; }
.fader::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; box-sizing: border-box;
  inline-size: var(--fader-thumb); block-size: var(--fader-thumb);
  margin-block-start: calc((var(--fader-hit) - var(--fader-thumb)) / 2);
  border: 0; border-radius: 50%; background: var(--ink);
  box-shadow: 0 0 0 var(--fader-halo) var(--card);
}
.fader::-moz-range-track { block-size: 100%; border: 0; background: transparent; }
.fader::-moz-range-thumb {
  box-sizing: border-box; inline-size: var(--fader-thumb); block-size: var(--fader-thumb);
  border: 0; border-radius: 50%; background: var(--ink);
  box-shadow: 0 0 0 var(--fader-halo) var(--card);
}

/*
 * The scale: one quiet row, each mark centred on its place in the travel, the
 * ends flush with the track's. Figures here and in the readouts are tabular
 * but plain: the page's slashed zero looks typewritten at this size.
 */
.fader-scale, .fader-root .fader-readout, .fader-pan-out { font-feature-settings: "tnum"; }
.fader-scale {
  display: grid; margin-inline: calc(var(--fader-thumb) / 2);
  font-size: 0.6875rem; font-weight: var(--w-text); line-height: 1.2; color: var(--muted);
  user-select: none; -webkit-user-select: none;
}
.fader-mark {
  grid-area: 1 / 1; justify-self: start; white-space: nowrap;
  margin-inline-start: calc(var(--fader-mark-at) * 100%); translate: -50% 0;
}
.fader-mark:dir(rtl) { translate: 50% 0; }
.fader-mark:first-child { translate: calc(var(--fader-thumb) / -2) 0; }
.fader-mark:last-child { translate: calc(var(--fader-thumb) / 2 - 100%) 0; }
.fader-mark:first-child:dir(rtl) { translate: calc(var(--fader-thumb) / 2) 0; }
.fader-mark:last-child:dir(rtl) { translate: calc(100% - var(--fader-thumb) / 2) 0; }

/*
 * The value slot, a fixed width at the end of the line: the level typed in a
 * field that shows it's a field when pointed at or focused, with its unit in
 * a field; the pan's steps from the centre. Both end at the slot's end.
 */
.fader-out {
  display: flex; align-items: center; justify-content: flex-end; gap: 4px;
  min-inline-size: 0; block-size: var(--fader-hit);
}
.fader-root .fader-readout {
  flex: 1 1 0; min-inline-size: 0; block-size: max(26px, var(--target, 24px)); min-block-size: 0;
  border-radius: 8px; background: transparent; color: var(--ink);
  font-size: 0.8125rem; font-weight: var(--w-ui); line-height: 1.2; text-align: end;
  &&&& { padding: 0 3px 0 4px; border: 1.5px solid transparent; }
  &&&&:hover { border-color: var(--line); }
}
.fader-root .fader-readout:hover { background: var(--well); }
.fader-root .fader-readout:focus { background: var(--well); }
.fader-root .fader-readout:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; }
.fader-unit { flex: none; font-size: 0.75rem; font-weight: var(--w-text); color: var(--muted); }
/* The pan's value, set to end where the level's figures end above it (the level's unit is beside them). */
.fader-pan-out {
  font-size: 0.8125rem; font-weight: var(--w-ui); line-height: 1.2; text-align: end; color: var(--ink);
  white-space: nowrap; user-select: none; -webkit-user-select: none;
}
.fader-root[data-variant="field"] .fader-pan-out { padding-inline-end: calc(1.5ch + 9px); }

/*
 * Centre, in a pan field's head: a small outlined pill like Mute in the level's.
 * In a member's line the value itself is the button. At the centre already
 * there is nothing to do: the pill fades, the value is just a quiet C.
 */
.fader-root .fader-centre {
  flex: none; inline-size: auto; block-size: max(28px, var(--target, 24px)); min-block-size: 0;
  border-radius: 999px; background: transparent; color: var(--ink); opacity: 1;
  font-size: 0.75rem; font-weight: var(--w-ui); line-height: 1;
  &&&& { padding: 0 11px; border: 1.5px solid var(--line); }
}
.fader-root .fader-centre-out {
  flex: 1 1 0; min-inline-size: 0; block-size: max(26px, var(--target, 24px)); min-block-size: 0;
  justify-content: flex-end; border-radius: 8px; background: transparent; color: var(--ink); opacity: 1;
  &&&& { padding: 0 4px; border: 0; }
}
.fader-root :is(.fader-centre, .fader-centre-out):focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; }
@media (hover: hover) {
  .fader-root :is(.fader-centre, .fader-centre-out):not([aria-disabled="true"]):hover {
    background: color-mix(in oklab, var(--ink) 8%, transparent);
  }
}
.fader-root .fader-centre[aria-disabled="true"] { color: var(--muted); cursor: default; &&&& { border-color: color-mix(in oklab, var(--line) 60%, transparent); } }
.fader-root .fader-centre-out[aria-disabled="true"] { cursor: default; }
.fader-root .fader-centre-out[aria-disabled="true"] .fader-pan-out { color: var(--muted); }
@media (forced-colors: active) {
  .fader-root .fader-centre[aria-disabled="true"] { color: GrayText; }
}

/* The thumb grows under the pointer and again while it's held; where motion is reduced it gains a ring instead. */
@media (prefers-reduced-motion: no-preference) {
  .fader-fill { transition: background-color 240ms ease-out; }
  .fader-readout { transition: background-color 120ms ease-out, border-color 120ms ease-out; }
  .fader::-webkit-slider-thumb { transition: scale 160ms ease-out; }
  .fader::-moz-range-thumb { transition: scale 160ms ease-out; }
  .fader:hover::-webkit-slider-thumb { scale: 1.12; }
  .fader:active::-webkit-slider-thumb { scale: 1.24; }
  .fader:hover::-moz-range-thumb { scale: 1.12; }
  .fader:active::-moz-range-thumb { scale: 1.24; }
}
@media (prefers-reduced-motion: reduce) {
  .fader:hover::-webkit-slider-thumb { box-shadow: 0 0 0 var(--fader-halo) var(--card), 0 0 0 calc(var(--fader-halo) + 2px) var(--muted); }
  .fader:active::-webkit-slider-thumb { box-shadow: 0 0 0 var(--fader-halo) var(--card), 0 0 0 calc(var(--fader-halo) + 2px) var(--ink); }
  .fader:hover::-moz-range-thumb { box-shadow: 0 0 0 var(--fader-halo) var(--card), 0 0 0 calc(var(--fader-halo) + 2px) var(--muted); }
  .fader:active::-moz-range-thumb { box-shadow: 0 0 0 var(--fader-halo) var(--card), 0 0 0 calc(var(--fader-halo) + 2px) var(--ink); }
}
@media (prefers-contrast: more) {
  .fader-groove { box-shadow: inset 0 0 0 1.5px var(--muted); }
  .fader-root .fader-readout { &&&& { border-color: var(--muted); } }
}
@media (forced-colors: active) {
  .fader-groove { background: Canvas; border: 1px solid CanvasText; }
  .fader-fill { background: Highlight; }
  .fader-tick { background: CanvasText; }
  .fader::-webkit-slider-thumb { background: ButtonText; border: 2px solid Canvas; }
  .fader::-moz-range-thumb { background: ButtonText; border: 2px solid Canvas; }
  .fader-track:has(> .fader:focus-visible)::after { outline-color: Highlight; }
}
`;

interface RangeOptions<T> {
  /** The stored value; `onChange` is called only with a different one. */
  readonly value: T;
  readonly onChange: (next: T, merge: boolean) => void;
  /** The range's `min` and `max`. */
  readonly min: number;
  readonly max: number;
  /** The range's integer step for a value, and back. */
  readonly toStep: (value: T) => number;
  readonly fromStep: (step: number) => T;
  /** Where a double-click on the thumb puts it. */
  readonly snap: T;
  /** The value assistive tech means when it moves the range to `step` without a pointer. */
  readonly assisted: (step: number) => T;
}

/**
 * The pointer and change handling a slider's native range shares: a press on
 * the thumb has to travel a few pixels before it moves anything, so a click
 * on it never nudges the value; a press on the track jumps there; a drag
 * commits once, on release; a double-click on the thumb snaps it. The range
 * is uncontrolled so React never echoes its value back as a change; `shown`
 * is the value being dragged, or the stored one.
 */
const useRange = <T,>(o: RangeOptions<T>) => {
  const input = useRef<HTMLInputElement>(null);
  /** The pointer press in progress; `armed` once it has really moved the slider. */
  const press = useRef<{ startX: number; armed: boolean } | null>(null);
  const lastThumbDown = useRef(0);
  const [drag, setDragState] = useState<{ value: T } | null>(null);
  const dragged = useRef<{ value: T } | null>(null);
  const opts = useRef(o);
  opts.current = o;

  const sync = () => {
    const { toStep, value } = opts.current;
    if (input.current) input.current.value = String(toStep(dragged.current?.value ?? value));
  };
  useLayoutEffect(sync);

  const change = (next: T, merge: boolean) => {
    if (next !== opts.current.value) opts.current.onChange(next, merge);
  };
  const setDrag = (next: { value: T } | null) => {
    dragged.current = next;
    setDragState(next);
  };

  const onPointerDown = (e: PointerEvent<HTMLInputElement>) => {
    if (e.button !== 0) return;
    const { min, max, toStep, value, snap } = opts.current;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const thumbX =
      rect.left + THUMB / 2 + ((toStep(value) - min) / (max - min)) * (rect.width - THUMB);
    const onThumb = Math.abs(e.clientX - thumbX) <= THUMB / 2 + 2;
    if (onThumb && e.timeStamp - lastThumbDown.current < 400) {
      lastThumbDown.current = 0;
      e.preventDefault();
      el.focus();
      press.current = null;
      change(snap, false);
      return;
    }
    lastThumbDown.current = onThumb ? e.timeStamp : 0;
    press.current = { startX: e.clientX, armed: !onThumb };
  };

  const onPointerMove = (e: PointerEvent<HTMLInputElement>) => {
    const p = press.current;
    if (p && !p.armed && Math.abs(e.clientX - p.startX) >= 3) p.armed = true;
  };

  const endPress = () => {
    // The range's change event follows pointerup; let it commit first.
    window.setTimeout(() => {
      press.current = null;
      setDrag(null);
      sync();
    });
  };

  const onInput = () => {
    const el = input.current;
    if (!el || !press.current) return; // Not a pointer: wait for the change event.
    if (!press.current.armed) sync();
    else setDrag({ value: opts.current.fromStep(el.valueAsNumber) });
  };

  // The native change event (React's onChange is the input event): a drag
  // commits once here, on release. Without a pointer it's assistive tech
  // stepping the range.
  const onCommit = useRef(() => {});
  onCommit.current = () => {
    const el = input.current;
    if (!el) return;
    if (press.current) {
      if (dragged.current !== null) change(dragged.current.value, false);
      return;
    }
    change(opts.current.assisted(el.valueAsNumber), true);
    sync();
  };
  useEffect(() => {
    const el = input.current;
    const listener = () => onCommit.current();
    el?.addEventListener('change', listener);
    return () => el?.removeEventListener('change', listener);
  }, []);

  return {
    input,
    change,
    shown: drag ? drag.value : o.value,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPress,
      onPointerCancel: endPress,
      onInput,
    },
  };
};

const Style = () => (
  <style href="fader" precedence="default">
    {CSS}
  </style>
);

const Scale = ({ marks }: { marks: readonly (readonly [at: number, label: string])[] }) => (
  <div className="fader-scale" aria-hidden="true">
    {marks.map(([at, mark]) => (
      <span key={mark} className="fader-mark" style={{ '--fader-mark-at': at } as CSSProperties}>
        {mark}
      </span>
    ))}
  </div>
);

const Head = ({ title, aside }: { title?: ReactNode; aside?: ReactNode }) =>
  title || aside ? (
    <div className="fader-head">
      {title ?? <span />}
      {aside}
    </div>
  ) : null;

/**
 * A horizontal level fader: off at the far left, 0 dB at the tick, the most
 * an ME-1 saves (+9.6 dB) at the right, on a law that gives -40 dB and up most
 * of the travel. It is a native range input over integer steps of the travel:
 * drag or click the track, use the arrow keys (0.5 dB, 3 dB with Shift or
 * Page Up/Down; Home is off, End the top, 0 the tick), double-click the thumb
 * for 0 dB, or type into the readout, whose value is selected when it takes
 * focus. `onChange` fires only when the user changes the level, so focusing
 * or tabbing through never rounds a stored value.
 */
export const Fader = ({
  value,
  onChange,
  label,
  variant = 'field',
  title,
  aside,
  issuePath,
}: FaderProps) => {
  const level: Level = value ?? 0;
  const { input, change, shown, handlers } = useRange<Level>({
    value: level,
    onChange: (next, merge) => onChange(next, { merge }),
    min: 0,
    max: STEPS,
    toStep: stepOf,
    fromStep: (step) => fromPosition(step / STEPS),
    snap: 0,
    assisted: (step) => {
      const direction = Math.sign(step - stepOf(level));
      return direction === 0 ? level : stepped(level, direction * 0.5);
    },
  });

  const [text, setText] = useState(format(level));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(format(shown));
  }, [shown, editing]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const big = e.shiftKey ? 3 : 0.5;
    const next: Level | undefined = (() => {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          return stepped(level, big);
        case 'ArrowLeft':
        case 'ArrowDown':
          return stepped(level, -big);
        case 'PageUp':
          return stepped(level, 3);
        case 'PageDown':
          return stepped(level, -3);
        case 'Home':
          return 'off';
        case 'End':
          return LEVEL_MAX;
        case '0':
          return 0;
        default:
          return undefined;
      }
    })();
    if (next === undefined) return;
    e.preventDefault();
    change(next, true);
  };

  const commitText = () => {
    setEditing(false);
    if (text === format(level)) return;
    const next = parse(text);
    if (next === undefined) setText(format(level));
    else {
      change(next, true);
      setText(format(next));
    }
  };

  // A press that puts focus in the readout selects its value, as tabbing to it
  // does, so typing replaces the level; a press once it has focus places the caret.
  const selectOnClick = useRef(false);
  const field = variant === 'field';

  return (
    <div
      className="fader-root"
      data-variant={variant}
      style={
        {
          '--fader-from': 0,
          '--fader-to': levelPosition(shown),
          '--fader-tick-at': levelPosition(0),
        } as CSSProperties
      }
    >
      <Style />
      {field && <Head title={title} aside={aside} />}
      <div className="fader-line" data-issue-path={issuePath}>
        <div className="fader-travel">
          <div className="fader-track">
            <span className="fader-groove" />
            <span className="fader-fill" data-from-end="" />
            <span className="fader-tick" />
            <input
              ref={input}
              type="range"
              className="fader"
              min={0}
              max={STEPS}
              step={1}
              defaultValue={stepOf(level)}
              aria-label={label}
              aria-valuetext={shown === 'off' ? 'Off' : `${format(shown)} dB`}
              onKeyDown={onKeyDown}
              {...handlers}
            />
          </div>
          {field && <Scale marks={LEVEL_MARKS} />}
        </div>
        <div className="fader-out">
          <Input
            className="fader-readout"
            autoComplete="off"
            enterKeyHint="done"
            aria-label={`${label} in dB`}
            value={text}
            onFocus={() => setEditing(true)}
            onPointerDown={(e) => {
              selectOnClick.current = document.activeElement !== e.currentTarget;
            }}
            onClick={(e) => {
              if (!selectOnClick.current) return;
              selectOnClick.current = false;
              const el = e.currentTarget as unknown as HTMLInputElement;
              // Unless the press dragged out a selection of its own.
              if (el.selectionStart === el.selectionEnd) el.select();
            }}
            onChangeText={(t) => {
              setEditing(true);
              setText(t);
            }}
            onBlur={commitText}
            onSubmitEditing={commitText}
            onKeyPress={(e) => {
              if (e.nativeEvent.key === 'Escape') {
                setText(format(level));
                setEditing(false);
              }
            }}
          />
          {field && (
            <span className="fader-unit" aria-hidden="true">
              dB
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export interface PanProps {
  /** The ME-1's pan step, PAN_MIN…PAN_MAX; absent is centre. */
  readonly value: number | undefined;
  /** The user changed the pan; `merge` as for the level fader (keys merge, a drag doesn't). */
  readonly onChange: (pan: number, how: { readonly merge: boolean }) => void;
  /** Accessible name, e.g. "Key 3 pan" or "Key 3 balance". */
  readonly label: string;
  readonly variant?: SliderVariant;
  /** The field's label, at the start of the head row (`field` only). */
  readonly title?: ReactNode;
  /** The core's issue path for the pan, set on the track and its value. */
  readonly issuePath?: string;
}

/**
 * A button that stays focusable with nothing to do, so pressing it doesn't
 * drop focus. Tamagui's Button writes aria-disabled from its own `disabled`,
 * which would take it out of reach; the attribute is set on the element.
 */
const useAriaDisabled = (off: boolean) => {
  const ref = useRef<TamaguiElement>(null);
  useEffect(() => {
    (ref.current as unknown as HTMLElement | null)?.setAttribute('aria-disabled', String(off));
  }, [off]);
  return ref;
};

/**
 * A pan (or balance) control, the same slider as the level fader: a native
 * range over the ME-1's own steps, hard left at PAN_MIN, centre at the tick,
 * hard right at PAN_MAX, its fill from the centre out to the thumb. Its value
 * counts steps from the centre (`L 12`, `C`, `R 30`; see `panText`). The
 * arrow keys move a step and Page Up/Down, Home and End do as a range does; a
 * double-click on the thumb, `C` or `0` on the keyboard, or Centre centres
 * it. In a field Centre is a pill in the head; in a member's line the value
 * is the button.
 */
export const Pan = ({ value, onChange, label, variant = 'field', title, issuePath }: PanProps) => {
  const pan = value ?? PAN_CENTRE;
  const { input, change, shown, handlers } = useRange<number>({
    value: pan,
    onChange: (next, merge) => onChange(next, { merge }),
    min: PAN_MIN,
    max: PAN_MAX,
    toStep: (p) => p,
    fromStep: (step) => step,
    snap: PAN_CENTRE,
    assisted: (step) => step,
  });
  const span = PAN_MAX - PAN_MIN;
  const at = (shown - PAN_MIN) / span;
  const mid = (PAN_CENTRE - PAN_MIN) / span;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'c' || e.key === 'C' || e.key === '0') {
      e.preventDefault();
      change(PAN_CENTRE, true);
    }
  };

  const centred = pan === PAN_CENTRE;
  const centre = useAriaDisabled(centred);
  const field = variant === 'field';
  const name = `Centre ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  const onCentre = () => {
    if (!centred) change(PAN_CENTRE, false);
  };
  const readout = (
    <span className="fader-pan-out" aria-hidden={field ? 'true' : undefined}>
      {panText(shown)}
    </span>
  );

  return (
    <div
      className="fader-root"
      data-variant={variant}
      data-pan=""
      style={
        {
          '--fader-from': Math.min(at, mid),
          '--fader-to': Math.max(at, mid),
          '--fader-tick-at': mid,
        } as CSSProperties
      }
    >
      <Style />
      {field && (
        <Head
          title={title}
          aside={
            <Action
              ref={centre}
              className="fader-centre target"
              kind="ghost"
              aria-label={name}
              onPress={onCentre}
            >
              <span>Centre</span>
            </Action>
          }
        />
      )}
      <div className="fader-line" data-issue-path={issuePath}>
        <div className="fader-travel">
          <div className="fader-track">
            <span className="fader-groove" />
            <span className="fader-fill" />
            <span className="fader-tick" />
            <input
              ref={input}
              type="range"
              className="fader"
              min={PAN_MIN}
              max={PAN_MAX}
              step={1}
              defaultValue={pan}
              aria-label={label}
              aria-valuetext={panSpoken(shown)}
              onKeyDown={onKeyDown}
              {...handlers}
            />
          </div>
          {field && <Scale marks={PAN_MARKS} />}
        </div>
        <div className="fader-out">
          {field ? (
            readout
          ) : (
            // The name keeps the value it shows, so a voice user can say what they see.
            <Action
              ref={centre}
              className="fader-centre-out"
              kind="ghost"
              aria-label={`${name}, now ${panText(pan)}`}
              onPress={onCentre}
            >
              {readout}
            </Action>
          )}
        </div>
      </div>
    </div>
  );
};
