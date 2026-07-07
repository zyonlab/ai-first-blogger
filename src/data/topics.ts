export type TopicSlug =
  | 'frontend-architecture'
  | 'vue-react-internals'
  | 'web3-defi'
  | 'exchange-systems'
  | 'engineering-productivity'
  | 'ai-engineering';

export const topics: Record<TopicSlug, { title: string; description: string; accent: string }> = {
  'frontend-architecture': {
    title: 'Frontend Architecture',
    description: '面向长期维护、性能和团队协作的前端架构实践。',
    accent: 'cyan',
  },
  'vue-react-internals': {
    title: 'Vue / React Internals',
    description: '深入框架运行机制、响应式、调度、状态管理和源码设计。',
    accent: 'green',
  },
  'web3-defi': {
    title: 'Web3 & DeFi',
    description: '拆解协议、DEX、钱包、链上交互和 DeFi 产品工程实现。',
    accent: 'violet',
  },
  'exchange-systems': {
    title: 'Crypto Exchange Systems',
    description: '交易所系统设计、撮合、风控、保证金、账户和数据链路。',
    accent: 'amber',
  },
  'engineering-productivity': {
    title: 'Engineering Productivity',
    description: '工程化、开发者工具、构建系统、自动化和团队效率。',
    accent: 'blue',
  },
  'ai-engineering': {
    title: 'AI Engineering',
    description: 'AI 辅助开发、代码审查、Agent 工作流和工程效率系统。',
    accent: 'rose',
  },
};

export const topicList = Object.entries(topics).map(([slug, topic]) => ({
  slug,
  ...topic,
}));
