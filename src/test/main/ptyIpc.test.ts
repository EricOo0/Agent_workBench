import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { makePtyId } from '../../shared/ptyId';

type ExitPayload = {
  exitCode: number | null | undefined;
  signal: number | undefined;
};

type MockProc = {
  onData: (cb: (data: string) => void) => { dispose: () => void };
  onExit: (cb: (payload: ExitPayload) => void) => void;
  write: ReturnType<typeof vi.fn>;
  emitExit: (exitCode: number | null | undefined, signal?: number) => void;
  emitData: (data: string) => void;
};

const ipcHandleHandlers = new Map<string, (...args: any[]) => any>();
const ipcOnHandlers = new Map<string, (...args: any[]) => any>();
const appListeners = new Map<string, Array<() => void>>();
const ptys = new Map<string, MockProc>();
const notificationCtor = vi.fn();
const awaitSetupMock = vi.fn(async (_taskId: string) => {});
const notificationShow = vi.fn();
const telemetryCaptureMock = vi.fn();
const agentEventGetPortMock = vi.fn(() => 12345);
const agentEventGetTokenMock = vi.fn(() => 'test-hook-token');
const openCodeGetRemoteConfigDirMock = vi.fn(
  (ptyId: string) => `$HOME/.config/emdash/agent-hooks/opencode/${ptyId}`
);
const openCodeGetPluginSourceMock = vi.fn(
  () => 'export const EmdashNotifyPlugin = async () => ({ event: async () => {} });\n'
);
const clearStoredSessionMock = vi.fn();
const getStoredResumeTargetMock = vi.fn(() => null);
const markCodexSessionBoundMock = vi.fn();
const codexThreadExistsForCwdMock = vi.fn(async () => true);
const codexFindLatestRecentThreadForCwdMock = vi.fn(async () => null);
const codexFindLatestThreadForCwdMock = vi.fn(async () => null);
const knowledgeCaptureStartSessionMock = vi.fn(async () => undefined);
const knowledgeCaptureMarkActivityMock = vi.fn(async () => undefined);
const knowledgeCaptureMarkIdleMock = vi.fn(async () => undefined);
const knowledgeCaptureEndSessionMock = vi.fn(async () => undefined);
const knowledgeCaptureGetSessionStateMock = vi.fn(() => null);
const sessionDistillationRunMock = vi.fn(async () => undefined);
const getKnowledgeSessionSummaryMock = vi.fn<
  (sessionId: string) => Promise<Record<string, unknown> | null>
>(async () => null);
const listKnowledgeCandidatesMock = vi.fn<
  (filters?: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>
>(async () => []);
const promoteKnowledgeCandidateMock = vi.fn<
  (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
>(async () => null);
const rejectKnowledgeCandidateMock = vi.fn<
  (candidateId: string, reviewedBy?: string | null) => Promise<Record<string, unknown> | null>
>(async () => null);
const archiveKnowledgeCandidateMock = vi.fn<
  (candidateId: string) => Promise<Record<string, unknown> | null>
>(async () => null);
const listKnowledgeCardsMock = vi.fn<
  (filters?: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>
>(async () => []);
const getKnowledgeOverviewAggregatesMock = vi.fn<
  (filters?: Record<string, unknown>) => Promise<Record<string, unknown>>
>(async () => ({
  overviewStats: {
    totalSessions: 0,
    activeSessions: 0,
    idleSessions: 0,
    distillingSessions: 0,
    distilledSessions: 0,
    failedSessions: 0,
    lastUpdatedAt: 0,
  },
  sessionSummaryCount: 0,
  candidateCount: 0,
  cardCount: 0,
  candidateStatusCounts: {
    new: 0,
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
  updatedAt: 0,
}));
const execFileMock = vi.fn(
  (
    _cmd: string,
    _args: string[],
    _opts: any,
    cb: (err: any, stdout: string, stderr: string) => void
  ) => {
    cb(null, '', '');
  }
);
let onDirectCliExitCallback: ((id: string, cwd: string) => void) | null = null;
let lastSshPtyStartOpts: any = null;

function createMockProc(): MockProc {
  const exitHandlers: Array<(payload: ExitPayload) => void> = [];
  const dataHandlers: Array<(data: string) => void> = [];
  return {
    onData: vi.fn((cb: (data: string) => void) => {
      dataHandlers.push(cb);
      return {
        dispose: () => {
          const idx = dataHandlers.indexOf(cb);
          if (idx >= 0) dataHandlers.splice(idx, 1);
        },
      };
    }),
    onExit: (cb) => {
      exitHandlers.push(cb);
    },
    write: vi.fn(),
    emitExit: (exitCode, signal) => {
      for (const handler of exitHandlers) {
        handler({ exitCode, signal });
      }
    },
    emitData: (data: string) => {
      for (const handler of [...dataHandlers]) handler(data);
    },
  };
}

const startPtyMock = vi.fn(async ({ id }: { id: string }) => {
  const proc = createMockProc();
  ptys.set(id, proc);
  return proc;
});
const startDirectPtyMock = vi.fn(({ id, cwd }: { id: string; cwd: string }) => {
  const proc = createMockProc();
  ptys.set(id, proc);
  proc.onExit(() => {
    onDirectCliExitCallback?.(id, cwd);
  });
  return proc;
});
const startSshPtyMock = vi.fn((opts: any) => {
  const { id } = opts as { id: string };
  lastSshPtyStartOpts = opts;
  const proc = createMockProc();
  ptys.set(id, proc);
  return proc;
});
const parseShellArgsMock = vi.fn((input: string) => input.trim().split(/\s+/).filter(Boolean));
const buildProviderCliArgsMock = vi.fn((opts: any) => {
  const args: string[] = [];
  if (opts.resume && opts.resumeFlag) args.push(...parseShellArgsMock(opts.resumeFlag));
  if (opts.defaultArgs?.length) args.push(...opts.defaultArgs);
  if (opts.autoApprove && opts.autoApproveFlag) {
    args.push(...parseShellArgsMock(opts.autoApproveFlag));
  }
  if (
    opts.initialPromptFlag !== undefined &&
    !opts.useKeystrokeInjection &&
    opts.initialPrompt?.trim()
  ) {
    if (opts.initialPromptFlag) args.push(...parseShellArgsMock(opts.initialPromptFlag));
    args.push(opts.initialPrompt.trim());
  }
  return args;
});
const getProviderRuntimeCliArgsMock = vi.fn((opts: any) => {
  if (opts.providerId !== 'codex' || agentEventGetPortMock() <= 0) {
    return [];
  }
  return ['-c', 'notify=["sh","-lc","mock-codex-notify","sh"]'];
});
const resolveProviderCommandConfigMock = vi.fn();
const getPtyMock = vi.fn((id: string) => ptys.get(id));
const writePtyMock = vi.fn((id: string, data: string) => {
  ptys.get(id)?.write(data);
});
const killPtyMock = vi.fn((id: string) => {
  ptys.delete(id);
});
const removePtyRecordMock = vi.fn((id: string) => {
  ptys.delete(id);
});
const getAllWindowsMock = vi.fn(() => [
  {
    isFocused: () => false,
    webContents: { isDestroyed: () => false, send: vi.fn() },
  },
]);

vi.mock('electron', () => {
  class MockNotification {
    static isSupported = vi.fn(() => true);

    constructor(options: unknown) {
      notificationCtor(options);
    }

    show() {
      notificationShow();
    }
  }

  return {
    app: {
      on: vi.fn((event: string, cb: () => void) => {
        const list = appListeners.get(event) || [];
        list.push(cb);
        appListeners.set(event, list);
      }),
    },
    ipcMain: {
      handle: vi.fn((channel: string, cb: (...args: any[]) => any) => {
        ipcHandleHandlers.set(channel, cb);
      }),
      on: vi.fn((channel: string, cb: (...args: any[]) => any) => {
        ipcOnHandlers.set(channel, cb);
      }),
    },
    BrowserWindow: {
      getAllWindows: getAllWindowsMock,
    },
    Notification: MockNotification,
  };
});

vi.mock('../../main/services/ptyManager', () => ({
  startPty: startPtyMock,
  writePty: writePtyMock,
  resizePty: vi.fn(),
  killPty: killPtyMock,
  getPty: getPtyMock,
  getPtyKind: vi.fn(() => 'local'),
  startDirectPty: startDirectPtyMock,
  startSshPty: startSshPtyMock,
  removePtyRecord: removePtyRecordMock,
  setOnDirectCliExit: vi.fn((cb: (id: string, cwd: string) => void) => {
    onDirectCliExitCallback = cb;
  }),
  parseShellArgs: parseShellArgsMock,
  buildProviderCliArgs: buildProviderCliArgsMock,
  getProviderRuntimeCliArgs: getProviderRuntimeCliArgsMock,
  resolveProviderCommandConfig: resolveProviderCommandConfigMock,
  killTmuxSession: vi.fn(),
  getTmuxSessionName: vi.fn(() => ''),
  getPtyTmuxSessionName: vi.fn(() => ''),
  clearStoredSession: clearStoredSessionMock,
  getStoredResumeTarget: getStoredResumeTargetMock,
  markCodexSessionBound: markCodexSessionBoundMock,
}));

vi.mock('../../main/lib/logger', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../main/settings', () => ({
  getAppSettings: vi.fn(() => ({
    notifications: { enabled: true, sound: true },
  })),
}));

vi.mock('../../main/telemetry', () => ({
  capture: telemetryCaptureMock,
}));

vi.mock('../../shared/providers/registry', () => ({
  PROVIDER_IDS: ['codex', 'claude', 'opencode'],
  getProvider: vi.fn((id: string) => ({
    name: id === 'codex' ? 'Codex' : id === 'opencode' ? 'OpenCode' : 'Claude Code',
  })),
  listDetectableProviders: vi.fn(() => []),
}));

vi.mock('../../main/errorTracking', () => ({
  errorTracking: {
    captureAgentSpawnError: vi.fn(),
  },
}));

vi.mock('../../main/services/TerminalSnapshotService', () => ({
  terminalSnapshotService: {
    getSnapshot: vi.fn(),
    saveSnapshot: vi.fn(),
    deleteSnapshot: vi.fn(),
  },
}));

vi.mock('../../main/services/TerminalConfigParser', () => ({
  detectAndLoadTerminalConfig: vi.fn(),
}));

vi.mock('../../main/services/DatabaseService', () => ({
  databaseService: {
    getKnowledgeSessionSummary: getKnowledgeSessionSummaryMock,
    listKnowledgeCandidates: listKnowledgeCandidatesMock,
    promoteKnowledgeCandidate: promoteKnowledgeCandidateMock,
    rejectKnowledgeCandidate: rejectKnowledgeCandidateMock,
    archiveKnowledgeCandidate: archiveKnowledgeCandidateMock,
    listKnowledgeCards: listKnowledgeCardsMock,
    getKnowledgeOverviewAggregates: getKnowledgeOverviewAggregatesMock,
  },
}));

vi.mock('../../main/services/ClaudeConfigService', () => ({
  maybeAutoTrustForClaude: vi.fn(),
}));

vi.mock('../../main/services/KnowledgeCaptureService', () => ({
  knowledgeCaptureService: {
    startSession: knowledgeCaptureStartSessionMock,
    markActivity: knowledgeCaptureMarkActivityMock,
    markIdle: knowledgeCaptureMarkIdleMock,
    endSession: knowledgeCaptureEndSessionMock,
    getSessionState: knowledgeCaptureGetSessionStateMock,
    getState: knowledgeCaptureGetSessionStateMock,
  },
}));

vi.mock('../../main/services/SessionDistillationService', () => ({
  sessionDistillationService: {
    runDistillationForSession: sessionDistillationRunMock,
  },
}));

vi.mock('../../main/services/AgentEventService', () => ({
  agentEventService: {
    getPort: agentEventGetPortMock,
    getToken: agentEventGetTokenMock,
  },
}));

vi.mock('../../main/services/CodexSessionService', () => ({
  codexSessionService: {
    threadExistsForCwd: codexThreadExistsForCwdMock,
    findLatestRecentThreadForCwd: codexFindLatestRecentThreadForCwdMock,
    findLatestThreadForCwd: codexFindLatestThreadForCwdMock,
  },
}));

vi.mock('../../main/services/ClaudeHookService', () => ({
  ClaudeHookService: {
    writeHookConfig: vi.fn(),
    makeHookCommand: vi.fn((type: string) => `mock-hook-command-${type}`),
    mergeHookEntries: vi.fn((existing: Record<string, any>) => {
      existing.hooks = {
        Notification: [{ hooks: [{ type: 'command', command: 'mock-hook-command-notification' }] }],
        Stop: [{ hooks: [{ type: 'command', command: 'mock-hook-command-stop' }] }],
      };
      return existing;
    }),
  },
}));

vi.mock('../../main/services/OpenCodeHookService', () => ({
  OPEN_CODE_PLUGIN_FILE: 'emdash-notify.js',
  OpenCodeHookService: {
    getRemoteConfigDir: openCodeGetRemoteConfigDirMock,
    getPluginSource: openCodeGetPluginSourceMock,
  },
}));

vi.mock('../../main/services/LifecycleScriptsService', () => ({
  lifecycleScriptsService: {
    getShellSetup: vi.fn(() => undefined),
    getTmuxEnabled: vi.fn(() => false),
  },
}));

vi.mock('../../main/services/TaskLifecycleService', () => ({
  taskLifecycleService: {
    awaitSetup: (taskId: string) => awaitSetupMock(taskId),
  },
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
  execFile: execFileMock,
}));

describe('ptyIpc notification lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    ipcHandleHandlers.clear();
    ipcOnHandlers.clear();
    appListeners.clear();
    ptys.clear();
    onDirectCliExitCallback = null;
    lastSshPtyStartOpts = null;
    resolveProviderCommandConfigMock.mockReturnValue(null);
    getProviderRuntimeCliArgsMock.mockClear();
    getStoredResumeTargetMock.mockReturnValue(null);
    codexThreadExistsForCwdMock.mockResolvedValue(true);
    codexFindLatestRecentThreadForCwdMock.mockResolvedValue(null);
    codexFindLatestThreadForCwdMock.mockResolvedValue(null);
    knowledgeCaptureGetSessionStateMock.mockReturnValue(null);
    sessionDistillationRunMock.mockResolvedValue(undefined);
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });

  function createSender() {
    return {
      id: 1,
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
      once: vi.fn(),
    };
  }

  it('does not show completion notification after app quit cleanup even if exit 0 arrives', async () => {
    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const start = ipcHandleHandlers.get('pty:start');
    expect(start).toBeTypeOf('function');

    const id = makePtyId('codex', 'main', 'task-quit');
    await start!(
      { sender: createSender() },
      { id, cwd: '/tmp/task', shell: 'codex', cols: 120, rows: 32 }
    );

    const proc = ptys.get(id);
    expect(proc).toBeDefined();

    const beforeQuit = appListeners.get('before-quit')?.[0];
    expect(beforeQuit).toBeTypeOf('function');
    beforeQuit!();

    proc!.emitExit(0, undefined);

    expect(notificationCtor).not.toHaveBeenCalled();
    expect(notificationShow).not.toHaveBeenCalled();
  });

  it('injects remote init commands so provider lookup uses login shell PATH', async () => {
    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const startDirect = ipcHandleHandlers.get('pty:startDirect');
    expect(startDirect).toBeTypeOf('function');

    const id = makePtyId('claude', 'main', 'task-remote');
    await startDirect!(
      { sender: createSender() },
      {
        id,
        providerId: 'claude',
        cwd: '/tmp/task',
        remote: { connectionId: 'ssh-config:remote-alias' },
        cols: 120,
        rows: 32,
      }
    );

    expect(startSshPtyMock).toHaveBeenCalledTimes(1);
    expect(lastSshPtyStartOpts?.target).toBe('remote-alias');
    expect(lastSshPtyStartOpts?.remoteInitCommand).toContain("cd '/tmp/task'");
    expect(lastSshPtyStartOpts?.remoteInitCommand).toContain('exec');

    const proc = ptys.get(id);
    expect(proc).toBeDefined();

    proc!.emitData('user@host:~$ ');

    expect(proc!.write).toHaveBeenCalled();

    const written = (proc!.write as any).mock.calls.map((c: any[]) => c[0]).join('');
    expect(written).toContain('sh -ilc');
    expect(written).toContain('command -v');
    expect(written).toContain('claude');
  });

  it('does not show completion notification on process exit (moved to AgentEventService)', async () => {
    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const start = ipcHandleHandlers.get('pty:start');
    expect(start).toBeTypeOf('function');

    const id = makePtyId('codex', 'main', 'task-success');
    await start!(
      { sender: createSender() },
      { id, cwd: '/tmp/task', shell: 'codex', cols: 120, rows: 32 }
    );

    const proc = ptys.get(id);
    expect(proc).toBeDefined();

    proc!.emitExit(0, undefined);

    expect(notificationCtor).not.toHaveBeenCalled();
    expect(notificationShow).not.toHaveBeenCalled();
  });

  it('starts capture state when a provider CLI launches', async () => {
    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const startDirect = ipcHandleHandlers.get('pty:startDirect');
    expect(startDirect).toBeTypeOf('function');

    const id = makePtyId('codex', 'main', 'task-capture-start');
    const result = await startDirect!(
      { sender: createSender() },
      { id, providerId: 'codex', cwd: '/tmp/task', cols: 120, rows: 32 }
    );

    expect(result?.ok).toBe(true);
    expect(knowledgeCaptureStartSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: id,
        taskId: 'task-capture-start',
        provider: 'codex',
        startedAt: expect.any(Number),
      })
    );
    expect(knowledgeCaptureMarkIdleMock).not.toHaveBeenCalled();
  });

  it('keeps replacement PTY writable after direct CLI exit triggers shell respawn', async () => {
    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const startDirect = ipcHandleHandlers.get('pty:startDirect');
    const ptyInput = ipcOnHandlers.get('pty:input');
    expect(startDirect).toBeTypeOf('function');
    expect(ptyInput).toBeTypeOf('function');

    const id = makePtyId('codex', 'main', 'task-respawn');
    const sender = createSender();
    const result = await startDirect!(
      { sender },
      { id, providerId: 'codex', cwd: '/tmp/task', cols: 120, rows: 32, resume: true }
    );
    expect(result?.ok).toBe(true);

    const directProc = ptys.get(id);
    expect(directProc).toBeDefined();

    directProc!.emitExit(130, undefined);

    const replacementProc = ptys.get(id);
    expect(replacementProc).toBeDefined();
    expect(replacementProc).not.toBe(directProc);
    expect(telemetryCaptureMock).toHaveBeenCalledWith(
      'agent_run_finish',
      expect.objectContaining({ provider: 'codex' })
    );
    expect(knowledgeCaptureEndSessionMock).toHaveBeenCalledWith(
      id,
      expect.objectContaining({
        cause: 'process_exit',
        exitCode: 130,
      })
    );
    expect(knowledgeCaptureMarkIdleMock).not.toHaveBeenCalled();

    ptyInput!({}, { id, data: 'codex resume --last\r' });
    expect(replacementProc!.write).toHaveBeenCalledWith('codex resume --last\r');
  });

  it('triggers distillation asynchronously after strong process exit without blocking PTY cleanup', async () => {
    let resolveDistillation!: (value?: undefined) => void;
    sessionDistillationRunMock.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          resolveDistillation = resolve;
        })
    );

    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const startDirect = ipcHandleHandlers.get('pty:startDirect');
    expect(startDirect).toBeTypeOf('function');

    const id = makePtyId('codex', 'main', 'task-distill-exit');
    const sender = createSender();
    const result = await startDirect!(
      { sender },
      { id, providerId: 'codex', cwd: '/tmp/task', cols: 120, rows: 32 }
    );
    expect(result?.ok).toBe(true);

    const proc = ptys.get(id);
    expect(proc).toBeDefined();

    proc!.emitExit(0, undefined);

    expect(knowledgeCaptureEndSessionMock).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ cause: 'process_exit', exitCode: 0 })
    );
    expect(sessionDistillationRunMock).toHaveBeenCalledWith(id);
    expect(ptys.get(id)).toBeDefined();

    resolveDistillation();
  });

  it('ends capture state on explicit session termination', async () => {
    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const startDirect = ipcHandleHandlers.get('pty:startDirect');
    const ptyKill = ipcOnHandlers.get('pty:kill');
    expect(startDirect).toBeTypeOf('function');
    expect(ptyKill).toBeTypeOf('function');

    const id = makePtyId('claude', 'main', 'task-manual-kill');
    const result = await startDirect!(
      { sender: createSender() },
      { id, providerId: 'claude', cwd: '/tmp/task', cols: 120, rows: 32 }
    );
    expect(result?.ok).toBe(true);

    ptyKill!({}, { id });

    expect(knowledgeCaptureEndSessionMock).toHaveBeenCalledWith(
      id,
      expect.objectContaining({
        cause: 'manual_kill',
      })
    );
  });

  it('manual kill does not block session end when distillation fails', async () => {
    sessionDistillationRunMock.mockRejectedValueOnce(new Error('distillation failed'));

    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const startDirect = ipcHandleHandlers.get('pty:startDirect');
    const ptyKill = ipcOnHandlers.get('pty:kill');
    expect(startDirect).toBeTypeOf('function');
    expect(ptyKill).toBeTypeOf('function');

    const id = makePtyId('claude', 'main', 'task-manual-kill-failure');
    const result = await startDirect!(
      { sender: createSender() },
      { id, providerId: 'claude', cwd: '/tmp/task', cols: 120, rows: 32 }
    );
    expect(result?.ok).toBe(true);

    expect(() => ptyKill!({}, { id })).not.toThrow();
    expect(knowledgeCaptureEndSessionMock).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ cause: 'manual_kill' })
    );
    expect(sessionDistillationRunMock).toHaveBeenCalledWith(id);
  });

  it('still cleans up direct PTY exit when no replacement PTY exists', async () => {
    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const startDirect = ipcHandleHandlers.get('pty:startDirect');
    expect(startDirect).toBeTypeOf('function');

    const id = makePtyId('codex', 'main', 'task-no-replacement');
    const sender = createSender();
    const result = await startDirect!(
      { sender },
      { id, providerId: 'codex', cwd: '/tmp/task', cols: 120, rows: 32, resume: true }
    );
    expect(result?.ok).toBe(true);

    const directProc = ptys.get(id);
    expect(directProc).toBeDefined();

    onDirectCliExitCallback = null;
    directProc!.emitExit(130, undefined);

    expect(telemetryCaptureMock).toHaveBeenCalledWith(
      'agent_run_finish',
      expect.objectContaining({ provider: 'codex' })
    );
    expect(removePtyRecordMock).toHaveBeenCalledWith(id);
    expect(ptys.has(id)).toBe(false);
  });

  it('prunes stale exact Codex resume targets before local restart', async () => {
    getStoredResumeTargetMock.mockReturnValue('thread-stale' as any);
    codexThreadExistsForCwdMock.mockResolvedValue(false);

    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const startDirect = ipcHandleHandlers.get('pty:startDirect');
    expect(startDirect).toBeTypeOf('function');

    const id = makePtyId('codex', 'main', 'task-stale-target');
    const result = await startDirect!(
      { sender: createSender() },
      { id, providerId: 'codex', cwd: '/tmp/task', cols: 120, rows: 32, resume: true }
    );

    expect(result?.ok).toBe(true);
    expect(codexThreadExistsForCwdMock).toHaveBeenCalledWith('thread-stale', '/tmp/task');
    expect(clearStoredSessionMock).toHaveBeenCalledWith(id);
  });

  it('binds a newly started Codex PTY to an exact thread id', async () => {
    codexFindLatestRecentThreadForCwdMock.mockResolvedValue({
      id: 'thread-123',
      cwd: '/tmp/task',
      createdAt: 1,
      updatedAt: 1,
      archived: false,
    } as any);

    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const startDirect = ipcHandleHandlers.get('pty:startDirect');
    expect(startDirect).toBeTypeOf('function');

    const id = makePtyId('codex', 'main', 'task-bind-target');
    const result = await startDirect!(
      { sender: createSender() },
      { id, providerId: 'codex', cwd: '/tmp/task', cols: 120, rows: 32 }
    );

    expect(result?.ok).toBe(true);
    await vi.runAllTimersAsync();

    expect(codexFindLatestRecentThreadForCwdMock).toHaveBeenCalled();
    expect(markCodexSessionBoundMock).toHaveBeenCalledWith(id, 'thread-123', '/tmp/task');
  });

  it('binds immediately to an existing exact-cwd Codex thread before polling', async () => {
    codexFindLatestThreadForCwdMock.mockResolvedValue({
      id: 'thread-existing',
      cwd: '/tmp/task',
      createdAt: 1,
      updatedAt: 2,
      archived: false,
    } as any);

    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const startDirect = ipcHandleHandlers.get('pty:startDirect');
    expect(startDirect).toBeTypeOf('function');

    const id = makePtyId('codex', 'main', 'task-existing-thread');
    const result = await startDirect!(
      { sender: createSender() },
      { id, providerId: 'codex', cwd: '/tmp/task', cols: 120, rows: 32 }
    );

    expect(result?.ok).toBe(true);
    await vi.runAllTimersAsync();

    expect(codexFindLatestThreadForCwdMock).toHaveBeenCalledWith('/tmp/task');
    expect(codexFindLatestRecentThreadForCwdMock).not.toHaveBeenCalled();
    expect(markCodexSessionBoundMock).toHaveBeenCalledWith(id, 'thread-existing', '/tmp/task');
  });

  it('uses resolved provider config for remote invocation flags', async () => {
    resolveProviderCommandConfigMock.mockReturnValue({
      provider: {
        id: 'codex',
        name: 'Codex',
        installCommand: 'npm install -g @openai/codex',
        useKeystrokeInjection: false,
      },
      cli: 'codex-remote',
      resumeFlag: 'resume --last',
      defaultArgs: ['--model', 'gpt-5'],
      autoApproveFlag: '--dangerously-bypass-approvals-and-sandbox',
      initialPromptFlag: '',
    });

    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const startDirect = ipcHandleHandlers.get('pty:startDirect');
    expect(startDirect).toBeTypeOf('function');

    const id = makePtyId('codex', 'main', 'task-remote-custom');
    const sender = createSender();
    const result = await startDirect!(
      { sender },
      {
        id,
        providerId: 'codex',
        cwd: '/tmp/task',
        remote: { connectionId: 'ssh-config:devbox' },
        autoApprove: true,
        initialPrompt: 'hello world',
        resume: true,
      }
    );

    expect(result?.ok).toBe(true);
    expect(buildProviderCliArgsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeFlag: 'resume --last',
        autoApproveFlag: '--dangerously-bypass-approvals-and-sandbox',
      })
    );
    expect(startSshPtyMock).toHaveBeenCalledTimes(1);
    expect(lastSshPtyStartOpts?.remoteInitCommand).toContain("cd '/tmp/task'");

    const proc = ptys.get(id);
    expect(proc).toBeDefined();

    proc!.emitData('user@host:~$ ');

    expect(proc!.write).toHaveBeenCalled();
    const written = (proc!.write as any).mock.calls.map((c: any[]) => c[0]).join('');
    expect(written).toContain('command -v');
    expect(written).toContain('codex-remote');
    expect(written).toContain('resume');
    expect(written).toContain('--last');
    expect(written).toContain('--model');
    expect(written).toContain('gpt-5');
    expect(written).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(written).toContain('hello world');
  });

  it('quotes remote custom CLI tokens to prevent shell metachar expansion', async () => {
    resolveProviderCommandConfigMock.mockReturnValue({
      provider: { installCommand: undefined, useKeystrokeInjection: false },
      cli: 'codex-remote;echo',
      resumeFlag: 'resume --last',
      defaultArgs: [],
      autoApproveFlag: '--dangerously-bypass-approvals-and-sandbox',
      initialPromptFlag: '',
    });

    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const startDirect = ipcHandleHandlers.get('pty:startDirect');
    expect(startDirect).toBeTypeOf('function');

    const id = makePtyId('codex', 'main', 'task-remote-metachar');
    const sender = createSender();
    const result = await startDirect!(
      { sender },
      {
        id,
        providerId: 'codex',
        cwd: '/tmp/task',
        remote: { connectionId: 'ssh-config:devbox' },
      }
    );

    expect(result?.ok).toBe(true);
    expect(lastSshPtyStartOpts?.remoteInitCommand).toContain("cd '/tmp/task'");

    const proc = ptys.get(id);
    expect(proc).toBeDefined();

    proc!.emitData('user@host:~$ ');

    expect(proc!.write).toHaveBeenCalled();
    const written = (proc!.write as any).mock.calls.map((c: any[]) => c[0]).join('');
    expect(written).toContain('command -v');
    expect(written).toContain('codex-remote;echo');
    expect(written).toContain("'\\''codex-remote;echo'\\''");
    expect(written).not.toContain('command -v codex-remote;echo');
  });

  it('adds reverse SSH tunnel and hook env for remote pty:startDirect', async () => {
    agentEventGetPortMock.mockReturnValue(12345);
    agentEventGetTokenMock.mockReturnValue('test-hook-token');

    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const startDirect = ipcHandleHandlers.get('pty:startDirect');
    expect(startDirect).toBeTypeOf('function');

    const id = makePtyId('codex', 'main', 'task-remote-hook');
    const result = await startDirect!(
      { sender: createSender() },
      {
        id,
        providerId: 'codex',
        cwd: '/tmp/task',
        remote: { connectionId: 'ssh-config:remote-alias' },
        cols: 120,
        rows: 32,
      }
    );

    expect(result?.ok).toBe(true);

    const sshArgs: string[] = lastSshPtyStartOpts?.sshArgs ?? [];
    const dashRIndex = sshArgs.indexOf('-R');
    expect(dashRIndex).toBeGreaterThanOrEqual(0);
    const tunnelSpec = sshArgs[dashRIndex + 1];
    expect(tunnelSpec).toMatch(/^127\.0\.0\.1:\d+:127\.0\.0\.1:12345$/);

    const proc = ptys.get(id);
    expect(proc).toBeDefined();

    proc!.emitData('user@host:~$ ');

    const written = (proc!.write as any).mock.calls.map((c: any[]) => c[0]).join('');
    expect(written).toContain('export EMDASH_HOOK_PORT=');
    expect(written).toContain('export EMDASH_HOOK_TOKEN=');
    expect(written).toContain('export EMDASH_PTY_ID=');
    expect(written).toContain('test-hook-token');
    expect(written).toContain('notify=["sh","-lc","mock-codex-notify","sh"]');
  });

  it('does not add reverse tunnel when hook port is 0', async () => {
    agentEventGetPortMock.mockReturnValue(0);

    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const startDirect = ipcHandleHandlers.get('pty:startDirect');
    expect(startDirect).toBeTypeOf('function');

    const id = makePtyId('codex', 'main', 'task-remote-no-hook');
    const result = await startDirect!(
      { sender: createSender() },
      {
        id,
        providerId: 'codex',
        cwd: '/tmp/task',
        remote: { connectionId: 'ssh-config:remote-alias' },
        cols: 120,
        rows: 32,
      }
    );

    expect(result?.ok).toBe(true);

    const sshArgs: string[] = lastSshPtyStartOpts?.sshArgs ?? [];
    expect(sshArgs).not.toContain('-R');

    const proc = ptys.get(id);
    expect(proc).toBeDefined();

    proc!.emitData('user@host:~$ ');

    const written = (proc!.write as any).mock.calls.map((c: any[]) => c[0]).join('');
    expect(written).not.toContain('EMDASH_HOOK_PORT=');
    expect(written).not.toContain('mock-codex-notify');
  });

  it('writes OpenCode plugin on remote and exports OPENCODE_CONFIG_DIR', async () => {
    agentEventGetPortMock.mockReturnValue(12345);

    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const startDirect = ipcHandleHandlers.get('pty:startDirect');
    expect(startDirect).toBeTypeOf('function');

    const id = makePtyId('opencode', 'main', 'task-remote-opencode-hook');
    const result = await startDirect!(
      { sender: createSender() },
      {
        id,
        providerId: 'opencode',
        cwd: '/tmp/task',
        remote: { connectionId: 'ssh-config:remote-alias' },
        cols: 120,
        rows: 32,
      }
    );

    expect(result?.ok).toBe(true);
    expect(openCodeGetRemoteConfigDirMock).toHaveBeenCalledWith(id);
    expect(openCodeGetPluginSourceMock).toHaveBeenCalled();

    const pluginWriteCall = execFileMock.mock.calls.find(
      (c: any[]) =>
        c[0] === 'ssh' &&
        typeof c[1]?.[c[1].length - 1] === 'string' &&
        c[1][c[1].length - 1].includes('emdash-notify.js')
    );
    expect(pluginWriteCall).toBeDefined();

    const proc = ptys.get(id);
    expect(proc).toBeDefined();

    proc!.emitData('user@host:~$ ');

    const written = (proc!.write as any).mock.calls.map((c: any[]) => c[0]).join('');
    expect(written).toContain('export OPENCODE_CONFIG_DIR=');
    expect(written).toContain(`$HOME/.config/emdash/agent-hooks/opencode/${id}`);
  });

  it('writes Claude hook config on remote via ssh exec for claude provider', async () => {
    agentEventGetPortMock.mockReturnValue(12345);
    agentEventGetTokenMock.mockReturnValue('test-hook-token');

    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const startDirect = ipcHandleHandlers.get('pty:startDirect');
    expect(startDirect).toBeTypeOf('function');

    const id = makePtyId('claude', 'main', 'task-remote-claude-hook');
    const result = await startDirect!(
      { sender: createSender() },
      {
        id,
        providerId: 'claude',
        cwd: '/home/user/project',
        remote: { connectionId: 'ssh-config:remote-alias' },
        cols: 120,
        rows: 32,
      }
    );

    expect(result?.ok).toBe(true);

    const sshExecCalls = execFileMock.mock.calls.filter(
      (c: any[]) => c[0] === 'ssh' && typeof c[1]?.[c[1].length - 1] === 'string'
    );
    const hookConfigCall = sshExecCalls.find((c: any[]) => {
      const cmd = c[1][c[1].length - 1];
      return cmd.includes('settings.local.json') && cmd.includes('mkdir -p');
    });
    expect(hookConfigCall).toBeDefined();

    const proc = ptys.get(id);
    expect(proc).toBeDefined();
    const written = (proc!.write as any).mock.calls.map((c: any[]) => c[0]).join('');
    expect(written).not.toContain('settings.local.json');
  });

  it('does not write hook config on remote for non-claude provider', async () => {
    agentEventGetPortMock.mockReturnValue(12345);
    agentEventGetTokenMock.mockReturnValue('test-hook-token');

    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const startDirect = ipcHandleHandlers.get('pty:startDirect');
    expect(startDirect).toBeTypeOf('function');

    const id = makePtyId('codex', 'main', 'task-remote-codex-no-hook-config');
    const result = await startDirect!(
      { sender: createSender() },
      {
        id,
        providerId: 'codex',
        cwd: '/tmp/task',
        remote: { connectionId: 'ssh-config:remote-alias' },
        cols: 120,
        rows: 32,
      }
    );

    expect(result?.ok).toBe(true);

    const hookConfigCalls = execFileMock.mock.calls.filter(
      (c: any[]) =>
        c[0] === 'ssh' &&
        typeof c[1]?.[c[1].length - 1] === 'string' &&
        c[1][c[1].length - 1].includes('settings.local.json')
    );
    expect(hookConfigCalls).toHaveLength(0);
  });

  it('pty:startDirect waits for in-flight setup before spawning agent PTY', async () => {
    let resolveSetup!: () => void;
    const setupGate = new Promise<void>((resolve) => {
      resolveSetup = resolve;
    });
    awaitSetupMock.mockReturnValueOnce(setupGate);

    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const startDirect = ipcHandleHandlers.get('pty:startDirect');
    expect(startDirect).toBeTypeOf('function');

    const id = makePtyId('claude', 'main', 'task-setup-gate-direct');
    const handlerPromise = startDirect!(
      { sender: createSender() },
      { id, providerId: 'claude', cwd: '/tmp/task', cols: 120, rows: 32 }
    );

    expect(startDirectPtyMock).not.toHaveBeenCalled();
    expect(startPtyMock).not.toHaveBeenCalled();

    resolveSetup();
    await handlerPromise;

    expect(startDirectPtyMock).toHaveBeenCalledOnce();
  });

  it('pty:start waits for in-flight setup before spawning shell PTY', async () => {
    let resolveSetup!: () => void;
    const setupGate = new Promise<void>((resolve) => {
      resolveSetup = resolve;
    });
    awaitSetupMock.mockReturnValueOnce(setupGate);

    const { registerPtyIpc } = await import('../../main/services/ptyIpc');
    registerPtyIpc();

    const start = ipcHandleHandlers.get('pty:start');
    expect(start).toBeTypeOf('function');

    const id = makePtyId('codex', 'main', 'task-setup-gate-shell');
    const handlerPromise = start!(
      { sender: createSender() },
      { id, cwd: '/tmp/task', shell: 'codex', cols: 120, rows: 32 }
    );

    expect(startPtyMock).not.toHaveBeenCalled();

    resolveSetup();
    await handlerPromise;

    expect(startPtyMock).toHaveBeenCalledOnce();
  });
});

describe('knowledge IPC surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    ipcHandleHandlers.clear();
    ipcOnHandlers.clear();
    appListeners.clear();
    ptys.clear();
  });

  it('registers knowledge handlers from the main IPC index', async () => {
    const indexSource = readFileSync(new URL('../../main/ipc/index.ts', import.meta.url), 'utf8');
    const preloadSource = readFileSync(new URL('../../main/preload.ts', import.meta.url), 'utf8');

    expect(indexSource).toContain("import { registerKnowledgeIpc } from './knowledgeIpc';");
    expect(indexSource).toContain('registerKnowledgeIpc();');
    expect(preloadSource).toContain("ipcRenderer.invoke('knowledge:getSessionSummary'");
    expect(preloadSource).toContain("ipcRenderer.invoke('knowledge:listCandidates'");
    expect(preloadSource).toContain("ipcRenderer.invoke('knowledge:reviewCandidate'");
    expect(preloadSource).toContain("ipcRenderer.invoke('knowledge:listCards'");
    expect(preloadSource).toContain("ipcRenderer.invoke('knowledge:getOverview'");
  });

  it('returns session summary data through the knowledge session summary handler', async () => {
    const summary = {
      sessionId: 'session-1',
      lifecycleState: 'distilled',
      distillation: null,
      candidate: null,
      card: null,
      updatedAt: 123,
    };
    getKnowledgeSessionSummaryMock.mockResolvedValueOnce(summary);

    const { registerKnowledgeIpc } = await import('../../main/ipc/knowledgeIpc');
    registerKnowledgeIpc();

    const handler = ipcHandleHandlers.get('knowledge:getSessionSummary');
    expect(handler).toBeTypeOf('function');

    const result = await handler!({}, { sessionId: 'session-1' });

    expect(getKnowledgeSessionSummaryMock).toHaveBeenCalledWith('session-1');
    expect(result).toEqual({ success: true, data: summary });
  });

  it('passes candidate filters through the candidate list handler', async () => {
    const candidates = [{ id: 'cand-1', sessionId: 'session-1', status: 'new' }];
    listKnowledgeCandidatesMock.mockResolvedValueOnce(candidates as any);

    const { registerKnowledgeIpc } = await import('../../main/ipc/knowledgeIpc');
    registerKnowledgeIpc();

    const handler = ipcHandleHandlers.get('knowledge:listCandidates');
    expect(handler).toBeTypeOf('function');

    const filters = {
      query: 'cache',
      candidateStatuses: ['new'],
      limit: 10,
      offset: 5,
    };
    const result = await handler!({}, { filters });

    expect(listKnowledgeCandidatesMock).toHaveBeenCalledWith(filters);
    expect(result).toEqual({ success: true, data: candidates });
  });

  it('maps a promote review action to the promotion helper', async () => {
    const promotedCandidate = {
      id: 'cand-1',
      sessionId: 'session-1',
      status: 'promoted',
      promotedCardId: 'card-1',
    };
    promoteKnowledgeCandidateMock.mockResolvedValueOnce(promotedCandidate as any);

    const { registerKnowledgeIpc } = await import('../../main/ipc/knowledgeIpc');
    registerKnowledgeIpc();

    const handler = ipcHandleHandlers.get('knowledge:reviewCandidate');
    expect(handler).toBeTypeOf('function');

    const card = {
      id: 'card-1',
      taskId: 'task-1',
      sessionId: 'session-1',
      title: 'Cache invalidation',
      cardKind: 'decision',
      summary: 'Use tag-based invalidation',
      content: 'Promoted from candidate',
    };
    const result = await handler!({}, { candidateId: 'cand-1', action: 'promote', card });

    expect(promoteKnowledgeCandidateMock).toHaveBeenCalledWith({
      candidateId: 'cand-1',
      card,
      reviewedBy: null,
    });
    expect(rejectKnowledgeCandidateMock).not.toHaveBeenCalled();
    expect(archiveKnowledgeCandidateMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: promotedCandidate });
  });

  it('maps reject and archive review actions to their helpers', async () => {
    rejectKnowledgeCandidateMock.mockResolvedValueOnce({ id: 'cand-2', status: 'rejected' } as any);
    archiveKnowledgeCandidateMock.mockResolvedValueOnce({
      id: 'cand-3',
      status: 'archived',
    } as any);

    const { registerKnowledgeIpc } = await import('../../main/ipc/knowledgeIpc');
    registerKnowledgeIpc();

    const handler = ipcHandleHandlers.get('knowledge:reviewCandidate');
    expect(handler).toBeTypeOf('function');

    const rejectResult = await handler!(
      {},
      {
        candidateId: 'cand-2',
        action: 'reject',
        reviewedBy: 'reviewer-1',
      }
    );
    const archiveResult = await handler!({}, { candidateId: 'cand-3', action: 'archive' });

    expect(rejectKnowledgeCandidateMock).toHaveBeenCalledWith('cand-2', 'reviewer-1');
    expect(archiveKnowledgeCandidateMock).toHaveBeenCalledWith('cand-3');
    expect(rejectResult).toEqual({
      success: true,
      data: { id: 'cand-2', status: 'rejected' },
    });
    expect(archiveResult).toEqual({
      success: true,
      data: { id: 'cand-3', status: 'archived' },
    });
  });

  it('rejects promote actions that do not provide a card payload', async () => {
    const { registerKnowledgeIpc } = await import('../../main/ipc/knowledgeIpc');
    registerKnowledgeIpc();

    const handler = ipcHandleHandlers.get('knowledge:reviewCandidate');
    expect(handler).toBeTypeOf('function');

    const result = await handler!({}, { candidateId: 'cand-1', action: 'promote' });

    expect(promoteKnowledgeCandidateMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      error: 'A promotion card payload is required for promote actions.',
    });
  });

  it('passes filters through card list and overview handlers', async () => {
    const cards = [{ id: 'card-1', status: 'active' }];
    const overview = {
      overviewStats: {
        totalSessions: 2,
        activeSessions: 1,
        idleSessions: 0,
        distillingSessions: 0,
        distilledSessions: 1,
        failedSessions: 0,
        lastUpdatedAt: 456,
      },
      sessionSummaryCount: 2,
      candidateCount: 3,
      cardCount: 1,
      candidateStatusCounts: {
        new: 1,
        reviewed: 0,
        promoted: 1,
        rejected: 1,
        archived: 0,
      },
      cardStatusCounts: {
        active: 1,
        archived: 0,
      },
      distillationStatusCounts: {
        queued: 0,
        running: 0,
        succeeded: 2,
        failed: 0,
        skipped: 0,
      },
      updatedAt: 456,
    };
    listKnowledgeCardsMock.mockResolvedValueOnce(cards as any);
    getKnowledgeOverviewAggregatesMock.mockResolvedValueOnce(overview as any);

    const { registerKnowledgeIpc } = await import('../../main/ipc/knowledgeIpc');
    registerKnowledgeIpc();

    const listCards = ipcHandleHandlers.get('knowledge:listCards');
    const getOverview = ipcHandleHandlers.get('knowledge:getOverview');
    expect(listCards).toBeTypeOf('function');
    expect(getOverview).toBeTypeOf('function');

    const cardFilters = { query: 'cache', status: ['active'], limit: 5, offset: 1 };
    const overviewFilters = { query: 'cache', candidateStatuses: ['promoted'], limit: 20 };
    const listResult = await listCards!({}, { filters: cardFilters });
    const overviewResult = await getOverview!({}, { filters: overviewFilters });

    expect(listKnowledgeCardsMock).toHaveBeenCalledWith(cardFilters);
    expect(getKnowledgeOverviewAggregatesMock).toHaveBeenCalledWith(overviewFilters);
    expect(listResult).toEqual({ success: true, data: cards });
    expect(overviewResult).toEqual({ success: true, data: overview });
  });

  it('wraps knowledge IPC errors in the standard response envelope', async () => {
    listKnowledgeCandidatesMock.mockRejectedValueOnce(new Error('query failed'));

    const { registerKnowledgeIpc } = await import('../../main/ipc/knowledgeIpc');
    registerKnowledgeIpc();

    const handler = ipcHandleHandlers.get('knowledge:listCandidates');
    expect(handler).toBeTypeOf('function');

    const result = await handler!({}, { filters: { query: 'cache' } });

    expect(result).toEqual({ success: false, error: 'query failed' });
  });
});
