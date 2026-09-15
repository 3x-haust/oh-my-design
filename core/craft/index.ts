import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { decodePng } from '../motion/energy.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { type ProjectWriteAdapter, requireProjectWriteAdapter } from '../runtime/project-write.ts';

export type CraftPhase = 'semantic' | 'visual';
export type CraftDecision = 'revise' | 'retain' | 'reframe';
export interface CraftCheckpoint {
  ts: string;
  phase: CraftPhase;
  render: string;
  observed: string;
  changed: string;
  /** Absent on historical change-only notes. This is a craft judgment, never final acceptance. */
  decision?: CraftDecision;
  criterion?: string;
  reason?: string;
  renderSha256?: string;
}

export type CraftCheckpointInput = Omit<CraftCheckpoint, 'ts' | 'renderSha256' | 'decision'> & {
  decision?: string;
};

const pathFor = (cwd: string): string => join(cwd, '.omd', 'craft.jsonl');

export function recordCraft(
  cwd: string,
  input: CraftCheckpointInput,
  adapter: ProjectWriteAdapter,
): string {
  if (!['semantic', 'visual'].includes(input.phase)) throw new Error('craft phase must be semantic or visual');
  if (!input.render.trim() || input.observed.trim().length < 4) {
    throw new Error('--render and --observed require concrete values');
  }
  const decision = input.decision ?? 'revise';
  if (!['revise', 'retain', 'reframe'].includes(decision)) throw new Error('--decision must be revise, retain, or reframe');
  if (decision === 'revise') {
    if (input.changed.trim().length < 4 || /^(no|none|nothing|unchanged|no changes?|변경 ?없음)[.!]?$/i.test(input.changed.trim())) {
      throw new Error('A revise checkpoint requires a concrete --changed value; use --decision retain with evidence to preserve a design.');
    }
  } else if (input.changed.trim()) {
    throw new Error('retain and reframe record a judgment, not a source change; omit --changed');
  }
  let renderSha256: string | undefined;
  if (input.decision !== undefined) {
    if ((input.criterion?.trim().length ?? 0) < 4 || (input.reason?.trim().length ?? 0) < 4) {
      throw new Error('An explicit craft decision requires --criterion and --reason tied to the observed render');
    }
    const bytes = readStableProjectFile({ root: cwd, path: resolve(cwd, input.render), label: 'craft render', fs: nodeStableProjectFileSystem() });
    decodePng(bytes);
    renderSha256 = createHash('sha256').update(bytes).digest('hex');
  } else if (input.criterion !== undefined || input.reason !== undefined) {
    throw new Error('--criterion and --reason require an explicit --decision');
  }
  const path = pathFor(cwd);
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return requireProjectWriteAdapter(cwd, adapter)
    .write('.omd/craft.jsonl', `${existing}${JSON.stringify({ ts: new Date().toISOString(), phase: input.phase,
      render: input.render, observed: input.observed, changed: input.changed,
      ...(input.decision === undefined ? {} : { decision, criterion: input.criterion, reason: input.reason, renderSha256 }),
    })}\n`);
}

export function readCraft(cwd: string): CraftCheckpoint[] {
  const path = pathFor(cwd);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as CraftCheckpoint);
}
