import type { Issue } from '@mcmillan/me1-mate-core';
import { useAtomValue, useSetAtom } from 'jotai';
import { SizableText, XStack, YStack } from 'tamagui';
import { phonePlaceOf, usePhone } from '../lib/layout.ts';
import { describeIssue, issueIsAt, issueKey } from '../lib/messages.ts';
import {
  issuesAtom,
  keySheetOpenAtom,
  phoneScreenAtom,
  selectedKeyAtom,
  systemAtom,
} from '../lib/store.ts';
import { useRedPill } from './ConfirmDialog.tsx';
import { Menu, MenuItem } from './Menu.tsx';
import { Action } from './ui.tsx';

/**
 * The input for an issue: the element whose `data-issue-path` is the issue's
 * path, or the closest field containing it (`keys[3]` for `keys[3].level`).
 * Only one on screen counts (the phone's key sheet is in the page while closed).
 */
const fieldFor = (path: string): HTMLElement | undefined => {
  const fields = [...document.querySelectorAll<HTMLElement>('[data-issue-path]')].filter(
    (el) => issueIsAt(path, el.dataset.issuePath ?? '') && el.checkVisibility?.() !== false,
  );
  return fields.sort(
    (a, b) => (b.dataset.issuePath ?? '').length - (a.dataset.issuePath ?? '').length,
  )[0];
};

const FOCUSABLE = 'input, select, textarea, button, [tabindex]';

/**
 * Focus an issue's field. Inside a field that isn't itself a control, the
 * control marked `data-issue-focus` is the one to land on (a group member's
 * remove button, not its level fader, where arrow keys would change the
 * level); failing that, the first control in it.
 */
const focusField = (path: string, tries = 10) => {
  const el = fieldFor(path);
  if (el) {
    const target = el.matches(FOCUSABLE)
      ? el
      : (el.querySelector<HTMLElement>('[data-issue-focus]') ??
        el.querySelector<HTMLElement>(FOCUSABLE) ??
        el);
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.focus({ preventScroll: true });
  } else if (tries > 0) {
    // The key may still be rendering in the inspector.
    window.setTimeout(() => focusField(path, tries - 1), 50);
  }
};

/**
 * Go to an issue's field: select its key, so the inspector shows it, and focus
 * the control. In the phone layout that means opening the key's sheet, or for
 * a channel's problem showing the Channels screen.
 */
export const useJumpToIssue = (): ((issue: Issue) => void) => {
  const setSelectedKey = useSetAtom(selectedKeyAtom);
  const setSheetOpen = useSetAtom(keySheetOpenAtom);
  const setScreen = useSetAtom(phoneScreenAtom);
  const phone = usePhone();
  return (issue) => {
    const key = issueKey(issue);
    if (key !== undefined) setSelectedKey(key);
    if (phone) {
      const place = phonePlaceOf(issue.path);
      if (place.screen === 'keys') {
        setScreen('keys');
        setSheetOpen(true);
      } else if (place.screen === 'channels') {
        setSheetOpen(false);
        setScreen('channels');
      }
    }
    focusField(issue.path);
  };
};

/**
 * Whether the system can be exported. While it can, there is nothing to see:
 * the Export button says enough, and "Ready to export" is only spoken. While
 * it can't, a count of problems that opens a list; choosing one jumps to the
 * field to fix.
 */
export const ProblemsButton = () => {
  const issues = useAtomValue(issuesAtom);
  const system = useAtomValue(systemAtom);
  const jump = useJumpToIssue();
  const redPill = useRedPill();
  if (issues.length === 0) {
    return (
      // `.top-said` (TopBar.tsx): for screen readers only.
      <div className="top-said" role="status">
        Ready to export
      </div>
    );
  }

  // A stereo pair can raise the same problem twice; list it once.
  const problems = [
    ...new Map(
      issues.map((issue) => {
        const message = describeIssue(issue, system);
        return [`${issue.path}|${message}`, { issue, message }] as const;
      }),
    ),
  ];
  const count = `${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}`;

  return (
    <YStack>
      <Menu
        trigger={(props, open) => (
          <Action
            {...props}
            theme="red"
            kind="primary"
            // `.top-problems` (TopBar.tsx) tightens it on a narrow bar.
            className="target top-problems"
            px="3"
            aria-label={`${count} to fix before exporting`}
            {...redPill}
            {...(open ? { bg: 'color-8', borderColor: 'color-8' } : {})}
          >
            <XStack items="center" gap="1.5">
              <SizableText size="sm" color={redPill.color} aria-hidden>
                ⚠
              </SizableText>
              <SizableText size="sm" className="top-label" color={redPill.color}>
                {problems.length}
                <span className="top-quiet">
                  {problems.length === 1 ? ' problem' : ' problems'}
                </span>
              </SizableText>
            </XStack>
          </Action>
        )}
        panel={{ maxH: 360, overflow: 'scroll' }}
      >
        {problems.map(([id, { issue, message }]) => (
          <MenuItem key={id} py="2" px="2.5" onSelect={() => jump(issue)}>
            <XStack items="baseline" gap="2" w="100%">
              <SizableText size="sm" theme="red" color="color-7" aria-hidden>
                ⚠
              </SizableText>
              <SizableText size="sm" className="menu-text" text="left" flex={1}>
                {message}
              </SizableText>
            </XStack>
          </MenuItem>
        ))}
      </Menu>
    </YStack>
  );
};
