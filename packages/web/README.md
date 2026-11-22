# @mcmillan/me1-mate-web

A browser editor for ME-1 configs (`.ME1`) and ME-U channel setups (`.meu`),
built on [`@mcmillan/me1-mate-core`](../core). Everything runs in the browser;
files never leave the machine.

Live at <https://me1-mate.msd.audio/>, deployed to GitHub Pages by
`.github/workflows/ci.yml` on every push to `main`, once the checks and the
end-to-end tests have passed. The custom domain is
set in the repo's Pages settings, with its DNS record kept in the infra repo.

The app has two screens.

**Home** is the front door: what ME-1 Mate is, three ways to begin (open files,
start a new system, or try a built-in example band), a three-step "how it
works", and your past sessions. Every system you work on is a session, saved
in the browser as you go; the last 12 are listed with a small picture of their
keys, when they were edited, and whether they've been exported. Open one to
carry on, or delete it.

**The editor**, from 700px wide, has everything on one page (a phone gets
the same parts arranged for its screen; see below):

- **Keys**: the 16 keys laid out like the ME-1's, two rows of eight. Every
  key has its own colour, and everything that belongs to a key wears it: its
  tile, the channels it plays, and the inspector while it's selected. Select
  a key (click, or arrow keys, which follow the layout on screen) to work on
  it.
- **Channels**: all 40 channels at once, a cell per stereo pair, with a name
  for each channel and a link toggle per pair. A linked pair has one name, its
  first channel's, as on the ME-1; the second channel's name isn't shown or
  changed. Each channel's numbered chip assigns it to the selected key: an
  empty key becomes a channel key, a channel key switches channel, and a group
  adds the channel or, if it's already in, takes it out. A channel can be in
  one group, so picking it for another group moves it. A chip takes the colour
  of the key that plays it; open chips are channels no key uses. Pointing at a
  key fades the channels it doesn't play. While the selected key takes
  channels, the open chips' edges carry a hint of its colour, and pointing at
  or focusing a chip rings it in that colour with a `+` (a `−` on a group's
  own channel); without hover the `+` is always there, small. The inspector
  says what to press: "Press a channel's number in Channels to give it to
  this key" (with an arrow toward Channels) for a key with none yet, and a
  quieter reminder once it has some. Pressing a channel's name instead, while
  the key could take that channel, shows a one-time tip over its number ("To
  give Kick to Drums, press its number"); naming carries on as normal, and
  the tip doesn't come back once a channel has been picked.
- **Inspector**: the selected key's type (Empty, Channel, Group, Auto, Aux In
  or Tone, three to a row), label, level and mute, its pan, and for a group a
  level and pan for each of its channels. Aux In is the ME-1's rear-panel
  stereo Aux Input and Tone its 1 kHz test tone; neither takes channels, so
  picking is off for them. Switching type keeps what the new type also has
  (label, level, mute, and pan between a channel key and Aux In). It stays in
  view beside the keys and channels on a wide screen and sits between them on
  a narrow one.
- **Pan**: a slider over the ME-1's own pan steps (0 hard left, 37 centre, 74
  hard right), called Balance on a stereo pair and on Aux In. Its readout
  counts steps from the centre, `L 12`, `C`, `R 30`: the steps are the
  ME-1's, but showing them that way is this editor's choice, not something
  read from the ME-1's screen. Double-click the thumb, press `C`, or use
  Centre (in a group's row, press the readout) to centre it. A tone and a
  group's master have no pan.
- **Level**: the fader runs from off to the most an ME-1 saves (+9.6 dB on
  this scale, the top of its bar), so nothing it writes is beyond what the
  hardware writes.
- **One slider**: level and pan are the same control, with the same track,
  thumb and edges, and a readout in a fixed-width slot at the end; they
  differ by meaning. The level fills from off to the thumb, the pan from the
  centre out, both in the key's colour, and each has a tick (0 dB, centre).
  A group's channels are a grid: the name and number (and "Balance" for a
  stereo pair), the level with the pan under it in the same column, and the
  remove ✕ in a column of its own. There's no column header: the readouts
  (dB, then `C` / `L 12` / `R 30`) say which slider is which, and each has
  its own accessible name ("Kick 1 level in key 1", "Kick 1 pan in key 1").
- **Mute**: a toggle beside the level; a muted key's tile shows a crossed-out
  speaker (and the word where there's room) and says "muted" to screen
  readers.
- **Top bar**: the wordmark (back to Home), the config's name (the `.ME1`
  file's name), a `?` that starts the tour, undo and redo (⌘Z / ⇧⌘Z), Open,
  New, whether the system is ready to export, and Export.
- **Keyboard shortcuts**: press `?` anywhere in the editor (outside a text
  field) for a sheet listing them all: undo and redo, moving through keys and
  channels, typing channel names straight through, and the level and pan
  keys. On a phone it's also in the ⋯ menu.
- **Tour**: a four-step walk through keys, channels, the inspector and export.
  On a phone it has its own steps (seven at most): the key screen; then a
  key's page, opened for real (the first channel or group key, or on a blank
  system key 1), one part per step: its top with ‹ › and Done, the type
  switch, label, level and mute, and the channel picker (a part the key's
  page doesn't have is left out); then the Channels screen, which it switches
  to for that step, then Export and the ⋯ menu. Each part is lit and scrolled
  into view above the step's card while the rest dims. Leaving those steps
  closes the page and selects the key you had before; the tour changes
  nothing. It runs the first time you reach the editor and any time from the
  `?` (on a phone, from the ⋯ menu).
- **Opening files**: press Open, or drop an `.ME1`, a `.meu`, or both
  anywhere, on either screen. Opening files, like New, starts a new session
  and never overwrites the one that was open, so nothing asks you to confirm.
  The one exception: opening the missing half of what's open (a `.meu` for a
  system loaded from an `.ME1` alone, or the reverse) adds it to that session.
- **Problems**: anything the ME-1 would reject is explained in plain English
  under the field (once you leave it, and announced to screen readers),
  counted in the top bar, and one click away.
- **Export**: the Export menu saves `{CONFIG}.ME1` (for the ME1CFG folder on
  the ME-1's USB stick) and `ChannelSetup.meu` (for the ME-U), and says why
  when it can't. "Unsaved changes" means not exported yet, and tracks each
  file: exporting only the `.ME1` doesn't hide unsaved channel names, and
  undoing back to where you started isn't unsaved work.

**On a phone** (narrower than 700px, or a touch screen under 500px tall, a
phone on its side) the editor is the same parts, arranged so nothing is a
long scroll away:

- **The key screen** is home: the 16 keys fill the screen exactly, with no
  scrolling, four by four upright and two rows of eight on its side. Tap a
  key to open it.
- **The key sheet** rises from the bottom and nearly fills the screen, with
  everything about that key in one place: its colour, number, type and label
  at the top (which stays put while the rest scrolls), ‹ › to step to the
  keys either side, and Done; then its type, label, level, mute and pan, a
  group's channels with their levels and pans; and then the channel picker, a tile per channel
  (two to a pair), in the colour of the key that plays it and with that key's
  number, ringed where the open key plays it. Picking works as in Channels.
  A key that takes no channels (Auto, Aux In, Tone) has no picker, so its
  sheet ends with its level. Done, Escape, the back gesture or a tap on the
  strip above close it, and the key you ended on has focus (with no focus
  ring when you closed it with a tap).
- **The Channels screen**, chosen with the Keys | Channels switch under the
  top bar, is the channel grid for naming channels and linking pairs, with
  no key selected; a key's number on a channel opens that key.
- **The top bar** is calmer: the config's name, the problems count when
  there are any, Export, and a menu (`⋯`) with Undo, Redo, Open files, Start
  new, Show me around and Home.
- **Problems** in the list open the key's sheet at the field, or the
  Channels screen for a channel's.

The typeface is [Allo](https://allo.joshpuckett.me/) by Josh Puckett, served
from `public/fonts` under the SIL Open Font License (`Allo-OFL.txt` beside
it).

Editing a loaded file changes only what you edit: the export is written over
the original, so everything the editor doesn't show is kept.

## Offline and installable

After one visit online the editor opens and works with no network (a laptop
at a venue with no wifi), and browsers that support it offer to install it as
an app (`public/manifest.webmanifest`).

- **The service worker** (`src/sw.js`) is written into the build as `sw.js`
  by the `serviceWorker` plugin in `vite.config.ts`, with the list of every
  built file to precache (the page, scripts, styles, the font, the icons and
  the manifest; not the link preview image or the crawler files) and a
  version hashed from their contents. Only the build registers it
  (`main.tsx`); the dev server has none.
- **Updates:** the page itself is fetched network-first, so a visit online
  always gets the latest deploy, and a new build's worker installs a fresh
  cache, takes over at once and deletes the old one. It never reloads a page:
  a page that's open keeps the code it loaded and picks up the new build the
  next time it's opened. Offline (or after four seconds without an answer),
  the cached page is used.
- **Sessions** stay in `localStorage` and files are read in the page, so
  nothing about them changes offline.

`index.html` also carries what crawlers and link unfurlers read: a short
description and the three steps inside `#root` (shown, plainly styled, until
React replaces it), the canonical URL, Open Graph and Twitter card tags, and
`SoftwareApplication` structured data. These use the absolute address
`https://me1-mate.msd.audio/`, as do `public/robots.txt` and
`public/sitemap.xml`; change them all if the site moves.

### `public/`

```
public
├── manifest.webmanifest   name, colours, icons; relative URLs, so it works under any base path
├── icons/                 icon-192, icon-512 and icon-maskable-512 PNGs
├── apple-touch-icon.png   180 px, for iOS home screens
├── og-image.png           1200×630 link preview
├── robots.txt, sitemap.xml
└── fonts/                 Allo and its licence
```

The PNGs are drawn by `scripts/render-images.ts` (HTML in headless Chrome,
with Allo and the key colours from `src/lib/theme.ts`) and committed, so the
build needs no browser. Run `pnpm --filter @mcmillan/me1-mate-web images`
after changing the mark or the colours. The inline SVG favicon in
`index.html` is separate.

## Develop

```sh
pnpm dev        # from the repo root, or `pnpm --filter @mcmillan/me1-mate-web dev`
pnpm build      # production build into packages/web/dist
pnpm --filter @mcmillan/me1-mate-web test   # unit tests for src/lib
pnpm e2e        # end-to-end tests of the production build, Chromium only, 2 at a time (from the repo root)
pnpm e2e:all    # every browser and phone, as CI runs it (heavy)
pnpm e2e:all --project webkit   # one of: chromium, firefox, webkit, iphone, pixel
BASE_PATH=/sub/ pnpm build      # to serve from a sub-path instead of a domain's root
pnpm --filter @mcmillan/me1-mate-web images        # redraw the icons and link preview
```

The end-to-end tests (`e2e/`, Playwright) build the editor and serve it with
`vite preview` on port 4317, then run every check in Chromium, Firefox and
WebKit on a desktop window and on an iPhone and a Pixel: the journeys (Home,
picking channels, opening and byte-exact exporting, sessions, the tour, the
keyboard), working offline after one visit (Chromium, where the service
worker can be driven), the installable manifest and the crawlable HTML, the
layout at six window sizes in both colour schemes, an axe scan
of every screen and dialog in both colour schemes. Reports and traces go
to `e2e-results/`. Install the browsers once with
`pnpm --filter @mcmillan/me1-mate-web exec playwright install chromium firefox webkit`.

## Stack

React 19 and Vite, [Tamagui](https://tamagui.dev) for styling (v6 config,
shorthand props only), and [Jotai](https://jotai.org) for state.

```
src
├── main.tsx             Tamagui provider, follows the system colour scheme; registers the service worker
├── sw.js                the service worker (copied into the build by vite.config.ts)
├── App.tsx              Home or the editor: top bar, then the one page or the phone layout, tour
├── styles.css           colours, type weights, the page layout, focus rings, touch sizes
├── components/
│   ├── Home.tsx, SessionList.tsx    the home screen and the list of sessions
│   ├── TopBar.tsx       wordmark, config name, undo/redo, open, new, tour, problems, export; the phone's bar and menu
│   ├── ScreenTabs.tsx   the phone's Keys | Channels switch (a tablist)
│   ├── KeySheet.tsx     the phone's key sheet (native <dialog>): the inspector and channel picker
│   ├── Wordmark.tsx     the ME-1 Mate logo, ME-1 on an orange plate
│   ├── KeyGrid.tsx      the 16 keys in the ME-1's 2×8 layout (4×4 filling an upright phone)
│   ├── Inspector.tsx    editor for the selected key (also the key sheet's body)
│   ├── ChannelGrid.tsx  channel names, stereo links, picking channels for a key (all, or the phone's pick or names part)
│   ├── Fader.tsx        level fader (a native range input on the fader law) and the pan control
│   ├── Tour.tsx         the guided walk through the editor, one for the one page and one for phones (through a key's sheet)
│   ├── Shortcuts.tsx    the keyboard shortcuts sheet (`?`)
│   ├── OpenFiles.tsx, WindowDrop.tsx              opening and dropping files
│   ├── LoadNotice.tsx, Notice.tsx                 files that couldn't be opened
│   ├── ExportMenu.tsx, ProblemsButton.tsx, Menu.tsx   top bar menus (popover)
│   ├── ConfirmDialog.tsx modal confirmation (native <dialog>)
│   ├── FieldError.tsx, Toasts.tsx
│   └── ui.tsx           Action (the shared button), Panel, PanelTitle, Card
└── lib
    ├── store.ts         Jotai atoms: the screen, the system, history, selection, the phone's screen and sheet, opening files
    ├── layout.ts        the phone layout: its width, and where a problem's field is in it
    ├── focus.ts         returnFocus: focus put back after a close, with no ring after a tap
    ├── edit.ts          pure edits on a system, including pickChannel
    ├── example.ts       the built-in example band
    ├── files.ts         reading files, downloading exports
    ├── messages.ts      plain-English problems
    ├── session.ts       sessions: saved as you go, listed, reopened
    ├── shortcuts.ts     undo/redo keys and `?` for the shortcuts sheet
    ├── announce.ts      messages for screen readers
    └── theme.ts         the typeface and the key colours
public                   manifest, icons, link preview, robots.txt, sitemap, fonts (see above)
scripts
└── render-images.ts     draws the icons and the link preview into public/
test
└── edit.test.ts         the pure edits, the example, and where problems live on a phone
e2e
├── helpers.ts           the page fixture (empty storage, tour seen, no page errors) and locators
├── home, picks, files, sessions, tour, layout .spec.ts   the journeys and the layout
├── shortcuts.spec.ts    the `?` sheet
├── phone.spec.ts        the phone layout: key sheet, Channels screen, menu, tour, problems, fit
├── a11y.spec.ts         axe scans of every screen and dialog
├── offline.spec.ts      works offline after one visit (Chromium)
└── page.spec.ts         manifest, installability, crawlable HTML
```
