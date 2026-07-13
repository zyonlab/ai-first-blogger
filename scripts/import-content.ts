import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { parseGhostExport } from './importers/ghost';
import { legacyPath, normalizeRoute } from './importers/shared';
import type { ImportedContent, MigrationEntry, MigrationReport, ParsedExport } from './importers/types';
import { parseWordPressExport } from './importers/wordpress';

const categories = new Set([
  'ai-applications', 'llm-learning', 'full-stack-engineering', 'frontend-architecture',
  'vue-react-internals', 'web3-defi', 'exchange-systems', 'engineering-productivity',
  'ai-engineering', 'career', 'notes',
]);

type ImportFormat = 'ghost' | 'wordpress';
type PlannedWrite = { destination: string; content: string; exists: boolean };

export type ImportOptions = {
  root: string;
  inputFile: string;
  format?: ImportFormat;
  category?: string;
  apply?: boolean;
  overwrite?: boolean;
  confirm?: string;
};

export type ImportPlan = {
  confirmationHash: string;
  reportPath: string;
  report: MigrationReport;
  writes: PlannedWrite[];
};

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function detectFormat(file: string, source: string): ImportFormat {
  if (path.extname(file).toLowerCase() === '.json' || source.trimStart().startsWith('{')) return 'ghost';
  if (path.extname(file).toLowerCase() === '.xml' || /<rss\b/i.test(source)) return 'wordpress';
  throw new Error('Cannot detect export format; pass --format ghost or --format wordpress');
}

function parseExport(format: ImportFormat, source: string): ParsedExport {
  return format === 'ghost' ? parseGhostExport(source) : parseWordPressExport(source);
}

function sourceKey(item: ImportedContent) {
  return `${item.source}:${item.sourceType}:${item.sourceId}`;
}

function allocateSlugs(items: ImportedContent[]) {
  const result = new Map<string, string>();
  const groups = new Map<string, ImportedContent[]>();
  for (const item of items) groups.set(item.slugHint, [...(groups.get(item.slugHint) ?? []), item]);
  for (const [base, group] of [...groups].sort(([left], [right]) => left.localeCompare(right, 'en'))) {
    group.sort((left, right) => sourceKey(left).localeCompare(sourceKey(right), 'en'));
    group.forEach((item, index) => result.set(sourceKey(item), index === 0 ? base : `${base}-${index + 1}`));
  }
  return result;
}

function yamlDate(value: string | undefined) {
  return (value ?? '1970-01-01T00:00:00.000Z').slice(0, 10);
}

function renderMdx(item: ImportedContent, slug: string, category: string, legacy: string | undefined) {
  const data: Record<string, unknown> = {
    title: item.title,
    description: item.description ?? item.title,
    slug,
    pubDate: yamlDate(item.publishedAt),
    draft: item.draft || !item.publishedAt,
    category,
    tags: item.tags,
  };
  if (item.updatedAt) data.updatedDate = yamlDate(item.updatedAt);
  if (item.authors[0]) data.author = item.authors[0];
  if (legacy) data.legacySlug = legacy;
  return `---\n${stringify(data, { lineWidth: 0 }).trim()}\n---\n\n${item.body.trim()}\n`;
}

function safeReportStem(file: string) {
  return path.basename(file, path.extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'content-export';
}

async function exists(file: string) {
  try {
    await fs.access(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function relativeUnix(root: string, file: string) {
  return path.relative(root, file).split(path.sep).join('/');
}

export async function planImport(options: ImportOptions): Promise<ImportPlan> {
  const root = path.resolve(options.root);
  const inputFile = path.resolve(options.inputFile);
  const source = await fs.readFile(inputFile, 'utf8');
  const sourceSha256 = sha256(source);
  const format = options.format ?? detectFormat(inputFile, source);
  const category = options.category ?? 'notes';
  if (!categories.has(category)) throw new Error(`Unsupported category ${category}. Use one of: ${[...categories].join(', ')}`);
  const parsed = parseExport(format, source);
  const slugs = allocateSlugs(parsed.content);
  const writes: PlannedWrite[] = [];
  const entries: MigrationEntry[] = [];

  for (const item of [...parsed.content].sort((left, right) => sourceKey(left).localeCompare(sourceKey(right), 'en'))) {
    const slug = slugs.get(sourceKey(item))!;
    const destination = path.join(root, 'src/content/posts', `${slug}.mdx`);
    const destinationRelative = relativeUnix(root, destination);
    const destinationExists = await exists(destination);
    const action: MigrationEntry['action'] = destinationExists ? (options.overwrite ? 'overwrite' : 'blocked') : 'create';
    const oldRoute = legacyPath(item.legacyUrl);
    const newRoute = normalizeRoute(`/writing/${slug}`);
    const redirect = oldRoute && oldRoute !== newRoute ? { from: oldRoute, to: newRoute } : undefined;
    const warnings = [...item.warnings];
    if (!item.publishedAt) warnings.push('No valid publication date was present; 1970-01-01 was used and the item remains a draft.');
    if (item.authors.length > 1) warnings.push(`Only the primary author (${item.authors[0]}) is stored in frontmatter; all authors remain in this report.`);
    if (destinationExists && !options.overwrite) warnings.push('Destination exists; rerun the dry-run with --overwrite before confirming replacement.');
    entries.push({
      sourceId: item.sourceId, sourceType: item.sourceType, title: item.title, slug,
      destination: destinationRelative, action,
      draft: item.draft || !item.publishedAt,
      authors: item.authors, tags: item.tags, categories: item.categories,
      sourceMetadata: item.metadata,
      ...(item.legacyUrl ? { legacyUrl: item.legacyUrl } : {}),
      ...(redirect ? { redirect } : {}), media: item.media, warnings,
    });
    if (action !== 'blocked') writes.push({ destination, content: renderMdx(item, slug, category, oldRoute), exists: destinationExists });
  }

  const reportBase: Omit<MigrationReport, 'mode'> = {
    schemaVersion: 1,
    source: parsed.source,
    sourceFile: path.basename(inputFile),
    sourceSha256,
    ...(parsed.sourceVersion ? { sourceVersion: parsed.sourceVersion } : {}),
    ...(parsed.siteUrl ? { siteUrl: parsed.siteUrl } : {}),
    category,
    counts: {
      discovered: parsed.content.length + parsed.skipped.length,
      planned: entries.length,
      drafts: entries.filter((entry) => entry.draft).length,
      skipped: parsed.skipped.length,
      mediaReferences: parsed.mediaInventory.length,
      redirects: entries.filter((entry) => entry.redirect).length,
      blocked: entries.filter((entry) => entry.action === 'blocked').length,
    },
    entries,
    mediaInventory: parsed.mediaInventory,
    skipped: parsed.skipped,
    warnings: parsed.warnings,
  };
  const confirmationPayload = JSON.stringify({
    sourceSha256,
    category,
    overwrite: Boolean(options.overwrite),
    writes: writes.map((write) => ({ destination: relativeUnix(root, write.destination), contentSha256: sha256(write.content) })),
    entries,
  });
  const confirmationHash = sha256(confirmationPayload);
  const reportPath = path.join(root, 'migration-reports', `${safeReportStem(inputFile)}-${sourceSha256.slice(0, 12)}.json`);
  return {
    confirmationHash,
    reportPath,
    report: { ...reportBase, mode: options.apply ? 'apply' : 'dry-run' },
    writes,
  };
}

async function atomicWrite(file: string, content: string, overwrite: boolean) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, content, { flag: 'wx' });
  try {
    if (overwrite) await fs.rename(temporary, file);
    else {
      await fs.link(temporary, file);
      await fs.rm(temporary);
    }
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

export async function executeImport(options: ImportOptions) {
  const plan = await planImport(options);
  if (!options.apply) return plan;
  if (!options.confirm || options.confirm !== plan.confirmationHash) {
    throw new Error(`Apply requires --confirm ${plan.confirmationHash} from an identical dry-run.`);
  }
  if (plan.report.counts.blocked > 0) throw new Error('Import is blocked by existing destinations. Review the report or rerun with --overwrite.');
  for (const write of plan.writes) {
    if (!options.overwrite && await exists(write.destination)) throw new Error(`Refusing to overwrite ${relativeUnix(options.root, write.destination)}`);
  }
  if (!options.overwrite && await exists(plan.reportPath)) throw new Error(`Refusing to overwrite ${relativeUnix(options.root, plan.reportPath)}`);
  for (const write of plan.writes) {
    await atomicWrite(write.destination, write.content, Boolean(options.overwrite));
  }
  await atomicWrite(plan.reportPath, `${JSON.stringify(plan.report, null, 2)}\n`, Boolean(options.overwrite));
  return plan;
}

function usage() {
  return `Usage: pnpm exec tsx scripts/import-content.ts <export.json|export.xml> [options]\n\nOptions:\n  --format ghost|wordpress  Override format detection\n  --category <slug>          Repository category (default: notes)\n  --apply                    Write planned MDX and migration report\n  --confirm <sha256>         Confirm the exact dry-run plan\n  --overwrite                Plan replacement of existing destination files\n  --root <path>              Repository root (default: current directory)\n\nDry-run is the default. Media is referenced, not downloaded. Redirect and image work is recorded in the migration report.\n`;
}

function readArguments(argv: string[]) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true } as const;
  const valueFlags = new Set(['--format', '--category', '--confirm', '--root']);
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (valueFlags.has(argv[index])) {
      index += 1;
      continue;
    }
    if (!argv[index].startsWith('-')) positional.push(argv[index]);
  }
  const inputFile = positional[0];
  if (!inputFile) throw new Error(usage());
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const formatValue = value('--format');
  if (formatValue && formatValue !== 'ghost' && formatValue !== 'wordpress') throw new Error('--format must be ghost or wordpress');
  const format = formatValue as ImportFormat | undefined;
  return {
    help: false as const,
    options: {
      root: value('--root') ?? process.cwd(),
      inputFile,
      ...(format ? { format } : {}),
      ...(value('--category') ? { category: value('--category') } : {}),
      apply: argv.includes('--apply'),
      overwrite: argv.includes('--overwrite'),
      confirm: value('--confirm'),
    } satisfies ImportOptions,
  };
}

async function main() {
  const parsed = readArguments(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(usage());
    return;
  }
  const plan = await executeImport(parsed.options);
  process.stdout.write(`${JSON.stringify({
    mode: plan.report.mode,
    confirmationHash: plan.confirmationHash,
    reportPath: relativeUnix(parsed.options.root, plan.reportPath),
    report: plan.report,
  }, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}
