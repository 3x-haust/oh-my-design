import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { publishFirstRenderCheck, checkFirstRenderEvidence } from '../core/design/first-render-evidence.ts';
import { publishDesignJudgment } from '../core/design/judgment-files.ts';
import { loadMeasurement } from '../core/measure/files.ts';
import { measurementFixture } from './helpers/visual-measurement.ts';

test('native first-render facts derive from immutable measurements; invented surfaces refuse without mutation', async t => {
  const { root, writer, invocation, html } = measurementFixture('clean');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const judgment = { schema: 'design-judgment-v1', referenceBoardSha256: 'a'.repeat(64),
    hypothesis: { schema: 'design-judgment-v1', feelsLike: 'A focused application review desk', dominantObject: 'application documents', subordinate: ['navigation'], densityIntent: 'task and evidence', comparisonRequired: true, trustSource: 'source status', twoSecondRead: 'Review the required application documents beside their source evidence' },
    judgments: [{ id: 'documents', observation: 'The task region contains a document list.', whyItWorksThere: 'The task checks real documents.', relevance: 'high', adopt: ['One work object'], reject: ['Source branding'], interpretation: 'Keep application review dominant.', scope: 'surface' }] };
  publishDesignJudgment(root, judgment, writer);
  assert.throws(() => checkFirstRenderEvidence(root), /report is missing/);
  await assert.rejects(() => publishFirstRenderCheck(root, 'dist/index.html', { dominantAreaShare: 0.8 }, writer, invocation), /agent-authored surfaces/);
  assert.equal(existsSync(join(root, '.omd/first-render-critic.json')), false);
  assert.equal(existsSync(join(root, '.omd/visual-measurement.json')), false);
  const result = await publishFirstRenderCheck(root, 'dist/index.html', undefined, writer, invocation);
  assert.equal(result.schema, 'first-render-check-v3'); assert.equal(result.report.verdict, 'retain');
  assert.ok(result.report.findings.some(f => f.severity === 'advisory'));
  assert.ok(result.report.findings.every(f => f.measurementRefs.length > 0));
  assert.ok(result.report.projection.every(v => v.utilityAreaShare !== null && v.taskAreaShare !== null && v.utilityAreaShare !== 1 - v.taskAreaShare));
  assert.ok(checkFirstRenderEvidence(root));
  const pointer = readFileSync(join(root, '.omd/first-render-critic.json'));
  writer.write('.omd/first-render-critic.json', JSON.stringify({ ...result, report: { ...result.report, verdict: 'revise' } }));
  assert.throws(() => checkFirstRenderEvidence(root), /invalid report/); writer.write('.omd/first-render-critic.json', pointer);
  writeFileSync(join(root, 'src/index.html'), `${html}\n<!-- changed -->`);
  assert.throws(() => checkFirstRenderEvidence(root), /source changed/); writeFileSync(join(root, 'src/index.html'), html);
  const packet = loadMeasurement(root, result.measurements[0]!);
  writer.write(packet.captures[0]!.capture.path, 'changed pixels'); assert.throws(() => checkFirstRenderEvidence(root), /capture\/IR changed/);
  assert.deepEqual(readFileSync(join(root, 'src/index.html')), html);
});
