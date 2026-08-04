/**
 * Resolves the card / detail components a content type declares by name.
 *
 * The map comes from `virtual:aifb/renderers`, which the integration builds by
 * laying the site's `site/templates/{cards,details}/` over the engine's own set.
 * A site that drops in `ArticleCard.astro` replaces the engine's; a site that
 * drops in `TimelineCard.astro` adds one, and can reference it by name.
 *
 * Doing the merge at config time rather than with two globs here is what lets
 * the site's directory live outside the package — a glob can only reach files
 * whose path the engine already knows.
 */
import { cards, details } from 'virtual:aifb/renderers';

/**
 * Astro component factory. Typed loosely on purpose: components are resolved by
 * name, so the concrete prop type is not known here. Cards and details enforce
 * their own contract via CardProps / DetailProps.
 */
export type AnyComponent = (props: any) => any;

function pick(modules: Record<string, unknown>, kind: string, key: string) {
  const found = modules[key];
  if (!found) {
    throw new Error(
      `No ${kind} component named "${key}". Available: ${Object.keys(modules).join(', ') || '(none)'}.\n` +
        `Add site/templates/${kind}/${key}.astro to provide it, or point the content type at one of the above.`,
    );
  }
  return found;
}

export function cardFor(key: string): AnyComponent {
  return pick(cards, 'cards', key) as AnyComponent;
}

export function detailFor(key: string): AnyComponent {
  return pick(details, 'details', key) as AnyComponent;
}
