/**
 * Reference locale. Every other locale is type-checked against this file, so a
 * missing translation is a compile error rather than a silent fallback.
 *
 * Only UI chrome belongs here. Site-specific copy (brand, hero, taxonomy
 * titles, content type labels) lives in site/ — see
 * docs/specs/site-config-contract.md for where the line sits.
 */
export default {
  'nav.menu': '菜单',
  'nav.skipToContent': '跳到正文',
  'nav.primary': '主导航',
  'nav.footer': '页脚导航',

  'toc.title': '目录',

  'breadcrumb.home': '首页',

  'article.publishedOn': '发布于 {date}',
  'article.updatedOn': '更新于 {date}',
  'article.readingTime': '{minutes} 分钟阅读',
  'article.brief': '本文重点',
  'article.overview': '文章概览',
  'article.topic': '主题',
  'article.read': '阅读',
  // Separate from `article.readingTime`: this one sits under a `阅读` label, so
  // repeating the verb would read as "阅读 / 7 分钟阅读". The unit has to be in
  // the string rather than beside it — Chinese puts no space before it.
  'article.readingMinutes': '{minutes} 分钟',
  'article.series': '系列',

  'aiStudy.title': 'AI 学习',
  'aiStudy.description': '把链接和提示词丢给 AI，让它按你的节奏讲一遍。',
  'aiStudy.copyPrompt': '复制 Prompt',
  'aiStudy.copied': '已复制',
  'aiStudy.label': 'AI 辅助学习',
  'aiStudy.prompt': [
    '请帮我深度学习这篇技术文章：{url}',
    '',
    '文章标题：{title}',
    '文章摘要：{description}',
    '',
    '请按这个结构输出：',
    '1. 用 5 条 bullet 总结文章核心观点。',
    '2. 解释文章里的关键概念、前置知识和容易误解的点。',
    '3. 如果文章包含代码，请逐段解释代码意图、输入输出和边界条件。',
    '4. 把文章整理成一张学习路线图，指出我应该先理解什么、再理解什么。',
    '5. 生成 8 个自测问题，并给出参考答案。',
    '6. 最后给出我可以继续追问你的 5 个高质量问题。',
  ],

  'cta.text': '这篇有用的话，可以看看同主题的其他文章，或者直接发邮件聊。',
  'cta.primary': '咨询合作',
  'cta.secondary': '订阅更新',

  'project.status.active': '进行中',
  'project.status.archived': '已归档',
  'project.status.planned': '计划中',
  'project.viewDemo': '查看 Demo',
  'project.viewSource': '查看源码',

  'notFound.title': '页面不存在',
  'notFound.description': '这个地址没东西。从文章列表或者主题页重新找找。',
  'notFound.readArticles': '阅读文章',
  'notFound.browseTopics': '查看专题',

  'taxonomy.empty': '还没有内容。写第一篇之后这里会自动出现。',
  'taxonomy.featuredSeries': '精选系列',
  'taxonomy.relatedContent': '相关内容',
  'taxonomy.readingOrder': '推荐阅读顺序',
  'taxonomy.readingOrderHint': '建议按这个顺序读。没写完的会继续补。',
  'taxonomy.tagEntryCount': '{count} 篇',
  'taxonomy.tagFallbackDescription': '站内所有标记为「{tag}」的内容，共 {count} 篇，按时间倒序排列。',

  'home.viewAll': '查看全部{label}',
  'home.empty': '内容即将上线。',
  'home.topics.eyebrow': '主题',
  'home.topics.title': '精选主题',
  'home.topics.description': '按主题归档，不按标签堆。',
  'home.series.eyebrow': '学习路径',
  'home.series.title': '精选系列',
  'home.series.viewAll': '全部系列',
  'home.focusMap': '关注方向',

  'footer.builtWith': '由 Astro 构建。',
} as const;
