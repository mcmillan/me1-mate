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
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Input, type TamaguiElement } from 'tamagui';
import { panSpoken, panText } from '../lib/edit.ts';
import { Action } from './ui.tsx';

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
  /** A thinner track and a smaller thumb, without the scale, the 0 dB notch or a unit, for group member rows. */
  readonly compact?: boolean;
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

/**
 * The marks under the full-size fader: its two ends, and 0 dB under the notch
 * in the track. The readout says the rest.
 */
const TICKS: readonly (readonly [db: Level, label: string])[] = [
  ['off', 'off'],
  [0, '0'],
  [LEVEL_MAX, `+${(Math.round(LEVEL_MAX * 10) / 10).toFixed(1)}`],
];

/** The thumb's diameter in px: the pointer handling needs it, and the CSS takes it from here. */
const THUMB = { full: 22, compact: 12 } as const;

/** The native range's integer steps across the travel; positions map onto these. */
const STEPS = 1000;

const stepOf = (level: Level) => Math.round(levelPosition(level) * STEPS);

/**
 * The native range keeps its semantics, focus and pointer handling; only its
 * track and thumb are restyled. The thick track, its fill and the 0 dB notch
 * are drawn behind it: the fill wears the key's colour (`--k`, set by
 * whatever the fader sits in) and is ink where there is none. The thumb is a
 * round ink knob with a halo of the surface colour, so it reads on the fill.
 *
 * The range is as wide as the track, so the thumb's centre travels from half
 * a thumb inside one end to half a thumb inside the other; the fill, the
 * notch and the scale are placed on that same travel. It is as tall as a
 * press target (`--target`: taller for fingers).
 *
 * WebKit and Firefox pseudo-elements stay in separate rules, since a browser
 * drops a whole rule over a pseudo-element it doesn't know.
 *
 * The focus ring is drawn around the whole track (`.fader-track::after`),
 * clear of the thumb and its halo; the scale starts below it.
 *
 * Tamagui's own border and padding classes repeat themselves up to four
 * times; `&&&&` matches that where the readout sets them.
 *
 * In forced colours author backgrounds and shadows go, so the track, the fill,
 * the notch and the thumb are given system colours there.
 */
const CSS = `
.fader-root {
  --fader-thumb: ${THUMB.full}px; --fader-groove: 10px; --fader-halo: 3px;
  --fader-fill: var(--k, var(--ink));
  --fader-hit: max(calc(var(--fader-thumb) + 2 * var(--fader-halo)), var(--target, 24px));
  --fader-span: calc(100% - var(--fader-thumb));
  display: flex; align-items: flex-start; gap: 10px; inline-size: 100%;
}
.fader-root[data-compact] {
  --fader-thumb: ${THUMB.compact}px; --fader-groove: 4px; --fader-halo: 2px;
  align-items: center; gap: 6px;
}
.fader-travel { flex: 1 1 0; min-inline-size: 120px; }
.fader-root[data-compact] .fader-travel { min-inline-size: 72px; }
.fader-track { position: relative; block-size: var(--fader-hit); }
.fader-groove, .fader-fill, .fader-zero {
  position: absolute; inset-block-start: calc(50% - var(--fader-groove) / 2);
  block-size: var(--fader-groove); border-radius: 999px; pointer-events: none;
}
/* A well with a hairline edge, so the travel still to go shows on the card in both schemes. */
.fader-groove { inset-inline: 0; background: var(--well); box-shadow: inset 0 0 0 1.5px var(--line); }
.fader-fill {
  inset-inline-start: 0; background: var(--fader-fill);
  inline-size: calc(var(--fader-thumb) / 2 + var(--fader-at) * var(--fader-span));
}
/* Where 0 dB is, on the full-size fader: a notch in the track that shows through the fill as well. */
.fader-zero {
  inset-inline-start: calc(var(--fader-thumb) / 2 + var(--fader-zero-at) * var(--fader-span) - 1px);
  inline-size: 2px; background: color-mix(in oklab, var(--ink) 34%, transparent);
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
 * ends flush with the track's. Figures here and in the readout are tabular
 * but plain: the page's slashed zero looks typewritten at this size.
 */
.fader-scale, .fader-root .fader-readout { font-feature-settings: "tnum"; }
.fader-scale {
  display: grid; margin-block-start: 3px; margin-inline: calc(var(--fader-thumb) / 2);
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

/* The level, typed: a number that shows it's a field when pointed at or focused. */
.fader-out { display: flex; align-items: center; gap: 7px; flex: none; min-block-size: var(--fader-hit); }
.fader-root .fader-readout {
  inline-size: calc(6ch + 12px); block-size: max(28px, var(--target, 24px)); min-block-size: 0;
  border-radius: 10px; background: transparent; color: var(--ink);
  font-size: 0.875rem; font-weight: var(--w-ui); line-height: 1.2; text-align: end;
  &&&& { padding: 0 3px 0 5px; border: 1.5px solid transparent; }
  &&&&:hover { border-color: var(--line); }
}
.fader-root .fader-readout:hover { background: var(--well); }
.fader-root .fader-readout:focus { background: var(--well); }
.fader-root .fader-readout:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.fader-root[data-compact] .fader-readout { font-size: 0.8125rem; block-size: max(24px, var(--target, 24px)); }
.fader-unit { font-size: 0.75rem; font-weight: var(--w-text); color: var(--muted); }

/*
 * Pan: the fill runs from the centre notch to the thumb, so centre is no fill
 * at all. The readout says L, C or R and the steps; the centre button beside
 * it is faint until the row is pointed at or holds focus (full strength where
 * there is no hover), and faded out when the pan is already centred.
 */
.fader-fill[data-pan] {
  inset-inline-start: calc(var(--fader-thumb) / 2 + var(--fader-from) * var(--fader-span));
  inline-size: calc((var(--fader-to) - var(--fader-from)) * var(--fader-span));
}
.fader-root[data-pan] .fader-travel { min-inline-size: 72px; }
.fader-pan-out {
  flex: none; inline-size: 4.25ch; font-feature-settings: "tnum";
  font-size: 0.8125rem; font-weight: var(--w-ui); line-height: 1.2; text-align: end; color: var(--ink);
  user-select: none; -webkit-user-select: none;
}
.fader-root .fader-centre {
  flex: none; inline-size: auto; block-size: max(24px, var(--target, 24px)); min-block-size: 0;
  border-radius: 999px; background: transparent; color: var(--muted); opacity: 1;
  font-size: 0.75rem; font-weight: var(--w-ui); line-height: 1;
  &&&& { padding: 0 8px; border: 0; }
}
.fader-root .fader-centre:focus-visible { outline: 3px solid var(--focus); outline-offset: 1px; }
@media (hover: hover) {
  .fader-root .fader-centre:not([aria-disabled="true"]):hover { background: var(--well); color: var(--ink); }
}
@media (hover: hover) and (prefers-contrast: no-preference) {
  .fader-root[data-pan]:not(:hover, :focus-within) .fader-centre { color: color-mix(in oklab, var(--muted) 72%, var(--card)); }
}
.fader-root .fader-centre[aria-disabled="true"] { color: color-mix(in oklab, var(--muted) 45%, var(--card)); cursor: default; }
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
  .fader-zero { background: CanvasText; }
  .fader::-webkit-slider-thumb { background: ButtonText; border: 2px solid Canvas; }
  .fader::-moz-range-thumb { background: ButtonText; border: 2px solid Canvas; }
  .fader-track:has(> .fader:focus-visible)::after { outline-color: Highlight; }
}
`;

/**
 * A horizontal level fader: off at the far left, the 0 marker, the most an
 * ME-1 saves (+9.6 dB) at the right, on a law that gives -40 dB and up most
 * of the travel. Its fill is the
 * colour of the key it sits in (`--k`), or ink outside one. It is a native
 * range input over integer steps of the travel: drag or click the track, use
 * the arrow keys (0.5 dB, 3 dB with Shift or Page Up/Down; Home is off, End
 * the top, 0 the marker), or type into the readout, whose value is selected when
 * it takes focus. `onChange` fires only when the user changes the level, so
 * focusing or tabbing through never rounds a stored value. A drag commits
 * once, on release.
 */
export const Fader = ({ value, onChange, label, compact = false }: FaderProps) => {
  const level: Level = value ?? 0;
  const thumb = compact ? THUMB.compact : THUMB.full;
  const input = useRef<HTMLInputElement>(null);
  /** The pointer press in progress; `armed` once it has really moved the fader. */
  const press = useRef<{ startX: number; armed: boolean } | null>(null);
  const lastThumbDown = useRef(0);
  const [dragLevel, setDragLevel] = useState<Level | null>(null);
  const dragged = useRef<Level | null>(null);
  const shown = dragLevel ?? level;

  const [text, setText] = useState(format(level));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(format(shown));
  }, [shown, editing]);

  // The range is uncontrolled so React never echoes its value back as a change;
  // keep it on the shown level.
  const sync = () => {
    if (input.current) input.current.value = String(stepOf(dragged.current ?? level));
  };
  useLayoutEffect(sync);

  const change = (next: Level, merge: boolean) => {
    if (next !== level) onChange(next, { merge });
  };

  const setDrag = (next: Level | null) => {
    dragged.current = next;
    setDragLevel(next);
  };

  const onPointerDown = (e: PointerEvent<HTMLInputElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const thumbX = rect.left + thumb / 2 + (stepOf(level) / STEPS) * (rect.width - thumb);
    const onThumb = Math.abs(e.clientX - thumbX) <= thumb / 2 + 2;
    if (onThumb && e.timeStamp - lastThumbDown.current < 400) {
      // A double-click on the thumb snaps to 0.
      lastThumbDown.current = 0;
      e.preventDefault();
      el.focus();
      press.current = null;
      change(0, false);
      return;
    }
    lastThumbDown.current = onThumb ? e.timeStamp : 0;
    // A press on the thumb has to travel a few pixels before it moves anything,
    // so a click on it never nudges the level; a press on the track jumps there.
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
    else setDrag(fromPosition(el.valueAsNumber / STEPS));
  };

  // The native change event (React's onChange is the input event): a drag
  // commits once here, on release. Without a pointer it's assistive tech
  // stepping the range, which moves the level as an arrow key does.
  const onCommit = useRef(() => {});
  onCommit.current = () => {
    const el = input.current;
    if (!el) return;
    if (press.current) {
      if (dragged.current !== null) change(dragged.current, false);
      return;
    }
    const direction = Math.sign(el.valueAsNumber - stepOf(level));
    if (direction !== 0) change(stepped(level, direction * 0.5), true);
    sync();
  };
  useEffect(() => {
    const el = input.current;
    const listener = () => onCommit.current();
    el?.addEventListener('change', listener);
    return () => el?.removeEventListener('change', listener);
  }, []);

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

  return (
    <div
      className="fader-root"
      data-compact={compact ? '' : undefined}
      style={
        {
          '--fader-at': levelPosition(shown),
          '--fader-zero-at': levelPosition(0),
        } as CSSProperties
      }
    >
      <style href="fader" precedence="default">
        {CSS}
      </style>
      <div className="fader-travel">
        <div className="fader-track">
          <span className="fader-groove" />
          <span className="fader-fill" />
          {compact ? null : <span className="fader-zero" />}
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
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPress}
            onPointerCancel={endPress}
            onInput={onInput}
            onKeyDown={onKeyDown}
          />
        </div>
        {compact ? null : (
          <div className="fader-scale" aria-hidden="true">
            {TICKS.map(([db, tick]) => (
              <span
                key={tick}
                className="fader-mark"
                style={{ '--fader-mark-at': levelPosition(db) } as CSSProperties}
              >
                {tick}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="fader-out">
        <Input
          className="fader-readout target"
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
        {compact ? null : (
          <span className="fader-unit" aria-hidden="true">
            dB
          </span>
        )}
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
}

/**
 * A pan (or balance) control: a native range over the ME-1's own steps, hard
 * left at PAN_MIN, centre at PAN_CENTRE, hard right at PAN_MAX, drawn like the
 * compact level fader with its fill from the centre to the thumb. The readout
 * counts steps from the centre (`L 12`, `C`, `R 30`; see `panText`). The
 * arrow keys move a step and Page Up/Down, Home and End do as a range does;
 * a double-click on the thumb, `C` or `0` on the keyboard, or the Centre
 * button centres it. As with the fader, a press on the thumb has to travel
 * before it moves anything, a drag commits once on release, and `onChange`
 * fires only when the user changes the pan.
 */
export const Pan = ({ value, onChange, label }: PanProps) => {
  const pan = value ?? PAN_CENTRE;
  const thumb = THUMB.compact;
  const input = useRef<HTMLInputElement>(null);
  const press = useRef<{ startX: number; armed: boolean } | null>(null);
  const lastThumbDown = useRef(0);
  const [dragPan, setDragPan] = useState<number | null>(null);
  const dragged = useRef<number | null>(null);
  const shown = dragPan ?? pan;
  const span = PAN_MAX - PAN_MIN;
  const at = (shown - PAN_MIN) / span;
  const mid = (PAN_CENTRE - PAN_MIN) / span;

  const sync = () => {
    if (input.current) input.current.value = String(dragged.current ?? pan);
  };
  useLayoutEffect(sync);

  const change = (next: number, merge: boolean) => {
    if (next !== pan) onChange(next, { merge });
  };
  const setDrag = (next: number | null) => {
    dragged.current = next;
    setDragPan(next);
  };

  const onPointerDown = (e: PointerEvent<HTMLInputElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const thumbX = rect.left + thumb / 2 + ((pan - PAN_MIN) / span) * (rect.width - thumb);
    const onThumb = Math.abs(e.clientX - thumbX) <= thumb / 2 + 2;
    if (onThumb && e.timeStamp - lastThumbDown.current < 400) {
      // A double-click (or double tap) on the thumb centres it.
      lastThumbDown.current = 0;
      e.preventDefault();
      el.focus();
      press.current = null;
      change(PAN_CENTRE, false);
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
    window.setTimeout(() => {
      press.current = null;
      setDrag(null);
      sync();
    });
  };

  const onInput = () => {
    const el = input.current;
    if (!el || !press.current) return;
    if (!press.current.armed) sync();
    else setDrag(el.valueAsNumber);
  };

  // The native change event: a drag commits here, once; without a pointer it's
  // the keyboard or assistive tech stepping the range.
  const onCommit = useRef(() => {});
  onCommit.current = () => {
    const el = input.current;
    if (!el) return;
    if (press.current) {
      if (dragged.current !== null) change(dragged.current, false);
      return;
    }
    change(el.valueAsNumber, true);
    sync();
  };
  useEffect(() => {
    const el = input.current;
    const listener = () => onCommit.current();
    el?.addEventListener('change', listener);
    return () => el?.removeEventListener('change', listener);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'c' || e.key === 'C' || e.key === '0') {
      e.preventDefault();
      change(PAN_CENTRE, true);
    }
  };

  const centred = pan === PAN_CENTRE;
  const centre = useRef<TamaguiElement>(null);
  // It stays focusable with nothing to do, so pressing it doesn't drop focus.
  useEffect(() => {
    (centre.current as unknown as HTMLElement | null)?.setAttribute(
      'aria-disabled',
      String(centred),
    );
  }, [centred]);

  return (
    <div
      className="fader-root"
      data-compact=""
      data-pan=""
      style={
        {
          '--fader-from': Math.min(at, mid),
          '--fader-to': Math.max(at, mid),
          '--fader-zero-at': mid,
        } as CSSProperties
      }
    >
      <style href="fader" precedence="default">
        {CSS}
      </style>
      <div className="fader-travel">
        <div className="fader-track">
          <span className="fader-groove" />
          <span className="fader-fill" data-pan="" />
          <span className="fader-zero" />
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
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPress}
            onPointerCancel={endPress}
            onInput={onInput}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
      <span className="fader-pan-out" aria-hidden="true">
        {panText(shown)}
      </span>
      <Action
        ref={centre}
        className="fader-centre target"
        kind="ghost"
        aria-label={`Centre ${label.charAt(0).toLowerCase()}${label.slice(1)}`}
        onPress={() => {
          if (!centred) change(PAN_CENTRE, false);
        }}
      >
        <span>Centre</span>
      </Action>
    </div>
  );
};
