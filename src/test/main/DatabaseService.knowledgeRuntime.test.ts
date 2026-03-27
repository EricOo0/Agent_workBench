import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDrizzleClientMock = vi.fn();

vi.mock('../../main/db/path', () => ({
  resolveDatabasePath: () => '/tmp/emdash-knowledge-runtime-test.db',
  resolveMigrationsPath: () => '/tmp/drizzle',
}));

vi.mock('../../main/errorTracking', () => ({
  errorTracking: {
    captureDatabaseError: vi.fn(),
  },
}));

vi.mock('../../main/db/drizzleClient', () => ({
  getDrizzleClient: (...args: unknown[]) => getDrizzleClientMock(...args),
}));

import {
  DatabaseService,
  type SessionRuntimeStatsRecord,
} from '../../main/services/DatabaseService';

describe('DatabaseService knowledge runtime repair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.EMDASH_DISABLE_NATIVE_DB;
  });

  it('rewrites legacy chat runtime rows to the resolved task id during upsert', async () => {
    const sessionId = 'codex-chat-conv_chat_1';
    const existingRow = {
      id: sessionId,
      taskId: 'conv_chat_1',
      sessionId,
      provider: 'codex',
      status: 'active',
      startedAt: 100,
      endedAt: null,
      activeDurationMs: 0,
      idleDurationMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      usageMetadataJson: null,
      createdAt: 100,
      updatedAt: 100,
    };

    let updateSetValues: Record<string, unknown> | null = null;

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [existingRow],
          }),
        }),
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => {
          updateSetValues = values;
          return {
            where: () => ({
              returning: async () => [{ ...existingRow, ...values }],
            }),
          };
        },
      }),
      insert: () => ({
        values: () => ({
          returning: async () => {
            throw new Error('insert path should not be used in legacy rewrite test');
          },
        }),
      }),
    };

    getDrizzleClientMock.mockResolvedValue({ db });

    const service = new DatabaseService();
    const updated = await service.upsertSessionRuntimeStats({
      id: sessionId,
      taskId: 'task-owning-chat',
      sessionId,
      provider: 'codex',
      status: 'ended',
      startedAt: 100,
      endedAt: 200,
      activeDurationMs: 100,
      idleDurationMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      usageMetadata: null,
      updatedAt: 200,
    } satisfies SessionRuntimeStatsRecord);

    expect(updateSetValues).toEqual(
      expect.objectContaining({
        taskId: 'task-owning-chat',
      })
    );
    expect(updated.taskId).toBe('task-owning-chat');
  });
});
