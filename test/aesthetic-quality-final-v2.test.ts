import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { buildFinalReviewerPublication } from '../adapters/final-reviewer-publication.ts';
import { DESIGN_QUALITY_AXES } from '../core/evidence/final-v2-design-quality.ts';
import {
  FINAL_RENDER_REVIEWER_HANDBACK_SCHEMA,
  FINAL_RENDER_REVIEWER_TASK,
  finalRenderReviewerPacket,
} from '../core/runtime/final-render-review.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';

const hash = (character: string): string => character.repeat(64);

function canonical(value: unknown): string {
  if (
    value === null
    || typeof value === 'boolean'
    || typeof value === 'number'
    || typeof value === 'string'
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  assert.equal(typeof value, 'object');
  assert.ok(value);
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
    .join(',')}}`;
}

function designQuality(
  redAxis?: string,
  desktopObservationSha256 = hash('a'),
  mobileObservationSha256 = hash('b'),
): Record<string, unknown> {
  return {
    schema: 'design-quality-contract-v1',
    axes: DESIGN_QUALITY_AXES.map((axis) => {
      const red = axis === redAxis;
      return {
        axis,
        verdict: red ? 'RED' : 'GREEN',
        score: red
          ? 1
          : axis === 'beautyDesirability' || axis === 'hierarchyComposition'
            ? 4
            : 3,
        crossViewport: red ? 'contradicted' : 'preserved',
        criticalFailure: red ? 'major-optical-imbalance' : null,
        evidence: [
          {
            observationSha256: desktopObservationSha256,
            viewport: 'desktop',
            state: 'initial',
            region: 'primary work surface',
            visibleCondition: 'The work object owns the visual mass.',
            userConsequence: 'The next decision is legible.',
          },
          {
            observationSha256: mobileObservationSha256,
            viewport: 'mobile',
            state: 'initial',
            region: 'primary work surface',
            visibleCondition: 'The same priority is recomposed.',
            userConsequence: 'Decision context remains visible.',
          },
        ],
      };
    }),
  };
}

type Harness = Readonly<{
  root: string;
  observationSha256: string;
  handback: () => Record<string, unknown>;
  build: (
    handback: Record<string, unknown>,
    laneSchema?: string,
  ) => ReturnType<typeof buildFinalReviewerPublication>;
  cleanup: () => void;
}>;

function harness(): Harness {
  const prepared = prepareFinalRenderReviewFixture();
  const { root, invocation } = prepared;
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyPath = join(root, '.omd', 'host-public.pem');
  writeFileSync(
    publicKeyPath,
    publicKey.export({ type: 'spki', format: 'pem' }),
  );
  const packetBytes = finalRenderReviewerPacket({
    root,
    invocation,
    packetInput: {
      schema: 'adaptive-final-render-reviewer-packet-input-v1',
      observationSha256s: prepared.observationSha256s,
    },
  });
  const packetSha256 = createHash('sha256').update(packetBytes).digest('hex');
  const packet = JSON.parse(packetBytes.toString('utf8')) as {
    evidenceSha256: string;
    outputContract: {
      laneSchema: string;
      verdictKeys: string[];
      criticalFloorKeys: string[];
      fixedBindings: {
        observationSha256s: string[];
        routeSha256: string;
        buildSha256: string;
        briefSha256: string;
        browserSha256: string;
        evidenceSha256: string;
      };
    };
  };
  const observationSha256 = prepared.observationSha256s[0]!;
  const taskSha256 = createHash('sha256').update(FINAL_RENDER_REVIEWER_TASK).digest('hex');

  return {
    root,
    observationSha256,
    handback: () => ({
      schema: FINAL_RENDER_REVIEWER_HANDBACK_SCHEMA,
      lane: 'blindLane',
      verdicts: Object.fromEntries(packet.outputContract.verdictKeys.map((key) => [key, 'GREEN'])),
      criticalFloors: Object.fromEntries(packet.outputContract.criticalFloorKeys.map((key) => [key, 4])),
      designQuality: designQuality(undefined, observationSha256, observationSha256),
      ...packet.outputContract.fixedBindings,
      findings: [],
    }),
    build: (
      handback: Record<string, unknown>,
      laneSchema = packet.outputContract.laneSchema,
    ) => {
      const finalMessage = JSON.stringify(handback);
      const roleResult = (index: number) => {
        const receipt = {
          schema: 'omd-codex-role-exec-result-v1',
          role: 'omd-eye',
          projectRoot: root,
          status: 'completed',
          exitCode: 0,
          signal: null,
          eventCount: 4,
          finalMessage,
          processPid: 100 + index,
          roleNonce: `nonce-${index}`,
          taskSha256,
          reviewerEvidence: {
            schema: 'omd-reviewer-evidence-consumption-v1',
            evidenceSha256: packet.evidenceSha256,
            packetSha256,
            taskSha256,
            childPid: 100 + index,
            sessionId: `session-${index}`,
            nonce: `nonce-${index}`,
          },
          configurationSha256: hash('1'),
          buildSha256: invocation.current.buildSha256,
          briefSha256: invocation.current.briefSha256,
          sessionId: `session-${index}`,
        };
        return {
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
            signature: sign(
              null,
              Buffer.from(canonical(receipt)),
              privateKey,
            ).toString('base64'),
          },
        };
      };
      return buildFinalReviewerPublication({
        schema: 'adaptive-final-review-publication-v1',
        laneSchema,
        roleResults: [roleResult(1), roleResult(2)],
      }, {
        projectRoot: root,
        buildSha256: invocation.current.buildSha256,
        briefSha256: invocation.current.briefSha256,
        publicKeyPath,
        invocation,
      });
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test('blind lane cannot authorize a quality-unassessed result', () => {
  const state = harness();
  try {
    const legacy = state.handback();
    delete legacy.designQuality;
    assert.throws(
      () => state.build(legacy),
      /FINAL_REVIEW_PUBLICATION_INVALID:handback\[0\]/,
    );
  } finally {
    state.cleanup();
  }
});

test('authorized blind publication requires all six quality axes GREEN', () => {
  const state = harness();
  try {
    const red = state.handback();
    red.designQuality = designQuality('beautyDesirability', state.observationSha256, state.observationSha256);
    assert.throws(
      () => state.build(red),
      /DESIGN_QUALITY_AXIS_RED:beautyDesirability/,
    );

    const missing = state.handback();
    delete missing.designQuality;
    assert.throws(
      () => state.build(missing),
      /FINAL_REVIEW_PUBLICATION_INVALID:handback\[0\]/,
    );
  } finally {
    state.cleanup();
  }
});

test('quality bytes are preserved in the lane and every execution', () => {
  const state = harness();
  try {
    const quality = designQuality(undefined, state.observationSha256, state.observationSha256);
    const value = state.handback();
    value.designQuality = quality;
    const publication = state.build(value);
    const lane = JSON.parse(publication.lane.bytes.toString('utf8')) as {
      designQuality: unknown;
    };
    assert.deepEqual(lane.designQuality, quality);
    for (const execution of publication.executions) {
      const parsed = JSON.parse(execution.bytes.toString('utf8')) as {
        designQuality: unknown;
      };
      assert.deepEqual(parsed.designQuality, quality);
    }
  } finally {
    state.cleanup();
  }
});

test('publication rejects a quality claim whose state is absent from the bound aggregate observation', () => {
  const state = harness();
  try {
    const value = state.handback();
    const quality = value.designQuality as Record<string, unknown>;
    const axes = quality.axes as Record<string, unknown>[];
    const evidence = axes[0]?.evidence as Record<string, unknown>[];
    if (evidence[1] !== undefined) evidence[1].state = 'invented-mobile-state';
    assert.throws(
      () => state.build(value),
      /DESIGN_QUALITY_EVIDENCE_INVALID:beautyDesirability/,
    );
  } finally {
    state.cleanup();
  }
});
