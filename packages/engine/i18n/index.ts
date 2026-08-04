/**
 * Minimal message lookup for UI chrome.
 *
 * One file per locale, registered in `locales` below — no component changes to
 * add one. Which locales a *site* publishes is a different question, answered by
 * `site/site.yaml`; this table is the set the engine has chrome strings for.
 *
 * See docs/specs/i18n.md.
 */
import { defaultLocale as siteDefaultLocale, siteLocales } from '@config/site';
import enUS from './en-US';
import zhCN from './zh-CN';
import type { MessageKey, MessageTable, MessageValue } from './types';

export const DEFAULT_LOCALE = 'zh-CN';

export const locales: Record<string, MessageTable> = {
  'zh-CN': zhCN as unknown as MessageTable,
  'en-US': enUS,
};

export type { MessageKey } from './types';

export function isSupportedLocale(locale: string) {
  return Object.hasOwn(locales, locale);
}

/**
 * BCP 47 tag of the site's default locale, e.g. `zh-CN`.
 *
 * Kept for the callers that are asking about the site rather than about a page:
 * the voice check, `pnpm context`, anything outside a render. A component asks
 * `localeOfPath(Astro.url.pathname)` instead — on a bilingual site "the active
 * locale" is a property of the page being rendered, not of the process.
 */
export const activeLocale = isSupportedLocale(siteDefaultLocale) ? siteDefaultLocale : DEFAULT_LOCALE;

/** Underscore form used by Open Graph, e.g. `zh_CN`. */
export function ogLocaleOf(locale: string) {
  return locale.replace('-', '_');
}

export const ogLocale = ogLocaleOf(activeLocale);

function resolve(key: MessageKey, locale: string): MessageValue {
  const table = locales[locale] ?? locales[DEFAULT_LOCALE]!;
  const value = table[key] ?? locales[DEFAULT_LOCALE]![key];
  if (value === undefined) {
    throw new Error(`Missing i18n message "${key}" in locale "${locale}"`);
  }
  return value;
}

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/**
 * The message table for one locale, as a bound `t`.
 *
 *   const t = messages(localeOfPath(Astro.url.pathname));
 *   <strong>{t('toc.title')}</strong>
 *
 * A bound function rather than a third argument on `t` so that adding locales
 * to this framework did not mean editing every one of the ~40 call sites — and
 * so that a call site cannot half-adopt it, passing the locale in one string on
 * a page and forgetting it in the next.
 */
export function messages(locale: string = activeLocale): Translate {
  return (key, params = {}) => {
    const raw = resolve(key, locale);
    const text = Array.isArray(raw) ? raw.join('\n') : (raw as string);
    return text.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.hasOwn(params, name) ? String(params[name]) : match,
    );
  };
}

/**
 * Look up a message in the site's default locale and interpolate `{name}`
 * placeholders.
 *
 *   t('article.readingTime', { minutes: 7 })  // "7 分钟阅读"
 */
export const t: Translate = messages(activeLocale);

const missing = siteLocales.filter((locale) => !isSupportedLocale(locale.tag));
if (missing.length > 0) {
  throw new Error(
    missing
      .map(
        (locale) =>
          `site/site.yaml publishes "${locale.tag}", which has no message table. ` +
          `Add engine/i18n/${locale.tag}.ts and register it in engine/i18n/index.ts.`,
      )
      .join('\n'),
  );
}
