import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { buildRefinementReviewerPublication } from '../adapters/refinement-reviewer-publication.ts';
import { codexPayloadAuthorizationPhaseError } from '../adapters/codex-host-launcher.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { servedProjectTreeSha256 } from '../core/render/serve.ts';
import { adaptiveRouteRecordSha256, readPersistedRoute } from '../core/route/index.ts';
import {
  classifyRenderedRefinement,
  commitRenderedRefinementCheckpoint,
  inspectRenderedRefinementEvidence,
  renderedRefinementReviewerPacket,
  RENDERED_REFINEMENT_REVIEWER_TASK,
  RenderedRefinementError,
  validateCurrentRenderedRefinementCheckpoint,
} from '../core/runtime/rendered-refinement.ts';
import { observationV2Sha256, writeObservationV2 } from '../core/runtime/observation.ts';
import { currentProductionRepairScopeSha256 } from '../core/runtime/production-repair.ts';
import {
  TRUSTED_BROWSER_RECEIPT_SCHEMA,
  trustedBrowserReceiptSha256,
  type TrustedBrowserReceipt,
} from '../core/runtime/trusted-browser-receipt.ts';
import { browserFixturePng, writeBrowserDecisionFixture } from './helpers/browser-observation-decision-links.ts';
import {
  authorizeTestProjectRunPayloads,
  createTestProjectWriteAdapter,
  publishTestAdaptiveRoute,
} from './helpers/project-write.ts';

const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const roleCanonical = (value: unknown): string => {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(roleCanonical).join(',')}]`;
  assert.equal(typeof value, 'object');
  assert.ok(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${roleCanonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
};
const routeFixture = (): unknown => JSON.parse(readFileSync(
  new URL('./fixtures/adaptive-flow/copy-only.json', import.meta.url),
  'utf8',
));

function roleResult(input: Readonly<{
  root: string;
  privateKey: KeyObject;
  handback: string;
  index: number;
  buildSha256: string;
  briefSha256: string;
  packetSha256: string;
}>): object {
  const taskSha256 = hash(RENDERED_REFINEMENT_REVIEWER_TASK);
  const evidenceSha256 = (JSON.parse(input.handback) as { evidenceSha256: string }).evidenceSha256;
  const receipt = {
    schema: 'omd-codex-role-exec-result-v1', role: 'omd-eye', projectRoot: input.root,
    status: 'completed', exitCode: 0, signal: null, eventCount: 4, finalMessage: input.handback,
    processPid: 900 + input.index, roleNonce: `refinement-nonce-${input.index}`,
    configurationSha256: 'c'.repeat(64), buildSha256: input.buildSha256,
    briefSha256: input.briefSha256, sessionId: `refinement-session-${input.index}`,
    taskSha256,
    reviewerEvidence: {
      schema: 'omd-reviewer-evidence-consumption-v1', evidenceSha256,
      packetSha256: input.packetSha256, taskSha256, childPid: 1200 + input.index,
      sessionId: `evidence-session-${input.index}`, nonce: `evidence-nonce-${input.index}`,
    },
  };
  return {
    schema: 'omd-codex-role-result-v1', agent: 'omd-eye', projectRoot: input.root,
    transport: 'codex-exec-stdio-jsonl', modelArgumentOmitted: true,
    sessionId: receipt.sessionId, eventCount: 4, finalMessage: input.handback,
    result: 'completed', authority: {
      receipt,
      signature: sign(null, Buffer.from(roleCanonical(receipt)), input.privateKey).toString('base64'),
    },
  };
}

function project(beforePasses = false, incompleteAfterOutcomeCoverage = false) {
  const root = mkdtempSync(join(tmpdir(), 'omd-rendered-refinement-'));
  mkdirSync(join(root, 'src', 'copy'), { recursive: true });
  mkdirSync(join(root, '.omd'), { recursive: true });
  const productionPath = 'src/copy/index.html';
  writeFileSync(join(root, productionPath), '<h1>Before</h1>');
  const invocation = publishTestAdaptiveRoute(root, routeFixture(), 'rendered-refinement');
  const writer = createTestProjectWriteAdapter(root, invocation);
  const route = readPersistedRoute(root, invocation);
  const routeSha256 = adaptiveRouteRecordSha256(route);
  const decisionFixture = writeBrowserDecisionFixture(root);
  const decisionGraphSha256 = hash(readFileSync(join(root, '.omd', 'decision-graph.json')));
  writer.writeContentAddressed(
    `.omd/decision-graphs/sha256-${decisionGraphSha256}.json`,
    readFileSync(join(root, '.omd', 'decision-graph.json')),
  );
  const buildPath = '.omd/build-identity.json';
  const buildBytes = Buffer.from(`${canonicalJson({
    schemaVersion: 'omd-build-identity-v1', packageVersion: 'test',
    buildSha256: invocation.current.buildSha256,
    sourceSkillSha256: invocation.current.loadedSkillSha256,
  })}\n`);
  writer.write(buildPath, buildBytes);
  const currentArtifact = { path: buildPath, sha256: hash(buildBytes) };

  const observe = (label: 'before' | 'after', passes: boolean) => {
    const captures = [
      { viewport: { width: 1280, height: 900 }, id: 'desktop' },
      { viewport: { width: 390, height: 844 }, id: 'mobile' },
    ].map(({ viewport, id }) => {
      const bytes = browserFixturePng(viewport.width, viewport.height);
      const captureSha256 = hash(bytes);
      const path = `.omd/evaluation-runs/${label}/${id}-sha256-${captureSha256}.png`;
      writer.writeContentAddressed(path, bytes);
      return { path, sha256: captureSha256, width: viewport.width, height: viewport.height, outcomeRef: 'must-have:0' };
    });
    const productionRevisionSha256 = servedProjectTreeSha256(root, productionPath);
    const receipt: TrustedBrowserReceipt = {
      schema: TRUSTED_BROWSER_RECEIPT_SCHEMA,
      runId: `run-${label}`,
      routeSha256,
      sourceContractSha256: route.sourceContractSha256,
      activationBuildSha256: invocation.current.buildSha256,
      productionRevisionSha256,
      productionPath,
      testedUrl: 'http://127.0.0.1/src/copy/index.html',
      decisionGraphSha256,
      outcomeResults: [{
        outcomeRef: 'must-have:0', status: passes ? 'pass' : 'fail',
        findings: passes ? [] : ['required-visible-result-missing'],
      }, ...(incompleteAfterOutcomeCoverage && label === 'after' ? [{
        outcomeRef: 'must-have:1', status: 'pass' as const, findings: [],
      }] : [])],
      confirmedClaimRefs: [],
      decisionRefs: ['decision:hero-strategy'],
      hardFloors: { behavior: passes ? 'pass' : 'fail', access: 'pass', safety: 'pass' },
      captures,
      transcript: [`assertion-${passes ? 'pass' : 'fail'}:${hash(label)}`],
    };
    const receiptSha256 = trustedBrowserReceiptSha256(receipt);
    writer.writeContentAddressed(
      `.omd/trusted-browser-receipt-sha256-${receiptSha256}.json`,
      `${canonicalJson(receipt)}\n`,
    );
    const browser = decisionFixture.evidence(captures.map((capture) => ({
      testedState: `${label}-${capture.width}`,
      path: capture.path,
      sha256: capture.sha256,
      viewport: { width: capture.width, height: capture.height },
    })));
    const observation = writeObservationV2(root, {
      currentArtifact,
      buildSha256: invocation.current.buildSha256,
      evidence: {
        trustedOutcome: {
          schema: 'trusted-outcome-observation-v1', receiptSha256, routeSha256,
          sourceContractSha256: route.sourceContractSha256,
          activationBuildSha256: invocation.current.buildSha256,
          productionRevisionSha256, outcomeResults: receipt.outcomeResults,
          confirmedClaimRefs: [], decisionRefs: receipt.decisionRefs,
          hardFloors: receipt.hardFloors, captureSha256s: captures.map(({ sha256 }) => sha256),
          transcriptSha256: hash(canonicalJson(receipt.transcript)),
        },
        ...browser,
      },
    }, writer, invocation);
    return { observation, sha256: observationV2Sha256(observation) };
  };

  const beforeSource = readFileSync(join(root, productionPath));
  const before = observe('before', beforePasses);
  const beforePointer = readFileSync(join(root, '.omd', 'observation-v2.json'));
  const afterSource = Buffer.from('<h1>After</h1>');
  writeFileSync(join(root, productionPath), afterSource);
  const repairReview = Buffer.from(`${canonicalJson({
    schema: 'production-repair-review-v1', observationPointerSha256: hash(beforePointer),
    retentionPointerSha256: null, beforeSha256: hash(beforeSource), afterSha256: hash(afterSource),
    suggestedPaths: [productionPath], findingIds: ['review:visible-result'],
  })}\n`);
  const repairReviewSha256 = hash(repairReview);
  writer.writeContentAddressed(`.omd/final-review/repairs/sha256-${repairReviewSha256}.json`, repairReview);
  writer.writeContentAddressed(`.omd/production-repair-blobs/sha256-${hash(beforeSource)}.bin`, beforeSource);
  writer.writeContentAddressed(`.omd/production-repair-blobs/sha256-${hash(afterSource)}.bin`, afterSource);
  authorizeTestProjectRunPayloads(root, invocation, [{ purpose: 'final-reviewer-lane', payload: repairReview }]);
  const outcomeBytes = Buffer.from(`${canonicalJson({
    schema: 'omd-production-repair-outcome-v3', outcome: 'committed', path: productionPath,
    beforeTreeSha256: hash(beforeSource), afterTreeSha256: hash(afterSource), routeSha256,
    sliceSha256: currentProductionRepairScopeSha256(root, invocation),
    reviewSha256: repairReviewSha256, predecessorSha256: before.sha256,
    mode: 0o644,
  })}\n`);
  writer.writeContentAddressed(`.omd/production-repairs/sha256-${hash(outcomeBytes)}.json`, outcomeBytes);
  const after = observe('after', true);
  return { root, invocation, writer, routeSha256, before, after };
}

test('rendered refinement revalidates actual desktop/mobile PNG bytes and lets a repair fix a RED baseline', () => {
  const value = project(false);
  try {
    const evidence = inspectRenderedRefinementEvidence({ root: value.root, invocation: value.invocation });
    assert.equal(evidence.before.observedGates.task, 'fail');
    assert.deepEqual(evidence.after.observedGates, { task: 'pass', accessibility: 'pass', safety: 'pass' });
    assert.deepEqual([...new Set(evidence.after.captures.map(({ viewport }) => viewport))].sort(), ['desktop', 'mobile']);
    const packet = renderedRefinementReviewerPacket({ root: value.root, invocation: value.invocation });
    const transport = JSON.parse(packet.toString('utf8')) as { evidenceSha256: string; evidence: unknown };
    assert.equal(transport.evidenceSha256, evidence.evidenceSha256);
    assert.equal(hash(Buffer.from(canonicalJson(transport.evidence))), evidence.evidenceSha256);
    assert.match(packet.toString('utf8'), /pngBase64/);
    assert.doesNotMatch(packet.toString('utf8'), /"(?:before|after|productionPath|productionRepairOutcomeSha256)"/);
    writeFileSync(join(value.root, evidence.after.captures[0]!.path), Buffer.from('stale'));
    assert.throws(
      () => inspectRenderedRefinementEvidence({ root: value.root, invocation: value.invocation }),
      (error: unknown) => error instanceof RenderedRefinementError && error.code === 'REFINEMENT_CAPTURE_STALE',
    );
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('refinement publication preserves independent votes and conservatively reframes disagreement', () => {
  const value = project(true);
  try {
    const evidence = inspectRenderedRefinementEvidence({ root: value.root, invocation: value.invocation });
    const packetSha256 = hash(renderedRefinementReviewerPacket({ root: value.root, invocation: value.invocation }));
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const publicKeyPath = join(value.root, 'host-public.pem');
    writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));
    const aliases = (JSON.parse(renderedRefinementReviewerPacket({ root: value.root, invocation: value.invocation }).toString('utf8')) as { outputContract: { allowedWinnerAliases: string[] } }).outputContract.allowedWinnerAliases.filter((alias) => alias !== 'tie');
    const handback = (winnerAlias: string, remainingCriteria: string[], findings: string[]) => JSON.stringify({
      schema: 'adaptive-refinement-reviewer-handback-v1', winnerAlias,
      evidenceSha256: evidence.evidenceSha256,
      routeSha256: evidence.routeSha256,
      buildSha256: value.invocation.current.buildSha256,
      briefSha256: value.invocation.current.briefSha256,
      remainingCriteria, findings,
    });
    const first = handback(aliases[0]!, [], ['one variant has stronger hierarchy']);
    const second = handback(aliases[1]!, ['primary mass still competes'], ['the other variant reads faster']);
    const publication = buildRefinementReviewerPublication({
      schema: 'adaptive-refinement-review-publication-v1',
      roleResults: [
        roleResult({ root: value.root, privateKey, handback: first, index: 1, buildSha256: value.invocation.current.buildSha256, briefSha256: value.invocation.current.briefSha256, packetSha256 }),
        roleResult({ root: value.root, privateKey, handback: second, index: 2, buildSha256: value.invocation.current.buildSha256, briefSha256: value.invocation.current.briefSha256, packetSha256 }),
      ],
    }, {
      projectRoot: value.root,
      buildSha256: value.invocation.current.buildSha256,
      briefSha256: value.invocation.current.briefSha256,
      publicKeyPath,
      invocation: value.invocation,
    });
    const review = JSON.parse(publication.review.bytes.toString('utf8')) as {
      winnerAlias: string; votes: { findings: string[] }[]; remainingCriteria: string[];
    };
    assert.equal(review.winnerAlias, 'disagreement');
    assert.deepEqual(review.votes.map(({ findings }) => findings), [
      ['one variant has stronger hierarchy'], ['the other variant reads faster'],
    ]);
    assert.deepEqual(review.remainingCriteria, ['primary mass still competes']);
    assert.deepEqual(classifyRenderedRefinement({
      winner: 'disagreement', remainingCriteria: review.remainingCriteria,
      beforeObservationSha256: evidence.before.observationSha256,
    }), { status: 'reframe', action: 'continue', target: 'primary mass still competes' });
    for (const artifact of publication.executions) value.writer.writeContentAddressed(artifact.path, artifact.bytes);
    value.writer.writeContentAddressed(publication.review.path, publication.review.bytes);
    authorizeTestProjectRunPayloads(value.root, value.invocation, [{
      purpose: 'final-reviewer-lane', payload: publication.review.bytes,
    }]);
    const checkpoint = commitRenderedRefinementCheckpoint({
      root: value.root, invocation: value.invocation, writer: value.writer,
      reviewPath: publication.review.path,
    });
    assert.equal(checkpoint.action, 'continue');
    assert.throws(
      () => validateCurrentRenderedRefinementCheckpoint({ root: value.root, invocation: value.invocation }),
      (error: unknown) => error instanceof RenderedRefinementError && error.code === 'REFINEMENT_CHECKPOINT_STALE',
    );
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('authorized quorum result commits an improvement checkpoint and a single tie cannot claim plateau', () => {
  const value = project(true);
  try {
    const evidence = inspectRenderedRefinementEvidence({ root: value.root, invocation: value.invocation });
    const packet = renderedRefinementReviewerPacket({ root: value.root, invocation: value.invocation });
    const packetSha256 = hash(packet);
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const publicKeyPath = join(value.root, 'host-public.pem');
    writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }));
    const handback = JSON.stringify({
      schema: 'adaptive-refinement-reviewer-handback-v1',
      winnerAlias: `variant-${hash(`rendered-refinement\0${evidence.after.observationSha256}`).slice(0, 16)}`,
      evidenceSha256: evidence.evidenceSha256,
      routeSha256: value.routeSha256,
      buildSha256: value.invocation.current.buildSha256,
      briefSha256: value.invocation.current.briefSha256,
      remainingCriteria: [], findings: [],
    });
    const publication = buildRefinementReviewerPublication({
      schema: 'adaptive-refinement-review-publication-v1',
      roleResults: [1, 2].map((index) => roleResult({
        root: value.root, privateKey, handback, index,
        buildSha256: value.invocation.current.buildSha256,
        briefSha256: value.invocation.current.briefSha256,
        packetSha256,
      })),
    }, {
      projectRoot: value.root, buildSha256: value.invocation.current.buildSha256,
      briefSha256: value.invocation.current.briefSha256, publicKeyPath,
      invocation: value.invocation,
    });
    for (const artifact of publication.executions) value.writer.writeContentAddressed(artifact.path, artifact.bytes);
    value.writer.writeContentAddressed(publication.review.path, publication.review.bytes);
    authorizeTestProjectRunPayloads(value.root, value.invocation, [{
      purpose: 'final-reviewer-lane', payload: publication.review.bytes,
    }]);
    const checkpoint = commitRenderedRefinementCheckpoint({
      root: value.root, invocation: value.invocation, writer: value.writer,
      reviewPath: publication.review.path,
    });
    assert.equal(checkpoint.status, 'improve');
    assert.equal(checkpoint.action, 'complete');
    const terminal = validateCurrentRenderedRefinementCheckpoint({ root: value.root, invocation: value.invocation });
    assert.equal(terminal.required, true);
    assert.equal(terminal.status, 'complete');

    const target = 'primary mass still competes';
    const firstTie = classifyRenderedRefinement({
      winner: 'tie', remainingCriteria: [target], beforeObservationSha256: hash('before-1'),
    });
    assert.deepEqual(firstTie, { status: 'reframe', action: 'continue', target });
    const secondTie = classifyRenderedRefinement({
      winner: 'tie', remainingCriteria: [target], beforeObservationSha256: hash('after-1'),
      previous: { status: 'reframe', comparison: 'tie', afterObservationSha256: hash('after-1'), target },
    });
    assert.deepEqual(secondTie, { status: 'plateau', action: 'stop', target });
    assert.deepEqual(classifyRenderedRefinement({
      winner: 'tie', remainingCriteria: [], beforeObservationSha256: hash('stable-before'),
    }), { status: 'preserved', action: 'complete', target: null });
    rmSync(join(value.root, '.omd', 'production-repairs'), { recursive: true });
    assert.throws(
      () => validateCurrentRenderedRefinementCheckpoint({ root: value.root, invocation: value.invocation }),
      (error: unknown) => error instanceof RenderedRefinementError && error.code === 'REFINEMENT_CHECKPOINT_STALE',
    );
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('terminal refinement validation distinguishes absent repairs from an undecided current repair', () => {
  const value = project(true);
  try {
    assert.throws(
      () => validateCurrentRenderedRefinementCheckpoint({ root: value.root, invocation: value.invocation }),
      (error: unknown) => error instanceof RenderedRefinementError && error.code === 'REFINEMENT_CHECKPOINT_STALE',
    );
    rmSync(join(value.root, '.omd', 'production-repairs'), { recursive: true });
    assert.deepEqual(
      validateCurrentRenderedRefinementCheckpoint({ root: value.root, invocation: value.invocation }),
      { required: false, status: 'not-applicable' },
    );
    mkdirSync(join(value.root, '.omd', 'production-repairs'), { recursive: true });
    writeFileSync(join(value.root, '.omd', 'production-repairs', 'untrusted.json'), '{}');
    assert.throws(
      () => validateCurrentRenderedRefinementCheckpoint({ root: value.root, invocation: value.invocation }),
      (error: unknown) => error instanceof RenderedRefinementError && error.code === 'REFINEMENT_CHECKPOINT_STALE',
    );
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('every required outcome needs both canonical viewports', () => {
  const value = project(true, true);
  try {
    assert.throws(
      () => inspectRenderedRefinementEvidence({ root: value.root, invocation: value.invocation }),
      (error: unknown) => error instanceof RenderedRefinementError && error.code === 'REFINEMENT_VIEWPORTS_INCOMPLETE',
    );
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('CLI and coordinator route the trusted repair pair through isolated refinement review', () => {
  const cli = new URL('../bin/omd.mjs', import.meta.url);
  const help = spawnSync(process.execPath, [cli.pathname, 'lifecycle', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /lifecycle refinement-evidence/);
  assert.match(help.stdout, /lifecycle refine/);
  assert.match(help.stdout, /lifecycle refinement-rollback/);
  assert.match(help.stdout, /lifecycle repair[^\n]*--owner-receipt <json>/);
  const skill = readFileSync(new URL('../src/skills/omd-ultradesign/SKILL.md', import.meta.url), 'utf8');
  const protocol = readFileSync(new URL('../core/protocol/human-design-loop.md', import.meta.url), 'utf8');
  assert.match(skill, /complete RED\/GREEN\s+repair-pair and rendered-refinement checkpoint contract/i);
  assert.match(protocol, /initial-final and refinement production-pixel transports[\s\S]*one-use host evidence tool/i);
  assert.match(protocol, /same content-addressed `--reviewer-packet`/i);
  assert.match(protocol, /tie with a remaining RED criterion returns to framing\/composition[\s\S]*second chained tie[\s\S]*plateau/i);
  assert.match(protocol, /unanimous tie with no remaining criterion records the repaired result as preserved and complete without claiming improvement/i);
  assert.match(protocol, /owner repair[\s\S]*owner-receipt/i);
  assert.match(skill, /OMD_NODE_EXECUTABLE[\s\S]*OMD_CLI_PATH[\s\S]*OMD_CODEX_CLI_PATH/);
  assert.equal(codexPayloadAuthorizationPhaseError(
    [process.execPath, cli.pathname, 'review', 'refinement-publish'], 'final-reviewer-lane',
  ), undefined);
  assert.equal(codexPayloadAuthorizationPhaseError(
    [process.execPath, cli.pathname, 'lifecycle', 'refine'], 'final-reviewer-lane',
  ), undefined);
  assert.equal(codexPayloadAuthorizationPhaseError(
    [process.execPath, cli.pathname, 'lifecycle', 'refinement-rollback'], 'final-reviewer-lane',
  ), undefined);
});
