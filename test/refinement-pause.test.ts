import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextStageWork } from '../core/stage/next.ts';
import { handleOmdMessageEnd, parseStageWork } from '../extensions/omd-message-end.ts';
import { RepairLoop } from '../extensions/omd-repair-progress.ts';
import { refinementEscalation, recordRefinementObservation } from '../core/stage/refinement-work.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { adaptiveRouteRecordSha256, readPersistedRoute } from '../core/route/index.ts';
import { routeRefinementPolicy } from '../core/route/refinement-policy.ts';
import { digest, jsonBytes, publishRecord, type Receipt } from '../core/brief/candidate-data.ts';
import { fixture, pack, snapshot } from './helpers/phase6-process.ts';
import { nativeCompletionWork } from '../core/stage/native-completion.ts';
import { createTestNativePiInvocation } from '../core/runtime/native-pi-run.ts';
import { nodePath, repo } from './helpers/native-maker.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from '../core/ref/board-artifacts.ts';

for (const autonomous of [false, true]) test(`native repeated defects ${autonomous ? 'stop without asking' : 'preserve interactive pause'} across restart`, async t => {
  const f = fixture(t, autonomous); let previous: Receipt | null = null;
  const cliPath = join(repo, 'test/fixtures/pi-study-rpc.mjs');
  const native = createTestNativePiInvocation({ root: f.root, current: f.invocation.current,
    host: { nodePath, nodeSha256: sha256(readFileSync(nodePath)), cliPath, cliSha256: sha256(readFileSync(cliPath)),
      provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'high', parentSessionId: 'refinement-parent' } });
  readPersistedRoute(f.root, native);
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
  assert.equal(next.action, autonomous ? 'stop-blocked' : 'await-user');
  assert.equal('reason' in next && next.reason, 'repeated-defect');
  assert.equal(parseStageWork(JSON.stringify(next))?.awaiting?.reason, autonomous ? undefined : 'repeated-defect');
  const nativeNext = nativeCompletionWork(f.root, native);
  assert.equal(nativeNext.action, autonomous ? 'stop-blocked' : 'await-user');
  if (autonomous) {
    let calls = 0;
    await handleOmdMessageEnd({
      cwd: f.root, message: { role: 'assistant', content: [] },
      run: async args => {
        calls++;
        assert.deepEqual(args, ['stage', 'next', '--json']);
        return { text: JSON.stringify(next), details: { code: 0, killed: false } };
      },
      interrupted: () => false, hasRoute: true, workflowStarted: true,
      ownedWorkStarted: true, productionAttempted: true, revision: 1,
      routeRevision: adaptiveRouteRecordSha256(f.route), repairLoop: new RepairLoop(),
      pi: {
        registerTool() {}, registerCommand() {},
        exec: async () => { throw new Error('unexpected command'); },
        sendMessage: () => { throw new Error('automatic retry after bounded stop'); },
      },
      ui: { select: async () => { throw new Error('ordinary design question'); } },
      onAwaitUser: () => { throw new Error('ordinary user wait'); },
    });
    assert.equal(calls, 1);
  }
  assert.deepEqual(snapshot(f.root), before);
  assert.throws(() => recordRefinementObservation(f.root, { measurement: previous!, repair: previous!, review: previous! }, f.writer, f.invocation));
  assert.deepEqual(snapshot(f.root), before);
});
