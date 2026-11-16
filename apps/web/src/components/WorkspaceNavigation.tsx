import { Button } from '@mantine/core';
import { IconBook2, IconBrain, IconHome2, IconRoute, IconUsers } from '@tabler/icons-react';
import { Link, useMatch, useResolvedPath } from 'react-router-dom';

const navigation = [
  { path: '/', label: 'Accueil', icon: IconHome2 },
  { path: '/projects', label: 'Projets', icon: IconBook2 },
  { path: '/agents', label: 'Agents', icon: IconUsers },
  { path: '/memories', label: 'Mémoires', icon: IconBrain },
  { path: '/traces', label: 'Traces', icon: IconRoute },
];

export function WorkspaceNavigation({ compact = false }: { compact?: boolean }) {
  return (
    <nav
      className={compact ? 'mobile-navigation' : 'desktop-navigation'}
      aria-label="Navigation principale"
    >
      {navigation.map((item) => <NavButton key={item.path} item={item} compact={compact} />)}
    </nav>
  );
}

function NavButton({ item, compact }: { item: (typeof navigation)[number]; compact: boolean }) {
  const resolved = useResolvedPath(item.path);
  const active = useMatch({ path: resolved.pathname, end: item.path === '/' }) !== null;
  const Icon = item.icon;

  return (
    <Button
      component={Link}
      to={item.path}
      variant={active ? 'light' : 'subtle'}
      color={active ? 'teal' : 'gray'}
      className={compact ? 'mobile-nav-button' : 'desktop-nav-button'}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={19} stroke={1.7} />
      <span>{item.label}</span>
    </Button>
  );
}
