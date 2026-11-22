# Working in this repo

ME-1 Mate reads and writes Allen & Heath ME-1 (`.ME1`) and ME-U (`.meu`) files
through one model of a monitoring system (`@mcmillan/me1-mate-core`), and offers a
browser editor on top of it (`@mcmillan/me1-mate-web`). The root `README.md` introduces the
repo and each package's own `README.md` documents its API; this file is for
anyone (human or agent) changing the code.

## Commands

Node 26 (`.nvmrc`) and pnpm. Run `pnpm check` (lint, typecheck, test) before
calling anything done, and `pnpm lint:fix` to let Biome format. A Husky
pre-commit hook runs Biome on staged files and fixes what it can, so a commit
never lands unformatted; don't bypass it with `--no-verify`.

## Keep the docs true

Documentation is part of a change, not a follow-up. When you change behaviour,
update the docs in the same change, and check them even when you think the
change is internal:

- **`packages/core/README.md`** describes the public API, the data model, the
  checked rules, the file formats and the source layout. If you add, rename or
  remove anything exported from `packages/core/src/index.ts`, change a type's
  fields, change a default, add or relax a validation rule, or move a file, that
  README must say so. Its code samples must run as written against the current
  API. The root `README.md` only lists the packages and how to develop; update
  it when a package is added or the toolchain changes.
- **`packages/core/src/formats/me1/schema.ts`** carries the binary format
  description in its header comment. It is the only write-up of the format, so
  anything new about the layout (a flag, a settings field, a range) goes there,
  and the core README's "not modelled" list is trimmed to match.
- **Doc comments** on the exported functions and types are what editors show
  users. Keep them accurate and short.
- The core README's "not modelled" list and the `unknown` key type mark the
  edges of the model. Don't present a guess as a fact anywhere.

A quick check before finishing: read `index.ts` and the core README side by side and
make sure every export is described and nothing described is gone.

## Design constraints

- **One model, two formats.** The `.meu` and `.ME1` both serialise the same
  `System`. Don't add format-specific fields to the model; put them in
  `source`, which carries what the model doesn't cover.
- **Byte-exact rewrites.** Encoding writes the model over the records a file
  was read from and touches only what the model covers. Every fixture must
  re-encode identically; the tests enforce it. New knowledge about the format
  should widen the model, not break this.
- **Plain data, Results for failure.** The model is readonly plain objects
  with optional fields for defaults, no wrapper types. Fallible operations
  return a true-myth `Result` whose error is `Issue[]`, reporting every issue
  found, each with a property path. Don't throw.
- **1-based channels** in the model, as the hardware displays them. The
  conversion to the ME-1's 0-based bytes happens only in `formats/me1`.
- **Small public surface.** Only `index.ts` is public. Export from a module
  only what another module uses; users need only the parse and build functions
  and the model types.
- **Naming.** The public API is plain functions: `parse<Format>Config` and
  `build<Format>Config`, plus `parseConfig` for both files. The system type is
  `System`. The formats are spelled `ME1` and `MEU` in identifiers
  (`parseME1Config`, `ME1.decode`) and `ME-1` / `ME-U` in prose. Lowercase
  `me1` / `meu` are only object keys, issue paths and directory names.
- **No presets.** The ME-1's preset slots are not part of the model or the
  API. The `.ME1` schema still describes and carries their pages so files
  rewrite byte for byte; don't surface them above `formats/me1/schema.ts`.
- **No CLI** in the core package.

## The web package

- React 19 and Vite. Styling is Tamagui with the stock v6 config: use its
  house style, which means shorthand props only (`items`, `justify`, `p`, `bg`,
  `rounded`, …) and its flat token names (`gap="3"`, `color="color-10"`). Don't
  loosen the config to allow long-hand props.
- State is Jotai: one `systemAtom` holds the editable system, and exports and
  validation issues are derived atoms. Edits are pure functions in
  `lib/edit.ts`, applied through `editAtom`.
- Two screens (`screenAtom`): Home (`Home.tsx`: ways to begin, how it
  works, past sessions) and the editor. From 700px wide the editor is one
  page (`App.tsx`, laid out by `.workspace` in `styles.css`): the key grid,
  the selected key's inspector and the channel grid are always on screen
  together; don't add views or tabs to it. Below 700px, or on a touch screen
  under 500px tall (a phone on its side; `PHONE_QUERY` in `lib/layout.ts`),
  it is the phone layout, and that has exactly three things: the key screen
  (the grid, all 16 keys filling the window exactly, 4×4 upright and 8×2 on
  its side, without scrolling), the key
  sheet (`KeySheet.tsx`: the inspector with the key's channel picker inside
  it, on a native modal `<dialog>`, `keySheetOpenAtom`) and the Channels
  screen (the channel grid for names and links, chosen with the top bar's
  Keys | Channels tablist, `phoneScreenAtom`); add nothing else. Both layouts
  place the same components (`variant` on `ChannelGrid`, `picker`/`onClose`
  on `Inspector`, `onOpen` on `KeyGrid`); don't fork them. Channels are
  assigned by picking: `pickChannel` in `lib/edit.ts` is the one gesture,
  applied to `selectedKeyAtom`, and `highlightKeyAtom` links a key and its
  channels on hover and focus. With files loaded the one-page editor must fit
  a 1280×720 window without scrolling, and the phone's key screen its
  window; check it when a panel grows. Judge empty space from viewport
  screenshots and `scrollHeight` against `innerHeight`, never full-page
  screenshots, which stretch anything sized in `dvh`. The tour (`Tour.tsx`) points at the
  regions by their roles and wrapper classes. The phone has its own steps
  (`phoneSteps`), each naming the screen it needs, since the phone has
  screens rather than regions; its `sheet` steps open a real key's sheet and
  walk its parts, with the step's card portalled into the sheet's `<dialog>`
  (the modal makes everything outside it inert) and the sheet's own content
  made inert instead of `main`. The tour never edits: it only selects the key
  and puts the old selection back. Keep both tours true when they change. The
  keyboard shortcuts sheet (`Shortcuts.tsx`, opened by `?`) lists every
  shortcut: update it whenever a key handler changes.
- Look: the typeface is Allo (`public/fonts`, set in `styles.css`; tabular,
  disambiguated figures, no monospace). Weights come only from the
  `--w-text`/`--w-ui`/`--w-strong`/`--w-display`/`--w-black` variables in
  `styles.css`, never numbers, so the page can be made lighter or heavier in
  one place. Colours: neutrals are `--canvas`, `--ink`, `--muted`, `--line`,
  `--card`, `--well` (the Tamagui tokens are tuned to match), and every key
  has its own colour (`keyColor` / `keyStyle` in `lib/theme.ts`, read as
  `var(--k)`, text on it `--on-key`). Colour means which key, never key type
  (say type in words); selected is an ink ring; focus is the blue `--focus`
  ring (focus put back after a close goes through `returnFocus` in
  `lib/focus.ts`: no ring after a tap, always one after a key); red means a
  problem. Show little at rest and reveal detail on hover
  and focus (always visible under `hover: none`). Component-specific CSS
  lives in a `<style>` block beside the component, with class names prefixed
  by it (`kg-`, `ch-`, `insp-`, `top-`, `fader-`, `notice-`, `home-`,
  `sess-`, `tour-`, `wm-`, `sheet`, `tabs-`, `sc-`).
- Everything runs in the browser; nothing is uploaded.
- It works offline after one visit. The service worker (`src/sw.js`, written
  into the build with its precache list by the plugin in `vite.config.ts`)
  precaches every built file except those `NOT_PRECACHED` names, fetches the
  page network-first and everything else cache-first. Keep it that way: the
  app must not depend on another origin at run time (it couldn't load
  offline), new files the app needs must land in the build output, and the
  worker must never reload a page (someone may be mid-edit). Only the build
  registers it. The icons and link preview are drawn by
  `scripts/render-images.ts`: change the script and rerun it, never edit the
  PNGs by hand. `e2e/offline.spec.ts` and `e2e/page.spec.ts` check offline
  use and the crawlable HTML; keep `index.html`'s static `#root` content true
  to Home.
- Use `Action` (`components/ui.tsx`) for every button: `primary` is the ink
  pill, `subtle` the outlined pill, `ghost` chrome-less.
- Tamagui 3 has no `hoverStyle`/`pressStyle`: use conditional values
  (`bg={{ default: 'color-2', hover: 'color-3' }}`). Breakpoints go in values
  the same way.
- "Unsaved changes" (`dirtyAtom`) means not exported yet: it compares what
  each file would be now with what was last loaded or exported, file by
  file; don't go back to comparing the system by identity.
- Sessions (`lib/session.ts`): the open system is saved as you go under its
  `sessionIdAtom`, and the last 12 are listed on Home. Opening files and New
  always start a new session, so nothing is overwritten and nothing asks to
  confirm; only the missing half of what's open (`.meu` for an `.ME1` alone,
  or the reverse) joins the open session (`openFilesAtom` in the store). A
  blank system with nothing loaded is never kept as a session.
- A linked stereo pair is named by its first channel only, as in the ME-1's
  own editor: don't offer a name field for the second channel, and don't
  change the name it already has (exports stay byte-exact).
- Linking a stereo pair points keys at the pair's first channel
  (`setStereo`); a loaded file may still refer to a pair's second channel, so
  go through `pickTarget` / `keyPlays` rather than comparing channel numbers.
- Typed edits pass a merge key to `editAtom` (the field's issue path, e.g.
  `keys[3].name`) so they undo in one step. Editable controls carry
  `data-issue-path` with the core's issue path, so the Problems list can focus
  them.
- Exports must stay byte-exact for unedited values: controls such as the fader
  only report a change when the user actually changed something.
- Prefer the platform for interactive patterns: native `<dialog>` with
  `showModal()` (`ConfirmDialog`), `popover` for menus (`Menu`) and toasts,
  `<input type="range">` for faders. Browser policy: Baseline Widely available
  features need no fallback; newer ones (focusgroup, invoker commands, anchor
  positioning, `closedby`) are feature-detected with a small fallback, and no
  polyfill packages. Tamagui's reset unsets the UA styles on `dialog` and
  `[popover]`, so a component using them must restore the closed state
  (`display: none` when not `[open]` / not `:popover-open`) itself.
- Field errors show after the field loses focus (or at once when they were
  already there) and are announced through one shared live region in
  `FieldError.tsx`; don't make individual messages live regions.
- `pnpm-workspace.yaml` hoists `@tamagui/*`, because the Tamagui compiler
  evaluates `tamagui` from the project root and its sibling packages must
  resolve from there. Keep it when changing pnpm settings.
- `packages/web/README.md` describes what the editor does; keep it in step with
  the UI the same way the core README tracks the API.

## Tests

The web package's unit tests (`packages/web/test`) cover the pure edits in
`lib/edit.ts`; add a case when you add or change one.

The end-to-end suite (`packages/web/e2e`, Playwright) drives the production
build (`vite preview` on port 4317) in Chromium, Firefox and WebKit at
1280×720, and on an iPhone (WebKit) and a Pixel (Chromium) with touch and
`hover: none`. Run it with `pnpm e2e` (locally that's Chromium only, two tests at a
time, to keep the machine usable; `pnpm e2e:all` runs every project, add
`--project webkit` and so on to narrow it); it's separate from `pnpm check` to keep that fast. CI runs it on
every push and pull request, and the Pages deploy waits for it, so a red suite
never ships. When behaviour changes, change or add a case in the spec that
covers it in the same change: `home`, `picks`, `files` (opening, editing,
problems, byte-exact exports), `sessions`, `tour`, `layout` (sizes, schemes,
target sizes, the 1280×720 fit), and `a11y` (axe in both schemes). Tag a test `@desktop` when it needs a wide window (the one-page editor) and `@touch` when
it's about phones (the phone layout's journeys are in `phone`); don't skip one to go green. Find text fields with
`getByRole('textbox', …)`, not `getByLabel`: in Playwright's Firefox a
`getByLabel` lookup followed by an axe scan crashes the page.

Fixtures in `packages/core/test/fixtures` are real files; don't edit them. Add
a fixture when you get a file showing something new (an Aux Input key, a
non-centre pan, a decoded settings field) and add an assertion for what it shows. Snapshot
tests cover the decoded keys; update snapshots only when the model's shape
changes on purpose.
