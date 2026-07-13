# 页面体验预算

`content-plans/page-experience-budgets.yaml` 为首页、文章、视频和作者页定义统一的移动端 Lighthouse 回归预算。预算测量至少运行三次并取中位数，避免单次环境波动直接决定发布。

## 使用

先运行确定性检查：

```bash
pnpm exec tsx scripts/page-experience.ts validate
```

构建后同时检查渲染图片是否保留宽高：

```bash
pnpm exec tsx scripts/page-experience.ts validate --dist dist
```

向 Lighthouse 或 Lighthouse CI 提供标准预算数组：

```bash
pnpm exec tsx scripts/page-experience.ts lighthouse-budgets > /tmp/lighthouse-budgets.json
```

CI 集成应分别采集四种代表 URL，使用移动端配置运行三次，并对中位结果执行预算断言。合成测试是回归护栏，不替代 Search Console Core Web Vitals 等真实用户数据。

## 确定性门槛

- 全局提供清晰的 `:focus-visible` 样式。
- `prefers-reduced-motion: reduce` 下关闭平滑滚动，并将动画与过渡缩到近乎零。
- 目录链接必须指向文章标题 ID，带 ID 的正文标题设置 `scroll-margin-top`，避免被吸顶导航遮挡。
- 源码中的 `<img>` 与构建后的图片必须包含 `width` 和 `height`；嵌入媒体容器必须预留 `aspect-ratio`。

## 官方依据

- [Lighthouse CI：预算文件与断言配置](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md#budgetsjson)
- [web.dev：使用图片宽高与宽高比降低 CLS](https://web.dev/articles/optimize-cls#images_without_dimensions)
- [Google Search：Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals)

