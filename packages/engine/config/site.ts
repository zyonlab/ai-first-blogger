/**
 * site/site.yaml → typed brand configuration.
 *
 * `PUBLIC_SITE_URL` still wins over `url`, so CI can build the same tree for a
 * preview domain and the real one.
 */
import { fail, readYaml, requireList, requireRecord, requireString } from './load';

const FILE = 'site/site.yaml';
const raw = readYaml<Record<string, any>>('site.yaml');

type NavEntry = { href: string; label: string; order: number };
type HeroAction = { label: string; href: string; variant?: string };

const problems: string[] = [];

const theme = requireRecord(raw, 'theme', FILE);
if (theme.defaultMode !== 'dark' && theme.defaultMode !== 'light') {
  problems.push('theme.defaultMode must be "dark" or "light" — it must match the theme\'s :root block.');
}
for (const key of ['name', 'colorDark', 'colorLight', 'storageKey']) {
  if (typeof theme[key] !== 'string') problems.push(`theme.${key} is required.`);
}

const og = requireRecord(raw, 'og', FILE);
if (typeof og.default !== 'string') {
  problems.push('og.default is required — the site-wide fallback Open Graph image.');
} else if (/\.svg(\?|$)/i.test(og.default)) {
  problems.push('og.default must be a raster image (png/jpg/webp). No social platform renders SVG — see rule C-01.');
}

const author = requireRecord(raw, 'author', FILE);
for (const key of ['name', 'title', 'bio', 'email']) {
  if (typeof author[key] !== 'string') problems.push(`author.${key} is required.`);
}

const url = requireString(raw, 'url', FILE);
try {
  new URL(url);
} catch {
  problems.push(`url "${url}" is not an absolute URL.`);
}

if (problems.length > 0) fail(FILE, problems);

/**
 * Site configuration. Shape is stable for the engine; the values come from
 * site/site.yaml and nowhere else.
 */
export const site = {
  name: requireString(raw, 'name', FILE),
  title: requireString(raw, 'title', FILE),
  description: requireString(raw, 'description', FILE),
  url: import.meta.env?.PUBLIC_SITE_URL ?? process.env.PUBLIC_SITE_URL ?? url,
  locale: requireString(raw, 'locale', FILE),
  /**
   * How a page title is composed. `{title}` is the page's own title, `{name}`
   * the site name. Every column the suffix costs comes out of the ~60 a search
   * result shows (rule C-05), so on a site with a long name dropping it is a
   * legitimate choice — and it is the site's choice, not the engine's.
   */
  titleTemplate: (raw.titleTemplate as string) ?? '{title} · {name}',
  themeStorageKey: theme.storageKey as string,
  theme: {
    name: theme.name as string,
    defaultMode: theme.defaultMode as 'dark' | 'light',
    colorDark: theme.colorDark as string,
    colorLight: theme.colorLight as string,
  },
  og: { default: og.default as string },
  brand: {
    initial: (raw.brand?.initial as string) ?? requireString(raw, 'name', FILE).slice(0, 1),
    tagline: (raw.brand?.tagline as string) ?? '',
    keywords: (raw.brand?.keywords as string[]) ?? [],
  },
  author: {
    name: author.name as string,
    title: author.title as string,
    bio: author.bio as string,
    email: author.email as string,
  },
  social: (raw.social ?? {}) as Record<string, string>,
  hero: {
    eyebrow: (raw.hero?.eyebrow as string) ?? '',
    title: (raw.hero?.title as string) ?? requireString(raw, 'name', FILE),
    description: (raw.hero?.description as string) ?? requireString(raw, 'description', FILE),
    actions: ((raw.hero?.actions ?? []) as HeroAction[]),
    signals: ((raw.hero?.signals ?? []) as string[]),
  },
  services: {
    title: (raw.services?.title as string) ?? '',
    description: (raw.services?.description as string) ?? '',
    serviceName: (raw.services?.serviceName as string) ?? '',
    serviceTypes: ((raw.services?.serviceTypes ?? []) as string[]),
    contactText: (raw.services?.contactText as string) ?? '',
  },
};

export type SiteConfig = typeof site;

/** Static navigation entries. Content types register themselves separately. */
export const staticNavItems = requireList<NavEntry>(raw, 'nav', FILE);
