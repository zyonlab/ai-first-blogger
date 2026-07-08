export const site = {
  name: 'AI First Blogger',
  title: 'AI First Blogger · AI-native content system for technical creators',
  description: '一个 AI-first 静态博客系统，用结构化内容、固定提示词和自动部署帮助创作者规划、写作、优化和维护网站。',
  url: import.meta.env.PUBLIC_SITE_URL ?? 'https://ai-first-blogger.pages.dev',
  locale: 'zh-CN',
  themeStorageKey: 'ai-first-blogger-theme',
  brand: {
    initial: 'A',
    tagline: 'Plan · Write · Optimize · Deploy with AI',
    keywords: ['AI-first blog', 'content system', 'SEO', 'GEO', 'Astro', 'Cloudflare Pages'],
  },
  author: {
    name: 'Site Owner',
    title: 'Technical Creator',
    bio: '使用 AI-first 工作流规划、创作、优化和维护长期内容资产的创作者。',
    email: 'hello@example.com',
  },
  social: {
    github: 'https://github.com/proxicat/ai-first-blogger',
    youtube: 'https://youtube.com/',
    x: 'https://x.com/',
    linkedin: 'https://linkedin.com/',
  },
  hero: {
    eyebrow: 'AI-first Content System · SEO · GEO · Static Deploy',
    title: 'AI First Blogger',
    description:
      '用 Astro、MDX、结构化内容模型和可复用提示词，把个人博客升级成 AI 可规划、可生成、可审计、可部署的内容系统。',
    actions: [
      { label: '阅读文章', href: '/writing/', variant: 'primary' },
      { label: '查看内容规划', href: '/series/' },
      { label: '项目模板', href: '/projects/' },
      { label: '开始配置', href: '/work-with-me/' },
    ],
    signals: ['Brand setup', 'Content planning', 'SEO / GEO audit', 'Cloudflare deploy'],
  },
  services: {
    title: 'Work With Me',
    description: '面向创作者、开发者工具、技术团队和内容产品的 AI-first 内容系统搭建入口。',
    serviceName: 'AI First Blogger Implementation',
    serviceTypes: ['AI-first Website Planning', 'Technical Content Strategy', 'SEO/GEO Audit', 'Cloudflare Pages Deployment'],
    contactText: '请通过邮箱联系，或把品牌信息交给 AI 完成网站配置、内容规划和部署检查。',
  },
};

export type SiteConfig = typeof site;
