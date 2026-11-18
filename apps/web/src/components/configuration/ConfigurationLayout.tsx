import type { ReactNode } from 'react';
import { Badge, Box, Button, Flex, Group, NavLink, Stack, Text, Title, type MantineColor } from '@mantine/core';
import styles from './ConfigurationLayout.module.css';

type Status = { label: string; color?: MantineColor };
type PrimaryAction = {
  label: string;
  accessibleLabel?: string;
  loading?: boolean;
  disabled?: boolean;
} & ({ onClick: () => void; form?: never } | { form: string; onClick?: never });

export function ConfigurationWorkspace({ navigation, children }: {
  navigation: ReactNode;
  children: ReactNode;
}) {
  return (
    <Flex className={styles.workspace}>
      <Box component="aside" className={styles.rail} p="sm">
        <Stack component="nav" className={styles.navigation} gap="xs" aria-label="Sections de configuration">
          {navigation}
        </Stack>
      </Box>
      <Flex className={styles.main} direction="column">{children}</Flex>
    </Flex>
  );
}

export function ConfigurationPanel({ active, children }: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Flex className={styles.panel} direction="column" style={{ display: active ? 'flex' : 'none' }}>
      {children}
    </Flex>
  );
}

export function ConfigurationSection({ title, primaryAction, actions, controls, feedback, children }: {
  title: string;
  primaryAction?: PrimaryAction;
  actions?: ReactNode;
  controls?: ReactNode;
  feedback?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Flex component="section" aria-label={title} className={styles.section} direction="column">
      <Group role="toolbar" aria-label={`Actions ${title}`} className={styles.sectionHeader} px="md" py="sm" justify="space-between" gap="sm">
        <Title order={2} size="h4">{title}</Title>
        {actions && <Group gap="xs" className={styles.actions}>{actions}</Group>}
        {primaryAction && <Button size="sm" variant="filled" w={{ base: '100%', sm: 'auto' }}
          type={primaryAction.form ? 'submit' : 'button'} form={primaryAction.form}
          aria-label={primaryAction.accessibleLabel} loading={primaryAction.loading}
          disabled={primaryAction.disabled} onClick={primaryAction.onClick}>
          {primaryAction.label}
        </Button>}
      </Group>
      {controls && <Group className={styles.controls} px="md" py="sm" gap="md">{controls}</Group>}
      {feedback && <Stack px="md" pt="sm" gap="xs">{feedback}</Stack>}
      <Flex className={styles.sectionContent} direction="column">{children}</Flex>
    </Flex>
  );
}

export function ConfigurationScrollArea({ children }: { children: ReactNode }) {
  return <Box className={styles.scrollArea} p="md">{children}</Box>;
}

export function ConfigurationSplitView({ children }: { children: ReactNode }) {
  return <Flex className={styles.split}>{children}</Flex>;
}

export function ConfigurationListPane({ title, count, actions, filters, children }: {
  title: string;
  count: number;
  actions?: ReactNode;
  filters?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Flex className={styles.list} direction="column">
      <Stack className={styles.listHeader} p="md" gap="sm">
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" miw={0}>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">{title}</Text>
            <Badge size="xs" color="gray" variant="light">{count}</Badge>
          </Group>
          {actions && <Group gap={4} wrap="nowrap">{actions}</Group>}
        </Group>
        {filters}
      </Stack>
      <Stack className={styles.listItems} px="sm" pb="sm" gap="xs">{children}</Stack>
    </Flex>
  );
}

export function ConfigurationListItem({ label, description, metadata, status, selected, onClick }: {
  label: string;
  description: string;
  metadata?: string;
  status?: Status;
  selected: boolean;
  onClick: () => void;
}) {
  return <NavLink component="button" type="button" variant="light" active={selected} aria-pressed={selected}
    onClick={onClick} p="sm" bdrs="sm" label={
      <Stack gap={4}>
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Text size="sm" fw={600} truncate>{label}</Text>
          {status && <Badge size="xs" variant="light" color={status.color ?? 'gray'}>{status.label}</Badge>}
        </Group>
        <Text size="xs" c="dimmed" lineClamp={2}>{description}</Text>
        {metadata && <Text size="xs" c="dimmed" lineClamp={1}>{metadata}</Text>}
      </Stack>
    } />;
}

export function ConfigurationDetailPane({ children }: {
  children: ReactNode;
}) {
  return (
    <Box className={styles.detailBody} p="md">
      <Stack gap="lg" maw="48rem" miw={0}>{children}</Stack>
    </Box>
  );
}
