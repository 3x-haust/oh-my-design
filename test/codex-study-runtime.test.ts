import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { codexStudyEntryError, codexStudyRestrictions, isCodexStudyDirectory } from '../adapters/codex-study-runtime.ts';
import { createCodexStudyDirectory } from '../adapters/codex-host-launcher.ts';
import { routeAdaptiveFlow } from '../core/route/adaptive-flow.ts';

function project(t: { after(fn: () => void): void }): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-study-test-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function studyRoute() {
  const input = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/synth-marketing.json', import.meta.url), 'utf8'));
  input.strategyDecision.roles.push('omd-study');
  input.strategyDecision.executionWaves.unshift({ id: 'provisional-study', mode: 'concurrent', roles: ['omd-study'] });
  return input;
}

test('host chooses unique real study leaves, not a caller-chosen project directory', (t) => {
  const root = project(t);
  const first = createCodexStudyDirectory(root);
  const second = createCodexStudyDirectory(root);
  assert.notEqual(first, second);
  assert.match(first, /^\.omd\/\.cache\/studies\/study-[A-Za-z0-9]{6}$/);
  assert.equal(isCodexStudyDirectory(root, first), true);
  assert.equal(isCodexStudyDirectory(root, second), true);
  for (const value of ['.', '.omd', '.omd/.cache/studies', '../production', join(root, first), `${first}/../other`, null]) {
    assert.equal(isCodexStudyDirectory(root, value), false, String(value));
  }
  assert.equal(isCodexStudyDirectory(project(t), first), false);
});

test('a symlinked study ancestor cannot redirect the host grant', (t) => {
  const root = project(t);
  const outside = project(t);
  mkdirSync(join(root, '.omd'));
  symlinkSync(outside, join(root, '.omd', '.cache'));
  assert.throws(() => createCodexStudyDirectory(root), /STUDY_DIRECTORY_REJECTED/);
  assert.equal(isCodexStudyDirectory(root, '.omd/.cache/studies/study-ABC123'), false);
});

test('a replaced study leaf fails returned-directory validation', (t) => {
  const root = project(t);
  const directory = createCodexStudyDirectory(root);
  rmSync(join(root, directory), { recursive: true });
  symlinkSync(project(t), join(root, directory));
  assert.equal(isCodexStudyDirectory(root, directory), false);
});

test('a completed process must produce a real nonempty study entry', (t) => {
  const root = project(t), directory = createCodexStudyDirectory(root), entry = join(root, directory, 'index.html');
  assert.match(codexStudyEntryError(root, directory) ?? '', /STUDY_ENTRY_MISSING/);
  writeFileSync(entry, ' \n\t');
  assert.match(codexStudyEntryError(root, directory) ?? '', /index.html is empty/);
  writeFileSync(entry, '<!doctype html><title>Routine</title><button>Complete</button>');
  assert.equal(codexStudyEntryError(root, directory), undefined);
  rmSync(entry);mkdirSync(entry);
  assert.match(codexStudyEntryError(root, directory) ?? '', /regular file/);
});

test('study completion cannot use another directory or a symlinked entry', (t) => {
  const root = project(t), directory = createCodexStudyDirectory(root), outside = project(t);
  const target = join(outside, 'index.html');writeFileSync(target, '<h1>Outside source</h1>');
  symlinkSync(target, join(root, directory, 'index.html'));
  assert.match(codexStudyEntryError(root, directory) ?? '', /regular file/);
  assert.match(codexStudyEntryError(root, outside) ?? '', /invalid host study directory/);
  rmSync(join(root, directory), {recursive:true});symlinkSync(outside, join(root, directory));
  assert.match(codexStudyEntryError(root, directory) ?? '', /invalid host study directory/);
});

test('study sandbox removes inherited broad and temporary roots and remote tools', () => {
  const args = codexStudyRestrictions(['external-files', 'browser']);
  for (const setting of [
    'approval_policy="never"', 'sandbox_workspace_write.writable_roots=[]',
    'sandbox_workspace_write.exclude_slash_tmp=true', 'sandbox_workspace_write.exclude_tmpdir_env_var=true',
    'sandbox_workspace_write.network_access=false', 'web_search="disabled"',
    'mcp_servers.external-files.enabled=false', 'mcp_servers.browser.enabled=false',
  ]) assert.ok(args.includes(setting), setting);
  for (const capability of ['apps', 'plugins', 'multi_agent', 'image_generation', 'standalone_web_search', 'skill_search']) {
    assert.ok(args.some((arg, index) => arg === '--disable' && args[index + 1] === capability), capability);
  }
  assert.throws(() => codexStudyRestrictions(['external.bad-key']), /STUDY_CONFIGURATION_REJECTED/);
});

test('a routed provisional study needs no produced frame/copy/type/composition artifact', () => {
  // Pure route input has no project artifacts; later owners retain their existing artifact checks.
  const route = routeAdaptiveFlow(studyRoute());
  assert.ok(route.strategy.roles.includes('omd-study'));
  assert.equal(route.strategy.executionWaves[0]?.roles[0], 'omd-study');
  for (const stage of ['composition', 'production', 'browser-evidence', 'independent-review']) {
    assert.ok(route.strategy.stages.includes(stage));
  }
});

test('study cannot replace art direction, composition, production, or independent review', () => {
  for (const stage of ['art-direction', 'composition', 'production', 'independent-review']) {
    const input = studyRoute();
    input.strategyDecision.stages = input.strategyDecision.stages.filter((value: string) => value !== stage);
    assert.throws(() => routeAdaptiveFlow(input), { name: 'AdaptiveRouteError' }, stage);
  }
});

test('study is required in an earlier wave than its composition and production consumers', () => {
  for (const consumer of ['omd-composer', 'omd-hand']) {
    const input = studyRoute();
    input.strategyDecision.executionWaves.shift();
    input.strategyDecision.executionWaves.find((wave: { roles: string[] }) => wave.roles.includes(consumer)).roles.push('omd-study');
    assert.throws(() => routeAdaptiveFlow(input), /ADAPTIVE_EXECUTION_WAVE_INVALID/);
  }
  const missing = studyRoute();
  missing.strategyDecision.executionWaves.shift();
  assert.throws(() => routeAdaptiveFlow(missing), /ADAPTIVE_EXECUTION_WAVE_INVALID/);
});
