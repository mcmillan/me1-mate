/**
 * A short guided walk through the editor for someone who has never seen it:
 * what each region is and the one thing you do there. Each step is a
 * non-modal dialog on a manual popover, tethered to the region it describes;
 * the rest of the page is `inert` and recedes while the tour runs.
 *
 * It starts by itself the first time someone reaches the editor, and from the
 * top bar's "Show me around" at any time (`startTourAtom`). In the phone
 * layout it has its own steps (`phoneSteps`), since the phone has screens
 * rather than regions: the key screen; then a key's page, opened for real,
 * one part per step (its top, the type switch, label, level and mute, and the
 * channel picker); the Channels screen (the tour switches to it for that
 * step, and back to Keys after and on ending); then Export and the ⋯ menu.
 * The app opens on the home screen, so reaching the editor always follows
 * something the user did: the tour never takes focus as the page loads. It
 * changes nothing in the system: opening a key's page only selects the key,
 * and the key that was selected before is selected again when the page closes.
 */

import type { Key } from '@mcmillan/me1-mate-core';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { canMute, canPick, type Editable } from '../lib/edit.ts';
import { returnFocus } from '../lib/focus.ts';
import { usePhone } from '../lib/layout.ts';
import {
  keySheetOpenAtom,
  phoneScreenAtom,
  selectedKeyAtom,
  sessionIdAtom,
  systemAtom,
} from '../lib/store.ts';
import { keyStyle } from '../lib/theme.ts';
import { Action } from './ui.tsx';

type StepId =
  | 'keys'
  | 'channels'
  | 'key'
  | 'export'
  | 'phone-keys'
  | 'sheet-top'
  | 'sheet-type'
  | 'sheet-fields'
  | 'sheet-picker'
  | 'phone-channels'
  | 'phone-export';

/** The part of the page each step is about. The `sheet-` steps' parts are in the open key sheet. */
const TARGET: Record<StepId, string> = {
  keys: '.workspace-keys',
  channels: '.workspace-channels',
  key: '.workspace-inspector',
  export: '.top-export',
  'phone-keys': '.workspace-keys',
  'sheet-top': '.sheet .insp-hero',
  'sheet-type': '.sheet .insp-type',
  'sheet-fields': '.sheet .insp-fields',
  'sheet-picker': '.sheet .ch-picker',
  'phone-channels': '.workspace-channels',
  'phone-export': '.top-export',
};

interface Step {
  readonly id: StepId;
  /** The step's heading; it names the dialog. */
  readonly title: string;
  /** Written to make sense read alone, since the page behind it can't be reached. */
  readonly body: string;
  /** The key whose colour the step wears (0-based); in the key sheet, the key that is open. */
  readonly key: number;
  /** Phone tour only: the screen the step needs showing. */
  readonly screen?: 'keys' | 'channels';
  /** Phone tour only: the step is about a part of key `key`'s sheet, and shows inside it. */
  readonly sheet?: true;
}

/** The one-page editor's tour: each region in turn. */
const DESKTOP_STEPS: readonly Step[] = [
  {
    id: 'keys',
    title: 'Keys',
    body: 'These are the 16 keys on your ME-1. Pick a key to work on it.',
    key: 0,
  },
  {
    id: 'channels',
    title: 'Channels',
    body: 'These are the 40 channels from your ME-U. Press a channel’s number to give it to the key you picked; press it again to take it away. A key can take one channel or a group of them. The name beside each number is for naming the channel.',
    key: 1,
  },
  {
    id: 'key',
    title: 'The key you picked',
    body: 'The key you picked opens here. Set its label and its level; a group also has a level for each of its channels.',
    key: 2,
  },
  {
    id: 'export',
    title: 'Export',
    body: 'When you’re done, export. The .ME1 goes on the ME-1’s USB stick and the .meu goes to the ME-U. Your work is saved in this browser as you go.',
    key: 3,
  },
];

/**
 * The key the phone tour opens: the first that takes a channel or a group,
 * since its page has every part; else the first empty key, whose page has the
 * type switch and the picker; else key 1.
 */
const tourKeyOf = (system: Editable): number => {
  const first = (test: (key: Key) => boolean) => system.keys.findIndex(test);
  const full = first((key) => key.type === 'channel' || key.type === 'group');
  return full >= 0
    ? full
    : Math.max(
        first((key) => key.type === 'unassigned'),
        0,
      );
};

/**
 * The phone's tour, which has screens rather than regions: the key screen;
 * then a key's page (`tourKeyOf`), opened for real, a part at a time, leaving
 * out any part that key's page doesn't have; the Channels screen (shown for
 * that step, and Keys again after it); then Export and the ⋯ menu.
 */
const phoneSteps = (system: Editable): readonly Step[] => {
  const index = tourKeyOf(system);
  const key = system.keys[index];
  const fields = canMute(key);
  const sheet = { key: index, screen: 'keys', sheet: true } as const;
  const steps: readonly (Step | false)[] = [
    {
      id: 'phone-keys',
      title: 'Your keys',
      body: 'These are the 16 keys on your ME-1. Tap one to open its page and set it up.',
      key: 0,
      screen: 'keys',
    },
    {
      ...sheet,
      id: 'sheet-top',
      title: `Key ${index + 1}’s page`,
      body: 'Tapping a key opens its page, with everything about it. At the top are its number, label and type, in the key’s colour. ‹ and › go to the keys either side, and Done goes back to your keys.',
    },
    {
      ...sheet,
      id: 'sheet-type',
      title: 'Key type',
      body: `Choose whether the key is empty, takes one channel or a group of them, follows Auto to the next free channel, or is the Aux In or the test tone.${fields ? '' : ' Once it has a type, it gets a label, a level and mute too.'}`,
    },
    fields && {
      ...sheet,
      id: 'sheet-fields',
      title: 'Label, level and mute',
      body: 'The label is what the ME-1 shows on the key: up to 6 letters, numbers or spaces. Below it are the key’s level and mute, and its pan, or balance for a stereo pair, where it has one.',
    },
    canPick(key) && {
      ...sheet,
      id: 'sheet-picker',
      title: 'Its channels',
      body: 'Tap channels to give them to the key, and tap one again to take it away. A key takes one channel or a group of them, and a group has a level for each.',
    },
    {
      id: 'phone-channels',
      title: 'Channels',
      body: 'Your ME-U’s 40 channels have this screen of their own: name them and link stereo pairs here. Switch between Keys and Channels at the top.',
      key: 2,
      screen: 'channels',
    },
    {
      id: 'phone-export',
      title: 'Export and more',
      body: 'When you’re done, export: the .ME1 goes on the ME-1’s USB stick and the .meu goes to the ME-U. Your work is saved in this browser as you go. The ⋯ menu has undo and redo, opening files, starting afresh, this tour and Home.',
      key: 3,
      screen: 'keys',
    },
  ];
  return steps.filter((step): step is Step => step !== false);
};

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

/** The step showing (an index into the layout's steps), or `null` while the tour isn't running. */
const stepAtom = atom<number | null>(null);

/** Start the tour from its first step. It only shows in the editor (on a phone, on its key screen). */
export const startTourAtom = atom(null, (_get, set) => {
  set(keySheetOpenAtom, false);
  set(phoneScreenAtom, 'keys');
  set(stepAtom, 0);
});

/** A step of the tour; a step past the end is the last. */
const stepFor = (steps: readonly Step[], index: number): Step =>
  steps[Math.min(index, steps.length - 1)] as Step;

const NATIVE_ANCHORS = CSS.supports('position-area: block-end');
/** From this width the editor is two columns and a step sits beside its region. */
const BESIDE = '(min-width: 1100px)';

/** What recedes while the tour runs: the regions, the notices and the top bar's parts. */
const DIMMED =
  '.workspace-keys, .workspace-inspector, .workspace-channels, .notices, .top-id, .top-group, .top-help, .top-switch';
/** What recedes in the key sheet while a step about one of its parts shows. */
const SHEET_PARTS = '.sheet .insp-body > *, .sheet .ch-picker';
const TARGETS = (Object.entries(TARGET) as [StepId, string][])
  .map(([id, target]) => `:root[data-tour="${id}"] ${target}`)
  .join(', ');

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
 * nothing is left behind when the tour ends, and there's no scrim. In the key
 * sheet the same goes for its parts; its top stays put while the rest
 * scrolls under it, so rather than turn see-through it pales to a tint of
 * the key's colour. Tamagui's reset unsets the UA styles for `dialog` and
 * `[popover]`, so the closed state and the box are set here.
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
/* A phone on its side: the card keeps to the end of the window, leaving the start of the sheet in view. */
@media (orientation: landscape) and (max-height: 499.98px) {
  .tour-step { inset: auto max(12px, env(safe-area-inset-right)) 12px auto; inline-size: min(20rem, 45vw); margin: 0; padding-block: 14px 10px; }
  .tour-body { margin-block-start: 6px; }
  .tour-actions { margin-block-start: 8px; }
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
:root[data-tour^="sheet-"] :is(${SHEET_PARTS}) { opacity: 0.32; }
:root[data-tour^="sheet-"]:not([data-tour="sheet-top"]) .sheet .insp-hero { background: color-mix(in oklab, var(--k, var(--well)) 32%, var(--card)); }
:root[data-tour^="sheet-"]:not([data-tour="sheet-top"]) .sheet .insp-hero > * { opacity: 0.32; }
${TARGETS} { anchor-name: --tour; opacity: 1; }
/* Export shares its group: there, dim what's beside it instead of the group. */
:root:is([data-tour="export"], [data-tour="phone-export"]) .top-group:has(.top-export) { opacity: 1; }
:root:is([data-tour="export"], [data-tour="phone-export"]) .top-group:has(.top-export) .top-problems { opacity: 0.32; }
/* The phone's last step is also about the ⋯ menu beside Export. */
:root[data-tour="phone-export"] .top-help { opacity: 1; }

@media (prefers-reduced-motion: no-preference) {
  /* Unscoped, so the page also comes back smoothly when the tour ends. */
  :is(${DIMMED}, ${SHEET_PARTS}, .sheet .insp-hero > *) { transition: opacity 200ms ease-out; }
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
const PLACES: Partial<Record<StepId, readonly ('below' | 'above' | 'before' | 'below-end')[]>> = {
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
  const spot = (PLACES[id] ?? ['below', 'above']).map((place) => spots[place]).find(fits) ?? {
    left: vw - GAP - width,
    top: vh - GAP - height,
  };
  card.style.left = `${spot.left}px`;
  card.style.top = `${spot.top}px`;
};

const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: no-preference)').matches ? 'smooth' : 'auto';

/**
 * Scroll the step's region to where it can be seen: the page's top for
 * Export, since the top bar slides away further down a narrow page; otherwise
 * just under the top bar, unless the region is already clear of the bar and
 * of the card, where the card is a sheet along the bottom.
 */
const bringIntoView = (card: HTMLElement, target: HTMLElement, id: StepId) => {
  const behavior = scrollBehavior();
  if (id === 'export' || id === 'phone-export') {
    window.scrollTo({ top: 0, behavior });
    return;
  }
  const bar = document.querySelector('.top-bar')?.getBoundingClientRect().height ?? 0;
  const sheet = window.matchMedia(BESIDE).matches ? 0 : card.getBoundingClientRect().height + 24;
  const t = target.getBoundingClientRect();
  if (t.top >= bar && t.bottom <= window.innerHeight - sheet) return;
  window.scrollTo({ top: window.scrollY + t.top - bar - 16, behavior });
};

/**
 * Scroll the key sheet so a part of it shows between its top, which stays
 * put, and the card. It works in the sheet's own terms, and from where the
 * sheet will be once it has risen into place, since it may still be rising.
 */
const bringIntoSheet = (sheet: HTMLElement, card: HTMLElement, target: HTMLElement) => {
  const behavior = scrollBehavior();
  if (target.matches('.insp-hero')) {
    sheet.scrollTo({ top: 0, behavior });
    return;
  }
  const hero = sheet.querySelector<HTMLElement>('.insp-hero')?.offsetHeight ?? 0;
  const sheetTop = window.innerHeight - sheet.offsetHeight;
  const room = { top: hero + 12, bottom: card.getBoundingClientRect().top - sheetTop - 12 };
  // Where the part is in the sheet's box as it is scrolled now.
  const at = target.getBoundingClientRect().top - sheet.getBoundingClientRect().top;
  if (at >= room.top && at + target.offsetHeight <= room.bottom) return;
  sheet.scrollTo({ top: sheet.scrollTop + at - room.top, behavior });
};

/**
 * One step's dialog. It is mounted afresh for each step, so each opens as its
 * own popover. A step about a part of the key sheet is rendered into the
 * sheet's `<dialog>`: the sheet is modal, so everything outside it is inert,
 * and a popover inside it is in its subtree and opens above it in the top
 * layer.
 */
const TourStep = ({
  step,
  index,
  total,
  onGo,
  onEnd,
}: {
  readonly step: Step;
  readonly index: number;
  readonly total: number;
  readonly onGo: (index: number) => void;
  readonly onEnd: () => void;
}) => {
  const last = index >= total - 1;
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [host, setHost] = useState<HTMLDialogElement | null>(null);

  // The sheet is rendered by the editor, so it is found once the page is in place.
  useLayoutEffect(() => {
    if (step.sheet) setHost(document.querySelector<HTMLDialogElement>('dialog.sheet'));
  }, [step.sheet]);

  useEffect(() => {
    const card = ref.current;
    const target = document.querySelector<HTMLElement>(TARGET[step.id]);
    if (!card) return;
    // The sheet opens first (KeySheet, as the step's state is set), so the card stacks above it.
    if (host && !host.open) host.showModal();
    card.showPopover();
    // The way forward takes focus, so Enter walks the tour and a screen reader
    // reads the dialog's name and text on the way in; without a ring after a tap.
    const forward = card.querySelector<HTMLElement>('.tour-go');
    if (forward) returnFocus(forward);
    if (!target) return;
    if (host) {
      bringIntoSheet(host, card, target);
      return;
    }
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
  }, [step, host]);

  if (step.sheet && !host) return null;

  const card = (
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
          {index + 1} of {total}
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
  return host ? createPortal(card, host) : card;
};

/**
 * Where focus goes when the tour ends: back where it was, or to the selected
 * key; without a ring when it was ended with a tap.
 */
const restoreFocus = (from: Element | null) => {
  const target =
    from instanceof HTMLElement && from !== document.body && from.isConnected
      ? from
      : document.querySelector<HTMLElement>(
          '[role="radiogroup"][aria-label="Keys"] [role="radio"][aria-checked="true"]',
        );
  if (target) returnFocus(target);
};

/**
 * The tour, rendered beside the editor's top bar and `main` (never inside
 * them: they are made `inert` while it runs). Next and Back walk the steps;
 * Skip tour, Done and Escape end it, and it is then remembered as seen. Files
 * opened mid-tour (a drop on the window) end it too. If the editor goes away
 * mid-tour, the page is put back as it was and the tour is not counted as
 * seen.
 *
 * On a phone, the steps about a key's page open the key sheet on the tour's
 * key, and leaving them (Next, Back, ending the tour, leaving the editor)
 * closes it and selects again the key that was selected before. While the
 * sheet is open, `main` (which holds it) isn't made inert, since the modal
 * sheet already makes the rest of the page inert; the sheet's own content is,
 * leaving only the card inside it. Closing the sheet another way (a tap above
 * it, the back gesture) ends the tour. Crossing into or out of the phone
 * layout mid-tour starts that layout's tour from its first step.
 */
export const Tour = () => {
  const [index, setIndex] = useAtom(stepAtom);
  const sessionId = useAtomValue(sessionIdAtom);
  const system = useAtomValue(systemAtom);
  const phone = usePhone();
  const setScreen = useSetAtom(phoneScreenAtom);
  const [sheetOpen, setSheetOpen] = useAtom(keySheetOpenAtom);
  const [selected, setSelected] = useAtom(selectedKeyAtom);
  const style = useRef<HTMLStyleElement>(null);
  const steps = useMemo(() => (phone ? phoneSteps(system) : DESKTOP_STEPS), [phone, system]);
  const step = index === null ? undefined : stepFor(steps, index);
  const running = step !== undefined;
  const inSheet = step?.sheet === true;
  /** The key selected before the tour opened a key's page, while it has one open. */
  const before = useRef<number | null>(null);

  const leaveSheet = () => {
    if (before.current === null) return;
    setSheetOpen(false);
    setSelected(before.current);
    before.current = null;
  };

  // On a phone, show the screen (and the key's page) the step is about in the
  // same render as the step, so it finds its region.
  const go = (next: number) => {
    const to = stepFor(steps, next);
    if (phone) setScreen(to.screen ?? 'keys');
    if (to.sheet && before.current === null) {
      before.current = selected;
      setSelected(to.key);
      setSheetOpen(true);
    } else if (!to.sheet) {
      leaveSheet();
    }
    setIndex(next);
  };

  const end = () => {
    markSeen();
    leaveSheet();
    if (phone) setScreen('keys');
    setIndex(null);
  };
  const endRef = useRef(end);
  endRef.current = end;
  const leaveRef = useRef(leaveSheet);
  leaveRef.current = leaveSheet;

  // The first time someone reaches the editor; leaving it ends the tour.
  useEffect(() => {
    if (!hasSeen()) setIndex(0);
    return () => {
      leaveRef.current();
      setIndex(null);
    };
  }, [setIndex]);

  // Another system was opened under the tour: what it was showing has gone.
  const session = useRef(sessionId);
  useEffect(() => {
    if (session.current === sessionId) return;
    session.current = sessionId;
    endRef.current();
  }, [sessionId]);

  // The key sheet was closed another way (a tap above it, the back gesture): so is the tour.
  useEffect(() => {
    if (inSheet && !sheetOpen) endRef.current();
  }, [inSheet, sheetOpen]);

  // Into or out of the phone layout: its own steps, from the first, with no key's page left open.
  const layout = useRef(phone);
  useEffect(() => {
    if (layout.current === phone) return;
    layout.current = phone;
    leaveRef.current();
    setScreen('keys');
    setIndex((at) => (at === null ? null : 0));
  }, [phone, setIndex, setScreen]);

  // Which region the step is about, for the CSS; removed with the last step.
  const stepId = step?.id;
  useLayoutEffect(() => {
    if (stepId === undefined) return;
    const root = document.documentElement;
    root.dataset.tour = stepId;
    return () => {
      delete root.dataset.tour;
    };
  }, [stepId]);

  // Before the effect below, so `main` is no longer inert when focus is put back.
  // `main` is inert, but while a step shows in the key sheet, which `main` holds, the
  // sheet's content is instead: the modal sheet makes the rest of the page inert.
  useLayoutEffect(() => {
    if (!running) return;
    const main = style.current?.parentElement?.querySelector<HTMLElement>(':scope > main');
    const sheet = inSheet ? main?.querySelector<HTMLElement>('dialog.sheet') : null;
    const parts = [...(sheet?.querySelectorAll<HTMLElement>(':scope > :not(.tour-step)') ?? [])];
    if (main) main.inert = !inSheet;
    for (const el of parts) el.inert = true;
    return () => {
      if (main) main.inert = false;
      for (const el of parts) el.inert = false;
    };
  }, [running, inSheet]);

  // A layout effect: it notes where focus was before the first step takes it.
  useLayoutEffect(() => {
    if (!running) return;
    const from = document.activeElement;
    // The editor's own regions, not the toasts: their live region has to stay reachable.
    const header = style.current?.parentElement?.querySelector<HTMLElement>(':scope > header');
    if (header) header.inert = true;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      endRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (header) header.inert = false;
      restoreFocus(from);
    };
  }, [running]);

  return (
    <>
      <style ref={style}>{CSS_TEXT}</style>
      {step !== undefined && index !== null && (
        <TourStep
          key={`${index}-${phone}`}
          step={step}
          index={Math.min(index, steps.length - 1)}
          total={steps.length}
          onGo={go}
          onEnd={end}
        />
      )}
    </>
  );
};
