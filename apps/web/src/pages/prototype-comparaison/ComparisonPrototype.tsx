// PROTOTYPE — « Prototype : rejouer un tour avec une autre configuration et comparer ».
// Trois variantes de la vue de comparaison de 2 versions d'un tour, sur la route du récit :
// /projects/:projectId?compare=A|B|C. Données fictives, aucune mutation.
import { useState } from 'react';
import {
  Accordion, Badge, Box, Button, Collapse, Divider, Drawer, Group, Paper, SegmentedControl,
  SimpleGrid, Stack, Switch, Table, Tabs, Text, Title,
} from '@mantine/core';
import { IconArrowsShuffle } from '@tabler/icons-react';
import { useSearchParams } from 'react-router-dom';

import { PrototypeSwitcher } from '../../components/prototype/PrototypeSwitcher';
import { ReplayModal } from './ReplayModal';
import {
  type AgentLine, type ConfigChange, type TurnVersion, type Verdict,
  configDiff, original, totalCost, usd, userInput, variant,
} from './fixtures';

const VARIANTS = [
  { key: 'A', name: 'Côte à côte' },
  { key: 'B', name: 'Tableau des écarts' },
  { key: 'C', name: 'Dans le fil' },
];

const verdictColor: Record<Verdict, string> = { retenu: 'green', partiel: 'yellow', ignoré: 'gray' };
const changeColor: Record<ConfigChange, string> = { same: 'gray', added: 'green', removed: 'red', changed: 'blue' };

function VerdictBadge({ verdict }: { verdict: Verdict | null }) {
  return verdict ? <Badge size="xs" variant="light" color={verdictColor[verdict]}>{verdict}</Badge> : <Text size="xs" c="dimmed">—</Text>;
}

function Prose({ version }: { version: TurnVersion }) {
  return <Stack gap="xs">{version.prose.map((p, i) => <Text key={i} size="sm">{p}</Text>)}</Stack>;
}

export function ComparisonPrototype() {
  const [search] = useSearchParams();
  const key = search.get('compare') ?? 'A';
  const [replayOpen, setReplayOpen] = useState(false);

  return (
    <Stack gap="sm" pb={80}>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">Tour 7 · saisie : « {userInput} »</Text>
        <Button size="compact-sm" variant="light" leftSection={<IconArrowsShuffle size={16} />} onClick={() => setReplayOpen(true)}>
          Rejouer avec…
        </Button>
      </Group>
      {key === 'A' && <SideBySide />}
      {key === 'B' && <DiffTable />}
      {key === 'C' && <InThread />}
      <ReplayModal opened={replayOpen} onClose={() => setReplayOpen(false)} onLaunch={() => undefined} />
      <PrototypeSwitcher param="compare" variants={VARIANTS} />
    </Stack>
  );
}

/* ---------- A : deux colonnes alignées, section par section ---------- */

function SideBySide() {
  const [proseOpen, setProseOpen] = useState(false);
  const versions = [original, variant];
  const row = (title: string, render: (v: TurnVersion) => React.ReactNode) => (
    <>
      <Text size="xs" tt="uppercase" fw={700} c="dimmed" mt="sm">{title}</Text>
      <SimpleGrid cols={2} spacing="md">
        {versions.map((v) => <Paper key={v.label} p="sm" withBorder>{render(v)}</Paper>)}
      </SimpleGrid>
    </>
  );

  return (
    <Stack gap={4}>
      <SimpleGrid cols={2} spacing="md">
        {versions.map((v) => (
          <Group key={v.label} gap="xs">
            <Title order={4}>{v.label}</Title>
            <Badge variant="outline" size="sm">{v.branchName}</Badge>
          </Group>
        ))}
      </SimpleGrid>
      {row('Ce qui s’est passé', (v) => <Text size="sm">{v.summary}</Text>)}
      {row('Configuration', (v) => (
        <Group gap={4}>
          {v.agents.map((a) => <Badge key={a.name} size="sm" variant="light" color={changeColor[a.change]}>{a.name} {a.version}</Badge>)}
          <Badge size="sm" variant="light" color={changeColor[v.narrator.change]}>Narrateur {v.narrator.version}</Badge>
        </Group>
      ))}
      {row('Attribution', (v) => (
        <Stack gap={4}>
          {v.agents.map((a) => (
            <Group key={a.name} justify="space-between" wrap="nowrap">
              <Text size="xs"><b>{a.name}</b> proposait : {a.proposal}</Text>
              <VerdictBadge verdict={a.verdict} />
            </Group>
          ))}
        </Stack>
      ))}
      {row('Mémoire', (v) => <Stack gap={0}>{v.memoryChanges.map((m) => <Text key={m} size="xs" ff="monospace">{m}</Text>)}</Stack>)}
      {row('Coût et longueur', (v) => <Text size="sm">{usd(totalCost(v))} · {v.durationS} s · {v.words} mots</Text>)}
      <Button variant="subtle" mt="sm" onClick={() => setProseOpen((o) => !o)}>{proseOpen ? 'Masquer la prose' : 'Lire la prose complète'}</Button>
      <Collapse in={proseOpen}>
        <SimpleGrid cols={2} spacing="md">{versions.map((v) => <Paper key={v.label} p="sm" withBorder><Prose version={v} /></Paper>)}</SimpleGrid>
      </Collapse>
    </Stack>
  );
}

/* ---------- B : un tableau qui ne montre que ce qui diffère ---------- */

function DiffTable() {
  const [onlyDiff, setOnlyDiff] = useState(true);
  const [prose, setProse] = useState<string | null>(null);
  const names = [...new Set([...original.agents, ...variant.agents].map((a) => a.name))];
  const find = (v: TurnVersion, name: string): AgentLine | undefined => v.agents.find((a) => a.name === name);

  const rows: { label: string; a: React.ReactNode; b: React.ReactNode; same: boolean }[] = [
    { label: 'Ce qui s’est passé', a: original.summary, b: variant.summary, same: false },
    ...names.map((name) => {
      const a = find(original, name); const b = find(variant, name);
      return {
        label: `${name}${b?.change === 'added' ? ' (ajouté)' : ''}`,
        a: a ? <Group gap={4}><VerdictBadge verdict={a.verdict} /><Text size="xs">{a.proposal}</Text></Group> : <Text size="xs" c="dimmed">absent</Text>,
        b: b ? <Group gap={4}><VerdictBadge verdict={b.verdict} /><Text size="xs">{b.proposal}</Text></Group> : <Text size="xs" c="dimmed">absent</Text>,
        same: a?.verdict === b?.verdict && a?.version === b?.version,
      };
    }),
    { label: 'Narrateur', a: original.narrator.version, b: variant.narrator.version, same: original.narrator.version === variant.narrator.version },
    { label: 'Mémoire', a: original.memoryChanges.join(' · '), b: variant.memoryChanges.join(' · '), same: false },
    { label: 'Coût', a: usd(totalCost(original)), b: `${usd(totalCost(variant))} (+${Math.round((totalCost(variant) / totalCost(original) - 1) * 100)} %)`, same: false },
    { label: 'Durée · longueur', a: `${original.durationS} s · ${original.words} mots`, b: `${variant.durationS} s · ${variant.words} mots`, same: false },
  ];

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Group gap={4}>{configDiff(original, variant).map((d) => <Badge key={d} variant="light" color="blue" ff="monospace">{d}</Badge>)}</Group>
        <Switch size="xs" label="Masquer les lignes identiques" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.currentTarget.checked)} />
      </Group>
      <Table withTableBorder withColumnBorders verticalSpacing="xs" layout="fixed">
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={160} />
            <Table.Th>Original · {original.branchName} <Button size="compact-xs" variant="subtle" onClick={() => setProse('a')}>prose</Button></Table.Th>
            <Table.Th>Variante · {variant.branchName} <Button size="compact-xs" variant="subtle" onClick={() => setProse('b')}>prose</Button></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.filter((r) => !onlyDiff || !r.same).map((r) => (
            <Table.Tr key={r.label}>
              <Table.Td><Text size="xs" fw={700}>{r.label}</Text></Table.Td>
              <Table.Td><Text size="sm" component="div">{r.a}</Text></Table.Td>
              <Table.Td bg={r.same ? undefined : 'rgba(80,140,255,0.06)'}><Text size="sm" component="div">{r.b}</Text></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Drawer opened={prose !== null} onClose={() => setProse(null)} position="right" size="xl" title="Prose complète">
        <Tabs value={prose} onChange={setProse}>
          <Tabs.List><Tabs.Tab value="a">Original</Tabs.Tab><Tabs.Tab value="b">Variante</Tabs.Tab></Tabs.List>
          <Box pt="sm"><Prose version={prose === 'b' ? variant : original} /></Box>
        </Tabs>
      </Drawer>
    </Stack>
  );
}

/* ---------- C : la comparaison vit dans le message, comme une bascule ---------- */

function InThread() {
  const [view, setView] = useState('Variante');
  const shown = view === 'Original' ? original : variant;

  return (
    <Stack gap="sm">
      <Paper p="sm" withBorder bg="dark.6" ml="auto" maw="70%"><Text size="sm">{userInput}</Text></Paper>
      <Paper p="md" withBorder>
        <Group justify="space-between" mb="sm">
          <SegmentedControl size="xs" value={view} onChange={setView} data={['Original', 'Variante', 'Écarts']} />
          <Text size="xs" c="dimmed">2 versions de ce tour</Text>
        </Group>
        {view === 'Écarts' ? (
          <Stack gap="xs">
            <Text size="sm"><b>Original :</b> {original.summary}</Text>
            <Text size="sm"><b>Variante :</b> {variant.summary}</Text>
            <Divider />
            <Group gap={4}>{configDiff(original, variant).map((d) => <Badge key={d} size="sm" variant="light" ff="monospace">{d}</Badge>)}</Group>
            <Text size="xs" c="dimmed">
              Bascule d’influence : Hors champ ignoré → retenu · Marchand partiel → retenu ·
              coût {usd(totalCost(original))} → {usd(totalCost(variant))}
            </Text>
          </Stack>
        ) : (
          <Stack gap="xs">
            <Text size="sm" fs="italic" c="dimmed">{shown.summary}</Text>
            <Prose version={shown} />
            <Accordion variant="contained" mt="xs">
              <Accordion.Item value="wb">
                <Accordion.Control><Text size="xs">Whiteboard et attribution · {shown.branchName}</Text></Accordion.Control>
                <Accordion.Panel>
                  {shown.agents.map((a) => (
                    <Group key={a.name} justify="space-between" wrap="nowrap" mb={4}>
                      <Text size="xs"><b>{a.name} {a.version}</b> : {a.whiteboard}</Text>
                      <VerdictBadge verdict={a.verdict} />
                    </Group>
                  ))}
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
            <Text size="xs" c="dimmed">{usd(totalCost(shown))} · {shown.durationS} s · {shown.words} mots</Text>
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}
