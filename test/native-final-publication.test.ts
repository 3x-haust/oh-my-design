import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import { buildFinalReviewerPublication } from '../adapters/final-reviewer-publication.ts';
import { runNativeFinalReview, finalizeNativeEvidence, checkNativeFinalReview } from '../core/runtime/native-final-publication.ts';
import { authorizeNativePiPayload, createTestNativePiInvocation } from '../core/runtime/native-pi-run.ts';
import { requireFinalReviewerLaneAuthorization } from '../core/runtime/invocation.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';

const digest = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const cliPath = fileURLToPath(new URL('./fixtures/pi-reviewer-rpc.mjs', import.meta.url));
const nodePath = realpathSync(process.execPath);
function setup(t: TestContext) {
  const fixture = prepareFinalRenderReviewFixture();
  const root = realpathSync(fixture.root);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const host = { nodePath, nodeSha256: digest(readFileSync(nodePath)), cliPath, cliSha256: digest(readFileSync(cliPath)),
    provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'high', parentSessionId: 'fixture-parent' };
  const invocation = createTestNativePiInvocation({ root, host, current: fixture.invocation.current });
  for (const path of readdirSync(join(root, '.omd')).filter(path => path.startsWith('trusted-browser-receipt-sha256-'))) {
    authorizeNativePiPayload(invocation, root, 'product-probe-result', readFileSync(join(root, '.omd', path)));
  }
  return { root, invocation, host };
}

test('Given actual isolated fixture reviewer processes When native review runs Then all three exact authorized lanes survive a fresh invocation', { timeout: 60_000 }, async t => {
  const input = setup(t);
  const result = await runNativeFinalReview({ ...input, signal: t.signal });
  const restarted = createTestNativePiInvocation({ ...input, host: { ...input.host, parentSessionId: 'resumed-parent' }, current: input.invocation.current });
  assert.equal(checkNativeFinalReview({ root: input.root, invocation: restarted }).ok, true);
  assert.equal(Object.keys(result.lanes).length, 3);
  assert.equal(result.executions.length, 6);
  const pids: number[] = [];
  for (const artifact of [...Object.values(result.lanes), ...result.executions]) {
    const bytes = readFileSync(join(input.root, artifact.path));
    assert.equal(digest(bytes), artifact.sha256);
    assert.doesNotThrow(() => requireFinalReviewerLaneAuthorization(restarted, input.root, bytes));
    const value: unknown = JSON.parse(bytes.toString());
    if (value && typeof value === 'object' && 'childPid' in value && typeof value.childPid === 'number') pids.push(value.childPid);
  }
  assert.equal(new Set(pids).size, 6);
  const attempts = readdirSync(join(input.root, '.omd/final-review/attempts'));
  assert.equal(attempts.length, 1);
  const attempt = JSON.parse(readFileSync(join(input.root, '.omd/final-review/attempts', attempts[0] ?? ''), 'utf8'));
  const fidelity = attempt.results.find((result: { lane: string }) => result.lane === 'fidelityLane');
  assert.ok(fidelity);
  writeFileSync(join(input.root, '.omd/copy-deck.md'), '# Different current copy\n');
  assert.throws(() => checkNativeFinalReview({ root: input.root, invocation: restarted }), /native lane packet/);
  assert.throws(() => buildFinalReviewerPublication({ schema: 'adaptive-final-review-publication-v1',
    laneSchema: 'adaptive-fidelity-review-v1', roleResults: fidelity.roleResults }, {
    projectRoot: input.root, invocation: input.invocation, ...input.invocation.current,
  }), /native lane packet/);
});

test('Given a completed RED reviewer judgment When native review runs Then diagnostics remain but no lane is approved', { timeout: 60_000 }, async t => {
  const input = setup(t);
  await runNativeFinalReview({ ...input, signal: t.signal });
  const previous = process.env.PI_REVIEWER_FIXTURE_MODE;
  process.env.PI_REVIEWER_FIXTURE_MODE = 'red-verdict';
  t.after(() => { if (previous === undefined) delete process.env.PI_REVIEWER_FIXTURE_MODE; else process.env.PI_REVIEWER_FIXTURE_MODE = previous; });
  await assert.rejects(runNativeFinalReview({ ...input, signal: t.signal }), /verdicts.*inspect/);
  assert.throws(() => checkNativeFinalReview(input), /review in progress or rejected/);
  assert.equal(readdirSync(join(input.root, '.omd/final-review/attempts')).length, 2);
});

test('Given unauthenticated local authority When native review or finalization is requested Then no reviewer publication is created', async t => {
  const { root, invocation } = prepareFinalRenderReviewFixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  await assert.rejects(runNativeFinalReview({ root, invocation }), /native Pi command/);
  assert.throws(() => finalizeNativeEvidence({ root, invocation }), /native Pi command/);
  assert.equal(existsSync(join(root, '.omd/final-review/native-current.json')), false);
  assert.equal(existsSync(join(root, '.omd/final-evidence-v2.json')), false);
});

test('Given failed reviewer execution When native review runs Then diagnostics persist without approved lanes', { timeout: 60_000 }, async t => {
  const input = setup(t);
  const previous = process.env.PI_REVIEWER_FIXTURE_MODE;
  process.env.PI_REVIEWER_FIXTURE_MODE = 'failed-final';
  t.after(() => { if (previous === undefined) delete process.env.PI_REVIEWER_FIXTURE_MODE; else process.env.PI_REVIEWER_FIXTURE_MODE = previous; });
  await assert.rejects(runNativeFinalReview({ ...input, signal: t.signal }), /review process failed; inspect/);
  assert.throws(() => checkNativeFinalReview(input), /review in progress or rejected/);
  assert.equal(readdirSync(join(input.root, '.omd/final-review/attempts')).length, 1);
});
