import { forwardRef } from 'react';
import { ActionIcon, createPolymorphicComponent, Tooltip, type ActionIconProps } from '@mantine/core';

interface IconActionProps extends ActionIconProps {
  label: string;
}

export const IconAction = createPolymorphicComponent<'button', IconActionProps>(
  forwardRef<HTMLButtonElement, IconActionProps>(({ label, children, ...props }, ref) => (
    <Tooltip label={label} withArrow multiline maw="min(20rem, calc(100vw - var(--mantine-spacing-xl)))"
      style={{ overflowWrap: 'anywhere' }} events={{ hover: true, focus: true, touch: false }}>
      <ActionIcon ref={ref} variant="subtle" color="gray" size="lg" {...props} aria-label={label}>
        {children}
      </ActionIcon>
    </Tooltip>
  )),
);
