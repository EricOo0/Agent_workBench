# Knowledge Workbench Progress

## Scope

本文档记录 `feat/knowledge-workbench` 分支截至当前时刻的真实进度、已确认结论、未收口问题与下一步建议。

关联文档：

- 设计：[`docs/superpowers/specs/2026-03-26-knowledge-workbench-design.md`](/Users/bytedance/GolandolandProjects/pi-agent/WorkBenchV2/.worktrees/feat-knowledge-workbench/docs/superpowers/specs/2026-03-26-knowledge-workbench-design.md)
- 计划：[`docs/superpowers/plans/2026-03-26-knowledge-workbench.md`](/Users/bytedance/GolandolandProjects/pi-agent/WorkBenchV2/.worktrees/feat-knowledge-workbench/docs/superpowers/plans/2026-03-26-knowledge-workbench.md)

## Current Branch

```text
worktree: /Users/bytedance/GolandolandProjects/pi-agent/WorkBenchV2/.worktrees/feat-knowledge-workbench
branch:   feat/knowledge-workbench
```

## Completed Milestones

已完成并提交的主里程碑：

```text
11ee517f test: align knowledge workbench verification
fab9fddb Add overview metrics knowledge view
4b0e497c feat: add knowledge library view
bc37ca40 feat: add workbench session summary panel
720de759 Add knowledge inbox review flow
6f451d76 feat: expose knowledge ipc surface
8f4c65ed feat: add session distillation pipeline
f47437b5 feat: capture provider session lifecycle for knowledge
109b3f03 feat: add knowledge workbench persistence
22b69353 fix: tighten knowledge task 1 contracts
bb15e59d feat: add shared knowledge workbench types
6e32dc78 docs: add knowledge workbench implementation plan
ae123385 docs: add knowledge workbench design spec
```

按能力划分，当前已落地：

### 1. 数据与持久化

- 新增知识工作台核心表：
  - `session_runtime_stats`
  - `session_distillations`
  - `knowledge_candidates`
  - `knowledge_cards`
- 新增 migration：
  - [`drizzle/0011_add_knowledge_workbench.sql`](/Users/bytedance/GolandolandProjects/pi-agent/WorkBenchV2/.worktrees/feat-knowledge-workbench/drizzle/0011_add_knowledge_workbench.sql)
- `DatabaseService` 已支持：
  - runtime stats upsert
  - distillation upsert
  - candidate insert / promote / reject / archive
  - session summary query
  - overview aggregates query

### 2. Session Lifecycle

- 新增 [`KnowledgeCaptureService.ts`](/Users/bytedance/GolandolandProjects/pi-agent/WorkBenchV2/.worktrees/feat-knowledge-workbench/src/main/services/KnowledgeCaptureService.ts)
- 已在 `ptyIpc` 中接入强结束信号：
  - `process_exit`
  - `manual_kill`
- 当前产品定义仍然成立：
  - `idle` 不是 summary 触发信号
  - 知识沉淀原子是 `agent session`

### 3. Summary / Distillation

- 新增 [`SessionDistillationService.ts`](/Users/bytedance/GolandolandProjects/pi-agent/WorkBenchV2/.worktrees/feat-knowledge-workbench/src/main/services/SessionDistillationService.ts)
- 当前支持：
  - session source 聚合
  - prompt 构造
  - strict JSON 解析
  - limited repair parse
  - failed 落库
  - candidate 生成与 evidence refs 归档

### 4. IPC

- 新增 [`src/main/ipc/knowledgeIpc.ts`](/Users/bytedance/GolandolandProjects/pi-agent/WorkBenchV2/.worktrees/feat-knowledge-workbench/src/main/ipc/knowledgeIpc.ts)
- 已暴露：
  - `knowledge:getSessionSummary`
  - `knowledge:listCandidates`
  - `knowledge:reviewCandidate`
  - `knowledge:listCards`
  - `knowledge:getOverview`

### 5. Renderer

- Workbench：
  - [`SessionSummaryPanel.tsx`](/Users/bytedance/GolandolandProjects/pi-agent/WorkBenchV2/.worktrees/feat-knowledge-workbench/src/renderer/components/knowledge/SessionSummaryPanel.tsx)
- Inbox：
  - [`InboxPage.tsx`](/Users/bytedance/GolandolandProjects/pi-agent/WorkBenchV2/.worktrees/feat-knowledge-workbench/src/renderer/components/knowledge/InboxPage.tsx)
- Knowledge：
  - [`KnowledgePage.tsx`](/Users/bytedance/GolandolandProjects/pi-agent/WorkBenchV2/.worktrees/feat-knowledge-workbench/src/renderer/components/knowledge/KnowledgePage.tsx)
- Overview：
  - [`OverviewPage.tsx`](/Users/bytedance/GolandolandProjects/pi-agent/WorkBenchV2/.worktrees/feat-knowledge-workbench/src/renderer/components/knowledge/OverviewPage.tsx)
- 本地路由已接入 `Workspace/MainContentArea`
- 左侧可见入口已补：
  - `Overview`
  - `Inbox`
  - `Knowledge`

## Verified Conclusions

### 1. Summary Triggering

已确认：

```text
main session 结束后，summary / distillation 能触发
chat session 原来没有触发，不是因为结束信号没到，而是 taskId 绑定错了
```

根因：

- `codex-chat-conv_*` 的 PTY suffix 是 `conversationId`
- 之前被错误当成 `taskId` 写进 `session_runtime_stats`
- 之后 `getSessionDistillationSource(sessionId)` 用这个错误 taskId 查 task，直接返回 `null`

当前已修复方向：

- `chat PTY -> conversationId -> taskId` 映射
- 历史错误 `taskId=conversationId` 允许最小纠偏

### 2. Codex Distillation Failure Root Cause

已查到最近失败记录：

```text
session_id:      codex-main-wt-797ea01228bc
status:          failed
prompt_version:  session-distillation.v1
error_message:   Error: stdin is not a terminal
```

结论：

```text
问题不是结构化 JSON 解析失败
而是 codex 被错误地走了需要 TTY 的默认交互入口
```

当前修复方向：

- `codex` distillation 改走 `codex exec`
- 使用 `-o <file>` 收集最终输出
- 已做本机 smoke test，确认不再报 `stdin is not a terminal`

### 3. Overview Metrics

已确认存在的真实问题：

```text
旧实现里：
- Active tasks 由前端拿 candidate 反推，导致 task 关闭了数字还不对
- Token input/output 全为 0，不是前端算错，而是后端根本没采到 usage
```

当前修复方向：

- `activeSessions / activeTasks / agentActiveHours` 改为优先吃后端聚合值
- token 在未接通时显示 `N/A`
- `Tokens used` 改为真实文案，不再伪装成 input/output 拆分

### 4. Lint Environment

已确认：

```text
lint 之前失败不是代码错误
而是 worktree 场景下 ESLint 插件解析到了主仓库根目录，但主仓库根目录没有 node_modules
```

当前状态：

- 已能正常跑 `pnpm run lint`
- 结果为：
  - `0 errors`
  - 大量历史 warnings

## Current Uncommitted Work

当前 worktree 里还有一批未提交修复，主要围绕：

```text
- codex chat session -> taskId 绑定修复
- codex exec 非交互 distillation runner
- SessionSummaryPanel 失败详情展示
- Overview 活跃统计与 token usage 展示修正
- 左侧栏可见知识入口接线
```

当前未提交文件：

```text
src/main/services/CodexSessionService.ts
src/main/services/DatabaseService.ts
src/main/services/KnowledgeCaptureService.ts
src/main/services/SessionDistillationService.ts
src/main/services/ptyIpc.ts
src/renderer/components/knowledge/OverviewPage.tsx
src/renderer/components/knowledge/SessionSummaryPanel.tsx
src/renderer/components/sidebar/LeftSidebar.tsx
src/renderer/views/Workspace.tsx
src/shared/knowledge/types.ts
src/test/main/ptyIpc.test.ts
src/test/renderer/OverviewPage.test.ts
src/test/renderer/SessionSummaryPanel.test.ts
```

这些改动尚未整理成提交。

## Validation Snapshot

当前已通过的验证：

```text
PASS
- pnpm run format
- pnpm run type-check
- pnpm exec vitest run
  - 81 test files
  - 780 tests passed
- pnpm run lint
  - 0 errors
  - warnings only
```

与本轮未提交修复直接相关的定向验证也已通过：

```text
- ptyIpc.test.ts
- SessionDistillationService.test.ts
- KnowledgeCaptureService.test.ts
- SessionSummaryPanel.test.ts
- OverviewPage.test.ts
- DatabaseService.initializeSchemaMismatch.test.ts
- DatabaseService.schemaContract.test.ts
```

## Remaining Gaps

当前仍未完全收口的能力点：

### 1. Summary Failure Diagnostics

虽然已经把失败原因查库查清，但当前 UI 还只完成了“最小失败详情展示”的一部分，整体还不算彻底产品化。

目标方向：

```text
SessionSummaryPanel failed 时可直接查看：
- provider
- prompt version
- error message
- raw response
```

### 2. Token Usage

当前准备接入的是：

```text
codex 的 total tokens_used
```

不是：

```text
input tokens / output tokens 的完整拆分
```

因为本地 `~/.codex/state_5.sqlite` 当前稳定可读的是 `threads.tokens_used`。

### 3. Chat Session Historical Rows

历史上已经错误写入的 chat runtime rows：

```text
task_id = conversationId
```

不会自动补做旧的 distillation 历史记录；修复后只保证未来新的 chat session 走正确链路。

## Recommended Next Steps

建议下一步按下面顺序推进：

```text
1. 把当前未提交修复整理成一到两个明确 commit
2. 重启 app，实际走一遍新的 codex main/chat session
3. 验证：
   - chat session 是否开始写 session_distillations
   - Overview 的 active 数值是否正确
   - Tokens used 是否从 N/A 变成真实值
4. 如果通过，再更新这份进度文档并准备最终 PR 说明
```

## Short Summary

一句话总结当前阶段：

```text
知识工作台主链路已经基本打通；
当前剩余工作主要不是“补页面”，而是把 codex chat summary、token usage、overview 统计这几个真实运行时问题彻底收口。
```
