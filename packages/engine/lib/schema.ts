import { defaultLocale, type Locale } from '@config/routes';
import { siteFor } from '@config/site';
import { absoluteUrl, engineRootUrl } from './seo';

type ListItem = {
  name: string;
  url: string;
  description?: string;
};

/**
 * `inLanguage` is the language of the *page*, not of the site.
 *
 * It used to be `site.locale` in five places, which was right while a site had
 * one language and is a lie the moment it has two — an English article
 * declaring itself Chinese to every consumer of structured data, on a page
 * whose own `<html lang>` says otherwise.
 */
export function websiteSchema(locale: Locale = defaultLocale) {
  const site = siteFor(locale);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    // The engine's root, not the locale's. It is the identity of the site
    // rather than the address of one of its translations — but it does carry
    // the mount, because a mounted engine *is* a section of the host and
    // claiming the origin would collide with the host's own WebSite entity.
    url: engineRootUrl(),
    description: site.description,
    inLanguage: locale,
    publisher: personSchema(false, locale),
  };
}

export function personSchema(withContext = true, locale: Locale = defaultLocale) {
  const site = siteFor(locale);
  return {
    ...(withContext ? { '@context': 'https://schema.org' } : {}),
    '@type': 'Person',
    name: site.author.name,
    url: engineRootUrl(),
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

export function collectionPageSchema(
  name: string,
  description: string,
  url: string,
  locale: Locale = defaultLocale,
) {
  const site = siteFor(locale);
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url: absoluteUrl(url),
    inLanguage: locale,
    isPartOf: {
      '@type': 'WebSite',
      name: site.name,
      url: engineRootUrl(),
    },
  };
}
