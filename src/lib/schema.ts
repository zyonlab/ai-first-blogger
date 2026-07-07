import { site } from '@data/site';
import { absoluteUrl } from './seo';

type ListItem = {
  name: string;
  url: string;
  description?: string;
};

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: site.url,
    description: site.description,
    inLanguage: 'zh-CN',
    publisher: personSchema(false),
  };
}

export function personSchema(withContext = true) {
  return {
    ...(withContext ? { '@context': 'https://schema.org' } : {}),
    '@type': 'Person',
    name: site.author.name,
    url: site.url,
    jobTitle: site.author.title,
    description: site.author.bio,
    sameAs: Object.values(site.social),
  };
}

export function breadcrumbSchema(items: ListItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

export function itemListSchema(name: string, items: ListItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(item.url),
      name: item.name,
      description: item.description,
    })),
  };
}

export function collectionPageSchema(name: string, description: string, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url: absoluteUrl(url),
    inLanguage: 'zh-CN',
    isPartOf: {
      '@type': 'WebSite',
      name: site.name,
      url: site.url,
    },
  };
}
