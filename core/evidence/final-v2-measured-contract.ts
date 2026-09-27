import type { Receipt } from '../measure/types.ts';
import type { ReviewPolicy } from '../measure/review-policy.ts';
import type { MeasuredLane } from '../../adapters/measured-reviewer-publication.ts';
import * as v from '../measure/validation.ts';
import type { TerminalProcessBinding } from './final-v2-process.ts';

export type MeasuredTerminal = Readonly<{
  schema: 'measured-terminal-graph-v1'; measurements: readonly Receipt[]; reviewPolicy: ReviewPolicy;
  slop: { checkpoint: Receipt; review: Receipt }; deterministicProtocol?: Receipt;
  process?: TerminalProcessBinding;
  lanes: Partial<Record<MeasuredLane, Receipt>>;
}>;
type LegacyReceipt = Readonly<Receipt & { schema: string }>;
export type GraphReviewBindings = Readonly<
  | { measuredTerminal: MeasuredTerminal; blindLane?: never; fidelityLane?: never; protocolLane?: never }
  | { measuredTerminal?: never; blindLane: LegacyReceipt; fidelityLane: LegacyReceipt; protocolLane: LegacyReceipt }
>;
const lanes = ['blindLane', 'fidelityLane', 'protocolLane'] as const;
export function parseMeasuredTerminal(input: unknown): MeasuredTerminal {
  if (!input || typeof input !== 'object') return v.fail('measured terminal graph required');
  const item = input as Record<string, unknown>;
  v.object({ schema: v.enumeration('measured-terminal-graph-v1'), measurements: v.array(v.receipt), reviewPolicy: v.object({
    schema: v.enumeration('review-policy-v1'), ruleVersion: v.enumeration('risk-quorum-v1'), tier: v.enumeration('ordinary', 'high-risk', 'benchmark-release', 'legacy-unmigrated'),
    routeSha256: v.sha, sourceContractSha256: v.sha, purpose: v.nullable(v.enumeration('ordinary', 'benchmark', 'release')), purposeAuthority: v.nullable(v.receipt),
    lanes: v.object({ blind: v.enumeration(1, 2), fidelity: v.enumeration(0, 1, 2), protocol: v.enumeration(0, 2) }), deterministicProtocol: value => { if (value !== true) v.fail('deterministic protocol is mandatory'); },
  }),
    slop: v.object({ checkpoint: v.receipt, review: v.receipt }), ...(item.deterministicProtocol === undefined ? {} : { deterministicProtocol: v.receipt }),
    ...(item.process === undefined ? {} : { process: () => {} }),
    lanes: raw => { if (!raw || typeof raw !== 'object' || Array.isArray(raw)) v.fail('measured lanes required');
      v.object(Object.fromEntries(Object.keys(raw as object).map(key => { if (!lanes.includes(key as MeasuredLane)) v.fail('unknown measured lane'); return [key, v.receipt]; })))(raw); } })(input);
  const terminal = input as MeasuredTerminal;
  if (!terminal.measurements.length) v.fail('immutable measurement packets required');
  v.unique(terminal.measurements.map(r => r.sha256), 'terminal measurement');
  return terminal;
}
export type MeasuredTerminalGraph = { measuredTerminal?: MeasuredTerminal; observations: readonly LegacyReceipt[]; [key: string]: unknown };
