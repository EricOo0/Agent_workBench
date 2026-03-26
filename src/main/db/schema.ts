import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const sshConnections = sqliteTable(
  'ssh_connections',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    host: text('host').notNull(),
    port: integer('port').notNull().default(22),
    username: text('username').notNull(),
    authType: text('auth_type').notNull().default('agent'), // 'password' | 'key' | 'agent'
    privateKeyPath: text('private_key_path'), // optional, for key auth
    useAgent: integer('use_agent').notNull().default(0), // boolean, 0=false, 1=true
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    nameIdx: uniqueIndex('idx_ssh_connections_name').on(table.name),
    hostIdx: index('idx_ssh_connections_host').on(table.host),
  })
);

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    path: text('path').notNull(),
    gitRemote: text('git_remote'),
    gitBranch: text('git_branch'),
    baseRef: text('base_ref'),
    githubRepository: text('github_repository'),
    githubConnected: integer('github_connected').notNull().default(0),
    sshConnectionId: text('ssh_connection_id').references(() => sshConnections.id, {
      onDelete: 'set null',
    }),
    isRemote: integer('is_remote').notNull().default(0), // boolean, 0=false, 1=true
    remotePath: text('remote_path'), // path on remote server
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pathIdx: uniqueIndex('idx_projects_path').on(table.path),
    sshConnectionIdIdx: index('idx_projects_ssh_connection_id').on(table.sshConnectionId),
    isRemoteIdx: index('idx_projects_is_remote').on(table.isRemote),
  })
);

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    branch: text('branch').notNull(),
    path: text('path').notNull(),
    status: text('status').notNull().default('idle'),
    agentId: text('agent_id'),
    metadata: text('metadata'),
    useWorktree: integer('use_worktree').notNull().default(1),
    archivedAt: text('archived_at'), // null = active, timestamp = archived
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    projectIdIdx: index('idx_tasks_project_id').on(table.projectId),
  })
);

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    provider: text('provider'), // AI provider for this chat (claude, codex, qwen, etc.)
    isActive: integer('is_active').notNull().default(0), // 1 if this is the active chat for the task
    isMain: integer('is_main').notNull().default(0), // 1 if this is the main/primary chat (gets full persistence)
    displayOrder: integer('display_order').notNull().default(0), // Order in the tab bar
    metadata: text('metadata'), // JSON for additional chat-specific data
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    taskIdIdx: index('idx_conversations_task_id').on(table.taskId),
    activeIdx: index('idx_conversations_active').on(table.taskId, table.isActive), // Index for quick active conversation lookup
  })
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    sender: text('sender').notNull(),
    timestamp: text('timestamp')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    metadata: text('metadata'),
  },
  (table) => ({
    conversationIdIdx: index('idx_messages_conversation_id').on(table.conversationId),
    timestampIdx: index('idx_messages_timestamp').on(table.timestamp),
  })
);

// TODO: remove after refactor (resolves migration issues)
export const lineComments = sqliteTable(
  'line_comments',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    lineNumber: integer('line_number').notNull(),
    lineContent: text('line_content'),
    content: text('content').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    sentAt: text('sent_at'), // NULL = unsent, timestamp = when injected to chat
  },
  (table) => ({
    taskFileIdx: index('idx_line_comments_task_file').on(table.taskId, table.filePath),
  })
);

export const workspaceInstances = sqliteTable(
  'workspace_instances',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    externalId: text('external_id'), // "id" from script output (e.g. workspace name); nullable
    host: text('host').notNull(),
    port: integer('port').notNull().default(22),
    username: text('username'),
    worktreePath: text('worktree_path'),
    status: text('status').notNull().default('provisioning'), // provisioning | ready | terminated | error
    connectionId: text('connection_id').references(() => sshConnections.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at').notNull(),
    terminatedAt: integer('terminated_at'),
  },
  (table) => ({
    taskIdIdx: index('idx_workspace_instances_task_id').on(table.taskId),
    statusIdx: index('idx_workspace_instances_status').on(table.status),
  })
);

export const sessionRuntimeStats = sqliteTable(
  'session_runtime_stats',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    provider: text('provider'),
    status: text('status').notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    activeDurationMs: integer('active_duration_ms').notNull().default(0),
    idleDurationMs: integer('idle_duration_ms').notNull().default(0),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    usageMetadataJson: text('usage_metadata_json'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    sessionIdIdx: uniqueIndex('idx_session_runtime_stats_session_id').on(table.sessionId),
    taskIdIdx: index('idx_session_runtime_stats_task_id').on(table.taskId),
    statusIdx: index('idx_session_runtime_stats_status').on(table.status),
    createdAtIdx: index('idx_session_runtime_stats_created_at').on(table.createdAt),
  })
);

export const sessionDistillations = sqliteTable(
  'session_distillations',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    provider: text('provider'),
    status: text('status').notNull(),
    promptVersion: text('prompt_version'),
    startedAt: integer('started_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    finishedAt: integer('finished_at'),
    errorMessage: text('error_message'),
    rawResponse: text('raw_response'),
    summaryMarkdown: text('summary_markdown'),
    finalConclusion: text('final_conclusion'),
    evidenceRefsJson: text('evidence_refs_json'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    taskIdIdx: index('idx_session_distillations_task_id').on(table.taskId),
    sessionIdIdx: index('idx_session_distillations_session_id').on(table.sessionId),
    statusIdx: index('idx_session_distillations_status').on(table.status),
    createdAtIdx: index('idx_session_distillations_created_at').on(table.createdAt),
  })
);

export const knowledgeCandidates = sqliteTable(
  'knowledge_candidates',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    distillationId: text('distillation_id').references(() => sessionDistillations.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    cardKind: text('card_kind').notNull(),
    summary: text('summary').notNull(),
    bodyMarkdown: text('body_markdown'),
    sourceCount: integer('source_count').notNull().default(0),
    confidence: integer('confidence'),
    status: text('status').notNull(),
    evidenceRefsJson: text('evidence_refs_json'),
    tagsJson: text('tags_json'),
    reviewedAt: integer('reviewed_at'),
    reviewedBy: text('reviewed_by'),
    promotedCardId: text('promoted_card_id'),
    archivedAt: integer('archived_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    taskIdIdx: index('idx_knowledge_candidates_task_id').on(table.taskId),
    sessionIdIdx: index('idx_knowledge_candidates_session_id').on(table.sessionId),
    statusIdx: index('idx_knowledge_candidates_status').on(table.status),
    cardKindIdx: index('idx_knowledge_candidates_card_kind').on(table.cardKind),
    createdAtIdx: index('idx_knowledge_candidates_created_at').on(table.createdAt),
  })
);

export const knowledgeCards = sqliteTable(
  'knowledge_cards',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id').references(() => knowledgeCandidates.id, {
      onDelete: 'set null',
    }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    title: text('title').notNull(),
    cardKind: text('card_kind').notNull(),
    summary: text('summary').notNull(),
    content: text('content').notNull(),
    status: text('status').notNull(),
    evidenceRefsJson: text('evidence_refs_json'),
    tagsJson: text('tags_json'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    archivedAt: integer('archived_at'),
  },
  (table) => ({
    candidateIdIdx: index('idx_knowledge_cards_candidate_id').on(table.candidateId),
    taskIdIdx: index('idx_knowledge_cards_task_id').on(table.taskId),
    sessionIdIdx: index('idx_knowledge_cards_session_id').on(table.sessionId),
    statusIdx: index('idx_knowledge_cards_status').on(table.status),
    cardKindIdx: index('idx_knowledge_cards_card_kind').on(table.cardKind),
    createdAtIdx: index('idx_knowledge_cards_created_at').on(table.createdAt),
  })
);

export type WorkspaceInstanceRow = typeof workspaceInstances.$inferSelect;
export type WorkspaceInstanceInsert = typeof workspaceInstances.$inferInsert;
export type SessionRuntimeStatsRow = typeof sessionRuntimeStats.$inferSelect;
export type SessionRuntimeStatsInsert = typeof sessionRuntimeStats.$inferInsert;
export type SessionDistillationRow = typeof sessionDistillations.$inferSelect;
export type SessionDistillationInsert = typeof sessionDistillations.$inferInsert;
export type KnowledgeCandidateRow = typeof knowledgeCandidates.$inferSelect;
export type KnowledgeCandidateInsert = typeof knowledgeCandidates.$inferInsert;
export type KnowledgeCardRow = typeof knowledgeCards.$inferSelect;
export type KnowledgeCardInsert = typeof knowledgeCards.$inferInsert;

export const sshConnectionsRelations = relations(sshConnections, ({ many }) => ({
  projects: many(projects),
  workspaceInstances: many(workspaceInstances),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  tasks: many(tasks),
  sshConnection: one(sshConnections, {
    fields: [projects.sshConnectionId],
    references: [sshConnections.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  conversations: many(conversations),
  lineComments: many(lineComments),
  workspaceInstances: many(workspaceInstances),
  sessionRuntimeStats: many(sessionRuntimeStats),
  sessionDistillations: many(sessionDistillations),
  knowledgeCandidates: many(knowledgeCandidates),
  knowledgeCards: many(knowledgeCards),
}));

export const workspaceInstancesRelations = relations(workspaceInstances, ({ one }) => ({
  task: one(tasks, {
    fields: [workspaceInstances.taskId],
    references: [tasks.id],
  }),
  sshConnection: one(sshConnections, {
    fields: [workspaceInstances.connectionId],
    references: [sshConnections.id],
  }),
}));

export const sessionRuntimeStatsRelations = relations(sessionRuntimeStats, ({ one, many }) => ({
  task: one(tasks, {
    fields: [sessionRuntimeStats.taskId],
    references: [tasks.id],
  }),
  distillations: many(sessionDistillations),
  candidates: many(knowledgeCandidates),
  cards: many(knowledgeCards),
}));

export const sessionDistillationsRelations = relations(sessionDistillations, ({ one, many }) => ({
  task: one(tasks, {
    fields: [sessionDistillations.taskId],
    references: [tasks.id],
  }),
  runtimeStats: one(sessionRuntimeStats, {
    fields: [sessionDistillations.sessionId],
    references: [sessionRuntimeStats.sessionId],
  }),
  candidates: many(knowledgeCandidates),
}));

export const knowledgeCandidatesRelations = relations(knowledgeCandidates, ({ one, many }) => ({
  task: one(tasks, {
    fields: [knowledgeCandidates.taskId],
    references: [tasks.id],
  }),
  runtimeStats: one(sessionRuntimeStats, {
    fields: [knowledgeCandidates.sessionId],
    references: [sessionRuntimeStats.sessionId],
  }),
  distillation: one(sessionDistillations, {
    fields: [knowledgeCandidates.distillationId],
    references: [sessionDistillations.id],
  }),
  cards: many(knowledgeCards),
}));

export const knowledgeCardsRelations = relations(knowledgeCards, ({ one }) => ({
  task: one(tasks, {
    fields: [knowledgeCards.taskId],
    references: [tasks.id],
  }),
  runtimeStats: one(sessionRuntimeStats, {
    fields: [knowledgeCards.sessionId],
    references: [sessionRuntimeStats.sessionId],
  }),
  candidate: one(knowledgeCandidates, {
    fields: [knowledgeCards.candidateId],
    references: [knowledgeCandidates.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  task: one(tasks, {
    fields: [conversations.taskId],
    references: [tasks.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const lineCommentsRelations = relations(lineComments, ({ one }) => ({
  task: one(tasks, {
    fields: [lineComments.taskId],
    references: [tasks.id],
  }),
}));

export type SshConnectionRow = typeof sshConnections.$inferSelect;
export type SshConnectionInsert = typeof sshConnections.$inferInsert;
export type ProjectRow = typeof projects.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type LineCommentRow = typeof lineComments.$inferSelect;
export type LineCommentInsert = typeof lineComments.$inferInsert;
