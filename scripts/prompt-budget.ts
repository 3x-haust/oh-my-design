import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readRoleProfiles, PROFILE_SOURCE_ROOT } from '../core/brief/profiles.ts';

export const AGENT_PROMPT_BUDGETS: Readonly<Record<string, number>> = {
  'art-director': 1000, framer: 900, scout: 1500, writer: 900, typesetter: 850,
  composer: 1100, sketch: 350, study: 600, hand: 1500, eye: 350, glance: 200,
};
export const SKILL_PROMPT_BUDGETS: Readonly<Record<string, number>> = {
  ultradesign: 500, scout: 300, coach: 250, critique: 300, figma: 600, humanize: 600,
  concepts: 250, system: 250, expand: 250, audit: 250,
};
export const estimatedTokens = (source: string): number => Math.ceil((source.trim().match(/\S+/gu)?.length ?? 0) * 1.35);
export function promptBudget(sourceRoot = PROFILE_SOURCE_ROOT) {
  const rows: Array<{ path: string; kind: 'agent' | 'skill' | 'profile'; estimatedTokens: number; budget: number }> = [];
  const agents = readdirSync(join(sourceRoot, 'src/agents')).filter(f => f.endsWith('.agent.yaml')).sort();
  if (agents.join(',') !== Object.keys(AGENT_PROMPT_BUDGETS).map(k => `${k}.agent.yaml`).sort().join(',')) throw new Error('PROMPT_BUDGET: unaccounted agent membership');
  const skills = readdirSync(join(sourceRoot, 'src/skills')).sort();
  if (skills.join(',') !== Object.keys(SKILL_PROMPT_BUDGETS).map(k => `omd-${k}`).sort().join(',')) throw new Error('PROMPT_BUDGET: unaccounted skill membership');
  for (const [role, budget] of Object.entries(AGENT_PROMPT_BUDGETS)) {
    const path = `src/agents/${role}.agent.yaml`; rows.push({ path, kind: 'agent', budget, estimatedTokens: estimatedTokens(readFileSync(join(sourceRoot, path), 'utf8')) });
  }
  for (const [skill, budget] of Object.entries(SKILL_PROMPT_BUDGETS)) {
    const path = `src/skills/omd-${skill}/SKILL.md`; rows.push({ path, kind: 'skill', budget, estimatedTokens: estimatedTokens(readFileSync(join(sourceRoot, path), 'utf8')) });
  }
  const profiles = readRoleProfiles(sourceRoot);
  for (const profile of profiles) rows.push({ path: `src/agents/profiles/${profile.file}`, kind: 'profile', budget: profile.budget, estimatedTokens: estimatedTokens(profile.source) });
  const total = rows.reduce((sum, r) => sum + r.estimatedTokens, 0);
  const loaded = Object.keys(AGENT_PROMPT_BUDGETS).map(role => {
    const base = rows.find(r => r.path === `src/agents/${role}.agent.yaml`)!.estimatedTokens;
    const modes = profiles.filter(p => p.role === `omd-${role}`);
    return { role: `omd-${role}`, maximumStaticInstructions: base + Math.max(0, ...modes.map(p => estimatedTokens(p.source))) };
  });
  loaded.push({ role: 'coordinator', maximumStaticInstructions: rows.find(r => r.path === 'src/skills/omd-ultradesign/SKILL.md')!.estimatedTokens
    + Math.max(...rows.filter(r => r.kind === 'skill' && r.path !== 'src/skills/omd-ultradesign/SKILL.md').map(r => r.estimatedTokens)) });
  return { schema: 'prompt-budget-v1', estimator: 'whitespace-words-times-1.35', total, target: 17900, ceiling: 30000,
    rows, loaded, maximumLoadedStatic: Math.max(...loaded.map(r => r.maximumStaticInstructions)),
    violations: [...rows.filter(r => r.estimatedTokens > r.budget).map(r => r.path), ...(total >= 30000 ? ['total'] : [])],
    evidenceData: 'not counted: current role receipts, actual content/images/analysis and conditional pack sections' };
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const report = promptBudget(); console.log(JSON.stringify(report, null, 2)); process.exitCode = report.violations.length ? 1 : 0;
}
