import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatCompletion } from 'openai/resources/chat/completions';

import { createCallLLM } from '../llm/call-llm.js';
import { EVALUATION_CONFIGURATIONS } from './evaluationScenario.js';
import { finishEvaluation } from './evaluationOutput.js';
import { judgeStories, type PlayedConfiguration } from './evaluationRun.js';
import type { FrictionReport } from './friction.js';
import { simulatedProvider } from './simulatedLlm.js';
import type { TurnMeasure } from './turnMeasures.js';

const measure: TurnMeasure = {
  index: 1, probe: 'ouverture', status: 'completed', durationMs: 1_000, costMicroUsd: 1_000, costComplete: true,
  calls: 1, failedCalls: 0, direction: 'absente', sceneDevelopments: 0, offscreenDevelopments: 0,
  historyShare: null, narratorInputTokens: 10, proseWords: 2,
};
const played: PlayedConfiguration[] = EVALUATION_CONFIGURATIONS.map((configuration) => ({
  configuration, projectId: '00000000-0000-7000-8000-000000000001', team: [],
  turns: [{ measure, prose: `Prose ${configuration.key}.`, errorCode: null, calls: [] }],
}));
const path = { key: 'p', label: 'Parcours', actions: 6, unconfirmed: [] };
const friction: FrictionReport = { v1Reference: null, paths: { v1: path, newProject: path, v2: path }, checks: { v1: [], v2: [] } };

function completion(content: string): ChatCompletion {
  return {
    id: 'judge', object: 'chat.completion', created: 0, model: 'test',
    choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message: { role: 'assistant', content, refusal: null, annotations: [] } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

describe('finishEvaluation', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('keeps the report and the measures when the judge answers invalid twice', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const directory = mkdtempSync(join(tmpdir(), 't43-eval-'));
    directories.push(directory);
    const create = vi.fn(async () => completion('{"v":1,"criteria":{}}'));
    const callLLM = createCallLLM({
      client: { chat: { completions: { create } } }, traces: { insert: async () => {} }, model: 'test', provider: simulatedProvider,
    });

    const result = await finishEvaluation(directory, {
      mode: 'simulé', model: 'test', runAt: new Date('2026-11-27T10:00:00Z'), configurations: played, friction,
    }, ['Une saisie.'], () => judgeStories(callLLM, 'project', ['Une saisie.'], { v1: ['a'], v2: ['b'] }), async () => 0);

    // The first pass is asked again once, then the judgement gives up without a second pass.
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.judge).toEqual({ status: 'echec', reason: 'LLM_INVALID_RESPONSE' });
    expect(readFileSync(join(directory, 'rapport.md'), 'utf8')).toContain('Prose v2.');
    expect(readFileSync(join(directory, 'synthese.md'), 'utf8')).toContain('Échec après une relance (LLM_INVALID_RESPONSE)');
    expect(JSON.parse(readFileSync(join(directory, 'mesures.json'), 'utf8'))).toMatchObject({
      judge: { status: 'echec' }, configurations: [{ key: 'v1' }, { key: 'v2' }],
    });
  });

  it('writes the outputs before judging', async () => {
    const directory = mkdtempSync(join(tmpdir(), 't43-eval-'));
    directories.push(directory);
    let writtenBeforeJudging = false;
    await finishEvaluation(directory, {
      mode: 'simulé', model: 'test', runAt: new Date(), configurations: played, friction,
    }, ['Une saisie.'], async () => {
      writtenBeforeJudging = existsSync(join(directory, 'rapport.md')) && existsSync(join(directory, 'mesures.json'));
      throw new Error('stop');
    }, async () => null);
    expect(writtenBeforeJudging).toBe(true);
  });
});
