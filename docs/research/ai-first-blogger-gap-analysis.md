# AI First Blogger 差距分析与建设路线图

审计日期：2026-07-11  
审计对象：当前 `release` 分支  
机器可执行任务清单：`content-plans/ai-first-blogger-roadmap.yaml`

实施状态：Phase 0–1、`AFB-201`～`AFB-203`、Phase 3、Phase 4，以及 `AFB-501`、`AFB-503`～`AFB-505` 已于 2026-07-11 完成。`AFB-204` 已通过 Codex 实测；Claude Code 与 OpenClaw 已进入真实运行时，但分别被本机 403/401 凭证错误阻断。`AFB-205` 的机器/人工编辑评分卡已实现，待 `AFB-204` 完成后关闭任务；`AFB-502` 同样等待跨宿主凭证恢复。

## 1. 结论

当前项目已经是一个可部署、Agent 可理解的 Astro 博客框架，但还不是成熟的 AI First Blogger 系统。

按“Agent 能否从规划、研究、写作、审核、发布到复盘稳定完成任务”衡量，当前完成度约为 **45%**；按传统成熟博客产品衡量，约为 **50%**。主要差距不是页面数量，而是：

1. 流程以文档约束为主，没有可执行、可阻断发布的质量门禁。
2. Prompt 和文章模板没有结构化版本、样例基线和回归测试，换模型或 Agent 后容易漂移。
3. SEO 基础设施已存在，但部分结构化数据不完整，也缺少 Search Console、性能和索引反馈闭环。
4. 缺少搜索、分页、定时发布、媒体处理、重定向、分析和内容保鲜等成熟博客能力。

目标不应是复制 WordPress 或 Ghost 的全部后台。更合适的方向是：

> Git 管版本，Pull Request 管审核，Astro 管展示，结构化内容合同管一致性，Agent 管执行，自动化门禁管质量，Search Console 和站点数据管反馈。

## 2. 审计范围与评分方法

本次检查了 Astro 页面与内容集合、SEO 输出、MCP、Skill、Prompt、内容 Pipeline、GitHub Actions，以及 Google、Ghost、WordPress 的官方文档。

评分含义：0 为没有设计；1 为零散文档；2 为可人工复用；3 为结构化实现；4 为自动验证并阻断错误；5 为有生产数据反馈闭环。

## 3. 当前成熟度

| 能力 | 评分 | 当前状态 | 关键缺口 |
| --- | ---: | --- | --- |
| 静态发布与部署 | 3.5/5 | Astro 静态构建、GitHub Actions、Cloudflare Pages、双分支发布 | 缺部署后自动验收、回滚说明和依赖稳定策略 |
| 内容模型 | 3/5 | 文章、视频、项目、案例集合和 draft | 缺内容状态机、来源记录、重定向和保鲜字段 |
| 成熟博客体验 | 2.5/5 | 主题、系列、目录、RSS、阅读进度、Mermaid | 缺搜索、分页、归档、相关推荐、反馈和媒体管线 |
| Agent 接入 | 3/5 | AGENTS、Skill、只读 MCP、Prompt Map | 缺安全写工具、结构化产物、任务状态和幂等执行 |
| 内容 Pipeline | 2.5/5 | 已定义研究到发布阶段 | 规则不能自动验收，阶段产物没有固定格式 |
| 模板与文风稳定性 | 1.5/5 | 有“去 AI 味”规则 | 无版本化模板、正反例、风格画像和漂移测试 |
| 技术 SEO | 3/5 | canonical、OG、sitemap、RSS、robots、基础 JSON-LD | 默认域名风险；文章图片、视频 Schema、作者实体不完整 |
| GEO / AI 可理解性 | 2/5 | direct answer、定义、FAQ、`llms.txt` 思路 | 无事实—来源映射；部分做法不是 Google 特殊要求 |
| 质量与测试 | 1.5/5 | `pnpm check` 和 `pnpm build` | 无链接、Schema、可访问性、Lighthouse、Prompt 回归测试 |
| 发布后反馈 | 0.5/5 | 文档提到维护 | 无 Search Console、索引、query 和内容更新闭环 |
| 框架可复用性 | 2/5 | 品牌数据大体集中 | 默认作者、主题 key、分类与规划仍带当前站点信息，无初始化命令 |

## 4. 与成熟博客系统的对比

Ghost 原生覆盖会员、付费订阅、Newsletter 和分析；WordPress 覆盖文章管理、分类标签、筛选、定时发布、修订和评论。当前项目应把能力分成核心、Git 原生替代和可选适配器。

| 功能 | 成熟博客常见能力 | 当前项目 | 建议 |
| --- | --- | --- | --- |
| 写作与编辑 | Web 编辑器、草稿、预览 | MDX + 本地编辑 | 保留 Git/MDX，补内容脚手架和预览链接 |
| 修订与审核 | 修订历史、角色、审核流 | Git 历史 + release | 用 PR 模板、状态字段和检查项形成审核流 |
| 定时发布 | 后台设置发布时间 | 有 `pubDate`，无调度 | 未来日期默认不发布，Actions 定时构建 |
| 分类与标签 | 分类、层级、标签归档 | topic、series、category、tags | 增加引用完整性和孤儿页面检查 |
| 搜索与归档 | 搜索、日期归档、分页 | 未实现 | 内容达到 20 篇前加入静态搜索和分页 |
| 媒体管理 | 媒体库、尺寸和元数据 | 手工文件 | 增加压缩、尺寸、alt 和 OG 生成管线 |
| 评论与反馈 | 评论、审核、反垃圾 | 未实现 | 可选适配器，不作为核心依赖 |
| Newsletter / 会员 | Ghost 原生邮件、会员、付费 | 只有 CTA 逻辑 | 有真实需求时接外部服务或 Ghost |
| 分析 | 访问、文章和来源分析 | 未实现 | 先接 Search Console，再选隐私友好站内分析 |
| 导入导出 | CMS 导入导出 | Git 文件天然可导出 | 后续增加 Ghost/WordPress 到 MDX 迁移工具 |
| 多作者与权限 | 用户、角色和作者页 | 单作者 | 核心保持单作者，多作者作为可选模式 |

### 产品取舍

- **核心必须做**：内容合同、自动门禁、搜索、分页、重定向、媒体管线、SEO 验证、Search Console 反馈。
- **用 Git 替代**：修订历史、审核、回滚和权限。
- **按需接入**：评论、Newsletter、会员、付费、多作者和 Web CMS。
- **当前不建议接 Ghost**：个人技术博客和 Agent 驱动维护不需要第二内容源。明确需要会员、邮件投递、付费或非技术作者后台时，再把 Ghost 作为 Headless CMS。

## 5. 模板漂移与 AI 文风风险

### 为什么当前会漂移

现有 Prompt 规定了字段，但没有可验证的数据结构。不同 Agent 可能跳过研究、改变 frontmatter、机械插入 FAQ、编造经验或来源，或者换模型后使用完全不同的篇幅和章节套路。

禁止词只能处理表面问题。明显的 AI 文风通常来自：每节同样长；过多对称列表和空泛总结；没有第一手约束、失败过程、数字、代码和判断依据；标题很大但正文只是二手重述；每篇都套相同的 FAQ 和结尾。

目标不是让检测器判断“像人”，而是让文章包含可验证的作者贡献。

### 建议的稳定机制

1. **结构化阶段产物**：研究、系列计划、Brief、事实表、审稿结果分别落盘并通过 Schema。
2. **内容类型模板**：tutorial、how-to、explanation、reference、opinion、case study、video companion 各自定义必需项和禁用项。
3. **作者风格画像**：记录句式、术语、立场、证据偏好和禁用套路，并保留 3–5 篇人工确认的黄金样文。
4. **事实—来源账本**：时效事实带来源、访问日期和复核日期；个人经验标记为作者输入，Agent 不得代写事实。
5. **双阶段编辑**：先检查教学结构，再检查作者声音，避免 SEO 修改把文章改回模板腔。
6. **漂移回归测试**：同一 Brief 重跑后检查字段、章节职责、术语、相似句式和禁用模式。
7. **人工批准点**：选题、Brief、事实表和发布保留明确批准状态。

## 6. Google 官方文档校准后的 SEO / GEO 判断

### 正确方向

当前的静态 HTML、canonical、robots.txt、sitemap、RSS、可抓取链接、清晰标题、作者和更新时间方向正确。

Google 对 AI Overviews 和 AI Mode 的官方说明是：**没有额外技术要求，也不需要特殊优化**。页面满足普通 Search 的索引、摘要和 people-first 内容要求即可。因此本项目中的 GEO 应定义为：

> 让真实、可靠、结构清晰的内容更容易被人和机器理解、引用与继续探索，而不是制造一套独立于 SEO 的排名技巧。

### 需要纠正的认知

- `llms.txt` 不是 Google AI 搜索收录要求，不能作为 GEO 完成标志。
- FAQ 和 direct answer 不是每篇文章固定组件，只在符合读者任务时使用。
- Schema 帮助理解和获得特定搜索展示，不保证排名或富结果。
- AI 生成不是违规；批量生成、缺少原创价值且以操纵排名为目的，可能构成 scaled content abuse。
- 不应机械修改日期；只有实质更新后才能更新 `dateModified`。

### 当前技术问题

| 优先级 | 问题 | 影响 |
| --- | --- | --- |
| P0 | 默认 URL 是 `https://your-site.example`，构建不会失败 | canonical、sitemap、robots 和 JSON-LD 可整体发布错误 |
| P0 | `VideoObject` 缺 Google 要求的 `thumbnailUrl` | 视频结构化数据不完整 |
| P0 | `llms.txt` 输出没有真实内容支撑的 topic/series | 机器入口可能链接到 404 |
| P1 | 文章 Schema 没有代表性 `image` | 文章搜索展示信息不完整 |
| P1 | 默认 OG 图片使用 favicon | 社交预览和图片搜索质量弱 |
| P1 | 关于页没有 `ProfilePage` 主实体关系 | 作者实体表达不完整 |
| P1 | 作者 URL 指向首页而非 `/about/` | 作者身份消歧较弱 |
| P1 | 项目 Schema 的 `url` 是相对路径 | Schema URL 应统一为绝对 URL |
| P1 | 没有重定向映射 | 迁移内容时容易损失链接和索引信号 |
| P1 | 没有内部链接、孤儿页和 404 自动检查 | 内容增长后信息架构会失真 |
| P2 | 没有 Search Console 和月度复盘 | 无法判断索引、query、CTR 和页面表现 |
| P2 | 没有 Core Web Vitals / Lighthouse 预算 | 页面体验只能人工观察 |
| P2 | 没有统一图片合同 | 后续图文可能产生 CLS、可访问性和图片 SEO 问题 |

### Web 体验审计摘要

当前已有 skip link、语义导航、主题 `color-scheme`、按钮标签和响应式布局基础。后续自动门禁应覆盖：

- 标题锚点统一 `scroll-margin-top`。
- 动画和阅读进度尊重 `prefers-reduced-motion`。
- 复制 Prompt 的异步状态使用 `aria-live`，并处理剪贴板失败。
- 图片强制 width、height、alt、响应式源和懒加载策略。
- 用户可见文案跟随 locale，避免中英文无意混用。

## 7. 目标架构

```text
用户目标 / 作者输入
        ↓
Research → Series Plan → Article Brief → Fact Ledger
        ↓             结构化产物 + Schema 校验
Draft → Teaching Review → Voice Review → SEO Review
        ↓             自动质量门禁 + 人工批准点
Pull Request → release 预览 → main 生产
        ↓
Search Console / Analytics / 内容保鲜队列
        └──────────────→ 下一轮规划
```

| 信息 | 单一事实源 |
| --- | --- |
| 品牌、作者、社交、域名 | `src/data/site.ts` 或后续统一配置 |
| 内容战略 | `content-plans/site-plan.yaml` |
| Pipeline 合同 | `content-plans/content-pipeline.yaml` |
| 研究、Brief、事实表 | 新增 `content-work/**` 结构化文件 |
| 已发布内容 | `src/content/**` |
| 任务状态 | `content-plans/ai-first-blogger-roadmap.yaml` |
| 发布历史和审核 | Git commit / Pull Request / Actions |
| 搜索反馈 | Search Console 导出或只读连接器 |

## 8. 分阶段任务规划

完整字段、依赖和验收条件见机器任务清单。

### Phase 0：可信发布

- `AFB-001` 定义核心、Git 替代和可选能力。
- `AFB-002` 增加配置 Schema 和生产域名失败检查。
- `AFB-003` 修复 Article、VideoObject、ProfilePage、绝对 URL 和 live-only `llms.txt`。
- `AFB-004` 增加内链、孤儿页、404、canonical 和 JSON-LD 检查。
- `AFB-005` 固定依赖或建立可控更新策略。

完成标准：错误域名、无效 Schema、404 内链或未发布内容进入公开机器入口时，CI 必须失败。

### Phase 1：可执行内容合同

- `AFB-101` 为 research、series plan、brief、fact ledger、review report 定义 Schema。
- `AFB-102` 建立不同内容类型模板和证据要求。
- `AFB-103` 增加 `content:new`、`content:validate`、`content:audit` CLI。
- `AFB-104` 加入 idea → researched → approved → drafted → reviewed → published → stale 状态机。
- `AFB-105` 让 Skill、MCP、Prompt 引用同一 Pipeline 定义。

完成标准：跳过阶段、字段缺失、引用不存在或未批准发布时，验证命令失败并给出修复建议。

### Phase 2：作者声音与证据

- `AFB-201` 建立由用户后期启用的写作风格画像、禁用模式和黄金样文合同。
- `AFB-202` 建立事实—来源账本和时效复核规则。
- `AFB-203` 检查重复结构、套话、无证据结论和标题承诺落差。
- `AFB-204` 建立 Prompt 版本和黄金 Brief 回归集。
- `AFB-205` 输出机器评分与人工检查清单，机器分数不单独决定发布。

完成标准：换 Agent 后结构兼容；关键事实有来源或作者输入；每篇能指出独有的判断、证据和限制。

### Phase 3：成熟个人发布

- `AFB-301` 静态全文搜索、分页、日期归档和标签页。
- `AFB-302` 相关推荐和上一篇/下一篇。
- `AFB-303` 图片导入、压缩、响应式、alt、caption 和 OG 图管线。
- `AFB-304` 未来日期过滤和 Actions 定时发布。
- `AFB-305` 重定向清单、旧 slug 检查和 Cloudflare 输出。
- `AFB-306` 保鲜字段、过期扫描和月度维护队列。

### Phase 4：SEO / GEO 数据闭环

- `AFB-401` Search Console 验证、sitemap 提交和月度检查。
- `AFB-402` 记录 query、page、click、impression、CTR、position 和索引问题。
- `AFB-403` 加入 Lighthouse / Core Web Vitals 预算。
- `AFB-404` 对代表页面执行结构化数据发布验证。
- `AFB-405` 用真实 query 和内容缺口更新 Brief，不按流量盲目批量扩写。

### Phase 5：适配器与生态

- `AFB-501` 一次性初始化命令，移除示例品牌并生成配置。
- `AFB-502` Codex、Claude Code、OpenClaw/OpenCode 适配与冒烟测试。
- `AFB-503` 可选 Newsletter、评论、分析和 CMS adapter。
- `AFB-504` Ghost / WordPress 到 MDX 的迁移工具。
- `AFB-505` MCP 安全写工具：dry-run、diff、允许目录、确认和幂等操作。

## 9. 推荐执行顺序

1. **迭代 A：可信发布** — `AFB-002` 至 `AFB-005`。
2. **迭代 B：结构化内容合同** — `AFB-101` 至 `AFB-105`。
3. **迭代 C：作者声音与证据** — `AFB-201` 至 `AFB-204`，用首批 3 篇真实文章校准。

不要先做会员、评论、复杂 CMS 或大规模自动写作。当前最有价值的里程碑是：同一选题交给不同 Agent，都先生成兼容的研究和 Brief；正文都能被同一验证器发现结构、事实、文风和 SEO 问题。

## 10. 任务完成定义

- 有代码、Schema 或文档作为单一事实源。
- 有自动验证；不能自动验证的部分有人工检查项。
- 有至少一个通过样例和一个失败样例。
- Skill、MCP、README 引用单一事实源，不复制易漂移规则。
- `pnpm check` 和 `pnpm build` 通过。
- SEO 改动验证 canonical、JSON-LD、sitemap、RSS、robots.txt 和公开机器入口。
- 在 `release` 预览确认后才合入 `main`。

## 11. 官方依据

### Google Search Central

- [AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Guidance on using generative AI content](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)
- [Spam policies for Google web search](https://developers.google.com/search/docs/essentials/spam-policies)
- [Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article)
- [Video SEO best practices](https://developers.google.com/search/docs/appearance/video)
- [Video structured data](https://developers.google.com/search/docs/appearance/structured-data/video)
- [Profile page structured data](https://developers.google.com/search/docs/appearance/structured-data/profile-page)
- [Breadcrumb structured data](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)
- [Site names](https://developers.google.com/search/docs/appearance/site-names)
- [Image SEO best practices](https://developers.google.com/search/docs/appearance/google-images)
- [Link best practices](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
- [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Get started with Search Console](https://developers.google.com/search/docs/monitor-debug/search-console-start)
- [Using Search Console and Google Analytics data for SEO](https://developers.google.com/search/docs/monitor-debug/google-analytics-search-console)

### 成熟博客能力参考

- [Ghost memberships](https://docs.ghost.org/members)
- [Ghost SEO](https://ghost.org/help/seo/)
- [Ghost growth and analytics](https://ghost.org/help/topic/growth-analytics/)
- [WordPress posts management](https://wordpress.org/documentation/article/posts-screen/)
- [WordPress post types and revisions](https://wordpress.org/documentation/article/what-is-post-type/)
- [WordPress categories](https://wordpress.org/documentation/article/posts-categories-screen/)

## 12. Agent 使用方式

1. 读取本文和 `content-plans/ai-first-blogger-roadmap.yaml`。
2. 只选择状态为 `ready` 且依赖已完成的任务。
3. 实现任务对应的自动验收，不只更新说明文档。
4. 更新任务状态和证据路径。
5. 在 `release` 验证后再进入生产。
