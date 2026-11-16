import type { ReactNode } from 'react';
import { Group, Stack, Text, Title } from '@mantine/core';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <Group align="flex-start" justify="space-between" gap="md" wrap="wrap">
      <Stack gap={4}>
        <Title order={1} size="h2">{title}</Title>
        {description && <Text c="dimmed">{description}</Text>}
      </Stack>
      {actions}
    </Group>
  );
}
