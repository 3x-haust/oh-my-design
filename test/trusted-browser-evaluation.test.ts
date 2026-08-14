import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  requireTrustedBrowserEvaluation,
  runTrustedBrowserEvaluation,
} from '../adapters/trusted-browser-runner.ts';
import { servedProjectTreeSha256, serveProjectEntry } from '../core/render/serve.ts';
import { parseTrustedLifecycleManifest } from '../core/runtime/trusted-evaluation-contract.ts';

const sha = (value: string): string => value.repeat(64);
const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

function page(working: boolean): string {
  return [
    '<!doctype html><html><head><meta name="viewport" content="width=device-width">',
    '<style>body{margin:0}button{margin:24px}p{margin:24px}</style></head><body>',
    '<button id="submit">Submit order</button>',
    '<p role="status" hidden>Order submitted</p>',
    '<script>',
    ...(working ? [
      'document.querySelector("#submit").addEventListener("click", () => {',
      'document.querySelector("[role=status]").hidden = false;',
      '});',
    ] : []),
    '</script></body></html>',
  ].join('\n');
}

function request(
  root: string,
  productionPath = 'index.html',
  productionRevisionSha256?: string,
) {
  // Trusted lifecycle projects already own this excluded artifact root before production binding.
  mkdirSync(join(root, '.omd'), { recursive: true });
  const revision = productionRevisionSha256 ?? servedProjectTreeSha256(root, productionPath);
  return {
    root,
    manifest: parseTrustedLifecycleManifest({
      schema: 'trusted-lifecycle-manifest-v1',
      entryPath: productionPath,
      scripts: [{
        outcomeRef: 'outcome:a',
        actions: [{ kind: 'click', selector: '#submit' }],
        assertions: [{
          kind: 'visible-text',
          selector: '[role=status]',
          text: 'Order submitted',
        }],
      }],
    }),
    binding: {
      runId: 'run-1',
      routeSha256: sha('a'),
      sourceContractSha256: sha('b'),
      activationBuildSha256: sha('c'),
      productionRevisionSha256: revision,
      productionPath,
      decisionGraphSha256: sha('e'),
      requiredOutcomeRefs: ['outcome:a'],
      confirmedClaimRefs: ['claim:a'],
      decisionRefs: ['decision:a'],
    },
    artifacts: {
      write(relativePath: string, bytes: Uint8Array) {
        const target = join(root, relativePath);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, bytes);
      },
    },
  } as const;
}

test('real browser produces a trusted fail and pass receipt at fixed viewports', async () => {
  const broken = mkdtempSync(join(tmpdir(), 'omd-browser-broken-'));
  const fixed = mkdtempSync(join(tmpdir(), 'omd-browser-fixed-'));
  try {
    writeFileSync(join(broken, 'index.html'), page(false));
    writeFileSync(join(fixed, 'index.html'), page(true));

    const brokenResult = await runTrustedBrowserEvaluation(request(broken));
    const fixedResult = await runTrustedBrowserEvaluation(request(fixed));

    assert.equal(brokenResult.receipt.outcomeResults[0]?.status, 'fail');
    assert.equal(fixedResult.receipt.outcomeResults[0]?.status, 'pass');
    assert.deepEqual(
      fixedResult.receipt.captures.map((capture) => [capture.width, capture.height]),
      [[1280, 900], [390, 844]],
    );
    assert.equal(fixedResult.receipt.hardFloors.behavior, 'pass');
    assert.equal(fixedResult.receipt.hardFloors.access, 'pass');
    assert.equal(fixedResult.receipt.hardFloors.safety, 'pass');
    assert.equal(fixedResult.actionLog.some((entry) => entry.includes('click #submit')), true);
    for (const capture of fixedResult.receipt.captures) {
      assert.equal(readFileSync(join(fixed, capture.path)).subarray(1, 4).toString(), 'PNG');
    }
  } finally {
    rmSync(broken, { recursive: true, force: true });
    rmSync(fixed, { recursive: true, force: true });
  }
});

test('tall production pages publish viewport-sized captures', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-viewport-capture-'));
  try {
    writeFileSync(join(root, 'index.html'), page(true).replace(
      '<style>',
      '<style>html,body{min-height:2400px}',
    ));
    const result = await runTrustedBrowserEvaluation(request(root));
    for (const capture of result.receipt.captures) {
      const png = readFileSync(join(root, capture.path));
      assert.equal(png.readUInt32BE(16), capture.width);
      assert.equal(png.readUInt32BE(20), capture.height);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('production serving executes relative CSS, JavaScript, module imports, and self CSP', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-served-product-'));
  try {
    mkdirSync(join(root, 'dist', 'assets'), { recursive: true });
    writeFileSync(join(root, 'index.html'), page(false));
    writeFileSync(join(root, 'dist', 'index.html'), [
      '<!doctype html><html><head>',
      '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\'">',
      '<link rel="stylesheet" href="assets/product.css">',
      '</head><body><button id="submit" disabled>Submit order</button>',
      '<p role="status" hidden>pending</p>',
      '<script type="module" src="assets/product.js"></script>',
      '</body></html>',
    ].join('\n'));
    writeFileSync(join(root, 'dist', 'assets', 'product.css'), 'body { --product-ready: yes; }');
    writeFileSync(join(root, 'dist', 'assets', 'dependency.js'), 'export const result = "Order submitted";');
    writeFileSync(join(root, 'dist', 'assets', 'product.js'), [
      'import { result } from "./dependency.js";',
      'const submit = document.querySelector("#submit");',
      'submit.addEventListener("click", () => {',
      '  const status = document.querySelector("[role=status]");',
      '  status.textContent = getComputedStyle(document.body).getPropertyValue("--product-ready").trim() === "yes" ? result : "CSS missing";',
      '  status.hidden = false;',
      '});',
      'submit.disabled = false;',
    ].join('\n'));

    const result = await runTrustedBrowserEvaluation(request(root, 'dist/index.html'));
    assert.equal(result.receipt.outcomeResults[0]?.status, 'pass');
    assert.equal(result.receipt.hardFloors.safety, 'pass');
    assert.equal(result.receipt.productionPath, 'dist/index.html');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project serving materializes immutable bytes and releases its loopback origin on close', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-immutable-'));
  try {
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'index.html'), '<script type="module" src="assets/product.js"></script>');
    writeFileSync(join(root, 'assets', 'product.js'), 'document.body.textContent = "bound bytes";');
    const served = await serveProjectEntry(root, 'index.html');
    const scriptUrl = new URL('assets/product.js', served.url);
    writeFileSync(join(root, 'assets', 'product.js'), 'document.body.textContent = "swapped bytes";');

    assert.equal(await (await fetch(scriptUrl)).text(), 'document.body.textContent = "bound bytes";');
    await served.close();
    await assert.rejects(() => fetch(scriptUrl));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('served root swap cannot alter materialized bytes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-root-swap-'));
  const displaced = `${root}-original`;
  writeFileSync(join(root, 'index.html'), '<!doctype html><p>bound root</p>');
  const served = await serveProjectEntry(root, 'index.html');
  try {
    renameSync(root, displaced);
    mkdirSync(root);
    writeFileSync(join(root, 'index.html'), '<!doctype html><p>swapped root</p>');
    assert.equal(await (await fetch(served.url)).text(), '<!doctype html><p>bound root</p>');
    rmSync(root, { recursive: true, force: true });
    renameSync(displaced, root);

    assert.doesNotThrow(() => served.assertSourceCurrent());
  } finally {
    await served.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(displaced, { recursive: true, force: true });
  }
});

test('adjacent served dependency mutation invalidates the trusted receipt', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-dependency-swap-'));
  try {
    mkdirSync(join(root, 'assets'), { recursive: true });
    writeFileSync(join(root, 'index.html'), [
      '<!doctype html><html><head><link rel="stylesheet" href="assets/product.css"></head>',
      '<body><button id="submit">Submit order</button><p role="status" hidden>Order submitted</p>',
      '<script>document.querySelector("#submit").onclick=()=>document.querySelector("[role=status]").hidden=false</script>',
      '</body></html>',
    ].join(''));
    writeFileSync(join(root, 'assets', 'product.css'), 'body { color: black; }');
    const input = request(root);
    let mutated = false;
    await assert.rejects(
      () => runTrustedBrowserEvaluation({
        ...input,
        artifacts: {
          write(relativePath, bytes) {
            const target = join(root, relativePath);
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, bytes);
            if (!mutated) {
              mutated = true;
              writeFileSync(join(root, 'assets', 'product.css'), 'body { color: red; }');
            }
          },
        },
      }),
      /TRUSTED_BROWSER_PRODUCTION_REVISION_CHANGED/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('transient dependency swap and exact byte restore invalidates the trusted receipt', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-dependency-transient-swap-'));
  try {
    mkdirSync(join(root, 'assets'), { recursive: true });
    writeFileSync(join(root, 'index.html'), [
      '<!doctype html><html><body><button id="submit">Submit order</button>',
      '<p role="status" hidden>Order submitted</p><script src="assets/product.js"></script></body></html>',
    ].join(''));
    const dependency = join(root, 'assets', 'product.js');
    const displaced = join(root, 'assets', 'product.original.js');
    const original = 'document.querySelector("#submit").onclick=()=>document.querySelector("[role=status]").hidden=false';
    writeFileSync(dependency, original);
    const input = request(root);
    let swapped = false;

    await assert.rejects(
      () => runTrustedBrowserEvaluation({
        ...input,
        artifacts: {
          write(relativePath, bytes) {
            const target = join(root, relativePath);
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, bytes);
            if (!swapped) {
              swapped = true;
              renameSync(dependency, displaced);
              writeFileSync(dependency, 'document.body.textContent = "transient attacker bytes"');
              rmSync(dependency);
              renameSync(displaced, dependency);
            }
          },
        },
      }),
      /TRUSTED_BROWSER_PRODUCTION_REVISION_CHANGED/,
    );
    assert.equal(readFileSync(dependency, 'utf8'), original);
    assert.equal(servedProjectTreeSha256(root, 'index.html'), input.binding.productionRevisionSha256);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('unavailable actions and symlinked served dependencies fail closed', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-no-follow-'));
  const outside = mkdtempSync(join(tmpdir(), 'omd-browser-outside-'));
  try {
    writeFileSync(join(outside, 'product.js'), 'document.body.innerHTML = `<button id="submit">Submit order</button><p role="status">Order submitted</p>`;');
    writeFileSync(join(root, 'index.html'), '<!doctype html><html><body><script src="product.js"></script></body></html>');
    symlinkSync(join(outside, 'product.js'), join(root, 'product.js'));

    await assert.rejects(
      () => runTrustedBrowserEvaluation({
        ...request(root, 'index.html', hash('untrusted-symlink-tree')),
      }),
      /served dependency is a symlink|TRUSTED_BROWSER_PRODUCTION_REVISION_MISMATCH/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('caller-authored browser receipt fails closed', () => {
  assert.throws(
    () => requireTrustedBrowserEvaluation({
      receipt: {},
      receiptSha256: sha('f'),
      actionLog: [],
    }),
    /UNAUTHORIZED_TRUSTED_BROWSER_RECEIPT/,
  );
});
