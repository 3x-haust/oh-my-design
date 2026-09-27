import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishTestAdaptiveRoute } from './helpers/project-write.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { createAdaptiveSourceSealRoute } from '../core/source-seal/adaptive-inputs.ts';
import { writeSourceSeal } from '../core/source-seal/index.ts';
import { confidenceDebt, recordConfidenceDebt } from '../core/brief/confidence-debt.ts';
import { servedProjectTreeSha256 } from '../core/render/serve.ts';
import { adaptiveFinalOmissionMappings, validateAdaptiveFinalEvidenceV2Graph, type AdaptiveFinalOmission } from '../core/evidence/final-v2-adaptive-contract.ts';
import { validateFinalConfidenceDebt } from '../core/evidence/final-v2-confidence-debt.ts';
import { sha256 } from '../core/measure/identity.ts';

test('greenfield selected art debt is expressible without forging art artifacts or a route skip', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-final-art-debt-'))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = JSON.parse(readFileSync(new URL('./fixtures/adaptive-flow/synth-marketing.json', import.meta.url), 'utf8'));
  const invocation = publishTestAdaptiveRoute(root, input), route = readPersistedRoute(root, invocation);
  writeFileSync(join(root, 'index.html'), '<!doctype html><main>Patch instrument study</main>');
  writeFileSync(join(root, '.omd/copy-deck.md'), 'Current instrument study copy.');
  writeFileSync(join(root, '.omd/composition.md'), `## Production revision binding\n- Production entry: \`index.html\`\n- Production revision SHA-256: \`${servedProjectTreeSha256(root, 'index.html')}\`\n`);
  const items = recordConfidenceDebt(root, route.sourceContractSha256, ['art-direction', 'type-proof'].filter(id => route.strategy.stages.includes(id)).map(id => confidenceDebt(id, `${id} was selected but has no verified result.`)), invocation);
  writeSourceSeal(root, invocation);
  const sourceRoute = createAdaptiveSourceSealRoute(root, invocation), art = sourceRoute.stages.find(s => s.id === 'art-direction');
  assert.ok(art?.status === 'selected'); assert.deepEqual(art.artifacts, []);
  const debtReceipt = { path: '.omd/confidence-debt.json', schema: 'confidence-debt-v1' as const, sha256: sha256(readFileSync(join(root, '.omd/confidence-debt.json'))) };
  const confidence = { schema: 'terminal-confidence-debt-v1' as const, receipt: debtReceipt, limitations: items };
  const receipt = (path: string, schema: string) => ({ path, schema, sha256: 'a'.repeat(64) });
  const omissions = adaptiveFinalOmissionMappings().flatMap(([id, routeSkipId]): AdaptiveFinalOmission[] => {
    const debt = items.filter(item => item.stage === routeSkipId), skip = route.strategy.skips.find(s => s.id === routeSkipId);
    const common = { id, routeSkipId, routeSha256: sourceRoute.record.sha256, authoritySha256: sourceRoute.authority.sha256 };
    if (debt.length) return [{ ...common, status: 'selected-with-debt' as const, reason: debt[0]!.reason, claim: 'not-verified' as const, debtIds: debt.map(d => d.id) }];
    return skip ? [{ ...common, status: 'skipped' as const, reason: skip.reason }] : [];
  });
  const graph = validateAdaptiveFinalEvidenceV2Graph({ schema: 'final-evidence-v2-adaptive-omission-graph', route: sourceRoute, confidenceDebt: confidence, omissions,
    activation: receipt('.omd/activation.json', 'activation-context-v2'), copy: receipt('.omd/copy-deck.md', 'copy-deck-v2'), sourceSeal: receipt('.omd/source-seal.json', 'source-seal-v1'), buildIdentity: receipt('.omd/build.json', 'omd-build-identity-v1'), blindLane: receipt('.omd/blind.json', 'adaptive-blind-review-v3'), fidelityLane: receipt('.omd/fidelity.json', 'adaptive-fidelity-review-v1'), protocolLane: receipt('.omd/protocol.json', 'adaptive-protocol-review-v1'), observations: [receipt('.omd/observation.json', 'observation-v2')] });
  const deferred = graph.omissions.filter(o => o.status === 'selected-with-debt');
  assert.deepEqual(validateFinalConfidenceDebt(root, route, graph.confidenceDebt, deferred, [graph.copy]), items);
  assert.equal(graph.omissions.find(o => o.id === 'artDirection')!.status, 'selected-with-debt');
  const before = readFileSync(join(root, '.omd/confidence-debt.json'));
  assert.throws(() => validateFinalConfidenceDebt(root, route, graph.confidenceDebt, deferred, [debtReceipt]), /cannot be claimed as verified evidence/);
  const claimed = structuredClone(graph); Reflect.set(claimed.confidenceDebt!.limitations[0]!, 'claim', 'verified');
  assert.throws(() => validateAdaptiveFinalEvidenceV2Graph(claimed), /not-verified/);
  assert.deepEqual(readFileSync(join(root, '.omd/confidence-debt.json')), before);
});
