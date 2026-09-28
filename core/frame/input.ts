import { parseRealityFact, parseRealityLedger } from './index.ts';
import { diagnoseEntrySurfaceContract, parseEntrySurfaceContract } from './entry-surface-contract.ts';
import type { writeFrameRecord } from './write.ts';
import { normalizeUxSurface, validateTaskCoverageMatrix } from './check-ux.ts';

export type FrameInput = Parameters<typeof writeFrameRecord>[1];
export const FRAME_INPUT_KEYS = ['schema', 'problem', 'reframe', 'why', 'uxTask', 'uxFrequentAction',
  'uxCostliestError', 'uxSurface', 'taskCoverageMatrix', 'reality', 'entrySurface'] as const;

export function diagnoseFrameInput(value: unknown): readonly { path: string; code: string; message: string }[] {
  const diagnostics: { path: string; code: string; message: string }[] = [];
  const check = (path: string, run: () => unknown): void => {
    try { run(); } catch (error) {
      if (!(error instanceof Error)) throw error;
      diagnostics.push({ path, code: 'FRAME_INPUT_INVALID', message: error.message });
    }
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    check('input', () => parseFrameInput(value));
    return diagnostics;
  }
  const v = value as Record<string, unknown>;
  check('schema', () => { if (v.schema !== 'frame-input-v1') throw new Error('expected frame-input-v1'); });
  for (const key of Object.keys(v).filter(key => !(FRAME_INPUT_KEYS as readonly string[]).includes(key)))
    diagnostics.push({ path: key, code: 'FRAME_INPUT_INVALID', message: `unknown field ${key}` });
  for (const key of ['problem', 'reframe', 'why', 'uxTask', 'uxFrequentAction', 'uxCostliestError', 'uxSurface'] as const)
    check(key, () => { if (typeof v[key] !== 'string' || !v[key].trim()) throw new Error(`${key} must be nonempty`); });
  if (typeof v.why === 'string' && v.why.trim().length < 10)
    diagnostics.push({ path: 'why', code: 'FRAME_INPUT_INVALID', message: 'why must cite an observation of at least 10 characters' });
  if (typeof v.uxSurface === 'string' && v.uxSurface.trim() && !normalizeUxSurface(v.uxSurface))
    diagnostics.push({ path: 'uxSurface', code: 'FRAME_INPUT_INVALID', message: 'uxSurface must be marketing, product, editorial, or mixed' });
  const surface = normalizeUxSurface(v.uxSurface);
  if (v.taskCoverageMatrix !== undefined) {
    check('taskCoverageMatrix', () => { if (typeof v.taskCoverageMatrix !== 'string' || !v.taskCoverageMatrix.trim()) throw new Error('taskCoverageMatrix must be nonempty'); });
    if (typeof v.taskCoverageMatrix === 'string' && v.taskCoverageMatrix.trim())
      for (const message of validateTaskCoverageMatrix(v.taskCoverageMatrix.replace(/^## Task coverage matrix[ \t]*$/gm, '').trim()))
        diagnostics.push({ path: 'taskCoverageMatrix', code: 'FRAME_INPUT_INVALID', message });
  }
  if ((surface === 'product' || surface === 'mixed') && v.taskCoverageMatrix === undefined)
    diagnostics.push({ path: 'taskCoverageMatrix', code: 'FRAME_INPUT_INVALID', message: 'product and mixed surfaces require a task coverage matrix' });
  if ((surface === 'marketing' || surface === 'editorial') && v.taskCoverageMatrix !== undefined)
    diagnostics.push({ path: 'taskCoverageMatrix', code: 'FRAME_INPUT_INVALID', message: 'marketing and editorial surfaces must not include a task coverage matrix' });
  if (v.reality !== undefined) {
    if (typeof v.reality === 'object' && v.reality !== null && !Array.isArray(v.reality) && Array.isArray((v.reality as Record<string, unknown>).facts)) {
      const ledger = v.reality as { facts: unknown[]; schema?: unknown; mode?: unknown };
      check('reality', () => {
        if (Object.keys(ledger).sort().join(',') !== 'facts,mode,schema' || ledger.schema !== 'reality-ledger-v1'
          || (ledger.mode !== 'greenfield' && ledger.mode !== 'existing')) throw new Error('reality ledger header is invalid');
      });
      for (const [index, fact] of ledger.facts.entries()) check(`reality.facts[${index}]`, () => parseRealityFact(fact, index));
      if (ledger.facts.length === 0 || ledger.facts.length > 12) check('reality.facts', () => parseRealityLedger(v.reality));
    } else check('reality', () => parseRealityLedger(v.reality));
  }
  if (v.entrySurface !== undefined) diagnostics.push(...diagnoseEntrySurfaceContract(v.entrySurface));
  return diagnostics;
}


/** One discoverable, atomic input; requirements and the UX task matrix are different contracts. */
export function parseFrameInput(value: unknown): FrameInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('FRAME_INPUT_INVALID: expected an object; run omd schema frame');
  const v = value as Record<string, unknown>;
  const extra = Object.keys(v).filter(key => !(FRAME_INPUT_KEYS as readonly string[]).includes(key));
  if (extra.length || v.schema !== 'frame-input-v1') throw new Error(`FRAME_INPUT_INVALID: expected frame-input-v1, unknown fields: ${extra.join(', ')}; run omd schema frame`);
  const text = (key: string): string => {
    if (typeof v[key] !== 'string' || !v[key].trim()) throw new Error(`FRAME_INPUT_INVALID: ${key} must be nonempty; run omd schema frame`);
    return v[key] as string;
  };
  return {
    problem: text('problem'), reframe: text('reframe'), why: text('why'), uxTask: text('uxTask'),
    uxFrequentAction: text('uxFrequentAction'), uxCostliestError: text('uxCostliestError'), uxSurface: text('uxSurface'),
    ...(v.taskCoverageMatrix === undefined ? {} : { taskCoverageMatrix: text('taskCoverageMatrix') }),
    ...(v.reality === undefined ? {} : { reality: parseRealityLedger(v.reality) }),
    ...(v.entrySurface === undefined ? {} : { entrySurface: parseEntrySurfaceContract(v.entrySurface) }),
  };
}
