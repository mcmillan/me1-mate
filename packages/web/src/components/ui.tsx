/**
 * Shared primitives. Use these rather than styling Tamagui's Button ad hoc, so
 * actions look the same everywhere.
 */

import type { Key } from '@mcmillan/2me2u-core';
import type { ComponentProps } from 'react';
import { Button, SizableText, styled, Theme, YStack } from 'tamagui';
import { KEY_TYPE_THEME } from '../lib/theme.ts';

/**
 * A button. `primary` is the one main action in a region (wrap it in
 * `<Theme name={ACCENT}>` for the accent colour); `subtle` is a secondary
 * action; `ghost` is a toolbar or inline action with no chrome until hovered.
 */
export const Action = styled(Button, {
  size: 'sm',
  rounded: 'md',
  borderWidth: 1,
  cursor: 'pointer',
  variants: {
    kind: {
      primary: {
        bg: { default: 'color-8', hover: 'color-9', press: 'color-10' },
        borderColor: { default: 'color-8', hover: 'color-9', press: 'color-10' },
        // `color-1`, not `background`: on the orange and red themes `background` is a tint.
        color: 'color-1',
      },
      subtle: {
        bg: { default: 'color-2', hover: 'color-3', press: 'color-4' },
        borderColor: 'border-color',
        color: 'color',
      },
      ghost: {
        bg: { default: 'transparent', hover: 'color-2', press: 'color-3' },
        borderColor: 'transparent',
        color: 'color',
      },
    },
    disabled: {
      true: { opacity: 0.4, cursor: 'not-allowed' },
    },
  } as const,
  defaultVariants: { kind: 'subtle' },
});

/**
 * A section of the page: a raised surface (`.panel` in styles.css) with its
 * own heading. Pass `render="section"` and an `aria-label` or
 * `aria-labelledby`.
 */
export const Panel = ({ className, ...props }: ComponentProps<typeof YStack>) => (
  <YStack
    className={className ? `panel ${className}` : 'panel'}
    gap="3"
    p="4"
    rounded="xl"
    borderWidth={1}
    {...props}
  />
);

/** A panel's heading: small capitals, so the content below it leads. */
export const PanelTitle = styled(SizableText, {
  render: 'h2',
  size: 'xs',
  fontWeight: '700',
  letterSpacing: 1.2,
  textTransform: 'uppercase',
  color: 'color-8',
  m: '0',
});

/** A dot in a key type's colour; nothing for an unassigned key. */
export const TypeDot = ({ type, size = 8 }: { type: Key['type']; size?: number }) =>
  type === 'unassigned' ? null : (
    <Theme name={KEY_TYPE_THEME[type]}>
      <YStack
        className="type-dot"
        w={size}
        h={size}
        rounded="full"
        bg="color-9"
        shrink={0}
        aria-hidden
      />
    </Theme>
  );
