import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const configuredSiteUrl = process.env.PUBLIC_SITE_URL?.trim();
const isDeploymentBuild = process.env.CI === 'true' || process.env.CF_PAGES === '1';
const isStagingBuild = process.env.PUBLIC_DEPLOY_ENV === 'staging';

function validateSiteUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`PUBLIC_SITE_URL must be a valid absolute URL. Received: ${value}`);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('PUBLIC_SITE_URL must use http or https.');
  }

  if (url.hostname.endsWith('.example')) {
    throw new Error('PUBLIC_SITE_URL cannot use a placeholder .example domain.');
  }

  return url.origin;
}

if (isDeploymentBuild && !configuredSiteUrl) {
  throw new Error('PUBLIC_SITE_URL is required for deployment builds.');
}

const siteUrl = configuredSiteUrl
  ? validateSiteUrl(configuredSiteUrl)
  : 'http://localhost:4321';

function hasPublishableFiles(directory) {
  try {
    return readdirSync(path.resolve(directory), { recursive: true })
      .some((file) => /\.(md|mdx)$/.test(String(file)));
  } catch {
    return false;
  }
}

const hasPosts = hasPublishableFiles('src/content/posts');
const emptyCollectionPaths = new Set([
  ...(!hasPosts ? ['/writing/', '/series/', '/topics/'] : []),
  ...(!hasPublishableFiles('src/content/videos') ? ['/videos/'] : []),
  ...(!hasPublishableFiles('src/content/projects') ? ['/projects/'] : []),
  ...(!hasPublishableFiles('src/content/case-studies') ? ['/case-studies/'] : []),
]);
const nonIndexablePaths = new Set(['/search/']);

export default defineConfig({
  site: siteUrl,
  output: 'static',
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => {
        if (isStagingBuild) return false;
        const pathname = new URL(page).pathname;
        return !pathname.includes('/drafts/') && !emptyCollectionPaths.has(pathname) && !nonIndexablePaths.has(pathname);
      },
    }),
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },
});
