import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBuildIdentity, packageVersion, readBuildAgents, readSkills } from '../adapters/build-identity.ts';
import { emittedRoleProfiles, loadRoleProfile, readRoleProfiles } from '../core/brief/profiles.ts';
import { promptBudget } from '../scripts/prompt-budget.ts';
import { promptRoot } from './helpers/prompt-delivery.ts';

test('all source roles, skills and mode profiles fit explicit budgets including maximum loaded set', () => {
  const result = promptBudget(promptRoot);
  assert.deepEqual(result.violations, []);
  assert.ok(result.total <= result.target); assert.ok(result.total < result.ceiling);
  assert.equal(result.rows.filter(r => r.kind === 'profile').length, 14);
  assert.ok(result.maximumLoadedStatic < result.total);
});

test('one closed trusted profile is byte-identical in both emitted host distributions', () => {
  for (const [path, bytes] of Object.entries(emittedRoleProfiles(promptRoot))) for (const host of ['claude', 'codex']) {
    assert.equal(readFileSync(join(promptRoot, 'dist', host, path), 'utf8'), bytes);
  }
  assert.equal(loadRoleProfile('omd-hand', 'observer').role, 'omd-hand');
  assert.throws(() => loadRoleProfile('omd-eye', '../hand/source'));
});

test('profile identity changes build identity without replacing source skill identity or user model', () => {
  const agents = readBuildAgents(promptRoot), skills = readSkills(promptRoot), profiles = readRoleProfiles(promptRoot);
  const baseline = createBuildIdentity(packageVersion(promptRoot), agents, skills, profiles);
  const changed = createBuildIdentity(packageVersion(promptRoot), agents, skills, profiles.map((p, index) => index ? p : { ...p, source: `${p.source}\nChanged trusted profile bytes.\n` }));
  assert.notEqual(changed.buildSha256, baseline.buildSha256);
  assert.equal(changed.sourceSkillSha256, baseline.sourceSkillSha256);
  assert.equal(agents.length, 11); assert.ok(agents.every(a => a.model === undefined));
});
