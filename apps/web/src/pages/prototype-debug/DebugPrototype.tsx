// PROTOTYPE — « Prototype : forme du mode Debug ».
// Itération 2 : la variante A (tiroir) retenue, montée sur la vraie page du récit : /projects/:projectId?debug=1
// - Pas de bascule Lecture/Debug : la ligne discrète sous chaque réponse ouvre toujours le tiroir du tour.
// - Itération 3 : onglet Synthèse (indicateurs, ce qui s'est passé, points d'attention, déroulé) qui renvoie aux onglets de détail.
// Les variantes B (tableau de bord) et C (écran partagé) sont dans l'historique de la branche.
// Les données du tiroir sont fictives (fixtures.ts) ; seuls les messages viennent du vrai récit.
import { useMemo, useState } from 'react';
import { ActionIcon, Box, Button, Drawer, Group, Paper, Stack, Tabs, Text } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { ChatTurn, Message } from '@choral-writer/shared';

import { MessageList } from '../../components/chat/MessageList';
import {
  AnalysisBlock, Block, ConfigBlock, ContextBlock, ContextEvolution, ContextLegend, CostBlock, DirectionBlock, StoryRatesBlock,
} from './DebugBlocks';
import { buildTurn, type DebugTurn } from './fixtures';
import { type DebugTab, Overview } from './Overview';
import { LiveProgress, TurnLine, useSimulatedTurn } from './TurnProgress';

interface DebugPrototypeProps {
  messages: Message[];
  turns: ChatTurn[];
  partial: string;
  pending: boolean;
}

export function DebugPrototype({ messages, turns, partial, pending }: DebugPrototypeProps) {
  const debugTurns = useMemo(() => turns.map((_, index) => buildTurn(index)), [turns]);
  const turnIndex = new Map(turns.map((turn, index) => [turn.id, index]));
  const [selected, setSelected] = useState<number | null>(null);
  const { simulation, start, reset } = useSimulatedTurn();

  return (
    <>
      <MessageList messages={messages} turns={turns} partial={partial} pending={pending} pipelineProgress={null}
        renderTurnFooter={(turnId) => {
          const index = turnIndex.get(turnId);
          if (index === undefined) return null;
          return <Box mt="xs"><TurnLine turn={debugTurns[index]} selected={selected === index} onOpen={() => setSelected(index)} /></Box>;
        }}
        footer={simulation.status !== 'idle' && <LiveProgress simulation={simulation} onRetry={() => start()} />} />

      {selected !== null && (
        <Drawer opened onClose={() => setSelected(null)} position="right" size="min(100vw, 60rem)" padding="sm"
          title={<TurnNavigation index={selected} count={debugTurns.length} onChange={setSelected} />}
          overlayProps={{ backgroundOpacity: 0.35, blur: 3 }}>
          <TurnDrawer turns={debugTurns} index={selected} onSelect={setSelected} />
        </Drawer>
      )}

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

/** Onglet Synthèse par défaut : l'essentiel du tour, avec un lien vers l'onglet qui détaille chaque point. */
function TurnDrawer({ turns, index, onSelect }: { turns: DebugTurn[]; index: number; onSelect: (index: number) => void }) {
  const turn = turns[index];
  const [tab, setTab] = useState<DebugTab>('overview');
  return (
    <Tabs value={tab} onChange={(value) => setTab((value as DebugTab | null) ?? 'overview')} keepMounted={false}>
      <Tabs.List mb="sm">
        <Tabs.Tab value="overview">Synthèse</Tabs.Tab>
        <Tabs.Tab value="analysis">Analyse</Tabs.Tab>
        <Tabs.Tab value="context">Contexte</Tabs.Tab>
        <Tabs.Tab value="cost">Coût et durée</Tabs.Tab>
        <Tabs.Tab value="direction">Direction</Tabs.Tab>
        <Tabs.Tab value="config">Configuration</Tabs.Tab>
        <Tabs.Tab value="story">Récit</Tabs.Tab>
        <Tabs.Tab value="raw">Appels bruts</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="overview"><Overview turns={turns} index={index} onOpenTab={setTab} /></Tabs.Panel>
      <Tabs.Panel value="analysis"><AnalysisBlock turn={turn} onOpenRaw={() => setTab('raw')} /></Tabs.Panel>
      <Tabs.Panel value="context"><Stack gap="sm">
        <ContextBlock turn={turn} />
        <Block title="Entrée du Narrateur au fil des tours" aside={<ContextLegend />}><ContextEvolution turns={turns} current={index} onSelect={onSelect} height={70} /></Block>
      </Stack></Tabs.Panel>
      <Tabs.Panel value="cost"><CostBlock turn={turn} /></Tabs.Panel>
      <Tabs.Panel value="direction"><DirectionBlock turn={turn} /></Tabs.Panel>
      <Tabs.Panel value="config"><ConfigBlock turn={turn} /></Tabs.Panel>
      <Tabs.Panel value="story"><Stack gap="sm">
        <StoryRatesBlock turns={turns} />
        <Block title="Entrée du Narrateur" aside={<ContextLegend />}><ContextEvolution turns={turns} current={index} onSelect={onSelect} /></Block>
      </Stack></Tabs.Panel>
      <Tabs.Panel value="raw"><Text size="sm" c="dimmed">Les prompts et réponses de chaque appel, comme dans le tiroir de traces actuel.</Text></Tabs.Panel>
    </Tabs>
  );
}
