import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  KnowledgeCandidate,
  KnowledgeInboxFilters,
  KnowledgeOverviewPayload,
} from '@shared/knowledge/types';
import { knowledgeApi } from '@/lib/knowledgeApi';
import { cn } from '@/lib/utils';
import { getKnowledgeTaskIdFromSessionId } from '@/lib/knowledgeSessionRouting';

export type OverviewRange = '7d' | '30d';

export interface OverviewStats {
  activeSessions: number;
  activeTasks: number;
  distilledToday: number;
  inboxPending: number;
  promotedCards: number;
  tokenUsageTotal: number | null;
  agentActiveHours: number;
}

export interface OverviewRecentSession {
  sessionId: string;
  title: string;
  summary: string;
  statusLabel: string;
  scoreLabel: string;
  updatedAt: number;
  hasPromotedCard: boolean;
}

export interface OverviewPageViewProps {
  isLoading: boolean;
  error: string | null;
  isRefreshing: boolean;
  range: OverviewRange;
  stats: OverviewStats;
  recentSessions: OverviewRecentSession[];
  onRangeChange: (range: OverviewRange) => void;
  onRefresh: () => void;
  onOpenInbox: (sessionId: string) => void;
  onOpenKnowledge: (sessionId: string) => void;
  onOpenSession: (sessionId: string) => void;
  onClose?: (() => void) | null;
}

interface OverviewPageProps {
  onClose?: (() => void) | null;
  onOpenInbox?: (sessionId: string) => void;
  onOpenKnowledge?: (sessionId: string) => void;
  onOpenSession?: (sessionId: string) => void;
}

type UnknownRecord = Record<string, unknown>;

const rangeOptions: OverviewRange[] = ['7d', '30d'];

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatMetricNumber(value: number | null): string {
  return value === null ? 'N/A' : formatNumber(value);
}

function formatHours(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toFixed(rounded % 1 === 0 ? 0 : 1)}h`;
}

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

function startOfToday(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function getRangeStart(range: OverviewRange, now: number): number {
  const days = range === '7d' ? 7 : 30;
  return now - days * 24 * 60 * 60 * 1000;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readNumericValue(source: unknown, keys: string[]): number | null {
  if (!isRecord(source)) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function getRangeSnapshot(source: unknown, range: OverviewRange): UnknownRecord | null {
  if (!isRecord(source)) return null;
  const direct = source[range];
  if (isRecord(direct)) return direct;
  const ranges = source.ranges;
  if (isRecord(ranges) && isRecord(ranges[range])) {
    return ranges[range] as UnknownRecord;
  }
  const snapshots = source.rangeSnapshots;
  if (isRecord(snapshots) && isRecord(snapshots[range])) {
    return snapshots[range] as UnknownRecord;
  }
  return null;
}

function extractUsageMetrics(overview: KnowledgeOverviewPayload, range: OverviewRange) {
  const root = overview as unknown;
  const rangeSnapshot = getRangeSnapshot(root, range);
  const usage = isRecord(root) ? root.usage : null;
  const rangeUsage = rangeSnapshot?.usage;
  const runtime = isRecord(root) ? root.runtime : null;
  const rangeRuntime = rangeSnapshot?.runtime;

  const tokenUsageTotal =
    readNumericValue(rangeSnapshot, ['tokenUsageTotal', 'tokensUsed', 'totalTokens']) ??
    readNumericValue(rangeUsage, ['tokenUsageTotal', 'tokensUsed', 'totalTokens']) ??
    readNumericValue(root, ['tokenUsageTotal', 'tokensUsed', 'totalTokens']) ??
    readNumericValue(usage, ['tokenUsageTotal', 'tokensUsed', 'totalTokens']) ??
    overview.tokenUsageTotal ??
    null;

  const activeDurationMs =
    readNumericValue(rangeSnapshot, ['activeDurationMs', 'agentActiveDurationMs']) ??
    readNumericValue(rangeRuntime, ['activeDurationMs', 'agentActiveDurationMs']) ??
    readNumericValue(root, ['activeDurationMs', 'agentActiveDurationMs']) ??
    readNumericValue(runtime, ['activeDurationMs', 'agentActiveDurationMs']) ??
    overview.agentActiveDurationMs ??
    0;

  return {
    tokenUsageTotal,
    agentActiveHours: activeDurationMs > 0 ? activeDurationMs / (60 * 60 * 1000) : 0,
  };
}

function buildKnowledgeFilters(): KnowledgeInboxFilters {
  return {};
}

function deriveRecentSessions(
  candidates: KnowledgeCandidate[],
  range: OverviewRange,
  now: number
): OverviewRecentSession[] {
  const rangeStart = getRangeStart(range, now);

  return candidates
    .filter((candidate) => candidate.updatedAt >= rangeStart)
    .sort((left, right) => {
      const promotedDelta =
        Number(Boolean(right.promotedCardId)) - Number(Boolean(left.promotedCardId));
      if (promotedDelta !== 0) return promotedDelta;
      const sourceDelta = right.sourceCount - left.sourceCount;
      if (sourceDelta !== 0) return sourceDelta;
      return right.updatedAt - left.updatedAt;
    })
    .slice(0, 5)
    .map((candidate) => ({
      sessionId: candidate.sessionId,
      title: candidate.title,
      summary: candidate.summary,
      statusLabel: candidate.promotedCardId ? 'Promoted' : candidate.status,
      scoreLabel: `${candidate.sourceCount} source${candidate.sourceCount === 1 ? '' : 's'}`,
      updatedAt: candidate.updatedAt,
      hasPromotedCard: Boolean(candidate.promotedCardId),
    }));
}

export function deriveStats(
  overview: KnowledgeOverviewPayload | null,
  candidates: KnowledgeCandidate[],
  range: OverviewRange,
  now: number
): OverviewStats {
  const rangeStart = getRangeStart(range, now);
  const todayStart = startOfToday(now);
  const scopedCandidates = candidates.filter((candidate) => candidate.updatedAt >= rangeStart);
  const usage = overview
    ? extractUsageMetrics(overview, range)
    : { tokenUsageTotal: null, agentActiveHours: 0 };

  return {
    activeSessions: overview?.overviewStats.activeSessions ?? 0,
    activeTasks: overview?.activeTaskCount ?? 0,
    distilledToday: scopedCandidates.filter(
      (candidate) =>
        candidate.updatedAt >= todayStart && candidate.distillation?.status === 'succeeded'
    ).length,
    inboxPending: scopedCandidates.filter(
      (candidate) => candidate.status === 'new' || candidate.status === 'reviewed'
    ).length,
    promotedCards:
      scopedCandidates.filter((candidate) => Boolean(candidate.promotedCardId)).length ||
      overview?.candidateStatusCounts.promoted ||
      0,
    tokenUsageTotal: usage.tokenUsageTotal,
    agentActiveHours: usage.agentActiveHours,
  };
}

export function OverviewPageView({
  isLoading,
  error,
  isRefreshing,
  range,
  stats,
  recentSessions,
  onRangeChange,
  onRefresh,
  onOpenInbox,
  onOpenKnowledge,
  onOpenSession,
  onClose,
}: OverviewPageViewProps) {
  const metricCards = [
    { label: 'Active sessions', value: formatNumber(stats.activeSessions) },
    { label: 'Active tasks', value: formatNumber(stats.activeTasks) },
    { label: 'Distilled today', value: formatNumber(stats.distilledToday) },
    { label: 'Inbox pending', value: formatNumber(stats.inboxPending) },
    { label: 'Promoted cards', value: formatNumber(stats.promotedCards) },
    { label: 'Tokens used', value: formatMetricNumber(stats.tokenUsageTotal) },
    { label: 'Agent active hours', value: formatHours(stats.agentActiveHours) },
  ];

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
      <div className="border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">Overview</h1>
            <p className="text-sm text-muted-foreground">
              Total knowledge snapshot for the current workspace, with local filters kept on this
              page.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-border bg-background p-1">
              {rangeOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onRangeChange(option)}
                  className={cn(
                    'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                    option === range
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
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
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {error ? (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => (
            <article key={card.label} className="rounded-xl border border-border bg-background p-4">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold">{isLoading ? '...' : card.value}</p>
            </article>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-border bg-background">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Recent high-value sessions</h2>
              <p className="text-sm text-muted-foreground">
                Prioritized sessions with stronger signal, promotion activity, or richer evidence.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {isLoading ? 'Loading sessions...' : `${recentSessions.length} session(s) in view`}
            </p>
          </div>

          <div className="divide-y divide-border">
            {recentSessions.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                No recent sessions match the current overview filter.
              </div>
            ) : (
              recentSessions.map((session) => (
                <article
                  key={session.sessionId}
                  className="flex flex-col gap-4 px-4 py-4 xl:flex-row xl:items-start xl:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full border border-border px-2 py-0.5">
                        {session.statusLabel}
                      </span>
                      <span>{session.scoreLabel}</span>
                      <span>Updated {formatTimestamp(session.updatedAt)}</span>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-medium">{session.title}</h3>
                      <p className="text-sm text-muted-foreground">{session.summary}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Session {session.sessionId} · Task{' '}
                      {getKnowledgeTaskIdFromSessionId(session.sessionId) ?? 'Unknown'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenInbox(session.sessionId)}
                      className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
                    >
                      Open Inbox
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenKnowledge(session.sessionId)}
                      className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
                    >
                      Open Knowledge
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenSession(session.sessionId)}
                      className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
                    >
                      Open Session
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function OverviewPage({
  onClose,
  onOpenInbox,
  onOpenKnowledge,
  onOpenSession,
}: OverviewPageProps) {
  const [range, setRange] = useState<OverviewRange>('7d');
  const [overview, setOverview] = useState<KnowledgeOverviewPayload | null>(null);
  const [candidates, setCandidates] = useState<KnowledgeCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async (refreshing = false) => {
    if (refreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const filters = buildKnowledgeFilters();
      const [nextOverview, nextCandidates] = await Promise.all([
        knowledgeApi.getKnowledgeOverview(filters),
        knowledgeApi.listKnowledgeCandidates(filters),
      ]);
      setOverview(nextOverview);
      setCandidates(nextCandidates);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load overview metrics.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const now = Date.now();
  const stats = useMemo(
    () => deriveStats(overview, candidates, range, now),
    [overview, candidates, range, now]
  );
  const recentSessions = useMemo(
    () => deriveRecentSessions(candidates, range, now),
    [candidates, range, now]
  );

  const handleOpenInbox = useCallback(
    (sessionId: string) => {
      if (onOpenInbox) {
        onOpenInbox(sessionId);
        return;
      }
      window.dispatchEvent(
        new CustomEvent('emdash:open-knowledge-inbox', {
          detail: { sessionId },
        })
      );
    },
    [onOpenInbox]
  );

  const handleOpenKnowledge = useCallback(
    (sessionId: string) => {
      if (onOpenKnowledge) {
        onOpenKnowledge(sessionId);
        return;
      }
      window.dispatchEvent(
        new CustomEvent('emdash:open-knowledge-library', {
          detail: { sessionId },
        })
      );
    },
    [onOpenKnowledge]
  );

  const handleOpenSession = useCallback(
    (sessionId: string) => {
      if (onOpenSession) {
        onOpenSession(sessionId);
        return;
      }
      window.dispatchEvent(
        new CustomEvent('emdash:open-knowledge-inbox', {
          detail: { sessionId },
        })
      );
    },
    [onOpenSession]
  );

  return (
    <OverviewPageView
      isLoading={isLoading}
      error={error}
      isRefreshing={isRefreshing}
      range={range}
      stats={stats}
      recentSessions={recentSessions}
      onRangeChange={setRange}
      onRefresh={() => void loadOverview(true)}
      onOpenInbox={handleOpenInbox}
      onOpenKnowledge={handleOpenKnowledge}
      onOpenSession={handleOpenSession}
      onClose={onClose}
    />
  );
}
