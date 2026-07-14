---
title: ""
description: ""
slug: ""
author: ""
date: ""
updated: ""
series_id: ""
series_title: ""
article_id: ""
part: 0
status: "planned | draft | verified | reviewed | published | stale"
role: "foundation | first-success | mechanism | extension | troubleshooting | comparison | production | capstone | reference"
previous: ""
next: ""
prerequisites: []
reader_state_in: ""
reader_level: "absolute_beginner | beginner_engineer | intermediate | expert"
math_budget: "none | intuitive | light | formal"
code_budget: "none | pseudocode | minimal | production"
reading_time_target: "8-12m"
quick_path_minutes: 0
core_term_budget: 8
learning_outcome: ""
new_core_concepts: []
non_goals: []
running_example_before: ""
running_example_delta: ""
running_example_after: ""
validation: ""
evidence_tier: "light | standard | rigorous"
evidence_status: "not_started | draft | source_checked | peer_reviewed"
evidence_ledger: ""
reader_test_status: "not_run | self_check_only | pilot_run | target_reader_passed | needs_revision"
reader_test_report: ""
primary_query: ""
search_intent: ""
canonical: ""
---

# {{准确兑现本篇唯一承诺的标题}}

> **系列位置：** 第 {{part}} 篇，共 {{total}} 篇。返回[系列总览]({{overview_link}})。<br>
> **进入本篇前：** {{reader_state_in}}<br>
> **本篇新增：** {{running_example_delta 或能力增量}}<br>
> **完成标志：** {{validation}}

**预计阅读：** {{reading_time_target}}<br>
**新增核心术语：** {{new_core_concepts}}<br>
**证据状态：** {{evidence_status}}

## 先给答案

用一小段直接回答本篇主要问题，并说明适用条件。不要从整个领域的历史开始。

## 阅读路线（预计超过 10 分钟或绝对小白时使用）

- **快速恢复与结论：** 阅读“先给答案”→“当前问题”→“验证”→“决策总结”。
- **完整学习：** 顺序阅读本篇全部章节。
- **进阶细节：** 明确标注，不阻塞本篇唯一能力增量。

## 从上一状态到当前问题

用 1–3 句恢复必要上下文：上一篇得到了什么，现在为什么仍不够。本篇应能被跳读者理解，但不要重写前文。

### 本篇范围

- 会完成：
- 不讨论：
- 需要的环境或版本：
- 本篇认知预算：

## {{第一个真实子问题}}

先写本节结论，再按需要使用：直觉 → 定义/机制 → 示例 → 结果 → 边界。单个 H2 不超过本篇新术语和难度跳跃预算。

### {{贯穿案例的本次变更}}

变更前状态：

```text
{{running_example_before}}
```

本篇变更：

```text
{{最小完整代码、配置、命令、架构决策或实验}}
```

预期结果：

```text
{{可观察输出、指标、测试或行为}}
```

说明为什么会得到这个结果，以及修改了哪些文件、组件或假设。

> **检查点：** 读者此刻应该能解释或完成什么？

## {{第二个真实子问题}}

只在完成本篇承诺所必需时继续增加章节。每个 H2 只推进一个子问题；进阶公式、源码或性能分析可移到明确的可选节。

## 验证本篇结果

给出可重复的验收步骤：

1. 输入或前置状态：
2. 执行方式：
3. 预期输出：
4. 失败信号：
5. 回滚或恢复方式：

## 常见失败与边界

| 观察或约束 | 可能原因 | 如何验证 | 修复或替代 |
|---|---|---|---|
|  |  |  |  |

说明何时不适用、哪些结论依赖版本/环境，以及不要做什么。

## 当前状态快照

```yaml
article_id: "{{article_id}}"
capability_now: ""
running_example_after: "{{running_example_after}}"
files_or_components_changed: []
verified_by: "{{validation}}"
known_limitations: []
code_tag_or_snapshot: ""
cognitive_budget_result: "within_budget | exceeded_with_reason | needs_revision"
evidence_status: "{{evidence_status}}"
reader_test_status: "{{reader_test_status}}"
```

## 决策总结

用几条条件化规则收束，例如“当……时选择……；当……时不要……”。不要逐节复述目录。

## 理解自测

- 不看前文，复述本篇新增能力和它依赖的上一状态。
- 用自己的例子解释一个本篇核心机制。
- 完成一个正文未直接给答案的迁移问题。

自测不等于真实目标读者测试。

## 下一步

现在已经能 {{当前能力}}，但在 {{尚未解决的约束}} 下仍会遇到 {{新问题}}。下一篇《{{next_title}}》将解决 {{下一篇唯一承诺}}。

- 上一篇：
- 下一篇：
- 返回系列总览：
- 必要的深入解释或参考页：

## 方法与核验说明

```yaml
validation_scope:
  automated_structure: "not_run | passed | issues_found"
  source_semantics: "not_run | source_checked | peer_reviewed"
  code_or_experiment: "not_applicable | not_run | verified | partially_verified"
  target_reader_test: "not_run | pilot_run | target_reader_passed | needs_revision"
  unverified_items: []
```

## 参考资料

优先列官方文档、标准、论文、源码和可复现实验。必要时标版本、核验日期和证据边界；核心主张与 evidence ledger 对应。
