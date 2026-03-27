# Knowledge Workbench Design

## Summary

目标是将当前 `WorkBenchV2` 从“任务执行工作台”演进为“任务执行 + 知识沉淀”的工作台，并且保持 `terminal/worktree/task` 主链路不被打断。

第一阶段采用串联式 MVP：

```text
agent session
  -> 自动总结
  -> 生成候选知识卡
  -> Inbox 审核
  -> Promote 为正式 Knowledge Card
```

核心原则：

- `Workbench` 仍然是主入口，知识能力是派生层，不反客为主
- 知识沉淀的基本原子是 `agent session`，不是 `task`，也不是 `terminal PTY`
- 自动总结是副链路，不能阻塞会话结束和终端主流程
- 第一阶段优先验证“自动沉淀是否有价值”，不引入第二套 agent/provider 编排

## Problem Statement

当前项目已经具备较完整的工作台基础：

- `task / project / worktree` 容器
- terminal / PTY / remote SSH 能力
- provider CLI 集成
- SQLite + Drizzle 持久化
- Electron Renderer Shell 与多视图承载能力

但当前缺少“工作结果可持续积累”的能力，导致：

- session 中形成的决策、排障结论、可复用经验在会话结束后容易丢失
- 用户需要回翻 transcript 或重新向 agent 解释历史背景
- Workbench 无法从“执行工具”升级为“执行 + 沉淀 + 复用”的闭环

## Goals

- 在不破坏当前 Workbench 主链路的前提下，为 agent session 增加自动沉淀能力
- 在 session 结束时自动生成结构化总结和候选知识卡
- 提供 `Inbox` 审核流程，将候选知识转为正式知识卡
- 提供 `Knowledge` 视图用于搜索、浏览、复用正式知识
- 提供 `Overview` 视图，用于观察工作活跃度、agent 使用、token 消耗、沉淀产出

## Non-Goals

- 不重写当前 `Workspace` 主布局
- 不引入独立的知识抽取 provider 或后台 LLM orchestration 服务
- 不在 terminal 主阅读流中插入长块知识内容
- 不在第一阶段引入复杂知识图谱、多层知识树、重型编辑器、自动去重系统
- 不以 `task` 完成作为唯一总结时机

## Concepts

### Task

`Task` 是长期工作容器，对应明确的任务目标、目录、worktree 与上下文。

特点：

- 生命周期通常比一次 agent 会话长
- 一个 task 下可以发生多次 session
- task 是聚合与归档维度，不是知识沉淀最小原子

### Agent Session

`Agent Session` 是在某个 task 内启动的一次 provider CLI 会话，例如一次 `codex` 或 `claude code` 的连续工作回合。

特点：

- 是知识沉淀的最小原子
- 一次 session 对应一次自动 distill
- 一个 task 下可有多个 session，每个 session 产生各自的 summary / candidates

### Terminal PTY

`Terminal PTY` 是底层终端承载体。

特点：

- PTY 可以持续存在
- PTY 内可连续承载多个 agent session
- PTY 的存在不等于 session 仍在进行

概念关系：

```text
Task
  -> contains multiple Agent Sessions
PTY
  -> hosts shell and multiple Agent Sessions over time
```

## Session End Definition

本设计中，自动沉淀触发点不是 `task` 结束，也不是 PTY 销毁，而是：

```text
用户退出 codex / claude code
终端控制权返回 shell
=> 视为本次 agent session 结束
```

### Recommended Rules

`session start`：

- app 在某个 task 的 terminal 中启动 provider CLI

`session end`：

- provider CLI 真实退出并返回 shell prompt
- 用户显式结束该 provider 会话
- provider 进程被手动 kill

### Explicitly Excluded

以下情况不直接视为 `session end`：

- `session.idle`
- 暂时无输出
- 用户暂时停下来思考
- terminal PTY 仍在但 provider 只是安静

### Reasoning

这样定义的优势：

- 最贴近真实工作回合
- 比 `task` 结束更及时，避免总结粒度过粗
- 比依赖 `idle` 更可靠，降低误触发

## Product Architecture

一级视图：

```text
- Workbench
- Overview
- Inbox
- Knowledge
```

职责划分：

```text
+-------------+----------------------------------+--------------------------------------+
| View        | Responsibility                   | Out of Scope                         |
+-------------+----------------------------------+--------------------------------------+
| Workbench   | task/session/terminal 主链路     | 不承担知识整理主操作台               |
| Overview    | 观察效率、成本、沉淀             | 不处理大量卡片细节                   |
| Inbox       | 审核候选知识                     | 不承担长期知识浏览                   |
| Knowledge   | 浏览与复用正式知识               | 不承担候选审核和失败处理             |
+-------------+----------------------------------+--------------------------------------+
```

用户心智：

```text
Workbench = 我正在做什么
Overview  = 最近效率、成本、沉淀怎么样
Inbox     = 哪些知识值得收下
Knowledge = 已经沉淀了什么，可否复用
```

## User Flow

第一阶段主链路：

```text
用户在 task 内启动 codex / claude code
  -> agent session 进行中
  -> 用户退出 agent，terminal 回到 shell
  -> app 感知 session 结束
  -> 异步触发 distill
  -> 生成 session summary + knowledge candidates
  -> Workbench 显示轻量知识状态
  -> 用户在 Inbox 中审核候选卡
  -> Promote 后进入 Knowledge
  -> Overview 聚合展示 usage / token / distill / card 数据
```

## Data Flow

推荐链路：

```text
session/task/workbench
  -> runtime capture
  -> end-of-session distillation
  -> knowledge candidate
  -> inbox review
  -> promoted knowledge card
  -> overview aggregates / search
```

第一阶段强制分为 4 组核心对象：

```text
- session_runtime_stats
- session_distillations
- knowledge_candidates
- knowledge_cards
```

`overview_daily_stats` 可后置，首版可通过实时聚合查询实现。

## Data Model

### session_runtime_stats

作用：承载 session 级别的使用统计，而不是知识本体。

建议字段：

- `id`
- `task_id`
- `session_id`
- `provider`
- `started_at`
- `ended_at`
- `active_duration_ms`
- `idle_duration_ms`
- `input_tokens`
- `output_tokens`
- `usage_metadata_json`
- `created_at`

### session_distillations

作用：记录一次 session 自动总结任务及其结果。

建议字段：

- `id`
- `task_id`
- `session_id`
- `provider`
- `status`
- `prompt_version`
- `started_at`
- `completed_at`
- `error`
- `raw_response`
- `summary_markdown`
- `final_conclusion`
- `created_at`

状态：

```text
queued | running | succeeded | failed | skipped
```

### knowledge_candidates

作用：distill 产出的待审核候选知识卡。

建议字段：

- `id`
- `task_id`
- `session_id`
- `distillation_id`
- `title`
- `card_kind`
- `summary`
- `body_markdown`
- `confidence`
- `status`
- `evidence_refs_json`
- `tags_json`
- `created_at`
- `updated_at`

状态：

```text
new | reviewed | promoted | rejected | archived
```

### knowledge_cards

作用：正式知识卡库。

建议字段：

- `id`
- `candidate_id`
- `task_id`
- `session_id`
- `title`
- `card_kind`
- `body_markdown`
- `evidence_refs_json`
- `tags_json`
- `status`
- `created_at`
- `updated_at`

状态：

```text
active | archived
```

## Evidence Model

第一阶段必须支持结构化 evidence ref，不能只存自由文本摘抄。

推荐最小结构：

```json
{
  "source_type": "conversation_message | terminal_output | summary",
  "session_id": "string",
  "task_id": "string",
  "conversation_id": "string | null",
  "message_id": "string | null",
  "seq": 123,
  "excerpt": "string"
}
```

目标：

- Inbox 能解释“这条知识从哪来”
- Knowledge 能支持 `Open Source Session` / `View Evidence`
- 后续 prompt 升级、重跑 distill、去重时，仍保留可追溯性

第一阶段不强求 terminal offset 级别精确定位，但至少要稳定回到 `session / task / conversation / message`。

## Distillation Strategy

第一阶段不引入独立知识抽取 provider，优先复用用户当前正在使用的 provider/session。

核心策略：

```text
轻采集，重总结
```

运行中只记录轻量 runtime stats 和证据来源；
真正的知识提取只在 session 结束时执行一次结构化 distill。

### Prompting

新增可配置项：

- `knowledgePromptTemplate`
- 支持全局默认模板
- 支持按 provider 覆盖
- 支持版本号 `prompt_version`

首版结构化输出目标：

```json
{
  "session_summary": "...",
  "final_conclusion": "...",
  "key_decisions": ["..."],
  "reusable_lessons": ["..."],
  "follow_ups": ["..."],
  "candidates": [
    {
      "title": "...",
      "kind": "principle | final_conclusion | troubleshooting | sop | domain_knowledge",
      "summary": "...",
      "body_markdown": "...",
      "confidence": 0.86,
      "tags": ["..."],
      "evidence_refs": []
    }
  ]
}
```

### Parser Requirements

- 优先解析严格 JSON
- 允许有限修复和宽松回退
- 解析失败不应影响 session 结束

## Lifecycle and Trigger Rules

### Runtime States

建议引入 session 生命周期状态：

```text
active
idle
ending
ended
distilling
distilled
distill_failed
```

### Trigger Policy

第一阶段默认只使用强信号触发自动沉淀：

- 用户显式结束 session
- provider CLI 真实退出
- 用户点击“归档并总结”

首发不默认基于以下弱信号自动触发：

- provider `session.idle`
- 长时间无输入输出
- thread `updated_at` 长时间不变

这些弱信号可作为未来增强能力，用于“准备总结”或“提示可总结”，但不作为首发的正式结束判定。

## UI Design

### Workbench

`Workbench` 保持当前 task/session/terminal 主流程，只增加轻量 `Session Summary` 状态区。

建议展示：

- 本次 session 是否已总结
- distill 状态
- 候选卡数量
- 最近总结时间
- `Retry Distill`
- `Open Inbox`
- `View Summary`

可选展开：

- session summary
- final conclusion
- 1~3 条候选卡预览

明确不做：

- 大量 evidence 浏览
- 卡片编辑器
- 批量审核
- 知识库搜索主入口

### Overview

`Overview` 是综合观察面，不是操作台。

首发建议包含三类信息：

工作数据：

- `Active Sessions`
- `Active Tasks / Workspaces`
- `Agent Active Hours`
- 7d / 30d 活跃趋势

成本数据：

- `Token In / Token Out`
- provider / project / task 分布
- 单 session 平均 token
- 高消耗 session 列表

沉淀数据：

- `Distilled Today`
- `Inbox Pending`
- `Promoted Cards`
- `Knowledge Kind Breakdown`
- `Recent High-Value Sessions`

允许的交互：

- 跳转 Inbox
- 跳转 Knowledge
- 跳转具体 task/session

### Inbox

`Inbox` 是候选知识审核中心。

推荐双栏布局：

- 左侧：candidate list
- 右侧：candidate detail

支持：

- 按状态 / confidence / project / tag 过滤
- 查看 summary / body / evidence / source session
- `Promote`
- `Reject`
- `Archive`
- `Retry Distill`

第一阶段 `Edit` 只做轻编辑：

- 标题
- kind
- tags
- 小范围正文修改

### Knowledge

`Knowledge` 是正式知识库，首发聚焦浏览与复用。

推荐结构：

- 左侧：kind / tag filters
- 中列：card list
- 右侧：card detail

支持：

- 搜索
- kind 过滤
- tag 过滤
- 查看 evidence
- `Open Source Session`
- `View Evidence`

第一阶段不做：

- 重型富文本编辑器
- 图谱
- 复杂版本历史

## Engineering Plan

### Main Process

建议重点扩展：

- `src/main/services/ptyManager.ts`
- `src/main/services/ptyIpc.ts`
- `src/main/services/TerminalSnapshotService.ts`
- `src/main/services/AgentEventService.ts`
- `src/main/services/CodexSessionService.ts`
- `src/main/services/DatabaseService.ts`

建议新增服务边界：

- `KnowledgeCaptureService`
- `SessionDistillationService`
- `KnowledgeQueryService` 或 `KnowledgeRepository`

责任划分：

```text
pty / session lifecycle
  -> 负责判断何时触发

distillation service
  -> 负责 prompt 构造、执行、解析

repository / query service
  -> 负责读写和页面查询
```

### Database

建议在 `src/main/db/schema.ts` 和新 migration 中新增核心表。

设计要求：

- 首版以增表为主，避免改写老表语义
- 主字段结构化，避免过度依赖大型 JSON blob
- Overview 首版优先实时聚合，不急于引入重聚合表

### Renderer

建议采用“加法”策略：

- `Workbench` 保持现状
- 新增 `OverviewPage`
- 新增 `InboxPage`
- 新增 `KnowledgePage`
- 新增 `SessionSummaryPanel`

落点建议：

- `src/renderer/views/Workspace.tsx`
- `src/renderer/components/MainContentArea.tsx`
- `src/renderer/types/electron-api.d.ts`

## Provider Compatibility

需要承认不同 provider 在以下能力上存在差异：

- 是否能稳定发送隐藏总结
- 是否能稳定返回结构化结果
- 是否暴露 token/usage 元数据

因此设计上必须允许以下字段缺失：

- `input_tokens`
- `output_tokens`
- `confidence`
- 部分 `evidence_refs`

产品 UI 不能假设所有 provider 完全对齐。

## MVP Scope

第一阶段建议按以下闭环定义完成：

```text
用户完成一个 agent session
  -> 系统自动触发 distill
  -> 生成 summary 和 candidate
  -> Workbench 可看到轻量状态
  -> 用户在 Inbox 审核一条 candidate
  -> Promote 成 card
  -> 在 Knowledge 中可搜索并打开
  -> 能回跳 source session / evidence
  -> Overview 能看到基础 usage + distill + card 统计
```

不纳入第一阶段：

- 自动去重
- 多层知识关系图
- 复杂知识编辑器
- 实时分段总结
- 仅基于 idle 的自动结束判定

## Key Risks

### Session End Misclassification

风险：将 `idle` 误判为 `ended`，导致过早总结。

对策：

- 第一阶段只用强信号
- 结束判定绑定 provider exit / explicit end，而非 idle

### Distill Quality Instability

风险：结构化输出不稳定，影响候选卡质量。

对策：

- 严格 JSON + 宽松回退
- 失败不阻塞主流程
- 人工 Inbox 审核作为质量闸门

### Weak Evidence Traceability

风险：卡片可信度不足，无法回源。

对策：

- evidence ref 结构化
- 每张卡能回到 session / task / source excerpt

### Main Workflow Disruption

风险：知识能力侵入 terminal 主流程。

对策：

- Workbench 中仅显示轻状态
- 主要知识操作集中在 Inbox / Knowledge

## Recommendation

推荐采用“串联式 MVP”作为第一阶段路线：

```text
session -> summary -> candidate -> inbox review -> knowledge card
```

原因：

- 范围收敛
- 最快验证价值
- 最符合当前 Workbench 架构
- 风险集中在可控范围内

## Open Questions

- provider 级别的隐藏总结注入方式是否需要统一抽象层
- token usage 的可观测范围在不同 provider 下有多完整
- `Open Source Session` 的回跳粒度首版做到 session 级还是 message 级
- Overview 的聚合查询在本地 SQLite 下是否需要后续增量优化
