import { estimateTokens } from '../llm/contextComposition.js';
import type { PriceRate } from '../llm/usage/pricingResolver.js';
import { judgeMessages } from './blindJudge.js';
import { judgedStory, playedPair, type PlayedConfiguration } from './evaluationRun.js';

/**
 * Estimation du coût réel du scénario, sans aucun appel au fournisseur. Les tokens d'entrée viennent des
 * prompts réellement construits par le pipeline lors d'un jeu simulé ; seules les sorties structurées
 * suivent des tailles typiques, et la prose suit la longueur simulée.
 */

export type EstimatedStage = 'analysis' | 'direction' | 'narrator' | 'guardian' | 'judge';
export type EstimateBound = 'low' | 'high';
export type EstimatedCall = { configuration: string; stage: EstimatedStage; inputTokens: number; outputTokens: number };

const PIPELINE_STAGES = ['analysis', 'direction', 'narrator', 'guardian'] as const;

function isPipelineStage(stage: string): stage is (typeof PIPELINE_STAGES)[number] {
  return (PIPELINE_STAGES as readonly string[]).includes(stage);
}

/** Typical output of a structured call, in tokens: an envelope, a direction, memory proposals, a verdict. */
export const TYPICAL_OUTPUT_TOKENS: Record<Exclude<EstimatedStage, 'narrator'>, Record<EstimateBound, number>> = {
  analysis: { low: 250, high: 700 },
  direction: { low: 200, high: 500 },
  guardian: { low: 300, high: 1_000 },
  judge: { low: 500, high: 1_200 },
};

/** Share of structured calls retried after an invalid output, counted in the high bound only. */
export const HIGH_RETRY_RATE = 0.25;

/** A call's output tokens for a bound: the simulated prose for the Narrator, a typical size otherwise. */
export function outputTokensFor(stage: EstimatedStage, simulatedOutputTokens: number, bound: EstimateBound): number {
  return stage === 'narrator' ? simulatedOutputTokens : TYPICAL_OUTPUT_TOKENS[stage][bound];
}

/** The cheapest and the most expensive published rate of the model (off-peak and peak windows). */
export function rateBounds(rates: readonly PriceRate[]): Record<EstimateBound, PriceRate> | null {
  const price = (rate: PriceRate) => rate.inputPerMillion + rate.outputPerMillion;
  const sorted = [...rates].sort((left, right) => price(left) - price(right));
  const low = sorted.at(0);
  const high = sorted.at(-1);
  return low && high ? { low, high } : null;
}

export type BoundEstimate = { calls: number; inputTokens: number; outputTokens: number; usd: number };
export type CostEstimate = {
  total: Record<EstimateBound, BoundEstimate>;
  byConfiguration: Record<string, Record<EstimateBound, BoundEstimate>>;
};

function callUsd(call: EstimatedCall, rate: PriceRate): number {
  return (call.inputTokens * rate.inputPerMillion + call.outputTokens * rate.outputPerMillion) / 1_000_000;
}

function boundEstimate(calls: readonly EstimatedCall[], rate: PriceRate, retryRate: number): BoundEstimate {
  const weight = (call: EstimatedCall) => call.stage === 'narrator' ? 1 : 1 + retryRate;
  return {
    calls: calls.reduce((sum, call) => sum + weight(call), 0),
    inputTokens: calls.reduce((sum, call) => sum + call.inputTokens * weight(call), 0),
    outputTokens: calls.reduce((sum, call) => sum + call.outputTokens * weight(call), 0),
    usd: calls.reduce((sum, call) => sum + callUsd(call, rate) * weight(call), 0),
  };
}

/**
 * The low bound prices the short-prose run at the cheapest rate, without retries; the high bound prices
 * the long-prose run at the most expensive rate, with retries. Cache discounts are ignored.
 */
export function estimateCost(
  calls: Record<EstimateBound, readonly EstimatedCall[]>, rates: Record<EstimateBound, PriceRate>,
  retryRate = HIGH_RETRY_RATE,
): CostEstimate {
  const estimate = (bound: EstimateBound, subset: (call: EstimatedCall) => boolean) =>
    boundEstimate(calls[bound].filter(subset), rates[bound], bound === 'high' ? retryRate : 0);
  const configurations = [...new Set([...calls.low, ...calls.high].map((call) => call.configuration))];
  return {
    total: { low: estimate('low', () => true), high: estimate('high', () => true) },
    byConfiguration: Object.fromEntries(configurations.map((configuration) => {
      const own = (call: EstimatedCall) => call.configuration === configuration;
      return [configuration, { low: estimate('low', own), high: estimate('high', own) }];
    })),
  };
}

/** The calls of a simulated play as a bound prices them, the judge's two passes included. */
export function estimatedCalls(played: readonly PlayedConfiguration[], inputs: readonly string[], bound: EstimateBound): EstimatedCall[] {
  const calls = played.flatMap(({ configuration, turns }) => turns.flatMap((turn) => turn.calls.map((call): EstimatedCall => {
    if (!isPipelineStage(call.stage)) throw new Error(`Unexpected stage "${call.stage}" in the estimate.`);
    return {
      configuration: configuration.key, stage: call.stage, inputTokens: call.inputTokens ?? 0,
      outputTokens: outputTokensFor(call.stage, call.outputTokens ?? 0, bound),
    };
  })));
  const { v1, v2 } = playedPair(played);
  const judgeInput = judgeMessages(inputs, { A: judgedStory(v1), B: judgedStory(v2) })
    .reduce((sum, message) => sum + estimateTokens(String(message.content)), 0);
  const judgeCall: EstimatedCall = { configuration: 'juge', stage: 'judge', inputTokens: judgeInput, outputTokens: outputTokensFor('judge', 0, bound) };
  return [...calls, judgeCall, judgeCall];
}
