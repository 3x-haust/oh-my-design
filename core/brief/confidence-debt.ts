import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readStableProjectFile, nodeStableProjectFileSystem } from '../runtime/stable-project-file.ts';
import { createProjectWriteAdapter } from '../runtime/project-write.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';

export const CONFIDENCE_DEBT_PATH = '.omd/confidence-debt.json';
export type ConfidenceDebt = Readonly<{
  id: string;
  stage: string;
  reason: string;
  kind: 'evidence-gap' | 'budget-exhausted';
  claim: 'not-verified';
}>;
export type ConfidenceDebtRecord = Readonly<{
  schema: 'confidence-debt-v1';
  sourceContractSha256: string;
  items: readonly ConfidenceDebt[];
}>;

/** Selection is preserved. These outputs may yield with an explicit, non-approval limitation. */
export const DEBT_CAPABLE_STAGES = new Set([
  'depth', 'content-grain', 'acquisition', 'scout', 'reference-board', 'reference-selection',
  'moodboard', 'art-direction', 'type-proof', 'candidate-generation',
]);
export function canDeferMissingCopy(route: { projectMode: string; strategy: { stages: readonly string[] } }): boolean {
  return route.projectMode === 'greenfield' && !route.strategy.stages.includes('safety-validation');
}
export function confidenceDebt(stage: string, reason: string, kind: ConfidenceDebt['kind'] = 'evidence-gap'): ConfidenceDebt {
  return { id: createHash('sha256').update(JSON.stringify([stage, reason, kind])).digest('hex'),
    stage, reason, kind, claim: 'not-verified' };
}
export function mergeConfidenceDebt(...groups: readonly (readonly ConfidenceDebt[])[]): ConfidenceDebt[] {
  return [...new Map(groups.flat().map(item => [item.id, item])).values()];
}
export function readConfidenceDebt(root: string, sourceContractSha256: string): readonly ConfidenceDebt[] {
  if (!existsSync(resolve(root, CONFIDENCE_DEBT_PATH))) return [];
  const record = JSON.parse(readStableProjectFile({ root, path: resolve(root, CONFIDENCE_DEBT_PATH),
    label: 'confidence debt', fs: nodeStableProjectFileSystem() }).toString('utf8')) as ConfidenceDebtRecord;
  if (record.schema !== 'confidence-debt-v1' || !/^[a-f0-9]{64}$/.test(record.sourceContractSha256)
    || !Array.isArray(record.items) || record.items.some(item => !item || typeof item.stage !== 'string' || !item.stage
      || typeof item.reason !== 'string' || !item.reason || !['evidence-gap', 'budget-exhausted'].includes(item.kind)
      || item.claim !== 'not-verified' || confidenceDebt(item.stage, item.reason, item.kind).id !== item.id)) {
    throw new Error('confidence debt record is malformed; preserve and repair the ledger before proceeding');
  }
  return record.sourceContractSha256 === sourceContractSha256 ? record.items : [];
}

/** Called only after entry-hard checks pass. A refusal never publishes debt or changes source. */
export function recordConfidenceDebt(root: string, sourceContractSha256: string,
  items: readonly ConfidenceDebt[], invocation: ProjectRunInvocation): readonly ConfidenceDebt[] {
  const previous = readConfidenceDebt(root, sourceContractSha256);
  const merged = mergeConfidenceDebt(previous, items);
  if (merged.length > previous.length) {
    const record: ConfidenceDebtRecord = { schema: 'confidence-debt-v1', sourceContractSha256, items: merged };
    createProjectWriteAdapter(root, invocation).write(CONFIDENCE_DEBT_PATH, `${JSON.stringify(record, null, 2)}\n`);
  }
  return merged;
}

/** Classify known evidence gaps, never arbitrary errors or authority/real-user-fact failures. */
export function briefDebtStage(reason: string): string | undefined {
  if (/selected reference handoff|reference research\/application|visual reference evidence|reference interpretation|design-judgment|selected reference discovery/.test(reason)) return 'reference-board';
  if (/cultural design projection|locale reference binding/.test(reason)) return 'reference-board';
  if (/content grain unavailable/.test(reason)) return 'content-grain';
  if (/copy-eye\.md/.test(reason)) return 'copy';
  const paths: Record<string, string> = {
    'depth.json': 'depth', 'content-grain.json': 'content-grain', 'acquisition-plan.json': 'acquisition',
    'scout.md': 'scout', 'reference-board.json': 'reference-board', 'reference-pre-selection-v2.json': 'reference-selection',
    'moodboard.json': 'moodboard', 'art-direction.json': 'art-direction', 'type-proof.md': 'type-proof',
    'candidate-generation': 'candidate-generation', '.omd/.cache/sketches/current.json': 'candidate-generation',
  };
  if (/^selected .* input missing:/.test(reason)) return Object.entries(paths).find(([path]) => reason.endsWith(path))?.[1];
  return undefined;
}
