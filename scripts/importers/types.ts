export type ImportSource = 'ghost' | 'wordpress';

export type ImportedMedia = {
  sourceUrl: string;
  role: 'content' | 'feature' | 'attachment';
  alt?: string;
  sourceId?: string;
};

export type ImportedContent = {
  source: ImportSource;
  sourceId: string;
  sourceType: string;
  title: string;
  slugHint: string;
  description?: string;
  body: string;
  publishedAt?: string;
  updatedAt?: string;
  draft: boolean;
  authors: string[];
  tags: string[];
  categories: string[];
  metadata: Record<string, string | number | boolean | null>;
  legacyUrl?: string;
  media: ImportedMedia[];
  warnings: string[];
};

export type SkippedContent = {
  sourceId: string;
  sourceType: string;
  title?: string;
  reason: string;
};

export type ParsedExport = {
  source: ImportSource;
  sourceVersion?: string;
  siteUrl?: string;
  content: ImportedContent[];
  mediaInventory: ImportedMedia[];
  skipped: SkippedContent[];
  warnings: string[];
};

export type MigrationEntry = {
  sourceId: string;
  sourceType: string;
  title: string;
  slug: string;
  destination: string;
  action: 'create' | 'overwrite' | 'blocked';
  draft: boolean;
  authors: string[];
  tags: string[];
  categories: string[];
  sourceMetadata: Record<string, string | number | boolean | null>;
  legacyUrl?: string;
  redirect?: { from: string; to: string };
  media: ImportedMedia[];
  warnings: string[];
};

export type MigrationReport = {
  schemaVersion: 1;
  source: ImportSource;
  sourceFile: string;
  sourceSha256: string;
  sourceVersion?: string;
  siteUrl?: string;
  mode: 'dry-run' | 'apply';
  category: string;
  counts: {
    discovered: number;
    planned: number;
    drafts: number;
    skipped: number;
    mediaReferences: number;
    redirects: number;
    blocked: number;
  };
  entries: MigrationEntry[];
  mediaInventory: ImportedMedia[];
  skipped: SkippedContent[];
  warnings: string[];
};
