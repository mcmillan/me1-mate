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
import { ACCENT, DISPLAY_FONT } from '../lib/theme.ts';
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
      {/* The file name keeps its place at the end of the first line; a long title wraps beside it. */}
      <XStack items="baseline" justify="space-between" gap="3" opacity={disabled ? 0.5 : 1}>
        <SizableText size="sm" fontWeight="600" minW={0}>
          {title}
        </SizableText>
        <SizableText
          size="xs"
          fontFamily={DISPLAY_FONT}
          color="color-11"
          shrink={0}
          whiteSpace="nowrap"
        >
          {file}
        </SizableText>
      </XStack>
      <SizableText size="xs" color="color-10" opacity={disabled ? 0.5 : 1}>
        {hint}
      </SizableText>
      {reason && (
        <SizableText size="xs" fontWeight="600" color="color-11">
          {reason}
        </SizableText>
      )}
    </MenuItem>
  );
};

const GoIcon = () => (
  <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path
      d="M3 8h9.5M8.5 4l4 4-4 4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronIcon = () => (
  <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
    <path
      d="M2.5 4.5 6 8l3.5-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

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
            theme={ACCENT}
            kind="primary"
            // `.top-export` (TopBar.tsx) keeps it the primary button in forced colours.
            className="target top-export"
            px="3"
            {...(open ? { bg: 'color-10', borderColor: 'color-10' } : {})}
          >
            <XStack items="center" gap="1.5">
              <SizableText size="sm" fontWeight="600" color="color-1">
                Export
              </SizableText>
              <SizableText size="sm" color="color-1" aria-hidden>
                <ChevronIcon />
              </SizableText>
            </XStack>
          </Action>
        )}
        panel={{ w: 364 }}
      >
        {/* Why nothing can be exported, and the way to the (first) problem. */}
        {blocked && firstIssue && (
          <Theme name="red">
            <MenuItem
              id={noteId}
              onSelect={() => jump(firstIssue)}
              px="3"
              py="2"
              gap="0.5"
              bg={{ default: 'color-2', hover: 'color-3', focus: 'color-3' }}
            >
              <XStack items="center" justify="space-between" gap="3">
                <SizableText size="sm" fontWeight="700" color="color-11">
                  {blocked}
                </SizableText>
                <SizableText size="sm" color="color-11" shrink={0}>
                  <GoIcon />
                </SizableText>
              </XStack>
              <SizableText size="xs" color="color-11">
                The ME-1 wouldn’t accept it.{' '}
                {issues.length === 1 ? 'Go to the problem.' : 'Go to the first one.'}
              </SizableText>
            </MenuItem>
          </Theme>
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
