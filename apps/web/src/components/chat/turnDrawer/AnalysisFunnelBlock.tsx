import { Anchor, Group, Stack, Text } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';

import { phasePresentation } from '../../phases/phasePresentation';
import type { AnalysisFunnel } from './analysisInsights';
import { DrawerBlock } from './DrawerBlock';
import type { AttributionState } from './useTurnAttribution';

/** « De l'analyse à la prose » : how many items survive each step, leading to the detail by agent. */
export function AnalysisFunnelBlock({ funnel, directed, attribution, onOpen }: {
  funnel: AnalysisFunnel;
  /** False when no direction sorted the whiteboard: every item went to the Narrator. */
  directed: boolean;
  attribution: AttributionState['status'];
  onOpen: () => void;
}) {
  const arrow = <IconArrowRight size={16} color="var(--mantine-color-dark-2)" aria-hidden="true" />;
  return (
    <DrawerBlock title="De l’analyse à la prose"
      aside={<Anchor component="button" type="button" size="xs" onClick={onOpen}>Détail par agent →</Anchor>}>
      <Group gap="xs" wrap="nowrap" align="flex-start" role="list" aria-label="Entonnoir de l’analyse à la prose">
        <Step value={String(funnel.produced)} color={`${phasePresentation.analysis.color}.4`}
          label={`items produits par ${funnel.agents} agent(s)`} />
        {arrow}
        <Step value={String(funnel.transmitted)} color={`${phasePresentation.direction.color}.4`}
          label={directed ? 'transmis par le Directeur' : 'transmis sans Directeur'} />
        {arrow}
        <Step value={funnel.inProse === null ? '—' : String(funnel.inProse)} color={`${phasePresentation.restitution.color}.3`}
          label={funnel.inProse === null ? proseUnknown(attribution) : 'visibles dans la prose, selon l’attribution'} />
        {funnel.offscreen > 0 && (
          <>{arrow}<Step value={String(funnel.offscreen)} color="teal.4" label="hors champ, connus du Gardien" /></>
        )}
      </Group>
    </DrawerBlock>
  );
}

function proseUnknown(attribution: AttributionState['status']): string {
  if (attribution === 'unavailable') return 'visibles dans la prose : sans prose, inconnu';
  if (attribution === 'error') return 'visibles dans la prose : attribution en échec';
  return 'visibles dans la prose : attribution en cours';
}

function Step({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <Stack gap={0} align="center" style={{ flex: 1 }} role="listitem" aria-label={`${value} ${label}`}>
      <Text size="xl" fw={700} c={color}>{value}</Text>
      <Text size="xs" c="dimmed" ta="center">{label}</Text>
    </Stack>
  );
}
