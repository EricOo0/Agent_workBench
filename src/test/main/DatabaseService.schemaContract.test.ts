import { beforeEach, describe, expect, it, vi } from 'vitest';
import { knowledgeCandidateStatuses, knowledgeCardStatuses } from '../../shared/knowledge/types';

vi.mock('../../main/db/path', () => ({
  resolveDatabasePath: () => '/tmp/emdash-schema-contract-test.db',
  resolveMigrationsPath: () => '/tmp/drizzle',
}));

vi.mock('../../main/errorTracking', () => ({
  errorTracking: {
    captureDatabaseError: vi.fn(),
  },
}));

vi.mock('../../main/db/drizzleClient', () => ({
  getDrizzleClient: vi.fn(),
}));

import { DatabaseSchemaMismatchError, DatabaseService } from '../../main/services/DatabaseService';

describe('DatabaseService schema contract', () => {
  let service: DatabaseService;

  beforeEach(() => {
    delete process.env.EMDASH_DISABLE_NATIVE_DB;
    service = new DatabaseService();
  });

  it('passes when all required invariants exist', async () => {
    vi.spyOn(service as any, 'tableExists').mockResolvedValue(true);
    vi.spyOn(service as any, 'tableHasColumn').mockImplementation(async (...args: unknown[]) => {
      const [tableName, columnName] = args as [string, string];
      return (
        (tableName === 'projects' && columnName === 'base_ref') ||
        (tableName === 'conversations' && columnName === 'task_id') ||
        (tableName === 'session_runtime_stats' && columnName === 'session_id') ||
        (tableName === 'session_distillations' && columnName === 'status') ||
        (tableName === 'knowledge_candidates' && columnName === 'card_kind') ||
        (tableName === 'knowledge_cards' && columnName === 'status')
      );
    });

    await expect((service as any).validateSchemaContract()).resolves.toBeUndefined();
  });

  it('throws typed mismatch error when projects.base_ref is missing', async () => {
    vi.spyOn(service as any, 'tableExists').mockResolvedValue(true);
    vi.spyOn(service as any, 'tableHasColumn').mockImplementation(async (...args: unknown[]) => {
      const [tableName, columnName] = args as [string, string];
      return tableName === 'conversations' && columnName === 'task_id';
    });

    await expect((service as any).validateSchemaContract()).rejects.toMatchObject({
      name: 'DatabaseSchemaMismatchError',
      code: 'DB_SCHEMA_MISMATCH',
      dbPath: '/tmp/emdash-schema-contract-test.db',
      missingInvariants: [
        'projects.base_ref',
        'session_runtime_stats.session_id',
        'session_distillations.status',
        'knowledge_candidates.card_kind',
        'knowledge_cards.status',
      ],
    });
  });

  it('collects multiple missing invariants', async () => {
    vi.spyOn(service as any, 'tableExists').mockImplementation(async (...args: unknown[]) => {
      const [tableName] = args as [string];
      return ![
        'tasks',
        'session_runtime_stats',
        'session_distillations',
        'knowledge_candidates',
        'knowledge_cards',
      ].includes(tableName);
    });
    vi.spyOn(service as any, 'tableHasColumn').mockResolvedValue(false);

    try {
      await (service as any).validateSchemaContract();
      throw new Error('Expected schema mismatch to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseSchemaMismatchError);
      expect((error as DatabaseSchemaMismatchError).missingInvariants).toEqual([
        'projects.base_ref',
        'tasks table',
        'conversations.task_id',
        'session_runtime_stats table',
        'session_runtime_stats.session_id',
        'session_distillations table',
        'session_distillations.status',
        'knowledge_candidates table',
        'knowledge_candidates.card_kind',
        'knowledge_cards table',
        'knowledge_cards.status',
      ]);
    }
  });

  it('anchors the shared knowledge status surface', () => {
    expect(knowledgeCandidateStatuses).toEqual([
      'new',
      'reviewed',
      'promoted',
      'rejected',
      'archived',
    ]);
    expect(knowledgeCardStatuses).toEqual(['active', 'archived']);
  });
});
