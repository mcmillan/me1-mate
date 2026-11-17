import type { Issue } from '@mcmillan/2me2u-core';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useId, useRef } from 'react';
import { SizableText, type TamaguiElement, Theme, XStack, YStack } from 'tamagui';
import { describeIssue } from '../lib/messages.ts';
import { restoringAtom } from '../lib/session.ts';
import { loadIssuesAtom, startedAtom } from '../lib/store.ts';
import { WarningIcon } from './FieldError.tsx';
import { Mono, Notice, NoticeTitle } from './Notice.tsx';
import { chooseFiles } from './OpenFiles.tsx';
import { Action } from './ui.tsx';

const NATIVE_ANCHORS = CSS.supports('position-area: block-end');
/** The popover's width, and the least space it keeps from the window's edges. */
const WIDTH = 320;
const EDGE = 16;

/**
 * The popover opens under its button, in the top layer. Tamagui's reset unsets
 * the UA's `[popover]` styles, so the closed state is hidden here. Without
 * anchor positioning it is placed from script when it opens.
 */
const WHERE_CSS = `
.intro-where { inset: auto; margin: 6px 0; padding: 0; border: 0; background: transparent; color: inherit; overflow: visible; transform-origin: top right; }
.intro-where:not(:popover-open) { display: none; }
@supports (position-area: block-end) {
  .intro-where { position-area: block-end span-inline-start; position-try-fallbacks: --intro-centred, flip-block; }
  @position-try --intro-centred { position-area: block-end span-all; margin: 6px 16px; }
}
@supports not (position-area: block-end) {
  .intro-where { position: fixed; margin: 0; }
}
.intro-where:popover-open { animation: intro-fade 150ms ease-out both; }
@media (prefers-reduced-motion: no-preference) {
  .intro-where:popover-open { animation: intro-grow 150ms ease-out both, intro-fade 150ms ease-out both; }
}
@keyframes intro-grow { from { scale: 0.96; } }
@keyframes intro-fade { from { opacity: 0; } }
.intro-where dl, .intro-where dd { margin: 0; }
`;

const FilesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 7a2 2 0 0 1 2-2h3.5l2 2.5H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

/** Where an `.ME1` and a `.meu` come from: a button and the popover it opens. */
const WhereFrom = () => {
  const id = useId();
  const button = useRef<TamaguiElement>(null);
  const popover = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // On the web a Tamagui view is its DOM element.
    const trigger = button.current as unknown as HTMLElement | null;
    const panel = popover.current;
    if (!trigger || !panel) return;
    trigger.setAttribute('popovertarget', panel.id);
    if (NATIVE_ANCHORS) return;
    // Under the button, its end edge on the button's, kept inside the window.
    const place = (e: Event) => {
      if ((e as ToggleEvent).newState !== 'open') return;
      const at = trigger.getBoundingClientRect();
      const viewport = document.documentElement.clientWidth;
      const width = Math.min(WIDTH, viewport - 2 * EDGE);
      const left = Math.max(EDGE, Math.min(at.right - width, viewport - EDGE - width));
      panel.style.top = `${at.bottom + 6}px`;
      panel.style.left = `${left}px`;
    };
    panel.addEventListener('beforetoggle', place);
    return () => panel.removeEventListener('beforetoggle', place);
  }, []);

  return (
    <>
      <Action ref={button} kind="ghost" className="target" px="2">
        <SizableText size="sm" color="color-10">
          Where do I find these?
        </SizableText>
      </Action>
      <div ref={popover} id={id} popover="auto" className="intro-where">
        <style>{WHERE_CSS}</style>
        <YStack
          render="dl"
          w={WIDTH}
          maxW={`calc(100vw - ${2 * EDGE}px)`}
          gap="2.5"
          p="3"
          rounded="lg"
          bg="background"
          borderWidth={1}
          borderColor="border-color"
          shadowColor="rgba(0,0,0,0.18)"
          shadowRadius={16}
          shadowOffset={{ width: 0, height: 6 }}
        >
          <YStack gap="0.5">
            <SizableText render="dt" size="sm">
              <Mono>.ME1</Mono>, the ME-1’s config
            </SizableText>
            <SizableText render="dd" size="sm" color="color-10">
              Saved by the ME-1 to its USB stick, in the <Mono>ME1CFG</Mono> folder.
            </SizableText>
          </YStack>
          <YStack gap="0.5">
            <SizableText render="dt" size="sm">
              <Mono>.meu</Mono>, the ME-U’s channel setup
            </SizableText>
            <SizableText render="dd" size="sm" color="color-10">
              Exported from the ME-U.
            </SizableText>
          </YStack>
        </YStack>
      </div>
    </>
  );
};

/** What this is and how to begin: a strip, not a gate; the editor is right below it. */
const HowToBegin = () => (
  <Notice
    render="section"
    icon={<FilesIcon />}
    actions={
      <>
        <WhereFrom />
        <Action kind="subtle" className="target" px="3" onPress={chooseFiles}>
          Open files
        </Action>
      </>
    }
  >
    <XStack flexWrap="wrap" items="baseline" columnGap="2">
      <NoticeTitle>Edit ME-1 keys and ME-U channel names in your browser.</NoticeTitle>
      <SizableText size="sm" color="color-10">
        Your files never leave this computer.
      </SizableText>
    </XStack>
    <SizableText render="p" m="0" size="sm" color="color-10">
      Drop an <Mono>.ME1</Mono> and/or <Mono>.meu</Mono> anywhere, or open files. Or just start:
      pick a key, then pick its channels.
    </SizableText>
  </Notice>
);

const SHOWN = 6;

/**
 * Why the last files couldn't be opened (one couldn't be read, or the two
 * don't go together), until they're replaced or dismissed.
 */
const LoadProblems = ({ issues }: { issues: readonly Issue[] }) => {
  const setIssues = useSetAtom(loadIssuesAtom);
  return (
    <Theme name="red">
      <Notice
        tone="problem"
        role="alert"
        icon={<WarningIcon size={18} />}
        actions={
          <Action
            kind="subtle"
            className="target"
            bg={{ default: 'color-3', hover: 'color-4', press: 'color-5' }}
            borderColor="color-7"
            color="color-11"
            onPress={() => setIssues([])}
          >
            Dismiss
          </Action>
        }
      >
        <NoticeTitle>Couldn’t open those files</NoticeTitle>
        <YStack render="ul" m="0" p="0" gap="0.5" style={{ listStyle: 'none' }}>
          {issues.slice(0, SHOWN).map((issue) => (
            <SizableText
              key={`${issue.path}:${issue.reason}`}
              render="li"
              size="sm"
              color="color-11"
            >
              {describeIssue(issue)}
            </SizableText>
          ))}
          {issues.length > SHOWN && (
            <SizableText render="li" size="sm" color="color-11">
              …and {issues.length - SHOWN} more.
            </SizableText>
          )}
        </YStack>
      </Notice>
    </Theme>
  );
};

/**
 * The notices that go with opening files: how to begin, shown until the user
 * loads files or makes an edit (and not while the last session is coming back), and
 * the reasons the last files couldn't be opened.
 */
export const Intro = () => {
  const started = useAtomValue(startedAtom);
  const restoring = useAtomValue(restoringAtom);
  const issues = useAtomValue(loadIssuesAtom);
  const beginning = !started && !restoring;
  if (!beginning && issues.length === 0) return null;
  return (
    <>
      {issues.length > 0 && <LoadProblems issues={issues} />}
      {beginning && <HowToBegin />}
    </>
  );
};
