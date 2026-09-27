import { canonicalJson, sha256 } from './json.ts';
import { referenceServiceFamily } from '../design-discovery-sources.ts';
import { visualVectorDistance, type VisualVector } from '../../visual-vector.ts';
import type { BrowseBudget, BrowseKeep, Lane, Receipt, ReferenceConfidenceDebt, StopReason } from './contract.ts';

export function evaluateBrowseStop(budget: BrowseBudget, now: number, saturated = false): StopReason {
  if (!Number.isFinite(now) || now < Date.parse(budget.startedAt) || now >= Date.parse(budget.deadline)
    || budget.actions >= budget.maxActions || budget.metadataEvents >= 128) return 'budget';
  return saturated ? 'saturated' : null;
}
export function compareBrowseVectors(left: VisualVector | null, right: VisualVector | null) {
  if (!left || !right) return { distance: null, compared: [], excluded: [], comparable: false };
  const result = visualVectorDistance(left, right);
  const comparable = result.compared.length >= 4 && result.compared.some(axis => ['typeVoice', 'spacingRhythm', 'layoutEnergy'].includes(axis));
  return { ...result, distance: Number.isFinite(result.distance) ? result.distance : null, comparable };
}
export function browseSaturation(keeps: readonly BrowseKeep[]): 'yes' | 'no' | 'unknown' {
  if (keeps.length < 7) return 'no';
  const base = keeps.slice(0, -5), window = keeps.slice(-5);
  if (new Set(base.map(keep => keep.image.sha256)).size < 2) return 'no';
  for (const keep of window) {
    if (!base.some(other => referenceServiceFamily(other.source) === referenceServiceFamily(keep.source))) return 'no';
    if (base.some(other => other.image.sha256 === keep.image.sha256)) continue;
    if (keep.direction && !base.some(other => other.direction === keep.direction)) return 'no';
    const comparisons = base.map(other => compareBrowseVectors(keep.vector, other.vector));
    if (!comparisons.some(comparison => comparison.comparable)) return 'unknown';
    if (!comparisons.some(comparison => comparison.comparable && comparison.distance !== null && comparison.distance < .15)) return 'no';
  }
  return 'yes';
}
export function browseConfidenceDebt(input: { sourceContractSha256: string; lane: Lane; keeps: readonly BrowseKeep[];
  stopReason: StopReason; evidence: readonly Receipt[]; failures: number; browserUnavailable?: boolean }): readonly ReferenceConfidenceDebt[] {
  const codes: ReferenceConfidenceDebt['code'][] = [];
  if (input.browserUnavailable) codes.push('browser-capability-gap');
  if (!input.keeps.length || input.failures) codes.push('access-gap');
  if (new Set(input.keeps.map(keep => referenceServiceFamily(keep.source))).size < (input.lane === 'domain' ? 3 : 2)) codes.push('source-diversity-gap');
  if (input.lane === 'design' && input.keeps.filter(keep => keep.role === 'visual-direction').length < 2) codes.push('visual-direction-gap');
  if (input.keeps.some(keep => keep.vector === null)) codes.push('unmeasured');
  if (input.stopReason === 'budget') codes.push('budget-exhausted');
  return codes.map(code => ({ id: sha256(canonicalJson([input.sourceContractSha256, input.lane, code])),
    sourceContractSha256: input.sourceContractSha256, lane: input.lane, decisionId: null, code,
    severity: code === 'unmeasured' ? 'low' : 'material', evidence: input.evidence,
    limitation: `${input.lane} acquisition: ${code}; ${input.keeps.length} retained observations, ${input.failures} failed/refused actions.`,
    consequence: 'First implementation may proceed; reference sufficiency is not established by this session.',
    owner: 'scout', entryDisposition: 'non-blocking', completionDisposition: 'must-resolve-or-explicitly-disclose' }));
}
/** No sleeping/retrying: the caller can choose another allowed action or return later. */
export class BrowseRateLimit {
  private changes: { time: number; origin: string }[] = [];
  private lastChange: number | null = null;
  private readonly clock: () => number;
  constructor(clock: () => number = () => performance.now()) { this.clock = clock; }
  check(origin: string): number {
    const now = this.clock(); this.changes = this.changes.filter(item => now - item.time < 60_000);
    const same = this.changes.filter(item => item.origin === origin);
    return Math.max(0, this.lastChange === null ? 0 : 1000 - (now - this.lastChange),
      this.changes.length >= 30 ? 60_000 - (now - this.changes[0]!.time) : 0,
      same.length >= 10 ? 60_000 - (now - same[0]!.time) : 0);
  }
  consume(origin: string, transition = true) {
    this.lastChange = this.clock();
    if (transition) this.changes.push({ origin, time: this.lastChange });
  }
}
