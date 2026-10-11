import { canonicalJson, sha256 } from '../../core/ref/board-artifacts.ts';
import { parseDeveloperEvaluationSnapshot, type DeveloperEvaluationScope } from '../../core/coach/developer-evaluation-contract.ts';

export function calibrationFixture(scope: DeveloperEvaluationScope) {
  const core = {
    schema: 'developer-evaluation-snapshot-v1',
    requestRunId: 'synthetic-test-only',
    pinnedAt: '2026-10-11T09:15:00.000Z',
    cases: [{
      caseId: 'a'.repeat(64), sourceRecordSha256: 'b'.repeat(64),
      heldOutRecordSha256s: ['c'.repeat(64), 'd'.repeat(64)], scope,
      developerSignal: { comparisonChoice: 'b', satisfaction: 'satisfied' },
      designRelations: ['Keep the selected record visible beside its details.'],
      changeSummary: { attempted: ['Grouped related fields'], preserved: ['Kept the primary task visible'] },
      advisory: ['Keep related details in the same reading context.'],
      advisorySource: 'model-interpretation', applicability: 'advisory',
      authority: 'none', currentRequestPrecedence: 'always',
    }],
  };
  const digest = sha256(canonicalJson(core));
  return parseDeveloperEvaluationSnapshot({ ...core, digest, snapshotId: digest });
}

export const calibrationFrame = {
  uxSurface: 'editorial',
  uxTask: 'Read confirmation',
  entrySurface: {
    schema: 'entry-surface-contract-v1', entryPath: 'src/copy/index.html',
    prerequisiteTaskId: 'read-confirmation', dependentTaskId: 'continue',
    purposeText: 'Read confirmation', workObjectAnchorText: 'Confirmation', nextActionName: null,
    beforeText: 'Ready', afterText: 'Read', outcomeWitnesses: [
      { kind: 'mustHave', index: 0, phase: 'initial', assertion: 'visible-text', target: 'purpose' },
    ],
  },
};
