/**
 * The engine as an Astro integration.
 *
 * A site installs this package and adds one line to `astro.config.mjs`. It does
 * not point `srcDir` at the package — that only works while the engine is a
 * sibling directory, and stops working the moment it is a dependency in
 * `node_modules`, which is the whole point of packaging it.
 *
 * So the routes are **injected**. `injectRoute` takes a URL pattern and a module
 * specifier, and a specifier resolves through the package's `exports` map from
 * anywhere. The site keeps one file of its own — `src/content.config.ts` — because
 * Astro requires the collection config inside the project's own srcDir.
 *
 * Route patterns are derived from the file tree rather than listed, so adding a
 * page to the engine does not mean remembering to register it here. That is the
 * same reason content types self-register: a list you have to maintain by hand
 * is a list that will be wrong.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { cloudflarePages } from './deploy/cloudflare';
import { fail } from './config/load';
import { pageCopyProblems } from './config/pages';
import {
  LOCALE_SEGMENT,
  OPTIONAL_PAGES,
  ROOT_ONLY_PAGES,
  TAXONOMY_PAGES,
  configureRoutes,
  defaultLocale,
  isMultiLocale,
  segmentFor,
  type OptionalPage,
  type TaxonomyPage,
} from './config/routes';
import { rootRoutedTypeName } from './config/content-types';
import { site, siteLocales } from './config/site';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Whether the site can render Mermaid diagrams — i.e. whether it installed the
 * optional peer.
 *
 * Asked from the *project's* root rather than the engine's, because that is
 * where the site's `node_modules` is and pnpm's layout will not hoist a package
 * the site never declared into ours.
 */
function mermaidInstalled(root: string) {
  try {
    createRequire(path.join(root, 'package.json')).resolve('mermaid');
    return true;
  } catch {
    return false;
  }
}

/** Aliases the engine's own modules use. Resolved to this package, wherever it lives. */
const ALIASES = ['components', 'layouts', 'lib', 'i18n', 'config', 'content-types'] as const;

/**
 * `pages/topics/[slug].astro` → `/topics/[slug]`
 * `pages/index.astro`         → `/`
 * `pages/llms.txt.ts`         → `/llms.txt`
 */
function routePattern(relative: string) {
  const withoutExt = relative.replace(/\.(astro|ts|js)$/, '');
  const segments = withoutExt.split(path.sep);
  const last = segments[segments.length - 1]!;

  if (last === 'index') segments.pop();
  const pattern = `/${segments.join('/')}`;
  return pattern === '/' || pattern === '' ? '/' : pattern.replace(/\/$/, '');
}

function collectRoutes(dir: string, base = ''): { pattern: string; entrypoint: string }[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const relative = base ? path.join(base, item.name) : item.name;
    if (item.isDirectory()) return collectRoutes(path.join(dir, item.name), relative);
    if (!/\.(astro|ts)$/.test(item.name)) return [];
    return [
      {
        pattern: routePattern(relative),
        // Posix separators: this is a module specifier, not a filesystem path.
        entrypoint: `aifb-engine/pages/${relative.split(path.sep).join('/')}`,
      },
    ];
  });
}

/**
 * The fixed page a route belongs to: `/topics/[slug]` → `topics`, `/` → `''`.
 *
 * Both halves of a page travel together — declining `topics` has to take
 * `/topics/[slug]` with it, or the index disappears and the detail pages stay
 * behind as orphans nothing links to.
 */
function pageGroup(pattern: string) {
  return pattern.split('/')[1] ?? '';
}

/**
 * Where the locale segment goes, and which routes do not get one.
 *
 * `/404` and `/robots.txt` are the same two routes the mount leaves alone, for
 * the same reason: they are facts about the origin. A crawler reads exactly one
 * robots.txt per host and a host serves exactly one 404 page, so `/en/404` is a
 * page nothing routes to and `/en/robots.txt` is a file nobody reads — with the
 * added cost, here, of being a second copy that can disagree with the first.
 *
 * A single-language site gets no segment at all, and that is not an
 * optimisation. `[...locale]` makes every route dynamic, and a dynamic route
 * needs `getStaticPaths` — including one supplied by
 * `site/templates/pages/about.astro`, which is a file the site wrote and which
 * every 0.3.0 site that has one wrote without it. Adding the segment
 * unconditionally would have broken every page override in existence to serve
 * a feature those sites have not turned on.
 *
 * The cost is that a site *does* have to add `export const getStaticPaths =
 * localeStaticPaths` to its page overrides on the day it declares a second
 * locale, which is stated in docs/specs/templates.md and fails loudly rather
 * than quietly — Astro refuses to build a dynamic route with no paths.
 */
function localePattern(pattern: string) {
  if (!isMultiLocale) return pattern;
  if ((ROOT_ONLY_PAGES as readonly string[]).includes(pageGroup(pattern))) return pattern;
  return `${LOCALE_SEGMENT}${pattern === '/' ? '' : pattern}`;
}

/**
 * Where the gate reads the mount from.
 *
 * `pnpm validate` runs in its own process, long after the build: it never loads
 * astro.config, so nothing tells it that `/zh/blog/writing/` is a listing page
 * one level deep rather than a detail page three levels deep. Several rules
 * reason about URL shape that way, and a rule that quietly stops matching is
 * worse than one that fails.
 *
 * It goes next to the project rather than into `dist/`, because it is a fact
 * about the build and not a file anyone should deploy.
 */
const BUILD_INFO = path.join('.aifb', 'build.json');

const THEMES_MODULE = 'virtual:aifb/themes';
const RENDERERS_MODULE = 'virtual:aifb/renderers';

/**
 * Directories a site may shadow, mirroring the engine's own layout.
 *
 * `styles` is here for the site that installs the engine into a design system
 * it already has. `BaseLayout` imports `../styles/global.css` — 1379 lines of
 * reset and structure that land on every page — and the only way to be rid of
 * it was to override `BaseLayout` itself: taking over the SEO, the JSON-LD and
 * the theme injection to avoid one stylesheet, and forking all three away from
 * every later engine release. An empty `site/templates/styles/global.css` now
 * drops it; a real one replaces the structure and keeps the head.
 *
 * It is deliberately not in ALIASES. Those are the paths the engine's own
 * modules import by, and nothing imports `@styles/…` — the single stylesheet
 * import is relative, which `templatesPlugin` already catches. Adding an alias
 * no engine file uses would publish one more import for overrides to depend
 * on, and the point of ADR 0004 is that the promised list stays short. An
 * override that wants the shipped sheet back has a specifier already:
 * `aifb-engine/styles/global.css` is in the package's `exports`.
 */
const OVERRIDABLE = ['components', 'layouts', 'styles'] as const;

/**
 * The template hierarchy: a site's file wins over the engine's.
 *
 * This is the WordPress/Ghost child-theme idea. Design tokens alone were never
 * going to be enough — a theme that can change colours but not markup cannot
 * change what a page *is*, and every site eventually wants to move the byline
 * or drop a section.
 *
 * Overriding is safe here in a way it is not in a CMS, because the gate does
 * not care who wrote the markup. Delete the canonical from an overridden
 * `SEO.astro` and C-07 fails the build; drop `data-item-list` from a listing
 * page and C-22 reports the mismatch. You can replace anything; you cannot
 * quietly break the contract.
 *
 * Two paths reach the same file and both have to be caught:
 *
 *   `@components/Header.astro`  — an alias, redirected by `overridingAlias`
 *   `./ThemeToggle.astro`       — a sibling import inside the engine, caught here
 *
 * The alias case cannot be handled by this plugin: Vite runs `resolve.alias`
 * ahead of every user plugin, `enforce: 'pre'` included, so by the time a
 * plugin sees an aliased id it is already an absolute path into the package.
 * That is why the redirect lives on the alias entry itself.
 */
function templatesPlugin(root: string, templatesDir: string) {
  const overrides = path.resolve(root, templatesDir);

  return {
    name: 'aifb:templates',
    enforce: 'pre' as const,
    resolveId(id: string, importer?: string) {
      if (!importer || !id.startsWith('.')) return null;
      const absolute = path.resolve(path.dirname(importer), id);
      const own = overrideFor(overrides, absolute);
      // Never redirect a file to itself: an override importing its sibling by
      // relative path is asking for the engine's copy, not for recursion.
      return own && own !== importer ? own : null;
    },
  };
}

/**
 * The site's counterpart of an engine file, if it exists. `undefined` for
 * anything outside an overridable directory.
 */
function overrideFor(overrides: string, absolute: string) {
  const relative = path.relative(here, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return undefined;

  const [dir] = relative.split(path.sep);
  if (!OVERRIDABLE.includes(dir as (typeof OVERRIDABLE)[number])) return undefined;

  const candidate = path.join(overrides, relative);
  return fs.existsSync(candidate) ? candidate : undefined;
}

/**
 * The alias map, with the overridable directories routed through the site's
 * copy when it has one. Vite alias entries take a `customResolver`, which runs
 * after the prefix has been substituted — the one place in the resolve pipeline
 * that sees an aliased import before it becomes a fixed path.
 */
function aliases(root: string, templatesDir: string, hasMermaid: boolean) {
  const overrides = path.resolve(root, templatesDir);

  const engineAliases = ALIASES.map((name) => {
    const replacement = path.join(here, name);
    if (!OVERRIDABLE.includes(name as (typeof OVERRIDABLE)[number])) {
      return { find: `@${name}`, replacement };
    }
    return {
      find: `@${name}`,
      replacement,
      customResolver: (updatedId: string) => overrideFor(overrides, updatedId) ?? updatedId,
    };
  });

  // Exact match, not a prefix: an alias on the bare string would also catch
  // `mermaid/dist/...`, and the stub answers for the package entry only.
  const optionalMermaid = hasMermaid
    ? []
    : [{ find: /^mermaid$/, replacement: path.join(here, 'lib', 'mermaid-absent.ts') }];

  return [...engineAliases, ...optionalMermaid];
}

/**
 * Card and detail components, merged: the engine's set with the site's laid
 * over it by filename. Emitted as a module so the merge happens once, at
 * config time, where both directories are visible.
 */
function renderersPlugin(root: string, templatesDir: string) {
  const resolved = `\0${RENDERERS_MODULE}`;

  return {
    name: 'aifb:renderers',
    resolveId: (id: string) => (id === RENDERERS_MODULE ? resolved : undefined),
    load(id: string) {
      if (id !== resolved) return undefined;

      const collect = (kind: 'cards' | 'details') => {
        const found = new Map<string, string>();
        for (const dir of [path.join(here, 'components', kind), path.resolve(root, templatesDir, kind)]) {
          if (!fs.existsSync(dir)) continue;
          for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.astro'))) {
            // The site directory is second, so it overwrites.
            found.set(file.replace(/\.astro$/, ''), path.join(dir, file));
          }
        }
        return found;
      };

      const cards = collect('cards');
      const details = collect('details');
      const lines: string[] = [];
      let index = 0;

      const emit = (name: string, entries: Map<string, string>) => {
        const pairs: string[] = [];
        for (const [key, file] of entries) {
          const local = `m${index++}`;
          lines.push(`import ${local} from ${JSON.stringify(file)};`);
          pairs.push(`  ${JSON.stringify(key)}: ${local},`);
        }
        return `export const ${name} = {\n${pairs.join('\n')}\n};`;
      };

      const cardsOut = emit('cards', cards);
      const detailsOut = emit('details', details);
      return `${lines.join('\n')}\n${cardsOut}\n${detailsOut}\n`;
    },
  };
}

/**
 * Hands the engine the site's themes instead of letting it reach for them.
 *
 * The alternative — a relative `import.meta.glob` from a layout up into
 * `site/themes/` — is a path that silently resolves to nothing the moment the
 * engine moves. It did exactly that when the engine became a package, and the
 * build only failed at render time. A package should not know where the project
 * that installed it keeps its files; the integration knows, because Astro tells
 * it the project root.
 */
function themesPlugin(root: string, themesDir: string) {
  const resolved = `\0${THEMES_MODULE}`;
  const dir = path.resolve(root, themesDir);

  return {
    name: 'aifb:themes',
    resolveId: (id: string) => (id === THEMES_MODULE ? resolved : undefined),
    load(id: string) {
      if (id !== resolved) return undefined;

      const names = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((file) => file.endsWith('.css')).map((file) => file.replace(/\.css$/, ''))
        : [];

      // Only the selected theme is imported. Importing all of them emits every
      // token file into the build as an asset, and all but one is dead weight
      // no page ever links to — the mode toggle switches a data attribute, not
      // a stylesheet. The other names are still exported so a wrong
      // `theme.name` can be answered with the list of real ones.
      const active = names.includes(site.theme.name) ? site.theme.name : undefined;
      const importLine = active
        ? `import activeUrl from ${JSON.stringify(`${path.join(dir, `${active}.css`)}?url`)};`
        : 'const activeUrl = undefined;';

      return [
        importLine,
        `export const themes = ${active ? `{ ${JSON.stringify(active)}: activeUrl }` : '{}'};`,
        `export const themeNames = ${JSON.stringify(names)};`,
        `export const themesDir = ${JSON.stringify(themesDir)};`,
        '',
      ].join('\n');
    },
  };
}

/**
 * `https://example.com` and `https://example.com/` are one origin written two
 * ways — Astro normalises what it is given, site.yaml is typed by a person.
 * Comparing the raw strings would warn about punctuation. A value neither
 * parser accepts is left alone: whichever loader owns it reports it better.
 */
function normalized(value: string) {
  try {
    return new URL(value).href.replace(/\/$/, '');
  } catch {
    return value;
  }
}

export type EngineOptions = {
  /**
   * Emit Cloudflare Pages `_redirects` and `_headers` at the end of the build.
   * Turn it off for a host that reads neither.
   */
  cloudflare?: boolean;
  /**
   * Let the engine set Astro's `site` from the intent layer. Turn it off for a
   * site whose `astro.config.mjs` already owns its canonical origin.
   *
   * The reason to turn it off is not that the two values might disagree — they
   * usually will not. It is that a host can make supplying the origin a
   * *precondition* of building: `throw` when `PUBLIC_SITE_URL` is missing, so a
   * misconfigured pipeline can never quietly ship a sitemap pointing at the
   * wrong domain. `config/site.ts` falls back to `site.yaml`'s `url` when the
   * variable is absent, so the engine setting `site` supplies exactly the value
   * that guard exists to refuse. Deferring is the only way to keep it closed.
   *
   * The engine's own output — canonical tags, RSS, `llms.txt` — keeps using
   * `site.url` either way. A disagreement is reported at `astro:config:done`.
   */
  site?: boolean;
  /** Where the site keeps its theme token files, relative to the project root. */
  themesDir?: string;
  /**
   * Where the site keeps template overrides, relative to the project root.
   * Any file here shadows the engine's file of the same path:
   *
   *   site/templates/components/Footer.astro
   *   site/templates/cards/ArticleCard.astro
   *   site/templates/layouts/BaseLayout.astro
   *   site/templates/pages/index.astro
   */
  templatesDir?: string;
  /**
   * Where the engine lives in the site's URL space. Defaults to `'/'`: the
   * engine owns the origin root, which is what a site that is only a blog
   * wants and what every version before 0.3.0 did.
   *
   *   engine({ mount: '/zh/blog' })
   *
   * moves every route the engine injects under that prefix — `/zh/blog/`,
   * `/zh/blog/writing/my-post/`, `/zh/blog/rss.xml` — and stops it injecting
   * `/404` and `/robots.txt` at all, because those are facts about the origin
   * and belong to whoever owns it. Canonicals, breadcrumbs, JSON-LD, the
   * sitemap and the feeds all carry the prefix; so do `/topics/`-style hrefs
   * written in site/site.yaml, so the intent layer never spells the mount out.
   */
  mount?: string;
  /**
   * Which of the engine's fixed pages to publish. Defaults to all of them:
   *
   *   about · newsletter · series · topics · uses · work-with-me
   *
   * A host site that already has an About page, or simply does not want a
   * Uses page, lists the ones it wants:
   *
   *   engine({ mount: '/zh/blog', pages: ['topics', 'series'] })
   *
   * A declined page is not injected, needs no copy in site/pages.yaml, and is
   * dropped from the links the engine renders — a page the site does not
   * publish must not be linked from its own footer.
   *
   * The root page, `/rss.xml`, `/llms.txt` and the content type routes are not
   * governed here: the first three are what a mounted engine *is*, and a
   * content type is declined by removing it from site/content-types.yaml.
   */
  pages?: OptionalPage[];
};

/**
 * What `@astrojs/sitemap` needs to know about this site's languages.
 *
 *     import { engine, sitemapOptions } from 'aifb-engine';
 *     sitemap(sitemapOptions())
 *
 * The sitemap integration belongs to the site — it is in the site's
 * astro.config, it may be dropped for a preview build, and a host site may
 * already have one. So the engine does not install it; it answers the one
 * question the site cannot answer without parsing site.yaml itself, which is the
 * same reason `engine({ site })` exists.
 *
 * `{}` for a single-language site, which makes `sitemap(sitemapOptions())`
 * byte-identical to `sitemap()`.
 *
 * Under a mount it still returns the option and the option does nothing —
 * @astrojs/sitemap keys off the first path segment, which under a mount is the
 * mount. Returning it anyway rather than detecting the mount here is
 * deliberate: this function is evaluated inside the site's `integrations` array
 * and cannot know whether `engine()` has been constructed yet, and a helper
 * whose answer depends on the order of two lines in someone else's config file
 * is worse than one that is inert. The integration logs the warning, from the
 * one place that does know the mount.
 */
export function sitemapOptions(): { i18n?: { defaultLocale: string; locales: Record<string, string> } } {
  if (!isMultiLocale) return {};
  return {
    i18n: {
      defaultLocale: siteLocales.find((locale) => locale.tag === defaultLocale)!.prefix,
      locales: Object.fromEntries(siteLocales.map((locale) => [locale.prefix, locale.tag])),
    },
  };
}

export function engine(options: EngineOptions = {}): AstroIntegration[] {
  // `site` here is the option, not the loaded config of the same name.
  const { cloudflare = true, site: setSite = true, themesDir = 'site/themes', templatesDir = 'site/templates' } = options;
  // Resolved here rather than in the hook: `configureRoutes` publishes the
  // result to the module graph the pages render in, and Astro loads this file
  // before it loads anything that renders. See config/routes.ts.
  const routing = configureRoutes({ mount: options.mount, pages: options.pages });
  /**
   * Mount outside, locale inside. The same order `withLocale()` composes links
   * in — see the header comment in config/routes.ts for why it is that way
   * round, and why these two must not be able to disagree.
   */
  const routePattern = (pattern: string) => {
    const localised = localePattern(pattern);
    return routing.mount === '' ? localised : `${routing.mount}${localised === '/' ? '' : localised}`;
  };

  /**
   * The file tree's pattern → the URL the site actually asked for.
   *
   * Route patterns are derived from the engine's own directory names, which
   * made two of them unmovable: `pages/tags/[slug].astro` could only ever be
   * `/tags/[slug]`, and `pages/[type]/[slug].astro` could only ever carry a
   * type segment. Both are the site's URL space, not the engine's filing
   * system, so the mapping happens here — once, on the way into `injectRoute`.
   *
   * Deliberately *not* applied before `pageGroup()`: the whitelist, the copy
   * check and the override lookup all key off the page's canonical name, and a
   * site that renamed its tag archive did not rename `pages: ['tags']`.
   */
  const publicPattern = (pattern: string) => {
    const segments = pattern.split('/');
    const first = segments[1];

    if ((TAXONOMY_PAGES as readonly string[]).includes(first ?? '')) {
      segments[1] = segmentFor(first as TaxonomyPage);
      return segments.join('/');
    }

    // The list page keeps its route; only entry URLs move to the root. See
    // `routeAtRoot` in config/content-types.ts for why the archive stays.
    if (rootRoutedTypeName !== undefined && first === '[type]' && segments[2] === '[slug]') {
      return '/[slug]';
    }

    return pattern;
  };

  /** Astro tells the integration where the project is; the build hook needs it too. */
  let projectRoot = process.cwd();

  const main: AstroIntegration = {
    name: 'aifb-engine',
    hooks: {
      'astro:config:setup': ({ injectRoute, updateConfig, config, logger }) => {
        const hasMermaid = mermaidInstalled(fileURLToPath(config.root));
        // Said out loud, because the alternative is a site that used to render
        // diagrams quietly serving code blocks after an unrelated install.
        if (!hasMermaid) {
          logger.info('mermaid is not installed — ```mermaid blocks will render as code. `npm i mermaid` to draw them.');
        }

        updateConfig({
          // The canonical origin comes from the intent layer, and reading the
          // intent layer is the engine's job. A site's astro.config had to
          // parse site.yaml itself to supply this — which meant every site
          // needed a YAML parser as a dependency to state a fact it had
          // already stated.
          //
          // Not every site wants that: one whose astro.config refuses to build
          // without an explicit origin has made supplying it a precondition,
          // and answering the question for it turns that guard into a no-op.
          // `site: false` leaves the key out and the site's own value stands.
          ...(setSite ? { site: site.url } : {}),
          vite: {
            plugins: [
              themesPlugin(fileURLToPath(config.root), themesDir),
              templatesPlugin(fileURLToPath(config.root), templatesDir),
              renderersPlugin(fileURLToPath(config.root), templatesDir),
            ],
            resolve: {
              alias: aliases(fileURLToPath(config.root), templatesDir, hasMermaid),
            },
            // The diagram renderer's one guard. False here means the site did
            // not install the optional peer, and a ```mermaid block stays a
            // readable code block instead of becoming an empty figure.
            define: { __AIFB_MERMAID__: JSON.stringify(hasMermaid) },
          },
        });

        projectRoot = fileURLToPath(config.root);

        const siteRoutes = path.resolve(projectRoot, templatesDir, 'pages');
        const routes = collectRoutes(path.join(here, 'pages'));
        /** The site's own file for a route, if it has one. */
        const ownFile = (route: { entrypoint: string }) =>
          path.join(siteRoutes, route.entrypoint.replace('aifb-engine/pages/', ''));

        const publishes = (group: string) => {
          if ((ROOT_ONLY_PAGES as readonly string[]).includes(group)) return routing.mount === '';
          if ((OPTIONAL_PAGES as readonly string[]).includes(group)) return routing.pages.has(group as OptionalPage);
          return true;
        };

        const selected = routes.filter((route) => publishes(pageGroup(route.pattern)));
        const declined = routes.filter((route) => !publishes(pageGroup(route.pattern)));

        /**
         * Whitelist beats override, and says so.
         *
         * `pages` decides whether a URL exists; `templatesDir/pages` decides who
         * renders one that does. So a site that declines `uses` does not get
         * `/uses/` back by dropping a file into the override directory — that
         * would make the whitelist advisory, and "I removed it from the list and
         * it is still there" is not a state anyone should have to debug. A site
         * that wants its own page at that URL puts it in its own `src/pages/`,
         * where it is the site's route and not the engine's, and where the mount
         * does not move it.
         *
         * The file is not silently ignored, though: an override that can never
         * resolve is the exact shape of defect the scenario suite exists for.
         */
        for (const route of declined.filter((item) => fs.existsSync(ownFile(item)))) {
          logger.warn(
            `${path.relative(projectRoot, ownFile(route))} overrides "${pageGroup(route.pattern)}", which ` +
              'engine({ pages }) does not publish — nothing is injected at that URL. Add the page to the ' +
              'whitelist, or move the file to src/pages/ to serve it as the site\'s own route.',
          );
        }

        /**
         * The copy each injected page reads, checked before the build instead of
         * at render time. A site that declines a page needs none of it; a site
         * whose own template renders the page is not asked for it either, since
         * it may not read pages.yaml at all.
         */
        const copyProblems = [...routing.pages].flatMap((name) => {
          const copyRoute = selected.find((route) => route.pattern === `/${name}`);
          if (!copyRoute || fs.existsSync(ownFile(copyRoute))) return [];
          return pageCopyProblems(name);
        });
        if (copyProblems.length > 0) fail('site/pages.yaml', copyProblems);

        let overridden = 0;

        for (const route of selected) {
          const pattern = routePattern(publicPattern(route.pattern));
          // A page the site provides replaces the engine's, at the same URL.
          const own = ownFile(route);
          if (fs.existsSync(own)) {
            injectRoute({ pattern, entrypoint: own, prerender: true });
            overridden += 1;
          } else {
            injectRoute({ ...route, pattern, prerender: true });
          }
        }

        logger.info(
          `${selected.length} route(s) injected${routing.mount === '' ? '' : ` under ${routing.mount}/`}` +
            `${isMultiLocale ? ` in ${siteLocales.length} locales (${siteLocales.map((locale) => locale.tag).join(', ')})` : ''}` +
            `${overridden > 0 ? `, ${overridden} overridden by ${templatesDir}/pages` : ''}` +
            `${declined.length > 0 ? `, ${declined.length} declined` : ''}`,
        );

        /**
         * `@astrojs/sitemap` reads the locale out of the *first* path segment
         * (see its parse-i18n-url.js), so under a mount `/blog/en/writing/`
         * looks to it like a page in a locale called "blog". It does not fail —
         * it silently pairs nothing, which is the state this project reports
         * rather than ships. `sitemapOptions()` leaves `i18n` off in that case;
         * the `<link rel="alternate">` tags in every page's head are emitted by
         * the engine either way and are what Google reads first.
         */
        if (isMultiLocale && routing.mount !== '') {
          logger.warn(
            'A mounted, multi-locale site cannot use @astrojs/sitemap\'s i18n option: it keys off the first ' +
              `path segment, which here is "${routing.mount.split('/')[1]}". hreflang is still emitted in every ` +
              'page head, which is sufficient on its own; the sitemap simply carries no xhtml:link pairs.',
          );
        }
      },

      /**
       * Record what this build was, for the tools that run after it. See
       * BUILD_INFO above.
       */
      'astro:build:done': async () => {
        const file = path.join(projectRoot, BUILD_INFO);
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        await fs.promises.writeFile(
          file,
          `${JSON.stringify(
            {
              generatedAt: new Date().toISOString(),
              mount: routing.mount,
              pages: [...routing.pages].sort(),
              // The gate reads URL shape, and on a translated site the first
              // segment after the mount is a language rather than a section.
              // Same reason the mount is written down: `pnpm validate` runs in
              // its own process and cannot see site.yaml's opinion of the URL
              // space, only the URLs.
              defaultLocale,
              locales: siteLocales,
            },
            null,
            2,
          )}\n`,
        );
      },
      'astro:config:done': ({ config, logger }) => {
        // Under `site: false` the origin has two sources again — Astro's for
        // the sitemap, the intent layer's for canonicals, RSS and llms.txt —
        // and nothing else in the pipeline compares them. C-07 only checks
        // canonicals against `site.url`, so a sitemap on the other origin
        // passes the gate and is discovered by a crawler instead.
        //
        // Reported, not enforced: a preview or branch build legitimately serves
        // a production canonical from another hostname, which is the same
        // shape as the mistake. Failing here would break deploys that are
        // working as designed.
        if (config.site && normalized(config.site) !== normalized(site.url)) {
          logger.warn(
            `astro.config site is ${config.site}, site.yaml resolves to ${site.url}. ` +
              'The sitemap follows the first, canonical/RSS/llms.txt the second. ' +
              'Expected on a preview domain; otherwise set PUBLIC_SITE_URL or drop `site: false`.',
          );
        }
      },
    },
  };

  return cloudflare ? [main, cloudflarePages()] : [main];
}
