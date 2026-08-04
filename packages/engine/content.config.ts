/**
 * Collections are derived from the content type registry.
 * Do not add collections here — add a content type instead (site/content-types.yaml
 * plus engine/content-types/<name>.ts). See docs/recipes/add-content-type.md.
 */
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { registry } from './content-types';
import { isDeclaredLocale } from './config/routes';

/**
 * `locale` and `translationKey`, added to every type's schema in one place.
 *
 * See LOCALE_FIELDS in content-types/types.ts for what they mean and why they
 * are not declared per type. Both are optional: on a single-language site
 * neither is ever written, and a schema that gained two required fields would
 * have failed every existing article on upgrade.
 */
/**
 * Structural, because `astro:content` re-exports `z` as a value and not as a
 * namespace — `z.ZodObject` is not a type anything here can name. `.extend()`
 * is the only thing this file needs from the schema, so it asks for that.
 */
type Extendable = { extend: (shape: Record<string, unknown>) => unknown };

const localeFields = {
  locale: z
    .string()
    .refine(isDeclaredLocale, {
      message: 'must be a locale declared in site/site.yaml under `locales`',
    })
    .optional(),
  translationKey: z.string().optional(),
};

export const collections = Object.fromEntries(
  registry.map((type) => [
    type.name,
    defineCollection({
      loader: glob({
        pattern: '**/*.{md,mdx}',
        base: `./content/${type.name}`,
        /**
         * The id is the path, not the slug.
         *
         * Astro's default is `data.slug` when the frontmatter has one, and
         * every content type here requires one — so `content/posts/x.mdx` and
         * its translation at `content/posts/en/x.mdx` were the *same id*, and
         * the loader's answer to that is to overwrite one with the other. A
         * translation that keeps its slug is the common case, so the shipped
         * default silently deleted the article it was a translation of.
         *
         * Keeping the path also gives the locale somewhere to come from
         * (`localeOf` in lib/content.ts). A single-language site's URLs are
         * built from `data.slug` and never from the id, so nothing about its
         * output moves.
         */
        generateId: ({ entry }) => entry.replace(/\.mdx?$/, ''),
      }),
      schema: (type.schema as Extendable).extend(localeFields) as never,
    }),
  ]),
);
