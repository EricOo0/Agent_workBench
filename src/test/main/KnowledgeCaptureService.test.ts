import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../main/services/DatabaseService', () => ({
  databaseService: {
    upsertSessionRuntimeStats: vi.fn(async (stats) => stats),
  },
}));

import { KnowledgeCaptureService } from '../../main/services/KnowledgeCaptureService';

describe('KnowledgeCaptureService', () => {
  const upsertSessionRuntimeStats = vi.fn(async (stats) => stats);
  let service: KnowledgeCaptureService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new KnowledgeCaptureService({
      upsertSessionRuntimeStats,
    });
  });

  it('starts a session when the provider CLI launches', async () => {
    await service.startSession({
      sessionId: 'session-1',
      taskId: 'task-1',
      provider: 'codex',
      startedAt: 1_000,
    });

    expect(service.getState('session-1')).toMatchObject({
      sessionId: 'session-1',
      taskId: 'task-1',
      provider: 'codex',
      state: 'active',
      startedAt: 1_000,
      endedAt: null,
    });
    expect(upsertSessionRuntimeStats).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'session-1',
        sessionId: 'session-1',
        taskId: 'task-1',
        provider: 'codex',
        status: 'active',
        startedAt: 1_000,
        endedAt: null,
      })
    );
  });

  it('ends a session when the provider exits back to shell', async () => {
    await service.startSession({
      sessionId: 'session-2',
      taskId: 'task-2',
      provider: 'claude',
      startedAt: 2_000,
    });

    await service.endSession('session-2', {
      endedAt: 2_900,
      cause: 'process_exit',
      exitCode: 0,
    });

    expect(service.getState('session-2')).toMatchObject({
      sessionId: 'session-2',
      state: 'ended',
      startedAt: 2_000,
      endedAt: 2_900,
      activeDurationMs: 900,
      idleDurationMs: 0,
    });
    expect(upsertSessionRuntimeStats).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sessionId: 'session-2',
        status: 'ended',
        endedAt: 2_900,
        activeDurationMs: 900,
      })
    );
  });

  it('idle does not mark the session as ended', async () => {
    await service.startSession({
      sessionId: 'session-3',
      taskId: 'task-3',
      provider: 'codex',
      startedAt: 3_000,
    });

    await service.markIdle('session-3', { at: 3_450 });

    expect(service.getState('session-3')).toMatchObject({
      sessionId: 'session-3',
      state: 'idle',
      endedAt: null,
      activeDurationMs: 450,
      idleDurationMs: 0,
    });
    expect(upsertSessionRuntimeStats).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sessionId: 'session-3',
        status: 'idle',
        endedAt: null,
      })
    );
  });

  it('can close runtime stats independently of PTY destruction', async () => {
    await service.startSession({
      sessionId: 'session-4',
      taskId: 'task-4',
      provider: 'opencode',
      startedAt: 4_000,
    });
    await service.markIdle('session-4', { at: 4_250 });

    const record = await service.endSession('session-4', {
      endedAt: 4_900,
      cause: 'manual_kill',
    });

    expect(record).toMatchObject({
      sessionId: 'session-4',
      state: 'ended',
      endedAt: 4_900,
      activeDurationMs: 250,
      idleDurationMs: 650,
    });
    expect(service.getSessionState('session-4')?.state).toBe('ended');
  });
});
