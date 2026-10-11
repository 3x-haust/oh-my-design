import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, watch, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';
import { piRoleReceiptDigest, verifySignedPiEyeRoleResult } from '../core/runtime/pi-role-receipt.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import test, { type TestContext } from 'node:test';
import { runPiReferenceAdmissionReviewer } from '../adapters/pi-reviewer-runtime.ts';
import { authorReferenceBoard } from '../core/ref/board-author.ts';
import { resolveReferenceBoard } from '../core/ref/board.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { captureReferenceNavigation } from '../core/ref/navigation-capture.ts';
import { referenceDiscoveryWork } from '../core/ref/discovery-work.ts';
import { loadDesignCandidates, stageDesignCandidate } from '../core/ref/reference-candidate.ts';
import {
  REFERENCE_DIRECTION_ADMISSION_POINTER,
  buildReferenceDirectionReviewerPacket,
  planReferenceDirectionReview,
  publishReferenceDirectionAdmission,
  readAuthenticatedAdmissionHistory,
  readApprovedReferenceAppearanceIntent,
  requireReferenceDirectionAdmission,
} from '../core/ref/reference-direction-admission.ts';
import { publishReferenceResearch, readPublishedReferenceResearch } from '../core/ref/reference-research.ts';
import { verifyCapture } from '../core/ref/reference-research-validation.ts';
import { requireDesignReferenceAdmission } from '../core/ref/design-admission.ts';
import { publishSearchLeads } from '../core/ref/search-leads.ts';
import { loadRefs, refImagePath, refRecordPath, saveRef } from '../core/ref/store.ts';
import { withBrowser } from '../core/render/index.ts';
import { createTestNativePiInvocation } from '../core/runtime/native-pi-run.ts';
import type { Reference } from '../core/types.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { publishTestAdaptiveRoute, createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { discoveryBrowser } from './helpers/discovery-capture.ts';
import { testPng, testSearchReceipt } from './helpers/search-execution.ts';
import { persistImageFragment } from '../core/ref/image-fragment.ts';

const cliPath = fileURLToPath(new URL('./fixtures/pi-reviewer-rpc.mjs', import.meta.url));
const nodePath = realpathSync(process.execPath);
const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

type Fixture = ReturnType<typeof fixture>;
function fixture(t: TestContext, request?: string) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-reference-direction-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.omd/refs/design'), { recursive: true });
  const skeleton = inputSkeleton('product-route-input').skeleton;
  assert.ok(typeof skeleton === 'object' && skeleton !== null && !Array.isArray(skeleton));
  const routeInput = request === undefined ? skeleton : { ...skeleton, request };
  const routeInvocation = publishTestAdaptiveRoute(root, routeInput, 'Reference admission fixture task');
  const routeRecord = JSON.parse(readFileSync(join(root, '.omd', JSON.parse(readFileSync(join(root, '.omd/route.json'), 'utf8')).record), 'utf8')) as { request: string; sourceContractSha256: string };
  const writer = createTestProjectWriteAdapter(root, routeInvocation);
  const source = 'https://visual.example/released-product';
  const component = 'complete-screen';
  const imagePath = refImagePath(root, { source, component, researchLane: 'design' });
  const png = testPng(2560, 1800, 17);
  const reference: Reference = {
    source, component, researchLane: 'design', kind: 'component', selector: '#app', capturedAt: new Date().toISOString(),
    viewport: { width: 1280, height: 900 }, imagePath: relative(root, imagePath),
    acquisition: { requestedUrl: source, finalUrl: source, httpStatus: 200, links: [], imageSha256: hash(png) },
    invariants: {
      spacingLadder: [8, 16, 24], radiusLadder: [8], elevationLevels: 0, centeredRatio: 0.5,
      tokenCoverage: 1, paddingWeight: 16, typeScale: [16, 24], fontFamilies: ['Inter'],
      weightLadder: [400, 700], motionDurations: [], easingVocab: [], animatedShare: 0,
      hoverCoverage: 0, focusCoverage: 1, animatedProperties: [], hasReducedMotion: true,
      scrollChoreography: [],
    }, principles: ['Preserve the primary work-object hierarchy.'],
    blueprint: { selector: '#app', capturedAt: new Date().toISOString(), nodes: [{ id: 'app', role: 'container', children: [], box: { w: 1280, h: 900 } }] },
  };
  const capturePath = saveRef(root, reference, writer);
  writeFileSync(imagePath, png);
  writeFileSync(join(root, '.omd/frame.md'), '# Reference frame\n');
  writeFileSync(join(root, '.omd/acquisition-plan.json'), JSON.stringify({
    schema: 'reference-acquisition-plan-v1', owner: 'omd-framer',
    zones: [{ id: 'hero', kind: 'section', job: 'Anchor the primary task.', required: true }],
  }));
  const piece = { slotId: 'hero', source, component, targetComponent: 'Hero', targetSelector: '#hero',
    reason: 'Use the approved work-object hierarchy.', take: ['structure'], avoid: 'Do not copy identity.',
    adaptation: 'Use destination content and tokens.', grid: { column: 1, span: 12, order: 0 }, rights: 'lawful',
    signal: 'high-visual-system', motionAxis: 'absent' };
  const boardInput = { candidates: [
    { id: 'one', label: 'One', route: '/', rationale: 'Approved direction.', pieces: [piece] },
    { id: 'two', label: 'Two', route: '/', rationale: 'Approved direction, alternate assembly.', pieces: [{ ...piece, targetSelector: '#hero-alt' }] },
  ] };
  const host = { nodePath, nodeSha256: hash(readFileSync(nodePath)), cliPath, cliSha256: hash(readFileSync(cliPath)),
    provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'high', parentSessionId: 'reference-parent' };
  const invocation = createTestNativePiInvocation({ root, host, current: routeInvocation.current });
  return { root, writer, invocation, reference, capturePath, imagePath, png, boardInput,
    sourceContractSha256: routeRecord.sourceContractSha256, task: routeRecord.request };
}

async function authenticatedAdmission(t: TestContext, f: Fixture, mode = 'reference-direction',
  references: readonly Reference[] = [f.reference], previousAdmissionSha256?: string | null) {
  const oldMode = process.env.PI_REVIEWER_FIXTURE_MODE;
  process.env.PI_REVIEWER_FIXTURE_MODE = mode;
  t.after(() => { if (oldMode === undefined) delete process.env.PI_REVIEWER_FIXTURE_MODE; else process.env.PI_REVIEWER_FIXTURE_MODE = oldMode; });
  const trace = join(f.root, `trace-${mode}.jsonl`);
  writeFileSync(trace, '');
  const oldTrace = process.env.PI_REVIEWER_FIXTURE_TRACE;
  process.env.PI_REVIEWER_FIXTURE_TRACE = trace;
  t.after(() => { if (oldTrace === undefined) delete process.env.PI_REVIEWER_FIXTURE_TRACE; else process.env.PI_REVIEWER_FIXTURE_TRACE = oldTrace; });
  let resolveEvidence!: () => void;
  const evidence = new Promise<void>(resolve => { resolveEvidence = resolve; });
  const watcher = watch(trace, () => {
    if (readFileSync(trace, 'utf8').split('\n').some(line => line && JSON.parse(line).event === 'evidence')) resolveEvidence();
  });
  t.after(() => watcher.close());
  const packet = buildReferenceDirectionReviewerPacket(f.root, {
    sourceContractSha256: f.sourceContractSha256, task: f.task, references,
    ...(previousAdmissionSha256 === undefined ? {} : { previousAdmissionSha256 }),
  });
  const result = await runPiReferenceAdmissionReviewer({ root: f.root, invocation: f.invocation, packet, signal: t.signal });
  await Promise.race([evidence, new Promise<never>((_, reject) => AbortSignal.timeout(5_000).addEventListener('abort', () => reject(new Error('reviewer evidence event timeout')), { once: true }))]);
  return { packet, result };
}

test('invalid reviewer bindings identify the exact mismatched field without publication', { timeout: 30_000 }, async t => {
  const f = fixture(t);
  const { packet, result } = await authenticatedAdmission(t, f, 'reference-wrong-task-binding');
  assert.throws(() => publishReferenceDirectionAdmission(f.root, packet, result, f.invocation, f.writer),
    /REFERENCE_DIRECTION_HANDBACK_INVALID:fixed-bindings:taskSha256/);
  assert.equal(existsSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER)), false);
});

test('a signed direction without distinct aesthetic and user-relationship judgments refuses without mutation', { timeout: 30_000 }, async t => {
  const f = fixture(t);
  const { packet, result } = await authenticatedAdmission(t, f, 'reference-missing-quality');
  assert.throws(() => publishReferenceDirectionAdmission(f.root, packet, result, f.invocation, f.writer),
    /REFERENCE_DIRECTION_(?:HANDBACK_INVALID|QUALITY_CONTRADICTION)/);
  assert.equal(existsSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER)), false);
  assert.deepEqual(readFileSync(f.imagePath), f.png);
});

for (const mode of ['reference-ordinary-direction', 'reference-bounded-direction', 'reference-incompatible-direction']) {
  test(`${mode} cannot publish a direction or change prior evidence`, { timeout: 30_000 }, async t => {
    const f = fixture(t);
    const { packet, result } = await authenticatedAdmission(t, f, mode);
    assert.throws(() => publishReferenceDirectionAdmission(f.root, packet, result, f.invocation, f.writer),
      /REFERENCE_DIRECTION_QUALITY_CONTRADICTION/);
    assert.equal(existsSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER)), false);
    assert.deepEqual(readFileSync(f.imagePath), f.png);
  });
}

test('ordinary bounded transfer remains support without authorizing a board', { timeout: 30_000 }, async t => {
  const f = fixture(t);
  const { packet, result } = await authenticatedAdmission(t, f, 'reference-ordinary-support');
  const record = publishReferenceDirectionAdmission(f.root, packet, result, f.invocation, f.writer);
  assert.equal(record.admissions[0]?.assessment?.visualQuality, 'ordinary');
  assert.equal(record.admissions[0]?.assessment?.userRelationship, 'bounded');
  assert.equal(requireReferenceDirectionAdmission(f.root, f.reference, f.sourceContractSha256, 'support').verdict, 'support');
  assert.throws(() => authorReferenceBoard(f.root, f.boardInput), /REFERENCE_DIRECTION_ADMISSION_SUPPORT_ONLY/);
});

test('signed wrapper-as-direction assessments refuse without changing retained refs or publication', { timeout: 45_000 }, async t => {
  const f = fixture(t);
  const previousBoard = Buffer.from('previous board');
  const previousResearch = Buffer.from('previous research');
  writeFileSync(join(f.root, '.omd/reference-board.json'), previousBoard);
  writeFileSync(join(f.root, '.omd/reference-research.json'), previousResearch);
  for (const mode of ['reference-documentation-wrapper-direction', 'reference-promotional-wrapper-direction',
    'reference-missing-assessment', 'reference-ordinary-direction', 'reference-incompatible-direction', 'reference-missing-quality']) {
    const { packet, result } = await authenticatedAdmission(t, f, mode);
    assert.throws(() => publishReferenceDirectionAdmission(f.root, packet, result, f.invocation, f.writer),
      /REFERENCE_DIRECTION_(?:HANDBACK_INVALID|ASSESSMENT_CONTRADICTION|QUALITY_CONTRADICTION)/);
    assert.equal(existsSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER)), false);
    assert.deepEqual(readFileSync(f.capturePath), readFileSync(refRecordPath(f.root, f.reference)));
    assert.deepEqual(readFileSync(f.imagePath), f.png);
    assert.deepEqual(readFileSync(join(f.root, '.omd/reference-board.json')), previousBoard);
    assert.deepEqual(readFileSync(join(f.root, '.omd/reference-research.json')), previousResearch);
  }
});

test('consumers refuse manually persisted authenticated wrapper and missing-assessment directions', { timeout: 45_000 }, async t => {
  for (const mode of ['reference-documentation-wrapper-direction', 'reference-promotional-wrapper-direction',
    'reference-missing-assessment', 'reference-ordinary-direction', 'reference-incompatible-direction', 'reference-missing-quality']) {
    const f = fixture(t);
    const { packet, result } = await authenticatedAdmission(t, f, mode);
    const handback: Record<string, unknown> = JSON.parse(verifySignedPiEyeRoleResult(result, f.root).finalMessage);
    const record = {
      schema: 'reference-direction-admission-v4', packetSha256: hash(packet),
      sourceContractSha256: f.sourceContractSha256, taskSha256: handback.taskSha256,
      captureSetSha256: handback.captureSetSha256, previousAdmissionSha256: handback.previousAdmissionSha256,
      admissions: handback.admissions, reviewer: result,
    };
    const bytes = canonicalJson(record);
    const recordPath = `reference-direction-admissions/sha256-${hash(bytes)}.json`;
    f.writer.writeContentAddressed(`.omd/${recordPath}`, bytes);
    const pointer = canonicalJson({ schema: 'reference-direction-admission-pointer-v1',
      sourceContractSha256: f.sourceContractSha256, taskSha256: handback.taskSha256,
      record: recordPath, sha256: hash(bytes) });
    f.writer.write(REFERENCE_DIRECTION_ADMISSION_POINTER, pointer);
    assert.throws(() => requireReferenceDirectionAdmission(f.root, f.reference, f.sourceContractSha256),
      /REFERENCE_DIRECTION_(?:HANDBACK_INVALID|ASSESSMENT_CONTRADICTION|QUALITY_CONTRADICTION)/);
    assert.throws(() => authorReferenceBoard(f.root, f.boardInput),
      /REFERENCE_DIRECTION_(?:HANDBACK_INVALID|ASSESSMENT_CONTRADICTION|QUALITY_CONTRADICTION)/);
    assert.equal(readFileSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER), 'utf8'), pointer);
    assert.deepEqual(readFileSync(f.imagePath), f.png);
  }
});

test('authenticated isolated Eye consumes exact retained 2x PNG and authorizes board publication', { timeout: 30_000 }, async t => {
  const f = fixture(t);
  const { packet, result } = await authenticatedAdmission(t, f);
  const decoded = JSON.parse(packet.toString('utf8')) as {
    evidence: { referenceRenders: { sourceId: string; lane: string; captureSha256: string; imageSha256: string; pngBase64: string }[] };
    outputContract: {
      assessmentSchema?: {
        type: string; additionalProperties: boolean; required: string[];
        properties: { captureType: { enum: string[] }; directionQualification: { enum: string[] };
          visibleEvidence: { type: string; minLength: number } };
      };
      responseTemplate?: { admissions: Record<string, unknown>[] };
    };
  };
  assert.deepEqual(decoded.outputContract.assessmentSchema, {
    type: 'object', additionalProperties: false,
    required: ['captureType', 'directionQualification', 'visibleEvidence',
      'visualQuality', 'visualEvidence', 'userRelationship', 'relationshipEvidence'],
    properties: {
      captureType: { enum: ['finished-product-task-screen', 'finished-website', 'documentation-help-wrapper',
        'changelog-promotional-wrapper', 'discovery-list', 'isolated-component-detail',
        'blocked-or-loading-content', 'uncertain-content'] },
      directionQualification: { enum: ['qualifies', 'support-only', 'ineligible'] },
      visibleEvidence: { type: 'string', minLength: 1 },
      visualQuality: { enum: ['excellent', 'ordinary', 'weak'] },
      visualEvidence: { type: 'string', minLength: 1 },
      userRelationship: { enum: ['fits', 'bounded', 'incompatible'] },
      relationshipEvidence: { type: 'string', minLength: 1 },
    },
  });
  assert.deepEqual(Buffer.from(decoded.evidence.referenceRenders[0]!.pngBase64, 'base64'), f.png);
  assert.equal(decoded.evidence.referenceRenders[0]!.imageSha256, hash(f.png));
  assert.deepEqual(Object.keys(decoded.outputContract.responseTemplate ?? {}).sort(),
    ['schema', 'lane', 'sourceContractSha256', 'taskSha256', 'captureSetSha256', 'previousAdmissionSha256', 'admissions'].sort());
  assert.deepEqual(decoded.outputContract.responseTemplate?.admissions[0], {
    sourceId: decoded.evidence.referenceRenders[0]!.sourceId, lane: 'design',
    captureSha256: decoded.evidence.referenceRenders[0]!.captureSha256,
    imageSha256: decoded.evidence.referenceRenders[0]!.imageSha256,
    assessment: { captureType: null, directionQualification: null, visibleEvidence: null,
      visualQuality: null, visualEvidence: null, userRelationship: null, relationshipEvidence: null },
    verdict: null, appearanceIntent: null,
  });
  const forged = structuredClone(decoded);
  forged.outputContract.responseTemplate!.admissions[0]!.imageSha256 = '0'.repeat(64);
  assert.throws(() => publishReferenceDirectionAdmission(f.root, Buffer.from(JSON.stringify(forged)),
    result, f.invocation, f.writer), /REFERENCE_DIRECTION_PACKET_INVALID/);
  assert.equal(existsSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER)), false);
  const forgedSchema = structuredClone(decoded);
  forgedSchema.outputContract.assessmentSchema!.properties.directionQualification.enum.push('approved');
  assert.throws(() => publishReferenceDirectionAdmission(f.root, Buffer.from(JSON.stringify(forgedSchema)),
    result, f.invocation, f.writer), /REFERENCE_DIRECTION_PACKET_INVALID/);
  assert.equal(existsSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER)), false);
  publishReferenceDirectionAdmission(f.root, packet, result, f.invocation, f.writer);

  const board = authorReferenceBoard(f.root, f.boardInput);
  f.writer.write('.omd/reference-board.json', canonicalJson(board));

  assert.ok(existsSync(join(f.root, '.omd/reference-board.json')));
  assert.deepEqual(readApprovedReferenceAppearanceIntent(f.root, f.reference), ['A focused primary work object with restrained supporting hierarchy.']);
  const pointerPath = join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER);
  const pointer = readFileSync(pointerPath);
  const boardBytes = readFileSync(join(f.root, '.omd/reference-board.json'));
  rmSync(pointerPath);
  assert.throws(() => resolveReferenceBoard(f.root, board), /REFERENCE_DIRECTION_ADMISSION_MISSING/);
  assert.deepEqual(readFileSync(join(f.root, '.omd/reference-board.json')), boardBytes);
  writeFileSync(pointerPath, pointer);
});

test('a qualifying complete finished website can become a direction without matching product features', { timeout: 30_000 }, async t => {
  const f = fixture(t);
  const { packet, result } = await authenticatedAdmission(t, f, 'reference-finished-website');
  const record = publishReferenceDirectionAdmission(f.root, packet, result, f.invocation, f.writer);
  assert.equal(record.schema, 'reference-direction-admission-v4');
  assert.equal(record.admissions[0]?.assessment?.captureType, 'finished-website');
  assert.equal(requireReferenceDirectionAdmission(f.root, f.reference, f.sourceContractSha256).verdict, 'direction');
});

test('authenticated v3 history remains inspectable but cannot authorize current direction or publication', { timeout: 30_000 }, async t => {
  const f = fixture(t);
  const { packet, result } = await authenticatedAdmission(t, f);
  const decoded: { schema: string; outputContract: { schema: string;
    assessmentSchema: { required: string[]; properties: Record<string, unknown> };
    responseTemplate: { schema: string; admissions: { assessment: Record<string, unknown> }[] } } } =
    JSON.parse(packet.toString('utf8'));
  decoded.schema = 'reference-direction-reviewer-transport-v3';
  decoded.outputContract.schema = 'reference-direction-reviewer-handback-v3';
  const scopedFields = ['captureType', 'directionQualification', 'visibleEvidence'];
  decoded.outputContract.assessmentSchema.required = scopedFields;
  decoded.outputContract.assessmentSchema.properties = Object.fromEntries(Object.entries(
    decoded.outputContract.assessmentSchema.properties).filter(([key]) => scopedFields.includes(key)));
  decoded.outputContract.responseTemplate.schema = 'reference-direction-reviewer-handback-v3';
  decoded.outputContract.responseTemplate.admissions = decoded.outputContract.responseTemplate.admissions.map(row => ({
    ...row, assessment: Object.fromEntries(scopedFields.map(key => [key, row.assessment[key]])),
  }));
  const legacyPacket = Buffer.from(canonicalJson(decoded));
  const current: { schema: string; taskSha256: string; captureSetSha256: string;
    admissions: (Record<string, unknown> & { assessment: Record<string, unknown> })[] } = JSON.parse(result.finalMessage);
  current.schema = 'reference-direction-reviewer-handback-v3';
  current.admissions = current.admissions.map((row: { assessment: Record<string, unknown> }) => ({
    ...row, assessment: { captureType: row.assessment.captureType,
      directionQualification: row.assessment.directionQualification, visibleEvidence: row.assessment.visibleEvidence },
  }));
  const finalMessage = canonicalJson(current);
  const taskSha256 = '00afec811f3dbeec0ea3c49e2feaca9bae109e0650aa45da4b6218fa527b19b1';
  const receipt = { ...result.authority.receipt, finalMessage, taskSha256,
    reviewerEvidence: { ...result.authority.receipt.reviewerEvidence, taskSha256, packetSha256: hash(legacyPacket) } };
  const reviewer = { ...result, finalMessage, authority: { receipt,
    signature: signNativeObservation(f.root, receipt.schema, piRoleReceiptDigest(receipt)) } };
  const bytes = canonicalJson({ schema: 'reference-direction-admission-v3', packetSha256: hash(legacyPacket),
    sourceContractSha256: f.sourceContractSha256, taskSha256: current.taskSha256,
    captureSetSha256: current.captureSetSha256, previousAdmissionSha256: null,
    admissions: current.admissions, reviewer });
  const record = `reference-direction-admissions/sha256-${hash(bytes)}.json`;
  f.writer.writeContentAddressed(`.omd/${record}`, bytes);
  const pointer = canonicalJson({ schema: 'reference-direction-admission-pointer-v1',
    sourceContractSha256: f.sourceContractSha256, taskSha256: current.taskSha256, record, sha256: hash(bytes) });
  f.writer.write(REFERENCE_DIRECTION_ADMISSION_POINTER, pointer);
  const history = readAuthenticatedAdmissionHistory(f.root, f.sourceContractSha256);
  assert.equal(history.length, 1);
  assert.deepEqual(history[0]?.admissions, []);
  assert.equal(history[0]?.record.admissions[0]?.verdict, 'direction');
  assert.throws(() => requireReferenceDirectionAdmission(f.root, f.reference, f.sourceContractSha256),
    /REFERENCE_DIRECTION_ADMISSION_MISSING/);
  assert.throws(() => publishReferenceDirectionAdmission(f.root, legacyPacket, reviewer, f.invocation, f.writer),
    /REFERENCE_DIRECTION_PACKET_INVALID/);
  assert.equal(readFileSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER), 'utf8'), pointer);
});

test('quality evidence cannot carry source payload', { timeout: 30_000 }, async t => {
  const f = fixture(t);
  const { packet, result } = await authenticatedAdmission(t, f, 'reference-quality-leak');
  assert.throws(() => publishReferenceDirectionAdmission(f.root, packet, result, f.invocation, f.writer),
    /REFERENCE_DIRECTION_APPEARANCE_SOURCE_PAYLOAD:quality/);
  assert.equal(existsSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER)), false);
});

test('a later signed Eye batch retains an earlier approved direction', { timeout: 45_000 }, async t => {
  const f = fixture(t);
  const first = await authenticatedAdmission(t, f);
  publishReferenceDirectionAdmission(f.root, first.packet, first.result, f.invocation, f.writer);
  const firstSha256 = readAuthenticatedAdmissionHistory(f.root, f.sourceContractSha256)[0]?.sha256;
  assert.ok(firstSha256);

  const source = 'https://visual.example/another-released-product';
  const component = 'another-complete-screen';
  const imagePath = refImagePath(f.root, { source, component, researchLane: 'design' });
  const png = testPng(2560, 1800, 19);
  const reference: Reference = {
    ...f.reference, source, component, imagePath: relative(f.root, imagePath),
    acquisition: { ...f.reference.acquisition!, requestedUrl: source, finalUrl: source, imageSha256: hash(png) },
  };
  saveRef(f.root, reference, f.writer);
  writeFileSync(imagePath, png);

  const next = await authenticatedAdmission(t, f, 'reference-support', [reference], firstSha256);
  publishReferenceDirectionAdmission(f.root, next.packet, next.result, f.invocation, f.writer);
  assert.equal(readAuthenticatedAdmissionHistory(f.root, f.sourceContractSha256).length, 2);
  assert.deepEqual(planReferenceDirectionReview(f.root, {
    sourceContractSha256: f.sourceContractSha256, task: f.task, references: [f.reference, reference],
  }), { packet: null, selected: 0, pending: 0, carried: 2 });
  assert.deepEqual(readApprovedReferenceAppearanceIntent(f.root, f.reference),
    ['A focused primary work object with restrained supporting hierarchy.']);
  assert.equal(requireReferenceDirectionAdmission(f.root, reference, f.sourceContractSha256, 'support').verdict, 'support');
  assert.throws(() => requireReferenceDirectionAdmission(f.root, reference, f.sourceContractSha256),
    /REFERENCE_DIRECTION_ADMISSION_SUPPORT_ONLY/);

  const firstRecord = join(f.root, '.omd/reference-direction-admissions', `sha256-${firstSha256}.json`);
  const bytes = readFileSync(firstRecord);
  writeFileSync(firstRecord, Buffer.from('{}'));
  assert.throws(() => readApprovedReferenceAppearanceIntent(f.root, f.reference),
    /REFERENCE_DIRECTION_ADMISSION_FORGED/);
  writeFileSync(firstRecord, bytes);
  assert.deepEqual(readApprovedReferenceAppearanceIntent(f.root, f.reference),
    ['A focused primary work object with restrained supporting hierarchy.']);
});

test('stale predecessor cannot discard an authenticated Eye batch', { timeout: 30_000 }, async t => {
  const f = fixture(t);
  const stale = await authenticatedAdmission(t, f, 'reference-support', [f.reference], null);
  const first = await authenticatedAdmission(t, f);
  publishReferenceDirectionAdmission(f.root, first.packet, first.result, f.invocation, f.writer);
  const pointer = readFileSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER));
  assert.throws(() => publishReferenceDirectionAdmission(f.root, stale.packet, stale.result, f.invocation, f.writer),
    /REFERENCE_DIRECTION_ADMISSION_STALE/);
  assert.deepEqual(readFileSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER)), pointer);
  assert.deepEqual(readApprovedReferenceAppearanceIntent(f.root, f.reference),
    ['A focused primary work object with restrained supporting hierarchy.']);
});

test('direction planning uses the packet task normalization while preserving the route request bytes', { timeout: 30_000 }, async t => {
  const request = '\n  Build a personal reading app. \n';
  const f = fixture(t, request);
  assert.equal(f.task, request);
  const planned = planReferenceDirectionReview(f.root, {
    sourceContractSha256: f.sourceContractSha256, task: f.task, references: [f.reference],
  });
  assert.ok(planned.packet);
  assert.equal(planned.selected, 1);
  const reviewed = await authenticatedAdmission(t, f);
  publishReferenceDirectionAdmission(f.root, reviewed.packet, reviewed.result, f.invocation, f.writer);
  assert.equal(planReferenceDirectionReview(f.root, {
    sourceContractSha256: f.sourceContractSha256, task: f.task, references: [f.reference],
  }).carried, 1);
  assert.throws(() => planReferenceDirectionReview(f.root, {
    sourceContractSha256: f.sourceContractSha256, task: 'A different task', references: [f.reference],
  }), /REFERENCE_DIRECTION_ADMISSION_STALE/);
  assert.equal(readPersistedRoute(f.root, f.invocation).request, request);
});

test('a legitimate source-contract change prepares and publishes a fresh review without carrying the old verdict', { timeout: 45_000 }, async t => {
  const f = fixture(t);
  const first = await authenticatedAdmission(t, f, 'reference-reject');
  publishReferenceDirectionAdmission(f.root, first.packet, first.result, f.invocation, f.writer);
  assert.throws(() => requireReferenceDirectionAdmission(f.root, f.reference, f.sourceContractSha256, 'support'),
    /REFERENCE_DIRECTION_ADMISSION_REJECTED/);

  const changedRouteInput = structuredClone(inputSkeleton('product-route-input').skeleton) as { allowedPaths: string[] };
  changedRouteInput.allowedPaths.push('public/build/**');
  publishTestAdaptiveRoute(f.root, changedRouteInput, 'Reference admission fixture task');
  const routePointer = JSON.parse(readFileSync(join(f.root, '.omd/route.json'), 'utf8')) as { record: string };
  const route = JSON.parse(readFileSync(join(f.root, '.omd', routePointer.record), 'utf8')) as {
    request: string; sourceContractSha256: string;
  };
  assert.notEqual(route.sourceContractSha256, f.sourceContractSha256);
  const changed = { ...f, sourceContractSha256: route.sourceContractSha256, task: route.request };

  const plan = planReferenceDirectionReview(changed.root, {
    sourceContractSha256: changed.sourceContractSha256, task: changed.task, references: [changed.reference],
  });
  assert.equal(plan.selected, 1);
  assert.equal(plan.carried, 0);
  assert.ok(plan.packet);
  assert.equal((JSON.parse(plan.packet.toString('utf8')) as {
    outputContract: { fixedBindings: { previousAdmissionSha256: string | null } };
  }).outputContract.fixedBindings.previousAdmissionSha256, null);
  assert.throws(() => requireReferenceDirectionAdmission(changed.root, changed.reference, changed.sourceContractSha256, 'support'),
    /REFERENCE_DIRECTION_ADMISSION_STALE/);

  const fresh = await authenticatedAdmission(t, changed, 'reference-ordinary-support', [changed.reference], null);
  publishReferenceDirectionAdmission(changed.root, fresh.packet, fresh.result, changed.invocation, changed.writer);
  assert.equal(requireReferenceDirectionAdmission(changed.root, changed.reference,
    changed.sourceContractSha256, 'support').verdict, 'support');
  assert.equal(readAuthenticatedAdmissionHistory(changed.root, changed.sourceContractSha256).length, 1);
});

test('a corrupt prior-context admission refuses fresh review preparation after a source-contract change', { timeout: 30_000 }, async t => {
  const f = fixture(t);
  const first = await authenticatedAdmission(t, f);
  publishReferenceDirectionAdmission(f.root, first.packet, first.result, f.invocation, f.writer);
  const pointerBefore = readFileSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER));
  const pointer = JSON.parse(pointerBefore.toString('utf8')) as { record: string };
  writeFileSync(join(f.root, '.omd', pointer.record), Buffer.from('{}'));

  const changedRouteInput = structuredClone(inputSkeleton('product-route-input').skeleton) as { allowedPaths: string[] };
  changedRouteInput.allowedPaths.push('public/build/**');
  publishTestAdaptiveRoute(f.root, changedRouteInput, 'Reference admission fixture task');
  const routePointer = JSON.parse(readFileSync(join(f.root, '.omd/route.json'), 'utf8')) as { record: string };
  const route = JSON.parse(readFileSync(join(f.root, '.omd', routePointer.record), 'utf8')) as {
    request: string; sourceContractSha256: string;
  };

  assert.throws(() => planReferenceDirectionReview(f.root, {
    sourceContractSha256: route.sourceContractSha256, task: route.request, references: [f.reference],
  }), /REFERENCE_DIRECTION_ADMISSION_FORGED/);
  assert.deepEqual(readFileSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER)), pointerBefore);
});

test('authenticated support candidates retain exact evidence without authorizing visual direction', { timeout: 30_000 }, async t => {
  const f = fixture(t);
  assert.ok(f.reference.acquisition);
  const source = 'https://visual.example/measured-support';
  const component = 'support-screen';
  const finalImage = refImagePath(f.root, { source, component, researchLane: 'design' });
  const reference: Reference = {
    ...f.reference, source, component, imagePath: relative(f.root, finalImage),
    acquisition: { ...f.reference.acquisition, requestedUrl: source, finalUrl: source },
  };
  const candidate = stageDesignCandidate(f.root, reference, f.png, f.writer);
  const finalRecord = refRecordPath(f.root, reference);
  const originalRecord = readFileSync(join(f.root, candidate.path));
  assert.equal(existsSync(finalRecord), false);
  assert.equal(existsSync(finalImage), false);
  const { packet, result } = await authenticatedAdmission(t, f, 'reference-ordinary-support', [reference], null);

  publishReferenceDirectionAdmission(f.root, packet, result, f.invocation, f.writer);

  assert.equal(existsSync(finalRecord), true);
  assert.deepEqual(readFileSync(finalRecord), originalRecord);
  assert.deepEqual(readFileSync(finalImage), f.png);
  assert.equal(requireReferenceDirectionAdmission(f.root, reference, f.sourceContractSha256, 'support').verdict, 'support');
  assert.throws(() => requireReferenceDirectionAdmission(f.root, reference, f.sourceContractSha256),
    /REFERENCE_DIRECTION_ADMISSION_SUPPORT_ONLY/);
  assert.throws(() => readApprovedReferenceAppearanceIntent(f.root, reference),
    /REFERENCE_DIRECTION_ADMISSION_SUPPORT_ONLY/);
  const supportBoard = {
    candidates: f.boardInput.candidates.map(candidate => ({
      ...candidate, pieces: candidate.pieces.map(piece => ({ ...piece, source, component })),
    })),
  };
  assert.throws(() => authorReferenceBoard(f.root, supportBoard), /REFERENCE_DIRECTION_ADMISSION_SUPPORT_ONLY/);
  assert.equal(referenceDiscoveryWork(f.root, readPersistedRoute(f.root, f.invocation)).progress.designFamilies, 0);
  assert.deepEqual(planReferenceDirectionReview(f.root, {
    sourceContractSha256: f.sourceContractSha256, task: f.task, references: [reference],
  }), { packet: null, selected: 0, pending: 0, carried: 1 });
});

test('quarantined full-resolution candidates promote authenticated Eye directions and keep rejects quarantined', { timeout: 45_000 }, async t => {
  const f = fixture(t);
  const stage = (source: string, component: string, fill: number) => {
    const image = testPng(2560, 1800, fill);
    const finalImage = refImagePath(f.root, { source, component, researchLane: 'design' });
    const reference: Reference = {
      ...f.reference, source, component, imagePath: relative(f.root, finalImage),
      acquisition: { ...f.reference.acquisition!, requestedUrl: source, finalUrl: source, imageSha256: hash(image) },
    };
    const candidate = stageDesignCandidate(f.root, reference, image, f.writer);
    return { reference, image, candidate, finalImage, finalRecord: refRecordPath(f.root, reference) };
  };
  const rejected = stage('https://visual.example/rejected-workspace', 'rejected-screen', 21);
  assert.equal(existsSync(rejected.finalImage), false);
  assert.equal(existsSync(rejected.finalRecord), false);
  assert.ok(loadDesignCandidates(f.root).some(item => item.reference.source === rejected.reference.source));
  assert.ok(!loadRefs(f.root).some(item => item.source === rejected.reference.source));
  const originalCandidatePng = readFileSync(join(f.root, rejected.candidate.imagePath));
  writeFileSync(join(f.root, rejected.candidate.imagePath), testPng(2560, 1800, 24));
  assert.throws(() => planReferenceDirectionReview(f.root, {
    sourceContractSha256: f.sourceContractSha256, task: f.task, references: [rejected.reference],
  }), /REFERENCE_CANDIDATE_FORGED/);
  assert.equal(existsSync(rejected.finalRecord), false);
  writeFileSync(join(f.root, rejected.candidate.imagePath), originalCandidatePng);
  const refusal = await authenticatedAdmission(t, f, 'reference-reject', [rejected.reference], null);
  assert.deepEqual(Buffer.from((JSON.parse(refusal.packet.toString('utf8')) as {
    evidence: { referenceRenders: { pngBase64: string }[] };
  }).evidence.referenceRenders[0]!.pngBase64, 'base64'), rejected.image);
  publishReferenceDirectionAdmission(f.root, refusal.packet, refusal.result, f.invocation, f.writer);
  assert.equal(existsSync(rejected.finalRecord), false);
  assert.equal(existsSync(rejected.finalImage), false);
  assert.deepEqual(planReferenceDirectionReview(f.root, {
    sourceContractSha256: f.sourceContractSha256, task: f.task, references: [rejected.reference],
  }), { packet: null, selected: 0, pending: 0, carried: 1 });
  const revised: Reference = { ...rejected.reference,
    capturedAt: new Date(Date.parse(rejected.reference.capturedAt) + 1000).toISOString(),
    principles: ['A different captured work-object hierarchy.'] };
  const revisedCandidate = stageDesignCandidate(f.root, revised, rejected.image, f.writer);
  assert.notEqual(hash(readFileSync(join(f.root, revisedCandidate.path))), hash(readFileSync(join(f.root, rejected.candidate.path))));
  assert.deepEqual({ ...planReferenceDirectionReview(f.root, {
    sourceContractSha256: f.sourceContractSha256, task: f.task, references: [revised],
  }), packet: null }, { packet: null, selected: 1, pending: 0, carried: 0 },
  'the same PNG with a different staged capture needs its own review');

  const approved = stage('https://visual.example/complete-task', 'approved-screen', 23);
  const previousSha256 = readAuthenticatedAdmissionHistory(f.root, f.sourceContractSha256)[0]?.sha256;
  assert.ok(previousSha256);
  const signed = await authenticatedAdmission(t, f, 'reference-direction', [approved.reference], previousSha256);
  const originalRecord = readFileSync(join(f.root, approved.candidate.path));
  writeFileSync(join(f.root, approved.candidate.path), Buffer.from('{}'));
  const pointerBefore = readFileSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER));
  assert.throws(() => publishReferenceDirectionAdmission(f.root, signed.packet, signed.result, f.invocation, f.writer),
    /REFERENCE_CANDIDATE_FORGED/);
  assert.deepEqual(readFileSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER)), pointerBefore);
  assert.equal(existsSync(approved.finalRecord), false);
  writeFileSync(join(f.root, approved.candidate.path), originalRecord);
  assert.equal(referenceDiscoveryWork(f.root, readPersistedRoute(f.root, f.invocation)).progress.designFamilies, 0);
  publishReferenceDirectionAdmission(f.root, signed.packet, signed.result, f.invocation, f.writer);
  assert.deepEqual(readFileSync(approved.finalRecord), originalRecord);
  assert.deepEqual(readFileSync(approved.finalImage), approved.image);
  assert.equal(requireReferenceDirectionAdmission(f.root, approved.reference, f.sourceContractSha256).verdict, 'direction');
  assert.equal(referenceDiscoveryWork(f.root, readPersistedRoute(f.root, f.invocation)).progress.designFamilies, 1);
  assert.equal(existsSync(rejected.finalRecord), false);
  assert.equal(readAuthenticatedAdmissionHistory(f.root, f.sourceContractSha256).length, 2);
});

test('Eye packet batches count serialized bytes and refuse oversized originals', t => {
  const f = fixture(t);
  const padded = (png: Buffer, length: number): Buffer => {
    const type = Buffer.from('tEXt');
    const data = Buffer.concat([Buffer.from('Note\0'), Buffer.alloc(length, 65)]);
    const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
    const body = Buffer.concat([type, data]);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([png.subarray(0, -12), size, body, checksum, png.subarray(-12)]);
  };
  const large = padded(f.png, 3_800_000);
  const first: Reference = { ...f.reference, acquisition: { ...f.reference.acquisition!, imageSha256: hash(large) } };
  saveRef(f.root, first, f.writer);
  writeFileSync(f.imagePath, large);
  const source = 'https://visual.example/second-original';
  const component = 'second-screen';
  const secondPath = refImagePath(f.root, { source, component, researchLane: 'design' });
  const second: Reference = {
    ...first, source, component, imagePath: relative(f.root, secondPath),
    acquisition: { ...first.acquisition!, requestedUrl: source, finalUrl: source },
  };
  saveRef(f.root, second, f.writer);
  writeFileSync(secondPath, large);

  const plan = planReferenceDirectionReview(f.root, {
    sourceContractSha256: f.sourceContractSha256, task: f.task, references: [first, second],
  });
  assert.equal(plan.selected, 1);
  assert.equal(plan.pending, 1);
  assert.ok(plan.packet && plan.packet.byteLength <= 8_388_608);
  const packet = JSON.parse(plan.packet.toString('utf8')) as { evidence: { referenceRenders: unknown[] } };
  assert.equal(packet.evidence.referenceRenders.length, 1);
  assert.equal(existsSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER)), false);

  const tooLarge = padded(f.png, 6_400_000);
  const oversized: Reference = { ...first, acquisition: { ...first.acquisition!, imageSha256: hash(tooLarge) } };
  saveRef(f.root, oversized, f.writer);
  writeFileSync(f.imagePath, tooLarge);
  assert.throws(() => planReferenceDirectionReview(f.root, {
    sourceContractSha256: f.sourceContractSha256, task: f.task, references: [oversized],
  }), /REFERENCE_DIRECTION_CAPTURE_TOO_LARGE/);
  assert.equal(existsSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER)), false);
});

test('current v8 research publishes a signed direct component only after independent pixel admission', { timeout: 30_000 }, async t => {
  const f = fixture(t);
  const domain = await withBrowser(async browser => {
    const entries = [];
    for (const host of ['alpha.com', 'beta.im', 'gamma.info']) {
      const url = `https://${host}/benefits`;
      const page = discoveryBrowser(browser, { url,
        html: '<main><h1>Benefit service catalogue</h1><p>Check eligibility for support</p><a href="https://other.example/benefits">Explore benefits</a></main>' });
      entries.push(await captureReferenceNavigation(page.browser, url, 'domain', f.writer, 'public-directory'));
    }
    const page = discoveryBrowser(browser, { url: f.reference.source,
      html: '<main><h1>Application workspace</h1><p>Review eligibility and prepare the application.</p></main>' });
    const product = await captureReferenceNavigation(page.browser, f.reference.source, 'design', f.writer);
    return { entries, product };
  });
  const query = 'beautiful benefit application';
  const lead = publishSearchLeads(f.writer, f.sourceContractSha256, {
    schema: 'reference-search-leads-v1', lane: 'design', query, urls: [f.reference.source],
    provider: 'host', tool: 'web_search', observedAt: new Date().toISOString(),
  });
  const research = {
    schema: 'reference-research-v8', sourceContractSha256: f.sourceContractSha256, marketCoverage: null,
    domainReference: { queries: [], searches: [], benchmarkSha256: null,
      sources: domain.entries.map((entry, index) => ({
        id: `service-${index}`, url: entry.url,
        observations: [{ url: entry.url, capture: entry.capture }], marketObservationSha256: entry.capture.sha256,
        features: [{ id: 'eligibility', observedLabel: 'Check eligibility for support',
          finding: 'Eligibility check is visible.', evidence: [{ observationSha256: entry.capture.sha256,
            field: 'taskText', quote: 'Check eligibility for support', linkUrl: null }] }],
        similarities: [{ requestQuote: f.task, featureIds: ['eligibility'],
          assessment: 'Shares the application task.' }],
        differences: [], adopt: [{ featureIds: ['eligibility'], action: 'Explain eligibility.',
          reason: 'Reduce uncertainty.' }], avoid: [], limitations: [],
      })) },
    designReference: { queries: [query], searches: [testSearchReceipt(f.root, 'design', query, [], true)],
      leads: [lead], boardSha256: '0'.repeat(64), sources: [{
        id: 'released-product', url: f.reference.source, observedAt: new Date().toISOString().slice(0, 10),
        decision: 'Inspect the primary work object.', finding: 'Application is the focal task.',
        evidence: { path: f.reference.imagePath, sha256: hash(f.png) },
        capture: { path: relative(f.root, f.capturePath), sha256: hash(readFileSync(f.capturePath)) },
        visualRole: 'visual-direction',
        visualAssessment: {
          selection: { presentation: 'finished-product-website', verdict: 'emulate',
            appearanceIntent: 'Focused application workspace', reason: 'The complete task is visible.',
            flowCaptures: [] },
          composition: 'One primary application region.', typography: 'Task title anchors controls.',
          density: 'Readable task rows.', imagery: 'No decorative imagery.',
          transfer: 'Primary task hierarchy.', avoid: 'Do not copy branding.',
        },
        discovery: { url: f.reference.source, kind: 'direct-product', access: 'free',
          qualityReason: 'The application task is visible.', evidence: domain.product.evidence,
          capture: domain.product.capture },
      }] },
  };
  const options = { expectedSourceContractSha256: f.sourceContractSha256,
    expectedRequest: f.task, benchmarkRequired: false };
  assert.throws(() => publishReferenceResearch(f.root, research, options, f.writer),
    /REFERENCE_DIRECTION_ADMISSION_MISSING/);
  assert.equal(existsSync(join(f.root, '.omd/reference-research.json')), false);

  const { packet, result } = await authenticatedAdmission(t, f);
  publishReferenceDirectionAdmission(f.root, packet, result, f.invocation, f.writer);
  const board = authorReferenceBoard(f.root, f.boardInput);
  f.writer.write('.omd/reference-board.json', canonicalJson(board));
  research.designReference.boardSha256 = hash(readFileSync(join(f.root, '.omd/reference-board.json')));
  assert.doesNotThrow(() => publishReferenceResearch(f.root, research, options, f.writer));
  assert.equal(readPublishedReferenceResearch(f.root).designReference.sources[0]?.discovery?.kind, 'direct-product');

  const fragment = persistImageFragment(f.root, {
    inputPath: f.reference.imagePath,
    provenance: { sourcePage: f.reference.source, captureRegion: 'Complete native task screen',
      licenseStatus: 'unknown', rightsNotes: 'Reference only; no source pixels ship.',
      capturedAt: f.reference.capturedAt },
    transfer: { visualRole: 'Task hierarchy', principles: ['Keep the primary work object dominant.'] },
  }, f.invocation);
  const fragmentBoard = authorReferenceBoard(f.root, {
    candidates: f.boardInput.candidates.map(candidate => ({
      ...candidate, pieces: candidate.pieces.map(({ source: _source, component: _component, ...piece }) => ({
        ...piece, sourceKind: 'image-fragment', referenceId: fragment.id,
      })),
    })),
  });
  f.writer.write('.omd/reference-board.json', canonicalJson(fragmentBoard));
  research.designReference.boardSha256 = hash(readFileSync(join(f.root, '.omd/reference-board.json')));
  assert.doesNotThrow(() => publishReferenceResearch(f.root, research, options, f.writer));
  const fragmentResearch = { ...research, designReference: {
    ...research.designReference, sources: research.designReference.sources.map(source => ({
      ...source, evidence: { path: fragment.imagePath, sha256: fragment.sha256 },
      capture: { path: `.omd/refs/design/fragments/${fragment.id}.json`,
        sha256: hash(readFileSync(join(f.root, `.omd/refs/design/fragments/${fragment.id}.json`))) },
    })),
  } };
  assert.doesNotThrow(() => publishReferenceResearch(f.root, fragmentResearch, options, f.writer));

  assert.ok(f.reference.acquisition);
  const supportUrl = 'https://support.example/korean-task';
  const supportComponent = 'measured-korean-controls';
  const supportImage = refImagePath(f.root, { source: supportUrl, component: supportComponent, researchLane: 'design' });
  const support: Reference = {
    ...f.reference, source: supportUrl, component: supportComponent, imagePath: relative(f.root, supportImage),
    acquisition: { ...f.reference.acquisition, requestedUrl: supportUrl, finalUrl: supportUrl },
  };
  const supportCandidate = stageDesignCandidate(f.root, support, f.png, f.writer);
  const supportAdmission = await authenticatedAdmission(t, f, 'reference-ordinary-support', [support],
    readAuthenticatedAdmissionHistory(f.root, f.sourceContractSha256)[0]?.sha256);
  publishReferenceDirectionAdmission(f.root, supportAdmission.packet, supportAdmission.result, f.invocation, f.writer);
  const supportedResearch = {
    ...research, designReference: { ...research.designReference, sources: [
      ...research.designReference.sources,
      {
        id: 'korean-controls', url: supportUrl, observedAt: new Date().toISOString().slice(0, 10),
        decision: 'Supplement measured control typography, not visual direction.',
        finding: 'The measured control structure provides bounded support.',
        evidence: { path: relative(f.root, supportImage), sha256: hash(f.png) },
        capture: { path: relative(f.root, refRecordPath(f.root, support)),
          sha256: hash(readFileSync(join(f.root, supportCandidate.path))) },
        visualRole: 'component-support',
        visualAssessment: { composition: 'Control grouping.', typography: 'Readable control text.',
          density: 'Control spacing.', imagery: 'No imagery.', transfer: 'Measured control anatomy.',
          avoid: 'Do not use this source as visual direction.' },
      },
    ] },
  };
  assert.doesNotThrow(() => publishReferenceResearch(f.root, supportedResearch, options, f.writer));
  assert.equal(readPublishedReferenceResearch(f.root).designReference.sources[1]?.visualRole, 'component-support');
  assert.equal(hash(readFileSync(join(f.root, '.omd/reference-board.json'))), research.designReference.boardSha256);
});

test('native image research capture retains signed admission and rejects changed pixels or metadata', { timeout: 30_000 }, async t => {
  const f = fixture(t);
  f.reference.kind = 'image';
  saveRef(f.root, f.reference, f.writer);
  const item = { url: f.reference.source,
    evidence: { path: f.reference.imagePath!, sha256: hash(f.png) },
    capture: { path: relative(f.root, f.capturePath), sha256: hash(readFileSync(f.capturePath)) } };
  requireDesignReferenceAdmission(f.root, f.reference);
  assert.throws(() => requireReferenceDirectionAdmission(f.root, f.reference, f.sourceContractSha256), /REFERENCE_DIRECTION_ADMISSION_MISSING/);
  const { packet, result } = await authenticatedAdmission(t, f);
  publishReferenceDirectionAdmission(f.root, packet, result, f.invocation, f.writer);
  assert.equal(requireReferenceDirectionAdmission(f.root, f.reference, f.sourceContractSha256).verdict, 'direction');
  assert.equal(verifyCapture(f.root, item, 'design').kind, 'image');

  writeFileSync(f.imagePath, testPng(2560, 1800, 33));
  assert.throws(() => verifyCapture(f.root, item, 'design'), /REFERENCE_RESEARCH_EVIDENCE_STALE/);
  assert.throws(() => requireReferenceDirectionAdmission(f.root, f.reference, f.sourceContractSha256), /REFERENCE_DIRECTION_ADMISSION_STALE/);
  writeFileSync(f.imagePath, f.png);
  const original = readFileSync(f.capturePath);
  const changed = JSON.parse(original.toString('utf8'));
  changed.acquisition.httpStatus = 404;
  writeFileSync(f.capturePath, JSON.stringify(changed));
  item.capture.sha256 = hash(readFileSync(f.capturePath));
  assert.throws(() => verifyCapture(f.root, item, 'design'), /REFERENCE_RESEARCH_ACQUISITION_INVALID/);
  assert.throws(() => requireReferenceDirectionAdmission(f.root, f.reference, f.sourceContractSha256), /REFERENCE_DIRECTION_ADMISSION_STALE/);
});

test('source-bearing Eye intent cannot publish a source-free direction', { timeout: 30_000 }, async t => {
  const f = fixture(t);
  const { packet, result } = await authenticatedAdmission(t, f, 'reference-leak');
  assert.throws(() => publishReferenceDirectionAdmission(f.root, packet, result, f.invocation, f.writer),
    { message: 'REFERENCE_DIRECTION_APPEARANCE_SOURCE_PAYLOAD:appearanceIntent' });
  assert.equal(existsSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER)), false);
});

test('source-bearing pixel evidence identifies its failing field without publishing a direction', { timeout: 30_000 }, async t => {
  const f = fixture(t);
  const { packet, result } = await authenticatedAdmission(t, f, 'reference-evidence-leak');
  assert.throws(() => publishReferenceDirectionAdmission(f.root, packet, result, f.invocation, f.writer),
    { message: 'REFERENCE_DIRECTION_APPEARANCE_SOURCE_PAYLOAD:assessment.visibleEvidence' });
  assert.equal(existsSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER)), false);
  assert.deepEqual(readFileSync(f.imagePath), f.png);
});

test('missing, stale, forged, unauthorized, wrong-lane, and support-only admissions refuse without replacing publication bytes', { timeout: 30_000 }, async t => {
  const f = fixture(t);
  const previousBoard = Buffer.from('{"previous":"board"}\n');
  const previousResearch = Buffer.from('{"previous":"research"}\n');
  writeFileSync(join(f.root, '.omd/reference-board.json'), previousBoard);
  writeFileSync(join(f.root, '.omd/reference-research.json'), previousResearch);
  const assertUnchanged = () => {
    assert.deepEqual(readFileSync(join(f.root, '.omd/reference-board.json')), previousBoard);
    assert.deepEqual(readFileSync(join(f.root, '.omd/reference-research.json')), previousResearch);
  };
  const research = { ...structuredClone(inputSkeleton('reference-research').skeleton) as Record<string, unknown>,
    sourceContractSha256: f.sourceContractSha256 };
  const options = { expectedSourceContractSha256: f.sourceContractSha256, expectedRequest: f.task, benchmarkRequired: false };

  assert.throws(() => authorReferenceBoard(f.root, f.boardInput), /REFERENCE_DIRECTION_ADMISSION_MISSING/);
  assert.throws(() => publishReferenceResearch(f.root, research, options, f.writer), /REFERENCE_DIRECTION_ADMISSION_MISSING/);
  assertUnchanged();

  const authorized = await authenticatedAdmission(t, f);
  const pointerBefore = existsSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER))
    ? readFileSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER)) : null;
  await assert.rejects(async () => publishReferenceDirectionAdmission(f.root, authorized.packet,
    { schema: 'omd-pi-role-result-v1', agent: 'omd-eye', projectRoot: f.root, result: 'completed', finalMessage: '{}' } as never,
    f.invocation, f.writer), /role-authority|role-result|role-receipt/);
  assert.deepEqual(existsSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER)) ? readFileSync(join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER)) : null, pointerBefore);

  publishReferenceDirectionAdmission(f.root, authorized.packet, authorized.result, f.invocation, f.writer);
  const pointerPath = join(f.root, REFERENCE_DIRECTION_ADMISSION_POINTER);
  const pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) as { record: string };
  const recordPath = join(f.root, '.omd', pointer.record);
  const genuineRecord = readFileSync(recordPath);

  writeFileSync(f.imagePath, testPng(2560, 1800, 18));
  assert.throws(() => authorReferenceBoard(f.root, f.boardInput), /REFERENCE_DIRECTION_ADMISSION_STALE/);
  assertUnchanged();
  writeFileSync(f.imagePath, f.png);

  writeFileSync(recordPath, Buffer.from(genuineRecord.toString('utf8').replace('reference-direction-admission-v4', 'reference-direction-admission-v0')));
  assert.throws(() => authorReferenceBoard(f.root, f.boardInput), /REFERENCE_DIRECTION_ADMISSION_FORGED/);
  assertUnchanged();
  writeFileSync(recordPath, genuineRecord);

  const domain = { ...f.reference, researchLane: 'domain' as const };
  assert.throws(() => requireReferenceDirectionAdmission(f.root, domain, f.sourceContractSha256, 'direction'), /WRONG_LANE/);
  assertUnchanged();

  rmSync(pointerPath);
  assert.throws(() => readAuthenticatedAdmissionHistory(f.root, f.sourceContractSha256),
    /REFERENCE_DIRECTION_ADMISSION_MISSING/);
  assertUnchanged();

  const supportFixture = fixture(t);
  const support = await authenticatedAdmission(t, supportFixture, 'reference-support');
  publishReferenceDirectionAdmission(supportFixture.root, support.packet, support.result, supportFixture.invocation, supportFixture.writer);
  assert.throws(() => authorReferenceBoard(supportFixture.root, supportFixture.boardInput),
    /REFERENCE_DIRECTION_ADMISSION_SUPPORT_ONLY/);
});
