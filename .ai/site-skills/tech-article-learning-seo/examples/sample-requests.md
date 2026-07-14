# 示例请求

## 分析参考风格

```text
使用 tech-article-learning-seo 的 analyze 模式，分析下面 5 篇文章。
只提取结构、解释顺序、句段节奏、例子密度、认知预算和难度曲线；
不要复用原句、比喻或案例。
目标读者是有后端经验但不懂 LLM 的工程师。
[链接或文件]
```

## 写一篇绝对小白原理文

```text
使用 write 模式，写一篇“大模型原理入门”。

reader_level: absolute_beginner
current_knowledge: 只使用过聊天机器人
reading_time_target: 8-12m
quick_path_minutes: 3
math_budget: intuitive
code_budget: none
core_term_budget: 12
new_terms_per_h2: 2

先给训练与推理全貌，再解释 Token、向量、自注意力、预训练、后训练和逐 Token 生成。
每 1–2 个核心概念至少给一个可观察例子；公式必须逐符号翻译，并放在不阻塞主路径的位置。
说明幻觉、模型不是数据库等边界，增加复述题、迁移题和误解检查。

证据等级 standard，核心事实优先原始论文，建立 evidence ledger。
没有真实目标读者测试时，reader_test_status 使用 self_check_only，
标题不要写“保证看懂、最通俗、彻底掌握”。
```

## 写工程师入门文章

```text
使用 write 模式，写一篇“从注意力机制到 KV Cache”的技术文章。
读者等级 beginner_engineer，会 Python 和基本线性代数，但没有训练过大模型。
目标阅读 15–20 分钟，math_budget=light，code_budget=minimal，核心新术语不超过 18 个。
要求一个贯穿例子、最小计算代码、复杂度推导、常见误解、生产边界和 SEO 发布包。
核心性能结论记录环境与证据，不把自动 linter 通过称为性能已验证。
```

## 设计系列

```text
使用 series-plan 模式，设计一套“工程师学习区块链执行层”的 8–12 篇系列。
终点能力是能阅读 EVM 交易执行跟踪并诊断 Gas 异常。
每篇给唯一搜索意图、前置、可验证结果、reader_level、目标时长、术语/数学/代码预算、
难度矩阵、证据等级、内链和内容重叠检查。
相邻文章不得一次跨越两个 reader_level 或数学深度等级。
```

## 改写草稿

```text
使用 rewrite 模式重构这篇软件架构草稿。
保留事实与结论，先修复知识跳跃、段落职责和认知预算，再检查引用是否真正支持相邻主张，
最后优化标题、摘要、内链和图表建议。
输出修改后的全文、evidence ledger、validation_scope，以及按优先级排序的修改记录。
```

## 审计

```text
使用 audit 模式按 100 分量表审计文章。
重点检查：核心主张证据、来源范围与措辞强度、代码可运行性、标题承诺、读者前置、
阅读时长/术语/数学预算、关键词堆砌、参考文章相似性和系列内容竞争。

分别报告 automated_structure、source_traceability、source_semantics、code_or_experiment、
target_reader_test 和 similarity_review；不要把没有运行的检查写成通过。
```

## 写完整系列

```text
使用 series-write 模式，把“后端工程师学习 RAG 评估”写成完整系列。
交付范围为 full-series：总览页、6 篇完整正文、术语表、认知预算台账、连续性台账、
证据台账、读者测试状态和 SEO 地图。

读者会 Python，但不了解检索评估。使用一个逐篇增长的项目；每篇必须写明进入状态、
reader_level、目标时长、术语预算、能力增量、代码变更、验证、证据状态、边界和下一篇交接。
不要用大纲代替正文，不要虚构读者测试或实验结果。
```

## 按批次续写系列

```text
使用 series-write 的 batch:03,04 模式，根据现有 series-map 和前两篇正文继续写第 3、4 篇。
先检查术语、认知预算、证据状态、代码标签、reader_state_in 和 previous/next 是否连续；
只回顾完成本篇所需内容，不重新写一遍前文。
输出两篇独立 Markdown 文件，并更新 continuity-ledger、evidence ledger 与 seo-map。
```

## 真实读者试读设计

```text
为这篇 absolute_beginner 文章生成 reader-test-plan，但不要生成测试结果。
设计 60 秒复述、解释给别人听、迁移题、常见误解题和一个实际判断任务。
先写验收标准，再给观察记录表。状态保持 not_run，直到我提供真实试读数据。
```
