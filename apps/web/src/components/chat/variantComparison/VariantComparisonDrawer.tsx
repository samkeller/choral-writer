import { useState, type ReactNode } from 'react';
import { Alert, Badge, Button, Drawer, Group, Loader, Paper, Spoiler, Stack, Text } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import type { Project, TurnConfiguration, TurnTraceSummary } from '@choral-writer/shared';

import { adoptVariant } from '../../../api/chat/chatApi';
import { getErrorMessage } from '../../../api/client';
import { MarkdownContent } from '../../llm/MarkdownContent';
import { formatCost, formatSeconds } from '../turnFormat';
import { verdictPresentation } from '../turnDrawer/attributionPresentation';
import { useTurnAttribution, type TurnAttributionHandle } from '../turnDrawer/useTurnAttribution';
import { useTurnTraceSummary, type SummaryState } from '../turnDrawer/useTurnTraceSummary';
import { WithSummary } from '../turnDrawer/WithSummary';
import {
  agentVerdicts, configurationBadges, overallVerdict, wordCount,
  type AgentVerdict, type ComparedSide, type ConfigurationChange,
} from './variantComparison';
import styles from './VariantComparison.module.css';

const changeColor = {
  same: 'gray', added: 'green', removed: 'red', changed: 'blue', unknown: 'gray',
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
    <section aria-label={sideTitle[side]} className={styles.column}>
      <Text fw={700}>{sideTitle[side]}</Text>
      <WithSummary state={version.summary}>
        {(summary) => {
          const prose = summary.narrator?.prose ?? null;
          return (
            <>
              {/* What tells the versions apart, condensed so that the prose shows without scrolling. */}
              <Paper withBorder radius="md" bg="dark.7" className={styles.facts}>
                <Fact label="Configuration">
                  <ConfigurationBadges side={side} own={summary.configuration} other={other} />
                </Fact>
                <AttributionFacts attribution={version.attribution} />
                <Fact label="Mesures">
                  <Text size="sm">
                    {[formatCost(summary.cost), formatSeconds(summary.durationMs),
                      prose === null ? 'longueur inconnue' : `${wordCount(prose)} mots`].join(' · ')}
                  </Text>
                </Fact>
              </Paper>
              <Paper withBorder p="md" radius="md" aria-label={`Prose : ${sideTitle[side]}`}>
                {prose === null
                  ? <Text size="sm" c="dimmed">Prose indisponible : la trace du Narrateur n’existe plus ou l’appel a échoué.</Text>
                  : <MarkdownContent content={prose} className={styles.prose} />}
              </Paper>
            </>
          );
        }}
      </WithSummary>
    </section>
  );
}

/** One line of the condensed header: a short label, then its content. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact} role="group" aria-label={label}>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" lts="0.06em" className={styles.factLabel}>{label}</Text>
      <div className={styles.factContent}>{children}</div>
    </div>
  );
}

/** `other` is null while the other version loads. */
function ConfigurationBadges({ side, own, other }: {
  side: ComparedSide; own: TurnConfiguration | null; other: TurnTraceSummary | null;
}) {
  if (!own) return <Text size="sm" c="dimmed">Configuration non enregistrée pour ce tour.</Text>;
  const otherMissing = other !== null && other.configuration === null;
  const badges = configurationBadges(own, other?.configuration ?? null, side);
  return (
    <Stack gap={4}>
      <Group gap={4} role="list" aria-label="Configuration">
        {badges.map((badge) => (
          <Badge key={badge.key} role="listitem" size="sm" variant={badge.change === 'unknown' ? 'outline' : 'light'}
            tt="none" color={changeColor[badge.change]} data-change={badge.change}>
            {badge.label}
          </Badge>
        ))}
      </Group>
      {otherMissing && (
        <Text size="xs" c="dimmed">
          {side === 'variant' ? 'Configuration d’origine non enregistrée' : 'Configuration de la variante non enregistrée'} :
          comparaison impossible.
        </Text>
      )}
    </Stack>
  );
}

/** « Ce qui s'est passé » then the verdicts by agent, two lines read from the same attribution. */
function AttributionFacts({ attribution }: { attribution: TurnAttributionHandle }) {
  const { state } = attribution;
  const reading = state.status === 'ready' ? state.response.attribution : null;
  const failure = state.status === 'error' ? state.error
    : state.status === 'ready' ? state.response.failure?.message ?? null : null;

  return (
    <>
      <Fact label="Ce qui s’est passé">
        {state.status === 'unavailable' && <Text size="sm" c="dimmed">Ce tour n’a pas de prose à lire.</Text>}
        {(state.status === 'waiting' || state.status === 'loading') && (
          <Group gap="xs" wrap="nowrap">
            <Loader size="xs" color="choral" />
            <Text size="sm" c="dimmed">Lecture de la prose, calculée une seule fois pour ce tour…</Text>
          </Group>
        )}
        {failure && (
          <Group gap="xs" wrap="nowrap" mb={reading ? 4 : 0}>
            <Text size="sm" c="red.4">Attribution impossible : {failure}</Text>
            <Button size="compact-xs" variant="light" leftSection={<IconRefresh size={12} />} onClick={attribution.retry}>
              Réessayer
            </Button>
          </Group>
        )}
        {reading && (
          <Spoiler maxHeight={44} showLabel="Lire tout" hideLabel="Réduire">
            <Text size="sm" fw={600}>{reading.whatHappened}</Text>
          </Spoiler>
        )}
      </Fact>
      <Fact label="Verdicts">
        {reading
          ? <AgentVerdicts verdicts={agentVerdicts(reading)} />
          : <Text size="sm" c="dimmed">Après la lecture de la prose.</Text>}
      </Fact>
    </>
  );
}

function AgentVerdicts({ verdicts }: { verdicts: AgentVerdict[] }) {
  if (verdicts.length === 0) return <Text size="sm" c="dimmed">Aucune contribution n’a été transmise au Narrateur.</Text>;
  return (
    <Group gap={4} role="list" aria-label="Verdicts par agent">
      {verdicts.map((verdict) => (
        <Badge key={verdict.agent} role="listitem" size="sm" variant="dot" tt="none"
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
