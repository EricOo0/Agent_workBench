import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  deriveStats,
  OverviewPageView,
  type OverviewPageViewProps,
} from '../../renderer/components/knowledge/OverviewPage';
import type { KnowledgeCandidate, KnowledgeOverviewPayload } from '../../shared/knowledge/types';

function renderView(props: Partial<OverviewPageViewProps> = {}) {
  return OverviewPageView({
    isLoading: false,
    error: null,
    isRefreshing: false,
    range: '7d',
    stats: {
      activeSessions: 8,
      activeTasks: 5,
      distilledToday: 3,
      inboxPending: 6,
      promotedCards: 4,
      tokenUsageTotal: 20700,
      agentActiveHours: 18.5,
    },
    recentSessions: [
      {
        sessionId: 'pty:codex:main:task-42',
        title: 'Stabilize overview route handoff',
        summary: 'Keep Overview filters local while allowing direct jumps into review flows.',
        statusLabel: 'Promoted',
        scoreLabel: 'High signal',
        updatedAt: Date.UTC(2026, 2, 26, 10, 0, 0),
        hasPromotedCard: true,
      },
    ],
    onRangeChange: vi.fn(),
    onRefresh: vi.fn(),
    onOpenInbox: vi.fn(),
    onOpenKnowledge: vi.fn(),
    onOpenSession: vi.fn(),
    onClose: vi.fn(),
    ...props,
  });
}

function collectText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((child) => collectText(child)).join('');
  if (!React.isValidElement(node)) return '';
  return collectText(node.props.children);
}

function findElements(
  node: React.ReactNode,
  predicate: (element: React.ReactElement) => boolean
): React.ReactElement[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (Array.isArray(node)) {
    return node.flatMap((child) => findElements(child, predicate));
  }
  if (!React.isValidElement(node)) return [];

  const matches = predicate(node) ? [node] : [];
  return [...matches, ...findElements(node.props.children, predicate)];
}

function findButtonByLabel(node: React.ReactNode, label: string): React.ReactElement {
  const button = findElements(
    node,
    (element) => element.type === 'button' && collectText(element.props.children).includes(label)
  )[0];

  if (!button) {
    throw new Error(`Could not find button with label: ${label}`);
  }

  return button;
}

describe('OverviewPageView', () => {
  it('renders KPI cards and usage metrics', () => {
    const tree = renderView();
    const text = collectText(tree);

    expect(text).toContain('Overview');
    expect(text).toContain('Active sessions');
    expect(text).toContain('8');
    expect(text).toContain('Active tasks');
    expect(text).toContain('5');
    expect(text).toContain('Distilled today');
    expect(text).toContain('Inbox pending');
    expect(text).toContain('Promoted cards');
    expect(text).toContain('Tokens used');
    expect(text).toContain('20,700');
    expect(text).toContain('Agent active hours');
    expect(text).toContain('18.5h');
  });

  it('wires the 7d and 30d range toggle', () => {
    const onRangeChange = vi.fn();
    const tree = renderView({ onRangeChange });

    findButtonByLabel(tree, '7d').props.onClick();
    findButtonByLabel(tree, '30d').props.onClick();

    expect(onRangeChange).toHaveBeenCalledWith('7d');
    expect(onRangeChange).toHaveBeenCalledWith('30d');
  });

  it('wires navigation to inbox, knowledge, and session from recent sessions', () => {
    const onOpenInbox = vi.fn();
    const onOpenKnowledge = vi.fn();
    const onOpenSession = vi.fn();
    const session = {
      sessionId: 'pty:codex:main:task-88',
      title: 'Promote navigation metrics',
      summary: 'Use overview cards to jump into review and source context.',
      statusLabel: 'Promoted',
      scoreLabel: 'High signal',
      updatedAt: Date.UTC(2026, 2, 26, 11, 0, 0),
      hasPromotedCard: true,
    };
    const tree = renderView({
      recentSessions: [session],
      onOpenInbox,
      onOpenKnowledge,
      onOpenSession,
    });

    findButtonByLabel(tree, 'Open Inbox').props.onClick();
    findButtonByLabel(tree, 'Open Knowledge').props.onClick();
    findButtonByLabel(tree, 'Open Session').props.onClick();

    expect(onOpenInbox).toHaveBeenCalledWith(session.sessionId);
    expect(onOpenKnowledge).toHaveBeenCalledWith(session.sessionId);
    expect(onOpenSession).toHaveBeenCalledWith(session.sessionId);
  });

  it('renders N/A when token metrics are unavailable', () => {
    const tree = renderView({
      stats: {
        activeSessions: 2,
        activeTasks: 1,
        distilledToday: 0,
        inboxPending: 0,
        promotedCards: 0,
        tokenUsageTotal: null,
        agentActiveHours: 0,
      },
    });
    const text = collectText(tree);

    expect(text).toContain('Tokens used');
    expect(text).toContain('N/A');
  });

  it('prefers aggregated active counts from live runtime rows instead of candidate inference', () => {
    const now = Date.UTC(2026, 2, 26, 12, 0, 0);
    const overview = {
      overviewStats: {
        totalSessions: 10,
        activeSessions: 3,
        idleSessions: 1,
        distillingSessions: 1,
        distilledSessions: 5,
        failedSessions: 1,
        lastUpdatedAt: now,
      },
      activeTaskCount: 2,
      sessionSummaryCount: 10,
      candidateCount: 1,
      cardCount: 0,
      candidateStatusCounts: {
        new: 1,
        reviewed: 0,
        promoted: 0,
        rejected: 0,
        archived: 0,
      },
      cardStatusCounts: {
        active: 0,
        archived: 0,
      },
      distillationStatusCounts: {
        queued: 0,
        running: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
      },
      tokenUsageTotal: null,
      agentActiveDurationMs: 0,
      updatedAt: now,
    } satisfies KnowledgeOverviewPayload;
    const staleCandidate = {
      id: 'candidate-1',
      sessionId: 'codex-main-task-stale',
      title: 'Old session',
      summary: 'Old candidate should not drive active counts.',
      sourceCount: 1,
      status: 'new',
      evidenceRefs: [],
      reviewedAt: null,
      reviewedBy: null,
      promotedCardId: null,
      archivedAt: null,
      distillation: null,
      createdAt: now - 10 * 24 * 60 * 60 * 1000,
      updatedAt: now - 10 * 24 * 60 * 60 * 1000,
    } satisfies KnowledgeCandidate;

    const stats = deriveStats(overview, [staleCandidate], '7d', now);

    expect(stats.activeSessions).toBe(3);
    expect(stats.activeTasks).toBe(2);
  });
});
