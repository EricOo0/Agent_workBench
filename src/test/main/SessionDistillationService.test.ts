import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  KnowledgeCandidateRecord,
  KnowledgeCandidateInput,
  SessionDistillationRecord,
  SessionDistillationUpsert,
  SessionRuntimeStatsRecord,
} from '../../main/services/DatabaseService';
import type { Conversation, Message, Task } from '../../main/services/DatabaseService';
import type { TerminalSnapshotPayload } from '../../main/types/terminalSnapshot';

vi.mock('../../main/services/DatabaseService', () => ({
  databaseService: {},
}));

vi.mock('../../main/services/TerminalSnapshotService', () => ({
  terminalSnapshotService: {
    getSnapshot: vi.fn(),
  },
}));

vi.mock('../../main/lib/logger', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  SessionDistillationService,
  type DistillationSource,
} from '../../main/services/SessionDistillationService';

describe('SessionDistillationService', () => {
  const getSessionDistillationSource = vi.fn<() => Promise<DistillationSource | null>>();
  const upsertSessionDistillation = vi.fn<
    (record: SessionDistillationUpsert) => Promise<SessionDistillationRecord>
  >(async (record) => ({
    id: record.id,
    taskId: record.taskId,
    sessionId: record.sessionId,
    provider: record.provider ?? null,
    status: record.status,
    promptVersion: record.promptVersion ?? null,
    startedAt: record.startedAt,
    updatedAt: record.updatedAt ?? 5_000,
    finishedAt: record.finishedAt ?? null,
    errorMessage: record.errorMessage ?? null,
    rawResponse: record.rawResponse ?? null,
    summaryMarkdown: record.summaryMarkdown ?? null,
    finalConclusion: record.finalConclusion ?? null,
    evidenceRefs: record.evidenceRefs ?? [],
    createdAt: record.createdAt ?? 5_000,
  }));
  const insertKnowledgeCandidates = vi.fn<
    (records: KnowledgeCandidateInput[]) => Promise<KnowledgeCandidateRecord[]>
  >(async (records) =>
    records.map((record) => ({
      id: record.id,
      taskId: record.taskId,
      sessionId: record.sessionId,
      distillationId: record.distillationId ?? null,
      status: record.status ?? 'new',
      title: record.title,
      cardKind: record.cardKind,
      summary: record.summary,
      bodyMarkdown: record.bodyMarkdown ?? null,
      sourceCount: record.sourceCount ?? record.evidenceRefs?.length ?? 0,
      confidence: record.confidence ?? null,
      evidenceRefs: record.evidenceRefs ?? [],
      tags: record.tags ?? [],
      reviewedAt: record.reviewedAt ?? null,
      reviewedBy: record.reviewedBy ?? null,
      promotedCardId: record.promotedCardId ?? null,
      archivedAt: record.archivedAt ?? null,
      createdAt: record.createdAt ?? 5_000,
      updatedAt: record.updatedAt ?? 5_000,
    }))
  );
  const runPrompt =
    vi.fn<
      (args: {
        providerId: string;
        task: Task;
        session: SessionRuntimeStatsRecord;
        prompt: string;
      }) => Promise<string>
    >();

  let service: SessionDistillationService;

  const baseTask: Task = {
    id: 'task-1',
    projectId: 'project-1',
    name: 'Task One',
    branch: 'feat/task-one',
    path: '/tmp/task-1',
    status: 'idle',
    agentId: 'codex',
    metadata: null,
    useWorktree: true,
    archivedAt: null,
    createdAt: '2026-03-26T00:00:00.000Z',
    updatedAt: '2026-03-26T00:00:00.000Z',
  };

  const baseSession: SessionRuntimeStatsRecord = {
    id: 'codex-main-task-1',
    taskId: 'task-1',
    sessionId: 'codex-main-task-1',
    provider: 'codex',
    status: 'ended',
    startedAt: 1_000,
    endedAt: 2_000,
    activeDurationMs: 900,
    idleDurationMs: 100,
    inputTokens: 0,
    outputTokens: 0,
    usageMetadata: null,
    createdAt: 1_000,
    updatedAt: 2_000,
  };

  const baseSnapshot: TerminalSnapshotPayload = {
    version: 1,
    createdAt: '2026-03-26T00:10:00.000Z',
    cols: 120,
    rows: 30,
    data: 'Implemented a reusable JSON parser.\nAdded tests for malformed output.\n',
    stats: { bytes: 72 },
  };

  const baseConversations: Conversation[] = [
    {
      id: 'conv-1',
      taskId: 'task-1',
      title: 'Default Conversation',
      provider: 'codex',
      isActive: true,
      isMain: true,
      displayOrder: 0,
      metadata: null,
      createdAt: '2026-03-26T00:00:00.000Z',
      updatedAt: '2026-03-26T00:10:00.000Z',
    },
  ];

  const baseMessages: Message[] = [
    {
      id: 'msg-1',
      conversationId: 'conv-1',
      sender: 'user',
      content: 'Please summarize the parser work and edge cases.',
      timestamp: '2026-03-26T00:01:00.000Z',
    },
    {
      id: 'msg-2',
      conversationId: 'conv-1',
      sender: 'agent',
      content: 'Added coverage for malformed structured output and candidate evidence refs.',
      timestamp: '2026-03-26T00:02:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    getSessionDistillationSource.mockResolvedValue({
      task: baseTask,
      session: baseSession,
      snapshot: baseSnapshot,
      conversations: baseConversations,
      messagesByConversationId: {
        'conv-1': baseMessages,
      },
    });

    service = new SessionDistillationService({
      persistence: {
        getSessionDistillationSource,
        upsertSessionDistillation,
        insertKnowledgeCandidates,
      },
      runner: {
        runPrompt,
      },
      now: () => 5_000,
      randomId: (() => {
        let index = 0;
        return (prefix: string) => `${prefix}-${++index}`;
      })(),
    });
  });

  it('transitions queued -> running -> succeeded', async () => {
    runPrompt.mockResolvedValue(
      JSON.stringify({
        summary_markdown: '## Summary\n\nParser and tests landed.',
        final_conclusion: 'Ready for review.',
        candidates: [
          {
            title: 'Structured output parsing',
            card_kind: 'implementation',
            summary: 'Handle strict JSON and fallback extraction.',
            body_markdown: '- strict parse\n- repair parse',
            confidence: 0.88,
            tags: ['parser', 'json'],
            evidence_refs: [
              {
                id: 'msg-2',
                kind: 'message',
                title: 'Conversation evidence',
              },
            ],
          },
        ],
      })
    );

    await service.runDistillationForSession('codex-main-task-1');

    expect(upsertSessionDistillation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'distillation-1',
        sessionId: 'codex-main-task-1',
        taskId: 'task-1',
        provider: 'codex',
        status: 'queued',
      })
    );
    expect(upsertSessionDistillation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: 'distillation-1',
        status: 'running',
        promptVersion: 'session-distillation.v1',
      })
    );
    expect(upsertSessionDistillation).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        id: 'distillation-1',
        status: 'succeeded',
        finishedAt: 5_000,
        summaryMarkdown: '## Summary\n\nParser and tests landed.',
        finalConclusion: 'Ready for review.',
        rawResponse: expect.stringContaining('"summary_markdown"'),
      })
    );
    expect(insertKnowledgeCandidates).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'candidate-2',
        taskId: 'task-1',
        sessionId: 'codex-main-task-1',
        distillationId: 'distillation-1',
        title: 'Structured output parsing',
        cardKind: 'implementation',
        summary: 'Handle strict JSON and fallback extraction.',
      }),
    ]);
  });

  it('transitions queued -> running -> failed when the runner throws', async () => {
    runPrompt.mockRejectedValue(new Error('provider unavailable'));

    await service.runDistillationForSession('codex-main-task-1');

    expect(insertKnowledgeCandidates).not.toHaveBeenCalled();
    expect(upsertSessionDistillation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'distillation-1',
        status: 'failed',
        finishedAt: 5_000,
        errorMessage: 'provider unavailable',
      })
    );
  });

  it('uses graceful fallback for malformed structured output wrapped in prose', async () => {
    runPrompt.mockResolvedValue(`Here is the result:

\`\`\`json
{
  "summary_markdown": "## Summary\\n\\nRecovered from fenced JSON.",
  "final_conclusion": "Fallback parser succeeded.",
  "candidates": [
    {
      "title": "Fallback extraction",
      "card_kind": "decision",
      "summary": "Recover JSON from surrounding prose.",
      "evidence_refs": [{ "id": "msg-1", "kind": "message" }]
    }
  ]
}
\`\`\`
`);

    await service.runDistillationForSession('codex-main-task-1');

    expect(upsertSessionDistillation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'succeeded',
        finalConclusion: 'Fallback parser succeeded.',
      })
    );
    expect(insertKnowledgeCandidates).toHaveBeenCalledWith([
      expect.objectContaining({
        title: 'Fallback extraction',
        summary: 'Recover JSON from surrounding prose.',
      }),
    ]);
  });

  it('stores evidence refs on both the distillation and generated candidates', async () => {
    runPrompt.mockResolvedValue(
      JSON.stringify({
        summary_markdown: '## Summary\n\nEvidence preserved.',
        final_conclusion: 'Evidence refs stored.',
        evidence_refs: [
          { id: 'codex-main-task-1', kind: 'session', title: 'Session' },
          { id: 'msg-2', kind: 'message', title: 'Agent message' },
        ],
        candidates: [
          {
            title: 'Evidence-backed candidate',
            card_kind: 'implementation',
            summary: 'Carries message refs into storage.',
            evidence_refs: [
              { id: 'msg-2', kind: 'message', title: 'Agent message' },
              { id: 'conv-1', kind: 'conversation', title: 'Default Conversation' },
            ],
          },
        ],
      })
    );

    await service.runDistillationForSession('codex-main-task-1');

    expect(upsertSessionDistillation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        evidenceRefs: [
          expect.objectContaining({ id: 'codex-main-task-1', kind: 'session' }),
          expect.objectContaining({ id: 'msg-2', kind: 'message' }),
        ],
      })
    );
    expect(insertKnowledgeCandidates).toHaveBeenCalledWith([
      expect.objectContaining({
        evidenceRefs: [
          expect.objectContaining({ id: 'msg-2', kind: 'message' }),
          expect.objectContaining({ id: 'conv-1', kind: 'conversation' }),
        ],
        sourceCount: 2,
      }),
    ]);
  });

  it('marks the distillation failed after unrecoverable parse errors', async () => {
    runPrompt.mockResolvedValue('not json and no recoverable object');

    await service.runDistillationForSession('codex-main-task-1');

    expect(insertKnowledgeCandidates).not.toHaveBeenCalled();
    expect(upsertSessionDistillation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorMessage: expect.stringContaining('Unable to parse structured distillation output'),
        rawResponse: 'not json and no recoverable object',
      })
    );
  });
});
