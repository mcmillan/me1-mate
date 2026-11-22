/**
 * A short guided walk through the editor for someone who has never seen it:
 * what each region is and the one thing you do there. Each step is a
 * non-modal dialog on a manual popover, tethered to the region it describes;
 * the rest of the page is `inert` and recedes while the tour runs.
 *
 * It starts by itself the first time someone reaches the editor, and from the
 * top bar's "Show me around" at any time (`startTourAtom`). The app opens on
 * the home screen, so reaching the editor always follows something the user
 * did: the tour never takes focus as the page loads. It reads and changes
 * nothing in the system.
 */

import { atom, useAtom, useAtomValue } from 'jotai';
import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { sessionIdAtom } from '../lib/store.ts';
import { keyStyle } from '../lib/theme.ts';
import { Action } from './ui.tsx';

type StepId = 'keys' | 'channels' | 'key' | 'export';

interface Step {
  readonly id: StepId;
  /** The step's heading; it names the dialog. */
  readonly title: string;
  /** Written to make sense read alone, since the page behind it can't be reached. */
  readonly body: string;
  /** The part of the page the step is about. */
  readonly target: string;
  /** The key whose colour the step wears (0-based). */
  readonly key: number;
}

const STEPS: readonly Step[] = [
  {
    id: 'keys',
    title: 'Keys',
    body: 'These are the 16 keys on your ME-1. Pick a key to work on it.',
    target: '.workspace-keys',
    key: 0,
  },
  {
    id: 'channels',
    title: 'Channels',
    body: 'These are the 40 channels from your ME-U. Press a channel’s number to give it to the key you picked; press it again to take it away. A key can play one channel or a group of them. You name channels here too.',
    target: '.workspace-channels',
    key: 1,
  },
  {
    id: 'key',
    title: 'The key you picked',
    body: 'The key you picked opens here. Set its label and its level; a group also has a level for each of its channels.',
    target: '.workspace-inspector',
    key: 2,
  },
  {
    id: 'export',
    title: 'Export',
    body: 'When you’re done, export. The .ME1 goes on the ME-1’s USB stick and the .meu goes to the ME-U. Your work is saved in this browser as you go.',
    target: '.top-export',
    key: 3,
  },
];

/** Set once the tour has been finished or skipped, so it doesn't start by itself again. */
const SEEN_KEY = 'me1-mate:tour:v1';
/** For this visit, where storage can't be read or written. */
let seenThisVisit = false;

const hasSeen = (): boolean => {
  if (seenThisVisit) return true;
  try {
    return localStorage.getItem(SEEN_KEY) !== null;
  } catch {
    return false;
  }
};

const markSeen = (): void => {
  seenThisVisit = true;
  try {
    localStorage.setItem(SEEN_KEY, 'done');
  } catch {
    // Storage is unavailable: remembered for this visit only.
  }
};

/** The step showing (an index into `STEPS`), or `null` while the tour isn't running. */
const stepAtom = atom<number | null>(null);

/** Start the tour from its first step. It only shows in the editor. */
export const startTourAtom = atom(null, (_get, set) => {
  set(stepAtom, 0);
});

const NATIVE_ANCHORS = CSS.supports('position-area: block-end');
/** From this width the editor is two columns and a step sits beside its region. */
const BESIDE = '(min-width: 1100px)';

/** What recedes while the tour runs: the regions, the notices and the top bar's parts. */
const DIMMED =
  '.workspace-keys, .workspace-inspector, .workspace-channels, .notices, .top-id, .top-group, .top-help';
const TARGETS = STEPS.map((step) => `:root[data-tour="${step.id}"] ${step.target}`).join(', ');

/*
 * The step is a raised card. By default it is a sheet along the bottom of the
 * window: on a phone or a tablet a region can be taller than the screen, so
 * there is nowhere beside it to sit; the region is scrolled to the top
 * instead. From 1100px it is tethered to its region with anchor positioning
 * (the region is named `--tour` by the step that is showing): under Keys,
 * over Channels, beside the inspector, under Export, flipping where there's
 * no room and settling in the corner when nothing fits. Without anchor
 * positioning the same places are worked out in script (`placeByScript`).
 *
 * While the tour runs (`data-tour` on the root) everything but the step's
 * region is dimmed; the region itself isn't drawn round or changed, so
 * nothing is left behind when the tour ends, and there's no scrim. Tamagui's reset
 * unsets the UA styles for `dialog` and `[popover]`, so the closed state and
 * the box are set here.
 */
const CSS_TEXT = `
.tour-step:not(:popover-open) { display: none; }
.tour-step:popover-open { display: block; }
.tour-step { position: fixed; inset: auto 12px max(12px, env(safe-area-inset-bottom)); box-sizing: border-box; inline-size: auto; max-inline-size: 26rem; block-size: auto; max-block-size: calc(100dvh - 24px); margin: 0 auto; padding: 18px 18px 14px 20px; overflow: auto; overscroll-behavior: contain; border: 1.5px solid var(--line); border-radius: 20px; background: var(--card); color: var(--ink); box-shadow: var(--shadow); }
.tour-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.tour-title { margin: 0; font-size: 1.25rem; line-height: 1.2; text-wrap: balance; }
.tour-count { flex: none; padding: 3px 9px; border: 1px solid transparent; border-radius: 999px; background: color-mix(in oklab, var(--k) 28%, var(--card)); font-size: 0.75rem; font-weight: var(--w-ui); line-height: 1.3; white-space: nowrap; }
.tour-body { margin: 10px 0 0; font-size: 0.875rem; font-weight: var(--w-text); line-height: 1.5; overflow-wrap: break-word; text-wrap: pretty; }
.tour-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-block-start: 14px; }
.tour-actions button { min-block-size: max(36px, var(--target)); }
.tour-actions button > span { font-weight: var(--w-ui); }
/* Skip stands apart from the way forward, and quieter; its text lines up with the card's. */
.tour-actions button.tour-skip { margin-inline: -12px auto; }
.tour-actions button.tour-skip > span { color: var(--muted); }
.tour-actions button.tour-skip:focus-visible > span { color: var(--ink); }
@media (hover: hover) {
  .tour-actions button.tour-skip:hover > span { color: var(--ink); }
}

@media ${BESIDE} {
  @supports (position-area: block-end) {
    .tour-step { inset: auto; inline-size: min(21.5rem, 100vw - 40px); max-inline-size: none; margin: 20px; position-anchor: --tour; position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline, --tour-corner; }
    .tour-step[data-step="keys"] { position-area: block-end span-inline-end; margin-inline-start: 0; }
    .tour-step[data-step="channels"] { position-area: block-start span-inline-end; margin-inline-start: 0; }
    .tour-step[data-step="key"] { position-area: inline-start span-block-end; margin-block-start: 0; }
    .tour-step[data-step="export"] { position-area: block-end span-inline-start; margin-inline-end: 0; margin-block-start: 14px; }
  }
  @supports not (position-area: block-end) {
    /* Viewport coordinates are set from script when the step opens. */
    .tour-step { inset: auto; inline-size: min(21.5rem, 100vw - 40px); max-inline-size: none; margin: 0; }
  }
}
@position-try --tour-corner { position-area: none; inset: auto 20px 20px auto; margin: 0; }

/* Everything but the step's region recedes; the region itself is left exactly as it is. */
:root[data-tour] :is(${DIMMED}) { opacity: 0.32; }
${TARGETS} { anchor-name: --tour; opacity: 1; }
/* Export is in the last group: there, dim what's beside it instead of the group. */
:root[data-tour="export"] .top-group:last-child { opacity: 1; }
:root[data-tour="export"] .top-group:last-child .top-problems { opacity: 0.32; }

@media (prefers-reduced-motion: no-preference) {
  /* Unscoped, so the page also comes back smoothly when the tour ends. */
  :is(${DIMMED}) { transition: opacity 200ms ease-out; }
  .tour-step:popover-open { transition: opacity 180ms ease-out, translate 300ms var(--spring); }
  @starting-style {
    .tour-step:popover-open { opacity: 0; translate: 0 8px; }
  }
  .tour-actions button { transition: scale 200ms var(--spring), background-color 120ms ease-out, border-color 120ms ease-out; }
  .tour-actions button:active { scale: 0.96; }
}
@media (forced-colors: active) {
  .tour-count { border-color: CanvasText; }
}
`;

const GAP = 20;
const EDGE = 12;

/** Where a step sits by its region, in the order tried: the same places as the CSS. */
const PLACES: Record<StepId, readonly ('below' | 'above' | 'before' | 'below-end')[]> = {
  keys: ['below', 'above'],
  channels: ['above', 'below'],
  key: ['before'],
  export: ['below-end'],
};

/** Without anchor positioning: beside the region where it fits, else the window's corner. */
const placeByScript = (card: HTMLElement, target: HTMLElement, id: StepId) => {
  if (!window.matchMedia(BESIDE).matches) {
    card.style.left = '';
    card.style.top = '';
    return;
  }
  const t = target.getBoundingClientRect();
  const { width, height } = card.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const within = (at: number, size: number, room: number) =>
    Math.max(EDGE, Math.min(at, room - EDGE - size));
  const spots = {
    below: { left: within(t.left, width, vw), top: t.bottom + GAP },
    above: { left: within(t.left, width, vw), top: t.top - GAP - height },
    before: { left: t.left - GAP - width, top: within(t.top, height, vh) },
    'below-end': { left: within(t.right - width, width, vw), top: t.bottom + GAP },
  };
  const fits = ({ left, top }: { left: number; top: number }) =>
    left >= EDGE && top >= EDGE && left + width <= vw - EDGE && top + height <= vh - EDGE;
  const spot = PLACES[id].map((place) => spots[place]).find(fits) ?? {
    left: vw - GAP - width,
    top: vh - GAP - height,
  };
  card.style.left = `${spot.left}px`;
  card.style.top = `${spot.top}px`;
};

/**
 * Scroll the step's region to where it can be seen: the page's top for
 * Export, since the top bar slides away further down a narrow page; otherwise
 * just under the top bar, unless the region is already clear of the bar and
 * of the card, where the card is a sheet along the bottom.
 */
const bringIntoView = (card: HTMLElement, target: HTMLElement, id: StepId) => {
  const behavior = window.matchMedia('(prefers-reduced-motion: no-preference)').matches
    ? 'smooth'
    : 'auto';
  if (id === 'export') {
    window.scrollTo({ top: 0, behavior });
    return;
  }
  const bar = document.querySelector('.top-bar')?.getBoundingClientRect().height ?? 0;
  const sheet = window.matchMedia(BESIDE).matches ? 0 : card.getBoundingClientRect().height + 24;
  const t = target.getBoundingClientRect();
  if (t.top >= bar && t.bottom <= window.innerHeight - sheet) return;
  window.scrollTo({ top: window.scrollY + t.top - bar - 16, behavior });
};

/** One step's dialog. It is mounted afresh for each step, so each opens as its own popover. */
const TourStep = ({
  index,
  onGo,
  onEnd,
}: {
  readonly index: number;
  readonly onGo: (index: number) => void;
  readonly onEnd: () => void;
}) => {
  const step = STEPS[index] as Step;
  const last = index === STEPS.length - 1;
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const card = ref.current;
    const target = document.querySelector<HTMLElement>(step.target);
    if (!card) return;
    card.showPopover();
    // The way forward takes focus, so Enter walks the tour and a screen reader
    // reads the dialog's name and text on the way in.
    card.querySelector<HTMLElement>('.tour-go')?.focus({ preventScroll: true });
    if (!target) return;
    bringIntoView(card, target, step.id);
    if (NATIVE_ANCHORS) return;
    const place = () => placeByScript(card, target, step.id);
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place);
    };
  }, [step]);

  return (
    <dialog
      ref={ref}
      className="tour-step"
      data-step={step.id}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      style={keyStyle(step.key)}
      {...({ popover: 'manual' } as Record<string, string>)}
    >
      <div className="tour-head">
        <h2 id={`${id}-title`} className="display tour-title">
          {step.title}
        </h2>
        <span className="tour-count">
          {index + 1} of {STEPS.length}
        </span>
      </div>
      <p id={`${id}-body`} className="tour-body">
        {step.body}
      </p>
      <div className="tour-actions">
        {!last && (
          <Action kind="ghost" className="target tour-skip" px="3" onPress={onEnd}>
            Skip tour
          </Action>
        )}
        {index > 0 && (
          <Action kind="subtle" className="target" px="4" onPress={() => onGo(index - 1)}>
            Back
          </Action>
        )}
        <Action
          kind="primary"
          className="target tour-go"
          px="4"
          onPress={() => (last ? onEnd() : onGo(index + 1))}
        >
          {last ? 'Done' : 'Next'}
        </Action>
      </div>
    </dialog>
  );
};

/** Where focus goes when the tour ends: back where it was, or to the selected key. */
const restoreFocus = (from: Element | null) => {
  const target =
    from instanceof HTMLElement && from !== document.body && from.isConnected
      ? from
      : document.querySelector<HTMLElement>(
          '[role="radiogroup"][aria-label="Keys"] [role="radio"][aria-checked="true"]',
        );
  target?.focus({ preventScroll: true });
};

/**
 * The tour, rendered beside the editor's top bar and `main` (never inside
 * them: they are made `inert` while it runs). Next and Back walk the steps;
 * Skip tour, Done and Escape end it, and it is then remembered as seen. Files
 * opened mid-tour (a drop on the window) end it too. If the editor goes away
 * mid-tour, the page is put back as it was and the tour is not counted as
 * seen.
 */
export const Tour = () => {
  const [index, setIndex] = useAtom(stepAtom);
  const sessionId = useAtomValue(sessionIdAtom);
  const style = useRef<HTMLStyleElement>(null);
  const running = index !== null;

  // The first time someone reaches the editor; leaving it ends the tour.
  useEffect(() => {
    if (!hasSeen()) setIndex(0);
    return () => setIndex(null);
  }, [setIndex]);

  const end = () => {
    markSeen();
    setIndex(null);
  };
  const endRef = useRef(end);
  endRef.current = end;

  // Another system was opened under the tour: what it was showing has gone.
  const session = useRef(sessionId);
  useEffect(() => {
    if (session.current === sessionId) return;
    session.current = sessionId;
    endRef.current();
  }, [sessionId]);

  // Which region the step is about, for the CSS; removed with the last step.
  useLayoutEffect(() => {
    if (index === null) return;
    const root = document.documentElement;
    root.dataset.tour = (STEPS[index] as Step).id;
    return () => {
      delete root.dataset.tour;
    };
  }, [index]);

  // A layout effect: it notes where focus was before the first step takes it.
  useLayoutEffect(() => {
    if (!running) return;
    const from = document.activeElement;
    // The editor's own regions, not the toasts: their live region has to stay reachable.
    const rest = [
      ...(style.current?.parentElement?.querySelectorAll<HTMLElement>(
        ':scope > header, :scope > main',
      ) ?? []),
    ];
    for (const el of rest) el.inert = true;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      endRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      for (const el of rest) el.inert = false;
      restoreFocus(from);
    };
  }, [running]);

  return (
    <>
      <style ref={style}>{CSS_TEXT}</style>
      {index !== null && <TourStep key={index} index={index} onGo={setIndex} onEnd={end} />}
    </>
  );
};
