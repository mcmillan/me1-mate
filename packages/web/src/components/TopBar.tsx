import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { type RefObject, useEffect, useId, useRef, useState } from 'react';
import { Input, SizableText, type TamaguiElement, Theme, XStack, YStack } from 'tamagui';
import {
  canRedoAtom,
  canUndoAtom,
  configNameAtom,
  dirtyAtom,
  redoAtom,
  resetAtom,
  undoAtom,
} from '../lib/store.ts';
import { ACCENT, DISPLAY_FONT } from '../lib/theme.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { ExportMenu } from './ExportMenu.tsx';
import { chooseFiles } from './OpenFiles.tsx';
import { ProblemsButton } from './ProblemsButton.tsx';
import { Action } from './ui.tsx';

const NATIVE_FOCUSGROUP = 'focusGroup' in HTMLElement.prototype;
const NATIVE_SCROLL_STATE = CSS.supports('container-type', 'scroll-state');
/** Tooltips that open on hover and on focus; elsewhere the buttons keep a `title`. */
const NATIVE_HINTS =
  'interestForElement' in HTMLButtonElement.prototype && CSS.supports('position-area', 'block-end');

/**
 * The bar lays itself out by its own width. From 720px it is one row, 56px
 * tall (`--topbar` in styles.css); below that the toolbar takes a second row,
 * with Export at the far end. `.top-quiet` keeps words for screen readers
 * where the bar is too narrow to show them: on a phone, and while one row is
 * a tight fit (the status's words, in ProblemsButton, come back at 800px and
 * "Unsaved changes" at 900px). At 360px and under, "Ready to export" is only
 * spoken (`.top-ready`) and the toolbar closes up, so its row doesn't wrap.
 *
 * Only while it is two rows, the bar slides away as the page scrolls down and
 * comes back on the way up, or whenever focus is inside it: a scroll-state
 * query (on `html`, styles.css) where there is one, the `top-away` class (set
 * from script) elsewhere.
 *
 * In forced colours author backgrounds go: the unsaved dot and the primary
 * button are given system colours there. The button opts out of forcing (the
 * backplate behind its text would hide it on the highlight), with background
 * and text set as the system's highlight pair.
 */
const CSS_TEXT = `
.top-bar { container: topbar / inline-size; background: var(--panel); border-block-end: 1px solid var(--panel-border); }
.top-row { box-sizing: border-box; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; inline-size: 100%; max-inline-size: 1480px; min-block-size: 55px; margin-inline: auto; padding: 8px 12px; }
.top-id { display: flex; align-items: center; gap: 12px; min-inline-size: 0; }
.top-tools { display: flex; flex: 1 1 100%; flex-wrap: wrap; align-items: center; justify-content: flex-end; row-gap: 8px; min-inline-size: 0; }
.top-group { display: flex; align-items: center; gap: 4px; }
.top-sep { flex: none; align-self: stretch; inline-size: 12px; block-size: auto; margin: 0; border: 0; border-inline-start: 1px solid transparent; }
.top-sep-wide { flex: 1 1 12px; }
.top-bar button.target, .top-name { min-block-size: max(38px, var(--target)); }
.top-name { cursor: text; background: var(--well); border-color: var(--panel-border); }
@media (hover: hover) {
  .top-name:hover { border-color: color-mix(in oklab, var(--panel-border) 55%, currentColor); }
}
@media (prefers-reduced-motion: no-preference) {
  .top-name { transition: border-color 120ms ease-out; }
}
.top-bar button:focus-visible { outline-color: var(--focus); }
.top-name:focus-within { outline: 2px solid var(--focus); outline-offset: 2px; }
.top-name input { inline-size: calc(8ch + 10px); }
@supports (field-sizing: content) {
  .top-name input { field-sizing: content; inline-size: auto; min-inline-size: calc(4ch + 10px); max-inline-size: calc(8ch + 10px); }
}
.top-name input:focus-visible { outline: none; }
.top-tip { inset: auto; margin: 6px 0; padding: 3px 8px; border: 1px solid transparent; border-radius: 6px; background: CanvasText; color: Canvas; white-space: nowrap; position-area: block-end; position-try-fallbacks: flip-block; }
.top-tip:not(:popover-open) { display: none; }
.top-said { position: absolute; inline-size: 1px; block-size: 1px; margin: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.top-bar [interestfor] { interest-delay: 0.4s 0.1s; }
.top-bar:has(:interest-source) [interestfor] { interest-delay-start: 0s; }
@container topbar (inline-size < 480px) {
  .top-group { gap: 0; }
  .top-group:last-child { gap: 6px; }
  .top-sep { inline-size: 8px; }
  .top-sep-wide { flex-basis: 8px; }
}
@container topbar ((inline-size < 560px) or ((inline-size >= 720px) and (inline-size < 800px))) {
  .top-quiet { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
}
@container topbar ((inline-size >= 720px) and (inline-size < 900px)) {
  .top-id .top-quiet { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
}
@container topbar (inline-size < 390px) {
  .top-sep { inline-size: 4px; }
  .top-sep-wide { flex-basis: 4px; }
  .top-tools .top-group .top-file.top-file.top-file { padding-inline: 6px; }
}
@container topbar (inline-size <= 360px) {
  .top-ready { position: absolute; inline-size: 1px; block-size: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
}
@container topbar (inline-size >= 640px) {
  .top-row { padding-inline: 16px; }
}
@container topbar (inline-size >= 720px) {
  /* One row, 56px with the border, for fingers' taller buttons too. */
  .top-row { flex-wrap: nowrap; padding-block: min(8px, (55px - max(38px, var(--target))) / 2); }
  .top-tools { flex: 0 0 auto; flex-wrap: nowrap; margin-inline-start: auto; }
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

const Brand = () => (
  <XStack items="center" gap="2" shrink={0}>
    <Theme name={ACCENT}>
      <YStack w={28} h={28} rounded="md" bg="color-8" items="center" justify="center" aria-hidden>
        <SizableText size="sm" fontWeight="800" color="background">
          2
        </SizableText>
      </YStack>
    </Theme>
    <SizableText render="h1" m="0" size="base" fontWeight="700">
      2me2u
    </SizableText>
  </XStack>
);

/**
 * The config's name, shown as the file it is saved as: the `.ME1` suffix sits
 * in the same field, and clicking it focuses the name.
 */
const ConfigName = () => {
  const [configName, setConfigName] = useAtom(configNameAtom);
  return (
    <XStack
      render="label"
      className="top-name"
      items="center"
      pr="2.5"
      rounded="md"
      borderWidth={1}
      shrink={0}
    >
      <Input
        size="sm"
        maxLength={8}
        pattern="[0-9A-Z_\-]{0,8}"
        value={configName}
        fontFamily={DISPLAY_FONT}
        fontWeight="600"
        h={36}
        borderWidth={0}
        bg="transparent"
        pl="2.5"
        pr="0"
        placeholder="NAME"
        placeholderTextColor="color-8"
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
      <SizableText size="sm" fontFamily={DISPLAY_FONT} color="color-8" select="none" aria-hidden>
        .ME1
      </SizableText>
    </XStack>
  );
};

/** A dot and the words; the words stay for screen readers when the bar is narrow. */
const Unsaved = () => {
  const dirty = useAtomValue(dirtyAtom);
  return (
    <XStack role="status" items="center" gap="1.5" shrink={0}>
      {dirty && (
        <>
          <Theme name={ACCENT}>
            <YStack className="top-dot" w={8} h={8} rounded="full" bg="color-8" aria-hidden />
          </Theme>
          <span className="top-quiet">
            <SizableText size="xs" color="color-10">
              Unsaved changes
            </SizableText>
          </span>
        </>
      )}
    </XStack>
  );
};

const UNDO = 'Undo (⌘Z)';
const REDO = 'Redo (⇧⌘Z)';

const ArrowIcon = ({ flip }: { flip?: boolean }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    style={flip ? { transform: 'scaleX(-1)' } : undefined}
  >
    <path
      d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * An icon-only toolbar button. It stays focusable when it can't be used
 * (`aria-disabled`, not `disabled`), so arrowing along the toolbar doesn't
 * skip it and a screen reader still finds it, and says it's unavailable.
 */
const IconAction = ({
  label,
  tip,
  enabled,
  onPress,
  flip,
}: {
  readonly label: string;
  /** The id of this button's `Tip`. */
  readonly tip: string;
  readonly enabled: boolean;
  readonly onPress: () => void;
  readonly flip?: boolean;
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
      className="target"
      px="2"
      aria-label={label}
      onPress={() => enabled && onPress()}
      {...(enabled ? {} : { opacity: 0.4, cursor: 'not-allowed', bg: 'transparent' })}
      {...((NATIVE_HINTS ? { interestfor: tip } : { title: label }) as Record<string, string>)}
    >
      <ArrowIcon {...(flip ? { flip } : {})} />
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
      <SizableText size="xs" fontWeight="500" style={{ color: 'inherit' }}>
        {children}
      </SizableText>
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

/** Where scroll-state queries are missing, track the scroll direction for `.top-away`. */
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
  const dirty = useAtomValue(dirtyAtom);
  const [confirmingNew, setConfirmingNew] = useState(false);
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
          <Brand />
          <ConfigName />
          <Unsaved />
        </div>
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
            />
            <IconAction
              label={REDO}
              tip={`${id}-redo`}
              enabled={canRedo}
              onPress={() => {
                redo();
                say('Redone');
              }}
              flip
            />
          </div>
          <Separator />
          {/* biome-ignore lint/a11y/useSemanticElements: a toolbar group, not a form's fieldset */}
          <div role="group" aria-label="Files" className="top-group">
            <Action kind="ghost" className="target top-file" px="2.5" onPress={chooseFiles}>
              Open
            </Action>
            <Action
              kind="ghost"
              className="target top-file"
              px="2.5"
              onPress={() => (dirty ? setConfirmingNew(true) : reset())}
            >
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
      <Tip id={`${id}-undo`}>{UNDO}</Tip>
      <Tip id={`${id}-redo`}>{REDO}</Tip>
      {/* Outside the toolbar, so its buttons aren't taken for toolbar items. */}
      <ConfirmDialog
        open={confirmingNew}
        title="Start a new system?"
        confirmLabel="Discard changes"
        onClose={(confirmed) => {
          setConfirmingNew(false);
          if (confirmed) reset();
        }}
      >
        Your unsaved changes will be lost.
      </ConfirmDialog>
    </YStack>
  );
};
