import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runModelLedCompletion } from '../bin/model-led-completion-command.ts';
import { publishAdaptiveRoute } from '../core/route/adaptive-route-persistence.ts';
import { nextStageWork } from '../core/stage/next.ts';
import { publishFirstRenderCheck } from '../core/design/first-render-evidence.ts';
import {
  readCurrentFirstRenderReview,
  runFirstRenderReview,
} from '../core/design/first-render-review.ts';
import {
  firstRenderLoopState,
  readFirstRenderIterationHistory,
} from '../core/design/first-render-checkpoint.ts';
import {
  createModelLedRouteContext,
  modelLedInput,
} from './helpers/model-led.ts';

const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const packRoot = fileURLToPath(new URL('../core', import.meta.url));

test('four comparable non-improving reviews stop the loop with a distinct diagnostic', { timeout: 180_000 }, async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-first-render-loop-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const oldMode = process.env.PI_REVIEWER_FIXTURE_MODE;
  const oldFinding = process.env.PI_REVIEWER_FIXTURE_FINDING_ID;
  t.after(() => {
    if (oldMode === undefined) delete process.env.PI_REVIEWER_FIXTURE_MODE;
    else process.env.PI_REVIEWER_FIXTURE_MODE = oldMode;
    if (oldFinding === undefined) delete process.env.PI_REVIEWER_FIXTURE_FINDING_ID;
    else process.env.PI_REVIEWER_FIXTURE_FINDING_ID = oldFinding;
  });
  const nodePath = realpathSync(process.execPath);
  const cliPath = fileURLToPath(new URL('fixtures/pi-reviewer-rpc.mjs', import.meta.url));
  const request = 'Build a bounded first-render review surface.';
  const { invocation, writer } = createModelLedRouteContext(root, request, {
    host: {
      nodePath,
      nodeSha256: hash(readFileSync(nodePath)),
      cliPath,
      cliSha256: hash(readFileSync(cliPath)),
      provider: 'fixture-provider',
      model: 'fixture-model',
      thinkingLevel: 'medium',
      parentSessionId: 'loop-parent',
    },
  });
  const input = modelLedInput(request);
  input.allowedPaths = ['index.html'];
  publishAdaptiveRoute(root, input, writer, invocation);
  const html = (round: number) => `<!doctype html><html><style>
    body{font:18px Arial;margin:24px}button{width:38px;word-break:break-all}
    </style><body><main><h1>Review work</h1><button>Continue task</button></main><!-- ${round} --></body></html>`;
  writeFileSync(join(root, 'index.html'), html(1));

  process.env.PI_REVIEWER_FIXTURE_MODE = 'early-revise';
  process.env.PI_REVIEWER_FIXTURE_FINDING_ID = 'initial-finding';
  await publishFirstRenderCheck(root, 'index.html', undefined, writer, invocation);
  const initial = await runFirstRenderReview(root, invocation, t.signal);
  assert.equal(initial.diagnostic, undefined);

  let latest = initial;
  for (let round = 2; round <= 5; round += 1) {
    writeFileSync(join(root, 'index.html'), html(round));
    process.env.PI_REVIEWER_FIXTURE_MODE = 'early-progress-same';
    process.env.PI_REVIEWER_FIXTURE_FINDING_ID = `finding-${round}`;
    await publishFirstRenderCheck(root, 'index.html', undefined, writer, invocation);
    latest = await runFirstRenderReview(root, invocation, t.signal);
  }

  assert.equal(latest.diagnostic?.code, 'FIRST_RENDER_LOOP_STALLED');
  assert.equal(latest.next, 'omd first-render restore --json');
  assert.ok(latest.loop);
  assert.equal(latest.loop.stalled, true);
  assert.deepEqual(latest.loop.reasons, ['four-non-improving-reviews']);
  const route = (await import('../core/route/adaptive-route-persistence.ts'))
    .readPersistedRoute(root, invocation);
  const history = readFirstRenderIterationHistory(root, route);
  assert.equal(history.iterations.length, 5);
  assert.equal(history.bestIterationId, '5');
  assert.equal(firstRenderLoopState(root, route).stalled, true);
  input.allowedPaths = ['index.html', 'styles.css'];
  publishAdaptiveRoute(root, input, writer, invocation);
  assert.equal(readCurrentFirstRenderReview(root, invocation), null);
  const stage = nextStageWork(root, packRoot, invocation);
  assert.notEqual(stage.action, 'restore-best-first-render');
  assert.notEqual(stage.next, 'omd first-render restore --json');
  const completion = await runModelLedCompletion({ root, packRoot, invocation, signal: t.signal });
  assert.notEqual(completion.diagnostic?.code, 'FIRST_RENDER_REGRESSED');
  assert.notEqual(completion.diagnostic?.code, 'FIRST_RENDER_LOOP_STALLED');
  assert.notEqual(completion.diagnostic?.next, 'omd first-render restore --json');
});
