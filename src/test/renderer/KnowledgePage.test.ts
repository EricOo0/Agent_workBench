import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeCard, KnowledgeEvidenceRef } from '../../shared/knowledge/types';
import {
  KnowledgePageView,
  applyKnowledgeCardFilters,
  type KnowledgeCardListItem,
  type KnowledgePageViewProps,
} from '../../renderer/components/knowledge/KnowledgePage';

function buildEvidenceRef(overrides: Partial<KnowledgeEvidenceRef> = {}): KnowledgeEvidenceRef {
  return {
    id: 'evidence-1',
    kind: 'message',
    title: 'Decision note',
    excerpt: 'Keep the knowledge page split layout lightweight.',
    ...overrides,
  };
}

function buildCard(
  overrides: Partial<KnowledgeCardListItem> = {},
  evidenceRefs: KnowledgeEvidenceRef[] = [buildEvidenceRef()]
): KnowledgeCardListItem {
  const base: KnowledgeCard = {
    id: 'card-1',
    candidateId: 'candidate-1',
    status: 'active',
    title: 'Persist retry knowledge',
    summary: 'Capture retry heuristics as reusable cards.',
    content: 'Detailed card content about retry heuristics.',
    sessionIds: ['pty:codex:main:task-1'],
    evidenceRefs,
    createdAt: Date.UTC(2026, 2, 26, 8, 0, 0),
    updatedAt: Date.UTC(2026, 2, 26, 8, 5, 0),
  };

  return {
    ...base,
    cardKind: 'decision',
    tags: ['retry', 'stability'],
    ...overrides,
  };
}

function renderView(props: Partial<KnowledgePageViewProps> = {}) {
  const selectedCard = props.selectedCard ?? buildCard();
  const cards = props.cards ?? [selectedCard];

  return KnowledgePageView({
    cards,
    selectedCard,
    isLoading: false,
    error: null,
    filters: {
      query: '',
      kind: 'all',
      tag: 'all',
    },
    availableKinds: ['decision', 'implementation'],
    availableTags: ['retry', 'stability', 'ui'],
    isRefreshing: false,
    onSelectCard: vi.fn(),
    onQueryChange: vi.fn(),
    onKindChange: vi.fn(),
    onTagChange: vi.fn(),
    onRefresh: vi.fn(),
    onOpenSourceSession: vi.fn(),
    onOpenEvidence: vi.fn(),
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

function findLabel(node: React.ReactNode, label: string): React.ReactElement {
  const match = findElements(
    node,
    (element) => element.type === 'label' && collectText(element.props.children).includes(label)
  )[0];

  if (!match) {
    throw new Error(`Could not find label: ${label}`);
  }

  return match;
}

describe('KnowledgePageView', () => {
  it('renders the card list', () => {
    const tree = renderView({
      cards: [
        buildCard(),
        buildCard({
          id: 'card-2',
          title: 'Route inbox cards back to source sessions',
          summary: 'Add affordances to jump from a card to its source session.',
          cardKind: 'implementation',
          tags: ['routing', 'knowledge'],
        }),
      ],
    });

    const text = collectText(tree);

    expect(text).toContain('Knowledge library');
    expect(text).toContain('Persist retry knowledge');
    expect(text).toContain('Route inbox cards back to source sessions');
  });

  it('wires kind and tag filters', () => {
    const onKindChange = vi.fn();
    const onTagChange = vi.fn();
    const tree = renderView({ onKindChange, onTagChange });

    const kindLabel = findLabel(tree, 'Kind');
    const tagLabel = findLabel(tree, 'Tag');
    const kindSelect = findElements(kindLabel, (element) => element.type === 'select')[0];
    const tagSelect = findElements(tagLabel, (element) => element.type === 'select')[0];

    kindSelect.props.onChange({ target: { value: 'decision' } });
    tagSelect.props.onChange({ target: { value: 'retry' } });

    expect(onKindChange).toHaveBeenCalledWith('decision');
    expect(onTagChange).toHaveBeenCalledWith('retry');
  });

  it('wires the search input', () => {
    const onQueryChange = vi.fn();
    const tree = renderView({ onQueryChange });

    const searchLabel = findLabel(tree, 'Search');
    const input = findElements(searchLabel, (element) => element.type === 'input')[0];

    input.props.onChange({ target: { value: 'retry' } });

    expect(onQueryChange).toHaveBeenCalledWith('retry');
  });

  it('renders the detail panel for the selected card', () => {
    const tree = renderView();
    const text = collectText(tree);

    expect(text).toContain('Capture retry heuristics as reusable cards.');
    expect(text).toContain('Detailed card content about retry heuristics.');
    expect(text).toContain('decision');
    expect(text).toContain('retry');
    expect(text).toContain('stability');
  });

  it('wires the source session affordance', () => {
    const onOpenSourceSession = vi.fn();
    const selectedCard = buildCard({
      sessionIds: ['pty:codex:main:task-1', 'pty:codex:main:task-2'],
    });
    const tree = renderView({ selectedCard, onOpenSourceSession });

    findButtonByLabel(tree, 'Open source session').props.onClick();

    expect(onOpenSourceSession).toHaveBeenCalledWith('pty:codex:main:task-1');
  });

  it('keeps the card list column scrollable within the split layout', () => {
    const tree = renderView();
    const scrollableColumns = findElements(
      tree,
      (element) =>
        typeof element.props.className === 'string' &&
        element.props.className.includes('min-h-0 flex-1 overflow-y-auto p-2')
    );
    const listColumnWrappers = findElements(
      tree,
      (element) =>
        typeof element.props.className === 'string' &&
        element.props.className.includes('min-h-0 border-b border-border')
    );

    expect(scrollableColumns.length).toBeGreaterThan(0);
    expect(listColumnWrappers.length).toBeGreaterThan(0);
  });
});

describe('applyKnowledgeCardFilters', () => {
  const cards = [
    buildCard(),
    buildCard({
      id: 'card-2',
      title: 'Inbox implementation detail',
      summary: 'Renderer route handoff for knowledge inbox and library.',
      cardKind: 'implementation',
      tags: ['routing', 'ui'],
    }),
  ];

  it('filters by kind', () => {
    expect(
      applyKnowledgeCardFilters(cards, {
        query: '',
        kind: 'decision',
        tag: 'all',
      }).map((card) => card.id)
    ).toEqual(['card-1']);
  });

  it('filters by tag', () => {
    expect(
      applyKnowledgeCardFilters(cards, {
        query: '',
        kind: 'all',
        tag: 'ui',
      }).map((card) => card.id)
    ).toEqual(['card-2']);
  });

  it('filters by search query', () => {
    expect(
      applyKnowledgeCardFilters(cards, {
        query: 'renderer route',
        kind: 'all',
        tag: 'all',
      }).map((card) => card.id)
    ).toEqual(['card-2']);
  });
});
