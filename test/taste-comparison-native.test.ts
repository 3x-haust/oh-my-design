import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createTestNativePiInvocation } from '../core/runtime/native-pi-run.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { publishDesignJudgment } from '../core/design/judgment-files.ts';
import { publishFirstRenderCheck } from '../core/design/first-render-evidence.ts';
import { readTasteComparisonReview, runTasteComparison } from '../core/design/taste-comparison.ts';
import { TASTE_COMPARISON_REVIEW_TASK, parseTasteComparisonReview } from '../core/design/taste-comparison-contract.ts';
import { DEFAULT_TASTE_ANCHORS, rotatedTasteAnchors } from '../core/design/taste-anchors.ts';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const ANCHOR_PAGE = (accent: string) => `<!doctype html><html><body style="margin:0;font:20px Georgia,serif;background:#f4efe6">
<header style="height:120px;background:${accent}"></header><main style="padding:48px"><h1 style="font-size:64px">Quiet tools</h1>
<p>Set in a measured column with one accent.</p><div style="height:300px;width:60%;background:#1d1d1f"></div></main></body></html>`;

function useEnv(t: test.TestContext, values: Readonly<Record<string, string>>): void {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function nativeProject(t: test.TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-taste-compare-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const nodePath = realpathSync(process.execPath);
  const cliPath = fileURLToPath(new URL('fixtures/pi-reviewer-rpc.mjs', import.meta.url));
  const invocation = createTestNativePiInvocation({ root, host: {
    nodePath, nodeSha256: hash(readFileSync(nodePath)), cliPath, cliSha256: hash(readFileSync(cliPath)),
    provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'medium', parentSessionId: 'taste-parent',
  } });
  return { root, invocation };
}

async function checkedProject(t: test.TestContext) {
  const project = nativeProject(t);
  const writer = createTestProjectWriteAdapter(project.root, project.invocation);
  mkdirSync(join(project.root, 'dist'));
  writeFileSync(join(project.root, 'dist/index.html'),
    '<!doctype html><html><body style="font-family:system-ui"><main><h1>Reading now</h1><p>Track the page you reached.</p><button>Update progress</button></main></body></html>');
  publishDesignJudgment(project.root, {
    schema: 'design-judgment-v1', referenceBoardSha256: 'a'.repeat(64),
    hypothesis: { schema: 'design-judgment-v1', feelsLike: 'A focused personal reading log',
      dominantObject: 'current books', subordinate: ['navigation'], densityIntent: 'readable current books',
      trustSource: 'local saved status', twoSecondRead: 'Update the page reached in a book' },
    judgments: [{ id: 'reading', observation: 'The current book occupies the primary region.',
      whyItWorksThere: 'Progress updates act on a selected book.', relevance: 'high', adopt: ['Book-local progress'],
      reject: ['Source branding'], interpretation: 'Keep progress with the current book.', scope: 'surface' }],
  }, writer);
  await publishFirstRenderCheck(project.root, 'dist/index.html', undefined, writer, project.invocation);
  return project;
}

async function anchorServer(t: test.TestContext): Promise<string> {
  const server = createServer((request, response) => {
    if (request.url === '/missing') { response.writeHead(404, { 'content-type': 'text/html' }); response.end('<h1>gone</h1>'); return; }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(ANCHOR_PAGE(request.url === '/b' ? '#c2410c' : '#1e3a8a'));
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>(done => server.close(() => done())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('blind pairwise comparison records order-aware AI judgments behind neutral A/B evidence', { timeout: 240_000 }, async t => {
  const { root, invocation } = await checkedProject(t);
  const origin = await anchorServer(t);
  const evidencePath = join(root, 'evidence-text.jsonl');
  writeFileSync(evidencePath, '');
  useEnv(t, { PI_REVIEWER_FIXTURE_MODE: 'taste-picks-a', PI_REVIEWER_FIXTURE_EVIDENCE_TEXT: evidencePath });
  const anchors = [`${origin}/a`, `${origin}/missing`, `${origin}/b`];
  const picksA = await runTasteComparison(root, invocation, { anchors, signal: t.signal });
  assert.deepEqual(picksA.anchors.used, [`${origin}/a`, `${origin}/b`]);
  assert.equal(picksA.anchors.skipped[0]?.url, `${origin}/missing`);
  assert.match(picksA.anchors.skipped[0]?.reason ?? '', /HTTP 404/);
  assert.equal(picksA.summary.trials, 8);
  for (const trial of picksA.trials) {
    assert.equal(trial.projectLabel, trial.order === 'project-first' ? 'A' : 'B');
    // The reviewer chose A as human: only a build shown as B was judged AI-made.
    assert.equal(trial.projectJudgedAi, trial.projectLabel === 'B');
  }
  assert.equal(picksA.summary.judgedAi, 4);
  // Picking A every time is reading the slot, not the page: no pair says anything, so this is not a pass.
  assert.equal(picksA.summary.rate, 1);
  assert.equal(picksA.summary.verdict, 'distinguishable');
  assert.equal(picksA.summary.recurringTells.desktop.length, 2);
  assert.ok(picksA.summary.recurringTells.desktop.every(tell => /tell in B/.test(tell)));
  const persisted = readTasteComparisonReview(root, picksA.id);
  assert.equal(persisted?.sha256, picksA.sha256);
  assert.equal(persisted?.trials.length, 8);
  assert.equal(readFileSync(join(root, '.omd/taste/anchors/.gitignore'), 'utf8'), '*\n');
  assert.equal(readdirSync(join(root, '.omd/taste/anchors')).filter(name => name.endsWith('.png')).length, 4);

  const seen = readFileSync(evidencePath, 'utf8').trim().split('\n').map(line => JSON.parse(line) as { task: string; text: string[] });
  assert.equal(seen.length, 8);
  for (const { task, text } of seen) {
    assert.equal(task, TASTE_COMPARISON_REVIEW_TASK);
    for (const shown of [task, ...text]) {
      assert.doesNotMatch(shown, /project|anchor|consulted|reference|first.?render|https?:|127\.0\.0\.1|\.omd/i);
    }
    const labels = text.slice(1).map(row => JSON.parse(row) as Record<string, unknown>);
    assert.deepEqual(labels.map(row => row.label), ['A', 'B']);
    for (const row of labels) assert.deepEqual(Object.keys(row).sort(), ['captureSha256', 'height', 'label', 'width']);
  }

  process.env.PI_REVIEWER_FIXTURE_MODE = 'taste-picks-b';
  const picksB = await runTasteComparison(root, invocation, { anchors: [`${origin}/a`], signal: t.signal });
  assert.equal(picksB.summary.trials, 4);
  for (const trial of picksB.trials) assert.equal(trial.projectJudgedAi, trial.order === 'project-first');
  assert.equal(picksB.summary.judgedAi, 2);
  assert.equal(readdirSync(join(root, '.omd/taste/reviews')).length, 2);
});

test('a malformed taste handback is refused after its correction turn and writes no record', { timeout: 240_000 }, async t => {
  const { root, invocation } = await checkedProject(t);
  const origin = await anchorServer(t);
  const tracePath = join(root, 'trace.jsonl');
  writeFileSync(tracePath, '');
  useEnv(t, { PI_REVIEWER_FIXTURE_MODE: 'taste-malformed-human', PI_REVIEWER_FIXTURE_TRACE: tracePath });
  await assert.rejects(() => runTasteComparison(root, invocation, { anchors: [`${origin}/a`], signal: t.signal }), /human must be A or B/);
  assert.match(readFileSync(tracePath, 'utf8'), /binding-repair/);
  process.env.PI_REVIEWER_FIXTURE_MODE = 'taste-malformed-confidence';
  await assert.rejects(() => runTasteComparison(root, invocation, { anchors: [`${origin}/a`], signal: t.signal }), /confidence/);
  assert.equal(existsSync(join(root, '.omd/taste/reviews')), false);
});

test('taste comparison refuses without a current first-render check and writes nothing', async t => {
  const { root, invocation } = nativeProject(t);
  await assert.rejects(() => runTasteComparison(root, invocation, { anchors: ['https://example.invalid'] }),
    /TASTE_COMPARISON_REFUSED: no current first-render check exists; run omd first-render check first/);
  assert.equal(existsSync(join(root, '.omd/taste')), false);
});

test('taste handback parser and anchor rotation are strict and deterministic', () => {
  const bindings = { buildSha256: 'a'.repeat(64), briefSha256: 'b'.repeat(64), evidenceSha256: 'c'.repeat(64),
    browserSha256: 'd'.repeat(64), trialSha256: 'e'.repeat(64) };
  const valid = { schema: 'taste-comparison-reviewer-handback-v1', fixedBindings: bindings, human: 'B', confidence: 0.5,
    aiTells: ['Hero: centred default stack.'], humanSignals: ['Nav: specific wordmark spacing.'] };
  assert.equal(parseTasteComparisonReview(valid, bindings).human, 'B');
  assert.throws(() => parseTasteComparisonReview({ ...valid, confidence: 0.49 }, bindings), /confidence/);
  assert.throws(() => parseTasteComparisonReview({ ...valid, aiTells: [] }, bindings), /aiTells/);
  assert.throws(() => parseTasteComparisonReview({ ...valid, humanSignals: Array(7).fill('x') }, bindings), /humanSignals/);
  assert.throws(() => parseTasteComparisonReview({ ...valid, extra: true }, bindings), /unexpected/);
  assert.throws(() => parseTasteComparisonReview({ ...valid, fixedBindings: { ...bindings, trialSha256: 'f'.repeat(64) } }, bindings), /bindings/);
  const rotated = rotatedTasteAnchors('00000003'.padEnd(64, '0'));
  assert.equal(rotated[0], DEFAULT_TASTE_ANCHORS[3]);
  assert.deepEqual([...rotated].sort(), [...DEFAULT_TASTE_ANCHORS].sort());
});

test('taste compare refuses outside native Pi authority', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-taste-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cli = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'taste', 'compare', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(`${result.stdout}\n${result.stderr}`, /NATIVE_PI_AUTHORITY/);
  assert.equal(result.stdout, '');
});

test('taste compare names the next step for each round and stops repairing at the last', async () => {
  const { tasteNext, TASTE_REPAIR_ROUNDS } = await import('../core/design/taste-comparison.ts');
  assert.match(tasteNext('distinguishable', 1), /^Round 1 of 3: distinguishable\. Repair the recurring tells.*omd taste compare again/);
  assert.match(tasteNext('distinguishable', TASTE_REPAIR_ROUNDS), /Stop repairing for taste and report the rate/);
  assert.match(tasteNext('not-distinguishable', 1), /report the rate at completion/);
});
