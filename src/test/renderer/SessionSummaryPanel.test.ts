import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { KnowledgeSessionSummary } from '../../shared/knowledge/types';
import { SessionSummaryPanel } from '../../renderer/components/knowledge/SessionSummaryPanel';

function renderPanel(props: React.ComponentProps<typeof SessionSummaryPanel>) {
  return renderToStaticMarkup(React.createElement(SessionSummaryPanel, props));
}

function buildSummary(overrides: Partial<KnowledgeSessionSummary> = {}): KnowledgeSessionSummary {
  return {
    sessionId: 'pty:codex:main:task-1',
    lifecycleState: 'distilled',
    distillation: {
      id: 'distill-1',
      sessionId: 'pty:codex:main:task-1',
      status: 'succeeded',
      startedAt: Date.UTC(2026, 2, 26, 2, 0, 0),
      updatedAt: Date.UTC(2026, 2, 26, 2, 5, 0),
      finishedAt: Date.UTC(2026, 2, 26, 2, 5, 0),
      evidenceRefs: [],
    },
    candidate: {
      id: 'candidate-1',
      sessionId: 'pty:codex:main:task-1',
      status: 'new',
      title: 'Persist summary cards',
      summary: 'Capture a compact summary block and surface it near task metadata.',
      sourceCount: 3,
      evidenceRefs: [],
      createdAt: Date.UTC(2026, 2, 26, 2, 5, 0),
      updatedAt: Date.UTC(2026, 2, 26, 2, 5, 0),
    },
    card: null,
    updatedAt: Date.UTC(2026, 2, 26, 2, 5, 0),
    ...overrides,
  };
}

describe('SessionSummaryPanel', () => {
  it('renders a loading state', () => {
    const markup = renderPanel({
      loading: true,
      summary: null,
      error: null,
    });

    expect(markup).toContain('Session summary');
    expect(markup).toContain('Loading summary');
  });

  it('renders a succeeded summary with preview and open inbox action', () => {
    const markup = renderPanel({
      loading: false,
      summary: buildSummary(),
      error: null,
      onOpenInbox: vi.fn(),
    });

    expect(markup).toContain('Ready');
    expect(markup).toContain('Persist summary cards');
    expect(markup).toContain('Capture a compact summary block and surface it near task metadata.');
    expect(markup).toContain('Edit prompt');
    expect(markup).toContain('Open Inbox');
  });

  it('renders a failed state with retry button', () => {
    const markup = renderPanel({
      loading: false,
      summary: buildSummary({
        lifecycleState: 'distill_failed',
        distillation: {
          id: 'distill-2',
          sessionId: 'pty:codex:main:task-1',
          status: 'failed',
          provider: 'codex',
          promptVersion: 'session-distillation.v2',
          startedAt: Date.UTC(2026, 2, 26, 3, 0, 0),
          updatedAt: Date.UTC(2026, 2, 26, 3, 2, 0),
          finishedAt: Date.UTC(2026, 2, 26, 3, 2, 0),
          errorMessage: 'Structured output parse failed',
          rawResponse: '{"unexpected":"shape"}',
          evidenceRefs: [],
        },
        candidate: null,
      }),
      error: 'Structured output parse failed',
      onRetry: vi.fn(),
    });

    expect(markup).toContain('Failed');
    expect(markup).toContain('Structured output parse failed');
    expect(markup).toContain('Edit prompt');
    expect(markup).toContain('Retry');
    expect(markup).toContain('Failure details');
    expect(markup).toContain('Provider: codex');
    expect(markup).toContain('Prompt: session-distillation.v2');
    expect(markup).toContain('Raw output');
    expect(markup).toContain('{&quot;unexpected&quot;:&quot;shape&quot;}');
  });

  it('renders candidate count when only source candidates exist', () => {
    const markup = renderPanel({
      loading: false,
      summary: buildSummary({
        candidate: {
          id: 'candidate-2',
          sessionId: 'pty:codex:main:task-1',
          status: 'reviewed',
          title: 'Knowledge candidate',
          summary: 'Candidate is waiting in the inbox.',
          sourceCount: 7,
          evidenceRefs: [],
          createdAt: Date.UTC(2026, 2, 26, 4, 0, 0),
          updatedAt: Date.UTC(2026, 2, 26, 4, 1, 0),
        },
      }),
      error: null,
    });

    expect(markup).toContain('7 candidates');
  });
});
