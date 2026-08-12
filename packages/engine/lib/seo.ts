import { site } from '@config/site';

/**
 * The head and social-card overrides a page can declare, resolved.
 *
 * `image` rather than `ogImage` because that is what `BaseLayout` and `SEO`
 * already call it; everything else keeps the name it was written under.
 */
export type PresentationSeo = {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  image?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  noindex?: boolean;
};

/**
 * Pull those overrides out of whatever declared them.
 *
 * One function for two planes on purpose. An article declares them in
 * frontmatter and a taxonomy term declares them in `site/taxonomy.yaml`, but
 * they mean the same thing and reach the same `<head>` — and the alternative,
 * two lists of the same eleven field names, is two lists that drift. Ghost
 * makes the same call: `posts_meta` and `tags` carry an identical column set.
 *
 * Only keys the author actually wrote are emitted, so the result can be spread
 * over a caller's own defaults without an `undefined` blanking one of them.
 */
export function seoFromFields(data: Record<string, any> = {}): PresentationSeo {
  const out: PresentationSeo = {};
  const put = (key: keyof PresentationSeo, value: unknown) => {
    if (typeof value === 'string' && value.trim() !== '') (out as Record<string, unknown>)[key] = value;
  };

  put('title', data.metaTitle);
  put('description', data.metaDescription);
  put('ogTitle', data.ogTitle);
  put('ogDescription', data.ogDescription);
  put('image', data.ogImage);
  put('twitterTitle', data.twitterTitle);
  put('twitterDescription', data.twitterDescription);
  put('twitterImage', data.twitterImage);
  if (data.noindex === true) out.noindex = true;

  return out;
}

export function absoluteUrl(path = '/') {
  if (path.startsWith('http')) return path;
  return new URL(path, site.url).toString();
}

/**
 * Resolve a canonical override, refusing anything that points off-origin.
 *
 * A cross-origin canonical tells search engines "the real version of this page
 * lives elsewhere", which hands the page's ranking to that other site. That is
 * almost never what a template user intends, so it fails the build instead of
 * shipping silently. Rule C-07 in docs/specs/content-contract.md.
 */
export function assertSameOrigin(override: string | undefined, fallback: string, context: string) {
  if (!override) return fallback;
  if (!override.startsWith('http')) return override;

  const siteOrigin = new URL(site.url).origin;
  const overrideOrigin = new URL(override).origin;
  if (overrideOrigin !== siteOrigin) {
    throw new Error(
      `Cross-origin canonical in ${context}: "${override}" points at ${overrideOrigin}, but this site is ${siteOrigin}. ` +
        'Remove the canonical field, or set PUBLIC_SITE_URL to the domain you are publishing under.',
    );
  }
  return new URL(override).pathname;
}
