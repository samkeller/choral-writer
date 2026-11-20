// PROTOTYPE — barre flottante de bascule entre variantes. À jeter avec le prototype.
import { useEffect } from 'react';
import { ActionIcon, Group, Paper, Text } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useSearchParams } from 'react-router-dom';

interface PrototypeSwitcherProps {
  param: string;
  variants: { key: string; name: string }[];
}

export function PrototypeSwitcher({ param, variants }: PrototypeSwitcherProps) {
  const [search, setSearch] = useSearchParams();
  const index = Math.max(0, variants.findIndex((variant) => variant.key === search.get(param)));
  const current = variants[index];

  const go = (delta: number) => {
    const next = variants[(index + delta + variants.length) % variants.length];
    setSearch((params) => { const copy = new URLSearchParams(params); copy.set(param, next.key); return copy; }, { replace: true });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable]')) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <Paper shadow="xl" radius="xl" px="sm" py={4} bg="yellow.4"
      style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}>
      <Group gap="xs" wrap="nowrap">
        <ActionIcon variant="subtle" color="dark" onClick={() => go(-1)} aria-label="Variante précédente"><IconChevronLeft size={18} /></ActionIcon>
        <Text size="sm" fw={700} c="dark.9">PROTOTYPE · {current.key} ({current.name})</Text>
        <ActionIcon variant="subtle" color="dark" onClick={() => go(1)} aria-label="Variante suivante"><IconChevronRight size={18} /></ActionIcon>
      </Group>
    </Paper>
  );
}
