import type { MessageTable } from './types';

/**
 * Type-checked against engine/i18n/zh-CN.ts. Removing or misspelling a key here
 * fails `pnpm check`.
 */
const messages: MessageTable = {
  'nav.menu': 'Menu',
  'nav.skipToContent': 'Skip to content',
  'nav.primary': 'Primary navigation',
  'nav.footer': 'Footer navigation',

  'toc.title': 'On this page',

  'article.publishedOn': 'Published {date}',
  'article.updatedOn': 'Updated {date}',
  'article.readingTime': '{minutes} min read',
  'article.brief': 'Key takeaways',
  'article.overview': 'Article overview',

  'aiStudy.title': 'Study with AI',
  'aiStudy.description': 'Hand the link and a prompt to an AI and have it explain this at your pace.',
  'aiStudy.copyPrompt': 'Copy prompt',
  'aiStudy.copied': 'Copied',
  'aiStudy.label': 'AI assisted learning',
  'aiStudy.prompt': [
    'Help me study this technical article in depth: {url}',
    '',
    'Title: {title}',
    'Summary: {description}',
    '',
    'Structure your answer like this:',
    '1. Summarise the core argument in 5 bullets.',
    '2. Explain the key concepts, prerequisites and common misreadings.',
    '3. If the article contains code, walk through each block: intent, inputs, outputs, edge cases.',
    '4. Turn the article into a learning roadmap — what to understand first, and what builds on it.',
    '5. Write 8 self-check questions with reference answers.',
    '6. Finish with 5 high-quality follow-up questions I could ask you next.',
  ],

  'cta.text': 'If this was useful, there is more on the same topic — or just email me.',
  'cta.primary': 'Work with me',
  'cta.secondary': 'Subscribe',

  'project.status.active': 'Active',
  'project.status.archived': 'Archived',
  'project.status.planned': 'Planned',
  'project.viewDemo': 'View demo',
  'project.viewSource': 'View source',

  'notFound.title': 'Page not found',
  'notFound.description': 'Nothing at this address. Try the article list or a topic page.',
  'notFound.readArticles': 'Read articles',
  'notFound.browseTopics': 'Browse topics',

  'taxonomy.empty': 'Nothing here yet. This fills in once the first entry is published.',
  'taxonomy.featuredSeries': 'Featured series',
  'taxonomy.relatedContent': 'Related content',
  'taxonomy.readingOrder': 'Suggested reading order',
  'taxonomy.readingOrderHint': 'Read them in this order. More will be added.',

  'home.viewAll': 'All {label}',
  'home.empty': 'Coming soon.',
  'home.topics.eyebrow': 'Topics',
  'home.topics.title': 'Featured Topics',
  'home.topics.description': 'Filed by topic, not piled under tags.',
  'home.series.eyebrow': 'Learning Paths',
  'home.series.title': 'Featured Series',
  'home.series.viewAll': 'All series',
  'home.focusMap': 'Focus Map',

  'footer.builtWith': 'Built with Astro.',
};

export default messages;
