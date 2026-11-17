import { Badge } from '@mantine/core';
import type { AgentPhase } from '@choral-writer/shared';

import { phasePresentation } from './phasePresentation';

export function PhaseTag({ phase }: { phase: AgentPhase }) {
  const { label, color, icon: Icon } = phasePresentation[phase];
  return (
    <Badge component="span" variant="light" color={color} tt="none" leftSection={<Icon size={14} aria-hidden="true" />}>
      {label}
    </Badge>
  );
}
