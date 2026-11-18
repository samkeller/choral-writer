import type { ReactNode } from 'react';
import { Button, NavLink, Stack, Text } from '@mantine/core';
import { IconBook2, IconHome2, IconUsers } from '@tabler/icons-react';
import { Link, useMatch, useResolvedPath } from 'react-router-dom';

import styles from './WorkspaceLayout.module.css';

const navigation = [
  { path: '/', label: 'Accueil', icon: IconHome2 },
  { path: '/projects', label: 'Projets', icon: IconBook2 },
  { path: '/agents', label: 'Agents', icon: IconUsers },
];

export function WorkspaceNavigation({ compact = false, trailingAction }: {
  compact?: boolean;
  trailingAction?: ReactNode;
}) {
  return (
    <nav className={compact ? styles.mobileNavigation : undefined} aria-label="Navigation principale">
      {compact
        ? <>
            {navigation.map((item) => <CompactNavButton key={item.path} item={item} />)}
            {trailingAction}
          </>
        : <Stack gap={4}>{navigation.map((item) => <NavButton key={item.path} item={item} />)}</Stack>}
    </nav>
  );
}

function NavButton({ item }: { item: (typeof navigation)[number] }) {
  const resolved = useResolvedPath(item.path);
  const active = useMatch({ path: resolved.pathname, end: item.path === '/' }) !== null;
  const Icon = item.icon;

  return (
    <NavLink
      component={Link}
      to={item.path}
      label={item.label}
      leftSection={<Icon size={19} stroke={1.7} />}
      variant="light"
      color="choral"
      active={active}
      aria-current={active ? 'page' : undefined}
    />
  );
}

function CompactNavButton({ item }: { item: (typeof navigation)[number] }) {
  const resolved = useResolvedPath(item.path);
  const active = useMatch({ path: resolved.pathname, end: item.path === '/' }) !== null;
  const Icon = item.icon;

  return (
    <Button
      component={Link}
      to={item.path}
      variant={active ? 'light' : 'subtle'}
      color={active ? 'choral' : 'gray'}
      size="xs"
      h={56}
      px={4}
      aria-current={active ? 'page' : undefined}
    >
      <Stack gap={2} align="center">
        <Icon size={18} stroke={1.7} />
        <Text size="xs" lineClamp={1}>{item.label}</Text>
      </Stack>
    </Button>
  );
}
