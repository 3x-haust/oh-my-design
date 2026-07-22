import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveMarketingArtDirection } from '../core/art-direction/decision.ts';
import {
  ART_DIRECTION_POINTER_SCHEMA_VERSION,
  ART_DIRECTION_RECORD_SCHEMA_VERSION,
  artDirectionSha256,
} from '../core/art-direction/schema.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { refIdentity } from '../core/ref/identity.ts';
import { writeReferenceHandoffReceipt } from '../core/ref/reference-handoff.ts';
import { materializeSettledReferenceSelection, motionResolutionProjectionSha256, referenceSelectionV2Sha256, resolveMotionProjection, selectReferenceCandidateV2 } from '../core/ref/reference-selection.ts';
import { refImagePath, saveRef } from '../core/ref/store.ts';
import {
  INTENT_CURRENT_POINTER_SCHEMA_VERSION,
  INTENT_LEDGER_SCHEMA_VERSION,
  intentLedgerSha256,
} from '../core/runtime/intent.ts';
import type { Blueprint, Invariants, Reference } from '../core/types.ts';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { createSourceSeal, validateSourceSeal, writeSourceSeal } from '../core/source-seal/index.ts';

const cli = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

function persistCurrentArtDirectionWithHandoffs(root: string): void {
  const invocation = createTestProjectRunInvocation(root);
  const writer = createTestProjectWriteAdapter(root);
  const invariants: Invariants = {
    spacingLadder: [8], radiusLadder: [4], elevationLevels: 0, centeredRatio: 0, tokenCoverage: 1,
    paddingWeight: 8, typeScale: [], fontFamilies: [], weightLadder: [], motionDurations: [],
    easingVocab: [], animatedShare: 0, hoverCoverage: 0, focusCoverage: 0, animatedProperties: [],
    hasReducedMotion: false, scrollChoreography: [],
  };
  const blueprint: Blueprint = {
    selector: '#hero', capturedAt: '2026-07-14T00:00:00.000Z',
    nodes: [{ id: 'hero', role: 'container', children: [], box: { w: 160, h: 40 } }],
  };
  const source = 'https://fixture.example/hero';
  const component = 'hero';
  const imagePath = refImagePath(root, { source, component });
  const reference: Reference = {
    source, component, kind: 'component', capturedAt: '2026-07-14T00:00:00.000Z', selector: '#hero',
    invariants, principles: ['Keep the hierarchy independent.'], blueprint, imagePath: relative(root, imagePath),
  };
  saveRef(root, reference, writer);
  writeFileSync(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64'));
  writeFileSync(join(root, '.omd', 'reference-board.json'), JSON.stringify({
    schemaVersion: 'reference-board-v1', frameSha256: 'a'.repeat(64),
    candidates: [{
      id: 'source-seal-fixture', label: 'Source seal fixture', route: '/', rationale: 'Lawful static reference.',
      pieces: [{
        slotId: 'static', sourceKind: 'component-capture', referenceId: refIdentity(source, component),
        targetComponent: 'Hero', targetSelector: '#hero', taskIds: ['T1'], reason: 'Use hierarchy.',
        take: ['structure'], avoid: 'Do not copy content.', adaptation: 'Use local tokens.',
        evidenceAxes: { rights: 'lawful', signal: 'high-visual-system', staticAxis: 'available', motionAxis: 'absent' },
        grid: { column: 1, span: 12, order: 0 },
      }],
    }],
  }));
  const selection = selectReferenceCandidateV2(root, 'source-seal-fixture', [{
    slotId: 'static', obligationDisposition: 'used', obligationReason: 'Lawful static evidence selected.',
  }], invocation);
  const artHandoff = writeReferenceHandoffReceipt(root, 'art-direction', invocation).receipt;
  const ledger = {
    schemaVersion: INTENT_LEDGER_SCHEMA_VERSION,
    events: [{
      eventId: 'source-seal-fixture-intent', sequence: 1, currentUser: true as const, kind: 'explicit-intent' as const,
      lock: { register: 'quiet' as const, motionDecision: 'none' as const },
      recordedAt: '2026-07-14T00:00:00.000Z', previousEventSha256: null,
    }],
    currentEventId: 'source-seal-fixture-intent',
  };
  const ledgerSha256 = intentLedgerSha256(ledger);
  const ledgerPath = `intent-runs/sha256-${ledgerSha256}.json`;
  writer.write(`.omd/${ledgerPath}`, JSON.stringify(ledger));
  writer.write('.omd/intent-current.json', JSON.stringify({
    schemaVersion: INTENT_CURRENT_POINTER_SCHEMA_VERSION, record: ledgerPath, sha256: ledgerSha256,
  }));
  const alternative = (register: 'quiet' | 'confident' | 'showpiece') => ({
    register, subjectIdentityFit: `${register} fits the fixture.`, staticReferenceSlotIds: ['static'],
    motionReferenceSlotIds: [], conceptRole: `${register} fixture role`,
    macroCompositionHypothesis: 'Template-breaking editorial departure.', motionHypothesis: 'none' as const,
    uxAccessibilityPerformanceRisks: ['Reduced motion remains available.'],
    lawfulImplementationPath: 'CSS and SVG implementation.', rejectionCondition: 'Another direction scores higher.',
  });
  const alternatives = [alternative('quiet'), alternative('confident'), alternative('showpiece')];
  const motionResolution = resolveMotionProjection({
    activationSha256: hash('activation'),
    alternativesSha256: hash(canonicalJson(alternatives)),
    handoffSha256: artHandoff.payloadSha256,
    evaluatorInvocationSha256: hash('evaluator-invocation'),
    evaluatorPayloadSha256: hash('evaluator-payload'),
    evaluatorResultSha256: hash('evaluator-result'),
    motionDecision: 'none',
    slots: [],
    selection,
  });
  const decision = resolveMarketingArtDirection({
    activationSha256: hash('activation'), intentSha256: ledgerSha256, boardSha256: selection.captureSha256,
    selectionSha256: referenceSelectionV2Sha256(selection), route: '/', intent: { register: 'quiet', motionDecision: 'none' },
    motionResolution,
    alternatives,
    references: [{ slotId: 'static', signal: 'high-visual-system', positive: true, lawful: true, motionObligation: 'none' }],
    referenceBindings: {
      selection, handoff: artHandoff, canonicalSelectionSha256: referenceSelectionV2Sha256(selection),
      canonicalHandoffSha256: artHandoff.payloadSha256,
    },
    eligibility: {
      sceneRoles: [], fallbackAttempted: true,
      qualityGates: {
        blindSignatureGreen: true, narrativeGreen: true, motionFitGreen: true, fidelityDecisionFitGreen: true,
        macroLandingScore: 3, staticReferenceInfluenceScore: 3, templateBreakingLandingScore: 3,
      },
    },
    implementationLane: 'browser', fallbackPath: 'CSS/SVG static fallback.', performanceAccessibilityBudget: 'Within budget.',
    evaluatorEvidence: {
      invocationSha256: hash('evaluator-invocation'), payloadSha256: hash('evaluator-payload'), resultSha256: hash('evaluator-result'),
      assessments: [9, 4, 2].map((score, index) => ({
        register: (['quiet', 'confident', 'showpiece'] as const)[index]!, score,
        subjectIdentityRationale: 'Fixture assessment.', conceptRoleRationale: 'Fixture assessment.',
        uxAccessibilityPerformanceRationale: 'Fixture assessment.', lawfulFeasibilityRationale: 'Fixture assessment.',
        referenceEvidenceRationale: 'Fixture assessment.', rejectionRationale: 'Fixture assessment.',
      })),
    },
  });
  const record = {
    schemaVersion: ART_DIRECTION_RECORD_SCHEMA_VERSION, decision, decisionSha256: artDirectionSha256(decision),
    referenceHandoffSha256: artHandoff.payloadSha256, intentLedgerSha256: ledgerSha256,
    activationSha256: decision.activationSha256, beatIds: ['B-1'],
  };
  const digest = artDirectionSha256(record);
  const recordPath = `art-direction-runs/sha256-${digest}.json`;
  writer.write(`.omd/${recordPath}`, JSON.stringify(record));
  writer.write('.omd/art-direction.json', JSON.stringify({
    schemaVersion: ART_DIRECTION_POINTER_SCHEMA_VERSION, record: recordPath, sha256: digest,
  }));
  const settledSelection = materializeSettledReferenceSelection(selection, { ...motionResolution, selection });
  const settlement = {
    motionResolutionProjectionSha256: motionResolutionProjectionSha256(motionResolution),
    settledSelectionSha256: referenceSelectionV2Sha256(settledSelection),
    settledSelection,
  };
  writer.write('.omd/reference-selection-v2.json', JSON.stringify(settledSelection));
  writeReferenceHandoffReceipt(root, 'composer', invocation, digest, settlement);
  writeReferenceHandoffReceipt(root, 'hand', invocation, digest, settlement);
}
function setup(): string {
  const root = mkdtempSync(join(tmpdir(), 'omd-source-seal-'));
  for (const dir of ['.omd', 'src', 'public', 'dist', 'node_modules/pkg', 'generated', 'test']) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  writeFileSync(join(root, '.omd', 'copy-deck.md'), 'copy-v1');
  writeFileSync(join(root, '.omd', 'type-proof.md'), 'type-v1');
  writeFileSync(join(root, '.omd', 'composition.md'), 'composition-v1');
  writeFileSync(join(root, 'src', 'app.ts'), 'export const app = 1;');
  writeFileSync(join(root, 'public', 'mark.svg'), '<svg/>');
  writeFileSync(join(root, 'dist', 'app.js'), 'generated');
  writeFileSync(join(root, 'node_modules', 'pkg', 'index.js'), 'dependency');
  writeFileSync(join(root, 'generated', 'client.ts'), 'generated');
  writeFileSync(join(root, 'test', 'app.test.ts'), 'test');
  writeFileSync(join(root, 'package-lock.json'), '{}');
  return root;
}

test('source seal hashes approved inputs and a sorted narrow production source set', () => {
  const root = setup();
  const seal = createSourceSeal(root, '2026-07-14T00:00:00.000Z');
  assert.deepEqual(seal.sources.map((item) => item.path), ['public/mark.svg', 'src/app.ts']);
  assert.match(seal.inputs.copyDeckSha256, /^[0-9a-f]{64}$/);
  assert.match(seal.inputs.typeProofSha256, /^[0-9a-f]{64}$/);
  assert.match(seal.inputs.compositionSha256, /^[0-9a-f]{64}$/);
  assert.equal(seal.sealedAt, '2026-07-14T00:00:00.000Z');
});

test('source check passes fresh seal and ignores generated, dependency, cache, and lockfile changes', () => {
  const root = setup();
  writeSourceSeal(root, createTestProjectRunInvocation(root));
  writeFileSync(join(root, 'dist', 'app.js'), 'changed generated');
  writeFileSync(join(root, 'node_modules', 'pkg', 'index.js'), 'changed dependency');
  writeFileSync(join(root, 'package-lock.json'), '{"changed":true}');
  assert.deepEqual(validateSourceSeal(root), []);
});

test('source check rejects parsed seals with malformed input hashes or source items without throwing', async (t) => {
  const validRoot = setup();
  writeSourceSeal(validRoot, createTestProjectRunInvocation(validRoot));
  assert.deepEqual(validateSourceSeal(validRoot), []);

  const invalidCases: Array<[string, (seal: ReturnType<typeof createSourceSeal>) => unknown]> = [
    ['missing approved input hash', (seal) => {
      const inputs = { ...seal.inputs } as Partial<typeof seal.inputs>;
      delete inputs.copyDeckSha256;
      return { ...seal, inputs };
    }],
    ['non-string approved input hash', (seal) => ({ ...seal, inputs: { ...seal.inputs, typeProofSha256: 42 } })],
    ['non-hex approved input hash', (seal) => ({ ...seal, inputs: { ...seal.inputs, compositionSha256: 'z'.repeat(64) } })],
    ['short approved input hash', (seal) => ({ ...seal, inputs: { ...seal.inputs, copyDeckSha256: 'a'.repeat(63) } })],
    ['null source item', (seal) => ({ ...seal, sources: [null] })],
    ['source item missing path', (seal) => ({ ...seal, sources: [{ sha256: seal.sources[0]!.sha256 }] })],
    ['source item missing hash', (seal) => ({ ...seal, sources: [{ path: seal.sources[0]!.path }] })],
    ['source path escapes root', (seal) => ({ ...seal, sources: [{ ...seal.sources[0]!, path: '../outside.ts' }] })],
    ['source path contains parent segment', (seal) => ({ ...seal, sources: [{ ...seal.sources[0]!, path: 'src/../outside.ts' }] })],
    ['source path is absolute', (seal) => ({ ...seal, sources: [{ ...seal.sources[0]!, path: '/tmp/outside.ts' }] })],
    ['source path uses backslashes', (seal) => ({ ...seal, sources: [{ ...seal.sources[0]!, path: 'src\\app.ts' }] })],
    ['source hash is invalid', (seal) => ({ ...seal, sources: [{ ...seal.sources[0]!, sha256: 'not-a-sha256' }] })],
  ];

  for (const [name, mutate] of invalidCases) {
    await t.test(name, () => {
      const root = setup();
      const malformed = mutate(createSourceSeal(root, '2026-07-14T00:00:00.000Z'));
      writeFileSync(join(root, '.omd', 'source-seal.json'), `${JSON.stringify(malformed)}\n`);
      assert.doesNotThrow(() => validateSourceSeal(root));
      assert.deepEqual(validateSourceSeal(root), [{
        id: 'SOURCE-SEAL-STALE',
        path: '.omd/source-seal.json',
        message: 'source seal schema is invalid',
      }]);
    });
  }
});

test('source check fails missing seal and stale approved input or production source', () => {
  const root = setup();
  assert.equal(validateSourceSeal(root)[0]?.id, 'SOURCE-SEAL-MISSING');
  writeSourceSeal(root, createTestProjectRunInvocation(root));
  writeFileSync(join(root, 'src', 'app.ts'), 'export const app = 2;');
  assert.ok(validateSourceSeal(root).some((item) => item.id === 'SOURCE-SEAL-STALE' && item.path === 'src/app.ts'));
  writeSourceSeal(root, createTestProjectRunInvocation(root));
  writeFileSync(join(root, '.omd', 'copy-deck.md'), 'copy-v2');
  assert.ok(validateSourceSeal(root).some((item) => item.id === 'SOURCE-SEAL-STALE' && item.path === '.omd/copy-deck.md'));
});

test('CLI seals, checks, and reports stale bytes without claiming semantic fidelity', () => {
  const root = setup();
  const missingDecision = spawnSync(process.execPath, [cli, 'source', '--seal', root], { encoding: 'utf8' });
  assert.notEqual(missingDecision.status, 0);
  assert.match(missingDecision.stderr, /ART_DIRECTION_DECISION_REQUIRED/);
  persistCurrentArtDirectionWithHandoffs(root);
  const sealed = spawnSync(process.execPath, [cli, 'source', '--seal', root], { encoding: 'utf8' });
  assert.equal(sealed.status, 0, sealed.stderr);
  const clean = spawnSync(process.execPath, [cli, 'source', '--check', root, '--json'], { encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stderr);
  assert.deepEqual(JSON.parse(clean.stdout), []);
  writeFileSync(join(root, 'public', 'mark.svg'), '<svg><path/></svg>');
  const stale = spawnSync(process.execPath, [cli, 'source', '--check', root, '--json'], { encoding: 'utf8' });
  assert.equal(stale.status, 1);
  assert.ok((JSON.parse(stale.stdout) as Array<{ id: string }>).some((item) => item.id === 'SOURCE-SEAL-STALE'));
  assert.doesNotMatch(stale.stdout, /semantic|fidelity|meaning/i);
});
