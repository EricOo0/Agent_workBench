import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { KnowledgeCard, KnowledgeEvidenceRef } from '@shared/knowledge/types';
import { knowledgeApi } from '@/lib/knowledgeApi';
import { cn } from '@/lib/utils';

export type SelectableKnowledgeKind = string | 'all';
export type SelectableKnowledgeTag = string | 'all';

export type KnowledgeCardListItem = KnowledgeCard & {
  cardKind?: string;
  tags?: string[];
};

export interface KnowledgePageFilters {
  query: string;
  kind: SelectableKnowledgeKind;
  tag: SelectableKnowledgeTag;
}

export interface KnowledgePageViewProps {
  cards: KnowledgeCardListItem[];
  selectedCard: KnowledgeCardListItem | null;
  isLoading: boolean;
  error: string | null;
  filters: KnowledgePageFilters;
  availableKinds: string[];
  availableTags: string[];
  isRefreshing: boolean;
  onSelectCard: (card: KnowledgeCardListItem) => void;
  onQueryChange: (value: string) => void;
  onKindChange: (value: SelectableKnowledgeKind) => void;
  onTagChange: (value: SelectableKnowledgeTag) => void;
  onRefresh: () => void;
  onOpenSourceSession: (sessionId: string) => void;
  onOpenEvidence: (evidenceRef: KnowledgeEvidenceRef) => void;
  onClose?: (() => void) | null;
}

interface KnowledgePageProps {
  onClose?: (() => void) | null;
}

const initialFilters: KnowledgePageFilters = {
  query: '',
  kind: 'all',
  tag: 'all',
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

function getEvidenceLabel(evidenceRef: KnowledgeEvidenceRef): string {
  return evidenceRef.title || evidenceRef.url || evidenceRef.kind;
}

function getEvidenceMeta(evidenceRef: KnowledgeEvidenceRef): string {
  return [evidenceRef.kind, evidenceRef.excerpt].filter(Boolean).join(' • ');
}

export function applyKnowledgeCardFilters(
  cards: KnowledgeCardListItem[],
  filters: KnowledgePageFilters
): KnowledgeCardListItem[] {
  const query = filters.query.trim().toLowerCase();

  return cards.filter((card) => {
    if (filters.kind !== 'all' && (card.cardKind || 'uncategorized') !== filters.kind) {
      return false;
    }

    if (filters.tag !== 'all' && !(card.tags || []).includes(filters.tag)) {
      return false;
    }

    if (!query) return true;

    const haystack = [
      card.title,
      card.summary,
      card.content,
      card.cardKind,
      ...(card.tags || []),
      ...card.sessionIds,
      ...card.evidenceRefs.flatMap((ref) => [ref.title, ref.excerpt, ref.url, ref.kind]),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
}

function getAvailableKinds(cards: KnowledgeCardListItem[]): string[] {
  return Array.from(
    new Set(cards.map((card) => card.cardKind).filter((value): value is string => Boolean(value)))
  ).sort((left, right) => left.localeCompare(right));
}

function getAvailableTags(cards: KnowledgeCardListItem[]): string[] {
  return Array.from(new Set(cards.flatMap((card) => card.tags || []))).sort((left, right) =>
    left.localeCompare(right)
  );
}

export function KnowledgePageView({
  cards,
  selectedCard,
  isLoading,
  error,
  filters,
  availableKinds,
  availableTags,
  isRefreshing,
  onSelectCard,
  onQueryChange,
  onKindChange,
  onTagChange,
  onRefresh,
  onOpenSourceSession,
  onOpenEvidence,
  onClose,
}: KnowledgePageViewProps) {
  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
      <div className="border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">Knowledge library</h1>
            <p className="text-sm text-muted-foreground">
              Browse promoted cards and jump back to the source context when needed.
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
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[16rem_22rem_minmax(0,1fr)]">
        <aside className="border-b border-border xl:border-b-0 xl:border-r">
          <div className="flex h-full min-h-0 flex-col gap-4 p-4">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Filters
              </p>
              <p className="text-sm text-muted-foreground">Search by card text, kind, or tag.</p>
            </div>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Search
              <input
                type="text"
                value={filters.query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search cards"
                className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Kind
              <select
                value={filters.kind}
                onChange={(event) => onKindChange(event.target.value as SelectableKnowledgeKind)}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
              >
                <option value="all">All kinds</option>
                {availableKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Tag
              <select
                value={filters.tag}
                onChange={(event) => onTagChange(event.target.value as SelectableKnowledgeTag)}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
              >
                <option value="all">All tags</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </aside>

        <div className="border-b border-border xl:border-b-0 xl:border-r">
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-border px-4 py-3 text-sm text-muted-foreground">
              {isLoading ? 'Loading cards...' : `${cards.length} card(s)`}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {error ? (
                <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                  {error}
                </div>
              ) : cards.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No cards match the current filters.
                </div>
              ) : (
                <div className="space-y-2">
                  {cards.map((card) => {
                    const selected = card.id === selectedCard?.id;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => onSelectCard(card)}
                        className={cn(
                          'flex w-full flex-col items-start rounded-lg border px-3 py-3 text-left transition-colors',
                          selected
                            ? 'border-foreground/20 bg-muted'
                            : 'border-border bg-background hover:bg-muted/70'
                        )}
                      >
                        <span className="line-clamp-1 text-sm font-medium">{card.title}</span>
                        <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {card.summary}
                        </span>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                          {card.cardKind ? (
                            <span className="rounded-full border border-border px-2 py-0.5">
                              {card.cardKind}
                            </span>
                          ) : null}
                          {(card.tags || []).slice(0, 3).map((tag) => (
                            <span
                              key={`${card.id}-${tag}`}
                              className="rounded-full border border-border px-2 py-0.5"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto p-6">
          {selectedCard ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Card detail
                    </p>
                    <h2 className="text-2xl font-semibold">{selectedCard.title}</h2>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {selectedCard.cardKind ? (
                      <span className="rounded-full border border-border px-2.5 py-1">
                        {selectedCard.cardKind}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-border px-2.5 py-1">
                      {selectedCard.status}
                    </span>
                  </div>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{selectedCard.summary}</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Context
                  </p>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-muted-foreground">Sessions</dt>
                      <dd className="max-w-[20rem] text-right">
                        {selectedCard.sessionIds.length} source session
                        {selectedCard.sessionIds.length === 1 ? '' : 's'}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-muted-foreground">Updated</dt>
                      <dd>{formatTimestamp(selectedCard.updatedAt)}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-muted-foreground">Candidate</dt>
                      <dd>{selectedCard.candidateId || 'Promoted manually'}</dd>
                    </div>
                  </dl>
                  {selectedCard.tags && selectedCard.tags.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedCard.tags.map((tag) => (
                        <span
                          key={`${selectedCard.id}-${tag}-detail`}
                          className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Actions
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenSourceSession(selectedCard.sessionIds[0])}
                      disabled={selectedCard.sessionIds.length === 0}
                      className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Open source session
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Content
                  </p>
                  <div className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-4 text-sm leading-6 text-foreground">
                    {selectedCard.content}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Evidence
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {selectedCard.evidenceRefs.length} reference
                    {selectedCard.evidenceRefs.length === 1 ? '' : 's'}
                  </span>
                </div>
                {selectedCard.evidenceRefs.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No evidence is attached to this card yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedCard.evidenceRefs.map((evidenceRef) => (
                      <button
                        key={evidenceRef.id}
                        type="button"
                        onClick={() => onOpenEvidence(evidenceRef)}
                        className="flex w-full flex-col items-start rounded-lg border border-border bg-background px-4 py-3 text-left transition-colors hover:bg-muted/70"
                      >
                        <span className="text-sm font-medium">{getEvidenceLabel(evidenceRef)}</span>
                        {getEvidenceMeta(evidenceRef) ? (
                          <span className="mt-1 text-sm text-muted-foreground">
                            {getEvidenceMeta(evidenceRef)}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              Select a card to inspect its content and source context.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function KnowledgePage({ onClose }: KnowledgePageProps) {
  const [allCards, setAllCards] = useState<KnowledgeCardListItem[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [filters, setFilters] = useState<KnowledgePageFilters>(initialFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableKinds = useMemo(() => getAvailableKinds(allCards), [allCards]);
  const availableTags = useMemo(() => getAvailableTags(allCards), [allCards]);

  const cards = useMemo(() => applyKnowledgeCardFilters(allCards, filters), [allCards, filters]);
  const selectedCard = useMemo(
    () => cards.find((card) => card.id === selectedCardId) || cards[0] || null,
    [cards, selectedCardId]
  );

  useEffect(() => {
    if (selectedCard?.id !== selectedCardId) {
      setSelectedCardId(selectedCard?.id ?? null);
    }
  }, [selectedCard, selectedCardId]);

  const loadCards = useCallback(async (refreshing = false) => {
    if (refreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const nextCards = (await knowledgeApi.listKnowledgeCards()) as KnowledgeCardListItem[];
      setAllCards(nextCards);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load knowledge cards.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const handleOpenSourceSession = useCallback((sessionId: string) => {
    window.dispatchEvent(
      new CustomEvent('emdash:open-knowledge-inbox', {
        detail: { sessionId },
      })
    );
  }, []);

  const handleOpenEvidence = useCallback((evidenceRef: KnowledgeEvidenceRef) => {
    if (evidenceRef.url) {
      window.open(evidenceRef.url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  return (
    <KnowledgePageView
      cards={cards}
      selectedCard={selectedCard}
      isLoading={isLoading}
      error={error}
      filters={filters}
      availableKinds={availableKinds}
      availableTags={availableTags}
      isRefreshing={isRefreshing}
      onSelectCard={(card) => setSelectedCardId(card.id)}
      onQueryChange={(value) => setFilters((current) => ({ ...current, query: value }))}
      onKindChange={(value) => setFilters((current) => ({ ...current, kind: value }))}
      onTagChange={(value) => setFilters((current) => ({ ...current, tag: value }))}
      onRefresh={() => void loadCards(true)}
      onOpenSourceSession={handleOpenSourceSession}
      onOpenEvidence={handleOpenEvidence}
      onClose={onClose}
    />
  );
}
