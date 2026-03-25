export type SessionLifecycleState =
  | 'active'
  | 'idle'
  | 'ending'
  | 'ended'
  | 'distilling'
  | 'distilled'
  | 'distill_failed';

export type DistillationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped';
export type KnowledgeCandidateStatus = 'new' | 'reviewed' | 'promoted' | 'rejected' | 'archived';
export type KnowledgeCardStatus = 'active' | 'archived';

export interface KnowledgeRuntimeStats {
  totalSessions: number;
  activeSessions: number;
  idleSessions: number;
  distillingSessions: number;
  distilledSessions: number;
  failedSessions: number;
  lastUpdatedAt: number;
}

export interface KnowledgeEvidenceRef {
  id: string;
  kind: 'session' | 'conversation' | 'message' | 'task' | 'file' | 'note' | 'url';
  title?: string;
  excerpt?: string;
  url?: string;
  createdAt?: number;
}

export interface KnowledgeDistillationRecord {
  id: string;
  sessionId: string;
  status: DistillationStatus;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number | null;
  errorMessage?: string | null;
  evidenceRefs: KnowledgeEvidenceRef[];
}

export interface KnowledgeCandidate {
  id: string;
  sessionId: string;
  status: KnowledgeCandidateStatus;
  title: string;
  summary: string;
  sourceCount: number;
  evidenceRefs: KnowledgeEvidenceRef[];
  distillation?: KnowledgeDistillationRecord | null;
  reviewedAt?: number | null;
  reviewedBy?: string | null;
  promotedCardId?: string | null;
  archivedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeCard {
  id: string;
  candidateId: string | null;
  status: KnowledgeCardStatus;
  title: string;
  summary: string;
  content: string;
  sessionIds: string[];
  evidenceRefs: KnowledgeEvidenceRef[];
  createdAt: number;
  updatedAt: number;
  archivedAt?: number | null;
}

export interface KnowledgeSessionSummary {
  sessionId: string;
  lifecycleState: SessionLifecycleState;
  runtimeStats: KnowledgeRuntimeStats;
  distillation?: KnowledgeDistillationRecord | null;
  candidate?: KnowledgeCandidate | null;
  card?: KnowledgeCard | null;
  updatedAt: number;
}

export interface KnowledgeInboxFilters {
  query?: string;
  sessionStates?: SessionLifecycleState[];
  candidateStatuses?: KnowledgeCandidateStatus[];
  distillationStatuses?: DistillationStatus[];
  limit?: number;
  offset?: number;
}

export interface KnowledgeCardFilters {
  query?: string;
  status?: KnowledgeCardStatus[];
  candidateStatuses?: KnowledgeCandidateStatus[];
  limit?: number;
  offset?: number;
}

export interface KnowledgeOverviewPayload {
  runtimeStats: KnowledgeRuntimeStats;
  sessionSummaryCount: number;
  candidateCount: number;
  cardCount: number;
  candidateStatusCounts: Record<KnowledgeCandidateStatus, number>;
  cardStatusCounts: Record<KnowledgeCardStatus, number>;
  distillationStatusCounts: Record<DistillationStatus, number>;
  inboxFilters: KnowledgeInboxFilters;
  knowledgeFilters: KnowledgeCardFilters;
  updatedAt: number;
}
