import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { explicitDesignFeedback } from '../extensions/omd-feedback.ts';

test('real follow-up feedback is available before a first measurement exists', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-feedback-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.omd'));
  writeFileSync(join(root, '.omd/route.json'), '{}');
  const text = 'The current result is rejected. Rework its composition.';
  assert.deepEqual(explicitDesignFeedback(root, { source: 'rpc', text }), {
    text, command: 'omd feedback translate',
  });
  assert.equal(explicitDesignFeedback(root, { source: 'extension', text }), null);
  assert.equal(explicitDesignFeedback(root, { source: 'rpc', text: '  ' }), null);
  assert.equal(explicitDesignFeedback(root, {
    source: 'rpc', text: '/skill:omd-ultradesign',
  }), null);
});

test('a turn before any route exists is not repair feedback', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-feedback-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(explicitDesignFeedback(root, { source: 'interactive', text: 'Build this' }), null);
});
