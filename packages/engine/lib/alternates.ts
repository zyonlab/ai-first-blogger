/**
 * `hreflang` — which other URLs are this page in another language.
 *
 * Every page that exists in more than one language computes this and hands it to
 * the layout. Nothing infers it, and that is the point. The inference available
 * — "take the path, put every prefix in front of it" — is exactly the bug the
 * feature has to not have: it claims an English page for every Chinese article,
 * and the crawler that follows the claim finds a 404 or, worse, finds a page
 * built out of politeness with the Chinese text still in it.
 *
 * So there are two shapes, and both start from something real:
 *
 *   `alternatesForPath`   pages the engine renders per locale — the home page,
 *                         a listing, `/about/`. The set of locales is passed in
 *                         by the caller, which knows which of them it actually
 *                         built.
 *   `alternatesForEntry`  an article. The set comes from the files on disk that
 *                         share its `translationKey`, so an article nobody has
 *                         translated has one entry and gets no tags at all.
 *
 * `x-default` points at the default locale, which is the copy served at the
 * root. Google reads it as "use this when you have no better match", and the
 * root is the only URL on the site that is not already claiming a language.
 */
import { defaultLocale, isMultiLocale, locales as declaredLocales, withLocale, type Locale } from '@config/routes';
import { entryPath, type ContentTypeDef } from '@content-types/index';

export type Alternate = { locale: Locale; href: string };

/**
 * Declared order, always. The set is assembled from whatever the caller found —
 * files on disk, locales with entries — and those arrive in filesystem order,
 * which differs between machines. A page whose head tags reorder themselves
 * between two builds of the same content is a diff nobody can read and a cache
 * entry nobody can validate.
 */
function inDeclaredOrder(alternates: Alternate[]): Alternate[] {
  return [...alternates].sort(
    (a, b) => declaredLocales.indexOf(a.locale) - declaredLocales.indexOf(b.locale),
  );
}

/**
 * A page that exists at the same engine-relative path in several locales.
 * Returns nothing below two locales — a lone `hreflang` pointing at the page
 * carrying it tells a crawler nothing it did not already know.
 */
export function alternatesForPath(path: string, locales: readonly Locale[]): Alternate[] {
  if (!isMultiLocale || locales.length < 2) return [];
  return inDeclaredOrder(locales.map((locale) => ({ locale, href: withLocale(path, locale) })));
}

/** An entry, from the locales its `translationKey` siblings are written in. */
export function alternatesForEntry(
  type: ContentTypeDef,
  siblings: readonly { locale: Locale; slug: string }[],
): Alternate[] {
  if (!isMultiLocale || siblings.length < 2) return [];
  return inDeclaredOrder(siblings.map(({ locale, slug }) => ({ locale, href: entryPath(type, slug, locale) })));
}

/** The URL `x-default` should point at, or undefined when there is nothing to say. */
export function xDefault(alternates: readonly Alternate[]): string | undefined {
  return alternates.find((alternate) => alternate.locale === defaultLocale)?.href;
}
