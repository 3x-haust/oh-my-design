import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPOSITION_SECTIONS, SYNTHESIS_AXES, SYNTHESIS_SECTION, validateCompositionContract, validateCompositionContractSource } from '../core/composition-contract/index.ts';
import { resolveMarketingArtDirection } from '../core/art-direction/decision.ts';
import {
  ART_DIRECTION_POINTER_SCHEMA_VERSION,
  ART_DIRECTION_RECORD_SCHEMA_VERSION,
  artDirectionSha256,
} from '../core/art-direction/schema.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { writeReferenceHandoffReceipt } from '../core/ref/reference-handoff.ts';
import { materializeSettledReferenceSelection, motionResolutionProjectionSha256, referenceSelectionV2Sha256, resolveMotionProjection, selectReferenceCandidateV2 } from '../core/ref/reference-selection.ts';
import { refIdentity } from '../core/ref/identity.ts';
import { refImagePath, saveRef } from '../core/ref/store.ts';
import type { Blueprint, Invariants, Reference } from '../core/types.ts';
import {
  INTENT_CURRENT_POINTER_SCHEMA_VERSION,
  INTENT_LEDGER_SCHEMA_VERSION,
  intentLedgerSha256,
} from '../core/runtime/intent.ts';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';

const cli = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const temp = (): string => mkdtempSync(join(tmpdir(), 'omd-composition-'));
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const refKey = (source: string, component: string): string => `ref-${createHash('sha256').update(`${source}\0${component}`).digest('hex').slice(0, 16)}`;
const defaultFingerprints = {
  artDirectionRecord: hash('art-direction-record'),
  motionResolutionProjection: hash('motion-resolution-projection'),
  settledSelection: hash('settled-selection'),
  composerHandoff: hash('composer-handoff'),
};

const fixtureFingerprints = new WeakMap<Record<string, string>, { artDirectionRecord: string; motionResolutionProjection: string; settledSelection: string; composerHandoff: string }>();

function persistValidCurrentArtDirection(root: string): { artDirectionRecord: string; motionResolutionProjection: string; settledSelection: string; composerHandoff: string } {
  const invocation = createTestProjectRunInvocation(root);
  const writer = createTestProjectWriteAdapter(root);
  const invariants: Invariants = {
    spacingLadder: [8], radiusLadder: [4], elevationLevels: 0, centeredRatio: 0, tokenCoverage: 1,
    paddingWeight: 8, typeScale: [], fontFamilies: [], weightLadder: [], motionDurations: [],
    easingVocab: [], animatedShare: 0, hoverCoverage: 0, focusCoverage: 0, animatedProperties: [],
    hasReducedMotion: false, scrollChoreography: [],
  };
  const blueprint: Blueprint = {
    selector: '#composition-fixture', capturedAt: '2026-01-01T00:00:00.000Z',
    nodes: [{ id: 'composition-fixture', role: 'container', children: [], box: { w: 160, h: 40 } }],
  };
  const source = 'https://fixture.example/composition';
  const component = 'composition';
  const imagePath = refImagePath(root, { source, component });
  const reference: Reference = {
    source, component, kind: 'component', capturedAt: '2026-01-01T00:00:00.000Z', selector: '#composition-fixture',
    invariants, principles: ['Keep the hierarchy independent.'], blueprint, imagePath: relative(root, imagePath),
  };
  saveRef(root, reference, writer);
  writeFileSync(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64'));
  writeFileSync(join(root, '.omd', 'reference-board.json'), JSON.stringify({
    schemaVersion: 'reference-board-v1', frameSha256: 'a'.repeat(64),
    candidates: [{
      id: 'composition-fixture', label: 'Composition fixture', route: '/composition-fixture', rationale: 'Lawful static reference.',
      pieces: [{
        slotId: 'static', sourceKind: 'component-capture', referenceId: refIdentity(source, component),
        targetComponent: 'CompositionFixture', targetSelector: '#composition-fixture', taskIds: ['T1'], reason: 'Use hierarchy.',
        take: ['structure'], avoid: 'Do not copy content.', adaptation: 'Use local tokens.',
        evidenceAxes: { rights: 'lawful', signal: 'high-visual-system', staticAxis: 'available', motionAxis: 'absent' },
        grid: { column: 1, span: 12, order: 0 },
      }, {
        slotId: 'motion', sourceKind: 'component-capture', referenceId: refIdentity(source, component),
        targetComponent: 'CompositionFixture', targetSelector: '#composition-fixture', taskIds: ['T1'], reason: 'Assess motion.',
        take: ['motion'], avoid: 'Do not copy content.', adaptation: 'Use local motion.',
        evidenceAxes: { rights: 'lawful', signal: 'high-motion', staticAxis: 'absent', motionAxis: 'available' },
        grid: { column: 1, span: 12, order: 1 },
      }],
    }],
  }));
  const selection = selectReferenceCandidateV2(root, 'composition-fixture', [{
    slotId: 'static', obligationDisposition: 'used', obligationReason: 'Lawful static evidence selected.',
  }, {
    slotId: 'motion', obligationDisposition: 'not-applicable', obligationReason: 'evaluator-pending: lawful available motion awaits evaluator resolution',
  }], invocation);
  const selectionSha256 = referenceSelectionV2Sha256(selection);
  const handoff = writeReferenceHandoffReceipt(root, 'art-direction', invocation).receipt;
  const references = [
    { slotId: 'static', signal: 'high-visual-system' as const, positive: true, lawful: true, motionObligation: 'none' as const },
    { slotId: 'motion', signal: 'high-motion' as const, positive: true, lawful: true, motionObligation: 'none' as const },
  ];
  const ledger = {
    schemaVersion: INTENT_LEDGER_SCHEMA_VERSION,
    events: [{
      eventId: 'composition-fixture-intent',
      sequence: 1,
      currentUser: true as const,
      kind: 'explicit-intent' as const,
      lock: { register: 'quiet' as const, motionDecision: 'none' as const },
      recordedAt: '2026-01-01T00:00:00.000Z',
      previousEventSha256: null,
    }],
    currentEventId: 'composition-fixture-intent',
  };
  const ledgerSha256 = intentLedgerSha256(ledger);
  const ledgerPath = `intent-runs/sha256-${ledgerSha256}.json`;
  const alternative = (register: 'quiet' | 'confident' | 'showpiece') => ({
    register,
    subjectIdentityFit: `${register} fits the composition fixture`,
    staticReferenceSlotIds: ['static'],
    motionReferenceSlotIds: [],
    conceptRole: `${register} composition role`,
    macroCompositionHypothesis: 'template-breaking asymmetrical editorial departure',
    motionHypothesis: 'none' as const,
    uxAccessibilityPerformanceRisks: ['reduced motion remains available'],
    lawfulImplementationPath: 'CSS and SVG implementation',
    rejectionCondition: 'Selected positive evidence better supports another direction.',
  });
  const alternatives = [alternative('quiet'), alternative('confident'), alternative('showpiece')];
  const motionResolution = resolveMotionProjection({
    activationSha256: hash('a'),
    alternativesSha256: hash(canonicalJson(alternatives)),
    handoffSha256: handoff.payloadSha256,
    evaluatorInvocationSha256: hash('d'),
    evaluatorPayloadSha256: hash('e'),
    evaluatorResultSha256: hash('f'),
    motionDecision: 'none',
    slots: [{ slotId: 'motion', obligationDisposition: 'rejected', obligationReason: 'The resolving evaluator rejected motion for the quiet composition fixture.' }],
    selection,
  });
  const decision = resolveMarketingArtDirection({
    activationSha256: hash('a'),
    intentSha256: ledgerSha256,
    boardSha256: selection.captureSha256,
    selectionSha256,
    route: '/composition-fixture',
    intent: { register: 'quiet', motionDecision: 'none' },
    motionResolution,
    alternatives,
    references,
    referenceBindings: { canonicalSelectionSha256: selectionSha256, canonicalHandoffSha256: handoff.payloadSha256, selection, handoff },
    eligibility: {
      sceneRoles: [],
      fallbackAttempted: true,
      qualityGates: { blindSignatureGreen: true, narrativeGreen: true, motionFitGreen: true, fidelityDecisionFitGreen: true, macroLandingScore: 3, staticReferenceInfluenceScore: 3, templateBreakingLandingScore: 3 },
    },
    implementationLane: 'browser',
    beatExceptionReceiptSha256: null,
    fallbackPath: 'CSS/SVG static reduced-motion fallback',
    performanceAccessibilityBudget: 'within declared budget',
    evaluatorEvidence: {
      invocationSha256: hash('d'),
      payloadSha256: hash('e'),
      resultSha256: hash('f'),
      assessments: [
        {
          register: 'quiet' as const,
          score: 9,
          subjectIdentityRationale: 'Quiet best preserves the fixture subject identity.',
          conceptRoleRationale: 'Quiet best supports the fixture composition role.',
          uxAccessibilityPerformanceRationale: 'Quiet keeps the static fixture accessible and performant.',
          lawfulFeasibilityRationale: 'Quiet is implementable with the lawful selected references.',
          referenceEvidenceRationale: 'Quiet is supported by the selected lawful static reference.',
          rejectionRationale: 'Quiet outranks the competing assessed alternatives.',
        },
        {
          register: 'confident' as const,
          score: 4,
          subjectIdentityRationale: 'Confident fits the fixture subject identity less closely.',
          conceptRoleRationale: 'Confident is less aligned with the fixture composition role.',
          uxAccessibilityPerformanceRationale: 'Confident has a weaker static accessibility fit.',
          lawfulFeasibilityRationale: 'Confident remains lawful but is less suitable.',
          referenceEvidenceRationale: 'Confident has weaker selected-reference support.',
          rejectionRationale: 'Confident scores below quiet.',
        },
        {
          register: 'showpiece' as const,
          score: 2,
          subjectIdentityRationale: 'Showpiece overstates the fixture subject identity.',
          conceptRoleRationale: 'Showpiece is least aligned with the fixture composition role.',
          uxAccessibilityPerformanceRationale: 'Showpiece has the weakest static accessibility fit.',
          lawfulFeasibilityRationale: 'Showpiece remains lawful but is least suitable.',
          referenceEvidenceRationale: 'Showpiece has the weakest selected-reference support.',
          rejectionRationale: 'Showpiece scores below quiet.',
        },
      ],
    },
  });
  assert.deepEqual(decision.selectedMotionReferenceSlotIds, []);
  const record = {
    schemaVersion: ART_DIRECTION_RECORD_SCHEMA_VERSION,
    decision,
    decisionSha256: artDirectionSha256(decision),
    referenceHandoffSha256: handoff.payloadSha256,
    intentLedgerSha256: ledgerSha256,
    activationSha256: decision.activationSha256,
    beatIds: ['B-1'],
  };
  const digest = artDirectionSha256(record);
  const recordPath = `art-direction-runs/sha256-${digest}.json`;
  writer.write(`.omd/${ledgerPath}`, JSON.stringify(ledger, null, 2));
  writer.write('.omd/intent-current.json', JSON.stringify({
    schemaVersion: INTENT_CURRENT_POINTER_SCHEMA_VERSION,
    record: ledgerPath,
    sha256: ledgerSha256,
  }, null, 2));
  writer.write(`.omd/${recordPath}`, JSON.stringify(record, null, 2));
  writer.write('.omd/art-direction.json', JSON.stringify({
    schemaVersion: ART_DIRECTION_POINTER_SCHEMA_VERSION,
    record: recordPath,
    sha256: digest,
  }, null, 2));
  const settledSelection = materializeSettledReferenceSelection(selection, { ...motionResolution, selection });
  const settlement = {
    motionResolutionProjectionSha256: motionResolutionProjectionSha256(motionResolution),
    settledSelectionSha256: referenceSelectionV2Sha256(settledSelection),
    settledSelection,
  };
  writer.write(`.omd/motion-resolutions/sha256-${settlement.motionResolutionProjectionSha256}.json`, canonicalJson(motionResolution));
  writer.write(`.omd/settled-reference-selections/sha256-${settlement.settledSelectionSha256}.json`, canonicalJson(settledSelection));
  writer.write('.omd/reference-selection-v2.json', JSON.stringify(settledSelection));
  const composer = writeReferenceHandoffReceipt(root, 'composer', invocation, digest, settlement);
  writeReferenceHandoffReceipt(root, 'hand', invocation, digest, settlement);
  return {
    artDirectionRecord: digest,
    motionResolutionProjection: decision.motionResolutionProjectionSha256,
    settledSelection: decision.settledSelectionSha256,
    composerHandoff: composer.receipt.payloadSha256,
  };
}

function setup(withScout = true): { root: string; values: Record<string, string> } {
  const root = temp();
  const omd = join(root, '.omd');
  mkdirSync(omd, { recursive: true });
  const values: Record<string, string> = {
    'frame.md': 'frame-v1',
    'copy-deck.md': 'copy-v1',
    'type-proof.md': 'type-v1',
  };
  if (withScout) values['scout.md'] = 'scout-v1';
  for (const [name, value] of Object.entries(values)) writeFileSync(join(omd, name), value);
  fixtureFingerprints.set(values, persistValidCurrentArtDirection(root));
  return { root, values };
}

function artifact(values: Record<string, string>, scoutNA?: string): string {
  const fingerprints = fixtureFingerprints.get(values) ?? defaultFingerprints;
  const fingerprint = [
    `- Frame SHA-256: ${hash(values['frame.md']!)}`,
    `- Copy deck SHA-256: ${hash(values['copy-deck.md']!)}`,
    `- Type proof SHA-256: ${hash(values['type-proof.md']!)}`,
    scoutNA ? `- Scout SHA-256: N/A — ${scoutNA}` : `- Scout SHA-256: ${hash(values['scout.md']!)}`,
    `- Art direction record SHA-256: ${fingerprints.artDirectionRecord}`,
    `- Motion resolution projection SHA-256: ${fingerprints.motionResolutionProjection}`,
    `- Settled selection SHA-256: ${fingerprints.settledSelection}`,
    `- Composer handoff SHA-256: ${fingerprints.composerHandoff}`,
  ].join('\n');
  return COMPOSITION_SECTIONS.map((section) => `## ${section}\n\n${section === 'Input fingerprint' ? fingerprint : `Decision for ${section}.`}`).join('\n\n');
}
function synthesis(feature = 'Inbox triage workspace', sourceRef = 'LIN-LAYOUT', selector = '[data-region="inbox"]', route = '/inbox'): string {
  const axes = SYNTHESIS_AXES.map((axis, index) => `- ${axis} | ${index === 1 ? 'adapt' : 'N/A'} | ${index === 1 ? 'Queue and detail panel remain visible together.' : 'N/A'} | ${index === 1 ? 'Fit the relationship to the current task flow.' : 'This reference has no evidence for this axis.'}`).join('\n');
  return `## ${SYNTHESIS_SECTION}

### Feature: ${feature}
- Origin: explicit
- Assumption: N/A
- Primitive: Triage and inspect a queue item
- Source ref: ${sourceRef}
- Trust: Directly observed stable reference
- Uncertainty: Content changes may alter the exact density.
- Structural rule: Queue and detail regions maintain a deliberate relationship.
- Adaptation: Map the relationship into the destination task model.
- Token variation: Use destination system tokens rather than source values.
- Conflict resolution: Current task flow and accessibility constraints take precedence.
- Destination route: ${route}
- Destination selector: ${selector}
- Mobile behavior: Recompose queue and detail into a focused drill-in flow.
#### Axes
${axes}`;
}

test('complete matching composition contract passes', () => {
  const { root, values } = setup();
  writeFileSync(join(root, '.omd', 'composition.md'), artifact(values));
  assert.deepEqual(validateCompositionContract(root), []);
});

test('pure validator accepts supplied digests without filesystem access', () => {
  const values = {
    'frame.md': 'frame-v1',
    'copy-deck.md': 'copy-v1',
    'type-proof.md': 'type-v1',
    'scout.md': 'scout-v1',
  };
  assert.deepEqual(validateCompositionContractSource({
    contract: artifact(values),
    frame: hash(values['frame.md']!),
    copyDeck: hash(values['copy-deck.md']!),
    typeProof: hash(values['type-proof.md']!),
    scout: hash(values['scout.md']!),
    ...defaultFingerprints,
  }), []);
});
test('pure validator fails closed for every absent lineage digest', () => {
  const values = {
    'frame.md': 'frame-v1',
    'copy-deck.md': 'copy-v1',
    'type-proof.md': 'type-v1',
    'scout.md': 'scout-v1',
  };
  const inputs = {
    frame: hash(values['frame.md']),
    copyDeck: hash(values['copy-deck.md']),
    typeProof: hash(values['type-proof.md']),
    scout: hash(values['scout.md']),
    ...defaultFingerprints,
  };
  for (const key of Object.keys(defaultFingerprints) as Array<keyof typeof defaultFingerprints>) {
    assert.ok(validateCompositionContractSource({ contract: artifact(values), ...inputs, [key]: undefined })
      .some((finding) => finding.id === 'COMPOSITION-STALE'));
  }
});

test('motion-resolution composition fingerprint rejects stale and missing inputs', () => {
  const { root, values } = setup();
  const fingerprints = fixtureFingerprints.get(values)!;
  const fresh = artifact(values);
  writeFileSync(join(root, '.omd', 'composition.md'), fresh);
  assert.deepEqual(validateCompositionContract(root), []);
  writeFileSync(join(root, '.omd', 'composition.md'), fresh.replace(fingerprints.motionResolutionProjection, hash('stale motion resolution')));
  assert.ok(validateCompositionContract(root).some((finding) => finding.id === 'COMPOSITION-STALE'));
  writeFileSync(join(root, '.omd', 'composition.md'), fresh);
  rmSync(join(root, '.omd', 'motion-resolutions', `sha256-${fingerprints.motionResolutionProjection}.json`));
  assert.ok(validateCompositionContract(root).some((finding) => finding.id === 'COMPOSITION-STALE'));
});
test('settled-selection composition fingerprint rejects stale and missing inputs', () => {
  const { root, values } = setup();
  const fingerprints = fixtureFingerprints.get(values)!;
  const fresh = artifact(values);
  writeFileSync(join(root, '.omd', 'composition.md'), fresh);
  assert.deepEqual(validateCompositionContract(root), []);
  writeFileSync(join(root, '.omd', 'composition.md'), fresh.replace(fingerprints.settledSelection, hash('stale settled selection')));
  assert.ok(validateCompositionContract(root).some((finding) => finding.id === 'COMPOSITION-STALE'));
  writeFileSync(join(root, '.omd', 'composition.md'), fresh);
  rmSync(join(root, '.omd', 'settled-reference-selections', `sha256-${fingerprints.settledSelection}.json`));
  assert.ok(validateCompositionContract(root).some((finding) => finding.id === 'COMPOSITION-STALE'));
});
test('composer-handoff composition fingerprint rejects stale and missing inputs', () => {
  const { root, values } = setup();
  const fingerprints = fixtureFingerprints.get(values)!;
  const fresh = artifact(values);
  writeFileSync(join(root, '.omd', 'composition.md'), fresh);
  assert.deepEqual(validateCompositionContract(root), []);
  writeFileSync(join(root, '.omd', 'composition.md'), fresh.replace(fingerprints.composerHandoff, hash('stale composer handoff')));
  assert.ok(validateCompositionContract(root).some((finding) => finding.id === 'COMPOSITION-STALE'));
  writeFileSync(join(root, '.omd', 'composition.md'), fresh);
  rmSync(join(root, '.omd', 'reference-handoffs', 'composer.json'));
  assert.ok(validateCompositionContract(root).some((finding) => finding.id === 'COMPOSITION-STALE'));
});
test('art-direction composition fingerprint rejects stale and missing inputs', () => {
  const { root, values } = setup();
  const fingerprints = fixtureFingerprints.get(values)!;
  const fresh = artifact(values);
  writeFileSync(join(root, '.omd', 'composition.md'), fresh);
  assert.deepEqual(validateCompositionContract(root), []);
  writeFileSync(join(root, '.omd', 'composition.md'), fresh.replace(fingerprints.artDirectionRecord, hash('stale art direction')));
  assert.ok(validateCompositionContract(root).some((finding) => finding.id === 'COMPOSITION-STALE'));
  writeFileSync(join(root, '.omd', 'composition.md'), fresh);
  rmSync(join(root, '.omd', 'art-direction-runs', `sha256-${fingerprints.artDirectionRecord}.json`));
  assert.ok(validateCompositionContract(root).some((finding) => finding.id === 'COMPOSITION-STALE'));
});
test('invalid lineage artifacts produce deterministic stale findings', () => {
  const paths: Array<(root: string, fingerprints: typeof defaultFingerprints) => string> = [
    (root, fingerprints) => join(root, '.omd', 'art-direction-runs', `sha256-${fingerprints.artDirectionRecord}.json`),
    (root, fingerprints) => join(root, '.omd', 'motion-resolutions', `sha256-${fingerprints.motionResolutionProjection}.json`),
    (root, fingerprints) => join(root, '.omd', 'settled-reference-selections', `sha256-${fingerprints.settledSelection}.json`),
    (root) => join(root, '.omd', 'reference-handoffs', 'composer.json'),
  ];
  for (const path of paths) {
    const { root, values } = setup();
    const fingerprints = fixtureFingerprints.get(values)!;
    writeFileSync(join(root, '.omd', 'composition.md'), artifact(values));
    writeFileSync(path(root, fingerprints), '{');
    assert.ok(validateCompositionContract(root).some((finding) => finding.id === 'COMPOSITION-STALE'));
  }
});


test('missing and empty required H2 sections fail', () => {
  const { root, values } = setup();
  const missing = artifact(values).replace(/## Media roles[\s\S]*?(?=\n## Responsive recomposition)/, '');
  writeFileSync(join(root, '.omd', 'composition.md'), missing);
  assert.ok(validateCompositionContract(root).some((item) => item.path.endsWith('#Media roles')));
  const empty = artifact(values).replace('## Candidate axes\n\nDecision for Candidate axes.', '## Candidate axes\n\n');
  writeFileSync(join(root, '.omd', 'composition.md'), empty);
  assert.ok(validateCompositionContract(root).some((item) => item.path.endsWith('#Candidate axes')));
});

test('Focal hierarchy is an exact required section', () => {
  const { root, values } = setup();
  const missing = artifact(values).replace(/## Focal hierarchy[\s\S]*?(?=\n## Domain form grammar)/, '');
  writeFileSync(join(root, '.omd', 'composition.md'), missing);
  assert.ok(validateCompositionContract(root).some((item) => item.id === 'COMPOSITION-SECTION' && item.path.endsWith('#Focal hierarchy')));
});

test('bad hash format fails without aesthetic judgment', () => {
  const { root, values } = setup();
  writeFileSync(join(root, '.omd', 'composition.md'), artifact(values).replace(/Frame SHA-256: [0-9a-f]{64}/, 'Frame SHA-256: abc'));
  const findings = validateCompositionContract(root);
  assert.ok(findings.some((item) => item.id === 'COMPOSITION-HASH'));
  assert.ok(findings.every((item) => !/taste|aesthetic|quality/i.test(item.message)));
});

for (const filename of ['frame.md', 'copy-deck.md', 'type-proof.md', 'scout.md']) {
  test(`changed ${filename} makes composition stale`, () => {
    const { root, values } = setup();
    writeFileSync(join(root, '.omd', 'composition.md'), artifact(values));
    writeFileSync(join(root, '.omd', filename), 'changed');
    assert.ok(validateCompositionContract(root).some((item) => item.id === 'COMPOSITION-STALE' && item.path.endsWith(filename)));
  });
}

test('absent scout passes only with an explicit N/A reason', () => {
  const { root, values } = setup(false);
  writeFileSync(join(root, '.omd', 'composition.md'), artifact(values, 'No durable scout summary was produced for this run.'));
  assert.deepEqual(validateCompositionContract(root), []);
  writeFileSync(join(root, '.omd', 'composition.md'), artifact({ ...values, 'scout.md': 'fake' }));
  assert.ok(validateCompositionContract(root).some((item) => item.id === 'COMPOSITION-SCOUT'));
  writeFileSync(join(root, '.omd', 'composition.md'), artifact(values, 'temporary').replace(/- Scout SHA-256: [^\n]+/, '- Scout SHA-256: N/A —'));
  assert.ok(validateCompositionContract(root).some((item) => item.id === 'COMPOSITION-SCOUT'));
});

test('missing composition file fails explicit command and JSON is stable', () => {
  const { root } = setup(false);
  const missing = spawnSync(process.execPath, [cli, 'composition', '--check', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.equal((JSON.parse(missing.stdout) as Array<{ id: string }>)[0]?.id, 'COMPOSITION-MISSING');
});

test('CLI exits zero for a fresh contract and emits an empty JSON array', () => {
  const { root, values } = setup();
  writeFileSync(join(root, '.omd', 'composition.md'), artifact(values));
  const result = spawnSync(process.execPath, [cli, 'composition', '--check', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
  assert.ok(readFileSync(join(root, '.omd', 'composition.md'), 'utf8').includes('## Transfer boundary'));
});
test('CLI emits JSON findings for missing lineage artifacts', () => {
  const { root, values } = setup();
  const fingerprints = fixtureFingerprints.get(values)!;
  writeFileSync(join(root, '.omd', 'composition.md'), artifact(values));
  rmSync(join(root, '.omd', 'motion-resolutions', `sha256-${fingerprints.motionResolutionProjection}.json`));
  const result = spawnSync(process.execPath, [cli, 'composition', '--check', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.ok((JSON.parse(result.stdout) as Array<{ id: string }>).some((finding) => finding.id === 'COMPOSITION-STALE'));
});

// ── Reference synthesis (conditional on user-origin references) ───────────────

const baseInputs = () => {
  const values = {
    'frame.md': 'frame-v1',
    'copy-deck.md': 'copy-v1',
    'type-proof.md': 'type-v1',
    'scout.md': 'scout-v1',
  };
  return {
    values,
    digests: {
      frame: hash(values['frame.md']),
      copyDeck: hash(values['copy-deck.md']),
      typeProof: hash(values['type-proof.md']),
      scout: hash(values['scout.md']),
      ...defaultFingerprints,
    },
  };
};

test('no user references means no synthesis requirement', () => {
  const { values, digests } = baseInputs();
  assert.deepEqual(validateCompositionContractSource({ contract: artifact(values), ...digests }), []);
});

test('user references without a Reference synthesis section fail', () => {
  const { values, digests } = baseInputs();
  const findings = validateCompositionContractSource({
    contract: artifact(values),
    ...digests,
    userRefLabels: ['linear.app'],
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.id, 'COMPOSITION-SYNTHESIS');
  assert.match(findings[0]!.message, /missing or empty/);
});

test('an empty Reference synthesis section fails the same way', () => {
  const { values, digests } = baseInputs();
  const contract = `${artifact(values)}\n\n## ${SYNTHESIS_SECTION}\n\n`;
  const findings = validateCompositionContractSource({
    contract,
    ...digests,
    userRefLabels: ['linear.app'],
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.id, 'COMPOSITION-SYNTHESIS');
});

test('synthesis ABI rejects missing axes, malformed values, duplicate selectors, and interaction-only transfer', () => {
  const { values, digests } = baseInputs();
  const complete = `${artifact(values)}\n\n${synthesis()}`;
  assert.deepEqual(validateCompositionContractSource({ contract: complete, ...digests }), []);
  for (const axis of SYNTHESIS_AXES) {
    const missing = complete.replace(new RegExp(`^- ${axis.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\|[^\\n]*\\n?`, 'm'), '');
    assert.ok(validateCompositionContractSource({ contract: missing, ...digests }).some((finding) => finding.message.includes(`axis "${axis}"`)));
  }
  const duplicateAxis = `${complete}\n- Information architecture/navigation | N/A | N/A | Duplicate axis must be rejected.`;
  assert.ok(validateCompositionContractSource({ contract: duplicateAxis, ...digests }).some((finding) => finding.message.includes('Information architecture/navigation')));
  assert.deepEqual(validateCompositionContractSource({ contract: `${artifact(values)}\n\n${synthesis('Root workspace', 'LIN-LAYOUT', '[data-region="root"]', '/')}`, ...digests }), []);
  const malformed = complete.replace('Macro layout and panel/region geometry | adapt', 'Macro layout and panel/region geometry | copy');
  assert.ok(validateCompositionContractSource({ contract: malformed, ...digests }).some((finding) => finding.message.includes('invalid disposition')));
  const reasonless = complete.replace('- Content density | N/A | N/A | This reference has no evidence for this axis.', '- Content density | N/A | N/A | N/A');
  assert.ok(validateCompositionContractSource({ contract: reasonless, ...digests }).some((finding) => finding.message.includes('N/A reason')));
  const duplicateSelector = `${complete}\n\n${synthesis('Secondary triage workspace', 'NOTION-LAYOUT').replace(/^## Reference synthesis\n+/, '')}`;
  assert.ok(validateCompositionContractSource({ contract: duplicateSelector, ...digests }).some((finding) => finding.message.includes('duplicated')));
  const interactionOnly = complete.replace('Macro layout and panel/region geometry | adapt | Queue and detail panel remain visible together. | Fit the relationship to the current task flow.', 'Macro layout and panel/region geometry | N/A | N/A | No structural transfer is adopted here.');
  assert.ok(validateCompositionContractSource({ contract: interactionOnly, ...digests }).some((finding) => finding.message.includes('interaction-only')));
});
test('every user reference must be mentioned in the synthesis plan', () => {
  const { values, digests } = baseInputs();
  const contract = `${artifact(values)}\n\n${synthesis('Inbox triage workspace', 'LIN-LAYOUT')}`;
  const findings = validateCompositionContractSource({
    contract,
    ...digests,
    userRefLabels: ['LIN-LAYOUT', 'NOTION-LAYOUT'],
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.id, 'COMPOSITION-SYNTHESIS');
  assert.match(findings[0]!.message, /NOTION-LAYOUT/);
});

test('a synthesis plan naming every exact reference identity passes', () => {
  const { values, digests } = baseInputs();
  const contract = `${artifact(values)}\n\n${synthesis('Inbox triage workspace', 'LIN-LAYOUT')}\n\n### Decline: Notion document density\n- Origin: explicit
- Source ref: NOTION-LAYOUT
- Trust: User supplied reference
- Uncertainty: Scope is limited to the supplied page.
- Reason: Document density conflicts with rapid queue scanning.`;
  const findings = validateCompositionContractSource({
    contract,
    ...digests,
    userRefLabels: ['LIN-LAYOUT', 'NOTION-LAYOUT'],
  });
  assert.deepEqual(findings, []);
});

test('filesystem adapter derives user reference labels from origin: user records', () => {
  const { root, values } = setup();
  const refsDir = join(root, '.omd', 'refs');
  mkdirSync(refsDir, { recursive: true });
  writeFileSync(join(refsDir, 'linear.app.page.json'), JSON.stringify({
    source: 'https://linear.app/features', component: 'page', kind: 'page', capturedAt: '2026-01-01',
    invariants: null, principles: [], origin: 'user',
  }));
  writeFileSync(join(refsDir, 'stripe.com.page.json'), JSON.stringify({
    source: 'https://stripe.com', component: 'page', kind: 'page', capturedAt: '2026-01-01',
    invariants: null, principles: [], origin: 'scout',
  }));
  // No synthesis section: only the user ref (linear.app) should be demanded, not the scout ref.
  writeFileSync(join(root, '.omd', 'composition.md'), artifact(values));
  const findings = validateCompositionContract(root);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.id, 'COMPOSITION-SYNTHESIS');
  assert.match(findings[0]!.message, /missing or empty/);

  const withPlan = `${artifact(values)}\n\n${synthesis('Inbox search workspace', refKey('https://linear.app/features', 'page'))}`;
  writeFileSync(join(root, '.omd', 'composition.md'), withPlan);
  assert.deepEqual(validateCompositionContract(root), []);
});
test('closed parser rejects unknown or duplicate H2 sections and fingerprint keys', () => {
  const { values, digests } = baseInputs();
  const complete = artifact(values);
  for (const contract of [
    `${complete}\n\n## Surprise\n\nNo unowned section.`,
    `${complete}\n\n## Media roles\n\nA duplicate section.`,
    complete.replace('- Frame SHA-256:', `- Frame SHA-256: ${hash(values['frame.md']!)}\n- Frame SHA-256:`),
    `${complete.replace('- Scout SHA-256:', '- Scout SHA-256: deadbeef\n- Scout SHA-256:')}\n`,
    complete.replace('- Type proof SHA-256:', '- Extra SHA-256: ignored\n- Type proof SHA-256:'),
  ]) {
    assert.ok(validateCompositionContractSource({ contract, ...digests }).some((finding) => /unknown|duplicate H2|exactly once/.test(finding.message)));
  }
});

test('UX task coverage is an allowed auxiliary section and Unicode separators fail closed', () => {
  const { values, digests } = baseInputs();
  const complete = artifact(values);
  const withCoverage = `${complete}\n\n## UX task coverage\n\nT1 | production: / | locator: [data-task="save"] |\n`;
  assert.deepEqual(validateCompositionContractSource({ contract: withCoverage, ...digests }), []);
  const hidden = `${complete}\n\nTask evidence binding:\u2028## UX task coverage\n\nT1 | production: / | locator: [data-task="save"] |\n`;
  assert.ok(validateCompositionContractSource({ contract: hidden, ...digests }).some((finding) => /Unicode line or paragraph separator/.test(finding.message)));
  for (const separator of ['\u2028', '\u2029', '\u0085', '\u000B', '\u000C']) {
    const injected = complete.replace('## Experience spine', `## Experience spine${separator}`);
    assert.ok(validateCompositionContractSource({ contract: injected, ...digests }).some((finding) => /Unicode line or paragraph separator/.test(finding.message)));
  }
});

test('closed synthesis parser rejects unknown fields, stray prose, headings, and malformed cardinality', () => {
  const { values, digests } = baseInputs();
  const complete = `${artifact(values)}\n\n${synthesis()}`;
  for (const contract of [
    complete.replace('- Primitive:', '- Invented field: unexpected\n- Primitive:'),
    complete.replace('- Trust:', 'This is stray prose.\n- Trust:'),
    complete.replace('#### Axes', '#### Unrecognized heading\n#### Axes'),
    complete.replace('- Mobile behavior:', '- Mobile behavior:\n- Mobile behavior:'),
  ]) {
    assert.ok(validateCompositionContractSource({ contract, ...digests }).some((finding) => finding.id === 'COMPOSITION-SYNTHESIS'));
  }
});

test('coverage uses exact Source ref fields, retains same-host references, and allows short labels', () => {
  const { values, digests } = baseInputs();
  const first = refKey('https://linear.app/one', 'page');
  const second = refKey('https://linear.app/two', 'page');
  const contract = `${artifact(values)}\n\n${synthesis('UI', first)}\n\n${synthesis('OK', second, '[data-region="secondary"]').replace(/^## Reference synthesis\n+/, '')}`;
  assert.deepEqual(validateCompositionContractSource({ contract, ...digests, userRefLabels: [first, second] }), []);
  const proseOnly = contract.replace(second, 'unmapped-ref').replace('This reference has no evidence for this axis.', `This reference mentions ${second} only in prose.`);
  const findings = validateCompositionContractSource({ contract: proseOnly, ...digests, userRefLabels: [first, second] });
  assert.ok(findings.some((finding) => finding.message.includes(second) && finding.message.includes('exact Source ref')));
});

test('routes and selectors are local, stable, normalized, and diagnostic records identify themselves', () => {
  const { values, digests } = baseInputs();
  const complete = `${artifact(values)}\n\n${synthesis('Triage', 'FIRST-REF')}`;
  for (const contract of [
    complete.replace('- Destination route: /inbox', '- Destination route: https://example.com'),
    complete.replace('- Destination route: /inbox', '- Destination route: TODO route'),
    complete.replace('- Destination route: /inbox', '- Destination route: //example.com'),
    complete.replace('- Destination route: /inbox', '- Destination route: /todo'),
    complete.replace('[data-region="inbox"]', '.inbox-card'),
    `${complete}\n\n${synthesis('Second', 'SECOND-REF', '[data-region="inbox"]').replace(/^## Reference synthesis\n+/, '')}`,
  ]) {
    const findings = validateCompositionContractSource({ contract, ...digests });
    assert.ok(findings.some((finding) => finding.message.includes('Feature "') && /Destination route|Destination selector/.test(finding.message)));
  }
});

test('source refs and axis rows reject hostname prose and extra columns', () => {
  const { values, digests } = baseInputs();
  const complete = `${artifact(values)}\n\n${synthesis()}`;
  const hostname = complete.replace('- Source ref: LIN-LAYOUT', '- Source ref: linear.app');
  const extraColumn = complete.replace(
    '- Content density | N/A | N/A | This reference has no evidence for this axis.',
    '- Content density | N/A | N/A | This reference has no evidence for this axis. | injected',
  );
  for (const contract of [hostname, extraColumn]) {
    assert.ok(validateCompositionContractSource({ contract, ...digests }).some((finding) => finding.id === 'COMPOSITION-SYNTHESIS'));
  }
});

test('long junk and unknown axes cannot be scavenged into valid records', () => {
  const { values, digests } = baseInputs();
  const complete = `${artifact(values)}\n\n${synthesis()}`;
  const longJunk = `${complete}\n${'unstructured junk '.repeat(20)}`;
  const unknownAxis = complete.replace('- Motion/transition | N/A | N/A | This reference has no evidence for this axis.', '- Spatial spectacle | adapt | A long observed rule. | A long adaptation rule.');
  for (const contract of [longJunk, unknownAxis]) {
    assert.ok(validateCompositionContractSource({ contract, ...digests }).some((finding) => finding.id === 'COMPOSITION-SYNTHESIS'));
  }
});
