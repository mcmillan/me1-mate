# @mcmillan/2me2u-web

A browser editor for ME-1 configs (`.ME1`) and ME-U channel setups (`.meu`),
built on [`@mcmillan/2me2u-core`](../core). Everything runs in the browser;
files never leave the machine.

Live at <https://mcmillan.github.io/2me2u/>, deployed by
`.github/workflows/pages.yml` on every push to `main`.

Everything is on one page, with no welcome screen and no tabs:

- **Keys**: the 16 keys laid out like the ME-1's, two rows of eight, each
  showing its label, what it plays and its level. Select one (click, or arrow
  keys, which follow the layout on screen) and it becomes the key you're
  working on.
- **Channels**: all 40 channels at once, by stereo pair: a name for each and
  a link toggle per pair. A linked pair has one name, its first channel's, as
  on the ME-1; the second channel's name isn't shown or changed. Each channel has a numbered pick button that assigns
  it to the selected key: an empty key becomes a channel key, a channel key
  switches channel, and a group adds the channel or, if it's already in, takes
  it out. A channel can be in one group, so picking it for another group moves
  it. Small markers show which keys use each channel; press one to go to that
  key.
- **Inspector**: the selected key's type, label and level, and for a group a
  level for each of its channels. It stays in view beside the keys and
  channels on a wide screen and sits between them on a narrow one.
- **Top bar**: the config's name (the `.ME1` file's name), undo and redo
  (⌘Z / ⇧⌘Z), Open, New, whether the system is ready to export, and Export.
- **Starting**: the page opens on a blank system with a short note on how to
  begin: drop an `.ME1`, a `.meu`, or both anywhere in the window, press Open,
  or just start picking. If you were editing before, the page reopens where
  you left it.
- **Problems**: anything the ME-1 would reject is explained in plain English
  under the field (once you leave it, and announced to screen readers),
  counted in the top bar, and one click away.
- **Export**: the Export menu saves `{CONFIG}.ME1` (for the ME1CFG folder on
  the ME-1's USB stick) and `ChannelSetup.meu` (for the ME-U), and says why
  when it can't.
- **Safety**: an unsaved-changes marker that tracks each file (exporting
  only the `.ME1` doesn't hide unsaved channel names, and undoing back to
  where you started isn't unsaved work), a confirmation before New or opened
  files replace unsaved work, and autosave in the browser, so a reload or
  closed tab doesn't lose anything. Notifications about errors stay until
  dismissed.

Editing a loaded file changes only what you edit: the export is written over
the original, so everything the editor doesn't show is kept.

## Develop

```sh
pnpm dev        # from the repo root, or `pnpm --filter @mcmillan/2me2u-web dev`
pnpm build      # production build into packages/web/dist
pnpm --filter @mcmillan/2me2u-web test   # unit tests for src/lib
BASE_PATH=/2me2u/ pnpm build   # as deployed to GitHub Pages
```

## Stack

React 19 and Vite, [Tamagui](https://tamagui.dev) for styling (v6 config,
shorthand props only), and [Jotai](https://jotai.org) for state.

```
src
├── main.tsx             Tamagui provider, follows the system colour scheme
├── App.tsx              the one page: top bar, notices, keys, inspector, channels
├── styles.css           surfaces, the page layout, focus rings, touch sizes
├── components/
│   ├── TopBar.tsx       config name, undo/redo, open, new, problems, export
│   ├── KeyGrid.tsx      the 16 keys in the ME-1's 2×8 layout
│   ├── Inspector.tsx    editor for the selected key
│   ├── ChannelGrid.tsx  channel names, stereo links, picking channels for a key
│   ├── Fader.tsx        level fader (a native range input on the fader law)
│   ├── Intro.tsx, Notice.tsx                      notices above the workspace
│   ├── OpenFiles.tsx, WindowDrop.tsx              opening and dropping files
│   ├── ExportMenu.tsx, ProblemsButton.tsx, Menu.tsx   top bar menus (popover)
│   ├── ConfirmDialog.tsx modal confirmation (native <dialog>)
│   ├── FieldError.tsx, Toasts.tsx
│   └── ui.tsx           Action (the shared button), Panel, PanelTitle, TypeDot
└── lib
    ├── store.ts         Jotai atoms: the system, history, selection, toasts
    ├── edit.ts          pure edits on a system, including pickChannel
    ├── files.ts         reading dropped files, downloading exports
    ├── messages.ts      plain-English problems
    ├── session.ts       autosave and restore
    ├── shortcuts.ts     undo/redo keys
    ├── announce.ts      messages for screen readers
    └── theme.ts         accent and key-type colours
test
└── edit.test.ts         the pure edits
```
