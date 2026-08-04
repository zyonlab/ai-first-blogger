/**
 * Collections are derived from the content type registry.
 * Do not add collections here — add a content type instead (site/content-types.yaml
 * plus engine/content-types/<name>.ts). See docs/recipes/add-content-type.md.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { registry } from './content-types';

export const collections = Object.fromEntries(
  registry.map((type) => [
    type.name,
    defineCollection({
      loader: glob({ pattern: '**/*.{md,mdx}', base: `./content/${type.name}` }),
      schema: type.schema as never,
    }),
  ]),
);
