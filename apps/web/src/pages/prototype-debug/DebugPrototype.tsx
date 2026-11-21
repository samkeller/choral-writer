// PROTOTYPE — « Prototype : forme du mode Debug ».
// Trois formes du mode Debug montées sur la vraie page du récit : /projects/:projectId?debug=A|B|C
//   A. Tiroir en sections : le tiroir actuel, refait en blocs empilés par ordre de priorité.
//   B. Tableau de bord : un très grand tiroir, frise des tours en haut, blocs en grille dense.
//   C. Écran partagé : le récit reste lisible à gauche, un panneau fixe à droite suit le tour choisi.
// Communs aux trois : bascule Lecture/Debug dans l'en-tête (ou touche D), PipelineProgress compact.
// Les données du mode Debug sont fictives (fixtures.ts) ; seuls les messages viennent du vrai récit.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActionIcon, Box, Button, Drawer, Group, Paper, ScrollArea, SegmentedControl, SimpleGrid, Stack, Tabs, Text } from '@mantine/core';
import { IconBook, IconBug, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useSearchParams } from 'react-router-dom';
import type { ChatTurn, Message } from '@choral-writer/shared';

import { MessageList } from '../../components/chat/MessageList';
import { PrototypeSwitcher } from '../../components/prototype/PrototypeSwitcher';
import {
  Block, ConfigBlock, ContextBlock, ContextEvolution, ContextLegend, CostBlock, DirectionBlock, StoryRatesBlock, WhatHappenedBlock,
} from './DebugBlocks';
import { buildTurn, type DebugTurn } from './fixtures';
import { LiveProgress, TurnLine, useSimulatedTurn } from './TurnProgress';

const variants = [
  { key: 'A', name: 'Tiroir en sections' },
  { key: 'B', name: 'Tableau de bord' },
  { key: 'C', name: 'Écran partagé' },
];

function useDebugMode() {
  const [search, setSearch] = useSearchParams();
  const debug = search.get('mode') === 'debug';
  const setDebug = (value: boolean) => setSearch((current) => {
    const next = new URLSearchParams(current);
    if (value) next.set('mode', 'debug'); else next.delete('mode');
    return next;
  }, { replace: true });
  return [debug, setDebug] as const;
}

export function ModeToggle() {
  const [debug, setDebug] = useDebugMode();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable]') || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'd' || event.key === 'D') setDebug(!debug);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <SegmentedControl size="xs" value={debug ? 'debug' : 'read'} onChange={(value) => setDebug(value === 'debug')} data={[
      { value: 'read', label: <Group gap={4} wrap="nowrap"><IconBook size={14} />Lecture</Group> },
      { value: 'debug', label: <Group gap={4} wrap="nowrap"><IconBug size={14} />Debug</Group> },
    ]} />
  );
}

interface DebugPrototypeProps {
  messages: Message[];
  turns: ChatTurn[];
  partial: string;
  pending: boolean;
}

export function DebugPrototype({ messages, turns, partial, pending }: DebugPrototypeProps) {
  const [search] = useSearchParams();
  const variant = search.get('debug') ?? 'A';
  const [debug] = useDebugMode();
  const debugTurns = useMemo(() => turns.map((_, index) => buildTurn(index)), [turns]);
  const turnIndex = new Map(turns.map((turn, index) => [turn.id, index]));
  const [selected, setSelected] = useState<number | null>(null);
  const { simulation, start, reset } = useSimulatedTurn();

  useEffect(() => { if (!debug) setSelected(null); }, [debug]);
  useEffect(() => { if (debug && variant === 'C' && selected === null) setSelected(debugTurns.length - 1); }, [debug, variant, selected, debugTurns.length]);

  const list = (
    <MessageList messages={messages} turns={turns} partial={partial} pending={pending} pipelineProgress={null}
      renderTurnFooter={(turnId) => {
        const index = turnIndex.get(turnId);
        if (index === undefined) return null;
        return <Box mt="xs"><TurnLine turn={debugTurns[index]} debug={debug} selected={debug && selected === index} onOpen={() => setSelected(index)} /></Box>;
      }}
      footer={simulation.status !== 'idle' && <LiveProgress simulation={simulation} onRetry={() => start()} />} />
  );

  const navigation = selected !== null && (
    <TurnNavigation index={selected} count={debugTurns.length} onChange={setSelected} />
  );

  return (
    <>
      {variant === 'C' && debug && selected !== null ? (
        <Group h="100%" gap="sm" wrap="nowrap" align="stretch">
          <Box style={{ flex: '1 1 55%', minWidth: 0 }}>{list}</Box>
          <SplitPanel turns={debugTurns} index={selected} navigation={navigation} onSelect={setSelected} />
        </Group>
      ) : list}

      {variant === 'A' && debug && selected !== null && (
        <Drawer opened onClose={() => setSelected(null)} position="right" size="min(100vw, 60rem)" padding="sm"
          title={navigation} overlayProps={{ backgroundOpacity: 0.35, blur: 3 }}>
          <SectionsDrawer turns={debugTurns} index={selected} onSelect={setSelected} />
        </Drawer>
      )}

      {variant === 'B' && debug && selected !== null && (
        <Drawer opened onClose={() => setSelected(null)} position="right" size="96%" padding="sm"
          title={<Group gap="md">{navigation}<Text size="xs" c="dimmed">Cliquer une barre de la frise pour changer de tour</Text></Group>}
          overlayProps={{ backgroundOpacity: 0.35, blur: 3 }}>
          <Dashboard turns={debugTurns} index={selected} onSelect={setSelected} />
        </Drawer>
      )}

      <PrototypeSwitcher param="debug" variants={variants} />
      <Paper p={6} withBorder bg="yellow.4" style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1000 }}>
        <Group gap="xs">
          <Text size="xs" fw={700} c="dark.9">PROTOTYPE</Text>
          <Button size="compact-xs" color="dark" onClick={() => start()}>Simuler un tour</Button>
          <Button size="compact-xs" color="dark" variant="outline" onClick={() => start(2)}>Simuler un échec</Button>
          {simulation.status !== 'idle' && <Button size="compact-xs" color="dark" variant="subtle" onClick={reset}>Effacer</Button>}
        </Group>
      </Paper>
    </>
  );
}

function TurnNavigation({ index, count, onChange }: { index: number; count: number; onChange: (index: number) => void }) {
  return (
    <Group gap={4} wrap="nowrap">
      <ActionIcon variant="subtle" color="gray" disabled={index === 0} onClick={() => onChange(index - 1)} aria-label="Tour précédent"><IconChevronLeft size={16} /></ActionIcon>
      <Text fw={700} size="sm">Tour {index + 1} / {count}</Text>
      <ActionIcon variant="subtle" color="gray" disabled={index === count - 1} onClick={() => onChange(index + 1)} aria-label="Tour suivant"><IconChevronRight size={16} /></ActionIcon>
    </Group>
  );
}

/** A. Le tiroir actuel, en blocs empilés : synthèse, contexte, coût, direction, configuration, puis le récit. */
function SectionsDrawer({ turns, index, onSelect }: { turns: DebugTurn[]; index: number; onSelect: (index: number) => void }) {
  const turn = turns[index];
  return (
    <Stack gap="sm">
      <WhatHappenedBlock turn={turn} />
      <ContextBlock turn={turn} />
      <Block title="Entrée du Narrateur au fil des tours"><ContextEvolution turns={turns} current={index} onSelect={onSelect} height={70} /></Block>
      <CostBlock turn={turn} />
      <DirectionBlock turn={turn} />
      <ConfigBlock turn={turn} />
      <StoryRatesBlock turns={turns} />
      <Button variant="subtle" size="compact-sm" w="fit-content">Appels bruts (prompts et réponses) →</Button>
    </Stack>
  );
}

/** B. Très grand tiroir : frise des tours en tête, blocs en grille dense sur deux colonnes. */
function Dashboard({ turns, index, onSelect }: { turns: DebugTurn[]; index: number; onSelect: (index: number) => void }) {
  const turn = turns[index];
  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="sm">
        <Box style={{ gridColumn: 'span 2' }}>
          <Block title="Frise des tours · entrée du Narrateur" dense aside={<ContextLegend />}>
            <ContextEvolution turns={turns} current={index} onSelect={onSelect} height={80} />
          </Block>
        </Box>
        <StoryRatesBlock turns={turns} dense />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="sm">
        <Stack gap="sm">
          <WhatHappenedBlock turn={turn} dense />
          <DirectionBlock turn={turn} dense />
          <ConfigBlock turn={turn} dense />
        </Stack>
        <Stack gap="sm">
          <ContextBlock turn={turn} dense />
          <CostBlock turn={turn} dense />
        </Stack>
      </SimpleGrid>
    </Stack>
  );
}

/** C. Panneau fixe à droite du récit ; onglets pour garder un panneau étroit. */
function SplitPanel({ turns, index, navigation, onSelect }: {
  turns: DebugTurn[]; index: number; navigation: ReactNode; onSelect: (index: number) => void;
}) {
  const turn = turns[index];
  return (
    <Paper withBorder radius="md" p="xs" bg="dark.8" style={{ flex: '0 0 min(40rem, 45%)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Group justify="space-between" mb={4}>{navigation}<ConfigSummary turn={turn} /></Group>
      <Tabs defaultValue="turn" keepMounted={false} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
        <Tabs.List>
          <Tabs.Tab value="turn">Tour</Tabs.Tab>
          <Tabs.Tab value="context">Contexte</Tabs.Tab>
          <Tabs.Tab value="cost">Coût</Tabs.Tab>
          <Tabs.Tab value="direction">Direction</Tabs.Tab>
          <Tabs.Tab value="story">Récit</Tabs.Tab>
        </Tabs.List>
        <ScrollArea style={{ flex: 1 }} pt="xs">
          <Tabs.Panel value="turn"><Stack gap="sm"><WhatHappenedBlock turn={turn} dense /><ConfigBlock turn={turn} dense /></Stack></Tabs.Panel>
          <Tabs.Panel value="context"><Stack gap="sm"><ContextBlock turn={turn} dense />
            <Block title="Au fil des tours" dense><ContextEvolution turns={turns} current={index} onSelect={onSelect} height={70} /></Block></Stack></Tabs.Panel>
          <Tabs.Panel value="cost"><CostBlock turn={turn} dense /></Tabs.Panel>
          <Tabs.Panel value="direction"><DirectionBlock turn={turn} dense /></Tabs.Panel>
          <Tabs.Panel value="story"><Stack gap="sm"><StoryRatesBlock turns={turns} dense />
            <Block title="Entrée du Narrateur" dense aside={<ContextLegend />}><ContextEvolution turns={turns} current={index} onSelect={onSelect} /></Block></Stack></Tabs.Panel>
        </ScrollArea>
      </Tabs>
    </Paper>
  );
}

function ConfigSummary({ turn }: { turn: DebugTurn }) {
  return turn.configChanges.length > 0
    ? <Text size="xs" c="blue.3">{turn.configChanges.length} changement{turn.configChanges.length > 1 ? 's' : ''} de config</Text>
    : null;
}
