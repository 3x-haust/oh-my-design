import { parseRealityLedger } from './index.ts';
import { parseEntrySurfaceContract } from './entry-surface-contract.ts';
import type { writeFrameRecord } from './write.ts';

export type FrameInput = Parameters<typeof writeFrameRecord>[1];
export const FRAME_INPUT_KEYS = ['schema', 'problem', 'reframe', 'why', 'uxTask', 'uxFrequentAction',
  'uxCostliestError', 'uxSurface', 'taskCoverageMatrix', 'reality', 'entrySurface'] as const;

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
