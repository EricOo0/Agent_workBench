# Agent WorkBench

本项目是基于 [generalaction/emdash](https://github.com/generalaction/emdash) fork 的桌面 Agentic Development Environment，但重点不再只是“并行跑多个 coding agent”，而是把一次 agent 会话里真正有价值的结论沉淀成可复用知识。

[English](./README.md) | 简体中文

## 这个 fork 的定位

原版 Emdash 的强项是：

- 多 provider CLI agent 并行工作
- git worktree 隔离
- 本地 / SSH 远程开发
- diff / PR / CI 协作链路

这个 fork 在保留上述基础能力的前提下，新增了一层 **Knowledge Workbench**，目标是解决一个更现实的问题：

> agent 把活干完了，但有价值的方法、结论、排障路径，最后都留在终端滚动记录里，没有变成长期资产。

## 本项目新增的亮点

### 1. Session Summary Distillation

当一次 provider 会话退出后，WorkBench 会自动尝试对这次 session 做摘要提炼，而不是让结果淹没在终端历史里。

特点：

- 以 `agent session` 为原子，而不是以 task 完成为唯一总结时机
- 支持失败重试
- 可以直接看到失败原因和原始输出

### 2. Inbox Review

一次 session 可以提炼出 **0 到多张**候选知识卡片。

设计原则：

- 没有明显价值时，允许不产出卡片
- 只保留可复用、可传播、值得积累的内容
- 降低“为了有卡片而产卡片”的噪音

### 3. Knowledge Library

被确认有价值的候选卡片，可以 Promote 成正式知识卡，进入知识库。

知识库适合沉淀：

- 可复用实现模式
- 稳定技术决策与取舍依据
- 排障经验、根因与修复路径
- 工作流规范、坑点与 guardrail

### 4. Overview

新增 Overview 页面，用来观察：

- active sessions / active tasks
- distillation 产出
- promoted cards
- token usage
- agent active hours

它不是“又一个列表页”，而是帮助你判断：

> 这个工作台最近到底有没有持续产出高价值知识。

### 5. 可编辑的 Distillation Prompt

摘要提炼的 prompt 不再是写死的。

你可以在应用里直接修改默认 distillation prompt，按照团队偏好定义“什么才算值得沉淀的知识”。

当前默认策略是：

- 一个 session 可产出 0~N 张卡片
- 没有明显价值时允许空结果
- 优先提炼高价值、可复用、可传播、可积累的信息

## 为什么不是简单复述原版功能

这个 fork 当然还保留了原版项目的核心基础设施，但首页强调的应该是 **新增能力**，而不是重复介绍 upstream 已经很完整的 provider 列表。

所以这个仓库的 README 重点放在：

- 新增了什么
- 为什么这些新增能力值得存在
- 这些能力如何改变日常的 agent 工作流

如果你想了解 upstream 的完整 provider / integration / packaging 能力，请参考：

- 上游仓库：<https://github.com/generalaction/emdash>
- 上游文档：<https://docs.emdash.sh>

## 本地开发

```bash
pnpm install
pnpm run dev
```

## 本地打包

```bash
pnpm run build
pnpm run package
```

当前仓库使用 Electron + electron-builder，打包产物默认输出到：

```bash
release/
```

如果只打某个平台：

```bash
pnpm run package:mac
pnpm run package:linux
pnpm run package:win
```
