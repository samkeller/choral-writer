import { db } from '../client.js';
import { llmCall } from '../entities/llmCall.js';
import type { LlmCallTrace } from '../../llm/call-llm.js';

export async function insertLlmCall(trace: LlmCallTrace): Promise<void> {
  await db.insert(llmCall).values({
    id: trace.id,
    turnId: trace.turnId,
    agentId: trace.agentId,
    agentVersionId: trace.agentVersionId,
    stageExecutionId: trace.stageExecutionId,
    stage: trace.stage,
    model: trace.model,
    request: { messages: trace.messages, memory: trace.memory },
    response: trace.response,
    inputTokens: trace.inputTokens,
    outputTokens: trace.outputTokens,
    durationMs: trace.durationMs,
    status: trace.status,
    error: trace.error,
  });
}
