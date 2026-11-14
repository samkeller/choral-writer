import { proposalSchema, type Proposal, type Resolution } from './contracts.js';

export type Entity = {
  key: string; name: string; kind: string; description: string; attributes: Record<string, unknown>;
};
export type Fact = {
  ref: string; text: string; subjects: string[]; tags: string[];
  importance: 'LOW' | 'MEDIUM' | 'HIGH'; public: boolean;
  status: 'active' | 'superseded' | 'retracted'; superseded_by?: string;
};
export type Knowledge = {
  character: string; fact_ref?: string; content?: string;
  status: 'knows' | 'believes' | 'suspects'; is_false: boolean; ended: boolean;
};
export type Memory = { entities: Entity[]; facts: Fact[]; knowledge: Knowledge[]; nextRef: number };
export type Mutation = { proposal: Proposal; assignedRef?: string };
export type Rejection = { code: string; detail: string };
export type ProposalResult =
  | { status: 'accepted'; event: Mutation }
  | { status: 'rejected'; rejection: Rejection };

export function emptyMemory(): Memory {
  return { entities: [], facts: [], knowledge: [], nextRef: 1 };
}

function normalized(text: string): string {
  return text.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('fr');
}

export function applyMutation(memory: Memory, event: Mutation): Memory {
  const state = structuredClone(memory);
  const proposal = event.proposal;
  switch (proposal.op) {
    case 'create_entity':
      state.entities.push({ key: proposal.key, name: proposal.name, kind: proposal.kind,
        description: proposal.description, attributes: proposal.attributes });
      break;
    case 'update_entity': {
      const entity = state.entities.find(item => item.key === proposal.key);
      if (!entity) throw new Error('Invalid event: entity missing');
      Object.assign(entity, proposal.patch);
      break;
    }
    case 'add_fact': {
      if (!event.assignedRef) throw new Error('Invalid event: missing fact reference');
      state.facts.push({ ref: event.assignedRef, text: proposal.text, subjects: proposal.subjects,
        tags: proposal.tags, importance: proposal.importance, public: proposal.public, status: 'active' });
      state.nextRef = Math.max(state.nextRef, Number(event.assignedRef.slice(1)) + 1);
      for (const character of proposal.known_by) {
        state.knowledge.push({ character, fact_ref: event.assignedRef, status: 'knows', is_false: false, ended: false });
      }
      break;
    }
    case 'supersede_fact': {
      const fact = state.facts.find(item => item.ref === proposal.ref && item.status === 'active');
      if (!fact) throw new Error('Invalid event: active fact missing');
      fact.status = proposal.new_text ? 'superseded' : 'retracted';
      for (const knowledge of state.knowledge) {
        if (knowledge.fact_ref === fact.ref && !knowledge.ended) knowledge.ended = true;
      }
      if (proposal.new_text) {
        if (!event.assignedRef) throw new Error('Invalid event: missing replacement reference');
        fact.superseded_by = event.assignedRef;
        state.facts.push({ ...fact, ref: event.assignedRef, text: proposal.new_text, status: 'active', superseded_by: undefined });
        state.nextRef = Math.max(state.nextRef, Number(event.assignedRef.slice(1)) + 1);
        for (const character of proposal.known_by ?? []) {
          state.knowledge.push({ character, fact_ref: event.assignedRef, status: 'knows', is_false: false, ended: false });
        }
      }
      break;
    }
    case 'set_knowledge':
      if (proposal.fact_ref) {
        for (const knowledge of state.knowledge) {
          if (knowledge.character === proposal.character && knowledge.fact_ref === proposal.fact_ref && !knowledge.ended) {
            knowledge.ended = true;
          }
        }
      }
      state.knowledge.push({ character: proposal.character, fact_ref: proposal.fact_ref, content: proposal.content,
        status: proposal.status, is_false: proposal.is_false, ended: false });
  }
  return state;
}

export function replay(events: Mutation[]): Memory {
  return events.reduce(applyMutation, emptyMemory());
}

export function reduceProposal(
  memory: Memory, input: unknown,
  options: { source: string; evidence?: string; resolution?: Resolution }
): ProposalResult {
  const reject = (code: string, detail: string): ProposalResult => ({ status: 'rejected', rejection: { code, detail } });
  if (!['guardian', 'seed', 'debug'].includes(options.source)) return reject('INVALID_SOURCE', 'Source non autorisée');
  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success) return reject('INVALID_FORMAT', parsed.error.message);
  const proposal = parsed.data;
  if (options.evidence !== undefined && !options.evidence.includes(proposal.source_quote)) {
    return reject('INVALID_QUOTE', 'La citation ne figure pas dans le texte source');
  }
  const entityExists = (key: string) => memory.entities.some(entity => entity.key === key);
  const activeFact = (ref: string) => memory.facts.find(fact => fact.ref === ref && fact.status === 'active');
  const duplicate = (text: string, except?: string) =>
    memory.facts.some(fact => fact.status === 'active' && fact.ref !== except && normalized(fact.text) === normalized(text));

  switch (proposal.op) {
    case 'create_entity':
      if (entityExists(proposal.key)) return reject('ENTITY_EXISTS', proposal.key);
      break;
    case 'update_entity':
      if (!entityExists(proposal.key)) return reject('ENTITY_NOT_FOUND', proposal.key);
      break;
    case 'add_fact':
      for (const key of [...proposal.subjects, ...proposal.known_by]) {
        if (!entityExists(key)) return reject('ENTITY_NOT_FOUND', key);
      }
      if (!proposal.public && proposal.known_by.length === 0) return reject('PRIVATE_WITHOUT_KNOWLEDGE', proposal.text);
      if (new Set(proposal.known_by).size !== proposal.known_by.length) return reject('DUPLICATE_KNOWLEDGE', proposal.text);
      if (duplicate(proposal.text)) return reject('DUPLICATE_FACT', proposal.text);
      break;
    case 'supersede_fact': {
      const fact = activeFact(proposal.ref);
      if (!fact) return reject('FACT_NOT_FOUND', proposal.ref);
      if (proposal.new_text && duplicate(proposal.new_text, proposal.ref)) return reject('DUPLICATE_FACT', proposal.new_text);
      if (proposal.new_text && !fact.public && !proposal.known_by?.length) {
        return reject('PRIVATE_WITHOUT_KNOWLEDGE', proposal.ref);
      }
      for (const key of proposal.known_by ?? []) {
        if (!entityExists(key)) return reject('ENTITY_NOT_FOUND', key);
      }
      if (proposal.known_by && new Set(proposal.known_by).size !== proposal.known_by.length) {
        return reject('DUPLICATE_KNOWLEDGE', proposal.ref);
      }
      if (fact.importance === 'HIGH') {
        const event = proposal.resolution_event === undefined ? undefined : options.resolution?.happened[proposal.resolution_event];
        if (!proposal.reason || !event || (fact.subjects.length > 0 && !fact.subjects.some(subject => event.participants.includes(subject)))) {
          return reject('HIGH_FACT_NEEDS_JUSTIFICATION', proposal.ref);
        }
      }
      break;
    }
    case 'set_knowledge':
      if (!entityExists(proposal.character)) return reject('ENTITY_NOT_FOUND', proposal.character);
      if (!proposal.fact_ref && !proposal.content) return reject('KNOWLEDGE_WITHOUT_CONTENT', proposal.character);
      if (proposal.fact_ref && !activeFact(proposal.fact_ref)) return reject('FACT_NOT_FOUND', proposal.fact_ref);
      if (proposal.is_false && !proposal.content) return reject('FALSE_BELIEF_WITHOUT_CONTENT', proposal.character);
      break;
  }
  const assignedRef = proposal.op === 'add_fact' || (proposal.op === 'supersede_fact' && proposal.new_text)
    ? `F${memory.nextRef}` : undefined;
  return { status: 'accepted', event: { proposal, assignedRef } };
}
