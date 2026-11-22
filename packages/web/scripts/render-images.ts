/**
 * Renders the app icons and the social preview image into `public/`, by
 * drawing them as HTML in headless Chrome with the app's own typeface and key
 * colours. Run it after changing the brand mark or the colours:
 *
 *   pnpm --filter @mcmillan/me1-mate-web images
 *
 * The PNGs are committed, so building the app never needs a browser. It uses
 * the installed Google Chrome, or Playwright's Chromium when PW_CHANNEL=chromium
 * (`pnpm exec playwright install chromium` first).
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { KEY_COLORS } from '../src/lib/theme.ts';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));

/** In step with `--canvas`, `--ink`, `--muted`, `--well` in src/styles.css and Wordmark.tsx. */
const CANVAS = '#fbfaf8';
const INK = '#131316';
const MUTED = '#6f6e78';
const WELL = '#f1efea';
const ORANGE = '#ee5a1e';
/** `--w-black`, `--w-display`, `--w-strong`, `--w-text` in src/styles.css. */
const W_BLACK = 760;
const W_DISPLAY = 680;
const W_STRONG = 600;
const W_TEXT = 430;

const font = (await readFile(`${PUBLIC}fonts/AlloVariable.woff2`)).toString('base64');

const page = (
  size: { width: number; height: number },
  body: string,
  css: string,
) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
@font-face { font-family: Allo; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 100 900; }
* { box-sizing: border-box; }
html, body { margin: 0; width: ${size.width}px; height: ${size.height}px; overflow: hidden; background: transparent; }
body { font-family: Allo; font-feature-settings: "tnum", "ss02"; -webkit-font-smoothing: antialiased; }
.plate { display: grid; place-items: center; background: ${ORANGE}; color: #fff; font-weight: ${W_BLACK}; letter-spacing: -0.02em; font-variation-settings: "ROND" 0; line-height: 1; }
${css}
</style></head><body>${body}</body></html>`;

/**
 * An app icon: "ME-1" on the orange plate. `radius` rounds the plate (0 for
 * full-bleed icons the platform masks); `text` is the word's width as a share
 * of the icon, smaller for a maskable icon so it stays in the safe zone.
 */
const icon = (size: number, radius: number, text: number) =>
  page(
    { width: size, height: size },
    `<div class="plate" style="width:${size}px;height:${size}px;border-radius:${radius * size}px"><span id="w">ME-1</span></div>`,
    `#w { display: inline-block; font-size: ${size * 0.3}px; padding-bottom: ${size * 0.02}px; }`,
  ).replace(
    '</body>',
    // Size the word to its target width, whatever the font's metrics.
    `<script>const w = document.getElementById('w'); document.fonts.ready.then(() => { w.style.fontSize = (parseFloat(getComputedStyle(w).fontSize) * ${size * text} / w.getBoundingClientRect().width) + 'px'; document.body.dataset.ready = ''; });</script></body>`,
  );

/** The 1200×630 link preview: the wordmark, what it is, and a 2×8 of key tiles. */
const preview = () => {
  const tiles = KEY_COLORS.map(
    (colour, index) =>
      `<span class="tile${index === 1 ? ' ring' : ''}${index === 14 ? ' empty' : ''}" style="--k:${colour}"></span>`,
  ).join('');
  return page(
    { width: 1200, height: 630 },
    `<main>
      <div class="wm"><span class="plate model">ME-1</span><span class="mate">Mate</span></div>
      <p class="pitch">Set up the keys of an Allen &amp; Heath ME-1 personal mixer and name its ME-U’s channels, in your browser.</p>
      <div class="foot">
        <p class="small"><b>me1-mate.msd.audio</b><br>Free, and works offline.<br>Not affiliated with Allen &amp; Heath.</p>
        <div class="well"><div class="tiles">${tiles}</div></div>
      </div>
    </main>`,
    `
    body { background: ${CANVAS}; color: ${INK}; }
    main { display: flex; flex-direction: column; height: 100%; padding: 72px 80px 64px; }
    .wm { display: flex; align-items: center; gap: 0.22em; font-size: 104px; line-height: 1; }
    .model { display: inline-block; padding: 0.1em 0.2em 0.12em; border-radius: 0.14em; }
    .mate { font-weight: ${W_DISPLAY}; letter-spacing: -0.02em; font-variation-settings: "ROND" 100; }
    .pitch { max-width: 30ch; margin: 40px 0 0; font-size: 46px; font-weight: ${W_TEXT}; line-height: 1.22; letter-spacing: -0.01em; font-variation-settings: "ROND" 60; text-wrap: balance; }
    .foot { display: flex; align-items: flex-end; justify-content: space-between; gap: 40px; margin-top: auto; }
    .well { padding: 22px 26px; border-radius: 26px; background: ${WELL}; }
    .tiles { display: grid; grid-template-columns: repeat(8, 44px); gap: 10px; }
    .tile { position: relative; aspect-ratio: 1; border-radius: 11px; background: var(--k); }
    .tile.empty { background: transparent; border: 2px solid #c9c6c0; }
    .tile.ring::after { content: ""; position: absolute; inset: -7px; border: 3px solid ${INK}; border-radius: 16px; }
    .small { margin: 0 0 4px; color: ${MUTED}; font-size: 22px; font-weight: ${W_TEXT}; line-height: 1.5; white-space: nowrap; font-variation-settings: "ROND" 60; }
    .small b { color: ${INK}; font-weight: ${W_STRONG}; }
    `,
  ).replace(
    '</body>',
    `<script>document.fonts.ready.then(() => { document.body.dataset.ready = ''; });</script></body>`,
  );
};

const images: { file: string; width: number; height: number; html: string }[] = [
  // "any" icons: the rounded plate, as the favicon draws it.
  { file: 'icons/icon-192.png', width: 192, height: 192, html: icon(192, 0.22, 0.72) },
  { file: 'icons/icon-512.png', width: 512, height: 512, html: icon(512, 0.22, 0.72) },
  // Maskable: full bleed, the word inside the central 80% safe circle.
  { file: 'icons/icon-maskable-512.png', width: 512, height: 512, html: icon(512, 0, 0.56) },
  // iOS rounds the corners itself and shows transparency as black.
  { file: 'apple-touch-icon.png', width: 180, height: 180, html: icon(180, 0, 0.66) },
  { file: 'og-image.png', width: 1200, height: 630, html: preview() },
];

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
try {
  for (const image of images) {
    const tab = await browser.newPage({
      viewport: { width: image.width, height: image.height },
      deviceScaleFactor: 1,
    });
    await tab.setContent(image.html);
    await tab.waitForSelector('body[data-ready]');
    await tab.screenshot({ path: `${PUBLIC}${image.file}`, omitBackground: true });
    await tab.close();
    console.log(`public/${image.file}`);
  }
} finally {
  await browser.close();
}
