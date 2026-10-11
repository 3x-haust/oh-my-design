import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextStageWork } from '../core/stage/next.ts';
import { parseStageWork } from '../extensions/omd-message-end.ts';
import { refinementEscalation, recordRefinementObservation } from '../core/stage/refinement-work.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { adaptiveRouteRecordSha256 } from '../core/route/index.ts';
import { routeRefinementPolicy } from '../core/route/refinement-policy.ts';
import { digest, jsonBytes, publishRecord, type Receipt } from '../core/brief/candidate-data.ts';
import { fixture, pack, snapshot } from './helpers/phase6-process.ts';

test('native signed repeat history survives reader restart and stage next pauses before debt/recovery mutation', t => {
  const f = fixture(t); let previous: Receipt | null = null;
  // Host-publication fixture: reader integrity/continuation is under test, not measurement generation.
  for (let i = 1; i <= 3; i++) {
    const measurement = publishRecord(f.writer, '.omd/test-results', { observation: i });
    const repair = publishRecord(f.writer, '.omd/test-results', { repair: i });
    const review = publishRecord(f.writer, '.omd/test-results', { review: i });
    const payload = { schema: 'refinement-observation-v1', sourceContractSha256: f.route.sourceContractSha256, routeSha256: adaptiveRouteRecordSha256(f.route),
      measurement, repair, review, previous, policy: routeRefinementPolicy(f.route), findings: [{ issueKey: 'same-native-issue', code: 'REQUIRED_CONTROL_CLIPPED', viewIds: ['mobile'], expected: 'control visible', observed: 'control clipped' }], outcome: { observationId: measurement.sha256, repairId: repair.sha256, comparisonScope: `changed-scope-${i}`,
        unresolvedIssueKeys: ['same-native-issue'], resolvedIssueKeys: [], regressedIssueKeys: [], requiredEvidence: true } };
    previous = publishRecord(f.writer, '.omd/refinement/checkpoints', { ...payload, signature: signNativeObservation(f.root, 'refinement-observation-v1', digest(payload)) });
    f.writer.write('.omd/refinement/policy.json', jsonBytes({ schema: 'refinement-policy-pointer-v1', record: previous }));
  }
  const before = snapshot(f.root), first = refinementEscalation(f.root, f.route.sourceContractSha256), restored = refinementEscalation(f.root, f.route.sourceContractSha256);
  assert.deepEqual(first, restored); assert.equal(first?.defects[0]!.attempts.length, 3);
  const next = nextStageWork(f.root, pack, f.invocation);
  assert.equal(next.action, 'await-user'); assert.equal('reason' in next && next.reason, 'repeated-defect');
  assert.equal(parseStageWork(JSON.stringify(next))?.awaiting?.reason, 'repeated-defect');
  assert.deepEqual(snapshot(f.root), before);
  assert.throws(() => recordRefinementObservation(f.root, { measurement: previous!, repair: previous!, review: previous! }, f.writer, f.invocation));
  assert.deepEqual(snapshot(f.root), before);
});
