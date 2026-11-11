import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { deadControls } from '../core/thin/check.ts';

test('the thin defect check names a control that does nothing and passes one that acts', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-thin-check-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const page = join(root, 'index.html');
  writeFileSync(page, `<!doctype html><html><body>
    <button>Order now</button>
    <button onclick="document.querySelector('p').textContent = 'ordered'">Toggle</button>
    <form><input required><button>Send</button></form>
    <p></p></body></html>`);
  assert.deepEqual(await deadControls(page), ['Order now']);
});
