/**
 * The Keys | Channels switch of the phone layout: a tablist of two, drawn as
 * a segmented control, whose panels are the key grid and the Channels screen
 * (`PhoneEditor` in App.tsx). Selection follows focus: Left and Right (and
 * Home and End) move between the tabs and show their screen, and Tab leaves
 * from the selected one.
 */

import { useAtom } from 'jotai';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { PhoneScreen } from '../lib/layout.ts';
import { phoneScreenAtom } from '../lib/store.ts';
import { Action } from './ui.tsx';

const SCREENS: readonly (readonly [screen: PhoneScreen, label: string])[] = [
  ['keys', 'Keys'],
  ['channels', 'Channels'],
];

/** The ids the panels name themselves by (`aria-labelledby`). */
export const tabId = (screen: PhoneScreen) => `screen-tab-${screen}`;

/*
 * A pill of two on a well, like the key type switch: the selected tab is an
 * ink pill that slides between them, and its words take the strong weight,
 * so it isn't told by colour alone. Forced colours give it the system's
 * highlight pair.
 */
const CSS_TEXT = `
.tabs { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 999px; background: var(--well); }
.tabs-pill {
  position: absolute; inset-block: 4px; inset-inline-start: 4px; inline-size: calc((100% - 12px) / 2);
  border-radius: 999px; background: var(--ink); pointer-events: none;
  translate: calc(var(--tabs-at) * (100% + 4px)) 0;
}
.tabs-pill:dir(rtl) { translate: calc(var(--tabs-at) * (-100% - 4px)) 0; }
.tabs .tabs-tab {
  position: relative; block-size: max(36px, var(--target)); min-block-size: 0;
  border-radius: 999px; background: transparent; color: var(--ink); opacity: 1; cursor: pointer;
  font-size: 0.9375rem; font-weight: var(--w-ui); line-height: 1.2;
  &&&& { padding: 0 12px; border: 0; }
}
.tabs .tabs-tab[aria-selected="true"] { background: transparent; color: var(--canvas); cursor: default; }
.tabs .tabs-tab:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.tabs .tabs-tab:not([aria-selected="true"]):active { background: color-mix(in oklab, var(--ink) 10%, transparent); }
@media (hover: hover) {
  .tabs .tabs-tab:not([aria-selected="true"]):hover { background: color-mix(in oklab, var(--ink) 8%, transparent); }
}
@media (prefers-reduced-motion: no-preference) {
  .tabs-pill { transition: translate 320ms var(--spring); }
  .tabs .tabs-tab { transition: color 180ms ease-out, background-color 140ms ease-out; }
}
@media (prefers-contrast: more) {
  .tabs { box-shadow: inset 0 0 0 1.5px var(--muted); }
}
@media (forced-colors: active) {
  .tabs { border: 1px solid CanvasText; }
  .tabs-pill { display: none; }
  .tabs .tabs-tab[aria-selected="true"] { forced-color-adjust: none; background: Highlight; color: HighlightText; }
  .tabs .tabs-tab[aria-selected="true"]:focus-visible { outline-color: CanvasText; }
}
`;

export const ScreenTabs = () => {
  const [screen, setScreen] = useAtom(phoneScreenAtom);
  const at = SCREENS.findIndex(([s]) => s === screen);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const tabs = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
    // From the tab with focus, which needn't be the selected one (something may have focused it).
    const from = Math.max(0, tabs.indexOf(e.target as HTMLElement));
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key];
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? SCREENS.length - 1
          : step === undefined
            ? undefined
            : (from + step + SCREENS.length) % SCREENS.length;
    const to = next === undefined ? undefined : SCREENS[next];
    if (!to) return;
    e.preventDefault();
    setScreen(to[0]);
    tabs[next ?? 0]?.focus();
  };

  return (
    <div role="tablist" aria-label="Editor screens" className="tabs" onKeyDown={onKeyDown}>
      <style>{CSS_TEXT}</style>
      <span
        className="tabs-pill"
        aria-hidden="true"
        style={{ '--tabs-at': Math.max(at, 0) } as CSSProperties}
      />
      {SCREENS.map(([s, label]) => (
        <Action
          key={s}
          kind="ghost"
          role="tab"
          id={tabId(s)}
          className="tabs-tab"
          aria-selected={s === screen}
          tabIndex={s === screen ? 0 : -1}
          onPress={() => setScreen(s)}
        >
          <span>{label}</span>
        </Action>
      ))}
    </div>
  );
};
