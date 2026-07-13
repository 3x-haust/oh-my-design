import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type CraftPhase = 'semantic' | 'visual';
export interface CraftCheckpoint {
  ts: string;
  phase: CraftPhase;
  render: string;
  observed: string;
  changed: string;
}

const pathFor = (cwd: string): string => join(cwd, '.omd', 'craft.jsonl');

export function recordCraft(cwd: string, input: Omit<CraftCheckpoint, 'ts'>): string {
  if (!['semantic', 'visual'].includes(input.phase)) throw new Error('craft phase must be semantic or visual');
  if (!input.render.trim() || input.observed.trim().length < 4 || input.changed.trim().length < 4) {
    throw new Error('--render, --observed, and --changed require concrete values');
  }
  if (/^(no|none|nothing|unchanged|no changes?|변경 ?없음)[.!]?$/i.test(input.changed.trim())) {
    throw new Error('A craft checkpoint must record a concrete resulting change.');
  }
  const path = pathFor(cwd);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify({ ts: new Date().toISOString(), ...input })}\n`);
  return path;
}

export function readCraft(cwd: string): CraftCheckpoint[] {
  const path = pathFor(cwd);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as CraftCheckpoint);
}
