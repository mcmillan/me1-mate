import { useAtomValue, useSetAtom } from 'jotai';
import { useId } from 'react';
import { SizableText, Theme, XStack, YStack } from 'tamagui';
import { download } from '../lib/files.ts';
import {
  configNameAtom,
  issuesAtom,
  markSavedAtom,
  me1Atom,
  meuAtom,
  toastAtom,
} from '../lib/store.ts';
import { Menu, MenuItem } from './Menu.tsx';
import { useJumpToIssue } from './ProblemsButton.tsx';
import { Action } from './ui.tsx';

const MEU_NAME = 'ChannelSetup.meu';

interface RowProps {
  readonly title: string;
  readonly file: string;
  /** What to do with the file. */
  readonly hint: string;
  readonly disabled: boolean;
  /** Why this row in particular can't be used, shown under it. */
  readonly reason?: string | undefined;
  /** The id of the note that explains why the row is disabled. */
  readonly describedBy?: string | undefined;
  readonly onSelect: () => void;
}

const Row = ({ title, file, hint, disabled, reason, describedBy, onSelect }: RowProps) => {
  return (
    <MenuItem
      disabled={disabled}
      onSelect={onSelect}
      aria-describedby={describedBy}
      gap="0.5"
      px="3"
      py="2.5"
    >
      {/* The file name ends the first line, or takes a line of its own in a narrow menu. */}
      <XStack
        flexWrap="wrap"
        items="baseline"
        justify="space-between"
        columnGap="3"
        opacity={disabled ? 0.45 : 1}
      >
        <SizableText size="sm" className="menu-text">
          {title}
        </SizableText>
        <SizableText size="sm" className="menu-name" shrink={0} whiteSpace="nowrap">
          {file}
        </SizableText>
      </XStack>
      <SizableText size="xs" className="menu-hint" color="color-8" opacity={disabled ? 0.6 : 1}>
        {hint}
      </SizableText>
      {reason && (
        <SizableText size="xs" className="menu-text" theme="red" color="color-7">
          <span aria-hidden="true">⚠ </span>
          {reason}
        </SizableText>
      )}
    </MenuItem>
  );
};

/**
 * Export button and menu for the .ME1 and .meu. While problems block the
 * export, the menu starts with an item that says so and goes to the first one.
 */
export const ExportMenu = () => {
  const me1 = useAtomValue(me1Atom);
  const meu = useAtomValue(meuAtom);
  const issues = useAtomValue(issuesAtom);
  const configName = useAtomValue(configNameAtom);
  const markSaved = useSetAtom(markSavedAtom);
  const toast = useSetAtom(toastAtom);
  const jump = useJumpToIssue();

  const save = (data: Uint8Array | string, name: string, type: string) => {
    download(data, name, type);
    markSaved(typeof data === 'string' ? 'meu' : 'me1');
    toast({ message: `Saved ${name}`, tone: 'success' });
  };

  const blocked =
    issues.length > 0
      ? `Fix ${issues.length} ${issues.length === 1 ? 'problem' : 'problems'} first`
      : undefined;
  const me1Name = `${configName}.ME1`;
  const unnamed = configName === '';
  const noteId = `${useId()}-blocked`;
  const describedBy = blocked ? noteId : undefined;
  const [firstIssue] = issues;

  return (
    <YStack>
      <Menu
        trigger={(props, open) => (
          <Action
            {...props}
            kind="primary"
            // `.top-export` (TopBar.tsx) keeps it the primary button in forced colours.
            className="target top-export"
            px={18}
            {...(open ? { bg: 'color-10', borderColor: 'color-10' } : {})}
          >
            <XStack items="center" gap="1.5">
              <SizableText size="sm" className="top-label" color="background">
                Export
              </SizableText>
              <SizableText size="sm" color="background" aria-hidden>
                <span className="top-arrow">↓</span>
              </SizableText>
            </XStack>
          </Action>
        )}
        panel={{ w: 380 }}
      >
        {/* Why nothing can be exported, and the way to the (first) problem. */}
        {blocked && firstIssue && (
          <MenuItem id={noteId} onSelect={() => jump(firstIssue)} px="3" py="2.5" gap="0.5">
            <Theme name="red">
              <XStack items="baseline" justify="space-between" gap="3">
                <SizableText size="sm" className="menu-name" color="color-7">
                  <span aria-hidden="true">⚠ </span>
                  {blocked}
                </SizableText>
                <SizableText size="sm" className="menu-name" color="color-7" shrink={0} aria-hidden>
                  →
                </SizableText>
              </XStack>
            </Theme>
            <SizableText size="xs" className="menu-hint" color="color-8">
              The ME-1 wouldn’t accept it.{' '}
              {issues.length === 1 ? 'Go to the problem.' : 'Go to the first one.'}
            </SizableText>
          </MenuItem>
        )}
        <Row
          title="Config for the ME-1"
          file={me1Name}
          hint="Copy to the ME1CFG folder on the USB stick."
          disabled={blocked !== undefined || unnamed}
          reason={unnamed ? 'Give the config a name first' : undefined}
          describedBy={describedBy}
          onSelect={() => {
            if (me1.isOk && !unnamed) save(me1.value, me1Name, 'application/octet-stream');
          }}
        />
        <Row
          title="Channel setup for the ME-U"
          file={MEU_NAME}
          hint="Channel names and stereo links, to load into the ME-U."
          disabled={blocked !== undefined || meu.isErr}
          describedBy={describedBy}
          onSelect={() => {
            if (meu.isOk) save(meu.value, MEU_NAME, 'application/json');
          }}
        />
      </Menu>
    </YStack>
  );
};
