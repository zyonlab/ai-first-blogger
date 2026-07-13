import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectStructuredData, validateRichResultArtifact, writeInspectionArtifact } from './lib/rich-results';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'afb-rich-results-'));
const dist = path.join(root, 'dist');
await fs.mkdir(path.join(dist, 'writing/example'), { recursive: true });
await fs.mkdir(path.join(dist, 'videos/example'), { recursive: true });
await fs.mkdir(path.join(dist, 'about'), { recursive: true });

const script = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const breadcrumbs = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.com/' },
    { '@type': 'ListItem', position: 2, name: 'Example', item: 'https://example.com/example/' },
  ],
};
await fs.writeFile(path.join(dist, 'writing/example/index.html'), script([{
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Example article',
  image: ['https://example.com/article.png'],
  datePublished: '2026-01-01T00:00:00Z',
  dateModified: '2026-01-02T00:00:00Z',
  author: { '@type': 'Person', name: 'Author', url: 'https://example.com/about/' },
}, breadcrumbs]));
await fs.writeFile(path.join(dist, 'videos/example/index.html'), script({
  '@context': 'https://schema.org',
  '@type': 'VideoObject',
  name: 'Example video',
  description: 'A useful video.',
  thumbnailUrl: ['https://example.com/video.jpg'],
  uploadDate: '2026-01-01T00:00:00Z',
  embedUrl: 'https://www.youtube-nocookie.com/embed/example',
}));
await fs.writeFile(path.join(dist, 'about/index.html'), script({
  '@context': 'https://schema.org',
  '@type': 'ProfilePage',
  mainEntity: { '@type': 'Person', name: 'Author' },
}));

const inspection = await inspectStructuredData(dist);
assert.deepEqual(inspection.errors, []);
assert.equal(inspection.records.length, 4);
assert.ok(inspection.records.every((record) => record.localValidation.status === 'pass'));
assert.ok(inspection.records.every((record) => record.eligibilityAssessment === 'requires-google-validation'));

const artifactFile = path.join(root, 'record.yaml');
const artifact = await writeInspectionArtifact(artifactFile, inspection, 'release-fixture', 'abc123');
assert.deepEqual(validateRichResultArtifact(artifact), []);

const falseGuarantee = structuredClone(artifact);
falseGuarantee.policy.rankingGuaranteed = true;
assert.ok(validateRichResultArtifact(falseGuarantee).some((error) => error.includes('rankingGuaranteed')));

const approvedWithoutEvidence = structuredClone(artifact);
approvedWithoutEvidence.releaseDecision.status = 'approved';
assert.ok(validateRichResultArtifact(approvedWithoutEvidence).some((error) => error.includes('Rich Results Test evidence')));

await fs.writeFile(path.join(dist, 'videos/example/index.html'), script({ '@type': 'VideoObject', name: 'Incomplete' }));
const invalid = await inspectStructuredData(dist);
assert.ok(invalid.errors.some((error) => error.includes('thumbnailUrl')));
assert.ok(invalid.errors.some((error) => error.includes('uploadDate')));

await fs.mkdir(path.join(dist, 'videos/broken'), { recursive: true });
await fs.writeFile(path.join(dist, 'videos/broken/index.html'), '<script type="application/ld+json">{broken}</script>');
const invalidJson = await inspectStructuredData(dist);
assert.ok(invalidJson.errors.some((error) => error.includes('Invalid JSON-LD')));

await fs.rm(root, { recursive: true, force: true });
console.log('Rich result release tests passed.');
