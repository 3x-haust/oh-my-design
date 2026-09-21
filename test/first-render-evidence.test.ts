import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { publishFirstRenderCheck, checkFirstRenderEvidence } from '../core/design/first-render-evidence.ts';
import { publishDesignJudgment } from '../core/design/judgment-files.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

test('native first render binds report, current hypothesis, source, build and capture, without blocking advisories', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-first-render-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const writer = createTestProjectWriteAdapter(root);
  mkdirSync(join(root, 'dist')); mkdirSync(join(root, 'src'));
  const html = '<!doctype html><html><body><main><h1>Edit the current project source</h1><textarea aria-label="Code editor">' + 'Example code document. '.repeat(20) + '</textarea><p>Saved locally</p></main></body></html>';
  writeFileSync(join(root, 'dist/index.html'), html);
  writeFileSync(join(root, 'src/app.ts'), 'export const version = 1;');
  const judgment = { schema: 'design-judgment-v1', referenceBoardSha256: 'a'.repeat(64),
    hypothesis: { schema: 'design-judgment-v1', feelsLike: 'A focused document editing desk', dominantObject: 'code editor', subordinate: ['navigation'], densityIntent: 'single document', comparisonRequired: false, trustSource: 'saved status', twoSecondRead: 'Edit the current project source' },
    judgments: [{ id: 'editor', observation: 'One central editing region occupies most of the viewport.', whyItWorksThere: 'The task acts on one document.', relevance: 'high', adopt: ['Single work object'], reject: ['Source branding'], interpretation: 'Keep local editing dominant.', scope: 'surface' }] };
  publishDesignJudgment(root, judgment, writer);
  assert.throws(() => checkFirstRenderEvidence(root), /report is missing/);
  writer.write('.omd/first-render-critic.json', JSON.stringify({ verdict: 'retain', reportSha256: '0'.repeat(64) }));
  assert.throws(() => checkFirstRenderEvidence(root), /schema or digest/);
  const result = await publishFirstRenderCheck(root, 'dist/index.html', { heading: 'Edit the current project source', landmarks: ['main editor'], repeatedObjects: ['code editor'], trustSignals: [], visibleText: ['Edit the current project source'], dominantAreaShare: 0.8 }, writer);
  assert.equal(result.report.verdict, 'retain');
  assert.equal(checkFirstRenderEvidence(root)?.report.findings[0].severity, 'advisory');
  const pointer = readFileSync(join(root, '.omd/first-render-critic.json'));
  writer.write('.omd/first-render-critic.json', JSON.stringify({ ...result, report: { ...result.report, verdict: 'revise' } }));
  assert.throws(() => checkFirstRenderEvidence(root), /digest/);
  writer.write('.omd/first-render-critic.json', pointer);
  publishDesignJudgment(root, { ...judgment, hypothesis: { ...judgment.hypothesis, twoSecondRead: 'Review the current document history' } }, writer);
  assert.throws(() => checkFirstRenderEvidence(root), /hypothesis/);
  publishDesignJudgment(root, judgment, writer);
  writeFileSync(join(root, 'src/app.ts'), 'export const version = 2;');
  assert.throws(() => checkFirstRenderEvidence(root), /source\/build changed/);
  writeFileSync(join(root, 'src/app.ts'), 'export const version = 1;');
  writeFileSync(join(root, 'dist/index.html'), `${html}<!-- new build -->`);
  assert.throws(() => checkFirstRenderEvidence(root), /source\/build changed/);
  writeFileSync(join(root, 'dist/index.html'), html);
  assert.ok(checkFirstRenderEvidence(root));
  writer.write(result.capture.path, 'changed pixels');
  assert.throws(() => checkFirstRenderEvidence(root), /capture bytes changed/);
  await assert.rejects(() => publishFirstRenderCheck(root, '../outside.html', {}, writer), /contained local HTML/);
});
