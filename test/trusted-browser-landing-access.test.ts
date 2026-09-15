import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { runTrustedBrowserEvaluation } from '../adapters/trusted-browser-runner.ts';
import { servedProjectTreeSha256 } from '../core/render/serve.ts';
import { parseTrustedLifecycleManifest } from '../core/runtime/trusted-evaluation-contract.ts';
import { parseTrustedBrowserReceipt } from '../core/runtime/trusted-browser-receipt.ts';

async function inspect(t: { after(fn: () => void): void }, extra: string, css = '') {
  const root = mkdtempSync(join(tmpdir(), 'omd-landing-access-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.omd'));
  writeFileSync(join(root, 'index.html'), [
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width">',
    `<style>body{margin:0;font:16px Arial;min-height:2000px}button,a{font:inherit}${css}</style>`,
    '<body>', extra,
    '<button id="submit">Copy command</button><p id="result" hidden>Command copied</p>',
    '<script>document.querySelector("#submit").onclick=()=>document.querySelector("#result").hidden=false</script>',
    '</body></html>',
  ].join(''));
  const result = await runTrustedBrowserEvaluation({
    root,
    manifest: parseTrustedLifecycleManifest({
      schema: 'trusted-lifecycle-manifest-v1',
      entryPath: 'index.html',
      scripts: [{
        outcomeRef: 'mustHave:0',
        actions: [{ kind: 'click', selector: '#submit' }],
        assertions: [{ kind: 'visible-text', selector: '#result', text: 'Command copied' }],
      }],
    }),
    binding: {
      runId: 'landing-access',
      routeSha256: 'a'.repeat(64),
      sourceContractSha256: 'b'.repeat(64),
      activationBuildSha256: 'c'.repeat(64),
      productionRevisionSha256: servedProjectTreeSha256(root, 'index.html'),
      productionPath: 'index.html',
      decisionGraphSha256: 'd'.repeat(64),
      requiredOutcomeRefs: ['mustHave:0'],
      confirmedClaimRefs: [],
      decisionRefs: ['decision:install'],
    },
    artifacts: {
      write(path, bytes) {
        const target = join(root, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, bytes);
      },
    },
  });
  assert.deepEqual(parseTrustedBrowserReceipt(JSON.parse(JSON.stringify(result.receipt))), result.receipt);
  return result;
}

test('keyboard evaluation follows the real Tab order past hidden and disabled controls', async (t) => {
  const result = await inspect(t,
    '<a href="#result" hidden>Closed navigation item</a><button disabled>Unavailable action</button>');
  assert.equal(result.receipt.hardFloors.behavior, 'pass');
  assert.equal(result.receipt.hardFloors.access, 'pass');
});

test('a clickable control that cannot be reached by Tab still fails keyboard evaluation', async (t) => {
  const result = await inspect(t,
    '<script>addEventListener("DOMContentLoaded",()=>document.querySelector("#submit").tabIndex=-1)</script>');
  assert.equal(result.receipt.hardFloors.behavior, 'pass');
  assert.equal(result.receipt.hardFloors.access, 'fail');
  assert.ok(result.receipt.transcript.includes('access-finding:keyboard-focus-missing:390x844'));
});

test('naturally scrollable labels crossing the viewport edge are reachable, not clipped', async (t) => {
  const result = await inspect(t,
    '<a class="edge" href="#result">Read the documentation</a>',
    '.edge{position:absolute;top:calc(100vh - 8px);left:24px;line-height:24px}');
  assert.equal(result.receipt.hardFloors.behavior, 'pass');
  assert.equal(result.receipt.hardFloors.access, 'pass');
});

test('a fixed label cut off by the viewport still fails with a localized diagnostic', async (t) => {
  const result = await inspect(t,
    '<a class="edge" href="#result">Read the documentation</a>',
    '.edge{position:fixed;top:calc(100vh - 8px);left:24px;line-height:24px}');
  assert.equal(result.receipt.hardFloors.access, 'fail');
  assert.ok(result.receipt.transcript.includes('access-finding:interactive-label-clipped:1280x900'));
  assert.ok(result.receipt.transcript.includes('access-finding:interactive-label-clipped:390x844'));
});

test('a document with scrolling disabled cannot excuse labels beyond its viewport', async (t) => {
  const result = await inspect(t,
    '<a class="edge" href="#result">Read the documentation</a>',
    'body{overflow:hidden}.edge{position:absolute;top:calc(100vh - 8px);left:24px;line-height:24px}');
  assert.equal(result.receipt.hardFloors.access, 'fail');
  assert.ok(result.receipt.transcript.includes('access-finding:interactive-label-clipped:390x844'));
});

test('a label cropped by a non-scrollable ancestor still fails with a localized diagnostic', async (t) => {
  const result = await inspect(t,
    '<div class="crop"><a href="#result">Read the documentation</a></div>',
    '.crop{width:72px;overflow:hidden;white-space:nowrap}');
  assert.equal(result.receipt.hardFloors.access, 'fail');
  assert.ok(result.receipt.transcript.includes('access-finding:interactive-label-clipped:390x844'));
  assert.throws(() => parseTrustedBrowserReceipt({
    ...result.receipt,
    hardFloors: { ...result.receipt.hardFloors, access: 'pass' },
  }), /MALFORMED_TRUSTED_BROWSER_RECEIPT/);
  assert.throws(() => parseTrustedBrowserReceipt({
    ...result.receipt,
    transcript: [...result.receipt.transcript, 'access-finding:untrusted prose /some/path'],
  }), /MALFORMED_TRUSTED_BROWSER_RECEIPT/);
});
