import type { Issue } from '@mcmillan/2me2u-core';
import { useAtomValue, useSetAtom } from 'jotai';
import { SizableText, XStack, YStack } from 'tamagui';
import { describeIssue, issueIsAt, issueKey } from '../lib/messages.ts';
import { issuesAtom, selectedKeyAtom, systemAtom } from '../lib/store.ts';
import { WarningIcon } from './FieldError.tsx';
import { Menu, MenuItem } from './Menu.tsx';
import { Action } from './ui.tsx';

const CheckIcon = () => (
  <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path
      d="M3 8.5 6.5 12 13 4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * The input for an issue: the element whose `data-issue-path` is the issue's
 * path, or the closest field containing it (`keys[3]` for `keys[3].level`).
 */
const fieldFor = (path: string): HTMLElement | undefined => {
  const fields = [...document.querySelectorAll<HTMLElement>('[data-issue-path]')].filter((el) =>
    issueIsAt(path, el.dataset.issuePath ?? ''),
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

/** Go to an issue's field: select its key, so the inspector shows it, and focus the control. */
export const useJumpToIssue = (): ((issue: Issue) => void) => {
  const setSelectedKey = useSetAtom(selectedKeyAtom);
  return (issue) => {
    const key = issueKey(issue);
    if (key !== undefined) setSelectedKey(key);
    focusField(issue.path);
  };
};

/**
 * Whether the system can be exported: a quiet "Ready to export", or a count of
 * problems that opens a list; choosing one jumps to the field to fix.
 */
export const ProblemsButton = () => {
  const issues = useAtomValue(issuesAtom);
  const system = useAtomValue(systemAtom);
  const jump = useJumpToIssue();
  if (issues.length === 0) {
    return (
      // `.top-ready` and `.top-quiet` (TopBar.tsx): on a narrow bar the check
      // stands for the words, and on the narrowest the words are only spoken.
      <XStack className="top-ready" items="center" gap="1.5" px="1.5" role="status">
        <SizableText size="sm" color="color-10" aria-hidden>
          <CheckIcon />
        </SizableText>
        <span className="top-quiet">
          <SizableText size="sm" color="color-10">
            Ready to export
          </SizableText>
        </span>
      </XStack>
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
            kind="subtle"
            className="target"
            px="2"
            aria-label={`${count} to fix before exporting`}
            bg={open ? 'color-4' : { default: 'color-2', hover: 'color-3', press: 'color-4' }}
            borderColor="color-7"
            color="color-11"
          >
            <XStack items="center" gap="1.5">
              <SizableText size="sm" color="color-11" aria-hidden>
                <WarningIcon />
              </SizableText>
              <SizableText size="sm" fontWeight="600" color="color-11">
                {problems.length}
                <span className="top-quiet">
                  {problems.length === 1 ? ' problem' : ' problems'}
                </span>
              </SizableText>
            </XStack>
          </Action>
        )}
        panel={{ maxH: 360, overflow: 'scroll', p: '1', gap: '0.5' }}
      >
        {problems.map(([id, { issue, message }]) => (
          <MenuItem key={id} py="2" px="2.5" onSelect={() => jump(issue)}>
            <XStack items="flex-start" gap="2" w="100%">
              <SizableText size="sm" theme="red" color="color-7" pt="0.5" aria-hidden>
                <WarningIcon />
              </SizableText>
              <SizableText size="sm" text="left" flex={1}>
                {message}
              </SizableText>
            </XStack>
          </MenuItem>
        ))}
      </Menu>
    </YStack>
  );
};
