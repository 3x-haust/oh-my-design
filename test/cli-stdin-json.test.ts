import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const requirements = { schema: 'functional-requirements-v1', requirements: [
  { id: 'R-1', kind: 'action', statement: 'Confirm entered details locally', label: '입력 내용 확인' },
] };
const acquisition = {
  schema: 'reference-acquisition-plan-v2', owner: 'omd-framer', localeContextSha256: null,
  zones: [{
    id: 'service-action', kind: 'section', job: 'Relate a service to an inquiry action', required: true,
    decisionId: 'service-inquiry', question: 'How does the service overview expose an inquiry action?',
    axes: ['structure'], requiredState: 'service overview with an inquiry link visible',
    viewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }],
    falsifier: 'The inquiry action is detached from the service it concerns.',
  }],
};

function project(t: { after(callback: () => void): void }): string {
  const root = mkdtempSync(join(tmpdir(), 'omd-stdin-json-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const run = (root: string, args: string[], input: string) => spawnSync(process.execPath, [cli, ...args], {
  cwd: root, encoding: 'utf8', input,
});

test('acquisition publisher accepts v2 JSON from stdin without an input file', t => {
  const root = project(t);
  const result = run(root, ['acquisition', 'set', '--input', '-'], JSON.stringify(acquisition, null, 2));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(root, '.omd/acquisition-plan.json'), 'utf8')), acquisition);
  assert.deepEqual(readdirSync(root), ['.omd']);
});

test('complete publisher accepts multiline Korean JSON from stdin', t => {
  const root = project(t);
  const result = run(root, ['complete', 'set', '--input', '-', '--json'], JSON.stringify(requirements, null, 2));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).requirements, 1);
  assert.deepEqual(JSON.parse(readFileSync(join(root, '.omd/functional-requirements.json'), 'utf8')), requirements);
  assert.deepEqual(readdirSync(root), ['.omd']);
});

test('malformed stdin JSON and invalid schema cannot publish a record', t => {
  const root = project(t);
  for (const input of ['{"schema":', JSON.stringify({ ...acquisition, zones: [] })]) {
    const result = run(root, ['acquisition', 'set', '--input', '-'], input);
    assert.equal(result.status, 1);
    assert.equal(existsSync(join(root, '.omd/acquisition-plan.json')), false);
  }
});

test('stdin does not remove the publisher activation check', t => {
  const root = project(t);
  const activation = join(root, 'invalid-activation.json');
  writeFileSync(activation, '{}');
  const result = run(root, ['complete', 'set', '--input', '-', '--activation', activation], JSON.stringify(requirements));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invocation|activation/i);
  assert.equal(existsSync(join(root, '.omd/functional-requirements.json')), false);
});

test('invalid completion payload cannot overwrite an existing published record', t => {
  const root = project(t);
  const args = ['complete', 'set', '--input', '-'];
  assert.equal(run(root, args, JSON.stringify(requirements)).status, 0);
  const path = join(root, '.omd/functional-requirements.json');
  const before = readFileSync(path);
  const invalid = { ...requirements, requirements: [{ ...requirements.requirements[0], kind: 'wish' }] };
  const result = run(root, args, JSON.stringify(invalid));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FUNCTIONAL_REQUIREMENTS_INVALID/);
  assert.deepEqual(readFileSync(path), before);
});

test('an explicit file path remains distinct from the stdin sentinel', t => {
  const root = project(t);
  writeFileSync(join(root, '-'), JSON.stringify(requirements));
  const result = run(root, ['complete', 'set', '--input', './-'], 'not JSON');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(root, '.omd/functional-requirements.json'), 'utf8')), requirements);
});

test('framer instructions expose stdin transport without permitting direct record writes', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/agents/framer.agent.yaml', import.meta.url)), 'utf8');
  assert.match(source, /For `omd acquisition set` and `omd complete set`, pass your JSON with `--input -`/);
  assert.match(source, /Never use a patch or file-write/);
  assert.match(source, /publisher still validates the schema and write authority/);
  assert.match(source, /coordinator must not reconstruct or author your payload/);
});
