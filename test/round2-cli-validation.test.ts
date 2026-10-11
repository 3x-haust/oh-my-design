import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { diagnoseAdaptiveRouteInput } from '../core/route/adaptive-flow.ts';
import { diagnoseFrameInput } from '../core/frame/input.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { closestNames } from '../core/schema/suggestions.ts';
import { RepairLoop } from '../extensions/omd-repair-progress.ts';
import { guardFailure, omdCliBudgetMs } from '../extensions/omd-runtime.ts';

test('route reports independent strategy field errors without publishing or inventing parents', () => {
  const route = structuredClone(inputSkeleton('route-input').skeleton) as { strategyDecision: { skips: { reason: string }[]; roles: string[]; executionWaves: unknown } };
  route.strategyDecision.skips[0]!.reason = '';
  route.strategyDecision.roles.push(route.strategyDecision.roles[0]!);
  route.strategyDecision.executionWaves = 'invalid';
  const diagnostics = diagnoseAdaptiveRouteInput(route);
  assert.ok(diagnostics.some(d => d.code === 'ADAPTIVE_SKIP_REASON_REQUIRED' && d.path.includes('skips')));
  assert.ok(diagnostics.some(d => d.code === 'ADAPTIVE_STRATEGY_DUPLICATE' && d.path.includes('roles')));
  assert.ok(diagnostics.some(d => d.path.includes('executionWaves')));
});

test('frame reports independent invalid facts and matrix without writing', () => {
  const frame = structuredClone(inputSkeleton('frame').skeleton) as Record<string, unknown>;
  frame.uxSurface = 'product';
  frame.taskCoverageMatrix = 'broken matrix';
  frame.entrySurface = { schema: 'entry-surface-contract-v1', entryPath: '', purposeText: '',
    prerequisiteTaskId: '?', dependentTaskId: 'T2', workObjectAnchorText: 'anchor',
    nextActionName: null, beforeText: 'before', afterText: 'after', outcomeWitnesses: [] };
  frame.reality = { schema: 'reality-ledger-v1', mode: 'greenfield', facts: [
    { category: 'wrong', status: 'supplied', statement: 'fact' },
    { category: 'subject', status: 'wrong', statement: 'fact' },
  ] };
  const diagnostics = diagnoseFrameInput(frame);
  assert.ok(diagnostics.some(d => d.path === 'reality.facts[0]'));
  assert.ok(diagnostics.some(d => d.path === 'reality.facts[1]'));
  assert.ok(diagnostics.some(d => d.path === 'taskCoverageMatrix'));
  assert.ok(diagnostics.some(d => d.path === 'entrySurface.entryPath'));
  assert.ok(diagnostics.some(d => d.path === 'entrySurface.purposeText'));
});

test('schema typos suggest names and no nonexistent scout schema', () => {
  assert.deepEqual(closestNames('rout', ['route', 'frame', 'domain']), ['route']);
  assert.throws(() => inputSkeleton('scout'), /brief scout/);
  assert.equal(inputSkeleton('reference-search-leads').skeleton !== undefined, true);
});

test('lead publication refuses a missing route without writing a project record', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-leads-no-route-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(join(cwd, 'leads.json'), JSON.stringify({ schema: 'reference-search-leads-v1', lane: 'domain',
    query: 'local service', urls: [], provider: 'host', tool: 'web_search', observedAt: '2026-09-28T00:00:00.000Z' }));
  const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'ref', 'leads', 'add', '--input', 'leads.json', '--json'], { cwd, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ROUTE_UNCLASSIFIED/);
  assert.deepEqual(readdirSync(cwd), ['leads.json']);
});

test('browser setup requires explicit consent before any profile or project write', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-browser-no-consent-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'browser', 'setup', '--sites', 'https://mobbin.com/'], { cwd, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OMD_BROWSER_SETUP_CONSENT_REQUIRED/);
  assert.deepEqual(readdirSync(cwd), []);
  const invalid = spawnSync(process.execPath, [cli, 'browser', 'login', '--consent', '--sites', 'http://127.0.0.1/'], { cwd, encoding: 'utf8' });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /REFERENCE_BROWSER_CONFIG_INVALID/);
  assert.deepEqual(readdirSync(cwd), []);
});

test('headed consent setup budget exceeds the bounded login window', () => {
  assert.ok(omdCliBudgetMs(['browser', 'setup', '--consent']) > 600_000);
});

test('structured publisher diagnostics retain independent paths and codes', () => {
  const result = guardFailure(new Error(`OMD_CLI_FAILED (1): ${JSON.stringify({ diagnostics: [
    { path: 'reality.facts[0]', code: 'FRAME_INPUT_INVALID', message: 'category invalid' },
    { path: 'reality.facts[1]', code: 'FRAME_INPUT_INVALID', message: 'status invalid' },
  ] })}`));
  assert.equal(result.repairable, true);
  assert.match(result.summary, /reality\.facts\[0\].*FRAME_INPUT_INVALID/);
  assert.match(result.summary, /reality\.facts\[1\].*FRAME_INPUT_INVALID/);
});

test('three completed no-progress repairs stop regardless of work digest or route replacement', () => {
  const loop = new RepairLoop();
  assert.equal(loop.next('project', 'stage', 'selected-run', { work: 'a' }, 1, ['stage:domain']).retry, true);
  assert.equal(loop.next('project', 'stage', 'selected-run', { work: 'b' }, 2, ['stage:domain']).retry, true);
  assert.equal(loop.next('project', 'stage', 'selected-run', { work: 'c' }, 3, ['stage:domain']).retry, true);
  assert.equal(loop.next('project', 'stage', 'selected-run', { work: 'd' }, 4, ['stage:domain']).stalled, true);
  loop.delete('project');
  assert.equal(loop.next('project', 'stage', 'selected-run', null, 0, []).retry, true);
  loop.next('project', 'stage', 'selected-run', null, 0, []);
  assert.equal(loop.next('project', 'stage', 'selected-run', null, 0, ['observation:new']).retry, true);
  assert.equal(loop.next('project', 'stage', 'selected-run', null, 0, ['observation:new']).retry, true);
});
