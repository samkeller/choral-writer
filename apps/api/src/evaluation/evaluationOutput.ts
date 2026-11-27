import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { toPublicError } from '../errors/errors.js';
import { renderFullReport, renderPublicSynthesis, type EvaluationResult } from './evaluationReport.js';
import type { JudgeOutcome, JudgeResult } from './evaluationRun.js';
import { aggregateMeasures } from './turnMeasures.js';

/** Writes the local report (with prose), the publishable synthesis and the measures, replacing earlier versions. */
export function writeEvaluationOutputs(directory: string, result: EvaluationResult, inputs: readonly string[]): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'rapport.md'), renderFullReport(result, inputs));
  writeFileSync(join(directory, 'synthese.md'), renderPublicSynthesis(result));
  const { judge } = result;
  writeFileSync(join(directory, 'mesures.json'), `${JSON.stringify({
    mode: result.mode, model: result.model, runAt: result.runAt,
    configurations: result.configurations.map(({ configuration, team, turns }) => ({
      key: configuration.key, team, aggregate: aggregateMeasures(turns.map((turn) => turn.measure)), turns: turns.map((turn) => turn.measure),
    })),
    judge: judge.status === 'fait' ? {
      status: judge.status, costMicroUsd: judge.costMicroUsd, combined: judge.result.combined,
      passes: judge.result.passes.map(({ key, inputTokens, outputTokens }) => ({ key, inputTokens, outputTokens })),
    } : judge,
    friction: result.friction,
  }, null, 2)}\n`);
}

/**
 * Writes every output before judging, then judges and writes them again. A judge that still fails
 * after its retry only leaves its reason: the measures and the stories of a paid run are never lost.
 */
export async function finishEvaluation(
  directory: string, result: Omit<EvaluationResult, 'judge'>, inputs: readonly string[],
  judge: () => Promise<JudgeResult>, priceJudge: (judge: JudgeResult) => Promise<number | null>,
): Promise<EvaluationResult> {
  writeEvaluationOutputs(directory, { ...result, judge: { status: 'en-attente' } }, inputs);
  let outcome: JudgeOutcome;
  try {
    const judged = await judge();
    outcome = { status: 'fait', result: judged, costMicroUsd: await priceJudge(judged) };
  } catch (error) {
    console.error('Le jugement a échoué ; le rapport garde les mesures.', error);
    outcome = { status: 'echec', reason: toPublicError(error).code };
  }
  const finished = { ...result, judge: outcome };
  writeEvaluationOutputs(directory, finished, inputs);
  return finished;
}
