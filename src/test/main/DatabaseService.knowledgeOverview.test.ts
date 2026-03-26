import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDrizzleClientMock = vi.fn();

vi.mock('../../main/db/path', () => ({
  resolveDatabasePath: () => '/tmp/emdash-knowledge-overview-test.db',
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

import { DatabaseService } from '../../main/services/DatabaseService';

function makeSelectSequence(rowsByCall: unknown[][]) {
  let index = 0;
  return () => ({
    from: () => ({
      leftJoin: () => ({
        leftJoin: () => ({
          where: async () => rowsByCall[index++] ?? [],
        }),
        where: async () => rowsByCall[index++] ?? [],
      }),
      where: async () => rowsByCall[index++] ?? [],
    }),
  });
}

describe('DatabaseService knowledge overview aggregates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.EMDASH_DISABLE_NATIVE_DB;
  });

  it('excludes stale unfinished runtime rows from active session and task counts', async () => {
    const now = Date.UTC(2026, 2, 26, 12, 0, 0);
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const db = {
      select: makeSelectSequence([
        [
          {
            id: 'runtime-live-active',
            taskId: 'task-1',
            sessionId: 'codex-main-task-1',
            provider: 'codex',
            status: 'active',
            startedAt: now - 5_000,
            endedAt: null,
            activeDurationMs: 5_000,
            idleDurationMs: 0,
            inputTokens: 0,
            outputTokens: 0,
            usageMetadataJson: null,
            createdAt: now - 5_000,
            updatedAt: now - 1_000,
          },
          {
            id: 'runtime-live-idle',
            taskId: 'task-2',
            sessionId: 'claude-main-task-2',
            provider: 'claude',
            status: 'idle',
            startedAt: now - 10_000,
            endedAt: null,
            activeDurationMs: 5_000,
            idleDurationMs: 5_000,
            inputTokens: 0,
            outputTokens: 0,
            usageMetadataJson: null,
            createdAt: now - 10_000,
            updatedAt: now - 2_000,
          },
          {
            id: 'runtime-stale-active',
            taskId: 'task-stale',
            sessionId: 'codex-main-task-stale',
            provider: 'codex',
            status: 'active',
            startedAt: now - 2 * 24 * 60 * 60 * 1000,
            endedAt: null,
            activeDurationMs: 5_000,
            idleDurationMs: 0,
            inputTokens: 0,
            outputTokens: 0,
            usageMetadataJson: null,
            createdAt: now - 2 * 24 * 60 * 60 * 1000,
            updatedAt: now - 8 * 60 * 60 * 1000,
          },
        ],
        [],
        [],
        [],
      ]),
    };

    getDrizzleClientMock.mockResolvedValue({ db });

    const service = new DatabaseService();
    const overview = await service.getKnowledgeOverviewAggregates();

    expect(overview.overviewStats.activeSessions).toBe(2);
    expect(overview.overviewStats.idleSessions).toBe(1);
    expect(overview.activeTaskCount).toBe(2);
  });
});
