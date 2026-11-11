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
  /** Why the loop stopped: one cycle was asked for, the cold eye found no tell, or the cycle cap. */
  reason?: 'one-cycle' | 'no-tell' | 'cap';
  /** Project paths that survive into the next cycle (assets), never archived. */
  survivors: string[];
  /** How to open the latest result, in the maker's words. */
  open?: string;
  updatedAt: string;
};

export const cycleDir = (cycle: number): string => `${THIN_DIR}/cycles/${cycle}`;
export const resultDir = (cycle: number): string => `${cycleDir(cycle)}/result`;
export const packetDir = (cycle: number): string => `${cycleDir(cycle)}/packet`;
export const eyeAnswerPath = (cycle: number): string => `${cycleDir(cycle)}/eye.md`;

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

/** After a cycle: stop for the human, or let the next cycle start in a fresh session. */
export function closeCycle(state: ThinState, verdict: 'tell' | 'none' | 'missing',
  input: Readonly<{ survivors: readonly string[]; open?: string | undefined }>): ThinState {
  if (state.phase !== 'making') throw new ThinError(`cycle ${state.cycle} is already closed (${state.phase})`);
  const base: ThinState = { ...state, survivors: [...input.survivors], ...(input.open === undefined ? {} : { open: input.open }) };
  delete base.reason;
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
