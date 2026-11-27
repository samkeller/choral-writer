import { describe, expect, it } from 'vitest';

import { renderFullReport, renderPublicSynthesis, type EvaluationResult } from './evaluationReport.js';
import type { PlayedConfiguration } from './evaluationRun.js';
import { EVALUATION_CONFIGURATIONS } from './evaluationScenario.js';
import type { FrictionReport } from './friction.js';
import type { TurnMeasure } from './turnMeasures.js';

const PROSE = 'Une prose secrète qui ne doit jamais sortir du poste.';
const INPUT = 'Une saisie du scénario.';
const REASON = 'Justification qui cite peut-être le récit.';

const measure: TurnMeasure = {
  index: 1, probe: 'ouverture', status: 'completed', durationMs: 2_000, costMicroUsd: 1_500, costComplete: true,
  calls: 2, failedCalls: 0, direction: 'absente', sceneDevelopments: 0, offscreenDevelopments: 0,
  historyShare: 0.5, narratorInputTokens: 100, proseWords: 9,
};

const played: PlayedConfiguration[] = EVALUATION_CONFIGURATIONS.map((configuration) => ({
  configuration, projectId: '00000000-0000-7000-8000-000000000001', team: ['Narrateur v2'],
  turns: [{ measure, prose: PROSE, errorCode: null, calls: [] }],
}));

const path = { key: 'p', label: 'Parcours', actions: 6, unconfirmed: [] };
const friction: FrictionReport = {
  firstTurn: { v1: path, v2: path }, v2Team: { ...path, actions: 21 },
  checks: { v1: [{ key: 'c', label: 'Propriété', holds: false }], v2: [{ key: 'c', label: 'Propriété', holds: true }] },
};

const pass = (A: 'v1' | 'v2') => {
  const criterion = { winner: 'v2' as const, why: REASON };
  return {
    key: { A, B: A === 'v1' ? 'v2' as const : 'v1' as const }, inputTokens: 10, outputTokens: 5,
    verdict: { resistance: criterion, horsChamp: criterion, nonLineaire: criterion, continuite: criterion },
  };
};

const result: EvaluationResult = {
  mode: 'simulé', model: 'simulé', runAt: new Date('2026-11-27T10:00:00Z'), configurations: played, friction,
  judge: {
    passes: [pass('v1'), pass('v2')],
    combined: { resistance: 'v2', horsChamp: 'v2', nonLineaire: 'incertain', continuite: 'egalite' },
  },
};

describe('evaluation report', () => {
  it('publishes numbers and verdicts, never prose, inputs, reasons nor project links', () => {
    const synthesis = renderPublicSynthesis(result);
    expect(synthesis).toContain('0.0015 $');
    expect(synthesis).toContain('incertain (l’ordre a décidé)');
    expect(synthesis).toContain('21 actions');
    for (const secret of [PROSE, INPUT, REASON, '/projects/']) expect(synthesis).not.toContain(secret);
  });

  it('keeps prose, inputs and reasons in the local report', () => {
    const report = renderFullReport(result, [INPUT]);
    for (const detail of [PROSE, INPUT, REASON, '/projects/00000000-0000-7000-8000-000000000001']) expect(report).toContain(detail);
  });
});
