import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { makeNativeSource } from '../core/runtime/native-maker.ts';
import { PiReviewerError } from '../adapters/pi-reviewer-contract.ts';
import { fixture } from './helpers/native-maker.ts';

test('maker preserves large evidence through registered tool output projection', async t => {
  // Given a source packet large enough to trigger the observed host text projection.
  const context = fixture(t, 'provider-projection');
  writeFileSync(join(context.root, 'src/copy/confirmation.ts'),
    `export const confirmation = ${JSON.stringify('complete source '.repeat(10_000))};`);
  // When the real bridge registration, MCP consumption and provider hook run in the RPC child.
  const result = await makeNativeSource(context);
  // Then complete, parseable evidence reaches the maker and its publication succeeds.
  assert.equal(result.receipt.provider, 'chatgpt-subscription');
  assert.equal(result.receipt.role, 'omd-hand');
  assert.deepEqual(result.paths, context.input.paths);
});

test('maker reports the rejected extension event without publishing source', async t => {
  const context = fixture(t, 'maker-extension-error');
  const path = join(context.root, 'src/copy/confirmation.ts');
  const before = readFileSync(path, 'utf8');
  await assert.rejects(makeNativeSource(context),
    error => error instanceof PiReviewerError && error.code === 'maker-child-context-or-extension-failure'
      && /before_provider_request.*fixture-evidence-drift/.test(error.message));
  assert.equal(readFileSync(path, 'utf8'), before);
  assert.equal(existsSync(join(context.root, '.omd/makers/current/hand.json')), false);
});
