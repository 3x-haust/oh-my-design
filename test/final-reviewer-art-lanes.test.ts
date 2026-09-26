import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { buildFinalReviewerPublication } from '../adapters/final-reviewer-publication.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';

for (const lane of [
  { schema: 'fidelity-review-v1', lane: 'fidelityLane', verdicts: { referenceFidelity: 'GREEN', renderFidelity: 'GREEN' }, floors: { desktop: 3, mobile: 3 } },
  { schema: 'protocol-review-v1', lane: 'protocolLane', verdicts: { evidenceIntegrity: 'GREEN', publicationProtocol: 'GREEN' }, floors: { authority: 3, currentness: 3 } },
] as const) {
  test(`Given an art-selected route When signed ${lane.lane} is published Then execution binds current art direction`, () => {
    const { root, invocation, observationSha256s } = prepareFinalRenderReviewFixture('synth-marketing');
    try {
      const pointer: unknown = JSON.parse(readFileSync(join(root, '.omd/art-direction.json'), 'utf8'));
      assert.ok(pointer && typeof pointer === 'object' && 'sha256' in pointer);
      const direction = pointer.sha256;
      const keys = generateKeyPairSync('ed25519');
      const publicKeyPath = join(root, 'review-key.pem');
      writeFileSync(publicKeyPath, keys.publicKey.export({ type: 'spki', format: 'pem' }));
      const finalMessage = JSON.stringify({
        schema: 'adaptive-final-reviewer-handback-v1', lane: lane.lane,
        verdicts: lane.verdicts, criticalFloors: lane.floors, observationSha256s,
        routeSha256: 'a'.repeat(64), artDirectionSha256: direction,
        buildSha256: invocation.current.buildSha256, briefSha256: invocation.current.briefSha256,
        browserSha256: 'b'.repeat(64), evidenceSha256: 'c'.repeat(64), findings: [],
      });
      const roleResults = [1, 2].map((index) => {
        const receipt = {
          schema: 'omd-codex-role-exec-result-v1', role: 'omd-eye', projectRoot: root,
          status: 'completed', exitCode: 0, signal: null, eventCount: 1, finalMessage,
          processPid: 400 + index, roleNonce: `nonce-${index}`, sessionId: `session-${index}`,
          configurationSha256: createHash('sha256').update(String(index)).digest('hex'),
          buildSha256: invocation.current.buildSha256, briefSha256: invocation.current.briefSha256,
        };
        return {
          schema: 'omd-codex-role-result-v1', agent: 'omd-eye', projectRoot: root, result: 'completed', finalMessage,
          authority: { receipt, signature: sign(null, Buffer.from(canonicalJson(receipt).trimEnd()), keys.privateKey).toString('base64') },
        };
      });
      const publication = buildFinalReviewerPublication({
        schema: 'adaptive-final-review-publication-v1', laneSchema: lane.schema, roleResults,
      }, { projectRoot: root, invocation, publicKeyPath, ...invocation.current });
      const value: unknown = JSON.parse(publication.lane.bytes.toString());
      assert.ok(value && typeof value === 'object' && 'artDirectionSha256' in value);
      assert.equal(value.artDirectionSha256, direction);
      for (const execution of publication.executions) {
        const value: unknown = JSON.parse(execution.bytes.toString());
        assert.ok(value && typeof value === 'object' && 'schema' in value);
        assert.equal(value.schema, 'final-reviewer-execution-v1');
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
