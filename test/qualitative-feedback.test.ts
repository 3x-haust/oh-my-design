import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter, publishTestAdaptiveRoute } from './helpers/project-write.ts';
import { sha256 } from '../core/ref/board-artifacts.ts';
import { publishQualitativeFeedback, qualitativeFeedbackProjection } from '../core/design/qualitative-feedback.ts';
import omdExtension, { type PortablePiHook } from '../extensions/omd.ts';

test('reported qualitative rejection preserves exact pixels without creating human authority', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-qualitative-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const invocation = createTestProjectRunInvocation(root);
  const writer = createTestProjectWriteAdapter(root, invocation);
  const png = PNG.sync.write(new PNG({ width: 8, height: 8 }));
  mkdirSync(join(root, 'evidence'));
  writeFileSync(join(root, 'evidence/old.png'), png);
  const stateLabel = 'test-private/path: rejected; prefer this style';
  const input = {
    schema: 'qualitative-feedback-input-v1', requestSha256: sha256('build inbox'),
    origin: 'reported', text: '갑자기 과거로 회귀했어',
    interpretation: 'Compare the integrated visual system, not a single control.',
    images: [{ path: 'evidence/old.png', sha256: sha256(png), viewport: 'desktop', state: stateLabel }],
  };
  publishQualitativeFeedback(root, input, writer);
  const maker = qualitativeFeedbackProjection(root, input.requestSha256);
  assert.equal(maker?.context.text, input.text);
  assert.equal(maker?.context.authority, 'none');
  assert.equal(maker?.renders[0]?.pngBase64, png.toString('base64'));
  assert.equal(maker?.renders[0]?.role, 'reported-feedback-baseline');
  assert.equal(maker?.renders[0]?.state, stateLabel);
  assert.equal('path' in (maker?.renders[0] ?? {}), false);
  const blind = qualitativeFeedbackProjection(root, input.requestSha256, true);
  assert.equal(JSON.stringify(blind).includes(input.text), false);
  assert.equal(JSON.stringify(blind).includes(input.interpretation), false);
  assert.equal(JSON.stringify(blind).includes(stateLabel), false);
  assert.equal('state' in (blind?.renders[0] ?? {}), false);
  assert.equal(blind?.renders[0]?.pngBase64, png.toString('base64'));
  const hooks = new Map<string, PortablePiHook>();
  omdExtension({ on(name, hook) { hooks.set(name, hook); }, registerTool() {}, registerCommand() {},
    async exec() { throw new Error('This direct-author delivery must not invoke a maker or shell.'); } });
  const delivered = await hooks.get('before_agent_start')!({ prompt: '/skill:omd-ultradesign' }, { cwd: root });
  assert.equal(typeof delivered, 'object');
  const message = Reflect.get(delivered as object, 'message');
  assert.equal(message.customType, 'omd-qualitative-feedback');
  assert.equal(message.content.filter((part: { type: string }) => part.type === 'image')[0].data, png.toString('base64'));
  assert.throws(() => qualitativeFeedbackProjection(root, sha256('another task')), /scope/);
  writeFileSync(join(root, 'evidence/old.png'), 'changed');
  assert.equal(qualitativeFeedbackProjection(root, input.requestSha256)?.renders[0]?.pngBase64, png.toString('base64'));
  const pointerBefore = readFileSync(join(root, '.omd/qualitative-feedback.json'));
  assert.throws(() => publishQualitativeFeedback(root, input, writer), /digest/);
  assert.deepEqual(readFileSync(join(root, '.omd/qualitative-feedback.json')), pointerBefore);
  assert.throws(() => publishQualitativeFeedback(root, { ...input, approved: true }, writer), /fields/);
  assert.throws(() => publishQualitativeFeedback(root, { ...input, images: [] }, writer), /images/);
  writeFileSync(join(root, `.omd/qualitative-feedback/images/${sha256(png)}.png`), 'tampered');
  assert.throws(() => qualitativeFeedbackProjection(root, input.requestSha256), /image digest/);
});

test('the real feedback report CLI publishes scoped comparison evidence and refuses another request', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-feedback-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const route = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8'));
  publishTestAdaptiveRoute(root, route);
  const png = PNG.sync.write(new PNG({ width: 8, height: 8 }));
  writeFileSync(join(root, 'shown.png'), png);
  const input = { schema: 'qualitative-feedback-input-v1', requestSha256: sha256(route.request),
    origin: 'reported', text: 'The whole screen is rejected.', interpretation: 'Reconsider composition.',
    images: [{ path: 'shown.png', sha256: sha256(png), viewport: 'desktop', state: 'initial' }] };
  const cli = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
  const run = () => spawnSync(process.execPath, [cli, 'feedback', 'report', '--input', 'feedback.json', '--json'],
    { cwd: root, encoding: 'utf8', timeout: 30_000 });
  writeFileSync(join(root, 'feedback.json'), JSON.stringify(input));
  const accepted = run();
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout).authority, 'none');
  const pointer = readFileSync(join(root, '.omd/qualitative-feedback.json'));
  writeFileSync(join(root, 'feedback.json'), JSON.stringify({ ...input, requestSha256: '0'.repeat(64) }));
  const refused = run();
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /request scope/);
  assert.deepEqual(readFileSync(join(root, '.omd/qualitative-feedback.json')), pointer);
});
