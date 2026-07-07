import { site } from '@data/site';

export function absoluteUrl(path = '/') {
  if (path.startsWith('http')) return path;
  return new URL(path, site.url).toString();
}
