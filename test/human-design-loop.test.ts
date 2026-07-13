import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage } from '../core/render/index.ts';
import { readProbePlan, runProbe, type ProbePlan } from '../core/probe/index.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/probe.html', import.meta.url));
const temp = (): string => mkdtempSync(join(tmpdir(), 'omd-loop-'));

test('normal and squint renders both exist and differ at desktop and mobile', async () => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const dir = temp();
    const normal = join(dir, `normal-${viewport.width}.png`);
    const squint = join(dir, `squint-${viewport.width}.png`);
    await renderPage(fixture, { viewport, out: normal });
    await renderPage(fixture, { viewport, out: squint, squint: true });
    assert.ok(existsSync(normal) && existsSync(squint));
    assert.notDeepEqual(readFileSync(normal), readFileSync(squint));
  }
});

test('probe warns only from declared expectations and expected tab order', async () => {
  await assert.rejects(
    runProbe(fixture, { name: 'unsafe', destructive: false, steps: [{ action: 'click', selector: '#toggle' }] }),
    /at least one declared expectation/,
  );

  const expected = await runProbe(fixture, {
    name: 'path', destructive: false, expectedTabOrder: ['#toggle', '#name'],
    steps: [
      { action: 'click', selector: '#toggle', expect: [{ type: 'visible', selector: '#panel' }] },
      { action: 'fill', selector: '#name', value: 'Ada', expect: [{ type: 'attribute', selector: '#name', name: 'value', value: 'Ada' }] },
    ],
  });
  assert.deepEqual(expected.warnings, []);

  const pressed = await runProbe(fixture, {
    name: 'keyboard', destructive: false,
    steps: [{ action: 'press', selector: '#toggle', key: 'Enter', expect: [{ type: 'visible', selector: '#panel' }] }],
  });
  assert.deepEqual(pressed.warnings, []);

  const wrong = await runProbe(fixture, {
    name: 'wrong', destructive: false, expectedTabOrder: ['#name'],
    steps: [{ action: 'click', selector: '#toggle', expect: [{ type: 'hidden', selector: '#panel' }] }],
  });
  assert.deepEqual(new Set(wrong.warnings.map((warning) => warning.id)), new Set(['PROBE-TAB-DISORDER', 'PROBE-DEAD-CONTROL']));
});

test('probe plan rejects destructive, credential, and unsupported actions', () => {
  const dir = temp();
  const path = join(dir, 'plan.json');
  writeFileSync(path, JSON.stringify({ name: 'bad', destructive: true, steps: [] }));
  assert.throws(() => readProbePlan(path), /destructive:false/);
  writeFileSync(path, JSON.stringify({ name: 'bad', destructive: false, auth: {}, steps: [] }));
  assert.throws(() => readProbePlan(path), /authenticated/);
  writeFileSync(path, JSON.stringify({ name: 'bad', destructive: false, steps: [{ action: 'delete', selector: '#x' }] }));
  assert.throws(() => readProbePlan(path), /unsafe probe action/);
});

test('runProbe validates direct API plans fail-closed before browser execution', async () => {
  const invalid = (value: unknown): Promise<unknown> => runProbe(fixture, value as ProbePlan);
  await assert.rejects(invalid({ name: 'bad', destructive: true, steps: [] }), /destructive:false/);
  await assert.rejects(invalid({ name: 'bad', destructive: false, auth: {}, steps: [] }), /authenticated/);
  await assert.rejects(invalid({ name: 'bad', destructive: false, steps: [{ action: 'delete', selector: '#toggle', expect: [{ type: 'visible', selector: '#panel' }] }] }), /unsafe probe action/);
  await assert.rejects(invalid({ name: 'bad', destructive: false, steps: [{ action: 'fill', selector: '#auth-token', value: 'x', expect: [{ type: 'visible', selector: '#panel' }] }] }), /credential/);
  await assert.rejects(invalid({ name: 'bad', destructive: false, steps: [{ action: 'press', key: 'Control+L', expect: [{ type: 'visible', selector: '#panel' }] }] }), /allowlist/);
  await assert.rejects(invalid({ name: 'bad', destructive: false, steps: [{ action: 'click', selector: '#toggle', expect: [{ type: 'visible' }] }] }), /selector/);
  await assert.rejects(invalid({ name: 'bad', destructive: false, steps: [{ action: 'click', selector: '#toggle' }] }), /declared expectation/);
});

test('probe refuses remote targets', async () => {
  await assert.rejects(runProbe('https://example.com', {
    name: 'remote', destructive: false,
    steps: [{ action: 'click', selector: '#x', expect: [{ type: 'visible', selector: '#y' }] }],
  }), /remote targets/);
});

test('prompt contract keeps content-first isolation and checkpoint defaults executable', () => {
  const protocol = readFileSync(join(root, 'core/protocol/human-design-loop.md'), 'utf8');
  const skill = readFileSync(join(root, 'src/skills/omd-ultradesign/SKILL.md'), 'utf8');
  const eye = readFileSync(join(root, 'src/agents/eye.agent.yaml'), 'utf8');
  const glance = readFileSync(join(root, 'src/agents/glance.agent.yaml'), 'utf8');
  const scout = readFileSync(join(root, 'src/agents/scout.agent.yaml'), 'utf8');
  const framer = readFileSync(join(root, 'src/agents/framer.agent.yaml'), 'utf8');
  for (const phrase of ['copy deck', 'sketch', 'squint glance', 'checkpoint: none']) assert.match(protocol, new RegExp(phrase));
  assert.ok(skill.indexOf('.omd/copy-deck.md') < skill.indexOf('omd-sketch'));
  assert.ok(skill.indexOf('--squint') < skill.indexOf('Now render sharp'));
  assert.match(skill, /showpiece only[\s\S]*exactly one dominant-technique lens/);
  assert.match(skill, /checkpoint: none[\s\S]*no approval waits/);
  assert.match(eye, /Never open[\s\S]*\.omd\/frame\.md/);
  assert.match(glance, /squint render paths and nothing else/);
  assert.match(scout, /domain, direct competitors, user\/community language,[\s\S]*every required component/);
  assert.match(framer, /current brief > explicit current user feedback > prior explicit project taste > agent/);
  for (const name of ['framer', 'scout', 'sketch', 'hand', 'eye']) {
    assert.match(readFileSync(join(root, `src/agents/${name}.agent.yaml`), 'utf8'), /Bash\(omd pack:\*\)/, `${name} needs pack permission`);
  }
  assert.match(readFileSync(join(root, 'core/install/install.ts'), 'utf8'), /'Bash\(omd pack:\*\)'/);
  const contract = protocol.replace(/\s+/g, ' ');
  for (const gate of [
    /copy deck[\s\S]*theory\/voice\.md[\s\S]*humanize/i,
    /before any animation code[\s\S]*\.omd\/motion-spec\.md[\s\S]*only its\s+declared scenes/i,
    /\.omd\/attribution\.md[\s\S]*tokens, motion, composition, and graphics/i,
    /craft\/finish-pass\.md[\s\S]*skipped item/i,
    /\.omd\/design\.md[\s\S]*omd design --check/i,
    /always run `omd ref distance <page>`[\s\S]*above `0\.6` does not ship/i,
    /\.omd\/target\/manifest\.json[\s\S]*bounded `omd target diff` repair loop/i,
    /multi-page output[\s\S]*omd check --site/i,
    /sharp desktop and mobile[\s\S]*filmstrip[\s\S]*humanize review[\s\S]*declared probe/i,
  ]) assert.match(contract, gate);
  assert.match(eye, /non-deterministic hierarchy[\s\S]*theory\/craft\.md[\s\S]*theory\/expressive\.md[\s\S]*craft\/finish-pass\.md/);
  assert.ok(existsSync(join(root, 'dist/codex/core/protocol/human-design-loop.md')));
  assert.ok(existsSync(join(root, 'dist/claude/core/protocol/human-design-loop.md')));
});
