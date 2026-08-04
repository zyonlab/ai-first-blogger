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
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { cloudflarePages } from './deploy/cloudflare';
import { site } from './config/site';

const here = path.dirname(fileURLToPath(import.meta.url));

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

const THEMES_MODULE = 'virtual:aifb/themes';
const RENDERERS_MODULE = 'virtual:aifb/renderers';

/** Directories a site may shadow, mirroring the engine's own layout. */
const OVERRIDABLE = ['components', 'layouts'] as const;

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
function aliases(root: string, templatesDir: string) {
  const overrides = path.resolve(root, templatesDir);

  return ALIASES.map((name) => {
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

export type EngineOptions = {
  /**
   * Emit Cloudflare Pages `_redirects` and `_headers` at the end of the build.
   * Turn it off for a host that reads neither.
   */
  cloudflare?: boolean;
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
};

export function engine(options: EngineOptions = {}): AstroIntegration[] {
  const { cloudflare = true, themesDir = 'site/themes', templatesDir = 'site/templates' } = options;

  const main: AstroIntegration = {
    name: 'aifb-engine',
    hooks: {
      'astro:config:setup': ({ injectRoute, updateConfig, config, logger }) => {
        updateConfig({
          // The canonical origin comes from the intent layer, and reading the
          // intent layer is the engine's job. A site's astro.config had to
          // parse site.yaml itself to supply this — which meant every site
          // needed a YAML parser as a dependency to state a fact it had
          // already stated.
          site: site.url,
          vite: {
            plugins: [
              themesPlugin(fileURLToPath(config.root), themesDir),
              templatesPlugin(fileURLToPath(config.root), templatesDir),
              renderersPlugin(fileURLToPath(config.root), templatesDir),
            ],
            resolve: {
              alias: aliases(fileURLToPath(config.root), templatesDir),
            },
          },
        });

        const siteRoutes = path.resolve(fileURLToPath(config.root), templatesDir, 'pages');
        const routes = collectRoutes(path.join(here, 'pages'));
        let overridden = 0;

        for (const route of routes) {
          // A page the site provides replaces the engine's, at the same URL.
          const own = path.join(siteRoutes, route.entrypoint.replace('aifb-engine/pages/', ''));
          if (fs.existsSync(own)) {
            injectRoute({ pattern: route.pattern, entrypoint: own, prerender: true });
            overridden += 1;
          } else {
            injectRoute({ ...route, prerender: true });
          }
        }

        logger.info(
          `${routes.length} route(s) injected${overridden > 0 ? `, ${overridden} overridden by ${templatesDir}/pages` : ''}`,
        );
      },
    },
  };

  return cloudflare ? [main, cloudflarePages()] : [main];
}
