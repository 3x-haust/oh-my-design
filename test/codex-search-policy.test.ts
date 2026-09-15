import assert from 'node:assert/strict';
import test from 'node:test';
import { codexDiscoverySearchArguments, codexDiscoverySearchPolicy } from '../adapters/codex-search-policy.ts';

test('discovery requests live native search by default without selecting a model', () => {
  const policy = codexDiscoverySearchPolicy(['exec', '-C', '/project', '-'], {});
  assert.deepEqual(policy, { mode: 'live', source: 'omd-discovery-default' });
  assert.deepEqual(codexDiscoverySearchArguments(policy), ['-c', 'web_search="live"']);
  assert.ok(Object.isFrozen(policy));
});

test('explicit host search configuration is not silently enabled or escalated', () => {
  for (const mode of ['disabled', 'cached', 'live'] as const) {
    const config = Object.freeze({ web_search: mode, model: 'user-model' });
    const policy = codexDiscoverySearchPolicy(['exec', '-'], config);
    assert.deepEqual(policy, { mode, source: 'host-config' });
    assert.deepEqual(codexDiscoverySearchArguments(policy), ['-c', `web_search=${JSON.stringify(mode)}`]);
    assert.equal(config.model, 'user-model');
    assert.equal(config.web_search, mode);
  }
});

test('host invocation search flags are bound before role delegation', () => {
  for (const args of [['--search'], ['-c', 'web_search="live"'], ['--config=web_search="live"'], ['-cweb_search="live"']]) {
    assert.deepEqual(codexDiscoverySearchPolicy(['exec', ...args, '-'], { web_search: 'disabled' }), {
      mode: 'live', source: 'host-argument',
    });
  }
  assert.deepEqual(codexDiscoverySearchPolicy(['exec', '-c', 'web_search="disabled"', '-'], {}), {
    mode: 'disabled', source: 'host-argument',
  });
  assert.throws(() => codexDiscoverySearchPolicy(['exec', '--search', '-c', 'web_search="disabled"', '-'], {}), /AMBIGUOUS/);
  assert.throws(() => codexDiscoverySearchPolicy(['exec', '-c', 'web_search="maybe"', '-'], {}), /INVALID/);
  assert.throws(() => codexDiscoverySearchPolicy(['exec', '-'], { web_search: true }), /INVALID/);
});

test('unknown project and profile layering retains inherited policy rather than guessing an override', () => {
  for (const policy of [
    codexDiscoverySearchPolicy(['exec', '--profile', 'work', '-'], {}),
    codexDiscoverySearchPolicy(['exec', '-p', 'work', '-'], {}),
    codexDiscoverySearchPolicy(['exec', '--profile=work', '-'], {}),
    codexDiscoverySearchPolicy(['exec', '-'], { profile: 'work' }),
    codexDiscoverySearchPolicy(['exec', '-'], {}, true),
  ]) {
    assert.deepEqual(policy, { mode: 'inherit', source: 'layered-host-config' });
    assert.deepEqual(codexDiscoverySearchArguments(policy), []);
  }
  assert.equal(codexDiscoverySearchPolicy(['exec', '--search', '-'], {}, true).mode, 'live');
});

test('prompt text after the option terminator cannot change search policy', () => {
  assert.equal(codexDiscoverySearchPolicy(['exec', '--', '--search'], { web_search: 'disabled' }).mode, 'disabled');
  assert.equal(codexDiscoverySearchPolicy(['exec', '-c', 'developer_instructions="web_search=disabled"', '-'], {}).mode, 'live');
});
