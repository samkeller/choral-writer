import type { AgentPhase } from '@choral-writer/shared';
import { IconCompass, IconFeather, IconSearch } from '@tabler/icons-react';

export const phasePresentation = {
  analysis: { label: 'Analyse', color: 'blue', icon: IconSearch },
  direction: { label: 'Direction', color: 'orange', icon: IconCompass },
  restitution: { label: 'Restitution', color: 'violet', icon: IconFeather },
} satisfies Record<AgentPhase, { label: string; color: string; icon: typeof IconSearch }>;
