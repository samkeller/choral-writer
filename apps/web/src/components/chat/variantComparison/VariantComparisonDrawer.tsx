import { useState } from 'react';
import { Alert, Badge, Button, Drawer, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import type { Project, TurnConfiguration, TurnTraceSummary } from '@choral-writer/shared';

import { adoptVariant } from '../../../api/chat/chatApi';
import { getErrorMessage } from '../../../api/client';
import { MarkdownContent } from '../../llm/MarkdownContent';
import { formatCost, formatSeconds } from '../turnFormat';
import { verdictPresentation } from '../turnDrawer/attributionPresentation';
import { DrawerBlock } from '../turnDrawer/DrawerBlock';
import { useTurnAttribution, type TurnAttributionHandle } from '../turnDrawer/useTurnAttribution';
import { useTurnTraceSummary, type SummaryState } from '../turnDrawer/useTurnTraceSummary';
import { WithSummary } from '../turnDrawer/WithSummary';
import {
  agentVerdicts, configurationBadges, overallVerdict, wordCount,
  type AgentVerdict, type ComparedSide, type ConfigurationChange,
} from './variantComparison';
import styles from './VariantComparison.module.css';

const changeColor = {
  same: 'gray', added: 'green', removed: 'red', changed: 'blue',
} satisfies Record<ConfigurationChange, string>;

const sideTitle = { original: 'Version d’origine', variant: 'Variante' } satisfies Record<ComparedSide, string>;

interface VariantComparisonDrawerProps {
  projectId: string;
  /** The turn the variant was regenerated from. */
  originalTurnId: string;
  variantTurnId: string;
  onAdopted: (project: Project) => void;
  onKeepOriginal: () => void;
  onClose: () => void;
}

/**
 * Two versions of a turn side by side, the full prose first, each under what tells them apart: configuration,
 * what happened, the fate of each agent's contributions, cost, duration and length. Opening the view reads the
 * attribution of both turns, computed once per turn and cached by the server.
 */
export function VariantComparisonDrawer({
  projectId, originalTurnId, variantTurnId, onAdopted, onKeepOriginal, onClose,
}: VariantComparisonDrawerProps) {
  const original = useComparedVersion(projectId, originalTurnId);
  const variant = useComparedVersion(projectId, variantTurnId);
  const [adopting, setAdopting] = useState(false);
  const [adoptionError, setAdoptionError] = useState('');

  const adopt = () => {
    setAdopting(true);
    setAdoptionError('');
    adoptVariant(projectId, variantTurnId).then(onAdopted).catch((error: unknown) => {
      setAdoptionError(getErrorMessage(error));
      setAdopting(false);
    });
  };

  return (
    <Drawer.Root opened onClose={onClose} position="right" size="min(100vw, 96rem)" classNames={{ content: styles.drawer }}>
      <Drawer.Overlay backgroundOpacity={0.35} blur={3} />
      <Drawer.Content>
        <Drawer.Header className={styles.header}>
          <Drawer.Title fw={700}>Comparer deux versions du tour</Drawer.Title>
          <Drawer.CloseButton aria-label="Fermer la comparaison" />
        </Drawer.Header>
        <Drawer.Body className={styles.body}>
          <div className={styles.columns}>
            <VersionColumn side="original" version={original} other={variant.summary.summary} />
            <VersionColumn side="variant" version={variant} other={original.summary.summary} />
          </div>
        </Drawer.Body>
        <Stack gap="xs" className={styles.footer}>
          {adoptionError && (
            <Alert color="red" title="Adoption impossible" role="alert">
              <Text size="sm">{adoptionError}</Text>
            </Alert>
          )}
          <Group justify="flex-end" gap="xs">
            <Text size="xs" c="dimmed" mr="auto">
              Adopter la variante : sa configuration (agents, versions, prompt du projet) devient celle du projet
              et le récit continue sur sa branche. Garder l’original ne change rien.
            </Text>
            <Button variant="subtle" disabled={adopting} onClick={onKeepOriginal}>Garder l’original</Button>
            <Button loading={adopting} onClick={adopt}>Adopter la variante</Button>
          </Group>
        </Stack>
      </Drawer.Content>
    </Drawer.Root>
  );
}

type ComparedVersion = { summary: SummaryState; attribution: TurnAttributionHandle };

function useComparedVersion(projectId: string, turnId: string): ComparedVersion {
  const summary = useTurnTraceSummary(projectId, turnId);
  const attribution = useTurnAttribution(projectId, turnId, summary.summary, true);
  return { summary, attribution };
}

function VersionColumn({ side, version, other }: {
  side: ComparedSide; version: ComparedVersion; other: TurnTraceSummary | null;
}) {
  return (
    <Stack component="section" aria-label={sideTitle[side]} gap="sm" className={styles.column}>
      <Text fw={700}>{sideTitle[side]}</Text>
      <WithSummary state={version.summary}>
        {(summary) => {
          const prose = summary.narrator?.prose ?? null;
          return (
            <>
              <DrawerBlock title="Configuration">
                <ConfigurationBadges side={side} own={summary.configuration} other={other?.configuration ?? null} />
              </DrawerBlock>
              <AttributionBlocks attribution={version.attribution} />
              <DrawerBlock title="Coût, durée, longueur">
                <Text size="sm">
                  {[formatCost(summary.cost), formatSeconds(summary.durationMs),
                    prose === null ? 'longueur inconnue' : `${wordCount(prose)} mots`].join(' · ')}
                </Text>
              </DrawerBlock>
              <Paper withBorder p="md" radius="md" aria-label={`Prose : ${sideTitle[side]}`}>
                {prose === null
                  ? <Text size="sm" c="dimmed">Prose indisponible : la trace du Narrateur n’existe plus ou l’appel a échoué.</Text>
                  : <MarkdownContent content={prose} className={styles.prose} />}
              </Paper>
            </>
          );
        }}
      </WithSummary>
    </Stack>
  );
}

function ConfigurationBadges({ side, own, other }: {
  side: ComparedSide; own: TurnConfiguration | null; other: TurnConfiguration | null;
}) {
  if (!own) return <Text size="sm" c="dimmed">Configuration non enregistrée pour ce tour.</Text>;
  // Until the other version is known, nothing is told apart.
  const badges = configurationBadges(own, other ?? own, side);
  return (
    <Group gap={6} role="list" aria-label="Configuration">
      {badges.map((badge) => (
        <Badge key={badge.key} role="listitem" variant="light" tt="none" color={changeColor[badge.change]}
          data-change={badge.change}>
          {badge.label}
        </Badge>
      ))}
    </Group>
  );
}

/** « Ce qui s'est passé » then the verdicts by agent, two separate blocks read from the same attribution. */
function AttributionBlocks({ attribution }: { attribution: TurnAttributionHandle }) {
  const { state } = attribution;
  const reading = state.status === 'ready' ? state.response.attribution : null;
  const failure = state.status === 'error' ? state.error
    : state.status === 'ready' ? state.response.failure?.message ?? null : null;

  return (
    <>
      <DrawerBlock title="Ce qui s’est passé">
        {state.status === 'unavailable' && <Text size="sm" c="dimmed">Ce tour n’a pas de prose à lire.</Text>}
        {(state.status === 'waiting' || state.status === 'loading') && (
          <Group gap="xs">
            <Loader size="xs" color="choral" />
            <Text size="sm" c="dimmed">Lecture de la prose, calculée une seule fois pour ce tour…</Text>
          </Group>
        )}
        {failure && (
          <Group gap="xs" justify="space-between" mb={reading ? 'xs' : 0}>
            <Text size="sm" c="red.4">Attribution impossible : {failure}</Text>
            <Button size="compact-xs" variant="light" leftSection={<IconRefresh size={12} />} onClick={attribution.retry}>
              Réessayer
            </Button>
          </Group>
        )}
        {reading && <Text size="sm" fw={600}>{reading.whatHappened}</Text>}
      </DrawerBlock>
      <DrawerBlock title="Verdicts par agent">
        {reading
          ? <AgentVerdicts verdicts={agentVerdicts(reading)} />
          : <Text size="sm" c="dimmed">Disponibles après la lecture de la prose.</Text>}
      </DrawerBlock>
    </>
  );
}

function AgentVerdicts({ verdicts }: { verdicts: AgentVerdict[] }) {
  if (verdicts.length === 0) return <Text size="sm" c="dimmed">Aucune contribution n’a été transmise au Narrateur.</Text>;
  return (
    <Group gap={6} role="list" aria-label="Verdicts par agent">
      {verdicts.map((verdict) => (
        <Badge key={verdict.agent} role="listitem" variant="dot" tt="none"
          color={verdictPresentation[overallVerdict(verdict)].color}>
          {verdict.agent} : {verdictLabel(verdict)}
        </Badge>
      ))}
    </Group>
  );
}

function verdictLabel({ counts }: AgentVerdict): string {
  const parts = (['retenu', 'partiel', 'absent'] as const).filter((verdict) => counts[verdict] > 0);
  if (parts.length === 1 && counts[parts[0]!] === 1) return parts[0]!;
  return parts.map((verdict) => `${counts[verdict]} ${verdict}${counts[verdict] > 1 ? 's' : ''}`).join(', ');
}
