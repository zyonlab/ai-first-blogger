/**
 * Old slug → new slug overrides for `pnpm migrate:ghost`.
 *
 * Ships empty. Add an entry only when you want a migrated post to live at a
 * different URL than its Ghost slug; everything else is slugified as-is.
 * Anything listed here should also get a redirect from the old URL, or the
 * inbound links to it die with the migration.
 *
 *   export const slugMap: Record<string, string> = {
 *     'old-ghost-slug-2019': 'the-title-i-actually-want',
 *   };
 */
export const slugMap: Record<string, string> = {};
