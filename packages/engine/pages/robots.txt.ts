import { site } from '@config/site';
import type { APIRoute } from 'astro';

/**
 * On a preview deploy every page is noindex and no sitemap is generated, so
 * robots.txt has to say the same thing. Three files disagreeing about whether a
 * host should be crawled is how a preview gets indexed anyway.
 */
const isPreview = import.meta.env.DEPLOY_CONTEXT === 'preview';

const body = isPreview
  ? 'User-agent: *\nDisallow: /\n'
  : `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap-index.xml', site.url).toString()}\n`;

export const GET: APIRoute = () =>
  new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
