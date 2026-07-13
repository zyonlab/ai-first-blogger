import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stringify } from 'yaml';
import { artifactSchemaVersion } from '../src/content-workflow/schemas';
import { collectFreshness, checkSubstantiveUpdatedDateChange, findDueContent } from '../src/content-workflow/freshness';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'afb-freshness-'));
await fs.mkdir(path.join(root, 'src/content/posts'), { recursive: true });
await fs.mkdir(path.join(root, 'content-work/facts'), { recursive: true });
await fs.writeFile(path.join(root, 'src/content/posts/stale.mdx'), `---
title: Stale
slug: stale
pubDate: 2026-07-11T00:30:00.000Z
reviewAfter: 2026-01-01T00:00:00.000Z
---
Body
`);
await fs.writeFile(path.join(root, 'content-work/facts/stale.yaml'), stringify({
  schemaVersion: artifactSchemaVersion,
  id: 'stale-ledger',
  title: 'Stale ledger',
  owner: 'test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  kind: 'fact-ledger',
  status: 'draft',
  articleBriefId: 'stale-brief',
  claims: [{
    id: 'stale-claim',
    claim: 'A changing fact',
    claimType: 'time-sensitive',
    impact: 'low',
    verificationStatus: 'unverified',
    sources: [{ title: 'Official docs', url: 'https://example.org/docs', sourceType: 'primary', accessedAt: '2026-01-01T00:00:00.000Z' }],
    reviewAfter: '2026-02-01T00:00:00.000Z',
    verificationNote: 'Needs review',
  }],
}));

const stale = await collectFreshness(root, new Date('2026-07-11T00:00:00.000Z'));
assert.deepEqual(stale.map((item) => item.type).sort(), ['article', 'claim']);
assert.ok(stale.every((item) => item.daysOverdue > 0));

const due = await findDueContent(root, new Date('2026-07-11T01:00:00.000Z'), 70);
assert.equal(due.length, 1);
assert.equal(due[0].slug, 'stale');
const expiredWindow = await findDueContent(root, new Date('2026-07-11T03:00:00.000Z'), 70);
assert.equal(expiredWindow.length, 0);

const unchangedBody = checkSubstantiveUpdatedDateChange(`---
updatedDate: 2026-01-01
---
Same body
`, `---
updatedDate: 2026-02-01
---
Same body
`, 'example.mdx');
assert.ok(unchangedBody);

const changedBody = checkSubstantiveUpdatedDateChange(`---
updatedDate: 2026-01-01
---
Old body
`, `---
updatedDate: 2026-02-01
---
New body
`, 'example.mdx');
assert.equal(changedBody, undefined);

await fs.rm(root, { recursive: true, force: true });
console.log('Content freshness tests passed.');
