import type { APIRoute } from 'astro';
import { getDiscoveryItems } from '@lib/discovery';

export const GET: APIRoute = async () => {
  const items = await getDiscoveryItems();
  return new Response(JSON.stringify({
    items,
  }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
};
