import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runModelLedCompletion } from '../bin/model-led-completion-command.ts';
import { publishAdaptiveRoute } from '../core/route/adaptive-route-persistence.ts';
import { createModelLedRouteContext, modelLedInput } from './helpers/model-led.ts';

const packRoot = fileURLToPath(new URL('../core', import.meta.url));

test('a Figma-targeted route refuses before final evidence without requiring a consulted primary original', async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-model-led-figma-completion-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const request = 'Build this frame exactly: https://www.figma.com/design/AbC123xyz/Booking?node-id=1-2';
  const input = modelLedInput(request);
  const { invocation, writer } = createModelLedRouteContext(root, request);
  publishAdaptiveRoute(root, input, writer, invocation);

  const result = await runModelLedCompletion({ root, packRoot, invocation });

  assert.equal(result.ok, false);
  assert.equal(result.phase, 'authority');
  assert.equal(result.diagnostic?.code, 'FIGMA_TARGET_NOT_PROVEN');
  assert.match(result.diagnostic?.message ?? '', /FIGMA_SNAPSHOT_MISSING/);
  assert.doesNotMatch(result.diagnostic?.message ?? '', /CONSULTED_PRIMARY_ORIGINAL_REQUIRED/);
  assert.equal(existsSync(join(root, '.omd/observation-v2.json')), false);
  assert.equal(existsSync(join(root, '.omd/final-review/native-current.json')), false);
  assert.equal(existsSync(join(root, '.omd/final-evidence-v2.json')), false);
});
