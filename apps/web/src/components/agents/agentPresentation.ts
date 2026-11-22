import type { Agent, AgentPhase } from '@choral-writer/shared';

export const agentOutputPresentation = {
  envelope: { label: 'Enveloppe whiteboard', phase: 'analysis' },
  direction: { label: 'Direction du tour', phase: 'direction' },
  narrative: { label: 'Réponse utilisateur', phase: 'restitution' },
  memory_proposals: { label: 'Propositions mémoire', phase: 'restitution' },
} satisfies Record<Agent['output'], { label: string; phase: AgentPhase }>;
