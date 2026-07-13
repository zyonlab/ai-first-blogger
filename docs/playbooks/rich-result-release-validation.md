# 富结果发布校验

本流程为 `Article`、`VideoObject`、`ProfilePage` 和 `BreadcrumbList` 留下可审查的发布证据。它只判断页面是否满足已知技术要求与 Google 工具检查结果，不承诺富结果展示、流量或排名。

## 原则

- JSON-LD 必须描述页面上真实可见的主要内容，不能为获得搜索样式而添加无关或隐藏信息。
- 本地校验用于尽早发现模板缺字段、日期格式、绝对 URL 和面包屑顺序问题。
- Rich Results Test 用于检查 Google 支持的结构化数据；URL Inspection 用于确认正式 URL 可抓取、可渲染且未被 `noindex`、robots.txt 或登录阻断。
- 工具通过只表示获得相应搜索功能的技术资格。Google 明确说明，即使标记正确，也不保证富结果出现；结构化数据本身也不是排名保证。
- Article 当前没有 Google 必填属性。本项目仍把 headline、代表图、日期和可识别作者作为发布质量门槛，这属于项目策略，不应表述为 Google 的必填规则。

## 每次 release 的步骤

1. 构建静态站点，运行本地检查并生成待补充记录：

   ```bash
   pnpm exec tsx scripts/rich-results-release.ts inspect \
     --dist dist \
     --output content-work/rich-results/<release-id>.yaml \
     --release-id <release-id> \
     --commit <git-commit>
   ```

2. 从四种类型各选一个真实、内容可见且 canonical 正确的代表 URL。没有已发布内容的类型标记为 `not-applicable`，不要创建占位页。
3. 在 [Rich Results Test](https://search.google.com/test/rich-results) 使用代码模式检查 staging 构建；可公开抓取的正式 URL 再使用 URL 模式。保存测试链接或团队可访问的截图位置，并记录非关键警告。
4. 发布后在 Search Console URL Inspection 检查正式 URL。staging 按项目规则隔离索引，因此 staging 的 `noindex` 不能当成生产 URL 的通过证据。
5. 将 `richResultsTest`、`urlInspection` 和 `eligibilityAssessment` 更新为真实结果，再校验记录：

   ```bash
   pnpm exec tsx scripts/rich-results-release.ts validate-record \
     --file content-work/rich-results/<release-id>.yaml
   ```

6. 只有适用记录的本地检查、Rich Results Test、URL Inspection 均通过，且没有阻断问题时，才把 `releaseDecision.status` 设为 `approved`。

## 类型检查

| 类型 | 本地发布门槛 | 人工确认 |
| --- | --- | --- |
| Article | `BlogPosting`/`Article`、headline、代表图、发布日期、修改日期、可识别作者 | 标记与正文、署名、日期和图片一致 |
| VideoObject | name、thumbnailUrl、uploadDate、description、contentUrl 或 embedUrl | 视频在页面突出可见，缩略图稳定可抓取 |
| ProfilePage | mainEntity 为 Person/Organization，包含 name 或 alternateName | 页面主要内容确实是该作者或组织 |
| BreadcrumbList | 至少两个连续 ListItem，包含名称和层级 URL | 层级代表常见用户路径，不是误导性 URL 堆叠 |

## 官方依据

- [Google：结构化数据通用指南](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Google：结构化数据工作方式与发布检查](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)
- [Google：Article 结构化数据](https://developers.google.com/search/docs/appearance/structured-data/article)
- [Google：VideoObject 结构化数据](https://developers.google.com/search/docs/appearance/structured-data/video)
- [Google：ProfilePage 结构化数据](https://developers.google.com/search/docs/appearance/structured-data/profile-page)
- [Google：BreadcrumbList 结构化数据](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)

