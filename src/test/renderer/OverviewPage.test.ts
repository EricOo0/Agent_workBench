import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  OverviewPageView,
  type OverviewPageViewProps,
} from '../../renderer/components/knowledge/OverviewPage';

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
      tokenInput: 12400,
      tokenOutput: 8300,
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
    expect(text).toContain('Token input');
    expect(text).toContain('12,400');
    expect(text).toContain('Token output');
    expect(text).toContain('8,300');
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
});
