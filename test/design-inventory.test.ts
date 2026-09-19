import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { collectDesignInventory, cssObservations, designInventoryStatus, initializeDesignInventory, DESIGN_INVENTORY_PATH } from '../core/tokens/inventory.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { buildBrief, formatBrief } from '../core/brief/index.ts';
import omdExtension, { type PortablePiTool } from '../extensions/omd.ts';

const CSS = `/* existing service */
:root { --brand: #234; --space: 8px; --action: var(--brand); }
[data-theme="dark"] { --brand: #abc; }
@media (max-width: 600px) { .button { padding: var(--space); border-radius: 12px; } }
.button:hover { box-shadow: 0 2px 4px #0003; }
.literal { font-family: "A;{B}"; background: url("data:image/svg+xml;<svg>{}</svg>"); }
`;

function fixture(t: { after(fn: () => void): void }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-init-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/theme.css'), CSS);
  return root;
}

test('init extracts aliases, theme/viewport scopes and source positions without flattening them', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'design.tokens.json'), JSON.stringify({ palette: { $type: 'color', brand: { $value: '#123456' }, action: { $value: '{palette.brand}' } } }));
  const inventory = collectDesignInventory(root);
  assert.equal(inventory.authority, 'observed-not-approved');
  assert.equal(inventory.sources.length, 2);
  assert.deepEqual(inventory.observations.filter(item => item.name === '--brand').map(item => [item.value, item.scope]), [['#234', [':root']], ['#abc', ['[data-theme="dark"]']]]);
  const padding = inventory.observations.find(item => item.name === 'padding')!;
  assert.deepEqual(padding.scope, ['@media (max-width: 600px)', '.button']);
  assert.equal(padding.value, 'var(--space)');
  assert.equal(padding.location, 'line:4');
  const token = inventory.observations.find(item => item.name === 'palette.action')!;
  assert.equal(token.value, '{palette.brand}');
  assert.equal(token.type, 'color');
  assert.equal(token.location, 'json:/palette/action/$value');
  assert.equal(inventory.observations.find(item => item.name === 'font-family')?.value, '"A;{B}"');
  assert.throws(() => cssObservations(':root { --a: 1', 'bad.css'), /incomplete/);
});

test('inventory skips hidden/dependency/symlink sources and exposes unsupported inputs, never executing config', t => {
  const root = fixture(t);
  mkdirSync(join(root, 'node_modules'));
  writeFileSync(join(root, 'node_modules/hidden.css'), ':root{--leak:1}');
  writeFileSync(join(root, '.secret.css'), ':root{--secret:1}');
  writeFileSync(join(root, 'theme.scss'), '$brand: red;');
  writeFileSync(join(root, 'tailwind.config.ts'), `require('node:fs').writeFileSync('EXECUTED', 'bad');`);
  writeFileSync(join(root, 'src/Button.tsx'), '<button className="bg-brand"/>');
  writeFileSync(join(root, 'empty.css'), '.a { display: block; }');
  writeFileSync(join(root, 'bad.css'), '.a {');
  symlinkSync(join(root, '.secret.css'), join(root, 'linked.css'));
  const inventory = collectDesignInventory(root);
  assert.equal(existsSync(join(root, 'EXECUTED')), false);
  assert.equal(inventory.observations.some(item => ['--leak', '--secret'].includes(item.name)), false);
  assert.deepEqual(inventory.components, ['src/Button.tsx']);
  for (const name of ['theme.scss', 'tailwind.config.ts', 'src/Button.tsx', 'empty.css', 'bad.css', 'linked.css']) assert.ok(inventory.gaps.some(gap => gap.path === name), name);
});

test('reruns are deterministic, refresh detects added/changed/deleted sources and preserves authored rules and app', t => {
  const root = fixture(t), writer = createTestProjectWriteAdapter(root);
  writer.write('.omd/tokens.json', 'approved token contract');
  writer.write('.omd/design-system-decisions.md', 'Keep the existing brand');
  const first = initializeDesignInventory(root, writer);
  assert.deepEqual(initializeDesignInventory(root, writer), first);
  assert.equal(designInventoryStatus(root).status, 'current');
  assert.equal(readFileSync(join(root, 'src/theme.css'), 'utf8'), CSS);
  writeFileSync(join(root, 'added.css'), ':root{--new:16px}');
  assert.equal(designInventoryStatus(root).status, 'stale');
  assert.throws(() => initializeDesignInventory(root, writer), /STALE/);
  initializeDesignInventory(root, writer, true);
  assert.equal(designInventoryStatus(root).status, 'current');
  writeFileSync(join(root, 'added.css'), ':root{--new:20px}');
  assert.equal(designInventoryStatus(root).status, 'stale');
  initializeDesignInventory(root, writer, true);
  rmSync(join(root, 'added.css'));
  assert.equal(designInventoryStatus(root).status, 'stale');
  initializeDesignInventory(root, writer, true);
  assert.equal(readFileSync(join(root, '.omd/tokens.json'), 'utf8'), 'approved token contract');
  assert.equal(readFileSync(join(root, '.omd/design-system-decisions.md'), 'utf8'), 'Keep the existing brand');
});

test('future briefs consume current inventory and warn/block stale observations, never treating it as approval', t => {
  const root = fixture(t);
  const writer = createTestProjectWriteAdapter(root);
  initializeDesignInventory(root, writer);
  writer.write('.omd/design-system-decisions.md', 'Keep compact controls');
  const brief = buildBrief(root, 'production');
  assert.equal(brief.existingDesignSystem?.status, 'current');
  assert.ok(brief.prior.includes(DESIGN_INVENTORY_PATH));
  assert.ok(brief.prior.includes('.omd/design-system-decisions.md'));
  assert.match(formatBrief(brief), /Observed, not approved/);
  writeFileSync(join(root, 'src/theme.css'), ':root { --brand: red; }');
  const stale = buildBrief(root, 'production');
  assert.ok(stale.blockers.some(item => item.includes('inventory stale')));
  assert.ok(!stale.prior.includes(DESIGN_INVENTORY_PATH));
});

test('unrecognized or symlink snapshots cannot be overwritten', t => {
  const root = fixture(t), writer = createTestProjectWriteAdapter(root);
  writer.write(DESIGN_INVENTORY_PATH, '{"schema":"user-owned"}');
  assert.throws(() => initializeDesignInventory(root, writer, true), /UNOWNED/);
  rmSync(join(root, DESIGN_INVENTORY_PATH));
  symlinkSync(join(root, 'src/theme.css'), join(root, DESIGN_INVENTORY_PATH));
  assert.equal(designInventoryStatus(root).status, 'invalid');
  assert.throws(() => initializeDesignInventory(root, writer, true));
  assert.equal(readFileSync(join(root, 'src/theme.css'), 'utf8'), CSS);
});

test('Pi tool supports init/check/refresh without external activation', async t => {
  const root = fixture(t);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_TEST_CONTEXT'));
  let tool!: PortablePiTool;
  omdExtension({ registerCommand() {}, registerTool(value) { tool = value; }, async exec(_command, args, options) {
    const result = spawnSync(process.execPath, [...args], { cwd: options.cwd, encoding: 'utf8', env, timeout: 20000 });
    return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', code: result.status ?? 1, killed: result.signal !== null };
  } });
  const run = (args: string[]) => tool.execute('init-test', { args }, undefined, undefined, { cwd: root });
  await assert.rejects(run(['init', '--check', '--json']), /missing/);
  assert.equal(JSON.parse((await run(['init', '--json'])).content[0]!.text).status, 'current');
  await run(['init', '--check', '--json']);
  writeFileSync(join(root, 'src/theme.css'), ':root { --brand: red; }');
  await assert.rejects(run(['init', '--json']), /STALE/);
  assert.equal(JSON.parse((await run(['init', '--refresh', '--json'])).content[0]!.text).status, 'current');
});
