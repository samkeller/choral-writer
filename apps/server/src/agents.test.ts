import { describe, expect, it } from 'vitest';
import { agentSchema, shouldRun } from './agents.js';

describe('analysis schedules', () => {
  const agent = {
    key: 'marie', name: 'Marie', kind: 'analysis', model: 'model', system_prompt: 'Analyse',
    context: {}, params: {}
  };
  it('uses the branch-local turn number for periodic agents', () => {
    const config = agentSchema.parse({ ...agent, schedule: { mode: 'every_n_turns', n: 3 } });
    expect(shouldRun(config, [], 2, 0)).toBe(false);
    expect(shouldRun(config, [], 3, 0)).toBe(true);
  });
  it('checks focus and time jump thresholds', () => {
    const focused = agentSchema.parse({ ...agent, schedule: { mode: 'when_entity_involved', entity: 'marie' } });
    const jump = agentSchema.parse({ ...agent, schedule: { mode: 'time_jump', min_days: 7 } });
    expect(shouldRun(focused, ['marie'], 1, 0)).toBe(true);
    expect(shouldRun(focused, [], 1, 0)).toBe(false);
    expect(shouldRun(jump, [], 1, 6)).toBe(false);
    expect(shouldRun(jump, [], 1, 7)).toBe(true);
  });
});
