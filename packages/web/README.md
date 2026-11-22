# @mcmillan/me1-mate-web

A browser editor for ME-1 configs (`.ME1`) and ME-U channel setups (`.meu`),
built on [`@mcmillan/me1-mate-core`](../core). Everything runs in the browser;
files never leave the machine.

Live at <https://mcmillan.github.io/2me2u/>, deployed by
`.github/workflows/pages.yml` on every push to `main`.

The app has two screens.

**Home** is the front door: what ME-1 Mate is, three ways to begin (open files,
start a new system, or try a built-in example band), a three-step "how it
works", and your past sessions. Every system you work on is a session, saved
in the browser as you go; the last 12 are listed with a small picture of their
keys, when they were edited, and whether they've been exported. Open one to
carry on, or delete it.

**The editor** has everything on one page:

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
  key fades the channels it doesn't play.
- **Inspector**: the selected key's type, label and level, and for a group a
  level for each of its channels. It stays in view beside the keys and
  channels on a wide screen and sits between them on a narrow one.
- **Top bar**: the wordmark (back to Home), the config's name (the `.ME1`
  file's name), a `?` that starts the tour, undo and redo (⌘Z / ⇧⌘Z), Open,
  New, whether the system is ready to export, and Export.
- **Tour**: a four-step walk through keys, channels, the inspector and export.
  It runs the first time you reach the editor and any time from the `?`.
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

The typeface is [Allo](https://allo.joshpuckett.me/) by Josh Puckett, served
from `public/fonts` under the SIL Open Font License (`Allo-OFL.txt` beside
it).

Editing a loaded file changes only what you edit: the export is written over
the original, so everything the editor doesn't show is kept.

## Develop

```sh
pnpm dev        # from the repo root, or `pnpm --filter @mcmillan/me1-mate-web dev`
pnpm build      # production build into packages/web/dist
pnpm --filter @mcmillan/me1-mate-web test   # unit tests for src/lib
BASE_PATH=/2me2u/ pnpm build   # as deployed to GitHub Pages
```

## Stack

React 19 and Vite, [Tamagui](https://tamagui.dev) for styling (v6 config,
shorthand props only), and [Jotai](https://jotai.org) for state.

```
src
├── main.tsx             Tamagui provider, follows the system colour scheme
├── App.tsx              Home or the editor: top bar, keys, inspector, channels, tour
├── styles.css           colours, type weights, the page layout, focus rings, touch sizes
├── components/
│   ├── Home.tsx, SessionList.tsx    the home screen and the list of sessions
│   ├── TopBar.tsx       wordmark, config name, undo/redo, open, new, tour, problems, export
│   ├── Wordmark.tsx     the ME-1 Mate logo, set like a front-panel label
│   ├── KeyGrid.tsx      the 16 keys in the ME-1's 2×8 layout
│   ├── Inspector.tsx    editor for the selected key
│   ├── ChannelGrid.tsx  channel names, stereo links, picking channels for a key
│   ├── Fader.tsx        level fader (a native range input on the fader law)
│   ├── Tour.tsx         the guided walk through the editor
│   ├── OpenFiles.tsx, WindowDrop.tsx              opening and dropping files
│   ├── LoadNotice.tsx, Notice.tsx                 files that couldn't be opened
│   ├── ExportMenu.tsx, ProblemsButton.tsx, Menu.tsx   top bar menus (popover)
│   ├── ConfirmDialog.tsx modal confirmation (native <dialog>)
│   ├── FieldError.tsx, Toasts.tsx
│   └── ui.tsx           Action (the shared button), Panel, PanelTitle, Card
└── lib
    ├── store.ts         Jotai atoms: the screen, the system, history, selection, opening files
    ├── edit.ts          pure edits on a system, including pickChannel
    ├── example.ts       the built-in example band
    ├── files.ts         reading files, downloading exports
    ├── messages.ts      plain-English problems
    ├── session.ts       sessions: saved as you go, listed, reopened
    ├── shortcuts.ts     undo/redo keys
    ├── announce.ts      messages for screen readers
    └── theme.ts         the typeface and the key colours
public/fonts             Allo (variable WOFF2) and its licence
test
└── edit.test.ts         the pure edits and the example
```
