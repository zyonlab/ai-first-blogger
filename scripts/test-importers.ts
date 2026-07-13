import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeImport, planImport } from './import-content';
import { parseGhostExport } from './importers/ghost';
import { parseWordPressExport } from './importers/wordpress';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ghostFixture = path.join(repositoryRoot, 'scripts/fixtures/ghost-export.json');
const wordpressFixture = path.join(repositoryRoot, 'scripts/fixtures/wordpress-export.xml');

const ghost = parseGhostExport(await fs.readFile(ghostFixture, 'utf8'));
assert.equal(ghost.sourceVersion, '6.0.0');
assert.equal(ghost.content.length, 2);
assert.deepEqual(ghost.content[0].authors, ['Example Author', 'Second Author']);
assert.deepEqual(ghost.content[0].tags, ['Migration', 'Ghost']);
assert.equal(ghost.content[0].media.length, 2);
assert.equal(ghost.mediaInventory.length, 2);
assert.match(ghost.content[1].body, /## Private guide/);
assert.equal(ghost.content[1].draft, true, 'member-only content must remain draft');

const wordpress = parseWordPressExport(await fs.readFile(wordpressFixture, 'utf8'));
assert.equal(wordpress.sourceVersion, '1.2');
assert.equal(wordpress.content.length, 1);
assert.equal(wordpress.skipped.length, 1);
assert.deepEqual(wordpress.content[0].categories, ['Engineering']);
assert.deepEqual(wordpress.content[0].tags, ['Migration', 'Engineering']);
assert.equal(wordpress.content[0].media.length, 2);
assert.equal(wordpress.mediaInventory.length, 3);
assert.match(wordpress.content[0].body, /## Prepare the export/);

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-first-blogger-import-'));
await fs.mkdir(path.join(root, 'src/content/posts'), { recursive: true });
const dryRun = await planImport({ root, inputFile: ghostFixture, category: 'notes' });
const repeatedDryRun = await planImport({ root, inputFile: ghostFixture, category: 'notes' });
assert.equal(dryRun.confirmationHash, repeatedDryRun.confirmationHash, 'identical inputs must create an identical plan hash');
assert.equal(dryRun.report.mode, 'dry-run');
assert.equal(dryRun.report.counts.planned, 2);
assert.equal(dryRun.report.counts.redirects, 2);
await assert.rejects(
  executeImport({ root, inputFile: ghostFixture, category: 'notes', apply: true, confirm: 'wrong' }),
  /Apply requires --confirm/,
);
const applied = await executeImport({
  root, inputFile: ghostFixture, category: 'notes', apply: true, confirm: dryRun.confirmationHash,
});
assert.equal(applied.report.mode, 'apply');
const imported = await fs.readFile(path.join(root, 'src/content/posts/ghost-migration.mdx'), 'utf8');
assert.match(imported, /legacySlug: \/ghost-migration\//);
assert.match(imported, /author: Example Author/);
assert.ok(await fs.readFile(applied.reportPath, 'utf8'));

const blocked = await planImport({ root, inputFile: ghostFixture, category: 'notes' });
assert.equal(blocked.report.counts.blocked, 2);
await assert.rejects(
  executeImport({ root, inputFile: ghostFixture, category: 'notes', apply: true, confirm: blocked.confirmationHash }),
  /blocked by existing destinations/,
);

const overwriteRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-first-blogger-import-overwrite-'));
await fs.mkdir(path.join(overwriteRoot, 'src/content/posts'), { recursive: true });
await fs.writeFile(path.join(overwriteRoot, 'src/content/posts/wordpress-migration.mdx'), 'old');
const overwritePlan = await planImport({ root: overwriteRoot, inputFile: wordpressFixture, overwrite: true });
assert.equal(overwritePlan.report.entries[0].action, 'overwrite');
await executeImport({
  root: overwriteRoot,
  inputFile: wordpressFixture,
  overwrite: true,
  apply: true,
  confirm: overwritePlan.confirmationHash,
});
assert.match(await fs.readFile(path.join(overwriteRoot, 'src/content/posts/wordpress-migration.mdx'), 'utf8'), /WordPress Migration Guide/);

const collisionRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-first-blogger-import-collision-'));
await fs.mkdir(path.join(collisionRoot, 'src/content/posts'), { recursive: true });
const collisionExport = JSON.parse(await fs.readFile(ghostFixture, 'utf8'));
collisionExport.db[0].data.posts[1].slug = 'ghost-migration';
const collisionFile = path.join(collisionRoot, 'collision.json');
await fs.writeFile(collisionFile, JSON.stringify(collisionExport));
const collisionPlan = await planImport({ root: collisionRoot, inputFile: collisionFile });
assert.deepEqual(collisionPlan.report.entries.map((entry) => entry.slug), ['ghost-migration', 'ghost-migration-2']);

await fs.rm(root, { recursive: true, force: true });
await fs.rm(overwriteRoot, { recursive: true, force: true });
await fs.rm(collisionRoot, { recursive: true, force: true });
process.stdout.write('Importer tests passed.\n');
