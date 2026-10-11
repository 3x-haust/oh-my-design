import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { runTrustedBrowserEvaluation } from '../adapters/trusted-browser-runner.ts';
import { servedProjectTreeSha256 } from '../core/render/serve.ts';
import { parseTrustedBrowserReceipt } from '../core/runtime/trusted-browser-receipt.ts';
import { parseTrustedLifecycleManifest } from '../core/runtime/trusted-evaluation-contract.ts';

for (const persistent of [true, false]) {
  test(`reload observes ${persistent ? 'persisted data' : 'loss of memory-only data'} in a new document`, async t => {
    // Given a real page whose saved value is either durable or only painted in memory.
    const root = mkdtempSync(join(tmpdir(), 'omd-reload-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, '.omd'));
    writeFileSync(join(root, 'index.html'), `<!doctype html><html lang="en">
      <meta name="viewport" content="width=device-width"><title>Reload fixture</title>
      <label for="record">Record</label><input id="record">
      <button id="save">Save</button><p id="result"></p><p id="document"></p>
      <script>
        const boots = Number(sessionStorage.getItem('boots') || 0) + 1;
        sessionStorage.setItem('boots', String(boots));
        document.querySelector('#document').textContent = 'Document ' + boots;
        document.querySelector('#result').textContent = localStorage.getItem('record') || 'Not saved';
        document.querySelector('#save').onclick = () => {
          const value = document.querySelector('#record').value;
          ${persistent ? "localStorage.setItem('record', value);" : ''}
          document.querySelector('#result').textContent = value;
        };
      </script></html>`);
    const manifest = parseTrustedLifecycleManifest({
      schema: 'trusted-lifecycle-manifest-v1', entryPath: 'index.html',
      scripts: [{
        outcomeRef: 'mustHave:0',
        actions: [
          { kind: 'fill', selector: '#record', value: 'Saved record' },
          { kind: 'click', selector: '#save' },
          { kind: 'reload' },
        ],
        assertions: [
          { kind: 'visible-text', selector: '#result', text: 'Saved record' },
          { kind: 'visible-text', selector: '#document', text: 'Document 2' },
        ],
      }],
    });
    // When the trusted runner executes the declared reload at both fixed viewports.
    const result = await runTrustedBrowserEvaluation({
      root, manifest,
      binding: {
        runId: 'reload-test', routeSha256: 'a'.repeat(64), sourceContractSha256: 'b'.repeat(64),
        activationBuildSha256: 'c'.repeat(64), productionPath: 'index.html',
        productionRevisionSha256: servedProjectTreeSha256(root, 'index.html'),
        decisionGraphSha256: 'd'.repeat(64), requiredOutcomeRefs: ['mustHave:0'],
        confirmedClaimRefs: [], decisionRefs: ['decision:persistence'],
      },
      artifacts: { write(path, bytes) {
        const target = join(root, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, bytes);
      } },
    });
    // Then a no-op reload or a transient DOM update cannot masquerade as persistence.
    assert.equal(result.receipt.hardFloors.behavior, persistent ? 'pass' : 'fail');
    assert.deepEqual(result.actionLog.filter(line => line.startsWith('reload')),
      ['reload @ 1280x900', 'reload @ 390x844']);
    assert.deepEqual(parseTrustedBrowserReceipt(JSON.parse(JSON.stringify(result.receipt))), result.receipt);
    assert.deepEqual(result.receipt.captures.map(capture => [capture.width, capture.height]),
      [[1280, 900], [390, 844]]);
  });
}

for (const extra of [{ selector: 'body' }, { url: 'https://example.com' }, { value: 'script' }]) {
  test(`reload refuses caller-controlled fields ${Object.keys(extra)}`, () => {
    assert.throws(() => parseTrustedLifecycleManifest({
      schema: 'trusted-lifecycle-manifest-v1', entryPath: 'index.html',
      scripts: [{ outcomeRef: 'mustHave:0', actions: [{ kind: 'reload', ...extra }],
        assertions: [{ kind: 'preserved-text', selector: 'body', text: 'Record' }] }],
    }), /MALFORMED_TRUSTED_LIFECYCLE_MANIFEST/);
  });
}
