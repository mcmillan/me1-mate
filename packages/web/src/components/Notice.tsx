import type { ComponentProps, ReactNode } from 'react';
import { SizableText } from 'tamagui';

/**
 * A raised card that lays itself out by its own width, not the window's: the
 * sign, the text and the actions in a row when there's room, and the actions
 * on a row of their own when there isn't. The border is what's left of the
 * card in forced colours.
 */
const CSS = `
.notice { container: notice / inline-size; box-sizing: border-box; padding: 14px 16px; border: 1.5px solid var(--line); border-radius: 20px; background: var(--card); box-shadow: var(--shadow); }
.notice button.target { min-block-size: max(38px, var(--target)); }
.notice-row { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 10px 12px; }
.notice-body { display: grid; gap: 4px; min-inline-size: 0; }
.notice-list { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; font-size: 0.875rem; font-weight: var(--w-text); line-height: 1.4; overflow-wrap: break-word; }
.notice-list li { display: block; }
.notice-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
@container notice (inline-size >= 560px) {
  .notice-row { grid-template-columns: auto minmax(0, 1fr) auto; }
  .notice-list li { display: block; }
.notice-actions { grid-column: auto; flex-wrap: nowrap; }
}
@media (prefers-reduced-motion: no-preference) {
  .notice button { transition: scale 200ms var(--spring), background-color 120ms ease-out; }
  .notice button:active { scale: 0.96; }
}
`;

type NoticeProps = Omit<ComponentProps<'div'>, 'children'> & {
  /** Buttons, at the end of the card. */
  readonly actions?: ReactNode;
  /** A `NoticeTitle`, then what there is to say. */
  readonly children: ReactNode;
};

/**
 * A full-width card above the workspace for something that went wrong: files
 * that couldn't be opened. Red is for its sign and its title only.
 */
export const Notice = ({ actions, children, ...props }: NoticeProps) => (
  <div className="notice" {...props}>
    {/* One copy in the document, however many notices are shown. */}
    <style href="notice" precedence="default">
      {CSS}
    </style>
    <div className="notice-row">
      <SizableText theme="red" color="color-7" size="base" aria-hidden>
        ⚠
      </SizableText>
      <div className="notice-body">{children}</div>
      {actions && <div className="notice-actions">{actions}</div>}
    </div>
  </div>
);

/** A notice's heading: one short line saying what went wrong. */
export const NoticeTitle = ({ children }: { children: ReactNode }) => (
  <SizableText
    render="h2"
    className="display"
    theme="red"
    color="color-7"
    size="base"
    fontWeight="700"
    m="0"
  >
    {children}
  </SizableText>
);
