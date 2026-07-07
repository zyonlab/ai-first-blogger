export type CategorySlug =
  | 'frontend-architecture'
  | 'vue-react-internals'
  | 'web3-defi'
  | 'exchange-systems'
  | 'engineering-productivity'
  | 'ai-engineering'
  | 'career'
  | 'notes';

export const categoryMap: Array<{
  match: string[];
  category: CategorySlug;
  series?: string;
}> = [
  {
    match: ['vue', 'vuejs', 'virtual dom', 'diff', 'nexttick', '响应式'],
    category: 'vue-react-internals',
    series: 'vue-internals',
  },
  {
    match: ['react', 'fiber', 'suspense', 'jotai'],
    category: 'vue-react-internals',
    series: 'react-state-management',
  },
  {
    match: ['uniswap', 'aave', 'compound', 'bunni', 'defi', 'dex', 'web3', '区块链'],
    category: 'web3-defi',
    series: 'defi-protocols',
  },
  {
    match: ['交易所', '合约交易所', '持仓', '撮合', '风控', '保证金'],
    category: 'exchange-systems',
    series: 'crypto-exchange-system',
  },
  {
    match: ['webpack', 'rollup', 'typescript', 'ioc', 'aop', 'ngrok', '工程化'],
    category: 'engineering-productivity',
    series: 'engineering-tools',
  },
  {
    match: ['ai', 'agent', 'llm', 'codex', '人工智能'],
    category: 'ai-engineering',
  },
];
