import { getCollection, type CollectionEntry } from 'astro:content';
import { slugify } from './slug';

export { getContentNeighbors, rankRelatedContent, relatedScore } from './discovery-ranking';

export const DISCOVERY_PAGE_SIZE = 12;

export type DiscoveryKind = 'post' | 'video' | 'project' | 'case-study';

export type DiscoveryItem = {
  id: string;
  kind: DiscoveryKind;
  kindLabel: string;
  title: string;
  description: string;
  slug: string;
  url: string;
  date?: string;
  timestamp: number;
  tags: string[];
  topic?: string;
  series?: string;
  seriesOrder?: number;
  explicitRelations: string[];
  searchText: string;
};

export type DiscoveryPage = {
  items: DiscoveryItem[];
  page: number;
  pageCount: number;
  total: number;
};

export type DiscoveryGroup = {
  name: string;
  slug: string;
  pages: DiscoveryPage[];
};

function cleanMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_~|{}[\]()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchText(parts: Array<string | undefined>, body = '') {
  return cleanMarkdown([...parts, body].filter(Boolean).join(' ')).toLocaleLowerCase();
}

function postItem(post: CollectionEntry<'posts'>): DiscoveryItem {
  return {
    id: `post:${post.data.slug}`,
    kind: 'post',
    kindLabel: '文章',
    title: post.data.title,
    description: post.data.description,
    slug: post.data.slug,
    url: `/writing/${post.data.slug}/`,
    date: post.data.pubDate.toISOString(),
    timestamp: post.data.pubDate.valueOf(),
    tags: post.data.tags,
    topic: post.data.category,
    series: post.data.series,
    seriesOrder: post.data.seriesOrder,
    explicitRelations: [],
    searchText: searchText(
      [post.data.title, post.data.description, post.data.category, post.data.series, ...post.data.tags],
      post.body ?? '',
    ),
  };
}

function videoItem(video: CollectionEntry<'videos'>): DiscoveryItem {
  return {
    id: `video:${video.data.slug}`,
    kind: 'video',
    kindLabel: '视频',
    title: video.data.title,
    description: video.data.description,
    slug: video.data.slug,
    url: `/videos/${video.data.slug}/`,
    date: video.data.pubDate.toISOString(),
    timestamp: video.data.pubDate.valueOf(),
    tags: video.data.topics,
    topic: video.data.topics[0],
    explicitRelations: video.data.relatedPosts.map((slug) => `post:${slug}`),
    searchText: searchText(
      [video.data.title, video.data.description, ...video.data.topics, ...video.data.chapters.map(({ title }) => title)],
      video.body ?? '',
    ),
  };
}

function projectItem(project: CollectionEntry<'projects'>): DiscoveryItem {
  return {
    id: `project:${project.data.slug}`,
    kind: 'project',
    kindLabel: '项目',
    title: project.data.title,
    description: project.data.description,
    slug: project.data.slug,
    url: `/projects/${project.data.slug}/`,
    timestamp: 0,
    tags: project.data.techStack,
    explicitRelations: [],
    searchText: searchText(
      [project.data.title, project.data.description, project.data.role, ...project.data.techStack, ...project.data.highlights],
      project.body ?? '',
    ),
  };
}

function caseStudyItem(item: CollectionEntry<'case-studies'>): DiscoveryItem {
  return {
    id: `case-study:${item.data.slug}`,
    kind: 'case-study',
    kindLabel: '案例',
    title: item.data.title,
    description: item.data.description,
    slug: item.data.slug,
    url: `/case-studies/${item.data.slug}/`,
    date: item.data.pubDate.toISOString(),
    timestamp: item.data.pubDate.valueOf(),
    tags: item.data.tags,
    topic: item.data.category,
    explicitRelations: item.data.relatedProject ? [`project:${item.data.relatedProject}`] : [],
    searchText: searchText(
      [item.data.title, item.data.description, item.data.category, ...item.data.tags],
      item.body ?? '',
    ),
  };
}

export async function getDiscoveryItems() {
  const now = Date.now();
  const [posts, videos, projects, caseStudies] = await Promise.all([
    getCollection('posts', ({ data }) => !data.draft && data.pubDate.valueOf() <= now),
    getCollection('videos', ({ data }) => !data.draft && data.pubDate.valueOf() <= now),
    getCollection('projects'),
    getCollection('case-studies', ({ data }) => !data.draft && data.pubDate.valueOf() <= now),
  ]);

  return [
    ...posts.map(postItem),
    ...videos.map(videoItem),
    ...projects.map(projectItem),
    ...caseStudies.map(caseStudyItem),
  ].sort((left, right) => right.timestamp - left.timestamp || left.title.localeCompare(right.title));
}

export function paginate(items: DiscoveryItem[], pageSize = DISCOVERY_PAGE_SIZE): DiscoveryPage[] {
  const pageCount = Math.ceil(items.length / pageSize);
  return Array.from({ length: pageCount }, (_, index) => ({
    items: items.slice(index * pageSize, (index + 1) * pageSize),
    page: index + 1,
    pageCount,
    total: items.length,
  }));
}

export function groupArchivePages(items: DiscoveryItem[]) {
  const groups = new Map<string, DiscoveryItem[]>();
  for (const item of items) {
    if (!item.date) continue;
    const year = item.date.slice(0, 4);
    groups.set(year, [...(groups.get(year) ?? []), item]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([year, entries]) => ({ name: year, slug: year, pages: paginate(entries) }));
}

export function groupTagPages(items: DiscoveryItem[]) {
  const groups = new Map<string, { name: string; items: DiscoveryItem[] }>();
  for (const item of items) {
    for (const rawTag of item.tags) {
      const name = rawTag.trim();
      if (!name) continue;
      const key = name.toLocaleLowerCase();
      const group = groups.get(key) ?? { name, items: [] };
      if (!group.items.some(({ id }) => id === item.id)) group.items.push(item);
      groups.set(key, group);
    }
  }

  const usedSlugs = new Map<string, number>();
  return [...groups.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(({ name, items: entries }) => {
      const baseSlug = slugify(name) || 'tag';
      const count = usedSlugs.get(baseSlug) ?? 0;
      usedSlugs.set(baseSlug, count + 1);
      return {
        name,
        slug: count === 0 ? baseSlug : `${baseSlug}-${count + 1}`,
        pages: paginate(entries),
      } satisfies DiscoveryGroup;
    });
}
