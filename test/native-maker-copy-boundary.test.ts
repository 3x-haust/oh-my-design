import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMakerHandback, type MakerBindings } from '../adapters/pi-maker-contract.ts';
import { trustedLifecyclePng } from './helpers/trusted-lifecycle-png.ts';

const bindings: MakerBindings = {
  buildSha256: 'a'.repeat(64), briefSha256: 'b'.repeat(64), routeSha256: 'c'.repeat(64),
  baselineSha256: 'd'.repeat(64), evidenceSha256: 'e'.repeat(64), role: 'omd-hand',
  firstRenderReviewSha256: null, candidateSelectionSha256: null, compositionSha256: null,
};
const original = trustedLifecyclePng('390x844').toString('base64');
const expected = { bindings, paths: ['index.html'], referenceImages: [original] };

for (const content of [
  `<img src="data:image/png;base64,${original}">`,
  `<script>const reference = atob("${original}");</script>`,
]) {
  test('maker handback rejects shipping a supplied observation image', () => {
    assert.throws(() => parseMakerHandback({
      schema: 'native-maker-handback-v1', fixedBindings: bindings,
      files: [{ path: 'index.html', content }],
    }, expected), /reference-image-shipping-forbidden/);
  });
}

test('maker handback permits first-party source without supplied reference bytes', () => {
  const content = '<main><h1>문의함</h1><button>해결 처리</button></main>';
  assert.equal(parseMakerHandback({
    schema: 'native-maker-handback-v1', fixedBindings: bindings,
    files: [{ path: 'index.html', content }],
  }, expected).files[0]?.content, content);
});
