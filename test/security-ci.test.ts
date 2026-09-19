import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import test from 'node:test';
import { parse } from 'yaml';

test('Figma credential preflight distinguishes missing/present without exposing the value', () => {
  const skill = readFileSync(new URL('../src/skills/omd-figma/SKILL.md', import.meta.url), 'utf8');
  const preflight = /```bash\nnode -e '([^']+)'\n```/.exec(skill);
  assert.ok(preflight, 'the documented presence check must be executable without shell expansion');
  for (const value of [undefined, '', '   ', randomUUID()]) {
    const result: SpawnSyncReturns<string> = spawnSync(process.execPath, ['-e', preflight[1]!], {
      env: value === undefined ? {} : { FIGMA_TOKEN: value },
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, value?.trim() ? 0 : 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
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
