export const knowledgeSessionLifecycleStates = [
  'active',
  'idle',
  'ending',
  'ended',
  'distilling',
  'distilled',
  'distill_failed',
] as const;

export type SessionLifecycleState = (typeof knowledgeSessionLifecycleStates)[number];

export const knowledgeDistillationStatuses = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'skipped',
] as const;
export type DistillationStatus = (typeof knowledgeDistillationStatuses)[number];

export const knowledgeCandidateStatuses = [
  'new',
  'reviewed',
  'promoted',
  'rejected',
  'archived',
] as const;
export type KnowledgeCandidateStatus = (typeof knowledgeCandidateStatuses)[number];

export const knowledgeCardStatuses = ['active', 'archived'] as const;
export type KnowledgeCardStatus = (typeof knowledgeCardStatuses)[number];

export interface KnowledgeOverviewStats {
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

export interface KnowledgePromotionCardPayload {
  id: string;
  candidateId?: string | null;
  taskId: string;
  sessionId: string;
  title: string;
  cardKind: string;
  summary: string;
  content: string;
  status?: KnowledgeCardStatus;
  evidenceRefs?: KnowledgeEvidenceRef[];
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
  archivedAt?: number | null;
}

export type ReviewKnowledgeCandidateArgs =
  | {
      candidateId: string;
      action: 'promote';
      reviewedBy?: string | null;
      card: KnowledgePromotionCardPayload;
    }
  | {
      candidateId: string;
      action: 'reject';
      reviewedBy?: string | null;
    }
  | {
      candidateId: string;
      action: 'archive';
    };

export interface KnowledgeSessionSummary {
  sessionId: string;
  lifecycleState: SessionLifecycleState;
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
  limit?: number;
  offset?: number;
}

export interface KnowledgeOverviewPayload {
  overviewStats: KnowledgeOverviewStats;
  sessionSummaryCount: number;
  candidateCount: number;
  cardCount: number;
  candidateStatusCounts: Record<KnowledgeCandidateStatus, number>;
  cardStatusCounts: Record<KnowledgeCardStatus, number>;
  distillationStatusCounts: Record<DistillationStatus, number>;
  updatedAt: number;
}
