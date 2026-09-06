import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { buildFinalReviewerPublication } from '../adapters/final-reviewer-publication.ts';
import { DESIGN_QUALITY_AXES } from '../core/evidence/final-v2-design-quality.ts';

const cli = new URL('../bin/omd.mjs', import.meta.url);
const hash = (character: string): string => character.repeat(64);
const canonical = (value: unknown): string => {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  assert.equal(typeof value, 'object');
  assert.ok(value);
  const entries = Object.entries(value);
  return `{${entries.sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
};

test('Given forged Eye results When review publish runs Then no lane authority is created', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-final-review-forged-'));
  try {
    const input = join(root, 'publication.json');
    writeFileSync(input, JSON.stringify({
      schema: 'adaptive-final-review-publication-v1',
      laneSchema: 'adaptive-fidelity-review-v1',
      roleResults: [{ result: 'completed', finalMessage: '{"verdicts":{"renderFidelity":"GREEN"}}' }],
    }));

    const result = spawnSync(process.execPath, [
      cli.pathname,
      'review',
      'publish',
      '--input',
      input,
    ], { cwd: root, encoding: 'utf8' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /FINAL_REVIEW_ROLE_AUTHORITY_REJECTED/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Given a forged repair review When repair publish runs Then no source authority is created', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-production-repair-forged-'));
  try {
    const input = join(root, 'repair-publication.json');
    writeFileSync(input, JSON.stringify({
      schema: 'production-repair-review-publication-v1',
      roleResult: { result: 'completed', finalMessage: '{"schema":"production-repair-review-v1"}' },
    }));

    const result = spawnSync(process.execPath, [
      cli.pathname,
      'review',
      'repair-publish',
      '--input',
      input,
    ], { cwd: root, encoding: 'utf8' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /FINAL_REVIEW_ROLE_AUTHORITY_REJECTED/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Given two signed independent Eye results When publication builds Then one quorum lane is emitted', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-final-review-signed-'));
  try {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const publicKeyPath = join(root, 'host-public.pem');
    writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));
    const handback = JSON.stringify({
      schema: 'adaptive-final-reviewer-handback-v2',
      lane: 'blindLane',
      verdicts: {
        blindVisual: 'GREEN',
        blindNarrative: 'GREEN',
        interactionBenchmarkFit: 'GREEN',
        domainSpecificity: 'GREEN',
        realityFit: 'GREEN',
      },
      criticalFloors: { composition: 3, copy: 3, interactionQuality: 3 },
      designQuality: {
        schema: 'design-quality-contract-v1',
        axes: DESIGN_QUALITY_AXES.map((axis) => ({
          axis,
          verdict: 'GREEN',
          score:
            axis === 'beautyDesirability' || axis === 'hierarchyComposition'
              ? 4
              : 3,
          crossViewport: 'preserved',
          criticalFailure: null,
          evidence: [
            {
              observationSha256: hash('a'),
              viewport: 'desktop',
              state: 'initial',
              region: 'primary work surface',
              visibleCondition: 'The intended priority is visible.',
              userConsequence: 'The next decision is legible.',
            },
            {
              observationSha256: hash('b'),
              viewport: 'mobile',
              state: 'initial',
              region: 'primary work surface',
              visibleCondition: 'The priority is recomposed.',
              userConsequence: 'Decision context remains available.',
            },
          ],
        })),
      },
      observationSha256s: [hash('a'), hash('b')],
      routeSha256: hash('b'),
      buildSha256: hash('c'),
      briefSha256: hash('d'),
      browserSha256: hash('e'),
      evidenceSha256: hash('f'),
      findings: [],
    });
    const roleResult = (index: number) => {
      const receipt = {
        schema: 'omd-codex-role-exec-result-v1',
        role: 'omd-eye',
        projectRoot: root,
        status: 'completed',
        exitCode: 0,
        signal: null,
        eventCount: 4,
        finalMessage: handback,
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
        finalMessage: handback,
        result: 'completed',
        authority: {
          receipt,
          signature: sign(null, Buffer.from(canonical(receipt)), privateKey).toString('base64'),
        },
      };
    };

    const publication = buildFinalReviewerPublication({
      schema: 'adaptive-final-review-publication-v1',
      laneSchema: 'adaptive-blind-review-v3',
      roleResults: [roleResult(1), roleResult(2)],
    }, {
      projectRoot: root,
      buildSha256: hash('c'),
      briefSha256: hash('d'),
      publicKeyPath,
    });

    assert.equal(publication.executions.length, 2);
    const lane = JSON.parse(publication.lane.bytes.toString('utf8')) as {
      quorum: { required: number; passed: number };
      provenance: { reviewerIds: string[] };
    };
    assert.deepEqual(lane.quorum, { required: 2, passed: 2 });
    assert.equal(new Set(lane.provenance.reviewerIds).size, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
