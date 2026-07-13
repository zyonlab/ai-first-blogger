import { site } from '@data/site';
import { absoluteUrl } from './seo';

type ListItem = {
  name: string;
  url: string;
  description?: string;
};

type ArticleSchemaInput = {
  title: string;
  description: string;
  canonical: string;
  publishedDate: Date | string;
  modifiedDate?: Date | string;
  authorName?: string;
  image?: string;
  tags?: string[];
  section?: string;
};

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    alternateName: site.alternateName,
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
    url: absoluteUrl('/about/'),
    jobTitle: site.author.title,
    description: site.author.bio,
    sameAs: Object.values(site.social).filter(Boolean),
  };
}

export function profilePageSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: absoluteUrl('/about/'),
    mainEntity: personSchema(false),
  };
}

export function articleSchema({
  title,
  description,
  canonical,
  publishedDate,
  modifiedDate = publishedDate,
  authorName = site.author.name,
  image = site.defaultImage,
  tags = [],
  section,
}: ArticleSchemaInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    image: [absoluteUrl(image)],
    datePublished: new Date(publishedDate).toISOString(),
    dateModified: new Date(modifiedDate).toISOString(),
    author: {
      '@type': 'Person',
      name: authorName,
      url: absoluteUrl('/about/'),
    },
    publisher: personSchema(false),
    mainEntityOfPage: absoluteUrl(canonical),
    url: absoluteUrl(canonical),
    inLanguage: site.locale,
    ...(tags.length > 0 ? { keywords: tags } : {}),
    ...(section ? { articleSection: section } : {}),
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
    inLanguage: site.locale,
    isPartOf: {
      '@type': 'WebSite',
      name: site.name,
      url: site.url,
    },
  };
}
