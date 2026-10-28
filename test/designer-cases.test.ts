import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PNG } from 'pngjs';
import { designerCaseCatalog, designerCaseIndexMessage, loadDesignerCase } from '../core/cases/index.ts';
import { consultedDesignerCases, recordDesignerCaseConsultation } from '../core/design/designer-cases.ts';
import { designerCaseToolContext } from '../extensions/omd-designer-cases.ts';
import { createTestNativePiInvocation } from '../core/runtime/native-pi-run.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { usePrivateDesignerCaseFixture } from './helpers/designer-cases.ts';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const ROOT = fileURLToPath(new URL('..', import.meta.url));

function project(t: test.TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-designer-case-project-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const nodePath = realpathSync(process.execPath);
  const invocation = createTestNativePiInvocation({ root, host: {
    nodePath, nodeSha256: hash(readFileSync(nodePath)), cliPath: nodePath, cliSha256: hash(readFileSync(nodePath)),
    provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'medium', parentSessionId: 'cases-parent',
  } });
  return { root, writer: createTestProjectWriteAdapter(root, invocation) };
}

test('installed private cases form a catalog and open with digest-verified whole frames', t => {
  const fixture = usePrivateDesignerCaseFixture(t);
  const catalog = designerCaseCatalog();
  assert.deepEqual(catalog.cases.map(item => item.id), ['fixture-comparison', 'fixture-hierarchy']);
  assert.ok(catalog.cases.every(item => item.open === `omd pack cases/${item.id}`));
  const opened = loadDesignerCase('fixture-hierarchy');
  assert.equal(opened.case.id, 'fixture-hierarchy');
  assert.equal(opened.renders.length, 2);
  assert.ok(opened.renders.every(render => render.role === 'designer-source-frame' && render.pngBase64.length > 0));
  assert.match(designerCaseIndexMessage(), /fixture-hierarchy/);
  assert.throws(() => loadDesignerCase('missing-case'), /unknown case/);
  assert.throws(() => loadDesignerCase('../escape'), /case id/);
  assert.equal(existsSync(join(fixture, 'fixture-hierarchy.json')), true);
});

test('an install without private originals has an empty catalog and advertises nothing', t => {
  const empty = mkdtempSync(join(tmpdir(), 'omd-no-cases-'));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  const prior = process.env.OMD_DESIGNER_CASES_DIR;
  process.env.OMD_DESIGNER_CASES_DIR = empty;
  t.after(() => { if (prior === undefined) delete process.env.OMD_DESIGNER_CASES_DIR; else process.env.OMD_DESIGNER_CASES_DIR = prior; });
  assert.deepEqual(designerCaseCatalog().cases, []);
});

test('a consultation records identities only and re-reads frames from the private root', t => {
  const fixture = usePrivateDesignerCaseFixture(t);
  const { root, writer } = project(t);
  const request = hash('a request');
  recordDesignerCaseConsultation(root, request, 'fixture-hierarchy', writer);
  recordDesignerCaseConsultation(root, request, 'fixture-comparison', writer);
  const consulted = consultedDesignerCases(root, request);
  assert.ok(consulted);
  assert.deepEqual(consulted.context.cases.map(item => item.id), ['fixture-comparison', 'fixture-hierarchy']);
  assert.equal(consulted.renders.length, 4);
  assert.equal(consultedDesignerCases(root, hash('another request')), null);
  // `.omd/` is committed with the project: no frame bytes and no copied images directory.
  const records = join(root, '.omd/designer-cases/records');
  for (const name of readdirSync(records)) assert.equal(readFileSync(join(records, name), 'utf8').includes('pngBase64'), false);
  assert.equal(existsSync(join(root, '.omd/designer-cases/images')), false);
  // A changed source frame is refused rather than silently re-bound.
  const framePath = loadDesignerCase('fixture-hierarchy').renders[0]?.path;
  assert.ok(framePath);
  writeFileSync(join(fixture, framePath), PNG.sync.write(new PNG({ width: 2, height: 2 })));
  assert.throws(() => consultedDesignerCases(root, request), /image digest/);
});

test('Git tracks no private caption records or frames under core/cases', () => {
  const tracked = execFileSync('git', ['ls-files', 'core/cases'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.ok(tracked.every(path => !path.endsWith('.json') && !path.startsWith('core/cases/media/')), tracked.join(', '));
});

test('the Pi extension advertises cases after routing only when originals exist and opens whole frames', t => {
  const runtime = mkdtempSync(join(tmpdir(), 'omd-case-runtime-'));
  t.after(() => rmSync(runtime, { recursive: true, force: true }));
  mkdirSync(join(runtime, 'core/cases'), { recursive: true });
  const route = JSON.stringify({ schema: 'adaptive-design-route-v1' });
  const prior = process.env.OMD_DESIGNER_CASES_DIR;
  delete process.env.OMD_DESIGNER_CASES_DIR;
  t.after(() => { if (prior !== undefined) process.env.OMD_DESIGNER_CASES_DIR = prior; });
  // The packaged case directory holds only code: a public install advertises nothing.
  assert.deepEqual(designerCaseToolContext(runtime, ['route', 'classify'], route), []);
  usePrivateDesignerCaseFixture(t);
  const advertised = designerCaseToolContext(runtime, ['route', 'classify'], route);
  assert.equal(advertised.length, 1);
  assert.match(advertised[0]?.type === 'text' ? advertised[0].text : '', /fixture-comparison/);
  assert.deepEqual(designerCaseToolContext(runtime, ['route', 'classify'], 'not json'), []);
  const opened = loadDesignerCase('fixture-hierarchy');
  const parts = designerCaseToolContext(runtime, ['pack', 'cases/fixture-hierarchy'], JSON.stringify(opened.case));
  assert.deepEqual(parts.map(part => part.type), ['text', 'image', 'text', 'image']);
  assert.equal(parts.some(part => part.type === 'text' && part.text.includes('media/')), false);
  assert.throws(() => designerCaseToolContext(runtime, ['pack', 'cases/fixture-hierarchy'],
    JSON.stringify({ ...opened.case, title: 'changed' })), /case output drift/);
});
