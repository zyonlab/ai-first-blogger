import assert from 'node:assert/strict';
import { getContentNeighbors, rankRelatedContent, relatedScore } from '../src/lib/discovery-ranking';
import type { DiscoveryItem } from '../src/lib/discovery';

function item(overrides: Partial<DiscoveryItem> & Pick<DiscoveryItem, 'id' | 'slug' | 'title'>): DiscoveryItem {
  return {
    kind: 'post',
    kindLabel: '文章',
    description: '',
    url: `/writing/${overrides.slug}/`,
    timestamp: 1,
    tags: [],
    explicitRelations: [],
    searchText: '',
    ...overrides,
  };
}

const current = item({
  id: 'post:current',
  slug: 'current',
  title: 'Current',
  topic: 'astro',
  series: 'astro-series',
  seriesOrder: 2,
  tags: ['Astro', 'SEO'],
});
const explicit = item({
  id: 'video:walkthrough',
  kind: 'video',
  kindLabel: '视频',
  slug: 'walkthrough',
  title: 'Walkthrough',
  explicitRelations: ['post:current'],
});
const seriesPrevious = item({
  id: 'post:first',
  slug: 'first',
  title: 'First',
  topic: 'astro',
  series: 'astro-series',
  seriesOrder: 1,
});
const seriesNext = item({
  id: 'post:third',
  slug: 'third',
  title: 'Third',
  topic: 'astro',
  series: 'astro-series',
  seriesOrder: 3,
});
const tagMatch = item({
  id: 'case-study:seo',
  kind: 'case-study',
  kindLabel: '案例',
  slug: 'seo',
  title: 'SEO',
  tags: ['seo'],
});

assert.ok(relatedScore(current, explicit) > relatedScore(current, seriesPrevious));
assert.deepEqual(rankRelatedContent([current, tagMatch, seriesPrevious, explicit], current).map(({ id }) => id), [
  'video:walkthrough',
  'post:first',
  'case-study:seo',
]);
assert.deepEqual(getContentNeighbors([seriesNext, current, seriesPrevious], current), {
  previous: seriesPrevious,
  next: seriesNext,
});

console.log('Discovery ranking checks passed.');
