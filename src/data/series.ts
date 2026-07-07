export const series = {
  'vue-internals': {
    title: 'Vue.js 内部机制深度解析',
    description: '从响应式、调度、nextTick 到渲染机制的系统学习路径。',
    topic: 'vue-react-internals',
  },
  'crypto-exchange-system': {
    title: '加密货币交易所系统设计',
    description: '围绕账户、撮合、风控、持仓和清结算构建交易所系统认知。',
    topic: 'exchange-systems',
  },
  'defi-protocols': {
    title: 'DeFi 协议与 DEX 架构分析',
    description: '理解 AMM、借贷、清算、Hooks 和协议工程权衡。',
    topic: 'web3-defi',
  },
  'react-state-management': {
    title: 'React 状态管理与框架原理',
    description: '围绕 Fiber、调度、Suspense 和状态库设计拆解 React 生态。',
    topic: 'vue-react-internals',
  },
  'engineering-tools': {
    title: '工程化与开发者工具',
    description: '构建链路、自动化、CLI、AI 工作流和团队效率工具。',
    topic: 'engineering-productivity',
  },
} as const;

export const seriesList = Object.entries(series).map(([slug, item]) => ({
  slug,
  ...item,
}));
