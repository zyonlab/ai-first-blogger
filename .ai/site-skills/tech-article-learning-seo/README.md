# tech-article-learning-seo

一个面向 AI/大模型、区块链、软件架构、编程与工程实践的技术文章写作 Skill。它把主题组织成原创、易理解、可验证且搜索友好的单篇或系列内容。

当前版本：**1.2.0**

## 核心能力

- 分析参考文章的结构、解释顺序、语言节奏和难度曲线，但不复制原句、案例或叙事。
- 规划并撰写单篇文章的知识依赖、教学单元、证据和 SEO 发布信息。
- 为不同读者设置 `reader_level`、阅读时长、术语、数学和代码认知预算。
- 为小白长文提供同页快速路线和完整路线，避免重复页面。
- 使用主张—证据台账核验引用是否真正支持结论，而不只检查链接存在。
- 明确区分自动结构检查、作者自测、来源语义核验和真实目标读者测试。
- 设计系列地图、篇章角色、难度递进、搜索意图边界和内链图。
- 使用 `series-write` 撰写总览页、指定批次或完整系列正文。
- 管理篇间读者状态、认知预算、术语、贯穿案例、代码版本、证据和下一篇交接。
- 审计技术正确性、学习体验、证据可信度、连续性、原创价值与 SEO 发布质量。

## 模式

```text
analyze       分析参考文章的可复用写作机制
plan          规划单篇文章和认知预算
write         写完整单篇文章
rewrite       重构已有草稿
series-plan   设计系列地图与文章契约
series-write  写系列总览和完整正文
series        根据“规划”或“写作”意图自动路由
audit         审计单篇或系列
```

## 目录

```text
tech-article-learning-seo/
├── SKILL.md
├── references/
│   ├── style-analysis.md
│   ├── learning-design.md
│   ├── cognitive-validation.md
│   ├── content-patterns.md
│   ├── evidence-validation.md
│   ├── seo-playbook.md
│   ├── series-architecture.md
│   ├── series-writing.md
│   └── qa-rubric.md
├── assets/
│   ├── article-brief.md
│   ├── style-profile.md
│   ├── article-template.md
│   ├── evidence-ledger.json
│   ├── reader-test-plan.md
│   ├── series-map.md
│   ├── series-overview-template.md
│   ├── series-article-template.md
│   └── series-production-board.md
├── scripts/
│   ├── article_lint.py
│   ├── evidence_lint.py
│   └── series_lint.py
├── tests/
│   └── test_linters.py
├── examples/
│   └── sample-requests.md
├── CHANGELOG.md
└── LICENSE
```

## 安装

将整个目录复制到支持 Agent Skills 的客户端所要求的 Skills 目录，或按客户端的自定义 Skill 导入方式上传。目录名保持为 `tech-article-learning-seo`。

## 写一篇小白原理文

```text
使用 tech-article-learning-seo 的 write 模式，写一篇“大模型如何工作”。

读者等级：absolute_beginner；只使用过聊天机器人，不要求数学和编程。
目标时长：8–12 分钟；快速路线：3 分钟。
数学预算：intuitive；代码预算：none。
核心新术语不超过 12 个，每个 H2 最多引入 2 个。

先给训练/推理全貌，再按 Token、向量、自注意力、预训练、后训练和生成推进。
至少使用一个贯穿例子、一个反例和一个迁移自测。
核心事实使用一手论文，建立 evidence ledger；没有真实目标读者测试时，
reader_test_status 保持 not_run 或 self_check_only，不要声称“小白一定看懂”。
```

## 写完整系列

```text
使用 series-write 模式，完成一套“从零理解 RAG 到生产评估”的 6 篇系列。

读者会 Python，但不了解向量检索。交付 full-series：系列总览、6 篇完整
Markdown 正文、术语表、认知预算台账、连续性台账、证据台账和 SEO 地图。

使用一个逐篇增长的项目。每篇只有一个能力增量，写清进入状态、认知预算、
本篇变更、可验证结果、失败边界、证据状态和下一篇交接。不要用大纲代替正文。
```

更多请求见 `examples/sample-requests.md`。

## 自动检查

### 单篇结构、预算和引用编号

```bash
python scripts/article_lint.py path/to/article.md --report
python scripts/article_lint.py path/to/article.md --primary-query "RAG 评估"
python scripts/article_lint.py path/to/article.md --strict
python scripts/article_lint.py path/to/article.md --report --json
```

`article_lint.py` 会检查：

- H1、标题层级、重复标题、代码围栏、图片 alt 和链接文本；
- `reader_level`、阅读时长、术语、数学和代码预算元数据；
- 长句、顶层学习步骤、快速路线和理解检查等粗略风险；
- 数字引用与编号参考资料是否对应；
- evidence ledger、reader test report 的声明与文件是否一致。

### 主张—证据可追踪性

```bash
python scripts/evidence_lint.py path/to/evidence-ledger.json \
  --article path/to/article.md
python scripts/evidence_lint.py path/to/evidence-ledger.json --strict --json
```

`evidence_lint.py` 会检查 ledger 字段、核心主张状态、`<!-- claim:C01 -->` 标记和引用邻接。它**不会独立阅读来源**，因此不能证明语义支持关系正确；写作者或审阅者仍需实际核对来源。

### 系列连续性

```bash
python scripts/series_lint.py path/to/series
python scripts/series_lint.py path/to/series --json
```

`series_lint.py` 会检查文章 ID、篇次、必填元数据、前置依赖、导航互指、主查询重复、认知等级跳跃、验证字段和模板化开场等风险。

### 运行自测

```bash
python -m unittest discover -s tests -v
```

## 如何解释检查结果

- `STRUCTURE PASS`：没有发现工具能识别的结构、预算或引用编号问题。
- `TRACEABILITY PASS`：证据台账和正文标记可以追踪。
- 两者都不等于技术事实正确、来源语义已核验或真实读者已经看懂。
- 最终发布应同时报告 `validation_scope` 和仍未核验的项目。

## v1.2.0 修复内容

- 新增四级读者画像和认知预算。
- 新增小白长文快速路线与渐进披露规则。
- 新增证据语义核验方法、JSON ledger 和可追踪脚本。
- 新增真实目标读者测试模板，禁止虚构测试结果。
- 自动检查输出改为限定范围的 `STRUCTURE PASS` / `TRACEABILITY PASS`。
- QA 门禁新增理解承诺、证据强度、虚假审阅和虚假读者验证检查。
