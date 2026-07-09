export type TopicSlug =
  | "ai-applications"
  | "llm-learning"
  | "full-stack-engineering"
  | "frontend-architecture"
  | "vue-react-internals"
  | "web3-defi"
  | "exchange-systems"
  | "engineering-productivity"
  | "ai-engineering";

export const topics: Record<
  TopicSlug,
  { title: string; description: string; accent: string }
> = {
  "ai-applications": {
    title: "AI Applications",
    description:
      "AI 产品原型、Agent 工作流、RAG、自动化、AI 辅助开发和真实应用落地。",
    accent: "rose",
  },
  "llm-learning": {
    title: "LLM Learning",
    description:
      "大模型学习路线、提示词、上下文工程、模型能力边界和工程化实践。",
    accent: "violet",
  },
  "full-stack-engineering": {
    title: "Full-stack Engineering",
    description: "从前端、后端、数据库、API 到部署运维的全栈项目实践。",
    accent: "blue",
  },
  "frontend-architecture": {
    title: "Frontend Architecture",
    description: "面向长期维护、性能和团队协作的前端架构实践。",
    accent: "cyan",
  },
  "vue-react-internals": {
    title: "Vue / React Internals",
    description: "深入框架运行机制、响应式、调度、状态管理和源码设计。",
    accent: "green",
  },
  "web3-defi": {
    title: "Web3 & DeFi",
    description: "拆解协议、DEX、钱包、链上交互和 DeFi 产品工程实现。",
    accent: "cyan",
  },
  "exchange-systems": {
    title: "Crypto Exchange Systems",
    description: "交易所系统设计、撮合、风控、保证金、账户和数据链路。",
    accent: "amber",
  },
  "engineering-productivity": {
    title: "Engineering Productivity",
    description: "工程化、开发者工具、构建系统、自动化和团队效率。",
    accent: "blue",
  },
  "ai-engineering": {
    title: "AI Engineering",
    description: "AI 辅助开发、代码审查、Agent 工作流和工程效率系统。",
    accent: "pink",
  },
};

export const topicList = Object.entries(topics).map(([slug, topic]) => ({
  slug,
  ...topic,
}));
