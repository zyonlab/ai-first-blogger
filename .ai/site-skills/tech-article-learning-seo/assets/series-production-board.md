# Series production board

## 系列契约

```yaml
series_id: ""
series_title: ""
series_thesis: "帮助【读者】从【起点】到【终点】，通过【贯穿项目】掌握【知识域】"
target_reader: ""
reader_level_start: "absolute_beginner | beginner_engineer | intermediate | expert"
reader_start_state: ""
final_capability: ""
final_artifact: ""
completion_test: ""
shared_environment: ""
running_project: ""
evidence_tier: "standard"
non_goals: []
deliverable_scope: "map | overview | article:<id> | batch:<ids> | full-series"
```

## 制作状态

| ID | 语义标题 | 角色 | 前置 | 进入状态 | 唯一能力增量 | 验证 | 正文状态 | 技术审阅 | 连续性审阅 | SEO 审阅 |
|---|---|---|---|---|---|---|---|---|---|---|
| 00 | 系列总览 | navigation | 无 | 起点读者 | 选择学习路径 | 能选出下一篇 | draft |  |  |  |
| 01 |  |  |  |  |  |  | planned |  |  |  |

状态建议：`planned`、`evidence-ready`、`draft`、`verified`、`reviewed`、`published`、`stale`。

## 认知预算台账

| ID | reader_level | 目标时长 | 实测估算 | 核心术语预算/实际 | math_budget | code_budget | 快速路线 | 状态 |
|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |

状态使用：`within_budget`、`exceeded_with_reason`、`needs_revision`。数值是编辑预算，不是固定排名规则。

## 篇间接口台账

| ID | reader_state_in | running_example_before | 本篇 delta | running_example_after | next_handoff |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## 术语台账

| 规范术语 | 简单解释 | 精确定义 | 首次引入 | 可用缩写 | 禁用/易混表达 | 允许更新的篇 |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |

## 代码与环境状态

| ID | 版本/标签 | 修改文件或组件 | 运行命令 | 预期结果 | 回滚点 | 已验证环境 |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |

## 主张与证据台账

| claim_id | 主张 | 使用文章 | 主张类型 | 一手来源与定位 | 范围/强度匹配 | 限定与边界 | 核验状态 |
|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |

核心主张的详细记录使用每篇 `evidence-ledger.json`。本表只管理跨篇重复、版本冲突和负责页面。

## 读者验证台账

| ID | reader_test_status | 目标画像 | 验收标准 | 参与者范围 | 关键误解 | 修改/复测 | 报告位置 |
|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |

没有真实测试时不得填写虚构参与者或结果。

## SEO 与内容边界

| ID | 主查询 | 搜索意图 | 独特交付 | 不覆盖 | 可能竞争页 | 合并/区分动作 |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |

## 共享视觉与资源

| 资产 | 负责解释的主页面 | 可复用页面 | 版本 | 更新触发器 |
|---|---|---|---|---|
| 系统总图 |  |  |  |  |
| 术语图 |  |  |  |  |
| 示例数据 |  |  |  |  |

## 上游修改影响

| 修改文章 | 修改内容 | 受影响下游 | 必须复核的术语/代码/证据/链接/结论 | 状态 |
|---|---|---|---|---|
|  |  |  |  | pending |
