import { log } from '../lib/logger';
import { databaseService, type SessionRuntimeStatsRecord } from './DatabaseService';
import type { SessionLifecycleState } from '../../shared/knowledge/types';

type CapturePersistence = Pick<typeof databaseService, 'upsertSessionRuntimeStats'>;

export type KnowledgeSessionState = {
  id: string;
  sessionId: string;
  taskId: string;
  provider?: string | null;
  state: SessionLifecycleState;
  startedAt: number;
  endedAt: number | null;
  activeDurationMs: number;
  idleDurationMs: number;
  updatedAt: number;
  lastEventAt: number;
};

export type StartSessionArgs = {
  sessionId: string;
  taskId: string;
  provider?: string | null;
  startedAt?: number;
};

export type MarkActivityArgs = {
  at?: number;
};

export type MarkIdleArgs = {
  at?: number;
};

export type EndSessionArgs = {
  endedAt?: number;
  cause?: 'process_exit' | 'manual_kill' | 'app_quit' | 'owner_destroyed';
  exitCode?: number | null;
  signal?: number | string;
};

export class KnowledgeCaptureService {
  private readonly sessions = new Map<string, KnowledgeSessionState>();

  constructor(private readonly persistence: CapturePersistence = databaseService) {}

  async startSession(args: StartSessionArgs): Promise<KnowledgeSessionState> {
    const startedAt = args.startedAt ?? Date.now();
    const state: KnowledgeSessionState = {
      id: args.sessionId,
      sessionId: args.sessionId,
      taskId: args.taskId,
      provider: args.provider ?? null,
      state: 'active',
      startedAt,
      endedAt: null,
      activeDurationMs: 0,
      idleDurationMs: 0,
      updatedAt: startedAt,
      lastEventAt: startedAt,
    };

    this.sessions.set(args.sessionId, state);
    await this.persistState(state);
    return this.cloneState(state);
  }

  async markActivity(
    sessionId: string,
    args: MarkActivityArgs = {}
  ): Promise<KnowledgeSessionState | null> {
    const state = this.sessions.get(sessionId);
    if (!state || state.state === 'ended') return state ? this.cloneState(state) : null;

    const at = args.at ?? Date.now();
    if (state.state === 'idle') {
      state.idleDurationMs += Math.max(0, at - state.lastEventAt);
      state.state = 'active';
    }

    state.updatedAt = at;
    state.lastEventAt = at;
    await this.persistState(state);
    return this.cloneState(state);
  }

  async markIdle(
    sessionId: string,
    args: MarkIdleArgs = {}
  ): Promise<KnowledgeSessionState | null> {
    const state = this.sessions.get(sessionId);
    if (!state || state.state === 'ended') return state ? this.cloneState(state) : null;

    const at = args.at ?? Date.now();
    if (state.state === 'active') {
      state.activeDurationMs += Math.max(0, at - state.lastEventAt);
      state.state = 'idle';
    }

    state.updatedAt = at;
    state.lastEventAt = at;
    await this.persistState(state);
    return this.cloneState(state);
  }

  async endSession(
    sessionId: string,
    args: EndSessionArgs = {}
  ): Promise<KnowledgeSessionState | null> {
    const state = this.sessions.get(sessionId);
    if (!state) return null;
    if (state.state === 'ended') return this.cloneState(state);

    const endedAt = args.endedAt ?? Date.now();
    if (state.state === 'idle') {
      state.idleDurationMs += Math.max(0, endedAt - state.lastEventAt);
    } else {
      state.activeDurationMs += Math.max(0, endedAt - state.lastEventAt);
    }

    state.state = 'ended';
    state.endedAt = endedAt;
    state.updatedAt = endedAt;
    state.lastEventAt = endedAt;
    await this.persistState(state, {
      endCause: args.cause ?? null,
      exitCode: args.exitCode ?? null,
      signal: args.signal ?? null,
    });
    return this.cloneState(state);
  }

  getSessionState(sessionId: string): KnowledgeSessionState | null {
    const state = this.sessions.get(sessionId);
    return state ? this.cloneState(state) : null;
  }

  getState(sessionId: string): KnowledgeSessionState | null {
    return this.getSessionState(sessionId);
  }

  private async persistState(
    state: KnowledgeSessionState,
    usageMetadata?: Record<string, unknown> | null
  ): Promise<void> {
    const record: SessionRuntimeStatsRecord = {
      id: state.id,
      taskId: state.taskId,
      sessionId: state.sessionId,
      provider: state.provider ?? null,
      status: state.state,
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      activeDurationMs: state.activeDurationMs,
      idleDurationMs: state.idleDurationMs,
      inputTokens: 0,
      outputTokens: 0,
      usageMetadata: usageMetadata ?? null,
      updatedAt: state.updatedAt,
    };

    try {
      await this.persistence.upsertSessionRuntimeStats(record);
    } catch (error) {
      log.warn('KnowledgeCaptureService: failed to persist session runtime stats', {
        sessionId: state.sessionId,
        state: state.state,
        error: String(error),
      });
    }
  }

  private cloneState(state: KnowledgeSessionState): KnowledgeSessionState {
    return { ...state };
  }
}

export const knowledgeCaptureService = new KnowledgeCaptureService();
