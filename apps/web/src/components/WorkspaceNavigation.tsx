import type { ReactNode } from 'react';
import { Button, NavLink, Stack, Text } from '@mantine/core';
import { IconBook2, IconHome2, IconUsers } from '@tabler/icons-react';
import { Link, useMatch, useResolvedPath } from 'react-router-dom';

import { IconAction } from './atoms/IconAction';
import styles from './WorkspaceLayout.module.css';

const navigation = [
  { path: '/', label: 'Accueil', icon: IconHome2 },
  { path: '/projects', label: 'Projets', icon: IconBook2 },
  { path: '/agents', label: 'Agents', icon: IconUsers },
];

type NavigationItem = (typeof navigation)[number];

/**
 * `list` : menu latéral complet. `rail` : mêmes liens réduits à leur icône, le libellé
 * passant dans l'infobulle. `compact` : barre basse mobile, icône au-dessus du libellé.
 */
type NavigationVariant = 'list' | 'rail' | 'compact';

export function WorkspaceNavigation({ variant = 'list', trailingAction }: {
  variant?: NavigationVariant;
  trailingAction?: ReactNode;
}) {
  if (variant === 'compact') {
    return (
      <nav className={styles.mobileNavigation} aria-label="Navigation principale">
        {navigation.map((item) => <CompactNavButton key={item.path} item={item} />)}
        {trailingAction}
      </nav>
    );
  }

  const NavButton = variant === 'rail' ? RailNavButton : ListNavButton;

  return (
    <nav aria-label="Navigation principale">
      <Stack gap={4} align={variant === 'rail' ? 'center' : undefined}>
        {navigation.map((item) => <NavButton key={item.path} item={item} />)}
      </Stack>
    </nav>
  );
}

function useActiveItem(path: NavigationItem['path']) {
  const resolved = useResolvedPath(path);
  return useMatch({ path: resolved.pathname, end: path === '/' }) !== null;
}

function ListNavButton({ item }: { item: NavigationItem }) {
  const active = useActiveItem(item.path);
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

function RailNavButton({ item }: { item: NavigationItem }) {
  const active = useActiveItem(item.path);
  const Icon = item.icon;

  return (
    <IconAction
      component={Link}
      to={item.path}
      label={item.label}
      variant={active ? 'light' : 'subtle'}
      color={active ? 'choral' : 'gray'}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={19} stroke={1.7} aria-hidden="true" />
    </IconAction>
  );
}

function CompactNavButton({ item }: { item: NavigationItem }) {
  const active = useActiveItem(item.path);
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
        <Icon size={18} stroke={1.7} aria-hidden="true" />
        <Text size="xs" lineClamp={1}>{item.label}</Text>
      </Stack>
    </Button>
  );
}
