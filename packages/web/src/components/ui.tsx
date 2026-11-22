/**
 * Shared primitives. Use these rather than styling Tamagui's Button ad hoc, so
 * actions look the same everywhere.
 */

import type { ComponentProps } from 'react';
import { Button, SizableText, styled, YStack } from 'tamagui';

/**
 * A button, pill-shaped. `primary` is the one main action in a region, in
 * ink; `subtle` is a secondary action with an outline; `ghost` is a toolbar
 * or inline action with no chrome until hovered. In the red theme a primary
 * button is the destructive one.
 */
export const Action = styled(Button, {
  size: 'sm',
  rounded: 'full',
  borderWidth: 1.5,
  cursor: 'pointer',
  fontWeight: '600',
  variants: {
    kind: {
      primary: {
        bg: { default: 'color', hover: 'color-10', press: 'color-10' },
        borderColor: { default: 'color', hover: 'color-10', press: 'color-10' },
        color: 'background',
      },
      subtle: {
        bg: { default: 'transparent', hover: 'color-2', press: 'color-3' },
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
 * A region of the page, laid straight on the canvas with its own heading.
 * Pass `render="section"` and an `aria-label` or `aria-labelledby`.
 */
export const Panel = (props: ComponentProps<typeof YStack>) => <YStack gap="2.5" {...props} />;

/** A raised surface (`.card` in styles.css): the inspector. */
export const Card = ({ className, ...props }: ComponentProps<typeof YStack>) => (
  <YStack className={className ? `card ${className}` : 'card'} rounded={24} {...props} />
);

/** A region's heading: big, heavy and fully round, the page's display voice. */
export const PanelTitle = styled(SizableText, {
  render: 'h2',
  className: 'display',
  size: 'xl',
  // 22px on the `xl` line height; a number for `lineHeight` would be read as a size token.
  fontSize: 22,
  fontWeight: '700',
  color: 'color',
  m: '0',
});
