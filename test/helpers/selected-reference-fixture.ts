import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import type { TestContext } from 'node:test';
import { ART_DIRECTION_POINTER_SCHEMA_VERSION, LEGACY_ART_DIRECTION_RECORD_SCHEMA_VERSION, artDirectionSha256 } from '../../core/art-direction/schema.ts';
import { canonicalJson, sha256 } from '../../core/ref/board-artifacts.ts';
import { refIdentity } from '../../core/ref/identity.ts';
import { writeReferenceHandoffReceipt } from '../../core/ref/reference-handoff.ts';
import { writeReferenceUsageRecord } from '../../core/ref/reference-usage-files.ts';
import { prepareReferenceUsage } from '../../core/ref/reference-usage-snapshot.ts';
import {
  motionResolutionProjectionSha256,
  persistMotionResolutionProjection,
  persistSettledReferenceSelection,
  projectRunInvocationSha256,
  referenceSelectionV2Sha256,
  resolveMotionProjection,
  selectReferenceCandidateV2,
  type ReferenceSelectionV2,
} from '../../core/ref/reference-selection.ts';
import { refImagePath, saveRef } from '../../core/ref/store.ts';
import { writeObservationV2 } from '../../core/runtime/observation.ts';
import type { Invariants, Reference } from '../../core/types.ts';
import {
  authorizeTestProjectRunPayloads,
  createTestProjectRunInvocation,
  createTestProjectWriteAdapter,
} from './project-write.ts';

export type SelectedReferenceFixture = Readonly<{
  root: string;
  selection: ReferenceSelectionV2;
}>;

const hash = (value: string): string => sha256(Buffer.from(value));

const persistSettlement = (
  root: string,
  selection: ReferenceSelectionV2,
  invocation: ReturnType<typeof createTestProjectRunInvocation>,
): ReferenceSelectionV2 => {
  const handoff = writeReferenceHandoffReceipt(root, 'art-direction', invocation).receipt;
  const alternative = (register: 'quiet' | 'confident' | 'showpiece') => ({
    register,
    subjectIdentityFit: `${register} supports the selected shop hierarchy`,
    staticReferenceSlotIds: ['hero-card'],
    motionReferenceSlotIds: [],
    conceptRole: `${register} selected-reference direction`,
    macroCompositionHypothesis: 'Asymmetric hierarchy with a dominant work-object anchor.',
    motionHypothesis: 'none' as const,
    uxAccessibilityPerformanceRisks: ['Reduced motion remains available.'],
    lawfulImplementationPath: 'Local CSS and SVG implementation.',
    rejectionCondition: 'Another lawful alternative fits the measured reference better.',
  });
  const alternatives = [alternative('quiet'), alternative('confident'), alternative('showpiece')];
  const assessmentBytes = Buffer.from(canonicalJson({ assessments: [] }));
  const resultBytes = Buffer.from(canonicalJson({
    route: '/shop',
    taskIds: ['T1'],
    boardSha256: selection.captureSha256,
    preSelectionSha256: referenceSelectionV2Sha256(selection),
    handoffSha256: handoff.payloadSha256,
    intentSha256: hash('intent'),
    alternativesSha256: hash(canonicalJson(alternatives)),
    winner: 'quiet',
    motionResolution: { motionDecision: 'none', slots: [] },
  }));
  authorizeTestProjectRunPayloads(root, invocation, [
    { purpose: 'evaluator-assessment', payload: assessmentBytes },
    { purpose: 'evaluator-result', payload: resultBytes },
  ]);
  const motion = resolveMotionProjection({
    activationSha256: artDirectionSha256(invocation.activation),
    alternativesSha256: hash(canonicalJson(alternatives)),
    handoffSha256: handoff.payloadSha256,
    evaluatorInvocationSha256: projectRunInvocationSha256(invocation),
    evaluatorPayloadSha256: sha256(assessmentBytes),
    evaluatorResultSha256: sha256(resultBytes),
    motionDecision: 'none',
    slots: [],
    selection,
  });
  const persistedMotion = persistMotionResolutionProjection(
    root,
    { ...motion, selection },
    { assessmentBytes, resultBytes },
    invocation,
  );
  const motionSha256 = motionResolutionProjectionSha256(persistedMotion.projection);
  const settled = persistSettledReferenceSelection(root, selection, motionSha256, invocation);
  const selectedAlternative = alternatives[0]!;
  const decision = {
    schemaVersion: 'art-direction-v1' as const,
    activationSha256: motion.activationSha256,
    intentSha256: hash('intent'),
    boardSha256: selection.captureSha256,
    preSelectionSha256: referenceSelectionV2Sha256(selection),
    alternativesSha256: motion.alternativesSha256,
    motionResolutionProjectionSha256: motionSha256,
    settledSelectionSha256: referenceSelectionV2Sha256(settled),
    authorInvocationSha256: motion.evaluatorInvocationSha256,
    authorPayloadSha256: motion.evaluatorPayloadSha256,
    authorResultSha256: motion.evaluatorResultSha256,
    currentUserBeatExceptionReceiptSha256: hash('no-exception'),
    route: '/shop',
    source: 'agent-evidence' as const,
    selectedRegister: selectedAlternative.register,
    motionDecision: selectedAlternative.motionHypothesis,
    selectedStaticReferenceSlotIds: selectedAlternative.staticReferenceSlotIds,
    selectedMotionReferenceSlotIds: selectedAlternative.motionReferenceSlotIds,
    consideredAlternatives: alternatives,
    conceptRole: selectedAlternative.conceptRole,
    rejectedAlternatives: alternatives.slice(1).map((item) => ({
      register: item.register,
      citedReferenceSlotIds: item.staticReferenceSlotIds,
      reason: item.rejectionCondition,
    })),
    implementationLane: 'browser',
    fallbackPath: 'CSS and SVG static fallback.',
    performanceAccessibilityBudget: 'Within the declared budget.',
  };
  const record = {
    schemaVersion: LEGACY_ART_DIRECTION_RECORD_SCHEMA_VERSION,
    decision,
    decisionSha256: artDirectionSha256(decision),
    referenceHandoffSha256: handoff.payloadSha256,
    intentLedgerSha256: decision.intentSha256,
    activationSha256: decision.activationSha256,
    beatIds: ['B-1'],
  };
  const digest = artDirectionSha256(record);
  const recordPath = `art-direction-runs/sha256-${digest}.json`;
  const writer = createTestProjectWriteAdapter(root);
  writer.write(`.omd/${recordPath}`, canonicalJson(record));
  writer.write('.omd/art-direction.json', canonicalJson({
    schemaVersion: ART_DIRECTION_POINTER_SCHEMA_VERSION,
    record: recordPath,
    sha256: digest,
  }));
  writeReferenceHandoffReceipt(root, 'composer', invocation);
  writeReferenceHandoffReceipt(root, 'hand', invocation);
  return settled;
};

export function createSelectedReferenceFixture(
  context: TestContext,
  evidence: Readonly<{
    invariants: Invariants;
    viewport: Readonly<{ width: number; height: number }>;
  }>,
): SelectedReferenceFixture {
  const root = mkdtempSync(join(tmpdir(), 'omd-selected-reference-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.omd', 'refs'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  const writer = createTestProjectWriteAdapter(root);
  const invocation = createTestProjectRunInvocation(root);
  const source = 'https://reference.example/shop';
  const component = 'hero';
  const imagePath = refImagePath(root, { source, component });
  const reference: Reference = {
    source,
    component,
    kind: 'component',
    capturedAt: '2026-08-25T00:00:00.000Z',
    selector: '[data-omd="shop-hero"]',
    invariants: evidence.invariants,
    principles: ['Preserve the measured hero hierarchy.'],
    blueprint: {
      selector: '[data-omd="shop-hero"]',
      capturedAt: '2026-08-25T00:00:00.000Z',
      nodes: [{ id: 'hero', role: 'container', children: [], box: { w: 1440, h: 720 } }],
    },
    imagePath: relative(root, imagePath),
    viewport: evidence.viewport,
  };
  saveRef(root, reference, writer);
  writeFileSync(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64'));
  const referenceId = refIdentity(source, component);
  writeFileSync(join(root, '.omd', 'reference-board.json'), canonicalJson({
    schemaVersion: 'reference-board-v1',
    frameSha256: 'a'.repeat(64),
    candidates: [{
      id: 'selected',
      label: 'Selected measured hierarchy',
      route: '/shop',
      rationale: 'Use the measured component structure with local content.',
      pieces: [{
        slotId: 'hero-card',
        sourceKind: 'component-capture',
        referenceId,
        targetComponent: 'ShopHero',
        targetSelector: '[data-omd="shop-hero"]',
        taskIds: ['T1'],
        reason: 'Carry the measured hierarchy.',
        take: ['structure'],
        avoid: 'Do not reproduce source copy.',
        adaptation: 'Use local content and tokens.',
        evidenceAxes: {
          rights: 'lawful',
          signal: 'high-visual-system',
          staticAxis: 'available',
          motionAxis: 'absent',
        },
        grid: { column: 1, span: 12, order: 0 },
      }],
    }],
  }));
  const selected = selectReferenceCandidateV2(root, 'selected', [{
    slotId: 'hero-card',
    obligationDisposition: 'used',
    obligationReason: 'Lawful measured visual-system evidence informs production.',
  }], invocation);
  const settled = persistSettlement(root, selected, invocation);
  writeFileSync(join(root, '.omd', 'attribution.md'), '| Group | Source |\n|---|---|\n| structure | reference.example |\n');
  const observation = {
    schema: 'reference-production-observation-v1' as const,
    slotId: 'hero-card',
    route: '/shop',
    component: 'ShopHero',
    selector: '[data-omd="shop-hero"]',
    taskIds: ['T1'],
    buildSha256: 'b'.repeat(64),
  };
  writeFileSync(join(root, 'src', 'shop-hero.ts'), canonicalJson(observation));
  const buildIdentityPath = '.omd/build-identity.json';
  const buildIdentity = canonicalJson({
    schemaVersion: 'omd-build-identity-v1',
    packageVersion: '1.0.0',
    buildSha256: observation.buildSha256,
    sourceSkillSha256: 'c'.repeat(64),
  });
  writeFileSync(join(root, buildIdentityPath), buildIdentity);
  writeObservationV2(root, {
    currentArtifact: { path: buildIdentityPath, sha256: sha256(Buffer.from(buildIdentity)) },
    buildSha256: observation.buildSha256,
    observedAt: '2026-08-25T00:00:00.000Z',
    evidence: { referenceProductionObservations: [observation] },
  }, writer);
  const usage = prepareReferenceUsage(root, { rows: [{
    slotId: 'hero-card',
    taskIds: ['T1'],
    status: 'used',
    target: { route: '/shop', component: 'ShopHero', selector: '[data-omd="shop-hero"]' },
    borrowedProperties: ['measured hierarchy'],
    nonBorrowedProperties: ['source copy and branding'],
    transformation: 'Rebuilt with local content and tokens.',
    evidence: {
      path: 'src/shop-hero.ts',
      selector: '[data-omd="shop-hero"]',
      sha256: sha256(readFileSync(join(root, 'src', 'shop-hero.ts'))),
    },
    productionObservation: observation,
    verificationNote: 'The destination selector is present in the current build.',
  }] });
  writeReferenceUsageRecord(root, 'reference-usage-v2.json', canonicalJson(usage), 'reference usage v2', writer);
  return { root, selection: settled };
}
