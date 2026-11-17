import type { AgentPhase } from '@choral-writer/shared';
import { IconFeather, IconSearch } from '@tabler/icons-react';

export const phasePresentation = {
  analysis: { label: 'Analyse', color: 'blue', icon: IconSearch },
  restitution: { label: 'Restitution', color: 'violet', icon: IconFeather },
} satisfies Record<AgentPhase, { label: string; color: string; icon: typeof IconSearch }>;
