import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildFinalReviewerPublication } from '../adapters/final-reviewer-publication.ts';
import { DESIGN_QUALITY_AXES } from '../core/evidence/final-v2-design-quality.ts';

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
            observationSha256: hash('a'),
            viewport: 'desktop',
            state: 'initial',
            region: 'primary work surface',
            visibleCondition: 'The work object owns the visual mass.',
            userConsequence: 'The next decision is legible.',
          },
          {
            observationSha256: hash('b'),
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
  build: (
    handback: Record<string, unknown>,
    laneSchema?: string,
  ) => ReturnType<typeof buildFinalReviewerPublication>;
  cleanup: () => void;
}>;

function harness(): Harness {
  const root = mkdtempSync(join(tmpdir(), 'omd-aesthetic-final-v2-'));
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyPath = join(root, 'host-public.pem');
  writeFileSync(
    publicKeyPath,
    publicKey.export({ type: 'spki', format: 'pem' }),
  );

  return {
    root,
    build: (
      handback: Record<string, unknown>,
      laneSchema = 'adaptive-blind-review-v3',
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
          configurationSha256: index === 1 ? hash('1') : hash('2'),
          buildSha256: hash('c'),
          briefSha256: hash('d'),
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
        buildSha256: hash('c'),
        briefSha256: hash('d'),
        publicKeyPath,
      });
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function handback(): Record<string, unknown> {
  return {
    schema: 'adaptive-final-reviewer-handback-v2',
    lane: 'blindLane',
    verdicts: {
      blindVisual: 'GREEN',
      blindNarrative: 'GREEN',
      interactionBenchmarkFit: 'GREEN',
      domainSpecificity: 'GREEN',
      realityFit: 'GREEN',
    },
    criticalFloors: {
      composition: 4,
      copy: 4,
      interactionQuality: 4,
    },
    designQuality: designQuality(),
    observationSha256s: [hash('a'), hash('b')],
    routeSha256: hash('e'),
    buildSha256: hash('c'),
    briefSha256: hash('d'),
    browserSha256: hash('f'),
    evidenceSha256: hash('0'),
    findings: [],
  };
}

test('legacy blind lane cannot authorize a new quality-unassessed result', () => {
  const state = harness();
  try {
    const legacy = handback();
    legacy.schema = 'adaptive-final-reviewer-handback-v1';
    delete legacy.designQuality;
    assert.throws(
      () => state.build(legacy, 'adaptive-blind-review-v2'),
      /DESIGN_QUALITY_MISSING/,
    );
  } finally {
    state.cleanup();
  }
});

test('authorized blind publication requires all six quality axes GREEN', () => {
  const state = harness();
  try {
    const red = handback();
    red.designQuality = designQuality('beautyDesirability');
    assert.throws(
      () => state.build(red),
      /DESIGN_QUALITY_AXIS_RED:beautyDesirability/,
    );

    const missing = handback();
    delete missing.designQuality;
    assert.throws(
      () => state.build(missing),
      /DESIGN_QUALITY_MISSING/,
    );
  } finally {
    state.cleanup();
  }
});

test('quality bytes are preserved in the lane and every execution', () => {
  const state = harness();
  try {
    const quality = designQuality();
    const value = handback();
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
