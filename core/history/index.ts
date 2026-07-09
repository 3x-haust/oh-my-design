import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Run, Violation } from '../types.ts';

const historyPath = (cwd: string): string => join(cwd, '.omd', 'history.jsonl');

/**
 * Appends one run to the history log, creating `.omd/` if needed. A run with zero
 * violations is still recorded — zero findings is the evidence that the user improved.
 */
export function logRun(cwd: string, page: string, violations: Violation[], ts?: string): void {
  const counts: Record<string, number> = {};
  for (const v of violations) counts[v.id] = (counts[v.id] ?? 0) + 1;

  const run: Run = { ts: ts ?? new Date().toISOString(), page, counts, total: violations.length };

  mkdirSync(join(cwd, '.omd'), { recursive: true });
  appendFileSync(historyPath(cwd), `${JSON.stringify(run)}\n`);
}

/**
 * Reads every logged run in file order. Missing history -> []. A corrupt line is skipped
 * rather than losing the whole log.
 */
export function readHistory(cwd: string): Run[] {
  const path = historyPath(cwd);
  if (!existsSync(path)) return [];

  const lines = readFileSync(path, 'utf8').split('\n').filter((line) => line.trim().length > 0);
  const runs: Run[] = [];
  for (const line of lines) {
    try {
      runs.push(JSON.parse(line) as Run);
    } catch {
      // corrupt line — skip, keep the rest of the log
    }
  }
  return runs;
}
