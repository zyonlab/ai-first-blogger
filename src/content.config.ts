/**
 * Astro requires the collection config inside the project's own srcDir, so this
 * one file stays with the site. It declares nothing: the collections come from
 * the content type registry, which is half `site/content-types.yaml` and half
 * `packages/engine/content-types/`.
 */
export { collections } from 'aifb-engine/content-config';
