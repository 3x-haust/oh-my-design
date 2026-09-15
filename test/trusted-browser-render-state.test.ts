import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { runTrustedBrowserEvaluation } from '../adapters/trusted-browser-runner.ts';
import { decodePng } from '../core/motion/energy.ts';
import { servedProjectTreeSha256 } from '../core/render/serve.ts';
import { parseTrustedBrowserReceipt } from '../core/runtime/trusted-browser-receipt.ts';
import { parseTrustedLifecycleManifest } from '../core/runtime/trusted-evaluation-contract.ts';

async function inspect(t: { after(fn: () => void): void }, css: string, action = '', initial = '') {
  const root = mkdtempSync(join(tmpdir(), 'omd-rendered-result-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.omd'));
  writeFileSync(join(root, 'index.html'), [
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width">',
    '<style>body{margin:0;background:white;font:16px Arial}',
    '#result{position:absolute;left:24px;top:80px;width:240px;height:64px;margin:0;background:rgb(0,128,0);color:white}',
    css, '</style><body><button id="show">Show result</button>',
    '<section id="container"><p id="result" hidden>Preview ready</p></section>',
    '<script>const result=document.querySelector("#result");', initial,
    'document.querySelector("#show").onclick=()=>{',
    'result.hidden=false;', action, '};</script></body></html>',
  ].join(''));
  const result = await runTrustedBrowserEvaluation({
    root,
    manifest: parseTrustedLifecycleManifest({
      schema: 'trusted-lifecycle-manifest-v1', entryPath: 'index.html',
      scripts: [{
        outcomeRef: 'mustHave:0',
        actions: [{ kind: 'click', selector: '#show' }],
        assertions: [{ kind: 'visible-text', selector: '#result', text: 'Preview ready' }],
      }],
    }),
    binding: {
      runId: 'rendered-result', routeSha256: 'a'.repeat(64), sourceContractSha256: 'b'.repeat(64),
      activationBuildSha256: 'c'.repeat(64), productionPath: 'index.html',
      productionRevisionSha256: servedProjectTreeSha256(root, 'index.html'),
      decisionGraphSha256: 'd'.repeat(64), requiredOutcomeRefs: ['mustHave:0'],
      confirmedClaimRefs: [], decisionRefs: ['decision:feedback'],
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
  return { root, result };
}

for (const selector of ['#result', '#container']) {
  test(`transparent feedback at ${selector} cannot pass a visible-result assertion`, async (t) => {
    const { result } = await inspect(t, `${selector}{opacity:0}`);
    assert.equal(result.receipt.hardFloors.behavior, 'fail');
    assert.ok(result.receipt.outcomeResults[0]?.findings.includes('required-result-not-rendered'));
  });
}

test('a frame-scheduled finite feedback animation finishes before captured pixels are accepted', async (t) => {
  const { root, result } = await inspect(t, '', [
    'requestAnimationFrame(()=>requestAnimationFrame(()=>',
    'result.animate([{opacity:0},{opacity:1}],{duration:500,fill:"both"})));',
  ].join(''));
  assert.equal(result.receipt.hardFloors.behavior, 'pass');
  for (const capture of result.receipt.captures) {
    const png = decodePng(readFileSync(join(root, capture.path)));
    const pixel = (130 * png.width + 40) * png.channels;
    assert.deepEqual([...png.pixels.subarray(pixel, pixel + 3)], [0, 128, 0],
      'the actual screenshot must contain the settled green feedback, not a partly transparent frame');
  }
});

test('ordinary visible feedback still passes at both fixed viewports', async (t) => {
  const { result } = await inspect(t, '');
  assert.equal(result.receipt.hardFloors.behavior, 'pass');
  assert.deepEqual(result.receipt.captures.map(({ width, height }) => [width, height]),
    [[1280, 900], [390, 844]]);
});

test('revealing an initially transparent state is a real transition', async (t) => {
  const { result } = await inspect(t, '#result{opacity:0}',
    'setTimeout(()=>{result.style.opacity="1"},100);', 'result.hidden=false;');
  assert.equal(result.receipt.hardFloors.behavior, 'pass');
});
