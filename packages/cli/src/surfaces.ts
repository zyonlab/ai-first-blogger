/**
 * Every outward-facing string the site emits that is *not* an article body.
 *
 * These are the strings a reader meets first: the meta description in a search
 * result, the one-liner under a topic on `/topics/`, the entry in `llms.txt` an
 * AI summariser quotes, the first sentence of the home page. They are also the
 * strings most likely to be generated, and therefore most likely to read like
 * a template — yet until this file existed `pnpm analyze` only looked at
 * article bodies, so "全面解析" was penalised inside a post and waved through
 * in the description that shows up on six pages.
 *
 * Line numbers are resolved against the source YAML so a finding points at the
 * key to edit, not just at the file.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { siteContentTypes } from 'aifb-engine/config/content-types';
import { pages } from 'aifb-engine/config/pages';
import { site } from 'aifb-engine/config/site';
import { series, topics } from 'aifb-engine/config/taxonomy';

export type Surface = {
  /** Repo-relative file the string comes from. */
  file: string;
  /** Dotted path of the key, e.g. `topics.ai-engineering.description`. */
  key: string;
  text: string;
  /** Where this string ends up, so a finding explains why it matters. */
  shows: string;
  line?: number;
};

const root = process.cwd();

/** Line of the last segment of a dotted key, searched in document order. */
function locate(source: string, dottedKey: string) {
  const parts = dottedKey.split('.');
  const lines = source.split('\n');
  let from = 0;
  for (const part of parts) {
    const needle = new RegExp(`^\\s*(?:- )?['"]?${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]?\\s*:`);
    const found = lines.findIndex((line, index) => index >= from && needle.test(line));
    if (found === -1) return from > 0 ? from + 1 : undefined;
    from = found;
  }
  return from + 1;
}

export async function collectSurfaces(): Promise<Surface[]> {
  const read = async (name: string) => {
    try {
      return await fs.readFile(path.join(root, 'site', name), 'utf8');
    } catch {
      return '';
    }
  };
  const siteSrc = await read('site.yaml');
  const taxonomySrc = await read('taxonomy.yaml');
  const typesSrc = await read('content-types.yaml');
  const pagesSrc = await read('pages.yaml');

  const out: Surface[] = [];
  const add = (file: string, source: string, key: string, text: unknown, shows: string) => {
    if (typeof text !== 'string' || text.trim() === '') return;
    out.push({ file: `site/${file}`, key, text, shows, line: locate(source, key) });
  };

  /* --- site.yaml: the home page and every page's title suffix --------- */
  add('site.yaml', siteSrc, 'description', site.description, 'the site-wide meta description and llms.txt header');
  add('site.yaml', siteSrc, 'title', site.title, 'the home page <title>');
  add('site.yaml', siteSrc, 'brand.tagline', site.brand.tagline, 'the header tagline');
  add('site.yaml', siteSrc, 'hero.description', site.hero.description, 'the first sentence a visitor reads');
  add('site.yaml', siteSrc, 'hero.eyebrow', site.hero.eyebrow, 'the line above the home page title');
  add('site.yaml', siteSrc, 'author.bio', site.author.bio, 'the About page and Person schema');
  add('site.yaml', siteSrc, 'services.description', site.services.description, 'the Work-with-me page');
  add('site.yaml', siteSrc, 'services.contactText', site.services.contactText, 'the Work-with-me call to action');

  /* --- taxonomy.yaml: topic and series descriptions ------------------- */
  for (const [slug, topic] of Object.entries(topics)) {
    add(
      'taxonomy.yaml',
      taxonomySrc,
      `topics.${slug}.description`,
      topic.description,
      `the meta description of /topics/${slug}/, its card, and its llms.txt entry`,
    );
  }
  for (const [slug, item] of Object.entries(series)) {
    add(
      'taxonomy.yaml',
      taxonomySrc,
      `series.${slug}.description`,
      item.description,
      `the meta description of /series/${slug}/ and its llms.txt entry`,
    );
  }

  /* --- content-types.yaml: list page descriptions --------------------- */
  for (const [name, def] of Object.entries(siteContentTypes)) {
    add(
      'content-types.yaml',
      typesSrc,
      `${name}.listDescription`,
      def.listDescription,
      `the meta description of /${def.route}/ and its llms.txt section header`,
    );
  }

  /* --- pages.yaml: static page copy ----------------------------------- */
  add('pages.yaml', pagesSrc, 'topics.description', pages.topics?.description, 'the /topics/ meta description');
  add('pages.yaml', pagesSrc, 'series.description', pages.series?.description, 'the /series/ meta description');
  add('pages.yaml', pagesSrc, 'newsletter.description', pages.newsletter?.description, 'the /newsletter/ meta description');
  add('pages.yaml', pagesSrc, 'newsletter.body', pages.newsletter?.body, 'the /newsletter/ body');
  add('pages.yaml', pagesSrc, 'uses.description', pages.uses?.description, 'the /uses/ meta description');
  for (const [index, item] of (pages.uses?.items ?? []).entries()) {
    add('pages.yaml', pagesSrc, `uses.items.${index}.body`, item.body, 'a row of the Uses table');
  }
  for (const [index, item] of (pages.workWithMe?.services ?? []).entries()) {
    add('pages.yaml', pagesSrc, `workWithMe.services.${index}.body`, item.body, 'a service on the Work-with-me page');
  }

  return out;
}
