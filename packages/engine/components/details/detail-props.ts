import type { ContentTypeDef } from '@content-types/index';
import type { AnyEntry } from '@lib/content';

export type Heading = { depth: number; slug: string; text: string };

/**
 * Uniform prop contract for every detail component.
 * The [type]/[slug] route dispatches details generically.
 */
export type DetailProps = {
  entry: AnyEntry;
  type: ContentTypeDef;
  /** Rendered MDX body. */
  Content: unknown;
  headings: Heading[];
  canonical: string;
};
