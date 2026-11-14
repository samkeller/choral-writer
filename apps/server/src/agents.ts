import { z } from 'zod';
import { contextSpecSchema } from '@choral/engine';

export const agentSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  name: z.string().min(1),
  kind: z.enum(['interpreter', 'analysis', 'output']),
  system_prompt: z.string().min(1),
  model: z.string().min(1),
  params: z.object({
    purpose: z.enum(['narrator', 'guardian']).optional(),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().positive().max(32000).default(1000),
    timeout_ms: z.number().int().positive().max(180000).default(30000)
  }).strict().default({}),
  context: contextSpecSchema.default({}),
  schedule: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('always') }).strict(),
    z.object({ mode: z.literal('when_entity_involved'), entity: z.string().min(1) }).strict(),
    z.object({ mode: z.literal('every_n_turns'), n: z.number().int().positive() }).strict(),
    z.object({ mode: z.literal('time_jump'), min_days: z.number().positive() }).strict()
  ]).default({ mode: 'always' }),
  required: z.boolean().default(false),
  enabled: z.boolean().default(true)
}).strict().superRefine((agent, context) => {
  if ((agent.kind === 'output') !== Boolean(agent.params.purpose)) {
    context.addIssue({ code: 'custom', message: 'Output agents require a purpose; other agents must not declare one' });
  }
  if (agent.kind !== 'output' && agent.context.whiteboard) {
    context.addIssue({ code: 'custom', message: 'Only output agents can access whiteboard' });
  }
  if (agent.kind === 'output' && !agent.context.whiteboard) {
    context.addIssue({ code: 'custom', message: 'Output agents must receive the whiteboard' });
  }
});
export type AgentConfig = z.infer<typeof agentSchema>;

export const proposalInstructions = `Chaque proposition comporte source_quote, citation exacte du texte. Opérations :
create_entity {key,name,kind,description,attributes}; update_entity {key,patch,reason};
add_fact {text,subjects:[clés],tags:[],importance:"LOW"|"MEDIUM"|"HIGH",public:boolean,known_by:[clés]};
supersede_fact {ref:"F1",new_text?,known_by?,reason?,resolution_event?:index zéro-based};
set_knowledge {character,fact_ref?,content?,status:"knows"|"believes"|"suspects",is_false:boolean}.
Utilise les clés d'entités et références de faits existantes. Crée les entités avant les faits. Utilise le tag "rule" pour les règles du monde.`;

export function defaultAgents(model: string): AgentConfig[] {
  return [
    agentSchema.parse({ key: 'interpreter', name: 'Interpréteur', kind: 'interpreter', model,
      system_prompt: 'Interprète les actions imposées comme des actions et les résultats présupposés comme des intentions.' }),
    agentSchema.parse({ key: 'narrator', name: 'Narrateur', kind: 'output', model,
      params: { purpose: 'narrator', max_tokens: 3000, timeout_ms: 90000 },
      context: { whiteboard: true, max_input_tokens: 32000, events: { last: 8 }, summaries: [1, 2], recent_prose: 1 },
      system_prompt: 'Écris à la troisième personne. Respecte les faits et contraintes, puis les décisions autonomes, puis les complications. La direction méta est une suggestion. Ne révèle pas les secrets aux personnages qui les ignorent.' }),
    agentSchema.parse({ key: 'guardian', name: 'Gardien', kind: 'output', model,
      params: { purpose: 'guardian', max_tokens: 2500, timeout_ms: 60000 },
      context: { whiteboard: true, max_input_tokens: 32000, events: { last: 8 }, summaries: [1, 2], recent_prose: 1 },
      system_prompt: 'Propose uniquement les mutations de mémoire justifiées par la prose. Ne transforme pas une croyance en vérité.' })
  ];
}

export function shouldRun(agent: AgentConfig, focus: string[], turnSeq: number, elapsedDays: number): boolean {
  switch (agent.schedule.mode) {
    case 'always': return true;
    case 'when_entity_involved': return focus.includes(agent.schedule.entity);
    case 'every_n_turns': return turnSeq % agent.schedule.n === 0;
    case 'time_jump': return elapsedDays >= agent.schedule.min_days;
  }
}
