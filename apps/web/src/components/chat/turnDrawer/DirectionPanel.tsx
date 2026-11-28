import { Alert, Anchor, Box, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import type { DirectionTrace, TurnDirection } from '@choral-writer/shared';

import { phasePresentation } from '../../phases/phasePresentation';
import { formatCost, formatSeconds } from '../turnFormat';
import { DrawerBlock } from './DrawerBlock';
import { type TensionLevels, tensionScale } from './directionInsights';
import {
  TENSION_ESTIMATE_HINT, describeEstimatedLevel, nudgeDescriptions, tensionMoveLabels, tensionMoveSentences,
} from './directionPresentation';
import type { TurnDrawerTab } from './turnDrawerTabs';

const directionColor = phasePresentation.direction.color;

/**
 * « Direction » : what the Director decided for a turn, in plain words.
 * `levels` is null while the story metrics are unavailable: the tension is then told without its scale.
 */
export function DirectionPanel({ trace, levels, onOpenTab }: {
  trace: DirectionTrace | null;
  levels: TensionLevels | null;
  onOpenTab: (tab: TurnDrawerTab) => void;
}) {
  if (!trace) {
    return <Text c="dimmed">Aucun Directeur pour ce tour : toutes les contributions sont passées au Narrateur.</Text>;
  }
  const attempts = trace.attempts > 1 ? ` · ${trace.attempts} tentatives` : '';
  const { direction } = trace;

  return (
    <Stack gap="sm">
      <DrawerBlock title={`Directeur · ${trace.name}`}
        aside={<Text size="xs" c="dimmed">{formatSeconds(trace.durationMs)} · {formatCost(trace.cost)}{attempts}</Text>}>
        {direction ? <TensionScale target={direction.tension} levels={levels} /> : (
          <Alert color="red" title="Direction en échec" role="alert">
            <Text size="sm">
              Aucune direction valide après {trace.attempts} tentative(s) : le Narrateur a reçu le whiteboard complet.{' '}
              <Anchor component="button" type="button" size="sm" onClick={() => onOpenTab('calls')}>Voir les appels</Anchor>
            </Text>
          </Alert>
        )}
      </DrawerBlock>

      {direction && (
        <>
          <DrawerBlock title="Interventions sur la manière de raconter">
            <Nudges nudges={direction.nudges} />
          </DrawerBlock>
          <DrawerBlock title="Tri des contributions">
            <Text size="sm">
              {direction.retained.length} retenue(s), {direction.dismissed.length} écartée(s), chacune avec sa raison.{' '}
              <Anchor component="button" type="button" size="sm" onClick={() => onOpenTab('analysis')}>
                Voir le sort de chaque item dans Analyse →
              </Anchor>
            </Text>
          </DrawerBlock>
        </>
      )}
    </Stack>
  );
}

/**
 * The tension move first, as the Director decided it. The level on the named scale comes second and is always
 * labelled as an estimate: the Director never sets one.
 */
export function TensionScale({ target, levels }: { target: TurnDirection['tension']; levels: TensionLevels | null }) {
  return (
    <Stack gap="sm">
      <Stack gap={2}>
        <Text size="lg" fw={700}>Tension : {tensionMoveLabels[target]}</Text>
        <Text size="sm">{tensionMoveSentences[target]} Le Narrateur dose conflit et rythme d’après ce mouvement.</Text>
      </Stack>
      {levels && (
        <Stack gap={6}>
          <EstimateHint label="Niveau estimé" />
          <Group gap={4} wrap="nowrap" role="list" aria-label="Niveau de tension estimé">
            {tensionScale.map((name, level) => {
              const marker = level === levels.current ? ' (estimé pour ce tour)'
                : level === levels.previous ? ' (estimé au tour précédent)' : '';
              return (
                <Box key={name} role="listitem" aria-label={`${name}${marker}`} style={{ flex: 1 }}>
                  <Box h={8} bg={level <= levels.current ? `${directionColor}.${3 + level}` : 'dark.5'} style={{
                    borderRadius: 2,
                    outline: level === levels.previous && level !== levels.current ? '1px dashed var(--mantine-color-gray-4)' : undefined,
                    outlineOffset: 2,
                  }} />
                  <Text size="xs" ta="center" mt={4} fw={level === levels.current ? 700 : 400}
                    c={level === levels.current ? undefined : 'dimmed'}>
                    {name}
                  </Text>
                </Box>
              );
            })}
          </Group>
          <Text size="xs" c="dimmed">{describeEstimatedLevel(target, levels)}</Text>
        </Stack>
      )}
    </Stack>
  );
}

/** A label for an estimated value, whose tooltip says how the estimate is made. */
export function EstimateHint({ label }: { label: string }) {
  return (
    <Tooltip label={TENSION_ESTIMATE_HINT} multiline w={280}>
      <Group gap={4} w="fit-content" tabIndex={0} aria-label={`${label}. ${TENSION_ESTIMATE_HINT}`}>
        <Text size="xs" c="dimmed">{label}</Text>
        <IconInfoCircle size={14} color="var(--mantine-color-dimmed)" aria-hidden="true" />
      </Group>
    </Tooltip>
  );
}

function Nudges({ nudges }: { nudges: TurnDirection['nudges'] }) {
  if (nudges.length === 0) return <Text size="sm" c="dimmed">Le Directeur n’est pas intervenu : la scène suit son cours.</Text>;
  return (
    <Stack gap="sm">
      {nudges.map((nudge) => (
        <Stack key={nudge.type} gap={2}>
          <Text size="sm">
            Pousse vers <Text span fw={700} c={`${directionColor}.4`}>{nudge.type}</Text> ({nudgeDescriptions[nudge.type]}) : {nudge.target}
          </Text>
          <Text size="xs" c="dimmed">
            {nudge.basis
              ? <>En appui sur la contribution de {nudge.basis.agent} : « {nudge.basis.item.text} »</>
              : 'Sans contribution d’appui.'}
          </Text>
        </Stack>
      ))}
    </Stack>
  );
}
