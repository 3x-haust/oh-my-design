import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createTestNativePiInvocation } from '../core/runtime/native-pi-run.ts';
import { runPiReferenceAdmissionReviewer } from '../adapters/pi-reviewer-runtime.ts';
import { authorReferenceBoard } from '../core/ref/board-author.ts';
import { resolveReferenceBoard } from '../core/ref/board.ts';
import { reviewReferenceZone } from '../bin/reference-zone-command.ts';
import {
  REFERENCE_DIRECTION_REVIEWER_TASK,
  buildReferenceDirectionReviewerPacket,
  publishReferenceDirectionAdmission,
  requireReferenceDirectionAdmission,
} from '../core/ref/reference-direction-admission.ts';
import {
  REFERENCE_ZONE_ADMISSION_POINTER,
  REFERENCE_ZONE_REVIEWER_HANDBACK_SCHEMA,
  REFERENCE_ZONE_REVIEWER_TASK,
  REFERENCE_ZONE_REVIEWER_TRANSPORT_SCHEMA,
  buildReferenceZoneReviewerPacket,
  publishReferenceZoneAdmission,
  readAuthenticatedReferenceZoneAdmissions,
  requireReferenceZoneAdmission,
} from '../core/ref/reference-zone-admission.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import {
  PI_ROLE_EXEC_RESULT_SCHEMA,
  PI_ROLE_RESULT_SCHEMA,
  piRoleReceiptDigest,
  verifySignedPiEyeRoleResult,
  type PiRoleResult,
} from '../core/runtime/pi-role-receipt.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import type { Reference } from '../core/types.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { refImagePath, saveRef } from '../core/ref/store.ts';
import { persistImageFragment } from '../core/ref/image-fragment.ts';
import { publishReferenceResearch, readPublishedReferenceResearch,
  validateReferenceResearch } from '../core/ref/reference-research.ts';
import {
  createTestProjectWriteAdapter,
  publishTestAdaptiveRoute,
} from './helpers/project-write.ts';
import { testPng, testSearchReceipt } from './helpers/search-execution.ts';

const hash = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');
const digest = (label: string): string => hash(`reference-zone:${label}`);

type Fixture = ReturnType<typeof fixture>;

for (const kind of ['component-capture', 'image-fragment'] as const) {
  test(`v8 research preserves ${kind} scoped support without promoting global direction`, t => {
    const f = fixture(t);
    const zone = f.acquisition.zones[0];
    f.writer.write('.omd/acquisition-plan.json', canonicalJson({
      ...f.acquisition, zones: [{ ...zone, evidenceRequirement: {
        kind: 'visible-appearance', reason: 'Static grouping only; destination behavior needs separate proof.',
      } }],
    }));
    f.writer.write('.omd/frame.md', '# Frame\n');
    const directionPacket = buildReferenceDirectionReviewerPacket(f.root, {
      sourceContractSha256: f.sourceContractSha256, task: f.task, references: [f.reference],
    });
    const direction: { outputContract: { responseTemplate: {
      admissions: readonly Record<string, unknown>[];
    } } } = JSON.parse(directionPacket.toString('utf8'));
    publishReferenceDirectionAdmission(f.root, directionPacket,
      signedReviewer(f, directionPacket, REFERENCE_DIRECTION_REVIEWER_TASK, {
        ...direction.outputContract.responseTemplate,
        admissions: direction.outputContract.responseTemplate.admissions.map(row => ({
          ...row, verdict: 'support', appearanceIntent: null,
          assessment: {
            captureType: 'finished-product-task-screen', directionQualification: 'support-only',
            visibleEvidence: 'A populated work object and grouped controls are visible.',
            visualQuality: 'excellent', visualEvidence: 'Clear grouping and deliberate control hierarchy.',
            userRelationship: 'bounded', relationshipEvidence: 'Only the local control structure transfers.',
          },
        })),
      }), f.invocation, f.writer);
    const packet = zonePacket(f);
    publishReferenceZoneAdmission(f.root, packet,
      signedReviewer(f, packet, REFERENCE_ZONE_REVIEWER_TASK, completedZoneHandback(packet)),
      f.invocation, f.writer);
    const capturePath = saveRef(f.root, f.reference, f.writer);
    const fragment = kind === 'image-fragment' ? persistImageFragment(f.root, {
      inputPath: relative(f.root, f.imagePath),
      provenance: { sourcePage: f.reference.source, captureRegion: 'Complete native task screen',
        capturedAt: f.reference.capturedAt, licenseStatus: 'unknown', rightsNotes: 'Reference only.' },
      transfer: { visualRole: 'Scoped work object structure', principles: ['Group the selected work object.'] },
    }, f.invocation) : null;
    const piece = {
      ...(fragment ? { sourceKind: 'image-fragment', referenceId: fragment.id }
        : { source: f.reference.source, component: f.reference.component }),
      slotId: 'hero', targetComponent: 'WorkObject', targetSelector: '[data-zone="hero"]',
      taskIds: ['T1'], reason: 'Scoped grouping.', take: ['structure'],
      avoid: 'No source identity.', adaptation: 'Use destination records.',
      grid: { column: 1, span: 12, order: 0 }, rights: 'unknown',
      signal: 'supporting-component', motionAxis: 'absent',
      binding: { zoneId: zone.id, decisionId: zone.decisionId, axis: 'structure',
        sourceState: zone.requiredState, sourceViewport: zone.viewports[0],
        targetViewports: zone.viewports, responsiveConsequence: 'Preserve grouping at narrow widths.',
        conflictGroup: null, conflictResolution: null, falsifier: zone.falsifier },
    };
    const board = authorReferenceBoard(f.root, {
      candidates: ['one', 'two'].map(id => ({
        id, label: id, route: '/', rationale: 'Scoped visual structure.', pieces: [piece],
      })),
    });
    const boardBytes = canonicalJson(board);
    f.writer.write('.omd/reference-board.json', boardBytes);
    const research = {
      schema: 'reference-research-v8', sourceContractSha256: f.sourceContractSha256,
      marketCoverage: null,
      domainReference: { queries: [], searches: [], sources: [], benchmarkSha256: null },
      designReference: {
        queries: ['work object grouping'],
        searches: [testSearchReceipt(f.root, 'design', 'work object grouping', [f.reference.source])],
        boardSha256: hash(boardBytes),
        sources: [{
          id: 'scoped-control-support', url: f.reference.source,
          observedAt: f.reference.capturedAt.slice(0, 10),
          decision: 'Use only approved grouping.', finding: 'Controls surround the selected work object.',
          visualRole: 'component-support',
          evidence: { path: fragment?.imagePath ?? relative(f.root, f.imagePath), sha256: hash(f.png) },
          capture: fragment
            ? { path: `.omd/refs/design/fragments/${fragment.id}.json`,
              sha256: hash(readFileSync(join(f.root, `.omd/refs/design/fragments/${fragment.id}.json`))) }
            : { path: relative(f.root, capturePath), sha256: hash(readFileSync(capturePath)) },
          visualAssessment: { composition: 'A bounded work object.', typography: 'Clear title and labels.',
            density: 'Compact controls.', imagery: 'No decorative imagery.',
            transfer: 'Preserve grouping.', avoid: 'No branding or unrelated features.' },
        }],
      },
    };
    const options = { expectedSourceContractSha256: f.sourceContractSha256,
      expectedRequest: f.task, benchmarkRequired: false };
    publishReferenceResearch(f.root, research, options, f.writer);
    const published = readPublishedReferenceResearch(f.root);
    assert.equal(published.designReference.sources[0]?.visualRole, 'component-support');
    assert.throws(() => requireReferenceDirectionAdmission(
      f.root, f.reference, f.sourceContractSha256, 'direction',
    ), /REFERENCE_DIRECTION_ADMISSION_SUPPORT_ONLY/);
    const storedPath = join(f.root, '.omd/reference-research.json');
    const before = readFileSync(storedPath);
    rmSync(join(f.root, REFERENCE_ZONE_ADMISSION_POINTER));
    assert.throws(() => validateReferenceResearch(f.root, published, options),
      /REFERENCE_ZONE_ADMISSION_MISSING/);
    assert.throws(() => publishReferenceResearch(f.root, research, options, f.writer),
      /REFERENCE_ZONE_ADMISSION_MISSING/);
    assert.deepEqual(readFileSync(storedPath), before);
  });
}

for (const [field, value, category] of [
  ['visualQuality', 'beautiful', 'enum'],
  ['relationshipCompatibility', 'fits', 'enum'],
  ['verdict', 'approve', 'enum'],
  ['visualEvidence', 'Use https://source.example/private.png', 'source-payload'],
  ['relationshipEvidence', 'Use https://source.example/private.png', 'source-payload'],
] as const) {
  test(`invalid zone ${field} preserves authenticated diagnosis without admission`, t => {
    const f = fixture(t);
    const packet = zonePacket(f);
    const reviewer = signedReviewer(f, packet, REFERENCE_ZONE_REVIEWER_TASK,
      completedZoneHandback(packet, { [field]: value }));
    assert.throws(() => publishReferenceZoneAdmission(
      f.root, packet, reviewer, f.invocation, f.writer,
    ), /REFERENCE_ZONE_HANDBACK_INVALID:assessment/);
    const bytes = canonicalJson(reviewer);
    const stored = readFileSync(join(f.root,
      `.omd/.cache/reference-zone-reviews/sha256-${hash(bytes)}.json`), 'utf8');
    assert.equal(stored, bytes);
    assert.equal(verifySignedPiEyeRoleResult(JSON.parse(stored), f.root).finalMessage,
      reviewer.finalMessage);
    assert.equal(existsSync(join(f.root, REFERENCE_ZONE_ADMISSION_POINTER)), false);
    assert.throws(() => publishReferenceZoneAdmission(
      f.root, packet, reviewer, f.invocation, f.writer,
    ), error => error instanceof Error
      && error.message === `REFERENCE_ZONE_HANDBACK_INVALID:assessment:${field}:${category}`);
    assert.throws(() => requireReferenceZoneAdmission(f.root, {
      reference: f.reference, sourceContractSha256: f.sourceContractSha256,
      zoneId: 'hero', axis: 'structure', viewport: { width: 1280, height: 900 },
    }), /REFERENCE_ZONE_ADMISSION_MISSING/);
  });
}

test('invalid zone handback leaves the prior approval pointer unchanged', t => {
  const f = fixture(t);
  const first = zonePacket(f);
  publishReferenceZoneAdmission(f.root, first,
    signedReviewer(f, first, REFERENCE_ZONE_REVIEWER_TASK, completedZoneHandback(first)),
    f.invocation, f.writer);
  const pointerPath = join(f.root, REFERENCE_ZONE_ADMISSION_POINTER);
  const before = readFileSync(pointerPath);
  const next = zonePacket(f);
  assert.throws(() => publishReferenceZoneAdmission(f.root, next,
    signedReviewer(f, next, REFERENCE_ZONE_REVIEWER_TASK,
      completedZoneHandback(next, { visualQuality: 'beautiful' })),
    f.invocation, f.writer), /REFERENCE_ZONE_HANDBACK_INVALID:assessment/);
  assert.deepEqual(readFileSync(pointerPath), before);
});

for (const kind of ['image', 'page'] as const) {
test(`complete ${kind} pixels bind their zone without recapture or relabeling`, t => {
  const f = fixture(t);
  const { slot: _slot, blueprint: _blueprint, ...base } = f.reference;
  const reference: Reference = {
    ...base, kind, invariants: kind === 'image' ? null : base.invariants,
    acquisition: { requestedUrl: f.reference.source, finalUrl: f.reference.source,
      httpStatus: 200, links: [], imageSha256: hash(f.png),
      ...(kind === 'image' ? {
        sourceImage: `${f.reference.source}/original.png`, sourceImageSha256: hash(f.png),
        imageDimensions: { width: 2560, height: 1800 },
      } : {}) },
  };
  const capturePath = saveRef(f.root, reference, f.writer);
  const before = readFileSync(capturePath);
  const packet = buildReferenceZoneReviewerPacket(f.root, {
    reference, sourceContractSha256: f.sourceContractSha256, task: f.task,
    zoneId: 'hero', axis: 'structure', viewport: { width: 1280, height: 900 },
  });
  publishReferenceZoneAdmission(f.root, packet,
    signedReviewer(f, packet, REFERENCE_ZONE_REVIEWER_TASK, completedZoneHandback(packet)),
    f.invocation, f.writer);
  assert.equal(requireReferenceZoneAdmission(f.root, {
    reference, sourceContractSha256: f.sourceContractSha256,
    zoneId: 'hero', axis: 'structure', viewport: { width: 1280, height: 900 },
  }).verdict, 'zone-compatible');
  assert.deepEqual(readFileSync(capturePath), before);
  assert.deepEqual(readFileSync(f.imagePath), f.png);
  assert.throws(() => requireReferenceZoneAdmission(f.root, {
    reference, sourceContractSha256: f.sourceContractSha256,
    zoneId: 'detail', axis: 'rhythm', viewport: { width: 1280, height: 900 },
  }), /REFERENCE_ZONE_ADMISSION_MISSING/);
});
}

test('a later signed rejection revokes the same scoped approval', t => {
  const f = fixture(t);
  const first = zonePacket(f);
  publishReferenceZoneAdmission(f.root, first,
    signedReviewer(f, first, REFERENCE_ZONE_REVIEWER_TASK, completedZoneHandback(first)),
    f.invocation, f.writer);
  const next = zonePacket(f);
  publishReferenceZoneAdmission(f.root, next,
    signedReviewer(f, next, REFERENCE_ZONE_REVIEWER_TASK,
      completedZoneHandback(next, { visualQuality: 'ordinary', verdict: 'reject' })),
    f.invocation, f.writer);
  assert.throws(() => requireReferenceZoneAdmission(f.root, {
    reference: f.reference, sourceContractSha256: f.sourceContractSha256,
    zoneId: 'hero', axis: 'structure', viewport: { width: 1280, height: 900 },
  }), /REFERENCE_ZONE_ADMISSION_REJECTED/);
});

test('a fresh scoped review can supersede authentic history after a zone changes', t => {
  const f = fixture(t);
  const first = zonePacket(f);
  publishReferenceZoneAdmission(f.root, first,
    signedReviewer(f, first, REFERENCE_ZONE_REVIEWER_TASK, completedZoneHandback(first)),
    f.invocation, f.writer);
  writeFileSync(join(f.root, '.omd/acquisition-plan.json'), canonicalJson({
    ...f.acquisition,
    zones: f.acquisition.zones.map(zone => zone.id === 'hero'
      ? { ...zone, falsifier: 'The primary work object loses its distinguishable hierarchy.' } : zone),
  }));
  assert.throws(() => requireReferenceZoneAdmission(f.root, {
    reference: f.reference, sourceContractSha256: f.sourceContractSha256,
    zoneId: 'hero', axis: 'structure', viewport: { width: 1280, height: 900 },
  }), /REFERENCE_ZONE_ADMISSION_(MISSING|STALE)/);
  const next = zonePacket(f);
  const record = publishReferenceZoneAdmission(f.root, next,
    signedReviewer(f, next, REFERENCE_ZONE_REVIEWER_TASK, completedZoneHandback(next)),
    f.invocation, f.writer);
  assert.notEqual(record.previousAdmissionSha256, null);
  assert.equal(requireReferenceZoneAdmission(f.root, {
    reference: f.reference, sourceContractSha256: f.sourceContractSha256,
    zoneId: 'hero', axis: 'structure', viewport: { width: 1280, height: 900 },
  }).zoneSha256, record.zoneSha256);
});

test('a static image cannot authorize motion even when the acquisition plan requests it', t => {
  const f = fixture(t);
  writeFileSync(join(f.root, '.omd/acquisition-plan.json'), canonicalJson({
    ...f.acquisition, zones: f.acquisition.zones.map(zone =>
      zone.id === 'hero' ? { ...zone, axes: ['motion'] } : zone),
  }));
  assert.throws(() => buildReferenceZoneReviewerPacket(f.root, {
    reference: f.reference, sourceContractSha256: f.sourceContractSha256, task: f.task,
    zoneId: 'hero', axis: 'motion', viewport: { width: 1280, height: 900 },
  }), /REFERENCE_ZONE_STATIC_AXIS_REQUIRED/);
});

for (const field of ['job', 'question'] as const) {
  test(`zone review refuses source-bearing ${field}`, t => {
    const f = fixture(t);
    writeFileSync(join(f.root, '.omd/acquisition-plan.json'), canonicalJson({
      ...f.acquisition, zones: f.acquisition.zones.map(zone => zone.id === 'hero'
        ? { ...zone, [field]: 'Follow https://source.example/private/example.png' } : zone),
    }));
    assert.throws(() => zonePacket(f), /REFERENCE_ZONE_SOURCE_PAYLOAD/);
  });
}

test('zone review crosses the real isolated reviewer runtime and publishes exact scope', { timeout: 30_000 }, async t => {
  const f = fixture(t);
  const nodePath = realpathSync(process.execPath);
  const cliPath = fileURLToPath(new URL('./fixtures/pi-reviewer-rpc.mjs', import.meta.url));
  const invocation = createTestNativePiInvocation({
    root: f.root, current: f.invocation.current,
    host: { nodePath, nodeSha256: hash(readFileSync(nodePath)), cliPath,
      cliSha256: hash(readFileSync(cliPath)), provider: 'fixture-provider',
      model: 'fixture-model', thinkingLevel: 'high', parentSessionId: 'zone-parent' },
  });
  const record = await reviewReferenceZone(f.root, {
    schema: 'reference-zone-review-input-v1',
    referenceId: (await import('../core/ref/identity.ts')).refIdentity(f.reference.source, f.reference.component),
    zoneId: 'hero', axis: 'structure', viewport: { width: 1280, height: 900 },
  }, { invocation, writer: f.writer, sourceContractSha256: f.sourceContractSha256, task: f.task });
  assert.equal(record.admission.verdict, 'zone-compatible');
  assert.equal(record.admission.zoneId, 'hero');
});

test('board authoring and resolution accept exact scoped structure but refuse scope expansion', t => {
  const f = fixture(t);
  const zone = f.acquisition.zones[0];
  writeFileSync(join(f.root, '.omd/acquisition-plan.json'), canonicalJson({
    ...f.acquisition, zones: [zone],
  }));
  writeFileSync(join(f.root, '.omd/frame.md'), '# Frame\n');
  const packet = zonePacket(f);
  const piece = {
    slotId: 'hero', source: f.reference.source, component: f.reference.component,
    targetComponent: 'Comparison', targetSelector: '#comparison',
    reason: 'Preserve the declared grouping.', take: ['structure'],
    avoid: 'No identity transfer.', adaptation: 'Use destination content.',
    grid: { column: 1, span: 12, order: 0 }, rights: 'lawful',
    signal: 'high-visual-system', motionAxis: 'absent',
    binding: { zoneId: zone.id, decisionId: zone.decisionId, axis: 'structure',
      sourceState: zone.requiredState, sourceViewport: zone.viewports[0],
      targetViewports: zone.viewports, responsiveConsequence: 'Reflow the same grouping.',
      conflictGroup: null, conflictResolution: null, falsifier: zone.falsifier },
  };
  const input = { candidates: ['one', 'two'].map(id => ({
    id, label: id, route: '/', rationale: 'Scoped structure.', pieces: [piece],
  })) };
  assert.throws(() => authorReferenceBoard(f.root, input), /REFERENCE_ZONE_ADMISSION_MISSING/);
  publishReferenceZoneAdmission(f.root, packet,
    signedReviewer(f, packet, REFERENCE_ZONE_REVIEWER_TASK, completedZoneHandback(packet)),
    f.invocation, f.writer);
  const board = authorReferenceBoard(f.root, input);
  assert.equal(resolveReferenceBoard(f.root, board).candidates.length, 2);
  assert.throws(() => authorReferenceBoard(f.root, {
    candidates: input.candidates.map(candidate => ({
      ...candidate, pieces: [{ ...piece, take: ['structure', 'density'] }],
    })),
  }), /REFERENCE_ZONE_ADMISSION_MISSING/);
  assert.throws(() => requireReferenceDirectionAdmission(f.root, f.reference,
    f.sourceContractSha256, 'direction'), /REFERENCE_DIRECTION_ADMISSION_MISSING/);
});

function fixture(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-reference-zone-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.omd/refs/design'), { recursive: true });
  const routeInput = inputSkeleton('product-route-input').skeleton;
  const invocation = publishTestAdaptiveRoute(root, routeInput, 'Zone admission fixture task');
  const routePointer = JSON.parse(readFileSync(join(root, '.omd/route.json'), 'utf8')) as {
    record: string;
  };
  const route = JSON.parse(readFileSync(join(root, '.omd', routePointer.record), 'utf8')) as {
    request: string;
    sourceContractSha256: string;
  };
  const writer = createTestProjectWriteAdapter(root, invocation);
  const acquisition = {
    schema: 'reference-acquisition-plan-v2',
    owner: 'omd-framer',
    localeContextSha256: null,
    zones: [
      {
        id: 'hero',
        kind: 'region',
        job: 'Anchor the primary work object.',
        required: true,
        decisionId: 'hero-hierarchy',
        question: 'How does the primary work object remain immediately legible?',
        axes: ['structure', 'density'],
        requiredState: 'The populated primary work object is visible.',
        viewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }],
        falsifier: 'The primary work object is visually lost or unreadable.',
      },
      {
        id: 'detail',
        kind: 'region',
        job: 'Explain the selected detail.',
        required: true,
        decisionId: 'detail-rhythm',
        question: 'How is the selected detail grouped?',
        axes: ['rhythm'],
        requiredState: 'A populated selected detail is visible.',
        viewports: [{ width: 1280, height: 900 }],
        falsifier: 'The selected detail cannot be scanned.',
      },
    ],
  } as const;
  writeFileSync(join(root, '.omd/acquisition-plan.json'), canonicalJson(acquisition));
  const source = 'https://visual.example/zone-source';
  const component = 'hero-work-object';
  const imagePath = refImagePath(root, { source, component, researchLane: 'design' });
  const png = testPng(2560, 1800, 23);
  const reference: Reference = {
    source,
    component,
    researchLane: 'design',
    kind: 'component',
    selector: '#hero',
    slot: 'hero',
    capturedAt: new Date().toISOString(),
    viewport: { width: 1280, height: 900 },
    imagePath: relative(root, imagePath),
    acquisition: {
      requestedUrl: source,
      finalUrl: source,
      httpStatus: 200,
      links: [],
      imageSha256: hash(png),
    },
    invariants: {
      spacingLadder: [8, 16, 24],
      radiusLadder: [8],
      elevationLevels: 0,
      centeredRatio: 0.4,
      tokenCoverage: 1,
      paddingWeight: 16,
      typeScale: [16, 24],
      fontFamilies: ['Inter'],
      weightLadder: [400, 700],
      motionDurations: [],
      easingVocab: [],
      animatedShare: 0,
      hoverCoverage: 0,
      focusCoverage: 1,
      animatedProperties: [],
      hasReducedMotion: true,
      scrollChoreography: [],
    },
    principles: ['Preserve the primary work-object hierarchy.'],
    blueprint: {
      selector: '#hero',
      capturedAt: new Date().toISOString(),
      nodes: [{ id: 'hero', role: 'container', children: [], box: { w: 1280, h: 900 } }],
    },
  };
  saveRef(root, reference, writer);
  writeFileSync(imagePath, png);
  return {
    root,
    invocation,
    writer,
    acquisition,
    reference,
    png,
    imagePath,
    task: route.request,
    sourceContractSha256: route.sourceContractSha256,
  };
}

function signedReviewer(f: Fixture, packet: Buffer, task: string, handback: unknown): PiRoleResult {
  const finalMessage = canonicalJson(handback);
  const taskSha256 = hash(task);
  const packetValue = JSON.parse(packet.toString('utf8')) as { evidenceSha256: string };
  const receipt: PiRoleResult['authority']['receipt'] = {
    schema: PI_ROLE_EXEC_RESULT_SCHEMA,
    host: 'pi' as const,
    role: 'omd-eye' as const,
    projectRoot: f.root,
    status: 'completed' as const,
    exitCode: 0 as const,
    signal: null,
    eventCount: 1,
    finalMessage,
    processPid: 1001,
    roleNonce: 'reference-zone-reviewer-nonce',
    sessionId: 'reference-zone-reviewer-session',
    parentSessionId: 'reference-zone-parent-session',
    taskSha256,
    configurationSha256: digest('configuration'),
    buildSha256: f.invocation.current.buildSha256,
    briefSha256: f.invocation.current.briefSha256,
    provider: 'fixture-provider',
    model: 'fixture-model',
    modelReasoningEffort: 'high',
    modelSelection: 'inherited-pi-host' as const,
    nodeSha256: digest('node'),
    cliSha256: digest('cli'),
    bridgeSha256: digest('bridge'),
    systemPromptSha256: digest('system'),
    transcriptSha256: digest('transcript'),
    reviewerEvidence: {
      schema: 'omd-reviewer-evidence-consumption-v1' as const,
      evidenceSha256: packetValue.evidenceSha256,
      packetSha256: hash(packet),
      taskSha256,
      childPid: 1002,
      sessionId: 'reference-zone-reviewer-session',
      nonce: 'reference-zone-reviewer-nonce',
    },
  };
  return Object.freeze({
    schema: PI_ROLE_RESULT_SCHEMA,
    agent: 'omd-eye',
    projectRoot: f.root,
    result: 'completed',
    finalMessage,
    authority: Object.freeze({
      receipt,
      signature: signNativeObservation(f.root, receipt.schema, piRoleReceiptDigest(receipt)),
    }),
  });
}

function zonePacket(f: Fixture): Buffer {
  return buildReferenceZoneReviewerPacket(f.root, {
    sourceContractSha256: f.sourceContractSha256,
    task: f.task,
    reference: f.reference,
    zoneId: 'hero',
    axis: 'structure',
    viewport: { width: 1280, height: 900 },
  });
}

function completedZoneHandback(packet: Buffer, overrides: Record<string, unknown> = {}): unknown {
  const value = JSON.parse(packet.toString('utf8')) as {
    outputContract: { responseTemplate: { admission: Record<string, unknown> } };
  };
  return {
    ...value.outputContract.responseTemplate,
    admission: {
      ...value.outputContract.responseTemplate.admission,
      visualQuality: 'excellent',
      visualEvidence: 'A deliberate asymmetric grid, disciplined type hierarchy, and balanced whitespace make the populated work object visually exceptional.',
      relationshipCompatibility: 'compatible',
      relationshipEvidence: 'The source grouping directly supports the named hero structure axis without introducing a conflicting multi-user posture.',
      verdict: 'zone-compatible',
      ...overrides,
    },
  };
}

test('signed Eye review authorizes only the exact acquisition zone, axis, state, viewport, and capture',
  t => {
    const f = fixture(t);
    const packet = zonePacket(f);
    const decoded = JSON.parse(packet.toString('utf8')) as {
      schema: string;
      evidence: {
        acquisition: {
          acquisitionSha256: string;
          zoneSha256: string;
          zone: { zoneId: string; axis: string; viewport: { width: number; height: number } };
        };
        referenceRenders: { pngBase64: string; imageSha256: string; pixelDensity: string }[];
      };
      outputContract: { schema: string; responseTemplate: Record<string, unknown> };
    };
    assert.equal(decoded.schema, REFERENCE_ZONE_REVIEWER_TRANSPORT_SCHEMA);
    assert.equal(decoded.outputContract.schema, REFERENCE_ZONE_REVIEWER_HANDBACK_SCHEMA);
    assert.equal(decoded.evidence.acquisition.zone.zoneId, 'hero');
    assert.equal(decoded.evidence.acquisition.zone.axis, 'structure');
    assert.deepEqual(decoded.evidence.acquisition.zone.viewport, { width: 1280, height: 900 });
    assert.match(decoded.evidence.acquisition.acquisitionSha256, /^[a-f0-9]{64}$/);
    assert.match(decoded.evidence.acquisition.zoneSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(Buffer.from(decoded.evidence.referenceRenders[0]!.pngBase64, 'base64'), f.png);
    assert.equal(decoded.evidence.referenceRenders[0]!.imageSha256, hash(f.png));
    assert.equal(decoded.evidence.referenceRenders[0]!.pixelDensity, '2x-or-original');
    assert.equal(JSON.stringify(decoded.outputContract.responseTemplate).includes('appearanceIntent'), false);

    const reviewer = signedReviewer(f, packet, REFERENCE_ZONE_REVIEWER_TASK,
      completedZoneHandback(packet));
    const record = publishReferenceZoneAdmission(f.root, packet, reviewer, f.invocation, f.writer);
    assert.equal(record.admission.verdict, 'zone-compatible');
    assert.equal(record.admission.visualQuality, 'excellent');
    assert.equal(requireReferenceZoneAdmission(f.root, {
      reference: f.reference,
      sourceContractSha256: f.sourceContractSha256,
      zoneId: 'hero',
      axis: 'structure',
      viewport: { width: 1280, height: 900 },
    }).zoneSha256, record.zoneSha256);
  });

test('stale acquisition and forged signed evidence are refused before publication', t => {
  {
    const f = fixture(t);
    const packet = zonePacket(f);
    const reviewer = signedReviewer(f, packet, REFERENCE_ZONE_REVIEWER_TASK,
      completedZoneHandback(packet));
    writeFileSync(join(f.root, '.omd/acquisition-plan.json'), canonicalJson({
      ...f.acquisition,
      zones: f.acquisition.zones.map(zone => zone.id === 'hero'
        ? { ...zone, falsifier: 'The primary work object no longer has a stable reading order.' }
        : zone),
    }));
    assert.throws(
      () => publishReferenceZoneAdmission(f.root, packet, reviewer, f.invocation, f.writer),
      /REFERENCE_ZONE_ADMISSION_STALE/,
    );
    assert.equal(existsSync(join(f.root, REFERENCE_ZONE_ADMISSION_POINTER)), false);
    assert.equal(existsSync(join(f.root, '.omd/.cache/reference-zone-reviews')), false);
  }
  {
    const f = fixture(t);
    const packet = zonePacket(f);
    const reviewer = signedReviewer(f, packet, REFERENCE_ZONE_REVIEWER_TASK,
      completedZoneHandback(packet));
    const forged = {
      ...reviewer,
      authority: {
        ...reviewer.authority,
        signature: `${reviewer.authority.signature[0] === 'A' ? 'B' : 'A'}${reviewer.authority.signature.slice(1)}`,
      },
    };
    assert.throws(
      () => publishReferenceZoneAdmission(f.root, packet, forged, f.invocation, f.writer),
      /role-signature|REFERENCE_ZONE_ADMISSION_UNAUTHORIZED/,
    );
    assert.equal(existsSync(join(f.root, REFERENCE_ZONE_ADMISSION_POINTER)), false);
    assert.equal(existsSync(join(f.root, '.omd/.cache/reference-zone-reviews')), false);
  }
});

test('tampered persisted review lineage is refused as forged', t => {
  const f = fixture(t);
  const packet = zonePacket(f);
  publishReferenceZoneAdmission(f.root, packet,
    signedReviewer(f, packet, REFERENCE_ZONE_REVIEWER_TASK, completedZoneHandback(packet)),
    f.invocation, f.writer);
  const pointer = JSON.parse(readFileSync(join(f.root, REFERENCE_ZONE_ADMISSION_POINTER), 'utf8')) as {
    record: string;
  };
  const recordPath = join(f.root, '.omd', pointer.record);
  const record = JSON.parse(readFileSync(recordPath, 'utf8')) as {
    admission: Record<string, unknown>;
  };
  writeFileSync(recordPath, canonicalJson({
    ...record,
    admission: { ...record.admission, visualEvidence: 'forged evidence' },
  }));
  assert.throws(
    () => readAuthenticatedReferenceZoneAdmissions(f.root, f.sourceContractSha256),
    /REFERENCE_ZONE_ADMISSION_FORGED/,
  );
});

test('ordinary, wrong-zone, wrong-axis, and wrong-viewport evidence cannot authorize use', t => {
  {
    const f = fixture(t);
    const packet = zonePacket(f);
    const reviewer = signedReviewer(f, packet, REFERENCE_ZONE_REVIEWER_TASK,
      completedZoneHandback(packet, { visualQuality: 'ordinary', verdict: 'reject' }));
    const rejected = publishReferenceZoneAdmission(f.root, packet, reviewer, f.invocation, f.writer);
    assert.equal(rejected.admission.verdict, 'reject');
    assert.throws(() => requireReferenceZoneAdmission(f.root, {
      reference: f.reference, sourceContractSha256: f.sourceContractSha256,
      zoneId: 'hero', axis: 'structure', viewport: { width: 1280, height: 900 },
    }), /REFERENCE_ZONE_ADMISSION_REJECTED/);
  }
  {
    const f = fixture(t);
    const packet = zonePacket(f);
    publishReferenceZoneAdmission(f.root, packet,
      signedReviewer(f, packet, REFERENCE_ZONE_REVIEWER_TASK, completedZoneHandback(packet)),
      f.invocation, f.writer);
    assert.throws(() => requireReferenceZoneAdmission(f.root, {
      reference: f.reference,
      sourceContractSha256: f.sourceContractSha256,
      zoneId: 'detail',
      axis: 'rhythm',
      viewport: { width: 1280, height: 900 },
    }), /REFERENCE_ZONE_SCOPE_INVALID/);
    assert.throws(() => requireReferenceZoneAdmission(f.root, {
      reference: f.reference,
      sourceContractSha256: f.sourceContractSha256,
      zoneId: 'hero',
      axis: 'density',
      viewport: { width: 1280, height: 900 },
    }), /REFERENCE_ZONE_ADMISSION_MISSING/);
    const mobileReference = {
      ...f.reference,
      viewport: { width: 390, height: 844 },
    };
    assert.throws(() => requireReferenceZoneAdmission(f.root, {
      reference: mobileReference,
      sourceContractSha256: f.sourceContractSha256,
      zoneId: 'hero',
      axis: 'structure',
      viewport: { width: 390, height: 844 },
    }), /REFERENCE_ZONE_(?:2X_CAPTURE_REQUIRED|ADMISSION_MISSING)/);
  }
});

test('existing global support never upgrades into zone-scoped authorization', t => {
  const f = fixture(t);
  const packet = buildReferenceDirectionReviewerPacket(f.root, {
    sourceContractSha256: f.sourceContractSha256,
    task: f.task,
    references: [f.reference],
  });
  const value = JSON.parse(packet.toString('utf8')) as {
    outputContract: { responseTemplate: { admissions: Record<string, unknown>[] } };
  };
  const handback = {
    ...value.outputContract.responseTemplate,
    admissions: value.outputContract.responseTemplate.admissions.map(row => ({
      ...row,
      assessment: {
        captureType: 'finished-product-task-screen',
        directionQualification: 'support-only',
        visibleEvidence: 'A complete populated work screen is visible.',
        visualQuality: 'ordinary',
        visualEvidence: 'The layout is readable but lacks exceptional compositional distinction.',
        userRelationship: 'bounded',
        relationshipEvidence: 'Some hierarchy transfers, but the overall work posture is broader than the destination.',
      },
      verdict: 'support',
      appearanceIntent: null,
    })),
  };
  publishReferenceDirectionAdmission(f.root, packet,
    signedReviewer(f, packet, REFERENCE_DIRECTION_REVIEWER_TASK, handback),
    f.invocation, f.writer);
  assert.equal(requireReferenceDirectionAdmission(
    f.root, f.reference, f.sourceContractSha256, 'support',
  ).verdict, 'support');
  assert.throws(() => requireReferenceZoneAdmission(f.root, {
    reference: f.reference,
    sourceContractSha256: f.sourceContractSha256,
    zoneId: 'hero',
    axis: 'structure',
    viewport: { width: 1280, height: 900 },
  }), /REFERENCE_ZONE_ADMISSION_MISSING/);
});
