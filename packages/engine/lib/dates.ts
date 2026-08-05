import { activeLocale } from '@i18n/index';

/**
 * A date reads differently in every language, so the locale is the page's, not
 * the site's. It defaults to the site's for the callers outside a render.
 */
export function formatDate(date: Date, locale: string = activeLocale) {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}
