export type Severity = 'error' | 'warn';

export type Violation = {
  /** Rule id, e.g. "C-01". */
  rule: string;
  severity: Severity;
  /** Repo-relative file, or a built URL for rules that inspect dist/. */
  file: string;
  line?: number;
  message: string;
  /** Concrete next action. Written for an agent to act on without guessing. */
  fix: string;
};

/** A content file parsed from content/<type>/<file>.mdx. */
export type SourceEntry = {
  /** Repo-relative path. */
  file: string;
  /** Content type name, i.e. the directory under content/. */
  type: string;
  data: Record<string, any>;
  body: string;
  /** Line number of each frontmatter key, for precise error locations. */
  frontmatterLines: Record<string, number>;
};

/** A page parsed from dist/. */
export type BuiltPage = {
  /** Site-absolute URL path, e.g. "/writing/my-post/". */
  url: string;
  /** Repo-relative file. */
  file: string;
  html: string;
};

export type RuleContext = {
  entries: SourceEntry[];
  pages: BuiltPage[];
  /** True when dist/ was present; dist-dependent rules skip otherwise. */
  hasBuild: boolean;
  siteOrigin: string;
  /**
   * Where the engine was mounted for this build: `''` at the origin root,
   * otherwise e.g. `/zh/blog`.
   *
   * Several rules read meaning out of the shape of a URL — one segment is a
   * listing page, two is a detail page, `/` is the home page. Under a mount
   * every one of those counts is off by the depth of the prefix, so a rule that
   * does not subtract it stops matching what it was written to match and
   * reports nothing. Use `enginePath()` from ./url rather than `page.url`
   * wherever the segments are what the rule is about.
   */
  mount: string;
  /**
   * The URL segment of every non-default locale this build published, e.g.
   * `['en']`. Empty for a single-language site, which is every site that has
   * not opted in.
   *
   * Same argument as `mount`, one segment further in: `/en/writing/` is a
   * listing page in English, and a rule that counts from the origin files it as
   * a detail page and stops checking listing pages in that language. The gate
   * cannot see site.yaml's opinion of the URL space — it runs in its own
   * process — so the build writes it to `.aifb/build.json`.
   */
  localePrefixes: string[];
  /** The site's default locale, served with no prefix. */
  defaultLocale: string;
};

export type Rule = {
  id: string;
  title: string;
  severity: Severity;
  /** Set when the rule needs dist/ to have been built. */
  needsBuild?: boolean;
  run: (ctx: RuleContext) => Violation[] | Promise<Violation[]>;
};
