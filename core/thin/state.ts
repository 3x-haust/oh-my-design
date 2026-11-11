import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';

/**
 * The thin design loop's whole memory between sessions: one small state file, one memo, the chosen reference,
 * the before-state of a redesign, and one folder per cycle. Nothing here is a gate: these files only let a fresh
 * session (or a session resumed after compaction) know which cycle it is in and what survived the last one.
 */
export const THIN_DIR = '.omd/thin';
export const THIN_STATE = `${THIN_DIR}/state.json`;
export const THIN_MEMO = `${THIN_DIR}/memo.md`;
export const THIN_REFERENCE = `${THIN_DIR}/reference`;
export const THIN_BEFORE = `${THIN_DIR}/before`;
export const THIN_ARCHIVE = `${THIN_DIR}/archive`;
export const THIN_BASELINE = `${THIN_DIR}/baseline`;
/** Continue mode runs on its own until the cold eye finds no tell or this many cycles exist. */
export const THIN_CYCLE_CAP = 3;

export const THIN_KINDS = ['marketing', 'product', 'redesign'] as const;
export type ThinKind = (typeof THIN_KINDS)[number];
export type ThinPhase = 'making' | 'stopped' | 'next';

export type ThinState = {
  schema: 'omd-thin-state-v1';
  request: string;
  kind: ThinKind;
  mode: 'step' | 'continue';
  /** Continue mode stops on its own after this cycle. */
  until: number;
  cycle: number;
  phase: ThinPhase;
  /** Why the loop stopped: one cycle was asked for, the cold eye found no tell, the cycle cap, or a cycle that did not beat the one before. */
  reason?: 'one-cycle' | 'no-tell' | 'cap' | 'lost';
  /** The cycle whose work stands as the result: the latest, unless a later cycle lost to it and it was restored. */
  best?: number;
  /** Per closed cycle: the cycle it was compared with and whether the cold eye found it closer to senior work (null: not compared). */
  cycles?: CycleRecord[];
  /** Project paths that survive into the next cycle (assets), never archived. */
  survivors: string[];
  /** How to open the latest result, in the maker's words. */
  open?: string;
  updatedAt: string;
};

export type CycleRecord = { cycle: number; against: number | null; beat: boolean | null; open?: string };

export const cycleDir = (cycle: number): string => `${THIN_DIR}/cycles/${cycle}`;
export const resultDir = (cycle: number): string => `${cycleDir(cycle)}/result`;
export const packetDir = (cycle: number): string => `${cycleDir(cycle)}/packet`;
export const eyeAnswerPath = (cycle: number): string => `${cycleDir(cycle)}/eye.md`;
/** Which cycle the packet's other/ holds; kept outside the packet so the eye cannot see it. */
export const comparePath = (cycle: number): string => `${cycleDir(cycle)}/compare.json`;

/** The cycle a cycle is compared with: the standing result before it, or none for the first. */
export function againstOf(state: ThinState, cycle: number): number | null {
  const recorded = state.cycles?.find(entry => entry.cycle === cycle);
  if (recorded !== undefined) return recorded.against;
  const previous = cycle === state.cycle ? state.best ?? cycle - 1 : cycle - 1;
  return previous >= 1 ? previous : null;
}

export class ThinError extends Error {}

export function readThinState(root: string): ThinState | null {
  const path = join(root, THIN_STATE);
  if (!existsSync(path)) return null;
  let value: unknown;
  try { value = JSON.parse(readFileSync(path, 'utf8')); } catch { throw new ThinError(`${THIN_STATE} is not JSON; fix or remove it`); }
  if (typeof value !== 'object' || value === null || Reflect.get(value, 'schema') !== 'omd-thin-state-v1') {
    throw new ThinError(`${THIN_STATE} is not a thin cycle state`);
  }
  return value as ThinState;
}

/** Every thin write goes through the guarded project writer: a project-relative path, its folder made first. */
export function put(writer: ProjectWriteAdapter, path: string, content: string | Uint8Array): void {
  const folder = dirname(path);
  if (folder !== '.' && folder !== '') writer.mkdir(folder);
  writer.write(path, content);
}

export function writeThinState(writer: ProjectWriteAdapter, state: ThinState): ThinState {
  const next = { ...state, updatedAt: new Date().toISOString() };
  put(writer, THIN_STATE, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export function requireThinState(root: string): ThinState {
  const state = readThinState(root);
  if (state === null) throw new ThinError('no thin cycle here yet; start one with omd thin start --kind marketing|product|redesign --request "<request>"');
  return state;
}

/** The eye's answer begins with "No tell." when it finds none; anything else is a tell. Missing means not looked at. */
export function eyeVerdict(root: string, cycle: number): 'tell' | 'none' | 'missing' {
  const path = join(root, eyeAnswerPath(cycle));
  if (!existsSync(path)) return 'missing';
  const answer = readFileSync(path, 'utf8').trim();
  if (!answer) return 'missing';
  return /^[*_\s>"']*no tell\b/i.test(answer) ? 'none' : 'tell';
}

/**
 * The comparison line, "Closer: result" or "Closer: other": whether the work under result/ (this cycle) beat the work
 * under other/ (the cycle before). Null when the answer holds no comparison.
 */
export function eyeComparison(root: string, cycle: number): boolean | null {
  const path = join(root, eyeAnswerPath(cycle));
  if (!existsSync(path)) return null;
  const match = /^[*_\s>"'-]*closer[*_\s]*:[*_\s`"']*(result|other)\b/im.exec(readFileSync(path, 'utf8'));
  return match === null ? null : match[1]!.toLowerCase() === 'result';
}

export function appendMemo(writer: ProjectWriteAdapter, text: string): void {
  const path = join(writer.projectRoot, THIN_MEMO);
  const previous = existsSync(path) ? readFileSync(path, 'utf8') : '';
  put(writer, THIN_MEMO, `${previous}${previous === '' || previous.endsWith('\n') ? '' : '\n'}${text.endsWith('\n') ? text : `${text}\n`}`);
}

export function newThinState(input: Readonly<{ request: string; kind: ThinKind; continueMode: boolean }>): ThinState {
  return {
    schema: 'omd-thin-state-v1', request: input.request, kind: input.kind,
    mode: input.continueMode ? 'continue' : 'step', until: THIN_CYCLE_CAP,
    cycle: 1, phase: 'making', survivors: [], updatedAt: new Date().toISOString(),
  };
}

/**
 * After a cycle: stop for the human, or let the next cycle start in a fresh session. A cycle the eye found further
 * from senior work than the one before it loses: the loop stops and the earlier work stands as the result.
 */
export function closeCycle(state: ThinState, verdict: 'tell' | 'none' | 'missing',
  input: Readonly<{ survivors: readonly string[]; open?: string | undefined; beat?: boolean | null }>): ThinState {
  if (state.phase !== 'making') throw new ThinError(`cycle ${state.cycle} is already closed (${state.phase})`);
  const against = againstOf(state, state.cycle);
  const beat = against === null ? null : input.beat ?? null;
  const open = input.open ?? state.open;
  const record: CycleRecord = { cycle: state.cycle, against, beat, ...(open === undefined ? {} : { open }) };
  const cycles = [...(state.cycles ?? []).filter(entry => entry.cycle !== state.cycle), record];
  const base: ThinState = { ...state, survivors: [...input.survivors], cycles, best: state.cycle, ...(open === undefined ? {} : { open }) };
  delete base.reason;
  if (beat === false && against !== null) {
    const standing = cycles.find(entry => entry.cycle === against)?.open;
    const lost: ThinState = { ...base, best: against, phase: 'stopped', reason: 'lost' };
    if (standing === undefined) delete lost.open; else lost.open = standing;
    return lost;
  }
  if (state.mode === 'step') return { ...base, phase: 'stopped', reason: 'one-cycle' };
  if (verdict === 'none') return { ...base, phase: 'stopped', reason: 'no-tell' };
  if (state.cycle >= state.until) return { ...base, phase: 'stopped', reason: 'cap' };
  return { ...base, phase: 'next' };
}

/** The human said one more (step) or continue. Continue runs to the cap, or one more cycle once the cap is behind. */
export function goOn(state: ThinState, continueMode: boolean): ThinState {
  if (state.phase === 'making') throw new ThinError(`cycle ${state.cycle} is still being made; close it first`);
  const next: ThinState = { ...state, phase: 'next', mode: continueMode ? 'continue' : 'step',
    until: continueMode ? Math.max(THIN_CYCLE_CAP, state.cycle + 1) : state.until };
  delete next.reason;
  return next;
}

export function beginCycle(state: ThinState): ThinState {
  if (state.phase !== 'next') throw new ThinError(`no next cycle is due (cycle ${state.cycle} is ${state.phase})`);
  return { ...state, cycle: state.cycle + 1, phase: 'making' };
}
