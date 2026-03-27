import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  knowledgeCandidateStatuses,
  knowledgeDistillationStatuses,
  type DistillationStatus,
  type KnowledgeCandidate,
  type KnowledgeCandidateStatus,
  type KnowledgeInboxFilters,
  type KnowledgePromotionCardPayload,
} from '@shared/knowledge/types';
import { knowledgeApi } from '@/lib/knowledgeApi';
import { cn } from '@/lib/utils';

type SelectableCandidateStatus = KnowledgeCandidateStatus | 'all';
type SelectableDistillationStatus = DistillationStatus | 'all';

type InboxPageFilters = {
  query: string;
  candidateStatus: SelectableCandidateStatus;
  distillationStatus: SelectableDistillationStatus;
};

export interface InboxPageViewProps {
  candidates: KnowledgeCandidate[];
  selectedCandidate: KnowledgeCandidate | null;
  isLoading: boolean;
  error: string | null;
  filters: InboxPageFilters;
  isRefreshing: boolean;
  isReviewing: boolean;
  onSelectCandidate: (candidate: KnowledgeCandidate) => void;
  onQueryChange: (value: string) => void;
  onCandidateStatusChange: (value: SelectableCandidateStatus) => void;
  onDistillationStatusChange: (value: SelectableDistillationStatus) => void;
  onRefresh: () => void;
  onPromote: (candidate: KnowledgeCandidate) => void;
  onReject: (candidate: KnowledgeCandidate) => void;
  onArchive: (candidate: KnowledgeCandidate) => void;
  onRetryCandidate: (candidate: KnowledgeCandidate) => void;
  onClose?: (() => void) | null;
}

interface InboxPageProps {
  initialSessionId?: string | null;
  onClose?: (() => void) | null;
}

const initialFilters: InboxPageFilters = {
  query: '',
  candidateStatus: 'all',
  distillationStatus: 'all',
};

function formatTimestamp(timestamp?: number | null): string {
  if (!timestamp) return 'Unknown';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return 'Unknown';
  }
}

function getTaskIdFromSessionId(sessionId: string): string {
  const parts = sessionId.split(':').filter(Boolean);
  return parts[parts.length - 1] || sessionId;
}

export function buildPromotionCard(candidate: KnowledgeCandidate): KnowledgePromotionCardPayload {
  const taskId = getTaskIdFromSessionId(candidate.sessionId);
  return {
    id: candidate.promotedCardId || `knowledge-card-${candidate.id}`,
    candidateId: candidate.id,
    taskId,
    sessionId: candidate.sessionId,
    title: candidate.title,
    cardKind: 'session-summary',
    summary: candidate.summary,
    content: `${candidate.summary}\n\nSession: ${candidate.sessionId}\nSources: ${candidate.sourceCount}`,
    evidenceRefs: candidate.evidenceRefs,
  };
}

function toKnowledgeFilters(filters: InboxPageFilters): KnowledgeInboxFilters {
  return {
    query: filters.query.trim() || undefined,
    candidateStatuses: filters.candidateStatus === 'all' ? undefined : [filters.candidateStatus],
    distillationStatuses:
      filters.distillationStatus === 'all' ? undefined : [filters.distillationStatus],
  };
}

function getCandidateSubtitle(candidate: KnowledgeCandidate): string {
  const status = candidate.distillation?.status ?? 'not_started';
  return `${candidate.status} • ${status} • ${candidate.sourceCount} source${
    candidate.sourceCount === 1 ? '' : 's'
  }`;
}

export function InboxPageView({
  candidates,
  selectedCandidate,
  isLoading,
  error,
  filters,
  isRefreshing,
  isReviewing,
  onSelectCandidate,
  onQueryChange,
  onCandidateStatusChange,
  onDistillationStatusChange,
  onRefresh,
  onPromote,
  onReject,
  onArchive,
  onRetryCandidate,
  onClose,
}: InboxPageViewProps) {
  const hasFailedSummary = selectedCandidate?.distillation?.status === 'failed';

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
      <div className="border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">Inbox review</h1>
            <p className="text-sm text-muted-foreground">
              First pass review surface for captured knowledge candidates.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
              >
                Back
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
            Search
            <input
              type="text"
              value={filters.query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search title or summary"
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
            />
          </label>
          <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-muted-foreground">
            Candidate status
            <select
              value={filters.candidateStatus}
              onChange={(event) =>
                onCandidateStatusChange(event.target.value as SelectableCandidateStatus)
              }
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
            >
              <option value="all">All</option>
              {knowledgeCandidateStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-muted-foreground">
            Summary status
            <select
              value={filters.distillationStatus}
              onChange={(event) =>
                onDistillationStatusChange(event.target.value as SelectableDistillationStatus)
              }
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
            >
              <option value="all">All</option>
              {knowledgeDistillationStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="min-h-0 border-b border-border xl:border-b-0 xl:border-r">
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-border px-4 py-3 text-sm text-muted-foreground">
              {isLoading ? 'Loading candidates...' : `${candidates.length} candidate(s)`}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {error ? (
                <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                  {error}
                </div>
              ) : candidates.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No candidates match the current filters.
                </div>
              ) : (
                <div className="space-y-2">
                  {candidates.map((candidate) => {
                    const selected = candidate.id === selectedCandidate?.id;
                    return (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => onSelectCandidate(candidate)}
                        className={cn(
                          'flex w-full flex-col items-start rounded-lg border px-3 py-3 text-left transition-colors',
                          selected
                            ? 'border-foreground/20 bg-muted'
                            : 'border-border bg-background hover:bg-muted/70'
                        )}
                      >
                        <span className="line-clamp-1 text-sm font-medium">{candidate.title}</span>
                        <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {candidate.summary}
                        </span>
                        <span className="mt-2 text-xs text-muted-foreground">
                          {getCandidateSubtitle(candidate)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto p-6">
          {selectedCandidate ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Candidate detail
                    </p>
                    <h2 className="text-2xl font-semibold">{selectedCandidate.title}</h2>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border px-2.5 py-1">
                      {selectedCandidate.status}
                    </span>
                    <span className="rounded-full border border-border px-2.5 py-1">
                      {selectedCandidate.distillation?.status ?? 'not_started'}
                    </span>
                  </div>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {selectedCandidate.summary}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Context
                  </p>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-muted-foreground">Session</dt>
                      <dd className="max-w-[20rem] break-all text-right">
                        {selectedCandidate.sessionId}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-muted-foreground">Task</dt>
                      <dd>{getTaskIdFromSessionId(selectedCandidate.sessionId)}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-muted-foreground">Sources</dt>
                      <dd>{selectedCandidate.sourceCount} sources</dd>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-muted-foreground">Updated</dt>
                      <dd>{formatTimestamp(selectedCandidate.updatedAt)}</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Review actions
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isReviewing}
                      onClick={() => onPromote(selectedCandidate)}
                      className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Promote
                    </button>
                    <button
                      type="button"
                      disabled={isReviewing}
                      onClick={() => onReject(selectedCandidate)}
                      className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={isReviewing}
                      onClick={() => onArchive(selectedCandidate)}
                      className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Archive
                    </button>
                    {hasFailedSummary ? (
                      <button
                        type="button"
                        disabled={isRefreshing}
                        onClick={() => onRetryCandidate(selectedCandidate)}
                        className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Retry
                      </button>
                    ) : null}
                  </div>
                  {hasFailedSummary ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Retry reloads inbox data for failed summary candidates in this first pass.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Evidence</h3>
                {selectedCandidate.evidenceRefs.length > 0 ? (
                  <div className="space-y-3">
                    {selectedCandidate.evidenceRefs.map((ref) => (
                      <div
                        key={ref.id}
                        className="rounded-lg border border-border bg-background px-4 py-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{ref.title || ref.id}</span>
                          <span className="text-xs text-muted-foreground">{ref.kind}</span>
                        </div>
                        {ref.excerpt ? (
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {ref.excerpt}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No evidence references attached.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              Select a candidate to review its summary, evidence, and actions.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function InboxPage({ initialSessionId, onClose }: InboxPageProps) {
  const [filters, setFilters] = useState<InboxPageFilters>(initialFilters);
  const [candidates, setCandidates] = useState<KnowledgeCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedCandidateId) ?? null,
    [candidates, selectedCandidateId]
  );

  const syncSelection = useCallback(
    (nextCandidates: KnowledgeCandidate[]) => {
      setSelectedCandidateId((currentId) => {
        if (currentId && nextCandidates.some((candidate) => candidate.id === currentId)) {
          return currentId;
        }
        if (initialSessionId) {
          const sessionMatch = nextCandidates.find(
            (candidate) => candidate.sessionId === initialSessionId
          );
          if (sessionMatch) return sessionMatch.id;
        }
        return nextCandidates[0]?.id ?? null;
      });
    },
    [initialSessionId]
  );

  const loadCandidates = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const nextCandidates = await knowledgeApi.listKnowledgeCandidates(
          toKnowledgeFilters(filters)
        );
        setCandidates(nextCandidates);
        syncSelection(nextCandidates);
      } catch (loadError) {
        setCandidates([]);
        setSelectedCandidateId(null);
        setError(
          loadError instanceof Error ? loadError.message : 'Failed to load inbox candidates.'
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [filters, syncSelection]
  );

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    if (!initialSessionId || candidates.length === 0) return;
    const sessionMatch = candidates.find((candidate) => candidate.sessionId === initialSessionId);
    if (sessionMatch) {
      setSelectedCandidateId(sessionMatch.id);
    }
  }, [candidates, initialSessionId]);

  const applyReview = useCallback(
    async (candidate: KnowledgeCandidate, action: 'promote' | 'reject' | 'archive') => {
      setIsReviewing(true);
      setError(null);

      try {
        if (action === 'promote') {
          await knowledgeApi.reviewKnowledgeCandidate({
            candidateId: candidate.id,
            action,
            card: buildPromotionCard(candidate),
          });
        } else {
          await knowledgeApi.reviewKnowledgeCandidate({
            candidateId: candidate.id,
            action,
          });
        }
        await loadCandidates(true);
      } catch (reviewError) {
        setError(
          reviewError instanceof Error ? reviewError.message : 'Failed to review candidate.'
        );
      } finally {
        setIsReviewing(false);
      }
    },
    [loadCandidates]
  );

  return (
    <InboxPageView
      candidates={candidates}
      selectedCandidate={selectedCandidate}
      isLoading={isLoading}
      error={error}
      filters={filters}
      isRefreshing={isRefreshing}
      isReviewing={isReviewing}
      onSelectCandidate={(candidate) => setSelectedCandidateId(candidate.id)}
      onQueryChange={(query) => setFilters((current) => ({ ...current, query }))}
      onCandidateStatusChange={(candidateStatus) =>
        setFilters((current) => ({ ...current, candidateStatus }))
      }
      onDistillationStatusChange={(distillationStatus) =>
        setFilters((current) => ({ ...current, distillationStatus }))
      }
      onRefresh={() => {
        void loadCandidates(true);
      }}
      onPromote={(candidate) => {
        void applyReview(candidate, 'promote');
      }}
      onReject={(candidate) => {
        void applyReview(candidate, 'reject');
      }}
      onArchive={(candidate) => {
        void applyReview(candidate, 'archive');
      }}
      onRetryCandidate={() => {
        void loadCandidates(true);
      }}
      onClose={onClose}
    />
  );
}
