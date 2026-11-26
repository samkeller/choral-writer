import type { z } from 'zod';

import type { messageDtoSchema, messageSchema } from './schemas/message.js';
import type { chatBranchDtoSchema, chatBranchSchema } from './schemas/branch.js';
import type { chatTurnDtoSchema, chatTurnSchema } from './schemas/turn.js';
import type { chatHistoryDtoSchema, chatHistorySchema } from './schemas/history.js';
import type { chatCommandSchema, chatOperationSchema, replayConfigurationSchema } from './schemas/command.js';
import type { chatEventDtoSchema, chatEventSchema } from './schemas/event.js';
import type {
  analysisTraceSchema, directionTraceSchema, narratorTraceSchema, traceCallDetailSchema,
  traceCallSummarySchema, turnTraceSummarySchema, stageDurationSchema,
  turnConfigurationChangeSchema, turnDirectionMetricsSchema, turnMetricsSchema,
} from './schemas/traces.js';

export type MessageDto = z.infer<typeof messageDtoSchema>;
export type ChatBranchDto = z.infer<typeof chatBranchDtoSchema>;
export type ChatTurnDto = z.infer<typeof chatTurnDtoSchema>;
export type ChatHistoryDto = z.infer<typeof chatHistoryDtoSchema>;
export type ChatEventDto = z.infer<typeof chatEventDtoSchema>;
export type TraceCallSummary = z.infer<typeof traceCallSummarySchema>;
export type TraceCallDetail = z.infer<typeof traceCallDetailSchema>;
export type AnalysisTrace = z.infer<typeof analysisTraceSchema>;
export type DirectionTrace = z.infer<typeof directionTraceSchema>;
export type NarratorTrace = z.infer<typeof narratorTraceSchema>;
export type TurnTraceSummary = z.infer<typeof turnTraceSummarySchema>;
export type StageDuration = z.infer<typeof stageDurationSchema>;
export type TurnConfigurationChange = z.infer<typeof turnConfigurationChangeSchema>;
export type TurnMetrics = z.infer<typeof turnMetricsSchema>;
export type TurnDirectionMetrics = z.infer<typeof turnDirectionMetricsSchema>;

export type Message = z.infer<typeof messageSchema>;
export type ChatBranch = z.infer<typeof chatBranchSchema>;
export type ChatTurn = z.infer<typeof chatTurnSchema>;
export type ChatHistory = z.infer<typeof chatHistorySchema>;
export type ChatOperation = z.infer<typeof chatOperationSchema>;
export type ChatCommand = z.infer<typeof chatCommandSchema>;
export type ReplayConfiguration = z.infer<typeof replayConfigurationSchema>;
export type ChatEvent = z.infer<typeof chatEventSchema>;