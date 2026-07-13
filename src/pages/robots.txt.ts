import { site } from '@data/site';
import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const staging = process.env.PUBLIC_DEPLOY_ENV === 'staging';
  const body = staging
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap-index.xml', site.url).toString()}\n`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
