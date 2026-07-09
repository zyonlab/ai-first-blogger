export const site = {
  name: "子雍手记",
  title: "子雍手记 · AI 应用、全栈工程与 Web3/DeFi 系统笔记",
  description:
    "记录 AI 应用、全栈开发、区块链、交易所系统、DeFi 协议、大模型学习和开源项目实践的个人技术手记。",
  url: import.meta.env.PUBLIC_SITE_URL ?? "https://your-site.example",
  locale: "zh-CN",
  themeStorageKey: "zi-yong-notes-theme",
  brand: {
    initial: "子",
    tagline: "AI · Full-stack · Web3 · DeFi · LLM Notes",
    keywords: [
      "AI 应用",
      "全栈工程",
      "区块链",
      "交易所系统",
      "DeFi",
      "大模型学习",
      "开源项目",
    ],
  },
  author: {
    name: "子雍",
    title: "AI / Full-stack / Web3 Builder",
    bio: "长期记录 AI 应用、全栈工程、交易所系统、DeFi 协议和大模型学习过程的技术实践者。",
    email: "hello@example.com",
  },
  social: {
    github: "https://github.com/proxicat/ai-first-blogger",
    youtube: "https://youtube.com/",
    x: "https://x.com/",
    linkedin: "https://linkedin.com/",
  },
  hero: {
    eyebrow: "AI 应用 · 全栈工程 · 区块链 · 交易所 · DeFi · 大模型学习",
    title: "子雍手记",
    description:
      "这里不是新闻流，而是一套长期积累的技术手记：把 AI 应用、全栈开发、Web3/DeFi、交易所系统和大模型学习拆成系列文章、项目笔记和视频内容。",
    actions: [
      { label: "读技术文章", href: "/writing/", variant: "primary" },
      { label: "看系列路线", href: "/series/" },
      { label: "项目笔记", href: "/projects/" },
      { label: "视频内容", href: "/videos/" },
    ],
    signals: ["AI 应用实战", "全栈系统设计", "交易所与 DeFi", "大模型学习路线"],
  },
  services: {
    title: "合作",
    description:
      "围绕 AI 应用、全栈工程、Web3/DeFi、交易所系统和技术内容建设的合作入口。",
    serviceName: "Technical Writing / AI Application / Web3 System Notes",
    serviceTypes: [
      "AI 应用原型",
      "全栈项目实践",
      "Web3/DeFi 系统分析",
      "技术内容与项目文档",
    ],
    contactText:
      "如果你关注 AI 应用、交易系统、DeFi、全栈项目或技术内容建设，可以通过邮箱联系。",
  },
};

export type SiteConfig = typeof site;
