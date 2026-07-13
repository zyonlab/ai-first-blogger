import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { parse } from 'yaml';
import { factLedgerSchema } from './schemas';

export type FreshnessItem = {
  type: 'article' | 'claim';
  id: string;
  file: string;
  reviewAfter: string;
  daysOverdue: number;
};

export type ScheduledContentItem = {
  file: string;
  slug: string;
  pubDate: string;
};

async function walk(directory: string, pattern: RegExp): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return walk(target, pattern);
      return entry.isFile() && pattern.test(entry.name) ? [target] : [];
    }));
    return nested.flat().sort();
  } catch {
    return [];
  }
}

function overdueDays(reviewAfter: Date, now: Date) {
  return Math.max(0, Math.floor((now.valueOf() - reviewAfter.valueOf()) / 86_400_000));
}

export async function collectFreshness(root: string, now = new Date()) {
  const stale: FreshnessItem[] = [];
  const contentFiles = await walk(path.join(root, 'src/content'), /\.mdx?$/);

  for (const file of contentFiles) {
    const document = matter(await fs.readFile(file, 'utf8'));
    if (!document.data.reviewAfter) continue;
    const reviewAfter = new Date(document.data.reviewAfter);
    if (Number.isNaN(reviewAfter.valueOf()) || reviewAfter.valueOf() > now.valueOf()) continue;
    stale.push({
      type: 'article',
      id: document.data.slug ?? path.basename(file, path.extname(file)),
      file: path.relative(root, file),
      reviewAfter: reviewAfter.toISOString(),
      daysOverdue: overdueDays(reviewAfter, now),
    });
  }

  const ledgerFiles = await walk(path.join(root, 'content-work/facts'), /\.ya?ml$/);
  for (const file of ledgerFiles) {
    const ledger = factLedgerSchema.parse(parse(await fs.readFile(file, 'utf8')));
    for (const claim of ledger.claims) {
      if (!claim.reviewAfter) continue;
      const reviewAfter = new Date(claim.reviewAfter);
      if (reviewAfter.valueOf() > now.valueOf()) continue;
      stale.push({
        type: 'claim',
        id: claim.id,
        file: path.relative(root, file),
        reviewAfter: reviewAfter.toISOString(),
        daysOverdue: overdueDays(reviewAfter, now),
      });
    }
  }

  return stale.sort((left, right) => right.daysOverdue - left.daysOverdue || left.file.localeCompare(right.file));
}

export async function findDueContent(root: string, now = new Date(), windowMinutes = 70) {
  const due: ScheduledContentItem[] = [];
  const windowStart = now.valueOf() - windowMinutes * 60_000;
  const contentFiles = await walk(path.join(root, 'src/content'), /\.mdx?$/);
  for (const file of contentFiles) {
    const document = matter(await fs.readFile(file, 'utf8'));
    if (document.data.draft === true || !document.data.pubDate) continue;
    const pubDate = new Date(document.data.pubDate);
    if (pubDate.valueOf() <= windowStart || pubDate.valueOf() > now.valueOf()) continue;
    due.push({
      file: path.relative(root, file),
      slug: document.data.slug ?? path.basename(file, path.extname(file)),
      pubDate: pubDate.toISOString(),
    });
  }
  return due.sort((left, right) => left.pubDate.localeCompare(right.pubDate));
}

export function checkSubstantiveUpdatedDateChange(beforeSource: string, afterSource: string, file: string) {
  const before = matter(beforeSource);
  const after = matter(afterSource);
  const beforeDate = before.data.updatedDate ? new Date(before.data.updatedDate).toISOString() : undefined;
  const afterDate = after.data.updatedDate ? new Date(after.data.updatedDate).toISOString() : undefined;
  if (beforeDate === afterDate) return undefined;
  if (before.content.trim() !== after.content.trim()) return undefined;
  return {
    file,
    message: 'updatedDate changed without a substantive body change',
  };
}
