import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { chromium } from 'playwright';
import type { BrowserContextOptions } from 'playwright';
import { runTrustedBrowserEvaluation } from '../adapters/trusted-browser-runner.ts';
import { servedProjectTreeSha256 } from '../core/render/serve.ts';
import { parseTrustedLifecycleManifest } from '../core/runtime/trusted-evaluation-contract.ts';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-publication-'));
  mkdirSync(join(root, '.omd'));
  writeFileSync(join(root, 'index.html'),
    '<!doctype html><meta name="viewport" content="width=device-width"><button>Read</button><p>Ready</p>');
  return {
    root,
    manifest: parseTrustedLifecycleManifest({
      schema: 'trusted-lifecycle-manifest-v1', entryPath: 'index.html',
      scripts: [{ outcomeRef: 'mustHave:0', actions: [],
        assertions: [{ kind: 'visible-text', selector: 'p', text: 'Ready' }] }],
    }),
    binding: {
      runId: 'publication', routeSha256: 'a'.repeat(64), sourceContractSha256: 'b'.repeat(64),
      activationBuildSha256: 'c'.repeat(64), productionPath: 'index.html',
      productionRevisionSha256: servedProjectTreeSha256(root, 'index.html'),
      decisionGraphSha256: 'd'.repeat(64), requiredOutcomeRefs: ['mustHave:0'],
      confirmedClaimRefs: [], decisionRefs: [],
    },
  };
}

test('capture publication starts only after every viewport context closes', async () => {
  const input = fixture();
  const browser = await chromium.launch({ headless: true });
  const launch = mock.method(chromium, 'launch', async () => browser);
  const published: string[] = [];
  try {
    const result = await runTrustedBrowserEvaluation({
      ...input, artifacts: { write(path) {
        assert.equal(browser.contexts().length, 0, 'durable writes must not consume the browser inspection budget');
        published.push(path);
      } },
    });
    assert.equal(result.receipt.hardFloors.behavior, 'pass');
    assert.deepEqual(published, result.receipt.captures.map(capture => capture.path));
  } finally {
    launch.mock.restore();
    await browser.close();
    rmSync(input.root, { recursive: true, force: true });
  }
});

test('a later viewport acquisition failure publishes no earlier captures', async () => {
  const input = fixture();
  const browser = await chromium.launch({ headless: true });
  const launch = mock.method(chromium, 'launch', async () => browser);
  const newContext = browser.newContext.bind(browser);
  const acquisition = mock.method(browser, 'newContext', async (options?: BrowserContextOptions) => {
    if (options?.viewport?.width === 390) throw new Error('second viewport unavailable');
    return newContext(options);
  });
  const published: string[] = [];
  try {
    await assert.rejects(() => runTrustedBrowserEvaluation({
      ...input, artifacts: { write(path) { published.push(path); } },
    }), /second viewport unavailable/);
    assert.deepEqual(published, []);
  } finally {
    acquisition.mock.restore();
    launch.mock.restore();
    await browser.close();
    rmSync(input.root, { recursive: true, force: true });
  }
});

test('a failed capture publisher never returns a trusted result', async () => {
  const input = fixture();
  try {
    await assert.rejects(() => runTrustedBrowserEvaluation({
      ...input, artifacts: { write() { throw new Error('publication refused'); } },
    }), /publication refused/);
  } finally {
    rmSync(input.root, { recursive: true, force: true });
  }
});
