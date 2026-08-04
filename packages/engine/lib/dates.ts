import { activeLocale } from '@i18n/index';

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat(activeLocale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}
