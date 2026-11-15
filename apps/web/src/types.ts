export type Project = {
  id: string;
  name: string;
  activeBranchId: string;
  worldInitialized: boolean;
  settings: unknown;
};

export type Turn = {
  id: string;
  seq: number;
  userInput: string;
  prose: string | null;
  status: string;
  error: string | null;
};

export type Branch = { id: string; parentBranchId: string | null; forkEventSeq: number };

export type Agent = {
  id: string;
  key: string;
  name: string;
  kind: string;
  systemPrompt: string;
  model: string;
  params: unknown;
  contextSpec: unknown;
  schedule: unknown;
  required: boolean;
  enabled: boolean;
};

export type Memory = {
  state: {
    entities: { key: string; name: string; kind: string }[];
    facts: { ref: string; text: string; importance: string; public: boolean; status: string }[];
    knowledge: {
      character: string;
      fact_ref?: string;
      content?: string;
      status: string;
      is_false: boolean;
      ended: boolean;
    }[];
  };
  summaries: { id: string; level: number; fromTurn: number; toTurn: number; text: string }[];
};

export type BudgetReservation = {
  id: string;
  turnId: string | null;
  amount: string;
  settled: boolean;
  settledAmount: string | null;
};

export type TurnStreamPayload = {
  text?: string;
  status?: string;
  message?: string;
  retryGuardian?: boolean;
};

export type TurnStreamEvent = { event: string; payload: TurnStreamPayload };
