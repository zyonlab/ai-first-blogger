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
};

export type Rule = {
  id: string;
  title: string;
  severity: Severity;
  /** Set when the rule needs dist/ to have been built. */
  needsBuild?: boolean;
  run: (ctx: RuleContext) => Violation[] | Promise<Violation[]>;
};
