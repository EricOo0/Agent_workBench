# Knowledge Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add session-based knowledge distillation to WorkBenchV2 so provider CLI exits trigger session summaries, candidate knowledge cards, Inbox review, Knowledge browsing, and Overview metrics without disrupting the existing terminal workflow.

**Architecture:** Extend the Electron main process with a dedicated session-capture and distillation pipeline anchored to provider session exit rather than task completion or PTY destruction. Persist runtime stats, distillation runs, candidates, and promoted cards in SQLite/Drizzle, then expose purpose-built IPC queries to new renderer views for Workbench session summaries, Inbox, Knowledge, and Overview.

**Tech Stack:** Electron main/renderer, React, TypeScript, Drizzle ORM, SQLite, Vitest, pnpm

---

## File Map

### Existing files to modify

- `src/main/db/schema.ts`
  Defines Drizzle tables and relations. Add runtime stats, distillations, candidates, and cards here.
- `src/main/services/DatabaseService.ts`
  Central persistence and query surface for the renderer. Add CRUD/query methods for the new knowledge data.
- `src/main/services/ptyIpc.ts`
  Current PTY lifecycle hub. Hook provider session exit here and route it to the new distillation pipeline.
- `src/main/services/ptyManager.ts`
  Existing PTY/provider orchestration. Reuse existing provider-exit and shell-respawn semantics; avoid broad refactors.
- `src/renderer/components/MainContentArea.tsx`
  Main view switcher. Add Overview, Inbox, and Knowledge routes.
- `src/renderer/views/Workspace.tsx`
  Top-level renderer shell. Add navigation state needed for the new workbench views.
- `src/renderer/types/electron-api.d.ts`
  Must stay in sync with any new IPC methods.
- `src/test/main/ptyIpc.test.ts`
  Extend to cover provider session exit -> distill trigger behavior.
- `src/test/main/DatabaseService.schemaContract.test.ts`
  Extend to cover new schema/tables and contract assumptions.

### New main-process files

- `src/main/services/KnowledgeCaptureService.ts`
  Tracks session-scoped runtime stats and provider-session lifecycle state.
- `src/main/services/SessionDistillationService.ts`
  Builds prompts, executes distill runs, parses structured output, and writes candidates.
- `src/main/ipc/knowledgeIpc.ts`
  IPC registration for session summaries, Inbox, Knowledge, Overview, and review actions.
- `src/shared/knowledge/types.ts`
  Shared types for runtime stats, summaries, candidates, cards, filters, and overview payloads.

### New renderer files

- `src/renderer/components/knowledge/SessionSummaryPanel.tsx`
  Lightweight session status block embedded in Workbench/task context.
- `src/renderer/components/knowledge/OverviewPage.tsx`
  Overview screen for activity, token, usage, and distillation metrics.
- `src/renderer/components/knowledge/InboxPage.tsx`
  Candidate review UI with actions.
- `src/renderer/components/knowledge/KnowledgePage.tsx`
  Formal knowledge card browsing/search UI.
- `src/renderer/lib/knowledgeApi.ts`
  Thin renderer-side wrappers for new IPC calls.

### New tests

- `src/test/main/KnowledgeCaptureService.test.ts`
  Unit tests for session state transitions and runtime stat tracking.
- `src/test/main/SessionDistillationService.test.ts`
  Unit tests for distillation parsing, failure handling, and candidate generation.
- `src/test/renderer/SessionSummaryPanel.test.tsx`
  Renderer tests for Workbench summary status behavior.
- `src/test/renderer/InboxPage.test.tsx`
  Renderer tests for candidate review actions and detail display.
- `src/test/renderer/KnowledgePage.test.tsx`
  Renderer tests for card browsing/search/filter behavior.
- `src/test/renderer/OverviewPage.test.tsx`
  Renderer tests for metrics presentation and navigation affordances.

## Implementation Notes

- Treat `agent session` as the knowledge unit. A task may span multiple sessions.
- Trigger distillation only on strong signals in the first iteration:
  - explicit provider/session end
  - provider CLI exit back to shell
  - explicit “archive and summarize” action if added later
- Do not trigger distillation on `idle` in the first iteration.
- Do not block PTY cleanup or shell respawn on distillation success.
- Keep first-pass editing light in Inbox. No heavy rich-text editor.
- Avoid touching `drizzle/meta/` or hand-editing numbered snapshots.
- Use existing renderer patterns rather than redesigning the shell.

## Task 1: Define Shared Knowledge Types

**Files:**
- Create: `src/shared/knowledge/types.ts`
- Modify: `src/renderer/types/electron-api.d.ts`
- Test: `src/test/main/DatabaseService.schemaContract.test.ts`

- [ ] **Step 1: Inspect existing shared type conventions**

Read:
```bash
sed -n '1,220p' src/shared/performanceTypes.ts
sed -n '1,220p' src/shared/agentStatus.ts
```

Expected: Clear examples of shared payload naming, optional fields, and export style.

- [ ] **Step 2: Write the failing schema-contract assertions for new types usage**

Add a small failing expectation in:
```ts
// src/test/main/DatabaseService.schemaContract.test.ts
expect(typeof knowledgeCandidate.status).toBe('string')
```

Expected: Type/test failure because the types/table surface does not exist yet.

- [ ] **Step 3: Create the shared type definitions**

Add:
```ts
export type SessionLifecycleState =
  | 'active'
  | 'idle'
  | 'ending'
  | 'ended'
  | 'distilling'
  | 'distilled'
  | 'distill_failed';

export type DistillationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped';
export type KnowledgeCandidateStatus = 'new' | 'reviewed' | 'promoted' | 'rejected' | 'archived';
export type KnowledgeCardStatus = 'active' | 'archived';
```

Also define interfaces for:
- runtime stats
- evidence refs
- distillation record
- candidate
- card
- overview payload
- Inbox/Knowledge filters

- [ ] **Step 4: Add IPC-facing typings to the renderer declaration**

Extend:
```ts
window.electronAPI.getSessionSummary(...)
window.electronAPI.listKnowledgeCandidates(...)
window.electronAPI.reviewKnowledgeCandidate(...)
window.electronAPI.listKnowledgeCards(...)
window.electronAPI.getKnowledgeOverview(...)
```

- [ ] **Step 5: Run the targeted contract test**

Run:
```bash
pnpm exec vitest run src/test/main/DatabaseService.schemaContract.test.ts
```

Expected: PASS with the new shared type surface referenced cleanly.

- [ ] **Step 6: Commit**

```bash
git add src/shared/knowledge/types.ts src/renderer/types/electron-api.d.ts src/test/main/DatabaseService.schemaContract.test.ts
git commit -m "feat: add shared knowledge workbench types"
```

## Task 2: Add Database Tables and Repository Surface

**Files:**
- Modify: `src/main/db/schema.ts`
- Modify: `src/main/services/DatabaseService.ts`
- Create: `drizzle/0011_add_knowledge_workbench.sql`
- Test: `src/test/main/DatabaseService.schemaContract.test.ts`

- [ ] **Step 1: Read the existing schema and migration style**

Run:
```bash
sed -n '1,260p' src/main/db/schema.ts
sed -n '1,220p' drizzle/0010_add_workspace_instances.sql
```

Expected: Understand naming, timestamp style, and index patterns.

- [ ] **Step 2: Write failing schema tests for new tables**

Add expectations covering:
- `session_runtime_stats`
- `session_distillations`
- `knowledge_candidates`
- `knowledge_cards`

Example:
```ts
expect(Object.keys(schema)).toContain('knowledgeCards')
```

- [ ] **Step 3: Extend the Drizzle schema**

Add four tables plus minimal relations and indexes for:
- `task_id`
- `session_id`
- `status`
- `card_kind`
- `created_at`

Keep JSON-heavy fields limited to:
- `usage_metadata_json`
- `evidence_refs_json`
- `tags_json`

- [ ] **Step 4: Add the SQL migration**

Create `drizzle/0011_add_knowledge_workbench.sql` with only additive changes.

Required tables:
```sql
session_runtime_stats
session_distillations
knowledge_candidates
knowledge_cards
```

- [ ] **Step 5: Add DatabaseService CRUD/query methods**

Implement methods for:
- create/update runtime stats
- create/update distillation runs
- insert candidates
- promote/reject/archive candidates
- list candidates by filter
- list cards by filter
- fetch session summary
- fetch overview aggregates

- [ ] **Step 6: Run the targeted main test**

Run:
```bash
pnpm exec vitest run src/test/main/DatabaseService.schemaContract.test.ts
```

Expected: PASS with schema and repository methods aligned.

- [ ] **Step 7: Commit**

```bash
git add src/main/db/schema.ts src/main/services/DatabaseService.ts drizzle/0011_add_knowledge_workbench.sql src/test/main/DatabaseService.schemaContract.test.ts
git commit -m "feat: add knowledge workbench persistence"
```

## Task 3: Implement Session Capture Service

**Files:**
- Create: `src/main/services/KnowledgeCaptureService.ts`
- Modify: `src/main/services/ptyIpc.ts`
- Test: `src/test/main/KnowledgeCaptureService.test.ts`

- [ ] **Step 1: Read PTY/provider lifecycle code carefully**

Run:
```bash
rg -n "onExit|manual_kill|process_exit|app_quit|shell" src/main/services/ptyIpc.ts src/main/services/ptyManager.ts
```

Expected: Identify strong session-end hooks already in place.

- [ ] **Step 2: Write the failing capture-service tests**

Add tests for:
- session starts when provider CLI launches
- session ends when provider exits back to shell
- idle does not mark session ended
- runtime stats can close independently of PTY destruction

Example:
```ts
expect(service.getState(sessionId)?.state).toBe('ended')
```

- [ ] **Step 3: Implement KnowledgeCaptureService**

Expose methods like:
```ts
startSession(...)
markActivity(...)
markIdle(...)
endSession(...)
getSessionState(...)
```

Persist:
- `started_at`
- `ended_at`
- `provider`
- `task_id`
- `session_id`
- basic token placeholders if available later

- [ ] **Step 4: Wire provider-session exit into ptyIpc**

On strong end signals only:
- provider CLI exit
- explicit session termination

Do not trigger on idle.

- [ ] **Step 5: Run targeted main tests**

Run:
```bash
pnpm exec vitest run src/test/main/KnowledgeCaptureService.test.ts src/test/main/ptyIpc.test.ts
```

Expected: PASS and no use of idle as an end trigger.

- [ ] **Step 6: Commit**

```bash
git add src/main/services/KnowledgeCaptureService.ts src/main/services/ptyIpc.ts src/test/main/KnowledgeCaptureService.test.ts src/test/main/ptyIpc.test.ts
git commit -m "feat: capture provider session lifecycle for knowledge"
```

## Task 4: Implement Distillation Pipeline

**Files:**
- Create: `src/main/services/SessionDistillationService.ts`
- Modify: `src/main/services/ptyIpc.ts`
- Modify: `src/main/services/DatabaseService.ts`
- Test: `src/test/main/SessionDistillationService.test.ts`

- [ ] **Step 1: Write failing distillation tests**

Cover:
- queued -> running -> succeeded
- queued -> running -> failed
- malformed structured output uses graceful fallback
- candidate generation stores evidence refs
- failures do not block session end

Example:
```ts
expect(result.status).toBe('failed')
expect(runtimeCloseSucceeded).toBe(true)
```

- [ ] **Step 2: Implement a minimal distillation service contract**

Define:
```ts
runDistillationForSession(sessionId: string): Promise<DistillationResult>
```

Responsibilities:
- create distillation record
- build prompt from a versioned template
- parse structured output
- store summary and candidates

- [ ] **Step 3: Add parsing helpers with defensive fallbacks**

Support:
- strict JSON path
- limited repair path
- final failure path with `status = failed`

Do not silently swallow parse errors without recording them.

- [ ] **Step 4: Trigger distillation asynchronously after strong session end**

In `ptyIpc`, call the service after the session is marked ended.

Requirements:
- no PTY close blocking
- no renderer crash if distillation finishes later
- no retry loop in first pass beyond explicit user retry

- [ ] **Step 5: Run targeted tests**

Run:
```bash
pnpm exec vitest run src/test/main/SessionDistillationService.test.ts src/test/main/ptyIpc.test.ts
```

Expected: PASS with async distillation behavior covered.

- [ ] **Step 6: Commit**

```bash
git add src/main/services/SessionDistillationService.ts src/main/services/ptyIpc.ts src/main/services/DatabaseService.ts src/test/main/SessionDistillationService.test.ts src/test/main/ptyIpc.test.ts
git commit -m "feat: add session distillation pipeline"
```

## Task 5: Expose Knowledge IPC Surface

**Files:**
- Create: `src/main/ipc/knowledgeIpc.ts`
- Modify: `src/main/main.ts`
- Modify: `src/renderer/types/electron-api.d.ts`
- Test: `src/test/main/ptyIpc.test.ts`

- [ ] **Step 1: Inspect IPC registration patterns**

Run:
```bash
sed -n '1,240p' src/main/ipc/dbIpc.ts
sed -n '1,240p' src/main/main.ts
```

Expected: Reuse the same registration and RPC style as existing modules.

- [ ] **Step 2: Write failing IPC expectations**

Add an assertion that the renderer API expects:
- session summary query
- candidate list/detail
- candidate review action
- card list/detail
- overview query

- [ ] **Step 3: Implement `knowledgeIpc.ts`**

Expose handlers for:
- `knowledge:getSessionSummary`
- `knowledge:listCandidates`
- `knowledge:reviewCandidate`
- `knowledge:listCards`
- `knowledge:getOverview`

- [ ] **Step 4: Register the new IPC module in `main.ts`**

Add one registration call next to existing IPC setup.

- [ ] **Step 5: Reconcile the renderer declaration**

Ensure `src/renderer/types/electron-api.d.ts` matches the IPC payloads exactly.

- [ ] **Step 6: Run targeted tests**

Run:
```bash
pnpm exec vitest run src/test/main/ptyIpc.test.ts
```

Expected: PASS without renderer/main API drift.

- [ ] **Step 7: Commit**

```bash
git add src/main/ipc/knowledgeIpc.ts src/main/main.ts src/renderer/types/electron-api.d.ts src/test/main/ptyIpc.test.ts
git commit -m "feat: expose knowledge workbench ipc"
```

## Task 6: Add Workbench Session Summary Panel

**Files:**
- Create: `src/renderer/components/knowledge/SessionSummaryPanel.tsx`
- Create: `src/renderer/lib/knowledgeApi.ts`
- Modify: `src/renderer/components/ChatInterface.tsx`
- Test: `src/test/renderer/SessionSummaryPanel.test.tsx`

- [ ] **Step 1: Read the active task UI entry points**

Run:
```bash
rg -n "ChatInterface|Task" src/renderer/components/ChatInterface.tsx src/renderer/views/Workspace.tsx
```

Expected: Identify a light-touch insertion point near task/session context rather than inside terminal output flow.

- [ ] **Step 2: Write failing renderer tests**

Cover:
- loading state
- succeeded summary state
- failed state with retry button
- candidate count display

Example:
```tsx
expect(screen.getByText(/Retry Distill/i)).toBeInTheDocument()
```

- [ ] **Step 3: Implement `knowledgeApi.ts`**

Wrap `window.electronAPI` calls with small helper functions for:
- session summary lookup
- retry
- navigation helpers if needed

- [ ] **Step 4: Implement `SessionSummaryPanel.tsx`**

Render:
- distill status
- last summary time
- candidate count
- summary preview
- retry/open Inbox actions

Keep the panel compact and outside terminal content flow.

- [ ] **Step 5: Mount the panel in `ChatInterface.tsx`**

Insert it near task metadata or top-of-task context, not in the terminal transcript.

- [ ] **Step 6: Run targeted renderer tests**

Run:
```bash
pnpm exec vitest run src/test/renderer/SessionSummaryPanel.test.tsx
```

Expected: PASS with compact Workbench integration.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/knowledge/SessionSummaryPanel.tsx src/renderer/lib/knowledgeApi.ts src/renderer/components/ChatInterface.tsx src/test/renderer/SessionSummaryPanel.test.tsx
git commit -m "feat: show session summary status in workbench"
```

## Task 7: Add Inbox Review Flow

**Files:**
- Create: `src/renderer/components/knowledge/InboxPage.tsx`
- Modify: `src/renderer/components/MainContentArea.tsx`
- Modify: `src/renderer/views/Workspace.tsx`
- Test: `src/test/renderer/InboxPage.test.tsx`

- [ ] **Step 1: Identify existing view-toggle patterns**

Run:
```bash
sed -n '1,240p' src/renderer/views/Workspace.tsx
sed -n '1,220p' src/renderer/components/MainContentArea.tsx
```

Expected: Find the existing top-level booleans/view switches to mirror.

- [ ] **Step 2: Write failing Inbox UI tests**

Cover:
- candidate list rendering
- detail panel rendering
- promote/reject/archive actions
- retry action for failed summaries

- [ ] **Step 3: Implement `InboxPage.tsx`**

Support:
- list + detail split layout
- filters for confidence/status/tag/project as a minimal first pass
- buttons for promote/reject/archive/retry

- [ ] **Step 4: Add navigation state for Inbox**

Update `Workspace.tsx` and `MainContentArea.tsx` so Inbox is a top-level route.

- [ ] **Step 5: Run targeted renderer tests**

Run:
```bash
pnpm exec vitest run src/test/renderer/InboxPage.test.tsx
```

Expected: PASS with review actions wired through the API wrapper.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/knowledge/InboxPage.tsx src/renderer/components/MainContentArea.tsx src/renderer/views/Workspace.tsx src/test/renderer/InboxPage.test.tsx
git commit -m "feat: add knowledge inbox review flow"
```

## Task 8: Add Knowledge Library View

**Files:**
- Create: `src/renderer/components/knowledge/KnowledgePage.tsx`
- Modify: `src/renderer/components/MainContentArea.tsx`
- Modify: `src/renderer/views/Workspace.tsx`
- Test: `src/test/renderer/KnowledgePage.test.tsx`

- [ ] **Step 1: Write failing Knowledge page tests**

Cover:
- card list
- kind/tag filter
- search input
- card detail
- source-session link affordance

- [ ] **Step 2: Implement `KnowledgePage.tsx`**

Render:
- filter column
- card list
- detail panel

Initial interactions:
- search
- kind filter
- tag filter
- open source session / evidence

- [ ] **Step 3: Add Knowledge route wiring**

Update top-level renderer view state and navigation.

- [ ] **Step 4: Run targeted renderer tests**

Run:
```bash
pnpm exec vitest run src/test/renderer/KnowledgePage.test.tsx
```

Expected: PASS with basic browsing and filtering working.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/knowledge/KnowledgePage.tsx src/renderer/components/MainContentArea.tsx src/renderer/views/Workspace.tsx src/test/renderer/KnowledgePage.test.tsx
git commit -m "feat: add knowledge library view"
```

## Task 9: Add Overview Metrics View

**Files:**
- Create: `src/renderer/components/knowledge/OverviewPage.tsx`
- Modify: `src/renderer/components/MainContentArea.tsx`
- Modify: `src/renderer/views/Workspace.tsx`
- Test: `src/test/renderer/OverviewPage.test.tsx`

- [ ] **Step 1: Write failing Overview tests**

Cover:
- KPI cards
- 7d / 30d range switching
- token/usage metrics rendering
- navigation to Inbox/Knowledge/session

- [ ] **Step 2: Implement `OverviewPage.tsx`**

Render first-pass sections:
- active sessions / tasks
- distilled today / inbox pending / promoted cards
- token in/out
- agent active hours
- recent high-value sessions

Start with static layout fed by IPC, not complex charting infrastructure.

- [ ] **Step 3: Add Overview route wiring**

Update renderer state and navigation so Overview is a first-class route.

- [ ] **Step 4: Run targeted renderer tests**

Run:
```bash
pnpm exec vitest run src/test/renderer/OverviewPage.test.tsx
```

Expected: PASS with KPI and navigation behaviors covered.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/knowledge/OverviewPage.tsx src/renderer/components/MainContentArea.tsx src/renderer/views/Workspace.tsx src/test/renderer/OverviewPage.test.tsx
git commit -m "feat: add knowledge overview metrics"
```

## Task 10: End-to-End Verification and Documentation Sweep

**Files:**
- Modify: `docs/superpowers/specs/2026-03-26-knowledge-workbench-design.md` if implementation materially diverged
- Optional Modify: relevant docs under `docs/` if user-facing workflows changed visibly
- Test: `src/test/main/*.test.ts`
- Test: `src/test/renderer/*.test.ts`

- [ ] **Step 1: Run the focused new-test suite**

Run:
```bash
pnpm exec vitest run \
  src/test/main/KnowledgeCaptureService.test.ts \
  src/test/main/SessionDistillationService.test.ts \
  src/test/main/ptyIpc.test.ts \
  src/test/main/DatabaseService.schemaContract.test.ts \
  src/test/renderer/SessionSummaryPanel.test.tsx \
  src/test/renderer/InboxPage.test.tsx \
  src/test/renderer/KnowledgePage.test.tsx \
  src/test/renderer/OverviewPage.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run format**

Run:
```bash
pnpm run format
```

Expected: PASS and no unexpected large diffs.

- [ ] **Step 3: Run lint**

Run:
```bash
pnpm run lint
```

Expected: PASS.

- [ ] **Step 4: Run type-check**

Run:
```bash
pnpm run type-check
```

Expected: PASS.

- [ ] **Step 5: Run the full Vitest suite**

Run:
```bash
pnpm exec vitest run
```

Expected: PASS.

- [ ] **Step 6: Update docs only if behavior drifted from the spec**

If needed, adjust:
```bash
docs/superpowers/specs/2026-03-26-knowledge-workbench-design.md
```

Expected: Spec and implementation remain aligned.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: ship knowledge workbench mvp"
```

## Execution Guardrails

- Never start implementation on `main` without explicit user consent. Create an isolated worktree/branch first via `@using-git-worktrees`.
- Prefer TDD in each task. If a step is too UI-heavy for pure TDD, add a renderer test first for the critical state transitions.
- Keep commits small and task-scoped.
- Stop immediately if provider-exit semantics are less reliable than expected. Revisit the capture-service design instead of guessing.
- Do not widen scope into idle-based auto-distill, graph relationships, or heavy editing during this plan.

## Handoff

Spec reference:
- `docs/superpowers/specs/2026-03-26-knowledge-workbench-design.md`

This plan assumes implementation happens in an isolated worktree, not directly on `main`.
