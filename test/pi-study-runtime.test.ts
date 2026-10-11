import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import {
  createSourceStudyPacket,
  MAX_SOURCE_STUDY_HTML_BYTES,
  SourceStudyContractError,
  type SourceStudyEvidence,
} from '../adapters/pi-study-contract.ts';
import { PiReviewerError } from '../adapters/pi-reviewer-contract.ts';
import { runPiSourceStudy } from '../adapters/pi-study-runtime.ts';
import { createTestNativePiInvocation } from '../core/runtime/native-pi-run.ts';
import { verifySignedPiEyeRoleResult } from '../core/runtime/pi-role-receipt.ts';
import { verifySignedPiStudyResult } from '../core/runtime/pi-study-receipt.ts';
import { browserFixturePng } from './helpers/browser-observation-decision-links.ts';

const digest = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const cliPath = fileURLToPath(new URL('./fixtures/pi-study-rpc.mjs', import.meta.url));
const nodePath = realpathSync(process.execPath);
type FixtureEvent = Readonly<{ event: string; pid: number }>;

function setup(t: TestContext, mode = 'success') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-pi-study-test-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const previousMode = process.env.PI_STUDY_FIXTURE_MODE;
  process.env.PI_STUDY_FIXTURE_MODE = mode;
  t.after(() => {
    if (previousMode === undefined) delete process.env.PI_STUDY_FIXTURE_MODE;
    else process.env.PI_STUDY_FIXTURE_MODE = previousMode;
  });
  const host = {
    nodePath,
    nodeSha256: digest(readFileSync(nodePath)),
    cliPath,
    cliSha256: digest(readFileSync(cliPath)),
    provider: 'fixture-provider',
    model: 'fixture-model',
    thinkingLevel: 'high',
    parentSessionId: 'fixture-parent',
  };
  const invocation = createTestNativePiInvocation({ root, host });
  const png = browserFixturePng(80, 60);
  const evidence: SourceStudyEvidence = {
    study: {
      source: 'current destination brief',
      contentStatus: 'approved',
      relationship: 'A focused work object leads to one primary action.',
      observableConsequence: 'The supplied content reads in one deliberate sequence.',
      primaryAction: 'Continue',
      viewports: [
        { name: 'desktop', width: 1280, height: 900 },
        { name: 'mobile', width: 390, height: 844 },
      ],
    },
    destinationContent: [{ path: 'content.md', content: '# Real destination content\nContinue' }],
    referenceRenders: [{
      sourceId: 'selected-original',
      imageSha256: digest(png),
      width: 80,
      height: 60,
      pngBase64: png.toString('base64'),
    }],
  };
  const packet = createSourceStudyPacket({ identity: invocation.current, evidence });
  return { root, invocation, packet };
}

function recordFixture(t: TestContext, root: string): () => readonly FixtureEvent[] {
  const tracePath = join(root, 'study-trace.jsonl');
  writeFileSync(tracePath, '');
  const previousTrace = process.env.PI_STUDY_FIXTURE_TRACE;
  process.env.PI_STUDY_FIXTURE_TRACE = tracePath;
  t.after(() => {
    if (previousTrace === undefined) delete process.env.PI_STUDY_FIXTURE_TRACE;
    else process.env.PI_STUDY_FIXTURE_TRACE = previousTrace;
  });
  const read = (): readonly FixtureEvent[] => readFileSync(tracePath, 'utf8').trim().split('\n').filter(Boolean).map(line => {
    const value: unknown = JSON.parse(line);
    assert.ok(typeof value === 'object' && value !== null
      && 'event' in value && typeof value.event === 'string'
      && 'pid' in value && typeof value.pid === 'number');
    return { event: value.event, pid: value.pid };
  });
  return read;
}

for (const mode of ['success', 'configuration-update'] as const) {
  test(`Given an authenticated Pi host in ${mode} mode When omd-study runs Then one signed bounded HTML handback returns`,
    { timeout: 30_000 }, async t => {
      const input = setup(t, mode);

      const result = await runPiSourceStudy({ ...input, signal: t.signal });

      const verified = verifySignedPiStudyResult(result, input.root);
      assert.equal(verified.receipt.role, 'omd-study');
      assert.equal(verified.receipt.provider, 'fixture-provider');
      assert.equal(verified.receipt.model, 'fixture-model');
      assert.equal(verified.receipt.modelReasoningEffort, 'medium');
      assert.equal(verified.handback.files[0].path, 'index.html');
      assert.match(verified.handback.files[0].content, /<button>Continue<\/button>/);
      assert.equal(verified.receipt.studyEvidence.packetSha256, digest(input.packet));
      assert.deepEqual(verified.receipt.usage, {
        assistantMessages: 2, input: 15, output: 17, cacheRead: 50, cacheWrite: 0, totalTokens: 82,
      });
      assert.ok(Number.isSafeInteger(verified.receipt.runtimeDurationMs) && verified.receipt.runtimeDurationMs >= 0);
      assert.throws(() => verifySignedPiEyeRoleResult(result, input.root));
    });
}

test('Given incomplete child usage When a study completes Then missing usage is not reported as zero', async t => {
  const input = setup(t, 'missing-usage');
  const result = await runPiSourceStudy({ ...input, signal: t.signal });
  assert.equal(verifySignedPiStudyResult(result, input.root).receipt.usage, null);
});

for (const [mode, code] of [
  ['wrong-model', 'study-state-model-session-or-history'],
  ['thinking-drift', 'study-state-model-session-or-history'],
  ['prehistory', 'study-state-model-session-or-history'],
  ['extra-tool', 'study-child-isolation'],
  ['ambient-system', 'study-ambient-system-prompt'],
] as const) {
  test(`Given ${mode} host drift When omd-study starts Then no authority is signed`, { timeout: 15_000 }, async t => {
    const input = setup(t, mode);

    await assert.rejects(runPiSourceStudy({ ...input, signal: t.signal }),
      error => error instanceof PiReviewerError && error.code === code);
  });
}

test('Given an extra returned file When the handback is parsed Then completion is refused', { timeout: 15_000 }, async t => {
  const input = setup(t, 'extra-file');

  await assert.rejects(runPiSourceStudy({ ...input, signal: t.signal }),
    error => error instanceof SourceStudyContractError && error.reason === 'handback-files');
});

test('Given malformed final JSON When the handback is authenticated Then completion is refused', { timeout: 15_000 }, async t => {
  const input = setup(t, 'malformed-handback');

  await assert.rejects(runPiSourceStudy({ ...input, signal: t.signal }),
    error => error instanceof PiReviewerError && error.code === 'study-final-json');
});

test('Given HTML above 512 KiB When the complete handback is parsed Then it is refused without clipping',
  { timeout: 15_000 }, async t => {
    const input = setup(t, 'oversized-handback');

    await assert.rejects(runPiSourceStudy({ ...input, signal: t.signal }),
      error => error instanceof SourceStudyContractError && error.reason === 'handback-html');

    assert.equal(MAX_SOURCE_STUDY_HTML_BYTES, 512 * 1024);
  });

test('Given packet content changed after binding When omd-study starts Then evidence drift is refused before launch',
  { timeout: 15_000 }, async t => {
    const input = setup(t);
    const packet = JSON.parse(input.packet.toString('utf8'));
    packet.evidence.destinationContent[0].content = 'drifted destination content';

    await assert.rejects(runPiSourceStudy({ ...input, packet: Buffer.from(JSON.stringify(packet)), signal: t.signal }),
      error => error instanceof SourceStudyContractError && error.reason === 'packet-binding');
  });

test('Given the RPC bridge claims a different packet When evidence is consumed Then no authority is signed',
  { timeout: 15_000 }, async t => {
    const input = setup(t, 'evidence-drift');
    const events = recordFixture(t, input.root);

    await assert.rejects(runPiSourceStudy({ ...input, signal: t.signal }), /evidence-packet-drift|child-exited/);

    assert.ok(events().some(event => event.event === 'active'));
  });

test('Given a running source study When its caller aborts Then the isolated child is cleaned up without authority',
  { timeout: 15_000 }, async t => {
    const input = setup(t, 'hang');
    const controller = new AbortController();
    const childPids = new Set<number>();
    let reachedActive = false;
    const server = createServer((request, response) => {
      const pid = Number(new URL(request.url ?? '/', 'http://127.0.0.1').searchParams.get('pid'));
      assert.ok(Number.isSafeInteger(pid) && pid > 0);
      childPids.add(pid);
      reachedActive = true;
      response.end();
      controller.abort();
    });
    const listening = once(server, 'listening');
    server.listen(0, '127.0.0.1');
    await listening;
    t.after(async () => {
      const closed = once(server, 'close');
      server.close();
      await closed;
    });
    const address = server.address();
    assert.ok(address !== null && typeof address !== 'string');
    const previous = process.env.PI_STUDY_FIXTURE_ACTIVE_URL;
    process.env.PI_STUDY_FIXTURE_ACTIVE_URL = `http://127.0.0.1:${address.port}/active`;
    t.after(() => {
      if (previous === undefined) delete process.env.PI_STUDY_FIXTURE_ACTIVE_URL;
      else process.env.PI_STUDY_FIXTURE_ACTIVE_URL = previous;
    });
    await assert.rejects(runPiSourceStudy({
      ...input,
      signal: AbortSignal.any([controller.signal, t.signal]),
    }), /cancelled/);

    assert.equal(reachedActive, true);
    assert.ok(childPids.size > 0);
    for (const pid of childPids) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  });
