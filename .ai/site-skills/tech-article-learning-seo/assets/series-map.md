# Series map

## 系列契约

```yaml
series_title: ""
target_reader: ""
reader_level_start: "absolute_beginner | beginner_engineer | intermediate | expert"
reader_start_state: ""
final_capability: ""
shared_environment: ""
running_project: ""
glossary_location: ""
repository_or_artifacts: ""
series_thesis: ""
final_artifact: ""
completion_test: ""
evidence_tier: "light | standard | rigorous"
deliverable_scope: "map | overview | article:<id> | batch:<ids> | full-series"
```

## 能力依赖图

```text
[基础概念 A] ─┐
              ├─> [最小实践 C] -> [机制 D] -> [生产化 F]
[基础概念 B] ─┘                    └-> [排障 E]
```

## 文章清单与篇间接口

| ID | 标题承诺 | 角色 | 主搜索意图 | 前置 | 进入状态 | 唯一能力增量 | 贯穿案例 delta | 可验证结果 | 下一篇交接 |
|---|---|---|---|---|---|---|---|---|---|
| 00 | 系列总览 | navigation | overview | 无 | 起点读者 | 选择路径 | 无 | 选出下一篇 | 进入 01 |
| 01 |  |  |  |  |  |  |  |  |  |

## 认知预算矩阵

| ID | reader_level | 目标时长 | 新术语预算 | 单节新术语 | math_budget | code_budget | 快速路线 | 超预算处理 |
|---|---|---|---:|---:|---|---|---|---|
| 01 |  |  |  |  |  |  |  |  |

相邻篇可以提升难度，但不要同时大幅提高读者前置、抽象、数学和实现复杂度。跳跃需要桥接篇或明确前置。

## 难度矩阵

| ID | 前置知识 1–5 | 抽象程度 1–5 | 实现复杂度 1–5 | 决策不确定性 1–5 | 跳跃说明 |
|---|---:|---:|---:|---:|---|
| 01 |  |  |  |  |  |

## 证据与验证策略

| ID | evidence_tier | 核心主张数 | 一手来源 | 代码/实验 | evidence_status | reader_test_status | 未核验项 |
|---|---|---:|---|---|---|---|---|
| 01 |  |  |  |  |  |  |  |

## 搜索意图重叠检查

| 文章 A | 文章 B | 查询/交付重叠 | 保持独立的理由 | 合并/重构动作 |
|---|---|---|---|---|
|  |  |  |  |  |

## 内链规则

- 所有文章 → 系列总览。
- 每篇 → 必要前置、上一篇、下一篇。
- 教程 → 原理解释；原理解释 → 实践或参考。
- 排障 → 相关机制与预防文章。
- 锚文本描述目标页面，而不是“点击这里”。
- 快速版和完整版优先使用同页阅读路线；确需分页面时给出独特交付和 canonical 策略。

## 统一资产

- 术语表：
- 认知预算基线：
- 图形规范：
- 示例数据：
- 代码版本标签：
- evidence ledger：
- 引用格式：
- 风险提示格式：
- 读者测试协议：
- 更新策略：

## 发布与维护

| ID | 发布优先级 | 学习顺序 | 更新触发器 | 最后来源核验 | 最后读者测试 |
|---|---:|---:|---|---|---|
|  |  |  |  |  |  |

## 写作交付清单

- [ ] 总览页已根据实际成稿更新，而不是停留在计划。
- [ ] 每篇有 `reader_state_in`、能力增量、验证和 `next_handoff`。
- [ ] 每篇记录贯穿案例的 before、delta、after。
- [ ] 每篇有读者等级、时长、术语、数学和代码预算。
- [ ] 每篇区分自动检查、来源语义核验、代码实验和读者测试。
- [ ] 未完成页面明确标为计划中，没有用空模板冒充正文。
- [ ] 已维护术语、证据、代码状态和 SEO 重叠台账。
