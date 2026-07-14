# Changelog

## 1.2.0

### Fixed

- 修复自动结构检查通过容易被误读为完整质量通过的问题；输出现在明确限定验证范围。
- 修复缺少读者等级、目标阅读时长、术语、数学和代码预算的问题。
- 修复“小白/零基础”任务仍沿用工程师默认前置的问题。
- 修复长篇入门文章没有快速阅读路径、顶层学习步骤可能过多的问题。
- 修复引用存在但无法确认是否支持相邻主张的问题。
- 修复无法区分作者自测与真实目标读者测试的问题。
- 修复标题可能使用未经验证的“保证看懂、最通俗、彻底掌握”等效果承诺的问题。

### Added

- `references/cognitive-validation.md`
- `references/evidence-validation.md`
- `assets/evidence-ledger.json`
- `assets/reader-test-plan.md`
- `scripts/evidence_lint.py`
- `tests/test_linters.py`
- 单篇和系列模板中的认知预算、证据状态和读者测试字段。

## 1.1.0

- 增加 `series-plan` 与 `series-write`。
- 增加系列总览、单篇、制作台账和系列连续性检查器。

## 1.0.0

- 初始版本：风格分析、学习设计、内容结构、SEO、单篇模板和结构检查器。
