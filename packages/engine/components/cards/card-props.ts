import type { ContentTypeDef } from '@content-types/index';
import type { AnyEntry } from '@lib/content';

/**
 * Uniform prop contract for every card component.
 * The list page dispatches cards generically, so all cards take the same props.
 */
export type CardProps = {
  entry: AnyEntry;
  type: ContentTypeDef;
  /**
   * Heading level for the card title.
   *
   * A card's title is not a fixed depth — it depends on what is above it. On the
   * home page each card sits under a section `<h2>`, so `h3` is right. On a
   * listing page the cards sit directly under the page `<h1>`, and `h3` there
   * skips a level: every listing page shipped `h1 → h3`, which is the exact
   * defect C-09 exists to catch in article bodies. The rule had simply never
   * been pointed at the engine's own markup.
   *
   * Defaults to 3 so the home page and any existing caller stay correct.
   */
  headingLevel?: 2 | 3;
};
