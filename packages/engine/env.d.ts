/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare module 'virtual:aifb/themes' {
  /** The selected theme only — one entry, or none if the name is wrong. */
  export const themes: Record<string, string>;
  /** Every theme file present, for error messages. */
  export const themeNames: string[];
  /** Where those files came from, for error messages. */
  export const themesDir: string;
}

declare module 'virtual:aifb/renderers' {
  /** Card components by name — the engine's, with the site's laid over them. */
  export const cards: Record<string, unknown>;
  /** Detail components by name, merged the same way. */
  export const details: Record<string, unknown>;
}
