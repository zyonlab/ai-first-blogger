import { site } from '@data/site';
import type { APIRoute } from 'astro';

export const GET: APIRoute = () =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap-index.xml', site.url).toString()}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
