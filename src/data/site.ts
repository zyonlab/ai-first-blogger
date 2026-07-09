export const site = {
  name: "子雍手记",
  title: "子雍手记 · AI 应用、全栈工程与 Web3/DeFi 系统笔记",
  description:
    "记录 AI 应用、全栈开发、交易所系统、DeFi 协议、大模型学习和开源项目实践。",
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
    bio: "写 AI 应用、全栈工程、交易系统、DeFi 协议和大模型学习过程中的判断、取舍和踩坑。",
    email: "",
  },
  social: {
    github: "https://github.com/proxicat/ai-first-blogger",
    youtube: "",
    x: "",
    linkedin: "",
  },
  hero: {
    eyebrow: "AI 应用 · 全栈工程 · 区块链 · 交易所 · DeFi · 大模型学习",
    title: "子雍手记",
    description:
      "这里放我长期写下来的技术笔记：AI 应用怎么落地，全栈项目怎么做，交易系统和 DeFi 协议有哪些真实约束，大模型学习过程中哪些东西值得反复推敲。",
    actions: [
      { label: "看文章", href: "/writing/", variant: "primary" },
      { label: "看系列", href: "/series/" },
      { label: "看项目", href: "/projects/" },
      { label: "看视频", href: "/videos/" },
    ],
    signals: ["应用笔记", "工程取舍", "交易与 DeFi", "学习路线"],
  },
  services: {
    title: "合作",
    description:
      "围绕 AI 应用、全栈工程、Web3/DeFi、交易系统和技术内容的合作。",
    serviceName: "Technical Writing / AI Application / Web3 System Notes",
    serviceTypes: [
      "AI 应用原型",
      "全栈项目实践",
      "Web3/DeFi 系统分析",
      "技术内容与项目文档",
    ],
    contactText:
      "如果你正在做 AI 应用、交易系统、DeFi、全栈项目或技术内容，可以先整理具体问题和目标。",
  },
};

export type SiteConfig = typeof site;
