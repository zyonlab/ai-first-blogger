import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { engine, sitemapOptions } from 'aifb-engine';

/**
 * Three planes:
 *   site/      intent + policy — what a human decides (YAML/Markdown)
 *   content/   the published material
 *   packages/  mechanism — aifb-engine injects the routes, aifb runs the gate
 *
 * See docs/adr/0002-three-planes.md.
 */

/** Vite does not watch files outside srcDir, so edits to site/ would need a
 *  manual restart. This wires them into the dev server's watcher instead. */
function watchIntentLayer() {
  return {
    name: 'watch-site-intent',
    configureServer(server) {
      server.watcher.add('site');
      server.watcher.on('change', (file) => {
        if (file.includes(`${'/'}site${'/'}`)) server.restart();
      });
    },
  };
}

/**
 * Preview deploys must not compete with production for the same queries.
 * A branch preview is a byte-identical copy of the site on another hostname —
 * left indexable it is textbook duplicate content, and the two URLs split
 * whatever authority the pages have.
 *
 * So a preview build marks every page noindex *and* ships no sitemap: telling
 * crawlers "index this" in one file and "do not" in another is the mismatch
 * rule C-20 exists to catch.
 */
const isPreview = process.env.DEPLOY_CONTEXT === 'preview';

export default defineConfig({
  output: 'static',
  integrations: [
    mdx(),
    // No filter needed: `draft: true` entries are dropped in getEntries(), so
    // they never produce a page for the sitemap to pick up.
    //
    // `sitemapOptions()` is `{}` until site/site.yaml declares more than one
    // locale, and then it is the `i18n` block @astrojs/sitemap needs to write
    // xhtml:link alternates. The sitemap integration stays the site's — a
    // preview build drops it, and a host site may already have one — so the
    // engine answers the one question about it that requires reading site.yaml.
    ...(isPreview ? [] : [sitemap(sitemapOptions())]),
    // Injects the engine's routes and resolves its internal aliases, so the
    // package works the same whether it sits in packages/ or node_modules/.
    engine(),
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },
  vite: {
    plugins: [watchIntentLayer()],
  },
});
