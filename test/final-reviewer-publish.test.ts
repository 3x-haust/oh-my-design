import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { buildFinalReviewerPublication } from '../adapters/final-reviewer-publication.ts';
import { DESIGN_QUALITY_AXES } from '../core/evidence/final-v2-design-quality.ts';
import {
  FINAL_RENDER_REVIEWER_TASK,
  finalRenderReviewerPacket,
} from '../core/runtime/final-render-review.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';
import { createTestProjectRunInvocation } from './helpers/project-write.ts';

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

test('signed fidelity and protocol lanes retain their authenticated non-visual publication path', () => {
  for (const lane of [
    {
      schema: 'adaptive-fidelity-review-v1',
      handbackSchema: 'adaptive-final-reviewer-handback-v1',
      lane: 'fidelityLane',
      verdicts: { referenceFidelity: 'GREEN', renderFidelity: 'GREEN' },
      criticalFloors: { desktop: 3, mobile: 3 },
    },
    {
      schema: 'adaptive-protocol-review-v1',
      handbackSchema: 'adaptive-final-reviewer-handback-v1',
      lane: 'protocolLane',
      verdicts: { evidenceIntegrity: 'GREEN', publicationProtocol: 'GREEN' },
      criticalFloors: { authority: 3, currentness: 3 },
    },
  ] as const) {
    const root = mkdtempSync(join(tmpdir(), `omd-${lane.lane}-`));
    try {
      const invocation = createTestProjectRunInvocation(root, `${lane.lane} brief`);
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      const publicKeyPath = join(root, 'host-public.pem');
      writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));
      const finalMessage = JSON.stringify({
        schema: lane.handbackSchema,
        lane: lane.lane,
        verdicts: lane.verdicts,
        criticalFloors: lane.criticalFloors,
        observationSha256s: [hash('a')],
        routeSha256: hash('b'),
        buildSha256: invocation.current.buildSha256,
        briefSha256: invocation.current.briefSha256,
        browserSha256: hash('c'),
        evidenceSha256: hash('d'),
        findings: [],
      });
      const roleResult = (index: number) => {
        const receipt = {
          schema: 'omd-codex-role-exec-result-v1', role: 'omd-eye', projectRoot: root,
          status: 'completed', exitCode: 0, signal: null, eventCount: 1, finalMessage,
          processPid: 200 + index, roleNonce: `nonce-${index}`,
          configurationSha256: index === 1 ? hash('1') : hash('2'),
          buildSha256: invocation.current.buildSha256,
          briefSha256: invocation.current.briefSha256,
          sessionId: `session-${index}`,
        };
        return {
          schema: 'omd-codex-role-result-v1', agent: 'omd-eye', projectRoot: root,
          result: 'completed', finalMessage,
          authority: {
            receipt,
            signature: sign(null, Buffer.from(canonical(receipt)), privateKey).toString('base64'),
          },
        };
      };
      const publication = buildFinalReviewerPublication({
        schema: 'adaptive-final-review-publication-v1',
        laneSchema: lane.schema,
        roleResults: [roleResult(1), roleResult(2)],
      }, {
        projectRoot: root,
        buildSha256: invocation.current.buildSha256,
        briefSha256: invocation.current.briefSha256,
        publicKeyPath,
        invocation,
      });
      assert.equal(JSON.parse(publication.lane.bytes.toString('utf8')).schema, lane.schema);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('distinct signed Eye assessments are preserved and conservatively aggregated', () => {
  const fixture = prepareFinalRenderReviewFixture();
  const { root, invocation, observationSha256s } = fixture;
  try {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const publicKeyPath = join(root, '.omd', 'host-public.pem');
    writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));
    const digest = (value: Uint8Array | string): string =>
      createHash('sha256').update(value).digest('hex');
    const packetBytes = finalRenderReviewerPacket({
      root,
      invocation,
      packetInput: {
        schema: 'adaptive-final-render-reviewer-packet-input-v1',
        observationSha256s,
      },
    });
    const packet = JSON.parse(packetBytes.toString('utf8')) as {
      evidenceSha256: string;
      evidence: { observationProjection: { observations: Array<{
        observationSha256: string;
        viewport: 'desktop' | 'mobile';
        state: string;
      }> } };
      outputContract: {
        laneSchema: string;
        verdictKeys: string[];
        criticalFloorKeys: string[];
        fixedBindings: Record<string, unknown>;
      };
    };
    const desktopProjection = packet.evidence.observationProjection.observations
      .find(({ viewport }) => viewport === 'desktop');
    const mobileProjection = packet.evidence.observationProjection.observations
      .find(({ viewport }) => viewport === 'mobile');
    assert.ok(desktopProjection);
    assert.ok(mobileProjection);
    const assessment = (index: number) => ({
      schema: 'adaptive-final-render-reviewer-handback-v1',
      lane: 'blindLane',
      verdicts: Object.fromEntries(packet.outputContract.verdictKeys.map((key) => [key, 'GREEN'])),
      criticalFloors: Object.fromEntries(packet.outputContract.criticalFloorKeys.map((key) => [key, index === 1 ? 4 : 3])),
      designQuality: {
        schema: 'design-quality-contract-v1',
        axes: DESIGN_QUALITY_AXES.map((axis) => ({
          axis,
          verdict: 'GREEN',
          score:
            axis === 'beautyDesirability' || axis === 'hierarchyComposition'
              ? 4
              : axis === 'usability' && index === 1 ? 4 : 3,
          crossViewport: axis === 'responsiveCraft' && index === 1 ? 'weakened' : 'preserved',
          criticalFailure: null,
          evidence: [
            {
              observationSha256: desktopProjection.observationSha256,
              viewport: desktopProjection.viewport,
              state: desktopProjection.state,
              region: `reviewer ${index} desktop surface`,
              visibleCondition: `Reviewer ${index} desktop rationale.`,
              userConsequence: `Reviewer ${index} desktop consequence.`,
            },
            {
              observationSha256: mobileProjection.observationSha256,
              viewport: mobileProjection.viewport,
              state: mobileProjection.state,
              region: `reviewer ${index} mobile surface`,
              visibleCondition: `Reviewer ${index} mobile rationale.`,
              userConsequence: `Reviewer ${index} mobile consequence.`,
            },
          ],
        })),
      },
      ...packet.outputContract.fixedBindings,
      findings: [`Reviewer ${index} finding.`],
    });
    const roleResult = (index: number, value = assessment(index)) => {
      const handback = JSON.stringify(value);
      const taskSha256 = digest(FINAL_RENDER_REVIEWER_TASK);
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
        taskSha256,
        reviewerEvidence: {
          schema: 'omd-reviewer-evidence-consumption-v1',
          evidenceSha256: packet.evidenceSha256,
          packetSha256: digest(packetBytes),
          taskSha256,
          childPid: 1000 + index,
          sessionId: `evidence-session-${index}`,
          nonce: `evidence-nonce-${index}`,
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
      laneSchema: packet.outputContract.laneSchema,
      roleResults: [roleResult(1), roleResult(2)],
    }, {
      projectRoot: root,
      buildSha256: invocation.current.buildSha256,
      briefSha256: invocation.current.briefSha256,
      publicKeyPath,
      invocation,
    });

    assert.equal(publication.executions.length, 2);
    const lane = JSON.parse(publication.lane.bytes.toString('utf8')) as {
      quorum: { required: number; passed: number };
      provenance: { reviewerIds: string[] };
      criticalFloors: Record<string, number>;
      designQuality: { axes: Array<{ axis: string; score: number; crossViewport: string; evidence: Array<{ region: string }> }> };
    };
    assert.deepEqual(lane.quorum, { required: 2, passed: 2 });
    assert.equal(new Set(lane.provenance.reviewerIds).size, 2);
    assert.ok(Object.values(lane.criticalFloors).every((floor) => floor === 3));
    assert.equal(lane.designQuality.axes.find(({ axis }) => axis === 'usability')?.score, 3);
    assert.equal(lane.designQuality.axes.find(({ axis }) => axis === 'responsiveCraft')?.crossViewport, 'weakened');
    assert.match(lane.designQuality.axes.find(({ axis }) => axis === 'usability')?.evidence[0]?.region ?? '', /reviewer 2/);
    const executions = publication.executions.map(({ bytes }) => JSON.parse(bytes.toString('utf8')) as {
      findings: string[];
      designQuality: { axes: Array<{ evidence: Array<{ region: string }> }> };
    });
    assert.deepEqual(executions.map(({ findings }) => findings), [
      ['Reviewer 1 finding.'],
      ['Reviewer 2 finding.'],
    ]);
    assert.match(executions[0]?.designQuality.axes[0]?.evidence[0]?.region ?? '', /reviewer 1/);
    assert.match(executions[1]?.designQuality.axes[0]?.evidence[0]?.region ?? '', /reviewer 2/);
    const red = assessment(2);
    red.verdicts.blindVisual = 'RED';
    assert.throws(() => buildFinalReviewerPublication({
      schema: 'adaptive-final-review-publication-v1',
      laneSchema: packet.outputContract.laneSchema,
      roleResults: [roleResult(1), roleResult(2, red)],
    }, {
      projectRoot: root,
      buildSha256: invocation.current.buildSha256,
      briefSha256: invocation.current.briefSha256,
      publicKeyPath,
      invocation,
    }), /handback\[1\]\.verdicts\.blindVisual/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('art-selected blind publication binds the exact current art direction packet', () => {
  const { root, invocation, observationSha256s } = prepareFinalRenderReviewFixture('synth-marketing');
  try {
    const digest = (value: Uint8Array | string): string =>
      createHash('sha256').update(value).digest('hex');
    const packetBytes = finalRenderReviewerPacket({
      root,
      invocation,
      packetInput: { schema: 'adaptive-final-render-reviewer-packet-input-v1', observationSha256s },
    });
    const packet = JSON.parse(packetBytes.toString('utf8')) as {
      evidenceSha256: string;
      evidence: { observationProjection: { observations: Array<{ observationSha256: string; viewport: 'desktop' | 'mobile'; state: string }> } };
      outputContract: {
        laneSchema: 'blind-review-v2'; verdictKeys: string[]; criticalFloorKeys: string[];
        fixedBindings: Record<string, unknown> & { artDirectionSha256: string };
      };
    };
    const desktop = packet.evidence.observationProjection.observations.find(({ viewport }) => viewport === 'desktop');
    const mobile = packet.evidence.observationProjection.observations.find(({ viewport }) => viewport === 'mobile');
    assert.ok(desktop); assert.ok(mobile);
    const handback = JSON.stringify({
      schema: 'adaptive-final-render-reviewer-handback-v1', lane: 'blindLane',
      verdicts: Object.fromEntries(packet.outputContract.verdictKeys.map((key) => [key, 'GREEN'])),
      criticalFloors: Object.fromEntries(packet.outputContract.criticalFloorKeys.map((key) => [key, 4])),
      designQuality: {
        schema: 'design-quality-contract-v1',
        axes: DESIGN_QUALITY_AXES.map((axis) => ({
          axis, verdict: 'GREEN', score: axis === 'beautyDesirability' || axis === 'hierarchyComposition' ? 4 : 3,
          crossViewport: 'preserved', criticalFailure: null,
          evidence: [desktop, mobile].map((item) => ({
            observationSha256: item.observationSha256, viewport: item.viewport, state: item.state,
            region: 'primary surface', visibleCondition: 'The hierarchy is visible.',
            userConsequence: 'The task remains legible.',
          })),
        })),
      },
      ...packet.outputContract.fixedBindings,
      findings: [],
    });
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const publicKeyPath = join(root, '.omd', 'host-public.pem');
    writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));
    const taskSha256 = digest(FINAL_RENDER_REVIEWER_TASK);
    const roleResult = (index: number) => {
      const receipt = {
        schema: 'omd-codex-role-exec-result-v1', role: 'omd-eye', projectRoot: root,
        status: 'completed', exitCode: 0, signal: null, eventCount: 1, finalMessage: handback,
        processPid: 300 + index, roleNonce: `art-nonce-${index}`, taskSha256,
        reviewerEvidence: {
          schema: 'omd-reviewer-evidence-consumption-v1', evidenceSha256: packet.evidenceSha256,
          packetSha256: digest(packetBytes), taskSha256, childPid: 1300 + index,
          sessionId: `art-evidence-session-${index}`, nonce: `art-evidence-nonce-${index}`,
        },
        configurationSha256: hash('4'), buildSha256: invocation.current.buildSha256,
        briefSha256: invocation.current.briefSha256, sessionId: `art-session-${index}`,
      };
      return {
        schema: 'omd-codex-role-result-v1', agent: 'omd-eye', projectRoot: root,
        result: 'completed', finalMessage: handback,
        authority: { receipt, signature: sign(null, Buffer.from(canonical(receipt)), privateKey).toString('base64') },
      };
    };
    const input = {
      schema: 'adaptive-final-review-publication-v1', laneSchema: packet.outputContract.laneSchema,
      roleResults: [roleResult(1), roleResult(2)],
    };
    const context = {
      projectRoot: root, buildSha256: invocation.current.buildSha256,
      briefSha256: invocation.current.briefSha256, publicKeyPath, invocation,
    };
    const publication = buildFinalReviewerPublication(input, context);
    const lane = JSON.parse(publication.lane.bytes.toString('utf8')) as { artDirectionSha256: string };
    assert.equal(lane.artDirectionSha256, packet.outputContract.fixedBindings.artDirectionSha256);
    const pointer = JSON.parse(readFileSync(join(root, '.omd', 'art-direction.json'), 'utf8')) as { record: string };
    writeFileSync(join(root, '.omd', pointer.record), '{}\n');
    assert.throws(() => buildFinalReviewerPublication(input, context), /art-direction/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
