// PROTOTYPE — PipelineProgress compact : une ligne pendant le tour, repliée sous le message une fois le tour fini.
import { useEffect, useRef, useState } from 'react';
import { Box, Button, Group, Loader, Text, UnstyledButton } from '@mantine/core';
import { IconAlertTriangle, IconChevronRight } from '@tabler/icons-react';

import { type DebugTurn, seconds, usd } from './fixtures';

const stages = ['Analyse', 'Direction', 'Narrateur', 'Gardien', 'Mémoire'] as const;
const stageMs = [6000, 2500, 7000, 2500, 1200];

export type Simulation =
  | { status: 'idle' }
  | { status: 'running'; stage: number; agentsDone: number; elapsedMs: number }
  | { status: 'failed'; stage: number; elapsedMs: number };

export function useSimulatedTurn() {
  const [simulation, setSimulation] = useState<Simulation>({ status: 'idle' });
  const failAt = useRef<number | null>(null);

  useEffect(() => {
    if (simulation.status !== 'running') return;
    const timer = setTimeout(() => {
      setSimulation((current) => {
        if (current.status !== 'running') return current;
        const elapsedMs = current.elapsedMs + 200;
        const stageStart = stageMs.slice(0, current.stage).reduce((sum, ms) => sum + ms, 0);
        if (failAt.current === current.stage && elapsedMs - stageStart > stageMs[current.stage] / 2) {
          return { status: 'failed', stage: current.stage, elapsedMs };
        }
        if (elapsedMs - stageStart >= stageMs[current.stage]) {
          return current.stage === stages.length - 1 ? { status: 'idle' } : { ...current, stage: current.stage + 1, elapsedMs };
        }
        const agentsDone = current.stage === 0 ? Math.min(4, Math.floor(((elapsedMs - stageStart) / stageMs[0]) * 5)) : 4;
        return { ...current, elapsedMs, agentsDone };
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [simulation]);

  return {
    simulation,
    start: (failingStage: number | null = null) => {
      failAt.current = failingStage;
      setSimulation({ status: 'running', stage: 0, agentsDone: 0, elapsedMs: 0 });
    },
    reset: () => setSimulation({ status: 'idle' }),
  };
}

/** Pendant le tour : une seule ligne, sans détail par agent. */
export function LiveProgress({ simulation, onRetry }: { simulation: Exclude<Simulation, { status: 'idle' }>; onRetry: () => void }) {
  const failed = simulation.status === 'failed';
  const detail = simulation.status === 'running' && simulation.stage === 0 ? ` · ${simulation.agentsDone}/4 agents` : '';
  return (
    <Group gap="xs" wrap="nowrap" py={4} role="status">
      {failed ? <IconAlertTriangle size={14} color="var(--mantine-color-red-5)" /> : <Loader size={12} color="choral.3" />}
      <Text size="xs" c={failed ? 'red.4' : 'dimmed'}>
        {failed ? `Échec : ${stages[simulation.stage]}` : `${stages[simulation.stage]}${detail}`} · {seconds(simulation.elapsedMs)}
      </Text>
      <Group gap={2} wrap="nowrap" style={{ flex: '0 0 120px' }}>
        {stages.map((stage, index) => (
          <Box key={stage} h={3} style={{
            flex: 1, borderRadius: 2,
            background: index < simulation.stage ? 'var(--mantine-color-choral-4)'
              : index === simulation.stage ? (failed ? 'var(--mantine-color-red-6)' : 'var(--mantine-color-choral-7)')
                : 'var(--mantine-color-dark-4)',
          }} />
        ))}
      </Group>
      {failed && <Button size="compact-xs" variant="light" color="red" onClick={onRetry}>Réessayer</Button>}
    </Group>
  );
}

/** Une fois le tour fini : durée et coût. En mode Debug, la ligne s'enrichit et ouvre le tour. */
export function TurnLine({ turn, debug, selected, onOpen }: { turn: DebugTurn; debug: boolean; selected?: boolean; onOpen?: () => void }) {
  const base = `${seconds(turn.durationMs)} · ${usd(turn.costUsd)}`;
  if (!debug) return <Text size="xs" c="dark.2" py={2}>{base}</Text>;
  const nudges = turn.direction?.nudges.length ?? 0;
  return (
    <UnstyledButton onClick={onOpen} py={2} px={6} style={{
      borderRadius: 4, background: selected ? 'var(--mantine-color-dark-5)' : undefined,
      borderLeft: selected ? '2px solid var(--mantine-color-choral-4)' : '2px solid transparent',
    }}>
      <Group gap={6} wrap="nowrap">
        <Text size="xs" c="dimmed">Tour {turn.index + 1} · {base}</Text>
        {nudges > 0 && <Text size="xs" c="violet.3">· {nudges} nudge{nudges > 1 ? 's' : ''}</Text>}
        {turn.configChanges.length > 0 && <Text size="xs" c="blue.3">· config modifiée</Text>}
        {!turn.direction && <Text size="xs" c="gray.5">· sans Directeur</Text>}
        <IconChevronRight size={12} color="var(--mantine-color-dimmed)" />
      </Group>
    </UnstyledButton>
  );
}
