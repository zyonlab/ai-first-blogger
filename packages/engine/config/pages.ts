/**
 * site/pages.yaml → copy for the static pages.
 *
 * This is site-owner content, not UI chrome: a new owner rewrites it rather
 * than translating it, which is why it is here and not in engine/i18n/.
 */
import { readYaml } from './load';

type Titled = { title: string; description: string };

export type PagesConfig = {
  topics: Titled;
  series: Titled;
  about: { title: string; sections: { heading: string; body: string }[] };
  newsletter: { title: string; description: string; body: string; action: string };
  uses: { title: string; description: string; items: { name: string; body: string }[] };
  workWithMe: { action: string; services: { name: string; body: string }[] };
};

export const pages = readYaml<PagesConfig>('pages.yaml');
