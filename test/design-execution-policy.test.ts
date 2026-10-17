import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureDesignExecutionPolicy, parseDesignExecutionPolicy } from '../core/config/design-execution.ts';

test('normal execution is autonomous without developer configuration', () => {
  const policy = captureDesignExecutionPolicy({});
  assert.equal(policy.mode, 'autonomous');
  assert.equal(policy.selectionActor, 'harness');
  assert.equal(policy.designQuestions, false);
  assert.equal(policy.criteriaVersion, 'model-led-design-v1');
});

test('structured workflow is an explicit host choice, shared by both design modes', () => {
  for (const mode of ['autonomous', 'developer-evaluation']) {
    const direct = captureDesignExecutionPolicy({ OMD_DESIGN_MODE: mode });
    const structured = captureDesignExecutionPolicy({ OMD_DESIGN_MODE: mode, OMD_DESIGN_WORKFLOW: 'structured' });
    assert.equal(direct.criteriaVersion, 'model-led-design-v1');
    assert.equal(structured.criteriaVersion, 'autonomous-design-v1');
    assert.equal(structured.mode, direct.mode);
    assert.equal(structured.designQuestions, direct.designQuestions);
    assert.deepEqual(parseDesignExecutionPolicy(structured), structured);
  }
  assert.throws(() => captureDesignExecutionPolicy({ OMD_DESIGN_WORKFLOW: 'ignore-results' }));
});

test('historical signed policies retain their structured execution contract', () => {
  const historical = {
    mode: 'autonomous', selectionActor: 'harness', designQuestions: false,
    criteriaVersion: 'autonomous-design-v1',
  };
  assert.deepEqual(parseDesignExecutionPolicy(historical), historical);
  assert.throws(() => parseDesignExecutionPolicy({ ...historical, criteriaVersion: 'anything-goes' }));
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
