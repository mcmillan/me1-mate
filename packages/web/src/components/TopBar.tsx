import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { type RefObject, useEffect, useId, useRef, useState } from 'react';
import { Input, type TamaguiElement, YStack } from 'tamagui';
import {
  canRedoAtom,
  canUndoAtom,
  configNameAtom,
  dirtyAtom,
  goHomeAtom,
  redoAtom,
  resetAtom,
  undoAtom,
} from '../lib/store.ts';
import { keyColor, keyStyle } from '../lib/theme.ts';
import { ExportMenu } from './ExportMenu.tsx';
import { chooseFiles } from './OpenFiles.tsx';
import { ProblemsButton } from './ProblemsButton.tsx';
import { startTourAtom } from './Tour.tsx';
import { Action } from './ui.tsx';

const NATIVE_FOCUSGROUP = 'focusGroup' in HTMLElement.prototype;
const NATIVE_SCROLL_STATE = CSS.supports('container-type', 'scroll-state');
/** Tooltips that open on hover and on focus; elsewhere the buttons keep a `title`. */
const NATIVE_HINTS =
  'interestForElement' in HTMLButtonElement.prototype && CSS.supports('position-area', 'block-end');

/**
 * The bar sits on the canvas, with a hairline under it only once the page has
 * scrolled beneath it. It lays itself out by its own width. From 720px it is
 * one row, 60px tall (`--topbar` in styles.css); below that the toolbar takes
 * a second row, with Export at the far end, and the tour's button ends the
 * first, down to 320px. `.top-quiet` keeps words for
 * screen readers where the bar is too narrow to show them: on a phone, and
 * while one row is a tight fit (the status's words, in ProblemsButton, come
 * back at 860px and "Unsaved changes" at 1000px). Under 480px the toolbar
 * closes up; at 360px and under it closes up further and Export drops its
 * arrow, so its row doesn't wrap.
 *
 * Only while it is two rows, the bar slides away as the page scrolls down and
 * comes back on the way up, or whenever focus is inside it: a scroll-state
 * query (on `html`, styles.css) where there is one, the `top-away` class (set
 * from script, with `top-scrolled` for the hairline) elsewhere.
 *
 * The unsaved dot wears a key's colour inside an ink ring: on a narrow bar it
 * stands alone for the words, and no key colour is dark enough against the
 * canvas to do that unaided.
 *
 * In forced colours author backgrounds go: the unsaved dot and the primary
 * button are given system colours there. The button opts out of forcing (the
 * backplate behind its text would hide it on the highlight), with background
 * and text set as the system's highlight pair.
 */
const CSS_TEXT = `
.top-bar { container: topbar / inline-size; background: var(--canvas); }
.top-bar::after { content: ""; position: absolute; inset: auto 0 0; border-block-end: 1.5px solid var(--line); opacity: 0; pointer-events: none; }
@container scroll-state(scrollable: top) {
  .top-bar::after { opacity: 1; }
}
.top-bar.top-scrolled::after { opacity: 1; }
.top-row { box-sizing: border-box; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; inline-size: 100%; max-inline-size: 1480px; min-block-size: var(--topbar); margin-inline: auto; padding: 6px 12px; }
.top-id { display: flex; align-items: center; gap: 12px; min-inline-size: 0; }
.top-brand { flex: none; box-sizing: border-box; display: flex; align-items: center; min-block-size: max(38px, var(--target)); margin: 0 -8px; padding: 0 8px; border: 0; border-radius: 12px; background: transparent; color: inherit; cursor: pointer; font-size: 1.625rem; font-weight: var(--w-black); line-height: 1; white-space: nowrap; }
.top-brand > span { display: block; }
.top-tools { display: flex; flex: 1 1 100%; flex-wrap: wrap; align-items: center; justify-content: flex-end; row-gap: 6px; min-inline-size: 0; }
.top-group { display: flex; align-items: center; gap: 2px; }
.top-group:last-child { gap: 8px; }
/* The tour's button ends the first row on a narrow bar, and starts the tools on a wide one. */
.top-help { flex: none; display: flex; margin-inline-start: auto; }
.top-sep { flex: none; align-self: stretch; inline-size: 10px; block-size: auto; margin: 0; border: 0; border-inline-start: 1px solid transparent; }
.top-sep-wide { flex: 1 1 10px; }
.top-bar button.target, .top-name { min-block-size: max(38px, var(--target)); }
.top-bar .top-file > span { font-weight: var(--w-ui); }
.top-bar button.top-icon { block-size: max(38px, var(--target)); min-inline-size: max(38px, var(--target)); padding-block: 0; }
.top-glyph { font-size: 1.25rem; font-weight: var(--w-ui); line-height: 1; }

.top-name { flex: 0 1 auto; min-inline-size: 0; box-sizing: border-box; display: flex; align-items: center; padding-inline: 4px 14px; border: 1.5px solid var(--line); border-radius: 999px; background: var(--card); cursor: text; font-size: 1.0625rem; }
.top-ext { color: var(--muted); font-weight: var(--w-text); user-select: none; }
@media (hover: hover) {
  .top-name:hover { border-color: color-mix(in oklab, var(--line) 50%, var(--muted)); }
  .top-brand:hover { background: var(--well); }
}
.top-name:focus-within { outline: 3px solid var(--focus); outline-offset: 2px; }
.top-name input { inline-size: 11ch; }
.top-bar .top-name input { font-weight: var(--w-ui); }
@supports (field-sizing: content) {
  .top-name input { field-sizing: content; inline-size: auto; min-inline-size: 4ch; }
}
.top-name input:focus-visible { outline: none; }

.top-unsaved { flex: none; display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 0.8125rem; font-weight: var(--w-ui); white-space: nowrap; }
.top-dot { flex: none; box-sizing: border-box; inline-size: 12px; block-size: 12px; border: 1.5px solid var(--ink); border-radius: 50%; background: var(--k); }
.top-bar .top-label { font-weight: var(--w-strong); }
.top-arrow { display: inline-block; font-weight: var(--w-strong); }

.top-tip { inset: auto; margin: 6px 0; padding: 4px 10px; border: 1px solid transparent; border-radius: 999px; background: var(--ink); color: var(--canvas); font-size: 0.75rem; font-weight: var(--w-ui); white-space: nowrap; position-area: block-end; position-try-fallbacks: flip-block; }
.top-tip:not(:popover-open) { display: none; }
.top-said { position: absolute; inline-size: 1px; block-size: 1px; margin: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.top-bar [interestfor] { interest-delay: 0.4s 0.1s; }
.top-bar:has(:interest-source) [interestfor] { interest-delay-start: 0s; }

@media (prefers-reduced-motion: no-preference) {
  .top-bar::after { transition: opacity 200ms ease-out; }
  .top-name { transition: border-color 120ms ease-out; }
  .top-bar button { transition: scale 200ms var(--spring), background-color 120ms ease-out, border-color 120ms ease-out; }
  .top-bar button:not([aria-disabled="true"]):active { scale: 0.96; }
  .top-dot { animation: top-pop 300ms var(--spring) both; }
  .top-arrow { transition: translate 200ms var(--spring); }
  .top-export[aria-expanded="true"] .top-arrow { translate: 0 2px; }
}
@keyframes top-pop { from { scale: 0; } }

@container topbar (inline-size < 480px) {
  .top-group { gap: 0; }
  .top-group:last-child { gap: 6px; }
  .top-sep { inline-size: 8px; }
  .top-sep-wide { flex-basis: 8px; }
  .top-id { gap: 10px; }
  /* Three times the class, to outweigh the buttons' own padding. */
  .top-tools .top-group .top-file.top-file.top-file { padding-inline: 6px; }
  .top-tools .top-group .top-problems.top-problems.top-problems { padding-inline: 10px; }
  .top-tools .top-group .top-export.top-export.top-export { padding-inline: 14px; }
}
@container topbar ((inline-size < 560px) or ((inline-size >= 720px) and (inline-size < 860px))) {
  .top-quiet { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
}
@container topbar ((inline-size >= 720px) and (inline-size < 860px)) {
  .top-sep { inline-size: 6px; }
  .top-tools .top-group .top-file.top-file.top-file { padding-inline: 8px; }
}
@container topbar ((inline-size >= 720px) and (inline-size < 1000px)) {
  .top-id .top-quiet { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
}
@container topbar (inline-size <= 360px) {
  .top-sep { inline-size: 4px; }
  .top-sep-wide { flex-basis: 4px; }
  .top-arrow { display: none; }
  .top-brand { font-size: 1.375rem; }
  .top-id { gap: 8px; }
  /* Still one row of tools at 320px; fingers keep their 44px. */
  .top-bar button.top-icon { min-inline-size: max(32px, var(--target)); }
  .top-tools .top-group .top-file.top-file.top-file { padding-inline: 4px; }
  .top-tools .top-group .top-problems.top-problems.top-problems { padding-inline: 8px; }
  .top-tools .top-group .top-export.top-export.top-export { padding-inline: 12px; }
}
@container topbar (inline-size >= 640px) {
  .top-row { padding-inline: 20px; }
}
@container topbar (inline-size >= 720px) {
  /* One row, exactly --topbar tall, for fingers' taller buttons too. */
  .top-row { flex-wrap: nowrap; padding-block: 0; }
  .top-tools { flex: 0 0 auto; flex-wrap: nowrap; }
  .top-sep-wide { flex: none; }
}
@media (forced-colors: active) {
  .top-bar .top-dot { background: CanvasText; }
  .top-bar .top-export.top-export.top-export {
    forced-color-adjust: none; background: Highlight; border-color: Highlight; color: HighlightText;
  }
  .top-bar .top-export:focus-visible { outline-color: CanvasText; }
  .top-bar .top-export * { color: HighlightText; }
}
@media (max-width: 719.98px) {
  @media (prefers-reduced-motion: no-preference) {
    .top-bar { transition: translate 150ms ease-out; }
  }
  @container scroll-state((scrolled: bottom) and (scrollable: top)) {
    .top-bar:not(:focus-within) { translate: 0 -100%; }
  }
  .top-bar.top-away:not(:focus-within) { translate: 0 -100%; }
}
`;

const HOME = 'Home';

/**
 * The wordmark is the way home: a button named for where it goes, its two 2s
 * in two of the keys' colours. The page's heading is beside it, for screen
 * readers only, so the heading isn't named "Home".
 */
const Brand = ({ tip }: { readonly tip: string }) => {
  const goHome = useSetAtom(goHomeAtom);
  return (
    <>
      <h1 className="top-said">2me2u</h1>
      <button
        type="button"
        className="display top-brand"
        aria-label={HOME}
        onClick={() => goHome()}
        {...((NATIVE_HINTS ? { interestfor: tip } : { title: HOME }) as Record<string, string>)}
      >
        <span aria-hidden="true">
          <span style={{ color: keyColor(0) }}>2</span>
          me
          <span style={{ color: keyColor(3) }}>2</span>u
        </span>
      </button>
    </>
  );
};

/**
 * The config's name, shown as the file it is saved as: the `.ME1` suffix sits
 * in the same pill, and clicking it focuses the name.
 */
const ConfigName = () => {
  const [configName, setConfigName] = useAtom(configNameAtom);
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: Tamagui's Input, inside it, is the control
    <label className="top-name">
      <Input
        size="sm"
        maxLength={8}
        pattern="[0-9A-Z_\-]{0,8}"
        value={configName}
        fontSize={17}
        h={34}
        borderWidth={0}
        bg="transparent"
        pl="2.5"
        pr="0"
        placeholder="NAME"
        placeholderTextColor="placeholder-color"
        onChangeText={(v) => setConfigName(v.toUpperCase().replace(/[^0-9A-Z_-]/g, ''))}
        aria-label="Config name, up to 8 characters; the ME-1 shows it as the config's name"
        autoComplete="off"
        autoCorrect="off"
        // Tamagui maps autoCapitalize="characters" to "off"; set the attribute itself.
        ref={(el) => {
          if (el instanceof HTMLElement) el.setAttribute('autocapitalize', 'characters');
        }}
        spellCheck={false}
        enterKeyHint="done"
      />
      <span className="top-ext" aria-hidden="true">
        .ME1
      </span>
    </label>
  );
};

/** A dot and the words; the words stay for screen readers when the bar is narrow. */
const Unsaved = () => {
  const dirty = useAtomValue(dirtyAtom);
  return (
    <div role="status" className="top-unsaved">
      {dirty && (
        <>
          <span className="top-dot" style={keyStyle(1)} aria-hidden="true" />
          <span className="top-quiet">Unsaved changes</span>
        </>
      )}
    </div>
  );
};

const UNDO = 'Undo (⌘Z)';
const REDO = 'Redo (⇧⌘Z)';
const TOUR = 'Show me around';

/**
 * An icon-only toolbar button. It stays focusable when it can't be used
 * (`aria-disabled`, not `disabled`), so arrowing along the toolbar doesn't
 * skip it and a screen reader still finds it, and says it's unavailable.
 */
const IconAction = ({
  label,
  tip,
  enabled = true,
  onPress,
  glyph,
}: {
  readonly label: string;
  /** The id of this button's `Tip`. */
  readonly tip: string;
  readonly enabled?: boolean;
  readonly onPress: () => void;
  /** One of Allo's arrows, or a character. */
  readonly glyph: string;
}) => {
  const ref = useRef<TamaguiElement>(null);
  // Tamagui's Button writes aria-disabled from its own `disabled`, which would
  // take the button out of the tab order; set the attribute on the element.
  useEffect(() => {
    (ref.current as unknown as HTMLElement | null)?.setAttribute('aria-disabled', String(!enabled));
  }, [enabled]);
  return (
    <Action
      ref={ref}
      kind="ghost"
      className="target top-icon"
      px="0"
      aria-label={label}
      onPress={() => enabled && onPress()}
      {...(enabled ? {} : { opacity: 0.4, cursor: 'not-allowed', bg: 'transparent' })}
      {...((NATIVE_HINTS ? { interestfor: tip } : { title: label }) as Record<string, string>)}
    >
      <span className="top-glyph" aria-hidden="true">
        {glyph}
      </span>
    </Action>
  );
};

/**
 * An icon-only button's tooltip. It repeats the button's name, so it adds
 * nothing for a screen reader; it sits outside the toolbar's groups.
 */
const Tip = ({ id, children }: { id: string; children: string }) =>
  NATIVE_HINTS ? (
    <div id={id} className="top-tip" {...({ popover: 'hint' } as Record<string, string>)}>
      {children}
    </div>
  ) : null;

/**
 * Arrow keys for the toolbar where the browser has no `focusgroup`: one tab
 * stop that remembers its place, Left/Right wrapping across the groups,
 * Home/End. Buttons inside a menu or dialog aren't the toolbar's.
 */
const useRovingFocus = (ref: RefObject<HTMLDivElement | null>) => {
  useEffect(() => {
    const bar = ref.current;
    if (NATIVE_FOCUSGROUP || !bar) return;
    const items = () =>
      [...bar.querySelectorAll<HTMLElement>('button')].filter(
        (button) => !button.closest('[popover], dialog'),
      );
    const settle = (active?: HTMLElement) => {
      const all = items();
      const current = active ?? all.find((item) => item.tabIndex === 0) ?? all[0];
      for (const item of all) item.tabIndex = item === current ? 0 : -1;
    };
    settle();
    // The status turns into the problems button and back.
    const observer = new MutationObserver(() => settle());
    observer.observe(bar, { childList: true, subtree: true });
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (items().includes(target)) settle(target);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const all = items();
      const at = all.indexOf(e.target as HTMLElement);
      if (at < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
      const rtl = getComputedStyle(bar).direction === 'rtl';
      const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key];
      const next =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? all.length - 1
            : step === undefined
              ? undefined
              : (at + step + all.length) % all.length;
      if (next === undefined) return;
      e.preventDefault();
      all[next]?.focus();
    };
    bar.addEventListener('focusin', onFocusIn);
    bar.addEventListener('keydown', onKeyDown);
    return () => {
      observer.disconnect();
      bar.removeEventListener('focusin', onFocusIn);
      bar.removeEventListener('keydown', onKeyDown);
    };
  }, [ref]);
};

/**
 * Where scroll-state queries are missing, track whether the page has scrolled
 * (`.top-scrolled`) and which way (`.top-away`).
 */
const useScrollAway = (ref: RefObject<TamaguiElement | null>) => {
  useEffect(() => {
    // On the web a Tamagui view is its DOM element.
    const bar = ref.current as unknown as HTMLElement | null;
    if (NATIVE_SCROLL_STATE || !bar) return;
    let lastY = window.scrollY;
    const onScroll = () => {
      // Clamped, so rubber-banding at either end doesn't count as a change of direction.
      const limit = document.documentElement.scrollHeight - window.innerHeight;
      const y = Math.max(0, Math.min(window.scrollY, limit));
      bar.classList.toggle('top-scrolled', y > 0);
      if (y === lastY) return;
      bar.classList.toggle('top-away', y > lastY && y > bar.offsetHeight);
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [ref]);
};

/** A divider between toolbar groups. It is drawn as space, not a line. */
const Separator = ({ wide }: { wide?: boolean }) => (
  <hr aria-orientation="vertical" className={wide ? 'top-sep top-sep-wide' : 'top-sep'} />
);

/**
 * The page's header. Left, what you're editing: the config's name and whether
 * it has unsaved changes. Right, a toolbar in three groups, in the order work
 * goes: history, files in, then whether it can go out and Export.
 */
export const TopBar = () => {
  const undo = useSetAtom(undoAtom);
  const redo = useSetAtom(redoAtom);
  const canUndo = useAtomValue(canUndoAtom);
  const canRedo = useAtomValue(canRedoAtom);
  const reset = useSetAtom(resetAtom);
  const startTour = useSetAtom(startTourAtom);
  // What Undo or Redo just did, for screen readers: nothing else says it. The
  // count makes a repeat a new message, so it is announced again.
  const [said, setSaid] = useState({ text: '', count: 0 });
  const say = (text: string) => setSaid((last) => ({ text, count: last.count + 1 }));
  const id = useId();
  const header = useRef<TamaguiElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  useRovingFocus(toolbar);
  useScrollAway(header);

  return (
    <YStack render="header" ref={header} className="top-bar" position="sticky" t={0} z={10}>
      <style>{CSS_TEXT}</style>
      <div className="top-row">
        <div className="top-id">
          <Brand tip={`${id}-home`} />
          <ConfigName />
          <Unsaved />
        </div>
        {/* Outside the toolbar: on a narrow bar it ends the first row. */}
        <span className="top-help">
          <IconAction label={TOUR} tip={`${id}-tour`} onPress={() => startTour()} glyph="?" />
        </span>
        <div
          ref={toolbar}
          role="toolbar"
          aria-label="Editor"
          className="top-tools"
          {...({ focusgroup: 'toolbar wrap' } as Record<string, string>)}
        >
          {/* biome-ignore lint/a11y/useSemanticElements: a toolbar group, not a form's fieldset */}
          <div role="group" aria-label="History" className="top-group">
            <IconAction
              label={UNDO}
              tip={`${id}-undo`}
              enabled={canUndo}
              onPress={() => {
                undo();
                say('Undone');
              }}
              glyph="↺"
            />
            <IconAction
              label={REDO}
              tip={`${id}-redo`}
              enabled={canRedo}
              onPress={() => {
                redo();
                say('Redone');
              }}
              glyph="↻"
            />
          </div>
          <Separator />
          {/* biome-ignore lint/a11y/useSemanticElements: a toolbar group, not a form's fieldset */}
          <div role="group" aria-label="Files" className="top-group">
            <Action kind="ghost" className="target top-file" px="3" onPress={chooseFiles}>
              Open
            </Action>
            {/* Nothing to confirm: the system that was open stays in the list of sessions. */}
            <Action kind="ghost" className="target top-file" px="3" onPress={() => reset()}>
              New
            </Action>
          </div>
          <Separator wide />
          {/* biome-ignore lint/a11y/useSemanticElements: a toolbar group, not a form's fieldset */}
          <div role="group" aria-label="Export" className="top-group">
            <ProblemsButton />
            <ExportMenu />
          </div>
        </div>
      </div>
      {/* Always in the page and outside the toolbar, so what it says is announced. */}
      <p role="status" className="top-said">
        {said.text}
        {said.count % 2 === 1 ? '\u00a0' : ''}
      </p>
      <Tip id={`${id}-home`}>{HOME}</Tip>
      <Tip id={`${id}-undo`}>{UNDO}</Tip>
      <Tip id={`${id}-redo`}>{REDO}</Tip>
      <Tip id={`${id}-tour`}>{TOUR}</Tip>
    </YStack>
  );
};
