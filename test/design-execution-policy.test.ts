import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureDesignExecutionPolicy, parseDesignExecutionPolicy } from '../core/config/design-execution.ts';

test('normal execution is autonomous without developer configuration', () => {
  const policy = captureDesignExecutionPolicy({});
  assert.equal(policy.mode, 'autonomous');
  assert.equal(policy.selectionActor, 'harness');
  assert.equal(policy.designQuestions, false);
});

test('only the exact host setting enables developer evaluation', () => {
  const environment = { OMD_DESIGN_MODE: 'developer-evaluation' };
  const policy = captureDesignExecutionPolicy(environment);
  environment.OMD_DESIGN_MODE = 'autonomous';
  assert.equal(policy.mode, 'developer-evaluation');
  assert.equal(policy.designQuestions, true);
  assert.throws(() => captureDesignExecutionPolicy({ OMD_DESIGN_MODE: 'ask-user' }));
});

test('serialized execution policy rejects forged approval and unexpected fields', () => {
  const policy = captureDesignExecutionPolicy({});
  assert.deepEqual(parseDesignExecutionPolicy(JSON.parse(JSON.stringify(policy))), policy);
  assert.throws(() => parseDesignExecutionPolicy({ ...policy, selectionActor: 'user' }));
  assert.throws(() => parseDesignExecutionPolicy({ ...policy, designQuestions: true }));
  assert.throws(() => parseDesignExecutionPolicy({ ...policy, approved: true }));
});
