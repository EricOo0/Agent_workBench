import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { getProvider, type ProviderId } from '../../shared/providers/registry';
import type {
  Conversation,
  KnowledgeCandidateInput,
  Message,
  SessionDistillationUpsert,
  SessionRuntimeStatsRecord,
  Task,
} from './DatabaseService';
import { databaseService } from './DatabaseService';
import { terminalSnapshotService } from './TerminalSnapshotService';
import type { TerminalSnapshotPayload } from '../types/terminalSnapshot';
import type { KnowledgeEvidenceRef } from '../../shared/knowledge/types';
import { stripAnsi } from '@shared/text/stripAnsi';
import { log } from '../lib/logger';
import { getAppSettings } from '../settings';
import { DEFAULT_KNOWLEDGE_DISTILLATION_PROMPT } from '../../shared/knowledge/distillationPrompt';

const DISTILLATION_PROMPT_VERSION = 'session-distillation.v2';
const DISTILLATION_TIMEOUT_MS = 60_000;
const MAX_SNAPSHOT_CHARS = 12_000;
const MAX_MESSAGE_CHARS = 1_500;
const MAX_MESSAGES_PER_CONVERSATION = 8;

type DistillationCandidateOutput = {
  title?: unknown;
  card_kind?: unknown;
  summary?: unknown;
  body_markdown?: unknown;
  confidence?: unknown;
  tags?: unknown;
  evidence_refs?: unknown;
};

type DistillationOutput = {
  summary_markdown?: unknown;
  final_conclusion?: unknown;
  evidence_refs?: unknown;
  candidates?: unknown;
};

type DistillationPersistence = Pick<
  typeof databaseService,
  'getSessionDistillationSource' | 'upsertSessionDistillation' | 'insertKnowledgeCandidates'
>;

type DistillationRunner = {
  runPrompt(args: {
    providerId: string;
    task: Task;
    session: SessionRuntimeStatsRecord;
    prompt: string;
  }): Promise<string>;
};

type ServiceDeps = {
  persistence?: DistillationPersistence;
  runner?: DistillationRunner;
  getSnapshot?: (sessionId: string) => Promise<TerminalSnapshotPayload | null>;
  now?: () => number;
  randomId?: (prefix: string) => string;
};

export type DistillationSource = {
  task: Task;
  session: SessionRuntimeStatsRecord;
  snapshot: TerminalSnapshotPayload | null;
  conversations: Conversation[];
  messagesByConversationId: Record<string, Message[]>;
};

export class SessionDistillationService {
  private readonly persistence: DistillationPersistence;
  private readonly runner: DistillationRunner;
  private readonly getSnapshot: (sessionId: string) => Promise<TerminalSnapshotPayload | null>;
  private readonly now: () => number;
  private readonly randomId: (prefix: string) => string;

  constructor(deps: ServiceDeps = {}) {
    this.persistence = deps.persistence ?? databaseService;
    this.runner = deps.runner ?? new CliDistillationRunner();
    this.getSnapshot =
      deps.getSnapshot ?? ((sessionId) => terminalSnapshotService.getSnapshot(sessionId));
    this.now = deps.now ?? (() => Date.now());
    this.randomId =
      deps.randomId ??
      ((prefix: string) => `${prefix}-${this.now()}-${Math.random().toString(36).slice(2, 10)}`);
  }

  async runDistillationForSession(sessionId: string): Promise<SessionDistillationUpsert | null> {
    const dbSource = await this.persistence.getSessionDistillationSource(sessionId);
    if (!dbSource) {
      log.warn('SessionDistillationService: session source unavailable', { sessionId });
      return null;
    }

    const snapshot = await this.getSnapshot(sessionId);
    const source: DistillationSource = {
      ...dbSource,
      snapshot,
    };
    const startedAt = this.now();
    const distillationId = this.randomId('distillation');
    const baseRecord = {
      id: distillationId,
      taskId: source.task.id,
      sessionId: source.session.sessionId,
      provider: source.session.provider ?? source.task.agentId ?? null,
      startedAt,
      updatedAt: startedAt,
      createdAt: startedAt,
    } satisfies Omit<SessionDistillationUpsert, 'status'>;

    await this.persistence.upsertSessionDistillation({
      ...baseRecord,
      status: 'queued',
    });

    const prompt = this.buildPrompt(source);
    await this.persistence.upsertSessionDistillation({
      ...baseRecord,
      status: 'running',
      promptVersion: DISTILLATION_PROMPT_VERSION,
      updatedAt: this.now(),
    });

    try {
      const rawResponse = await this.runner.runPrompt({
        providerId: baseRecord.provider ?? 'codex',
        task: source.task,
        session: source.session,
        prompt,
      });

      const parsed = this.parseStructuredOutput(rawResponse);
      const fallbackEvidenceRefs = this.buildSourceEvidenceRefs(source);
      const distillationEvidenceRefs = this.normalizeEvidenceRefs(
        parsed.evidence_refs,
        fallbackEvidenceRefs
      );
      const candidates = this.normalizeCandidates(
        parsed.candidates,
        source,
        distillationId,
        distillationEvidenceRefs
      );

      if (candidates.length > 0) {
        await this.persistence.insertKnowledgeCandidates(candidates);
      }

      return this.persistence.upsertSessionDistillation({
        ...baseRecord,
        status: 'succeeded',
        promptVersion: DISTILLATION_PROMPT_VERSION,
        updatedAt: this.now(),
        finishedAt: this.now(),
        rawResponse,
        summaryMarkdown: this.normalizeString(parsed.summary_markdown),
        finalConclusion: this.normalizeString(parsed.final_conclusion),
        evidenceRefs: distillationEvidenceRefs,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.persistence.upsertSessionDistillation({
        ...baseRecord,
        status: 'failed',
        promptVersion: DISTILLATION_PROMPT_VERSION,
        updatedAt: this.now(),
        finishedAt: this.now(),
        errorMessage: message,
        rawResponse: error instanceof StructuredOutputParseError ? error.rawResponse : null,
      });
    }
  }

  private buildPrompt(source: DistillationSource): string {
    const distillationPrompt =
      getAppSettings().knowledge?.distillationPrompt || DEFAULT_KNOWLEDGE_DISTILLATION_PROMPT;
    const snapshotText = source.snapshot?.data
      ? truncate(source.snapshot.data, MAX_SNAPSHOT_CHARS)
      : 'Snapshot unavailable.';
    const conversationText = source.conversations
      .map((conversation) => {
        const messages = (source.messagesByConversationId[conversation.id] ?? [])
          .slice(-MAX_MESSAGES_PER_CONVERSATION)
          .map(
            (message) =>
              `[${message.sender}] ${truncate(message.content, MAX_MESSAGE_CHARS)} (message_id=${message.id})`
          )
          .join('\n');

        return `Conversation: ${conversation.title} (conversation_id=${conversation.id})\n${messages}`;
      })
      .join('\n\n');

    return [
      `Prompt version: ${DISTILLATION_PROMPT_VERSION}`,
      `Task: ${source.task.name} (task_id=${source.task.id})`,
      `Session: ${source.session.sessionId}`,
      `Provider: ${source.session.provider ?? 'unknown'}`,
      `Active duration ms: ${source.session.activeDurationMs}`,
      `Idle duration ms: ${source.session.idleDurationMs}`,
      '',
      'Terminal snapshot:',
      snapshotText,
      '',
      'Conversation excerpts:',
      conversationText || 'No conversation messages captured.',
      '',
      distillationPrompt,
    ].join('\n');
  }

  private parseStructuredOutput(rawResponse: string): DistillationOutput {
    const strict = this.tryStrictParse(rawResponse);
    if (strict) return strict;

    const repaired = this.tryRepairParse(rawResponse);
    if (repaired) return repaired;

    throw new StructuredOutputParseError(
      'Unable to parse structured distillation output',
      rawResponse
    );
  }

  private tryStrictParse(rawResponse: string): DistillationOutput | null {
    const cleaned = stripAnsi(rawResponse, { stripOscSt: true, stripOtherEscapes: true }).trim();
    if (!cleaned) return null;

    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed.result === 'string') {
        const nested = JSON.parse(parsed.result);
        return isObject(nested) ? nested : null;
      }
      return isObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private tryRepairParse(rawResponse: string): DistillationOutput | null {
    let cleaned = stripAnsi(rawResponse, { stripOscSt: true, stripOtherEscapes: true }).trim();
    if (!cleaned) return null;

    cleaned = cleaned.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!objectMatch) return null;

    try {
      const repaired = JSON.parse(objectMatch[0]);
      return isObject(repaired) ? repaired : null;
    } catch {
      return null;
    }
  }

  private normalizeCandidates(
    value: unknown,
    source: DistillationSource,
    distillationId: string,
    fallbackEvidenceRefs: KnowledgeEvidenceRef[]
  ): KnowledgeCandidateInput[] {
    if (!Array.isArray(value)) return [];

    return value
      .filter(isObject)
      .map((candidate): KnowledgeCandidateInput | null => {
        const title = this.normalizeString(candidate.title);
        const summary = this.normalizeString(candidate.summary);
        if (!title || !summary) return null;

        const evidenceRefs = this.normalizeEvidenceRefs(
          (candidate as DistillationCandidateOutput).evidence_refs,
          fallbackEvidenceRefs
        );

        return {
          id: this.randomId('candidate'),
          taskId: source.task.id,
          sessionId: source.session.sessionId,
          distillationId,
          title,
          cardKind: this.normalizeCardKind((candidate as DistillationCandidateOutput).card_kind),
          summary,
          bodyMarkdown: this.normalizeString(
            (candidate as DistillationCandidateOutput).body_markdown
          ),
          confidence: this.normalizeConfidence(
            (candidate as DistillationCandidateOutput).confidence
          ),
          evidenceRefs,
          sourceCount: evidenceRefs.length,
          tags: this.normalizeTags((candidate as DistillationCandidateOutput).tags),
          status: 'new',
          createdAt: this.now(),
          updatedAt: this.now(),
        };
      })
      .filter((candidate): candidate is KnowledgeCandidateInput => candidate !== null);
  }

  private buildSourceEvidenceRefs(source: DistillationSource): KnowledgeEvidenceRef[] {
    const refs: KnowledgeEvidenceRef[] = [
      {
        id: source.session.sessionId,
        kind: 'session',
        title: `${source.session.provider ?? 'agent'} session`,
      },
      {
        id: source.task.id,
        kind: 'task',
        title: source.task.name,
      },
    ];

    for (const conversation of source.conversations) {
      refs.push({
        id: conversation.id,
        kind: 'conversation',
        title: conversation.title,
      });
      for (const message of source.messagesByConversationId[conversation.id] ?? []) {
        refs.push({
          id: message.id,
          kind: 'message',
          title: `${conversation.title}:${message.sender}`,
          excerpt: truncate(message.content, 240),
        });
      }
    }

    return dedupeEvidenceRefs(refs);
  }

  private normalizeEvidenceRefs(
    value: unknown,
    fallback: KnowledgeEvidenceRef[] = []
  ): KnowledgeEvidenceRef[] {
    if (!Array.isArray(value) || value.length === 0) {
      return fallback;
    }

    const refs = value
      .filter(isObject)
      .map((entry): KnowledgeEvidenceRef | null => {
        const id = this.normalizeString(entry.id);
        const kind = this.normalizeEvidenceKind(entry.kind);
        if (!id || !kind) return null;

        return {
          id,
          kind,
          title: this.normalizeString(entry.title) ?? undefined,
          excerpt: this.normalizeString(entry.excerpt) ?? undefined,
          url: this.normalizeString(entry.url) ?? undefined,
        };
      })
      .filter((entry): entry is KnowledgeEvidenceRef => entry !== null);

    return refs.length > 0 ? dedupeEvidenceRefs(refs) : fallback;
  }

  private normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeCardKind(value: unknown): string {
    const normalized = this.normalizeString(value);
    return normalized ?? 'note';
  }

  private normalizeTags(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((tag) => this.normalizeString(tag))
      .filter((tag): tag is string => Boolean(tag));
  }

  private normalizeConfidence(value: unknown): number | null {
    if (typeof value !== 'number' || Number.isNaN(value)) return null;
    return Math.max(0, Math.min(1, value));
  }

  private normalizeEvidenceKind(value: unknown): KnowledgeEvidenceRef['kind'] | null {
    switch (value) {
      case 'session':
      case 'conversation':
      case 'message':
      case 'task':
      case 'file':
      case 'note':
      case 'url':
        return value;
      default:
        return null;
    }
  }
}

class CliDistillationRunner implements DistillationRunner {
  async runPrompt(args: {
    providerId: string;
    task: Task;
    session: SessionRuntimeStatsRecord;
    prompt: string;
  }): Promise<string> {
    const providerId = args.providerId as ProviderId;
    const provider = getProvider(providerId);
    if (!provider?.cli) {
      throw new Error(`Distillation provider unavailable: ${args.providerId}`);
    }
    if (provider.useKeystrokeInjection) {
      throw new Error(
        `Distillation provider does not support non-interactive prompts: ${args.providerId}`
      );
    }

    const command = provider.cli;
    const cliArgs: string[] = [];
    let outputFilePath: string | null = null;

    if (providerId === 'claude') {
      cliArgs.push('-p', args.prompt, '--output-format', 'json');
      if (provider.autoApproveFlag) cliArgs.push(provider.autoApproveFlag);
    } else if (providerId === 'codex') {
      outputFilePath = path.join(
        os.tmpdir(),
        `emdash-distillation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.txt`
      );
      cliArgs.push('exec', '--skip-git-repo-check');
      if (provider.autoApproveFlag) cliArgs.push(provider.autoApproveFlag);
      cliArgs.push('-o', outputFilePath, args.prompt);
    } else {
      if (provider.defaultArgs?.length) cliArgs.push(...provider.defaultArgs);
      if (provider.autoApproveFlag) cliArgs.push(provider.autoApproveFlag);
      if (provider.initialPromptFlag === undefined) {
        throw new Error(`Distillation provider cannot accept inline prompts: ${args.providerId}`);
      }
      if (provider.initialPromptFlag) {
        cliArgs.push(provider.initialPromptFlag);
      }
      cliArgs.push(args.prompt);
    }

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      const child = spawn(command, cliArgs, {
        cwd: args.task.path,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
      });

      const done = (error: Error | null, output?: string) => {
        if (settled) return;
        settled = true;
        if (error) {
          reject(error);
          return;
        }
        resolve(output ?? '');
      };

      const timeout = setTimeout(() => {
        try {
          child.kill('SIGTERM');
        } catch {}
        done(new Error(`Distillation provider timed out after ${DISTILLATION_TIMEOUT_MS}ms`));
      }, DISTILLATION_TIMEOUT_MS);

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        done(error);
      });
      child.on('exit', (code, signal) => {
        clearTimeout(timeout);
        if (signal) {
          done(new Error(`Distillation provider terminated by signal ${signal}`));
          return;
        }
        if (code !== 0 && code !== null) {
          done(new Error(stderr.trim() || `Distillation provider exited with code ${code}`));
          return;
        }
        if (!outputFilePath) {
          done(null, stdout);
          return;
        }

        void fs
          .readFile(outputFilePath, 'utf8')
          .then((fileOutput) => {
            done(null, fileOutput || stdout);
          })
          .catch(() => {
            done(null, stdout);
          })
          .finally(async () => {
            try {
              await fs.unlink(outputFilePath!);
            } catch {}
          });
      });
    });
  }
}

class StructuredOutputParseError extends Error {
  constructor(
    message: string,
    readonly rawResponse: string
  ) {
    super(message);
    this.name = 'StructuredOutputParseError';
  }
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

function dedupeEvidenceRefs(refs: KnowledgeEvidenceRef[]): KnowledgeEvidenceRef[] {
  const seen = new Set<string>();
  const deduped: KnowledgeEvidenceRef[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(ref);
  }
  return deduped;
}

export const sessionDistillationService = new SessionDistillationService();
