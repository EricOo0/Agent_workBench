import React from 'react';
import { AlertCircle, BookOpen, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DistillationStatus, KnowledgeSessionSummary } from '@shared/knowledge/types';

type Props = {
  loading: boolean;
  summary: KnowledgeSessionSummary | null;
  error: string | null;
  onRetry?: (() => void) | null;
  onOpenInbox?: (() => void) | null;
  className?: string;
};

const statusConfig: Record<DistillationStatus, { label: string; tone: string; detail: string }> = {
  queued: {
    label: 'Queued',
    tone: 'border-slate-300 bg-slate-100 text-slate-700',
    detail: 'Summary capture is queued.',
  },
  running: {
    label: 'Running',
    tone: 'border-blue-200 bg-blue-50 text-blue-700',
    detail: 'Summary capture is in progress.',
  },
  succeeded: {
    label: 'Ready',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    detail: 'Session summary is available.',
  },
  failed: {
    label: 'Failed',
    tone: 'border-rose-200 bg-rose-50 text-rose-700',
    detail: 'Summary capture failed.',
  },
  skipped: {
    label: 'Skipped',
    tone: 'border-amber-200 bg-amber-50 text-amber-700',
    detail: 'Summary capture was skipped.',
  },
};

function formatSummaryTime(timestamp?: number | null): string | null {
  if (!timestamp) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return null;
  }
}

function getPanelState(summary: KnowledgeSessionSummary | null, error: string | null) {
  if (error) {
    return {
      label: 'Failed',
      tone: statusConfig.failed.tone,
      detail: error,
    };
  }

  const status = summary?.distillation?.status;
  if (status) {
    return statusConfig[status];
  }

  return {
    label: 'Not started',
    tone: 'border-border bg-muted text-muted-foreground',
    detail: 'No session summary has been captured yet.',
  };
}

function getPreview(summary: KnowledgeSessionSummary | null): string | null {
  const cardSummary = summary?.card?.summary?.trim();
  if (cardSummary) return cardSummary;

  const candidateSummary = summary?.candidate?.summary?.trim();
  if (candidateSummary) return candidateSummary;

  return null;
}

export const SessionSummaryPanel: React.FC<Props> = ({
  loading,
  summary,
  error,
  onRetry,
  onOpenInbox,
  className,
}) => {
  const state = getPanelState(summary, error);
  const preview = getPreview(summary);
  const summaryTime = formatSummaryTime(
    summary?.distillation?.finishedAt ??
      summary?.distillation?.updatedAt ??
      summary?.updatedAt ??
      null
  );
  const candidateCount = summary?.candidate?.sourceCount ?? 0;

  return (
    <section
      className={cn(
        'rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5',
        'supports-[backdrop-filter]:bg-background/70 supports-[backdrop-filter]:backdrop-blur',
        className
      )}
      aria-label="Session summary"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <BookOpen className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">Session summary</span>
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                state.tone
              )}
            >
              {state.label}
            </span>
            {summaryTime ? (
              <span className="text-xs text-muted-foreground">Last summary {summaryTime}</span>
            ) : null}
            {!loading && candidateCount > 0 ? (
              <span className="text-xs text-muted-foreground">
                {candidateCount} candidate{candidateCount === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading summary...</p>
          ) : error ? (
            <div className="flex items-start gap-2 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">{error}</span>
            </div>
          ) : preview ? (
            <div className="min-w-0 space-y-1">
              {summary?.candidate?.title ? (
                <p className="truncate text-sm font-medium text-foreground">
                  {summary.candidate.title}
                </p>
              ) : null}
              <p className="line-clamp-2 text-sm text-muted-foreground">{preview}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{state.detail}</p>
          )}
        </div>

        {(onRetry || onOpenInbox) && !loading ? (
          <div className="flex shrink-0 items-center gap-2">
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            ) : null}
            {onOpenInbox ? (
              <button
                type="button"
                onClick={onOpenInbox}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Open Inbox
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default SessionSummaryPanel;
