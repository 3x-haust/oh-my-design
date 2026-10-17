import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Violation } from '../core/types.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/ir.raw.json', import.meta.url));
const PROBE_FIXTURE = fileURLToPath(new URL('./fixtures/probe.html', import.meta.url));
const run = (args: string[], cwd?: string) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...(cwd ? { cwd } : {}) });
const project = (): string => mkdtempSync(join(tmpdir(), 'omd-cli-'));

test('omd check exits 1 when violations exist and emits JSON on request', () => {
  const text = run(['check', '--ir', FIXTURE], project());
  assert.equal(text.status, 1);
  assert.match(text.stdout, /CONTRAST-001/);
  const parsed = JSON.parse(run(['check', '--ir', FIXTURE, '--json'], project()).stdout) as Violation[];
  assert.ok(parsed.length > 0);
  assert.ok(parsed.every(value => value.id && value.nodeId && value.path && value.severity && value.category));
});

test('omd check exits 0 on a clean IR', () => {
  const dir = project();
  const clean = join(dir, 'clean.json');
  writeFileSync(clean, JSON.stringify({ meta: {}, tokens: {}, nodes: [] }));
  assert.equal(run(['check', '--ir', clean], dir).status, 0);
});

test('omd probe uses the durable default plan and writes a disposable result', () => {
  const dir = project();
  mkdirSync(join(dir, '.omd', 'probes'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'probes', 'primary.json'), JSON.stringify({
    name: 'primary',
    destructive: false,
    steps: [{ action: 'click', selector: '#toggle', expect: [{ type: 'visible', selector: '#panel' }] }],
  }));
  const result = run(['probe', PROBE_FIXTURE, '--json'], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((JSON.parse(result.stdout) as { warnings: unknown[] }).warnings, []);
  assert.ok(existsSync(join(dir, '.omd', '.cache', 'probes', 'primary.json')));
});

test('version, help, unknown commands, and typo suggestions use the retained surface', () => {
  assert.equal(run(['--version']).status, 0);
  const help = run(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /lifecycle help\|verify\|finish/);
  assert.match(help.stdout, /learn predict\|judge\|observe/);
  assert.match(help.stdout, /ai-judgment publish/);
  assert.equal(help.stderr, '');
  assert.notEqual(run(['nonsense-command']).status, 0);
  const typo = run(['lern']);
  assert.equal(typo.status, 1);
  assert.match(typo.stderr, /did you mean: omd learn\?/);
});

test('omd pack exposes the installed pack and refuses missing input', () => {
  const directory = run(['pack', 'dir']);
  assert.equal(directory.status, 0);
  const printed = directory.stdout.trim();
  assert.ok(existsSync(printed));
  assert.ok(printed.endsWith('core'));

  const list = run(['pack', 'list']);
  assert.equal(list.status, 0);
  const lines = list.stdout.trim().split('\n').filter(Boolean);
  assert.ok(lines.length > 0);
  assert.ok(lines.every(line => line.endsWith('.md')));

  const file = run(['pack', 'theory/color.md']);
  assert.equal(file.status, 0);
  assert.ok(file.stdout.length > 0);
  assert.notEqual(run(['pack']).status, 0);
  assert.notEqual(run(['pack', 'theory/does-not-exist.md']).status, 0);
});
