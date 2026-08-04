# 能力清单（Capability Map）

这份文档梳理 AI First Blogger **当前已经具备**的能力、每项的实现位置与边界，以及
仍未兑现的部分。它是一张地图，不是契约——规则以 `docs/specs/` 下的契约文档为准。

- 契约（规则本身）：`docs/specs/`
- 走查（怎么做）：`docs/recipes/`、`docs/playbooks/`
- 决策（为什么这么设计）：`docs/adr/`

一句话定位：**内容是文件，规则是脚本**。能写成一条脚本可判定的规则的事交给管道，
剩下的判断留给人。

---

## 0. 仓库形态

三个包已发布到 npm，装了就能用：

```bash
npm create aifb@latest my-blog        # 骨架，每个待决策的值都写着 TODO
npm create aifb@latest my-blog --example agent-native-engineer
```

| 包 | 作用 |
|---|---|
| `aifb-engine` | Astro 集成：注入路由、解析别名、提供主题、产出部署产物 |
| `aifb-cli` | 管道，命令是 `aifb` |
| `create-aifb` | 脚手架 |

这个仓库本身是 pnpm workspace，**根目录就是站点**（框架自己的 dogfood 站）：

```
site/       意图 + 策略 — 人来决定的（YAML + Markdown，塞不进代码）
content/    素材        — 文章
packages/
  engine/   aifb-engine  Astro 集成：注入路由、解析别名、提供主题、产出部署产物
  cli/      aifb-cli     前置检查 · 29 条规则 · 风格分析 · context · 指标 · 迁移
  create/   create-aifb   脚手架
examples/   参考站点（构建时不读取）
```

一个真实站点的仓库只有前两样加几个配置文件。划分依据不是「谁编辑这个文件」，而是
**谁来判断对错**：

| | 判据 | 位置 |
|---|---|---|
| **意图** | 换个人运营会选得不一样，且没有唯一正解 | `site/*.yaml`、`site/voice.md` |
| **策略** | 引擎有合理默认值，但站点可以不同意 | `site/policy.yaml` |
| **机制** | 只有一种正确实现，改了只会改坏 | `packages/` |

对 agent 就是一句话：**意图进 `site/`，文章进 `content/`，`packages/` 不碰。**
决策记录：`docs/adr/0002-three-planes.md`、`0003-workspace.md`。

**别读整个 `site/`**（约 9k token）。`aifb context <task>` 只打印该任务需要的那一片，
实测省 79%；`write` 还会给出**真实可内链的页面清单**——这是配置文件里没有的东西。

---

## 1. 出厂即拒绝：规划前置检查

`site/` 出厂是**骨架**，每个待决策的值都写着 `TODO`。`aifb validate` 和
`aifb context write` 在规划完成前**双双拒绝**——不是多报几条违规，而是一条内容规则都不跑。

> 闸门回答「这篇能不能发」，回答不了先决问题：**有没有一个站可发**。
> 拿一篇文章去校验一个没规划的站，过的每条规则都没有意义。

七个领域，两类检查：

| 领域 | 问什么 |
|---|---|
| `identity` | 谁在发布，Person schema 说的是不是真话 |
| `domain` | canonical origin 是不是真域名（唯一推迟就有破坏性的决定） |
| `copy` | About / hero 描述的是这个站还是这个框架 |
| `taxonomy` | 分类是你的吗，描述读起来像你写的吗 |
| `template` | storageKey、theme-color 与 `--bg` 是否一致、OG 图是否真实存在 |
| `voice` | 有没有可写作的语气，**它的语言和站点语言是否一致** |
| `ai` | llms.txt 覆盖、每个类型有没有内容目录、有没有可内链目标 |

- **placeholder**（决策没做）——读文件里的 TODO，精确到 `site/site.yaml:13 → name`
- **structural**（决策做错了）——在写好的站上同样会发生，终身有效

逃生舱：`policy.yaml` 的 `planning.acknowledged: [template]` 按领域显式豁免，每次运行都打印。
**有意保留默认可以，静默保留不行。**

---

## 2. 站点规划 · 分类 · 内容类型

| 文件 | 装什么 |
|---|---|
| `site/site.yaml` | 品牌、作者、社交、hero、主题选择、`titleTemplate`、静态导航 |
| `site/taxonomy.yaml` | **pillars + topics + series 三合一**；category 从 topic key 派生 |
| `site/content-types.yaml` | 每个类型的 route、标签、surfaces |
| `site/pages.yaml` | 静态页文案 |
| `site/redirects.yaml` | URL 历史 |

**pillar 没有 topic 认领 = 构建失败**。策略和站点是同一份文件，漂不开——这正是被它取代的
`content-plans/site-plan.yaml` 的失败模式：写了没人读。

**内容类型是两半**：yaml 管路由/标签/surfaces，`packages/engine/content-types/` 管
schema/JSON-LD/组件。语义是**菜单**：引擎提供四种，yaml 决定发布哪几种。没被声明的
不发布（路由、导航、llms.txt 分区全部消失）；声明了引擎没有的仍然报错并列出可选项。

`titleTemplate` 决定页面标题怎么拼。站名长的站可以设成 `'{title}'` —— 后缀吃掉的是
SERP 的 60 列预算，这是站点的选择，不是布局的。

---

## 3. 模板自定义

**两层**：token 改样子，`site/templates/` 改结构。

```
site/templates/components/Footer.astro    覆盖引擎的同名组件
site/templates/cards/ArticleCard.astro    覆盖，或新增一种卡片
site/templates/layouts/BaseLayout.astro   连布局一起接管
site/templates/pages/index.astro          整页替换，URL 不变
```

存在即生效，不用注册。这是 WordPress/Ghost 子主题那套，但有一个区别：**闸门不管
markup 是谁写的**。实测覆盖一个跳过 `BaseLayout` 的首页 → C-01/C-07/C-16 三条同时报错、
构建阻断。**随便改，但改坏了发不出去**——这才是敢把覆盖层交给用户的原因。
契约：`docs/specs/templates.md`。

### token 层

一个主题 = 一个 CSS 文件里的两个 token 块。**主题归站点**（`site/themes/`），引擎通过
集成提供的虚拟模块拿到它——包不该知道装它的项目怎么摆文件。只发出当前主题，未使用的
不进产物。

三条规则守着：

- **C-12 按块比对**：base 与 alternate 各自对齐参考主题。只查「文件里有没有」会放过
  「alternate 块缺了某个 token」——那个模式会继承**另一个模式的颜色**
- **C-13 扫结构 CSS 与所有组件**：Mermaid 图表的配色已改为读主题 token，不再是两套写死的调色板
- **前置检查**：`theme.colorDark/Light` 必须和主题的 `--bg` 一致

---

## 4. 写作风格自定义

`site/voice.md` 一个文件，两种读者：

```
frontmatter signals:  →  aifb analyze 读它，产出可重算的分数
Markdown 正文:        →  写作的 agent 读它，决定语感
```

分工不是重复：短语表判断不了「这段话有没有信息量」，正文也变不成退出码。
`policy.style.voice` 指定用哪个，所以一个站可以备几套。

可声明：`avoid`（命中扣分，可 `cap` 封顶）、`avoid.combo`（需共现才算，避免误伤正常表达）、
`expect`（整组零命中才扣）、`thresholds`（顿号阈值、代码占比、首段宽度）。

**已验证是真数据驱动**：同一篇布道腔文章，示例站 voice 得 0 分，骨架 voice 得 60 分——
40 分差额全部来自站点自己声明的信号。

---

## 5. 发布闸门：29 条规则

`aifb validate` → `validate-report.json`，error 非零则退出码 1。

| 组 | 规则 | 问什么 |
|---|---|---|
| 结构 | C-01…C-11 | OG 图、内链下限、死链、孤儿页、标题/描述长度、canonical 同源、slug、标题层级、必填字段 |
| 主题 | C-12 C-13 | token 按块完整、结构 CSS 与组件无硬编码色 |
| 整站站内 SEO | C-14…C-23 C-28 C-29 | title/description **站内唯一**、单一 H1、img alt、锚文本、**路由结构**、noindex↔sitemap、薄列表页、ItemList 与页面一致、详情页类型、**每个锚点可跟随**、**渲染后的标题层级** |
| 中文排版 | C-24 | zhlint，规则来自 policy，zh-* locale 自动启用 |
| 源码级链接 | C-25 | 不构建就解析，并说明**为什么**不可链 |
| **内容质量** | C-26 C-27 | 正文实质（代码不算）、风格分下限（默认关闭） |

几个设计点：

- **显示列而非字符数**：CJK 占两列，一套阈值在任何语言下成立
- **每条违规必须带 `fix`**，写成可执行指令
- **skipped ≠ passed**：跳过的规则记进 `rulesSkipped`；草稿剔除并计数；零内容会明说
- **阈值全在 `site/policy.yaml`**，覆盖项记入报告
- **自测**：每条规则一正一反两个上下文；policy 门控的规则单独用显式阈值验证

C-26/C-27 回答的是其余全部规则都可能为真却仍然为空的问题：**这篇文章有没有说什么**。
两个下限都刻意定低——C-06 的教训是「描述长度下限被迫下调两次，因为它一直在误伤好的短句」。

---

## 6. deslop：不只是文章

`aifb analyze` 覆盖两类文本：

1. **文章正文** —— 完整扣分明细，带 `file:line` + `fix`
2. **门面文案** —— `site/*.yaml` 里所有会露出去的字符串，并说明**它出现在哪**

第二类是关键：topic description 直接是分类页的 meta description 和 `llms.txt` 条目。
之前「全面解析」写在文章里扣分、写在 topic description 里畅通无阻——而后者出现在更多页面上。

门面文案是 warn，永不阻断。文章分数默认也不阻断；`policy.style.minScore` 设了数才由
C-27 接管，且与 analyze **共用一份打分实现**，报告和闸门不可能对同一篇文章给出不同结论。

---

## 7. SEO / GEO 输出

sitemap · `/rss.xml` · `/robots.txt` · `/llms.txt` · canonical · Open Graph · Twitter Card ·
可见面包屑 · JSON-LD（Person / Article / VideoObject / CreativeWork / BreadcrumbList /
CollectionPage / ItemList）。

`llms.txt` 分区**从注册表派生**——声明了 `surfaces.llms` 的类型自动覆盖。
`aifb metrics` 把 `geo.coverage` 当核心指标：不在 `llms.txt` 里的类型对 AI 摘要器等于不存在。

`aifb audit:seo` 跑 Lighthouse 全站审计，**独立 job、不阻断**——它要 Chrome、跑几分钟，
而闸门跑一秒；放进阻断路径等于拿确定性换一个和自己重叠的审计。

---

## 8. 部署（Cloudflare Pages）

```
PR:    framework tests → check → build(preview) → validate → 预览部署
main:  framework tests → check → build → validate → metrics/analyze → 部署 → lighthouse
```

**框架自测门控部署**：`validate` 证明内容可发布，证明不了检查本身还有效——这个项目已经
五次出现「规则存在但接在空处」，每次 `validate` 全程绿。

**预览必须三处一致**：noindex meta + `robots.txt` disallow + 不生成 sitemap。少改一处
就是 C-20 要抓的自相矛盾。canonical 仍指向生产。

**构建产物**：
- `_redirects` ← `site/redirects.yaml`，迁移改 slug 时**自动追加**，目标必须是真实页面否则中断构建
- `_headers` ← 指纹资源 immutable 一年、图片一天、HTML 必须重验证，加三个安全头

环境变量三类：构建期公开（`PUBLIC_SITE_URL`、`DEPLOY_CONTEXT`）、部署期密钥（GitHub Secrets）、
CI 自带。契约在 `.env.example` 和 `docs/specs/deployment.md`。

---

## 9. 指标、迁移、AI 操作层

**`aifb metrics`** —— T1 复用成本（品牌串从 `site.yaml` 派生，跟着站点走）· T2 扩展成本 ·
T3 闸门覆盖 · 内链密度 · 孤儿页 · GEO 覆盖。零内容时打 `–` 而不是 `✗`。

**`aifb migrate:ghost`** —— HTML→MDX，映射表出厂为空且类型从 taxonomy 派生，
迁移前整表校验；改了 slug 自动写进 `site/redirects.yaml`。

**AI 操作层** —— `AGENTS.md`（一句话边界 + 完成前必须跑什么）、`.ai/skills/`、
`prompts/`（intake · 内容计划 · 文章 brief · SEO/GEO 审计 · 部署）、`docs/playbooks/`。
护栏：不改 DNS、不提交密钥、不手写派生表面、**不为让构建通过而消音规则**。

**发布** —— 三个包共享一个版本号（`create-aifb` 把另外两个钉在自己的版本上），由 tag 触发。
`pnpm release:check` 在打 tag 前拦住版本不一致、占位符、以及「改了 `packages/` 却没升版本」——
最后这条是这个仓库特有的风险：站点走 workspace 链接，本地全绿也证明不了 npm 上的包是新的。
契约：`docs/specs/releasing.md`。

**回归测试** —— `aifb test:scenarios` 16 个场景驱动真实管道跑真实文件（换主题、换 voice、
**覆盖模板**、破坏 taxonomy、预览构建、死重定向），每个双向断言。它抓到过 self-test 抓不到的东西：
包化时主题路径静默失效，5 个场景当场变红。

---

## 10. 仍未兑现

| 项 | 状态 | 说明 |
|---|---|---|
| **`aifb` 这个包名用不了** | 已绕开 | npm 防仿冒过滤判定它与 `ai`/`idb`/`diff` 太像。包名是 `aifb-cli`，**命令仍是 `aifb`** |
| **打包后的站点无法新增内容类型** | 架构限制 | 能从菜单点，加不了新菜——引擎那一半没地方放。`engine({ contentTypes: [...] })` 是答案，未做 |
| **加语言仍要动引擎** | 有意为之，可重议 | 随框架发布的翻译属于产品，只有「选哪个语言」是意图（ADR 0002） |
| **主题不随版本升级** | 「主题归站点」的代价 | 脚手架复制而非依赖 |
| 内容 AST 校验 | 未做 | C-02/C-09 用正则读 MDX，JSX 形式的链接与标题不计入 |
| 外链有效性 | 不检查 | 会让 CI 依赖第三方可用性；应是独立定时任务 |
| 单篇 OG 图 | 未做 | 只有站点级兜底；C-01 只验格式不验尺寸 |
| 无障碍规则 | 部分 | C-29 查渲染后的标题层级（无需真 DOM）；对比度、焦点顺序这类仍靠 Lighthouse 独立 job |
| `engine/lib` 单元测试 | 零覆盖 | `assertSameOrigin` 这类函数直接决定 SEO 正确性 |
| 多语言路由 | 不支持 | 框架与语言无关，一个构建一种语言 |
| 流量 / 排名 | 不测 | 在仓库之外——这套工具衡量的是**结构上是否具备**排名能力 |

---

## 11. 这个项目最容易犯的错

值得单独记一笔，因为它已经发生五次：**能力建好了，但接在空处。**

| 实例 | 表现 | 被什么抓到 |
|---|---|---|
| 主题色一致性检查 | `split(/(?=^:root)/)` 的索引错位一格，从未运行 | 手工换主题 |
| C-12 | 只查 token 在文件里出现过，漏掉 alternate 块 | 手工造缺失 |
| C-22 | 按 `<article>` 计数，把正确的分类页判成不一致 | 写真实文章 |
| 回归测试本身 | 12 个场景建好了，CI 一个都不跑 | 按目标复查 |
| 组件覆盖 | `enforce: 'pre'` 插件排在 `resolve.alias` **之后**，`@components/*` 的覆盖永远不生效；构建日志照旧报「N overridden」（那是页面覆盖，走另一条路） | 拿 example 站点照着参考站改模板 |

第五个实例最值得看：它没有任何报错，日志还是绿的，只有把覆盖文件写出来、
构建、然后去 `dist/` 里 grep 才发现渲染的还是引擎的 markup。

共同点是**验证的是零件，不是链路**。`validate:self-test` 证明每条规则能抓自己的
违规，证明不了它接在真实链路上；「日志说覆盖了 2 个」证明的是计数器，不是页面。
`test:scenarios` 就是为此而建，现在**由 CI 门控部署与发布**，并且新增能力的验收
标准是：**能不能写出一个从输入到 `dist/` 的断言**。写不出来，就说明这个能力还没接上。

---

## 相关文档

- `docs/getting-started.md` — fork 到上线
- `docs/specs/content-contract.md` — 什么叫「可发布」（29 条规则 + 前置检查）
- `docs/specs/deployment.md` — 流水线、预览契约、部署产物、环境变量
- `docs/specs/validation-pipeline.md` — 闸门机制与扩展方式
- `docs/specs/site-config-contract.md` · `taxonomy.md` · `theming.md` · `i18n.md` · `metrics.md`
- `docs/recipes/` — 加内容类型 / 加主题 / 加语言
- `docs/adr/` — 0001 注册表 · 0002 三平面 · 0003 workspace
