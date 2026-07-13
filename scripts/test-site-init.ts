import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { initializeSite, renderSiteFiles, siteIntakeSchema } from './site-init';

const fixturePath = path.join(process.cwd(), 'scripts/fixtures/site-intake.json');
const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8')) as unknown;
const intake = siteIntakeSchema.parse(fixture);
const rendered = renderSiteFiles(intake);

assert.match(rendered['src/data/site.ts'], /Field Notes/);
assert.doesNotMatch(rendered['src/data/site.ts'], /Template Owner/);
const plan = parse(rendered['content-plans/site-plan.yaml']);
assert.equal(plan.site.brand_name, 'Field Notes');
assert.equal(plan.brand_inputs.missing.length, 0);
assert.equal(plan.content_pillars[0].id, 'software-architecture');
assert.equal(plan['90_day_plan'].month_1.theme, 'Foundations');

const secretInput = structuredClone(fixture) as Record<string, unknown>;
secretInput.apiToken = 'must-not-be-accepted';
assert.equal(siteIntakeSchema.safeParse(secretInput).success, false);

const incompleteInput = structuredClone(fixture) as { strategy: { purpose?: string } };
delete incompleteInput.strategy.purpose;
assert.equal(siteIntakeSchema.safeParse(incompleteInput).success, false);

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'afb-site-init-'));
await fs.mkdir(path.join(root, 'src/data'), { recursive: true });
await fs.mkdir(path.join(root, 'content-plans'), { recursive: true });
await fs.writeFile(path.join(root, 'src/data/site.ts'), 'const owner = "Template Owner";\n');
await fs.writeFile(path.join(root, 'content-plans/site-plan.yaml'), 'site:\n  brand_name: Template Owner\n');

const preview = await initializeSite({ root, intake, dryRun: true, confirmOverwrite: false });
assert.equal(preview.mode, 'dry-run');
assert.deepEqual(preview.changes.map((change) => change.status), ['overwrite', 'overwrite']);
assert.ok(preview.changes.every((change) => change.currentSha256 !== change.generatedSha256));
assert.match(preview.changes[0].generatedContent, /Field Notes/);
assert.match(await fs.readFile(path.join(root, 'src/data/site.ts'), 'utf8'), /Template Owner/);

await assert.rejects(
  initializeSite({ root, intake, dryRun: false, confirmOverwrite: false }),
  /Refusing to overwrite existing configuration/,
);

const written = await initializeSite({ root, intake, dryRun: false, confirmOverwrite: true });
assert.equal(written.mode, 'write');
assert.doesNotMatch(await fs.readFile(path.join(root, 'src/data/site.ts'), 'utf8'), /Template Owner/);
assert.doesNotMatch(await fs.readFile(path.join(root, 'content-plans/site-plan.yaml'), 'utf8'), /Template Owner/);

const repeated = await initializeSite({ root, intake, dryRun: false, confirmOverwrite: false });
assert.deepEqual(repeated.changes.map((change) => change.status), ['unchanged', 'unchanged']);

await fs.rm(root, { recursive: true, force: true });
console.log('Site initializer tests passed.');
