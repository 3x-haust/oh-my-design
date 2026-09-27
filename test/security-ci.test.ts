import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { parse } from 'yaml';

test('Figma credential preflight distinguishes missing/present without exposing the value', () => {
  const cli = new URL('../bin/omd.mjs', import.meta.url);
  const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'FIGMA_TOKEN'));
  for (const value of [undefined, '', '   ', randomUUID()]) {
    const result = spawnSync(process.execPath, [cli.pathname, 'doctor'], {
      env: value === undefined ? baseEnv : { ...baseEnv, FIGMA_TOKEN: value },
      encoding: 'utf8',
      timeout: 20_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const line = result.stdout.split('\n').find(candidate => candidate.includes('FIGMA_TOKEN'));
    assert.ok(line, 'omd doctor must report Figma credential presence');
    assert.match(line, value?.trim() ? /\(set\)$/ : /\(not set /);
    if (value?.trim()) assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('security CI retains score/severity gates and requires the Cisco scanner', () => {
  const workflow = parse(readFileSync(new URL('../.github/workflows/plugin-security-scan.yml', import.meta.url), 'utf8'));
  const steps = workflow.jobs.scan.steps;
  const scanner = steps.find((step: { uses?: string }) => step.uses?.startsWith('hashgraph-online/ai-plugin-scanner-action@'));
  assert.ok(scanner);
  assert.match(scanner.uses, /@[a-f0-9]{40}$/);
  assert.equal(scanner.with.min_score, 80);
  assert.equal(scanner.with.fail_on_severity, 'high');
  assert.equal(scanner.with.install_cisco, true);
  assert.equal(scanner.with.cisco_skill_scan, 'on');
  assert.equal(scanner['continue-on-error'], undefined);
  assert.equal(scanner.with.baseline, undefined);
});
