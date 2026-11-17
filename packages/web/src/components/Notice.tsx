import type { ReactNode } from 'react';
import { SizableText, YStack, type YStackProps } from 'tamagui';
import { DISPLAY_FONT } from '../lib/theme.ts';

/**
 * The strip lays itself out by its own width, not the window's: icon, text and
 * actions in a row when there's room, and the actions on a row of their own
 * when there isn't.
 */
const CSS = `
.notice { container: notice / inline-size; }
.notice button.target { min-block-size: max(38px, var(--target)); }
.notice button:focus-visible { outline-color: var(--focus); }
.notice-row { display: grid; grid-template-columns: minmax(0, 1fr); align-items: center; gap: 8px 12px; }
.notice-icon { display: none; align-self: start; }
.notice-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
@container notice (inline-size >= 480px) {
  .notice-row { grid-template-columns: auto minmax(0, 1fr); }
  .notice-icon { display: flex; }
}
@container notice (inline-size >= 720px) {
  .notice-row { grid-template-columns: auto minmax(0, 1fr) auto; }
  .notice-icon { align-self: center; }
  .notice-actions { grid-column: auto; flex-wrap: nowrap; }
}
`;

type NoticeProps = Omit<YStackProps, 'children'> & {
  /** An 18px icon for the tile at the start of the strip. */
  readonly icon: ReactNode;
  /** `problem` is for something that went wrong; wrap the notice in the red theme. */
  readonly tone?: 'plain' | 'problem';
  /** Buttons, at the end of the strip. */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
};

/**
 * A full-width strip above the workspace: how to begin, files that couldn't be
 * opened. Compact, and never in the way of the editor below it.
 */
export const Notice = ({ icon, tone = 'plain', actions, children, ...props }: NoticeProps) => {
  const problem = tone === 'problem';
  return (
    <YStack
      className={problem ? 'notice' : 'notice panel'}
      px="3"
      py="3"
      rounded="xl"
      borderWidth={1}
      {...(problem ? { bg: 'color-2', borderColor: 'color-6' } : {})}
      {...props}
    >
      {/* One copy in the document, however many notices are shown. */}
      <style href="notice" precedence="default">
        {CSS}
      </style>
      <div className="notice-row">
        <YStack
          className="notice-icon"
          w={36}
          h={36}
          rounded="lg"
          items="center"
          justify="center"
          color={problem ? 'color-11' : 'color-10'}
          {...(problem ? { bg: 'color-4' } : {})}
          style={problem ? undefined : { background: 'var(--well)' }}
          aria-hidden
        >
          {icon}
        </YStack>
        <YStack gap="0.5" minW={0}>
          {children}
        </YStack>
        {actions && <div className="notice-actions">{actions}</div>}
      </div>
    </YStack>
  );
};

/** A notice's heading: one short line saying what it is. */
export const NoticeTitle = ({ id, children }: { id?: string; children: ReactNode }) => (
  <SizableText {...(id ? { id } : {})} render="h2" size="sm" fontWeight="600" m="0">
    {children}
  </SizableText>
);

/** A file extension, config name or folder, set the way the hardware shows it. */
export const Mono = ({ children }: { children: ReactNode }) => (
  <SizableText render="code" size="sm" fontFamily={DISPLAY_FONT} fontWeight="600" color="color">
    {children}
  </SizableText>
);
