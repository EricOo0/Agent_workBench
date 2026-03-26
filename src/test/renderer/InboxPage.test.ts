import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DistillationStatus, KnowledgeCandidate } from '../../shared/knowledge/types';
import {
  InboxPageView,
  type InboxPageViewProps,
} from '../../renderer/components/knowledge/InboxPage';

function buildCandidate(
  overrides: Partial<KnowledgeCandidate> = {},
  distillationStatus: DistillationStatus = 'succeeded'
): KnowledgeCandidate {
  return {
    id: 'candidate-1',
    sessionId: 'pty:codex:main:task-1',
    status: 'new',
    title: 'Persist summary cards',
    summary: 'Capture a compact summary block and surface it near task metadata.',
    sourceCount: 3,
    evidenceRefs: [
      {
        id: 'evidence-1',
        kind: 'message',
        title: 'Summary plan',
        excerpt: 'Keep the inbox review flow lightweight.',
      },
    ],
    distillation: {
      id: 'distill-1',
      sessionId: 'pty:codex:main:task-1',
      status: distillationStatus,
      startedAt: Date.UTC(2026, 2, 26, 2, 0, 0),
      updatedAt: Date.UTC(2026, 2, 26, 2, 5, 0),
      finishedAt: Date.UTC(2026, 2, 26, 2, 5, 0),
      evidenceRefs: [],
    },
    createdAt: Date.UTC(2026, 2, 26, 2, 5, 0),
    updatedAt: Date.UTC(2026, 2, 26, 2, 5, 0),
    ...overrides,
  };
}

function renderView(props: Partial<InboxPageViewProps> = {}) {
  const selectedCandidate = props.selectedCandidate ?? buildCandidate();
  const candidates = props.candidates ?? [selectedCandidate];

  return InboxPageView({
    candidates,
    selectedCandidate,
    isLoading: false,
    error: null,
    filters: {
      query: '',
      candidateStatus: 'all',
      distillationStatus: 'all',
    },
    isRefreshing: false,
    isReviewing: false,
    onSelectCandidate: vi.fn(),
    onQueryChange: vi.fn(),
    onCandidateStatusChange: vi.fn(),
    onDistillationStatusChange: vi.fn(),
    onRefresh: vi.fn(),
    onPromote: vi.fn(),
    onReject: vi.fn(),
    onArchive: vi.fn(),
    onRetryCandidate: vi.fn(),
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

describe('InboxPageView', () => {
  it('renders the candidate list', () => {
    const tree = renderView({
      candidates: [
        buildCandidate(),
        buildCandidate({
          id: 'candidate-2',
          sessionId: 'pty:codex:main:task-2',
          title: 'Track retry failures',
          summary: 'Capture retry-worthy failures in the inbox.',
        }),
      ],
    });

    const text = collectText(tree);

    expect(text).toContain('Inbox review');
    expect(text).toContain('Persist summary cards');
    expect(text).toContain('Track retry failures');
  });

  it('renders the detail panel for the selected candidate', () => {
    const tree = renderView();
    const text = collectText(tree);

    expect(text).toContain('Capture a compact summary block and surface it near task metadata.');
    expect(text).toContain('Summary plan');
    expect(text).toContain('Keep the inbox review flow lightweight.');
    expect(text).toContain('3 sources');
  });

  it('wires promote, reject, and archive actions for the selected candidate', () => {
    const onPromote = vi.fn();
    const onReject = vi.fn();
    const onArchive = vi.fn();
    const selectedCandidate = buildCandidate();
    const tree = renderView({
      selectedCandidate,
      onPromote,
      onReject,
      onArchive,
    });

    findButtonByLabel(tree, 'Promote').props.onClick();
    findButtonByLabel(tree, 'Reject').props.onClick();
    findButtonByLabel(tree, 'Archive').props.onClick();

    expect(onPromote).toHaveBeenCalledWith(selectedCandidate);
    expect(onReject).toHaveBeenCalledWith(selectedCandidate);
    expect(onArchive).toHaveBeenCalledWith(selectedCandidate);
  });

  it('shows a retry action for failed summaries', () => {
    const onRetryCandidate = vi.fn();
    const selectedCandidate = buildCandidate({}, 'failed');
    const tree = renderView({
      selectedCandidate,
      onRetryCandidate,
    });

    findButtonByLabel(tree, 'Retry').props.onClick();

    expect(onRetryCandidate).toHaveBeenCalledWith(selectedCandidate);
  });
});
