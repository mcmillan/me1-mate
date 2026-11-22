import { useSetAtom } from 'jotai';
import { type CSSProperties, type ReactNode, useId, useRef } from 'react';
import type { TamaguiElement } from 'tamagui';
import { resetAtom, startExampleAtom } from '../lib/store.ts';
import { keyStyle } from '../lib/theme.ts';
import { LoadNotice } from './LoadNotice.tsx';
import { chooseFiles } from './OpenFiles.tsx';
import { SessionList } from './SessionList.tsx';
import { Action } from './ui.tsx';
import { Wordmark } from './Wordmark.tsx';

/**
 * The front door is one centred column on the canvas: the wordmark and what
 * this is, the three ways to begin, past sessions when there are any, and how
 * the editor works in three steps. Without sessions it fits a 1280×720 window;
 * the footer sits at the bottom of a taller one.
 *
 * The steps' pictures are the editor's own parts, drawn small on a recessed
 * well (raised cards are for things you can press): key tiles, numbered
 * channel chips and a fader, all following one key (02, "Perc") so its colour
 * carries from picture to picture. They are decoration: hidden from assistive
 * technology, and their fills are backed by transparent borders so the shapes
 * survive forced colours.
 *
 * Motion is one gentle entrance, and each picture acting out its step once:
 * the ring lands on the key, the chips take its colour, the fader comes up.
 * None of it runs under reduced motion, and nothing waits on it.
 */
const HOME_CSS = `
.home { box-sizing: border-box; display: flex; flex-direction: column; gap: 40px; inline-size: 100%; max-inline-size: 1088px; min-block-size: 100dvh; margin-inline: auto; padding: clamp(28px, 7dvh, 80px) 16px 20px; }
.home-main { display: grid; grid-template-columns: minmax(0, 1fr); gap: clamp(36px, 6.5dvh, 64px); }
.home-notice:empty { display: none; }
.home-sr { position: absolute; inline-size: 1px; block-size: 1px; margin: -1px; padding: 0; border: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

.home-hero { display: grid; grid-template-columns: minmax(0, 1fr); gap: 28px; }
.home-mark { margin: 0 0 0.18em; font-size: clamp(3.25rem, 2rem + 5.5vw, 5.25rem); line-height: 1; }
.home-pitch { max-inline-size: 31ch; margin: 22px 0 0; font-size: clamp(1.125rem, 1rem + 0.4vw, 1.25rem); font-weight: var(--w-text); line-height: 1.45; text-wrap: pretty; }
.home-nw { white-space: nowrap; }

.home-ways { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.home-way { display: grid; grid-template-columns: 11.5rem minmax(0, 1fr); align-items: center; gap: 6px 16px; }
.home-way p { margin: 0; color: var(--muted); font-size: 0.875rem; font-weight: var(--w-text); line-height: 1.4; text-wrap: pretty; }
.home .home-go { min-block-size: 46px; padding-inline: 20px; }
.home-go span { font-size: 1rem; }

.home-where { margin-block-start: 14px; font-size: 0.875rem; line-height: 1.45; }
.home-where summary { display: inline-flex; align-items: center; gap: 8px; min-block-size: var(--target); border-radius: 8px; color: var(--muted); font-weight: var(--w-ui); list-style: none; cursor: pointer; }
.home-where summary::-webkit-details-marker { display: none; }
.home-where summary::before { content: "❯"; font-size: 0.6875rem; }
.home-where[open] summary::before { rotate: 90deg; }
.home-where[open] summary { color: var(--ink); }
@media (hover: hover) {
  .home-where summary:hover { color: var(--ink); }
}
.home-where dl { display: grid; gap: 12px; max-inline-size: 52ch; margin: 6px 0 0; padding: 14px 18px; border-radius: 16px; background: var(--well); }
.home-where dt { font-weight: var(--w-strong); }
.home-where dd { margin: 0; color: var(--muted); font-weight: var(--w-text); text-wrap: pretty; }
.home-where b { color: var(--ink); font-weight: var(--w-strong); }

.home-section { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
.home-h2 { margin: 0; font-size: 1.375rem; line-height: 1.2; }

.home-steps { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; margin: 0; padding: 0; list-style: none; }
.home-step { display: grid; align-content: start; gap: 4px; }
.home-step h3 { display: flex; align-items: baseline; gap: 9px; margin: 12px 0 0; font-size: 1.125rem; font-weight: var(--w-strong); line-height: 1.3; }
.home-n { color: var(--muted); font-weight: var(--w-ui); }
.home-step p { max-inline-size: 40ch; margin: 0; color: var(--muted); font-size: 0.875rem; font-weight: var(--w-text); line-height: 1.45; text-wrap: pretty; }

/* The pictures. */
.home-art { box-sizing: border-box; display: grid; place-items: center; block-size: 132px; padding: 16px 22px; border: 1.5px solid transparent; border-radius: 20px; background: var(--well); user-select: none; }
.home-tiles { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 7px; inline-size: 100%; max-inline-size: 268px; }
.home-tile { position: relative; box-sizing: border-box; aspect-ratio: 1; border: 1.5px solid transparent; border-radius: 8px; background: var(--k); }
.home-tile[data-empty] { border-color: color-mix(in oklab, var(--line) 55%, var(--muted)); background: transparent; }
.home-ring::after { content: ""; position: absolute; inset: -6px; border: 2.5px solid var(--ink); border-radius: 12px; }

.home-chips { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px 10px; inline-size: 100%; max-inline-size: 236px; }
.home-chip { position: relative; box-sizing: border-box; display: grid; place-items: center; aspect-ratio: 1; border: 1.5px solid color-mix(in oklab, var(--line) 55%, var(--muted)); border-radius: 50%; color: var(--muted); font-size: 0.75rem; font-weight: var(--w-ui); line-height: 1; }
.home-chip[data-on] { border-color: transparent; background: var(--k); color: var(--on-key); font-weight: var(--w-strong); }
.home-chip.home-ring::after { inset: -5.5px; border-radius: 50%; }

.home-levels { display: grid; gap: 16px; inline-size: 100%; max-inline-size: 236px; }
.home-label { justify-self: start; padding: 1px 10px 2px; border: 1.5px solid transparent; border-radius: 9px; background: var(--k); color: var(--on-key); font-size: 1.0625rem; line-height: 1.3; }
.home-fader { position: relative; block-size: 20px; }
.home-groove { position: absolute; inset: 6px 0; border-radius: 999px; background: color-mix(in oklab, var(--line) 70%, var(--muted) 30%); overflow: hidden; }
.home-fill, .home-rail { position: absolute; inset: 0; translate: -30% 0; }
.home-fill { border-block-start: 8px solid var(--k); }
.home-thumb { position: absolute; inset-block: 0; inset-inline-end: -10px; box-sizing: border-box; inline-size: 20px; border: 2px solid var(--well); border-radius: 50%; background: var(--ink); }
.home-files { display: flex; gap: 6px; }
.home-file { padding: 3px 10px; border: 1.5px solid transparent; border-radius: 999px; background: var(--ink); color: var(--canvas); font-size: 0.75rem; font-weight: var(--w-ui); line-height: 1.3; }

.home-foot { margin-block-start: auto; color: var(--muted); font-size: 0.8125rem; font-weight: var(--w-text); line-height: 1.5; }
.home-foot p { margin: 0; text-wrap: pretty; }
.home-foot a { color: inherit; text-decoration: underline; text-decoration-color: color-mix(in oklab, currentColor 45%, transparent); text-underline-offset: 0.2em; border-radius: 4px; }
@media (hover: hover) {
  .home-foot a:hover { color: var(--ink); text-decoration-color: currentColor; }
}

@media (max-width: 479px) {
  .home-way { grid-template-columns: minmax(0, 1fr); }
  .home-way p { padding-inline: 4px; }
  .home-ways { gap: 16px; }
}
@media (min-width: 640px) {
  .home { padding-inline: 24px; }
  .home-steps { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
}
@media (min-width: 900px) {
  .home-hero { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; gap: 56px; }
}
/* A short laptop window: keep the three steps on the first screen. */
@media (min-width: 900px) and (max-height: 760px) {
  .home { gap: 28px; padding-block-start: 44px; }
  .home-main { gap: 44px; }
}

@media (prefers-reduced-motion: no-preference) {
  .home-hero > *, .home-main > section, .home-foot { animation: home-in 480ms cubic-bezier(0.2, 0.7, 0.2, 1) backwards; }
  .home-hero > :nth-child(2) { animation-delay: 60ms; }
  .home-main > section { animation-delay: 120ms; }
  .home-main > section ~ section, .home-foot { animation-delay: 180ms; }
  .home .home-go { transition: scale 200ms var(--spring), background-color 120ms ease-out, border-color 120ms ease-out; }
  .home .home-go:active { scale: 0.96; }
  .home-where summary { transition: color 120ms ease-out; }
  .home-where summary::before { transition: rotate 200ms var(--spring); }
  .home-where[open] dl { animation: home-in 240ms ease-out; }
  .home-ring::after { animation: home-ring 360ms var(--spring) 700ms backwards; }
  .home-chip.home-ring { animation: home-pick 320ms var(--spring) calc(1100ms + var(--nth) * 140ms) backwards; }
  .home-chip.home-ring::after { animation-delay: calc(1100ms + var(--nth) * 140ms); }
  .home-fill, .home-rail { animation: home-level 700ms cubic-bezier(0.3, 0.9, 0.3, 1) 1700ms backwards; }
}
@keyframes home-in { from { opacity: 0; translate: 0 10px; } }
@keyframes home-ring { from { opacity: 0; scale: 0.7; } }
@keyframes home-pick { from { border-color: color-mix(in oklab, var(--line) 55%, var(--muted)); background: transparent; color: var(--muted); scale: 0.8; } }
@keyframes home-level { from { translate: -72% 0; } }

@media (forced-colors: active) {
  .home-art { border-color: CanvasText; }
  .home-tile[data-empty], .home-chip:not([data-on]) { border-style: dashed; }
  .home-groove { border: 1px solid CanvasText; }
  .home-thumb { background: CanvasText; }
}
`;

/** The key the pictures follow (0-based): 02, amber. */
const HERO_KEY = 1;
/** A key left empty in the first picture, to show an open slot. */
const EMPTY_KEY = 14;
/** The second picture's channels and the key each one plays. */
const CHIP_KEYS: Partial<Record<number, number>> = {
  1: 0,
  2: 0,
  5: HERO_KEY,
  6: HERO_KEY,
  7: HERO_KEY,
};

/** Step 1: the ME-1's 2 × 8 keys, each its own colour, with the ring on one. */
const KeysArt = () => (
  <div className="home-tiles">
    {Array.from({ length: 16 }, (_, index) => (
      <span
        // biome-ignore lint/suspicious/noArrayIndexKey: the 16 keys are fixed places
        key={index}
        className={index === HERO_KEY ? 'home-tile home-ring' : 'home-tile'}
        data-empty={index === EMPTY_KEY ? '' : undefined}
        style={keyStyle(index)}
      />
    ))}
  </div>
);

/** Step 2: channel numbers, three of them taking the picked key's colour. */
const ChannelsArt = () => {
  let picked = 0;
  return (
    <div className="home-chips">
      {Array.from({ length: 12 }, (_, i) => {
        const channel = i + 1;
        const key = CHIP_KEYS[channel];
        const mine = key === HERO_KEY;
        return (
          <span
            key={channel}
            className={mine ? 'home-chip home-ring' : 'home-chip'}
            data-on={key === undefined ? undefined : ''}
            style={
              key === undefined
                ? undefined
                : ({ ...keyStyle(key), '--nth': mine ? picked++ : 0 } as CSSProperties)
            }
          >
            {channel}
          </span>
        );
      })}
    </div>
  );
};

/** Step 3: the key's label, its level, and the two files that come out. */
const LevelsArt = () => (
  <div className="home-levels" style={keyStyle(HERO_KEY)}>
    <span className="display home-label">Perc</span>
    <div className="home-fader">
      <div className="home-groove">
        <div className="home-fill" />
      </div>
      <div className="home-rail">
        <div className="home-thumb" />
      </div>
    </div>
    <div className="home-files">
      <span className="home-file">.ME1 ↓</span>
      <span className="home-file">.meu ↓</span>
    </div>
  </div>
);

const Step = ({
  n,
  title,
  art,
  children,
}: {
  readonly n: number;
  readonly title: string;
  readonly art: ReactNode;
  readonly children: ReactNode;
}) => (
  <li className="home-step">
    <div className="home-art" aria-hidden="true">
      {art}
    </div>
    <h3>
      {/* The list item already says which step this is. */}
      <span className="home-n" aria-hidden="true">
        {n}
      </span>
      {title}
    </h3>
    <p>{children}</p>
  </li>
);

/** The front door: what this is, the ways to begin, past sessions, and how the editor works. */
export const Home = () => {
  const startNew = useSetAtom(resetAtom);
  const startExample = useSetAtom(startExampleAtom);
  const openButton = useRef<TamaguiElement>(null);
  const id = useId();
  return (
    <div className="home">
      <style href="home" precedence="default">
        {HOME_CSS}
      </style>
      <main className="home-main">
        <div className="home-notice">
          <LoadNotice />
        </div>
        <div className="home-hero">
          <div>
            <h1 className="display home-mark">
              <Wordmark />
              <span className="home-sr">ME-1 Mate</span>
            </h1>
            <p className="home-pitch">
              Set up the keys of an Allen &amp; Heath <span className="home-nw">ME-1</span> personal
              mixer, and the channel names of its <span className="home-nw">ME-U</span> hub, in your
              browser.
            </p>
          </div>
          <section aria-labelledby={`${id}-begin`}>
            <h2 id={`${id}-begin`} className="home-sr">
              Ways to begin
            </h2>
            <ul className="home-ways">
              <li className="home-way">
                <Action
                  ref={openButton}
                  kind="primary"
                  className="home-go target"
                  aria-describedby={`${id}-open`}
                  onPress={chooseFiles}
                >
                  Open files
                </Action>
                <p id={`${id}-open`}>
                  An .ME1, a .meu or both. You can also drop them anywhere on this page.
                </p>
              </li>
              <li className="home-way">
                <Action
                  kind="subtle"
                  className="home-go target"
                  aria-describedby={`${id}-new`}
                  onPress={() => startNew()}
                >
                  Start new
                </Action>
                <p id={`${id}-new`}>A blank ME-1 and ME-U, to set up from scratch.</p>
              </li>
              <li className="home-way">
                <Action
                  kind="subtle"
                  className="home-go target"
                  aria-describedby={`${id}-example`}
                  onPress={() => startExample()}
                >
                  Try the example
                </Action>
                <p id={`${id}-example`}>A made-up band, to see a filled-in system.</p>
              </li>
            </ul>
            <details className="home-where">
              <summary>Where do I find these files?</summary>
              <dl>
                <div>
                  <dt>.ME1, the ME-1’s config</dt>
                  <dd>
                    The ME-1 saves it to its USB stick, in the <b>ME1CFG</b> folder. Put the one you
                    export back in that folder to load it.
                  </dd>
                </div>
                <div>
                  <dt>.meu, the ME-U’s channel setup</dt>
                  <dd>Exported from the ME-U. Load the one you export here back into it.</dd>
                </div>
              </dl>
            </details>
          </section>
        </div>

        <SessionList emptyFocus={openButton} />

        <section className="home-section" aria-labelledby={`${id}-how`}>
          <h2 id={`${id}-how`} className="display home-h2">
            How it works
          </h2>
          <ol className="home-steps">
            <Step n={1} title="Pick a key" art={<KeysArt />}>
              The ME-1 has 16 keys. Choose the one you want to set up.
            </Step>
            <Step n={2} title="Pick its channels" art={<ChannelsArt />}>
              Press channel numbers to give them to the key. A key can play one channel or a group.
            </Step>
            <Step n={3} title="Set levels and export" art={<LevelsArt />}>
              Give the key a label, set its levels, then export the .ME1 and the .meu.
            </Step>
          </ol>
        </section>
      </main>
      <footer className="home-foot">
        <p>
          Made by{' '}
          <a href="https://joshmcmillan.com" target="_blank" rel="noreferrer">
            Josh McMillan
          </a>
          . The code is on{' '}
          <a href="https://github.com/mcmillan/2me2u" target="_blank" rel="noreferrer">
            GitHub
          </a>
          . Not affiliated with Allen &amp; Heath.
        </p>
      </footer>
    </div>
  );
};
