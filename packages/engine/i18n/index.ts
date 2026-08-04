/**
 * Minimal message lookup for UI chrome.
 *
 * The active locale comes from `site.locale`. Adding a locale means adding one
 * file here and registering it in `locales` — no component changes.
 *
 * See docs/specs/i18n.md.
 */
import { site } from '@config/site';
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

/** BCP 47 tag of the active locale, e.g. `zh-CN`. */
export const activeLocale = isSupportedLocale(site.locale) ? site.locale : DEFAULT_LOCALE;

/** Underscore form used by Open Graph, e.g. `zh_CN`. */
export const ogLocale = activeLocale.replace('-', '_');

function resolve(key: MessageKey): MessageValue {
  const table = locales[activeLocale] ?? locales[DEFAULT_LOCALE]!;
  const value = table[key] ?? locales[DEFAULT_LOCALE]![key];
  if (value === undefined) {
    throw new Error(`Missing i18n message "${key}" in locale "${activeLocale}"`);
  }
  return value;
}

/**
 * Look up a message and interpolate `{name}` placeholders.
 *
 *   t('article.readingTime', { minutes: 7 })  // "7 分钟阅读"
 */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const raw = resolve(key);
  const text = Array.isArray(raw) ? raw.join('\n') : (raw as string);
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

if (!isSupportedLocale(site.locale)) {
  throw new Error(
    `site.locale "${site.locale}" has no message table. Add engine/i18n/${site.locale}.ts and register it in engine/i18n/index.ts.`,
  );
}
