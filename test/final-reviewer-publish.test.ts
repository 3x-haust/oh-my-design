import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { buildFinalReviewerPublication } from '../adapters/final-reviewer-publication.ts';
import { AXIS_METRICS } from '../core/measure/citations.ts';
import { loadMeasurement } from '../core/measure/files.ts';
import { sha256 } from '../core/measure/identity.ts';
import {
  MEASURED_DESIGN_QUALITY_AXES,
  MEASURED_DESIGN_QUALITY_FLOORS,
} from '../core/evidence/final-v2-measured-quality.ts';
import {
  MEASURED_REVIEW_HANDBACK,
  measuredFinalRenderPacket,
} from '../core/runtime/trusted-measured-review.ts';
import { measuredReviewerTask } from '../core/runtime/trusted-review-profile.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';

function canonical(value: unknown): string {
  if (
    value === null
    || typeof value === 'boolean'
    || typeof value === 'number'
    || typeof value === 'string'
  ) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  assert.equal(typeof value, 'object');
  assert.ok(value);
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
    .join(',')}}`;
}

test('signed measured review publishes native bindings and refuses a changed measurement receipt', async () => {
  const fixture = await prepareFinalRenderReviewFixture();
  const { root, invocation, observationSha256s } = fixture;
  try {
    const packetBytes = measuredFinalRenderPacket(root, invocation, observationSha256s);
    const packet = JSON.parse(packetBytes.toString('utf8')) as {
      evidenceSha256: string;
      evidence: {
        renders: Array<{
          observationSha256: string;
          captureSha256: string;
          packetSha256: string;
          viewId: string;
          state: string;
        }>;
      };
      outputContract: {
        laneSchema: string;
        verdictKeys: string[];
        criticalFloorKeys: string[];
        fixedBindings: Record<string, unknown> & {
          measurements: Array<{ path: string; sha256: string }>;
        };
      };
    };
    const packets = new Map(packet.outputContract.fixedBindings.measurements.map((receipt) => [
      receipt.sha256,
      loadMeasurement(root, receipt),
    ]));
    const designQuality = {
      schema: 'design-quality-contract-v2',
      axes: MEASURED_DESIGN_QUALITY_AXES.map((axis) => ({
        axis,
        verdict: 'GREEN',
        score: MEASURED_DESIGN_QUALITY_FLOORS[axis],
        crossViewport: 'preserved',
        criticalFailure: null,
        evidence: packet.evidence.renders.map((render) => {
          const source = packets.get(render.packetSha256);
          assert.ok(source);
          return {
            observationSha256: render.observationSha256,
            captureSha256: render.captureSha256,
            viewId: render.viewId,
            state: render.state,
            regionSubjectIds: [],
            packetSha256: render.packetSha256,
            measurementIds: source.measurements
              .filter((measurement) =>
                measurement.viewIds.includes(render.viewId)
                && measurement.coverage.status === 'complete'
                && (AXIS_METRICS[axis] as readonly string[]).includes(measurement.kind))
              .map(({ id }) => id),
            visibleCondition: 'The measured inventory clears this independent axis.',
            userConsequence: 'The current task remains legible in each required view.',
          };
        }),
      })),
    };
    const handback = {
      schema: MEASURED_REVIEW_HANDBACK,
      lane: 'blindLane',
      verdicts: Object.fromEntries(packet.outputContract.verdictKeys.map((key) => [key, 'GREEN'])),
      criticalFloors: Object.fromEntries(packet.outputContract.criticalFloorKeys.map((key) => [
        key,
        key === 'composition' ? 4 : 3,
      ])),
      designQuality,
      ...packet.outputContract.fixedBindings,
      findings: ['Measured review completed.'],
    };
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const publicKeyPath = join(root, '.omd', 'host-public.pem');
    writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));
    const finalMessage = JSON.stringify(handback);
    const taskSha256 = sha256(measuredReviewerTask('blindLane'));
    const receipt = {
      schema: 'omd-codex-role-exec-result-v1',
      role: 'omd-eye',
      projectRoot: root,
      status: 'completed',
      exitCode: 0,
      signal: null,
      eventCount: 4,
      finalMessage,
      processPid: 401,
      roleNonce: 'measured-role-nonce',
      taskSha256,
      reviewerEvidence: {
        schema: 'omd-reviewer-evidence-consumption-v1',
        evidenceSha256: packet.evidenceSha256,
        packetSha256: sha256(packetBytes),
        taskSha256,
        childPid: 1401,
        sessionId: 'measured-evidence-session',
        nonce: 'measured-evidence-nonce',
      },
      configurationSha256: createHash('sha256').update('configuration').digest('hex'),
      buildSha256: invocation.current.buildSha256,
      briefSha256: invocation.current.briefSha256,
      sessionId: 'measured-role-session',
    };
    const roleResult = {
      schema: 'omd-codex-role-result-v1',
      agent: 'omd-eye',
      projectRoot: root,
      transport: 'codex-exec-stdio-jsonl',
      modelArgumentOmitted: true,
      sessionId: receipt.sessionId,
      eventCount: receipt.eventCount,
      finalMessage,
      result: 'completed',
      authority: {
        receipt,
        signature: sign(null, Buffer.from(canonical(receipt)), privateKey).toString('base64'),
      },
    };
    const input = {
      schema: 'adaptive-final-review-publication-v1',
      laneSchema: packet.outputContract.laneSchema,
      roleResults: [roleResult],
    };
    const context = {
      projectRoot: root,
      buildSha256: invocation.current.buildSha256,
      briefSha256: invocation.current.briefSha256,
      publicKeyPath,
      invocation,
    };

    const publication = buildFinalReviewerPublication(input, context);
    const lane = JSON.parse(publication.lane.bytes.toString('utf8'));
    assert.equal(lane.schema, 'measured-blind-review-v1');
    assert.deepEqual(lane.measurements, packet.outputContract.fixedBindings.measurements);
    assert.deepEqual(lane.quorum, { required: 1, passed: 1 });
    assert.equal(publication.executions.length, 1);

    const changed = structuredClone(handback);
    changed.measurements[0]!.sha256 = '0'.repeat(64);
    const changedMessage = JSON.stringify(changed);
    const changedReceipt = { ...receipt, finalMessage: changedMessage };
    const changedRole = {
      ...roleResult,
      finalMessage: changedMessage,
      authority: {
        receipt: changedReceipt,
        signature: sign(null, Buffer.from(canonical(changedReceipt)), privateKey).toString('base64'),
      },
    };
    assert.throws(
      () => buildFinalReviewerPublication(
        { ...input, roleResults: [changedRole] },
        context,
      ),
      /measured reviewer binding changed: measurements/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
