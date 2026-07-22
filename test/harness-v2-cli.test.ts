import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { crc32, deflateSync } from 'node:zlib';
import { artDirectionSha256 } from '../core/art-direction/schema.ts';
import { NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256, recipeDecisionProjectionSha256 } from '../core/art-direction/decision.ts';
import { intentLedgerSha256, resolveCurrentUserBeatExceptionReceipt } from '../core/runtime/intent.ts';
import { refIdentity } from '../core/ref/identity.ts';
import { refImagePath, saveRef } from '../core/ref/store.ts';
import { motionResolutionProjectionSha256, referenceSelectionV2Sha256 } from '../core/ref/reference-selection.ts';
import { COPY_DECK_RECEIPT_SCHEMA_VERSION, copyDeckSha256, validateCanonicalCopyDeckReceipt } from '../core/copy/index.ts';
import type { Blueprint, Invariants, Reference } from '../core/types.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { writeSourceSeal } from '../core/source-seal/index.ts';
import { publishTaskEvidence } from '../core/evidence/task.ts';
import { createTestProjectRunInvocation } from './helpers/project-write.ts';
import { validateFinalEvidenceV2Graph } from '../core/evidence/final-v2-graph.ts';

import { captureRenderedBeatReceipt, renderFilmstrip, renderPage } from '../core/render/index.ts';
const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const project = (): string => mkdtempSync(join(tmpdir(), 'omd-harness-v2-cli-'));
let hostReceiptSequence = 0;
const run = (cwd: string, args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: process.env });
const sha = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
const pngChunk = (type: string, bytes: Buffer): Buffer => { const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length); const body = Buffer.concat([Buffer.from(type), bytes]); const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(body) >>> 0); return Buffer.concat([length, body, checksum]); };
const screenshot = (width: number, height: number): Buffer => { const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(Buffer.alloc((width * 3 + 1) * height))), pngChunk('IEND', Buffer.alloc(0))]); };
const canonical = (value: unknown): string => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
const canonicalPayload = (value: unknown): string => `${canonical(value)}\n`;
const copyDeckV2 = (selectedRegister: 'quiet' | 'confident' | 'showpiece', motionDecision: 'none' | 'one', currentUserBeatExceptionReceiptSha256: string): string => {
  const hasBeatException = currentUserBeatExceptionReceiptSha256 !== NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256;
  return `# Copy

## Sources and fact ledger

| ID | Status | Source | Fact |
| --- | --- | --- | --- |
| F-001 | verified | user brief | The launch has one primary action. |

## Audience language

- Audience quote: “Show me the next step.”

## Voice contract

- Audience: People evaluating the launch.
- Language: en
- Register: direct

## Surface copy

### Launch
- Main message: Begin with the essential decision.
- Supporting fact: The launch has one primary action.
- Next action: Review the launch
- Claim refs: F-001

## Navigation and actions

- Review the launch → Opens the launch summary.

## States and recovery

- Interaction scope: static
- Primary copy: Review the launch.
- Recovery copy: N/A — static surface has no recovery state.
- Primary probe: N/A — static surface has no interaction.
- Recovery probe: N/A — static surface has no recovery interaction.

## Humanize audit

- Read aloud for direct, concise language.

## Art direction contract

- Schema: art-direction-v1
- Register: ${selectedRegister}
- motionDecision: ${motionDecision}
- Evidence IDs: F-001
- Current-user exception: ${hasBeatException ? 'current-user: host-authorized Beat exception' : 'N/A — no host-authorized Beat exception'}
- Current-user Beat-exception receipt SHA-256: ${currentUserBeatExceptionReceiptSha256}

| Beat ID | Evidence IDs |
| --- | --- |
| B-1 | F-001 |
`;
};
const runMutation = (cwd: string, args: string[], invocation: { activation: { hostCapability: { host: 'claude' | 'codex' }; buildSha256: string; loadedSkillSha256: string; briefSha256: string } }, payloadAuthorizations: readonly { purpose: string; payload: string | Buffer }[] = []): Promise<{ status: number | null; stdout: string; stderr: string }> => {
  const childArgv = [CLI, ...args];
  const receipt = {
    schema: 'omd-host-project-write-receipt-v2',
    host: invocation.activation.hostCapability.host,
    hostAuthentication: {
      host: invocation.activation.hostCapability.host,
      mechanism: 'inherited-ipc',
    },
    projectRoot: realpathSync(cwd),
    argvSha256: sha(canonical([process.execPath, ...childArgv])),
    buildSha256: invocation.activation.buildSha256,
    loadedSkillSha256: invocation.activation.loadedSkillSha256,
    briefSha256: invocation.activation.briefSha256,
    expiresAt: Date.now() + 60_000,
    payloadAuthorizations: payloadAuthorizations.map(({ purpose, payload }) => ({ purpose, payloadSha256: sha(payload) })),
    nonce: sha(`${cwd}:${hostReceiptSequence += 1}`),
  };
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, childArgv, {
      cwd,
      env: { ...process.env, OMD_HOST_PROJECT_WRITE_FD: '3' },
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    });
    const receiptPipe = child.stdio[3];
    if (receiptPipe === undefined || receiptPipe === null || !('end' in receiptPipe)) {
      child.kill();
      reject(new Error('host receipt pipe is unavailable'));
      return;
    }
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk; });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (status) => resolve({ status, stdout, stderr }));
    receiptPipe.end(canonical(receipt));
  });
};
const receipt = (root: string, name: string, schema: string, value: object): Record<string, string> => {
  const path = join('.omd', 'receipts', `${name}.json`); const bytes = `${canonical(value)}\n`;
  mkdirSync(join(root, '.omd', 'receipts'), { recursive: true }); writeFileSync(join(root, path), bytes);
  return { path, schema, sha256: sha(bytes) };
};
type ArtDirectionBudgetOptions = {
  readonly beats?: readonly string[];
  readonly selectedRegister?: 'quiet' | 'confident' | 'showpiece';
  readonly beatException?: boolean;
  readonly stopAfterArtDirection?: boolean;
};

const manifest = async (root: string, motionDecision: 'none' | 'one' = 'none', budgetOptions: ArtDirectionBudgetOptions = {}): Promise<any> => {
  const activationValue = { schemaVersion: 'activation-context-v2', buildSha256: sha('build'), loadedSkillSha256: sha('skill'), briefSha256: sha('brief'), hostCapability: { host: 'codex' as const } };
  const activation = receipt(root, 'activation', 'activation-context-v2', activationValue);
  const invocation = { activation: activationValue, current: { buildSha256: activationValue.buildSha256, loadedSkillSha256: activationValue.loadedSkillSha256, briefSha256: activationValue.briefSha256 } };
  const invocationPath = writeManifest(root, 'invocation.json', invocation);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64');
  const invariants: Invariants = { spacingLadder: [8], radiusLadder: [4], elevationLevels: 0, centeredRatio: 0, tokenCoverage: 1, paddingWeight: 8, typeScale: [], fontFamilies: [], weightLadder: [], motionDurations: [], easingVocab: [], animatedShare: 0, hoverCoverage: 0, focusCoverage: 0, animatedProperties: [], hasReducedMotion: false, scrollChoreography: [] };
  const blueprint: Blueprint = { selector: '#hero', capturedAt: '2026-01-01T00:00:00.000Z', nodes: [{ id: 'hero', role: 'container', children: [], box: { w: 160, h: 40 } }] };
  const source = 'https://capture.example/hero'; const component = 'hero'; const image = refImagePath(root, { source, component });
  const reference: Reference = { source, component, kind: 'component', capturedAt: '2026-01-01T00:00:00.000Z', selector: '#hero', invariants, principles: ['Keep the hierarchy.'], blueprint, imagePath: relative(root, image) };
  saveRef(root, reference, createTestProjectWriteAdapter(root)); writeFileSync(image, png);
  const needsSecondStatic = budgetOptions.selectedRegister === 'confident';
  const boardValue = { schemaVersion: 'reference-board-v1', frameSha256: sha('frame'), candidates: [{ id: 'candidate', label: 'Candidate', route: '/', rationale: 'Lawful evidence', pieces: [{ slotId: 'static', sourceKind: 'component-capture', referenceId: refIdentity(source, component), targetComponent: 'Hero', targetSelector: '#hero', taskIds: ['T1'], reason: 'Use structure', take: ['structure'], avoid: 'Avoid copying', adaptation: 'Adapt lawfully', evidenceAxes: { rights: 'lawful', signal: 'high-visual-system', staticAxis: 'available', motionAxis: 'absent' }, grid: { column: 1, span: needsSecondStatic ? 6 : 12, order: 0 } }, ...(needsSecondStatic ? [{ slotId: 'static-secondary', sourceKind: 'component-capture', referenceId: refIdentity(source, component), targetComponent: 'Hero detail', targetSelector: '#hero', taskIds: ['T1'], reason: 'Use supporting structure', take: ['structure'], avoid: 'Avoid copying', adaptation: 'Adapt lawfully', evidenceAxes: { rights: 'lawful', signal: 'high-visual-system', staticAxis: 'available', motionAxis: 'absent' }, grid: { column: 7, span: 6, order: 1 } }] : [])] }] };
  writeFileSync(join(root, '.omd', 'reference-board.json'), JSON.stringify(boardValue));
  const selected = await runMutation(root, ['ref', 'select', 'candidate', '--activation', invocationPath], invocation);
  assert.equal(selected.status, 0, selected.stderr);
  const selectedRegister = budgetOptions.selectedRegister ?? 'quiet';
  const intentEvent = { eventId: `current-user-${selectedRegister}`, currentUser: true, kind: 'explicit-intent', lock: { register: selectedRegister }, recordedAt: '2026-01-01T00:00:00.000Z' };
  const intentInput = writeManifest(root, 'intent-input.json', { invocation, event: intentEvent, expectedCurrentSha256: null });
  const appended = await runMutation(root, ['intent', 'append', '--input', intentInput], invocation, [{ purpose: 'current-user-intent-event', payload: canonicalPayload(intentEvent) }]);
  assert.equal(appended.status, 0, appended.stderr);
  const alternatives = [
    { register: 'quiet', subjectIdentityFit: 'Quiet editorial framing fits the subject.', staticReferenceSlotIds: ['static'], motionReferenceSlotIds: [], conceptRole: 'Editorial clarity', macroCompositionHypothesis: 'Template-breaking asymmetric editorial departure.', motionHypothesis: 'none', uxAccessibilityPerformanceRisks: ['Reduced motion remains available.'], lawfulImplementationPath: 'CSS and SVG implementation.', rejectionCondition: 'The visual-system evidence better supports another documented direction.' },
    { register: 'confident', subjectIdentityFit: 'Confident framing fits the subject.', staticReferenceSlotIds: needsSecondStatic ? ['static', 'static-secondary'] : ['static'], motionReferenceSlotIds: [], conceptRole: 'Launch transition', macroCompositionHypothesis: selectedRegister === 'confident' ? 'Template-breaking confident editorial departure.' : 'Layered promotional composition.', motionHypothesis: selectedRegister === 'confident' ? 'none' : 'one', uxAccessibilityPerformanceRisks: ['Reduced motion remains available.'], lawfulImplementationPath: 'CSS and SVG implementation.', rejectionCondition: 'The static evidence does not establish the required motion scene.' },
    { register: 'showpiece', subjectIdentityFit: 'Showpiece framing fits the subject.', staticReferenceSlotIds: ['static'], motionReferenceSlotIds: [], conceptRole: 'Signature reveal', macroCompositionHypothesis: 'Layered promotional composition.', motionHypothesis: 'one', uxAccessibilityPerformanceRisks: ['Reduced motion remains available.'], lawfulImplementationPath: 'CSS and SVG implementation.', rejectionCondition: 'The static evidence does not establish the required motion scene.' },
  ];
  const evaluatorAssessment = { assessments: alternatives.map((alternative) => ({ register: alternative.register, score: alternative.register === selectedRegister ? 3 : 1, subjectIdentityRationale: `${alternative.register} subject assessment.`, conceptRoleRationale: `${alternative.register} role assessment.`, uxAccessibilityPerformanceRationale: `${alternative.register} accessibility assessment.`, lawfulFeasibilityRationale: `${alternative.register} lawful assessment.`, referenceEvidenceRationale: `${alternative.register} evidence assessment.`, rejectionRationale: `${alternative.register} ranking assessment.` })) };
  const evaluatorResult = { winner: selectedRegister, alternativesSha256: sha(canonicalPayload(alternatives)), motionResolution: { motionDecision: 'none', slots: [] } };
  if (budgetOptions.beatException) {
    const beatExceptionEvent = { eventId: 'current-user-beat-exception', currentUser: true, kind: 'current-user-beat-exception', lock: {}, recordedAt: '2026-01-01T00:00:01.000Z' };
    const currentIntentRecord = (JSON.parse(readFileSync(join(root, '.omd', 'intent-current.json'), 'utf8')) as { record: string }).record;
    const beatExceptionInput = writeManifest(root, 'beat-exception-input.json', { invocation, event: beatExceptionEvent, expectedCurrentSha256: intentLedgerSha256(JSON.parse(readFileSync(join(root, '.omd', currentIntentRecord), 'utf8'))) });
    const appendedException = await runMutation(root, ['intent', 'append', '--input', beatExceptionInput], invocation, [
      { purpose: 'current-user-intent-event', payload: canonicalPayload(beatExceptionEvent) },
      { purpose: 'current-intent-ledger', payload: readFileSync(join(root, '.omd', currentIntentRecord)) },
    ]);
    assert.equal(appendedException.status, 0, appendedException.stderr);
  }
  const artInput = writeManifest(root, 'art-direction-input.json', { invocation, route: '/', alternatives, references: [{ slotId: 'static', signal: 'high-visual-system', positive: true, lawful: true, motionObligation: 'none' }, ...(needsSecondStatic ? [{ slotId: 'static-secondary', signal: 'high-visual-system', positive: true, lawful: true, motionObligation: 'none' }] : [])], evaluatorAssessment, evaluatorResult, eligibility: { sceneRoles: [], fallbackAttempted: true, qualityGates: { blindSignatureGreen: true, narrativeGreen: true, motionFitGreen: true, fidelityDecisionFitGreen: true, macroLandingScore: 3, staticReferenceInfluenceScore: 3, templateBreakingLandingScore: 3 } }, beats: budgetOptions.beats ?? ['B-1'], implementationLane: 'browser', fallbackPath: 'CSS/SVG static reduced-motion fallback.', performanceAccessibilityBudget: 'Within the declared accessibility and performance budget.' });
  const directed = await runMutation(root, ['art-direction', 'check', '--input', artInput], invocation, [{ purpose: 'evaluator-assessment', payload: canonicalPayload(evaluatorAssessment) }, { purpose: 'evaluator-result', payload: canonicalPayload(evaluatorResult) }, { purpose: 'current-intent-ledger', payload: readFileSync(join(root, '.omd', (JSON.parse(readFileSync(join(root, '.omd', 'intent-current.json'), 'utf8')) as { record: string }).record)) }]);
  if (budgetOptions.stopAfterArtDirection) return { directed };
  assert.equal(directed.status, 0, directed.stderr);
  const callerScoresInput = writeManifest(root, 'art-direction-caller-scores.json', {
    ...(JSON.parse(readFileSync(artInput, 'utf8')) as Record<string, unknown>),
    scores: { showpiece: 999 },
  });
  const callerScores = await runMutation(root, ['art-direction', 'check', '--input', callerScoresInput], invocation);
  assert.notEqual(callerScores.status, 0);
  assert.match(callerScores.stderr, /CALLER_DECISION_FORBIDDEN/);
  const current = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(root, '.omd', name), 'utf8')) as Record<string, string>;
  const intentRecord = current('intent-current.json').record as string;
  const intent = { path: join('.omd', intentRecord), schema: 'intent-ledger-v1', sha256: sha(readFileSync(join(root, '.omd', intentRecord))) };
  const board = receipt(root, 'board', 'reference-board-v1', boardValue);
  const selectionValue = JSON.parse(readFileSync(join(root, '.omd', 'reference-selection-v2.json'), 'utf8')) as Parameters<typeof referenceSelectionV2Sha256>[0];
  const selection = receipt(root, 'selection', 'reference-selection-v2', selectionValue);
  const selectionSemantic = referenceSelectionV2Sha256(selectionValue);
  const handoffValue = JSON.parse(readFileSync(join(root, '.omd', 'reference-handoffs', 'art-direction.json'), 'utf8')) as { payloadSha256: string };
  const handoff = receipt(root, 'handoff', 'reference-handoff-v2', handoffValue);
  const artDirectionRecord = current('art-direction.json').record as string;
  const baseArtRecord = JSON.parse(readFileSync(join(root, '.omd', artDirectionRecord), 'utf8')) as {
    schemaVersion: string;
    decisionSha256: string;
    referenceHandoffSha256: string;
    activationSha256: string;
    intentLedgerSha256: string;
    beatIds: string[];
    decision: {
      boardSha256: string;
      preSelectionSha256: string;
      selectedRegister: 'quiet' | 'confident' | 'showpiece';
      motionDecision: 'none' | 'one';
      motionResolutionProjectionSha256: string;
      settledSelectionSha256: string;
      currentUserBeatExceptionReceiptSha256: string;
    };
  };
  const settledSelectionValue = JSON.parse(readFileSync(join(root, '.omd', 'settled-reference-selections', `sha256-${baseArtRecord.decision.settledSelectionSha256}.json`), 'utf8')) as Parameters<typeof referenceSelectionV2Sha256>[0];
  const settledSelection = receipt(root, 'settled-selection', 'reference-selection-v2', settledSelectionValue);
  const settledSelectionSemantic = referenceSelectionV2Sha256(settledSelectionValue);
  writeFileSync(join(root, '.omd', 'reference-selection-v2.json'), canonicalPayload(settledSelectionValue));
  const motionResolutionValue = JSON.parse(readFileSync(join(root, '.omd', 'motion-resolutions', `sha256-${baseArtRecord.decision.motionResolutionProjectionSha256}.json`), 'utf8')) as Parameters<typeof motionResolutionProjectionSha256>[0];
  const currentUserBeatExceptionReceiptSha256 = baseArtRecord.decision.currentUserBeatExceptionReceiptSha256;
  const decision = {
    ...baseArtRecord.decision,
    currentUserBeatExceptionReceiptSha256,
  };
  const artRecord = {
    ...baseArtRecord,
    decision,
    decisionSha256: artDirectionSha256(decision),
  };
  const artDirectionSemantic = artDirectionSha256(artRecord);
  const currentArtDirectionRecord = join('.omd', 'art-direction-runs', `sha256-${artDirectionSemantic}.json`);
  const artDirectionBytes = Buffer.from(canonicalPayload(artRecord));
  writeFileSync(join(root, currentArtDirectionRecord), artDirectionBytes);
  writeFileSync(join(root, '.omd', 'art-direction.json'), canonicalPayload({
    schemaVersion: 'art-direction-current-v2',
    record: currentArtDirectionRecord.slice('.omd/'.length),
    sha256: artDirectionSemantic,
  }));
  const artDirection = {
    path: currentArtDirectionRecord,
    schema: 'art-direction-record-v2',
    sha256: sha(artDirectionBytes),
  };
  assert.equal(artRecord.activationSha256, artDirectionSha256(activationValue));
  assert.equal(artRecord.intentLedgerSha256, intentLedgerSha256(JSON.parse(readFileSync(join(root, '.omd', intentRecord), 'utf8'))));
  assert.equal(artRecord.decision.boardSha256, selectionValue.captureSha256);
  assert.equal(artRecord.decision.preSelectionSha256, selection.sha256);
  assert.equal(artRecord.decision.settledSelectionSha256, settledSelection.sha256);
  assert.equal(artRecord.decision.motionResolutionProjectionSha256, motionResolutionProjectionSha256(motionResolutionValue));
  assert.equal(artRecord.referenceHandoffSha256, JSON.parse(readFileSync(join(root, '.omd', 'reference-handoffs', 'art-direction.json'), 'utf8')).payloadSha256);
  const attribution = 'Reference attribution.';
  writeFileSync(join(root, '.omd', 'attribution.md'), attribution);
  writeFileSync(join(root, 'evidence.html'), '<main id="hero">Evidence</main>');
  const composerHandoffValue = JSON.parse(readFileSync(join(root, '.omd', 'reference-handoffs', 'composer.json'), 'utf8')) as { payloadSha256: string };
  const usageValue = {
    schemaVersion: 'reference-usage-v2',
    captureSha256: selectionValue.captureSha256,
    assemblySha256: selectionValue.assemblySha256,
    projectionSha256: selectionValue.projectionSha256,
    selectionSha256: settledSelectionSemantic,
    artDirectionSha256: artDirectionSemantic,
    motionResolutionProjectionSha256: artRecord.decision.motionResolutionProjectionSha256,
    settledSelectionSha256: artRecord.decision.settledSelectionSha256,
    composerHandoffSha256: composerHandoffValue.payloadSha256,
    attributionSha256: sha(attribution),
    rows: [{ slotId: 'static', status: 'used', target: { route: '/', component: 'Hero', selector: '#hero' }, borrowedProperties: ['structure'], nonBorrowedProperties: ['branding'], transformation: 'Adapted structure', evidence: { path: 'evidence.html', selector: '#hero' }, verificationNote: 'Verified' }],
  };
  writeFileSync(join(root, '.omd', 'reference-usage-v2.json'), JSON.stringify(usageValue));
  const usageChecked = run(root, ['ref', 'usage-check']);
  assert.equal(usageChecked.status, 0, usageChecked.stderr);
  const usage = receipt(root, 'usage', 'reference-usage-v2', usageValue);
  const copyDeck = copyDeckV2(artRecord.decision.selectedRegister, artRecord.decision.motionDecision, currentUserBeatExceptionReceiptSha256);
  writeFileSync(join(root, '.omd', 'copy-deck.md'), copyDeck);
  const copyValue = {
    schemaVersion: COPY_DECK_RECEIPT_SCHEMA_VERSION,
    copyDeckSha256: copyDeckSha256(Buffer.from(copyDeck)),
    artDirectionSha256: artDirectionSemantic,
    selectedRegister: artRecord.decision.selectedRegister,
    motionDecision: artRecord.decision.motionDecision,
    beatIds: artRecord.beatIds,
    currentUserBeatExceptionReceiptSha256,
  };
  validateCanonicalCopyDeckReceipt(copyValue, Buffer.from(copyDeck), {
    selectedRegister: artRecord.decision.selectedRegister,
    motionDecision: artRecord.decision.motionDecision,
    beatIds: artRecord.beatIds,
    currentUserBeatExceptionReceiptSha256,
  });
  const copy = receipt(root, 'copy', COPY_DECK_RECEIPT_SCHEMA_VERSION, copyValue);
  let renderedBeats: Record<string, string>;
  const buildIdentity = receipt(root, 'build', 'omd-build-identity-v1', { schemaVersion: 'omd-build-identity-v1', packageVersion: '1.0.0', buildSha256: activationValue.buildSha256, sourceSkillSha256: activationValue.loadedSkillSha256 });
  const firstValue = { schema: 'observation-v2', buildSha256: activationValue.buildSha256, predecessorSha256: null, observedAt: '2026-01-01T00:00:00.000Z' };
  const first = receipt(root, 'observation-1', 'observation-v2', firstValue);
  const secondValue = { schema: 'observation-v2', buildSha256: activationValue.buildSha256, predecessorSha256: sha(canonical(firstValue)), observedAt: '2026-01-01T00:01:00.000Z' };
  const second = receipt(root, 'observation-2', 'observation-v2', secondValue);
  const lane = (name: string, schema: string) => receipt(root, name, schema, { schema, artDirectionSha256: artDirectionSemantic, buildSha256: activationValue.buildSha256, isolationReceipt: { schema: 'reviewer-isolation-v1', sha256: sha(`${name}-isolation`) }, verdicts: { independentVisual: 'GREEN', independentProtocol: 'GREEN' }, criticalFloors: { fidelity: 3 }, quorum: { required: 2, passed: 2 }, provenance: { observationSha256s: [sha(canonical(firstValue)), sha(canonical(secondValue))], reviewerIds: ['reviewer-a', 'reviewer-b'] } });
  const staticRunId = activationValue.buildSha256;
  const staticEvidencePath = (...parts: string[]): string => join('.omd', 'static-evidence', ...parts);
  const staticEvidenceOutput = (...parts: string[]): string => join(root, staticEvidencePath(...parts));
  mkdirSync(staticEvidenceOutput(), { recursive: true });
  const staticSource = join(root, 'static-evidence.html');
  writeFileSync(staticSource, '<!doctype html><style>body{margin:0;background:#123;color:white}main{min-height:900px;padding:40px}</style><main data-omd-beat="B-1">Browser-observed static direction</main>');
  const staticAdapter = createTestProjectWriteAdapter(root);
  const capture = async (name: string, width: number, height: number) => {
    const path = staticEvidencePath(`${name}.png`);
    const output = staticEvidenceOutput(`${name}.png`);
    await renderPage(staticSource, { viewport: { width, height }, out: output, adapter: staticAdapter });
    return { path, sha256: sha(readFileSync(output)) };
  };
  const temporal = async (name: string, width: number, height: number) => {
    const frames = await renderFilmstrip(staticSource, { viewport: { width, height }, out: staticEvidenceOutput(`${name}.html`), frames: 4, interval: 350, adapter: staticAdapter });
    return frames.slice(0, 3).map((output) => ({ path: relative(root, output), sha256: sha(readFileSync(output)) })) as [{ path: string; sha256: string }, { path: string; sha256: string }, { path: string; sha256: string }];
  };
  const desktopObserved = await capture('desktop', 1280, 900);
  const mobileObserved = await capture('mobile', 390, 844);
  const desktopTemporal = await temporal('desktop-temporal', 1280, 900);
  const mobileTemporal = await temporal('mobile-temporal', 390, 844);
  const observedSha256 = sha(JSON.stringify([desktopObserved, mobileObserved, ...desktopTemporal, ...mobileTemporal].map((observation) => observation.sha256)));
  const staticBeatReceipt = await captureRenderedBeatReceipt(staticSource, { adapter: staticAdapter, out: staticEvidenceOutput('rendered-beats.json'), artDirectionHash: artDirectionSemantic, copyDeckSha256: copyValue.copyDeckSha256, beatIds: artRecord.beatIds });
  const review = (role: 'signature' | 'narrative' | 'motionFit' | 'fidelity' | 'fallback' | 'blind', actor: 'host-reviewer' | 'host-evaluator') => {
    const path = staticEvidencePath(`${role}-${actor}.json`);
    const output = staticEvidenceOutput(`${role}-${actor}.json`);
    const value = { schema: 'static-review-receipt-v1', role, actor, verdict: 'pass', artDirectionHash: artDirectionSemantic, buildHash: activationValue.buildSha256, selectionSha256: selectionSemantic, handoffSha256: handoffValue.payloadSha256, observedSha256 };
    writeFileSync(output, JSON.stringify(value));
    return { path, sha256: sha(readFileSync(output)) };
  };
  const staticEvidence = receipt(root, 'static', 'static-direction-evidence-v1', {
    schema: 'static-direction-evidence-v1',
    artDirectionHash: artDirectionSemantic,
    motionDecision: 'none',
    expected: { artDirectionHash: artDirectionSemantic, selectionSha256: selectionSemantic, handoffSha256: handoffValue.payloadSha256, buildHash: activationValue.buildSha256, runId: staticRunId },
    observed: { runId: staticRunId, buildHash: activationValue.buildSha256, selectionSha256: selectionSemantic, handoffSha256: handoffValue.payloadSha256, observedSha256 },
    beatReceipt: staticBeatReceipt,
    observations: { desktop: { capture: desktopObserved, width: 1280, height: 900 }, mobile: { capture: mobileObserved, width: 390, height: 844 }, temporalSamples: { desktop: desktopTemporal, mobile: mobileTemporal } },
    reviewReceipts: { signature: review('signature', 'host-reviewer'), narrative: review('narrative', 'host-evaluator'), motionFit: review('motionFit', 'host-reviewer'), fidelity: review('fidelity', 'host-evaluator'), fallback: review('fallback', 'host-reviewer'), blind: review('blind', 'host-evaluator') },
  });
  renderedBeats = receipt(root, 'beats', 'rendered-beat-receipt-v1', staticBeatReceipt);
  writeFileSync(join(root, '.omd', 'type-proof.md'), 'type-proof');
  writeFileSync(join(root, '.omd', 'composition.md'), 'composition');
  writeFileSync(join(root, 'brief.js'), 'brief');
  writeFileSync(join(root, 'skill.js'), 'skill');
  publishValidTaskEvidence(root);
  const taskEvidence = {
    path: join('.omd', 'task-evidence.json'),
    schema: 'task-evidence-v1',
    sha256: sha(readFileSync(join(root, '.omd', 'task-evidence.json'))),
  };
  const blindLane = lane('blind', 'blind-review-v1');
  const fidelityLane = lane('fidelity', 'fidelity-review-v1');
  const protocolLane = lane('protocol', 'protocol-review-v1');
  writeSourceSeal(root, createTestProjectRunInvocation(root));
  const sourceSeal = {
    path: join('.omd', 'source-seal.json'),
    schema: 'source-seal-v1',
    sha256: sha(readFileSync(join(root, '.omd', 'source-seal.json'))),
  };
  const graph = { schema: 'final-evidence-v2-graph', activation, intent, artDirection, board, selection, settledSelection, handoff, usage, copy, renderedBeats, sourceSeal, buildIdentity, blindLane, fidelityLane, protocolLane, taskEvidence, observations: [first, second] };
  return motionDecision === 'one'
    ? { schema: 'final-evidence-v2', motionDecision, graph, motionEvidence: receipt(root, 'motion', 'motion-evidence-v2', { schema: 'motion-evidence-v2', artDirectionHash: artDirectionSemantic, motionDecision: 'one', observed: {}, scenes: [] }) }
    : { schema: 'final-evidence-v2', motionDecision, graph, staticEvidence };
};
const finalizationAuthorizations = (root: string, input: string): { purpose: string; payload: Buffer }[] => {
  const manifestBytes = readFileSync(input);
  const value = JSON.parse(manifestBytes.toString('utf8')) as Record<string, unknown>;
  const graph = value.graph as Record<string, { path: string }>;
  const graphRootHash = sha(canonical({
    graph: validateFinalEvidenceV2Graph(graph),
    currentFrameSha256: sha(readFileSync(join(root, '.omd', 'frame.md'))),
  }));
  const authorizations = [
    { purpose: 'final-evidence-manifest', payload: manifestBytes },
    { purpose: 'final-evidence-manifest', payload: Buffer.from(canonicalPayload({ ...value, graphRootHash })) },
    { purpose: 'current-intent-ledger', payload: readFileSync(join(root, graph.intent!.path)) },
    ...['blindLane', 'fidelityLane', 'protocolLane'].map((lane) => ({ purpose: 'final-reviewer-lane', payload: readFileSync(join(root, graph[lane]!.path)) })),
  ];
  const staticEvidence = value.staticEvidence as { path: string } | undefined;
  if (staticEvidence === undefined) return authorizations;
  const staticBytes = readFileSync(join(root, staticEvidence.path));
  const staticValue = JSON.parse(staticBytes.toString('utf8')) as { reviewReceipts: Record<string, { path: string }> };
  return [
    ...authorizations,
    { purpose: 'static-evidence-result', payload: staticBytes },
    ...Object.values(staticValue.reviewReceipts).map(({ path }) => ({ purpose: 'static-review-receipt', payload: readFileSync(join(root, path)) })),
  ];
};
const finalize = (root: string, input: string, authorizations = finalizationAuthorizations(root, input)): Promise<{ status: number | null; stdout: string; stderr: string }> => {
  const invocation = JSON.parse(readFileSync(join(root, 'invocation.json'), 'utf8')) as Parameters<typeof runMutation>[2];
  return runMutation(root, ['evidence', 'v2', 'finalize', '--input', input, '--activation', join(root, 'invocation.json')], invocation, authorizations);
};
const checkAuthorizations = (root: string): { purpose: string; payload: Buffer }[] => {
  const pointer = readFileSync(join(root, '.omd', 'final-evidence-v2.json'));
  const { record } = JSON.parse(pointer.toString('utf8')) as { record: string };
  const recordBytes = readFileSync(join(root, '.omd', 'final-evidence-v2-runs', record));
  const value = JSON.parse(recordBytes.toString('utf8')) as Record<string, unknown>;
  const graph = value.graph as Record<string, { path: string }>;
  return [
    { purpose: 'final-reviewer-lane', payload: pointer },
    { purpose: 'final-evidence-manifest', payload: recordBytes },
    { purpose: 'current-intent-ledger', payload: readFileSync(join(root, graph.intent!.path)) },
    ...['blindLane', 'fidelityLane', 'protocolLane'].map((lane) => ({ purpose: 'final-reviewer-lane', payload: readFileSync(join(root, graph[lane]!.path)) })),
    ...(() => {
      const staticEvidence = value.staticEvidence as { path: string } | undefined;
      if (staticEvidence === undefined) return [];
      const staticBytes = readFileSync(join(root, staticEvidence.path));
      const staticValue = JSON.parse(staticBytes.toString('utf8')) as { reviewReceipts: Record<string, { path: string }> };
      return [
        { purpose: 'static-evidence-result', payload: staticBytes },
        ...Object.values(staticValue.reviewReceipts).map(({ path }) => ({ purpose: 'static-review-receipt', payload: readFileSync(join(root, path)) })),
      ];
    })(),
  ];
};
const staticCheckInput = (root: string): { invocation: Parameters<typeof runMutation>[2]; capture: Record<string, unknown>; reviewReceipts: Record<string, { path: string }> } => {
  const invocation = JSON.parse(readFileSync(join(root, 'invocation.json'), 'utf8')) as Parameters<typeof runMutation>[2];
  const { record } = JSON.parse(readFileSync(join(root, '.omd', 'art-direction.json'), 'utf8')) as { record: string };
  const direction = JSON.parse(readFileSync(join(root, '.omd', record), 'utf8')) as { decision: { motionDecision: string } };
  assert.equal(direction.decision.motionDecision, 'none');
  const staticReceipt = JSON.parse(readFileSync(join(root, '.omd', 'receipts', 'static.json'), 'utf8')) as Record<string, unknown>;
  return {
    invocation,
    capture: staticReceipt,
    reviewReceipts: staticReceipt.reviewReceipts as Record<string, { path: string }>,
  };
};
const staticCheckAuthorizations = (root: string, input: ReturnType<typeof staticCheckInput>): { purpose: string; payload: Buffer }[] => {
  const evidence = { ...input.capture, schema: 'static-direction-evidence-v1', reviewReceipts: input.reviewReceipts };
  return [
    { purpose: 'static-evidence-result', payload: Buffer.from(canonicalPayload(evidence)) },
    ...Object.values(input.reviewReceipts).map(({ path }) => ({ purpose: 'static-review-receipt', payload: readFileSync(join(root, path)) })),
  ];
};

function writeManifest(root: string, name: string, value: unknown): string {
  const path = join(root, name);
  writeFileSync(path, JSON.stringify(value));
  return path;
}
function writeFinalEvidenceManifest(root: string, name: string, value: unknown): string {
  const path = join(root, name);
  writeFileSync(path, canonicalPayload(value));
  return path;
}

function publishValidTaskEvidence(root: string): void {
  const frame = '---\nuxTask: Save the edited document\nuxFrequentAction: Save document changes\nuxCostliestError: Lose an unsaved document edit\nuxSurface: product\n---\n\n## Task coverage matrix\n\nT1 | goal: save | start: editor | actions: edit | success: saved | recovery: retry | viewports: desktop, mobile | requirements: none\n';
  const composition = '## UX task coverage\n\nT1 | production: /editor | locator: #save |\n';
  writeFileSync(join(root, '.omd', 'frame.md'), frame);
  writeFileSync(join(root, '.omd', 'composition.md'), composition);
  mkdirSync(join(root, '.omd', '.cache'), { recursive: true });
  const put = (name: string, value: unknown) => { const bytes = Buffer.from(JSON.stringify(value)); const path = `.omd/.cache/${name}`; writeFileSync(join(root, path), bytes); return { path, sha256: sha(bytes) }; };
  const probe = (name: string, recovery: boolean) => ({ name, destructive: false, steps: [...(recovery ? [{ action: 'fill', selector: '#title', value: 'Recovered title', expect: [{ type: 'attribute', selector: '#title', name: 'value', value: 'Recovered title' }] }] : []), { action: 'click', selector: '#save', expect: [{ type: 'visible', selector: '#save' }] }, { action: 'click', selector: '#saved', expect: [{ type: 'text', selector: '#saved', value: 'Saved' }] }] });
  const evidenceProbe = (role: 'primary' | 'recovery', viewport: 'desktop' | 'mobile', recovery: boolean) => { const dimensions = viewport === 'desktop' ? { width: 1280, height: 900 } : { width: 390, height: 844 }; const value = probe(`${role} save ${viewport}`, recovery); const prefix = `task-${role}-${viewport}`; const plan = put(`${prefix}-plan.json`, value); const result = put(`${prefix}-result.json`, { name: value.name, target: 'http://localhost/editor', viewport: dimensions, steps: value.steps.map(step => ({ action: step.action, selector: step.selector, ...(step.action === 'fill' ? { value: step.value } : {}), ok: true, expectations: step.expect.map(expectation => ({ ...expectation, ok: true })) })), warnings: [] }); return { planPath: plan.path, planSha256: plan.sha256, resultPath: result.path, resultSha256: result.sha256, role, viewport }; };
  const desktop = screenshot(1280, 900); const mobile = screenshot(390, 844);
  const desktopPath = '.omd/.cache/task-desktop.png'; const mobilePath = '.omd/.cache/task-mobile.png';
  writeFileSync(join(root, desktopPath), desktop); writeFileSync(join(root, mobilePath), mobile);
  const evidence = { schemaVersion: 1, surface: 'product', frame: { path: '.omd/frame.md', sha256: sha(frame) }, composition: { path: '.omd/composition.md', sha256: sha(composition) }, tasks: [{ id: 'T1', context: 'production', production: { route: '/editor', locator: '#save', workObject: 'document' }, probes: [evidenceProbe('primary', 'desktop', false), evidenceProbe('primary', 'mobile', false), evidenceProbe('recovery', 'desktop', true), evidenceProbe('recovery', 'mobile', true)], renders: [{ path: desktopPath, sha256: sha(desktop), viewport: 'desktop' }, { path: mobilePath, sha256: sha(mobile), viewport: 'mobile' }] }] };
  const input = join(root, '.omd', '.cache', 'task-evidence-manifest.json');
  writeFileSync(input, JSON.stringify(evidence));
  publishTaskEvidence(root, input, createTestProjectRunInvocation(root));
}
test('doctor and preflight are read-only', () => {
  const root = project();
  const activation = writeManifest(root, 'activation.json', {
    schemaVersion: 'activation-context-v2', buildSha256: sha('build'), loadedSkillSha256: sha('skill'), briefSha256: sha('brief'),
    hostCapability: { host: 'local' },
  });
  assert.equal(existsSync(join(root, '.omd')), false);
  const doctor = run(root, ['doctor']);
  assert.ok(doctor.status === 0 || doctor.status === 1);
  assert.equal(run(root, ['preflight', '--input', activation]).status, 0);
  assert.equal(existsSync(join(root, '.omd')), false);
});
test('art direction rejects over-budget Beat sets before settlement and accepts a host-authorized exception', async () => {
  for (const [selectedRegister, count] of [['quiet', 6], ['confident', 8]] as const) {
    const root = project();
    const result = await manifest(root, 'none', {
      selectedRegister,
      beats: Array.from({ length: count }, (_, index) => `B-${index + 1}`),
      stopAfterArtDirection: true,
    });
    assert.notEqual(result.directed.status, 0);
    assert.match(result.directed.stderr, /ART_DIRECTION_BEAT_BUDGET_EXCEEDED/);
    assert.equal(existsSync(join(root, '.omd', 'motion-resolutions')), false);
    assert.equal(existsSync(join(root, '.omd', 'settled-reference-selections')), false);
    assert.equal(existsSync(join(root, '.omd', 'art-direction.json')), false);
  }

  const root = project();
  const beats = Array.from({ length: 6 }, (_, index) => `B-${index + 1}`);
  const result = await manifest(root, 'none', {
    beats,
    beatException: true,
    stopAfterArtDirection: true,
  });
  assert.equal(result.directed.status, 0, result.directed.stderr);
  const pointer = JSON.parse(readFileSync(join(root, '.omd', 'art-direction.json'), 'utf8')) as { record: string };
  const record = JSON.parse(readFileSync(join(root, '.omd', pointer.record), 'utf8')) as {
    beatIds: string[];
    decision: { currentUserBeatExceptionReceiptSha256: string };
  };
  const intentPointer = JSON.parse(readFileSync(join(root, '.omd', 'intent-current.json'), 'utf8')) as { record: string };
  const ledger = JSON.parse(readFileSync(join(root, '.omd', intentPointer.record), 'utf8'));
  assert.deepEqual(record.beatIds, beats);
  assert.equal(record.decision.currentUserBeatExceptionReceiptSha256, resolveCurrentUserBeatExceptionReceipt(ledger));
  assert.notEqual(record.decision.currentUserBeatExceptionReceiptSha256, NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256);
});

test('invalid none and one manifests cannot publish', async () => {
  for (const [name, kind] of [['none.json', 'none'], ['one.json', 'one']] as const) {
    const root = project(); const invalid = await manifest(root, kind);
    if (kind === 'none') delete invalid.staticEvidence; else delete invalid.motionEvidence;
    const input = writeFinalEvidenceManifest(root, name, invalid);
    assert.notEqual((await finalize(root, input)).status, 0);
    assert.equal(existsSync(join(root, '.omd', 'final-evidence-v2.json')), false);
  }
});

test('legacy finalize errors before any v1 publication write', () => {
  const root = project();
  const result = run(root, ['evidence', 'finalize', '--input', join(root, 'missing.json')]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LEGACY_PUBLICATION_DISABLED/);
  assert.equal(existsSync(join(root, '.omd')), false);
});

test('v2 pointer check ignores orphan records', async () => {
  const root = project();
  const value = await manifest(root); const input = writeFinalEvidenceManifest(root, '.omd/manifest.json', value);
  const staleManifestAuthorization = finalizationAuthorizations(root, input);
  writeFileSync(input, `${readFileSync(input, 'utf8')} `);
  const alteredFinalize = await finalize(root, input, staleManifestAuthorization);
  assert.notEqual(alteredFinalize.status, 0);
  writeFileSync(input, canonicalPayload(value));
  const finalized = await finalize(root, input);
  assert.equal(finalized.status, 0, finalized.stderr);
  const runs = join(root, '.omd', 'final-evidence-v2-runs');
  const orphan = `${canonical({ unrelated: true })}\n`;
  writeFileSync(join(runs, `sha256-${sha(orphan)}.json`), orphan);
  assert.notEqual(run(root, ['evidence', 'v2', 'check']).status, 0);
  const invocation = JSON.parse(readFileSync(join(root, 'invocation.json'), 'utf8'));
  const checked = await runMutation(root, ['evidence', 'v2', 'check', '--activation', join(root, 'invocation.json')], invocation, checkAuthorizations(root));
  assert.equal(checked.status, 0, checked.stderr);
  const altered = checkAuthorizations(root).map((authorization, index) => index === 0
    ? { ...authorization, payload: Buffer.concat([authorization.payload, Buffer.from('altered')]) }
    : authorization);
  const alteredCheck = await runMutation(root, ['evidence', 'v2', 'check', '--activation', join(root, 'invocation.json')], invocation, altered);
  assert.notEqual(alteredCheck.status, 0);
});
test('static-check accepts exact receipt-v2 review authorizations for the current lineage', async () => {
  const root = project();
  const value = await manifest(root);
  assert.equal(value.motionDecision, 'none');
  const input = staticCheckInput(root);
  const path = writeManifest(root, 'static-check.json', input);
  const checked = await runMutation(root, ['evidence', 'static-check', '--input', path], input.invocation, staticCheckAuthorizations(root, input));
  assert.equal(checked.status, 0, checked.stderr);
});

test('motion capture rejects mutually exclusive reference and recipe inputs before capture', async () => {
  const root = project();
  await manifest(root);
  const invocation = JSON.parse(readFileSync(join(root, 'invocation.json'), 'utf8')) as { activation: { hostCapability: { host: 'claude' | 'codex' }; buildSha256: string; loadedSkillSha256: string; briefSha256: string } };
  const input = writeManifest(root, 'motion-capture.json', {
    target: join(root, 'static-evidence.html'),
    outDir: join(root, '.omd', 'motion-evidence'),
    runId: invocation.activation.buildSha256,
    selector: '#hero',
    trigger: 'load',
    invocation,
    referenceSlotId: 'static',
    approvedRecipe: { recipeId: 'fade-in', recipeSha256: sha('recipe') },
  });
  const captured = await runMutation(root, ['evidence', 'motion-capture', '--input', input], invocation);
  assert.notEqual(captured.status, 0);
  assert.match(captured.stderr, /exactly one settled referenceSlotId or approvedRecipe/);
});
test('recipe-backed one derives its receipt projection from the authorized evaluator result', async () => {
  const root = project();
  try {
    await manifest(root);
    const invocation = JSON.parse(readFileSync(join(root, 'invocation.json'), 'utf8')) as {
      activation: { hostCapability: { host: 'claude' | 'codex' }; buildSha256: string; loadedSkillSha256: string; briefSha256: string };
    };
    const referenceId = refIdentity('https://capture.example/hero', 'hero');
    writeFileSync(join(root, '.omd', 'reference-board.json'), JSON.stringify({
      schemaVersion: 'reference-board-v1',
      frameSha256: sha('frame'),
      candidates: [{
        id: 'recipe-candidate',
        label: 'Recipe candidate',
        route: '/',
        rationale: 'Lawful static and motion evidence',
        pieces: [
          { slotId: 'static', sourceKind: 'component-capture', referenceId, targetComponent: 'Hero', targetSelector: '#hero', taskIds: ['T1'], reason: 'Use structure', take: ['structure'], avoid: 'Avoid copying', adaptation: 'Adapt lawfully', evidenceAxes: { rights: 'lawful', signal: 'high-visual-system', staticAxis: 'available', motionAxis: 'absent' }, grid: { column: 1, span: 6, order: 0 } },
          { slotId: 'motion', sourceKind: 'component-capture', referenceId, targetComponent: 'Hero', targetSelector: '#hero', taskIds: ['T1'], reason: 'Use motion timing', take: ['motion'], avoid: 'Avoid copying', adaptation: 'Adapt lawfully', evidenceAxes: { rights: 'lawful', signal: 'high-motion', staticAxis: 'absent', motionAxis: 'available' }, grid: { column: 7, span: 6, order: 1 } },
        ],
      }],
    }));
    const selected = await runMutation(root, ['ref', 'select', 'recipe-candidate', '--activation', join(root, 'invocation.json')], invocation);
    assert.equal(selected.status, 0, selected.stderr);

    const alternatives = (['quiet', 'confident', 'showpiece'] as const).map((register) => ({
      register,
      subjectIdentityFit: `${register} framing fits the subject.`,
      staticReferenceSlotIds: ['static'],
      motionReferenceSlotIds: ['motion'],
      conceptRole: `${register} transition`,
      macroCompositionHypothesis: 'Template-breaking asymmetric editorial departure.',
      motionHypothesis: 'one' as const,
      uxAccessibilityPerformanceRisks: ['Reduced motion remains available.'],
      lawfulImplementationPath: 'CSS and SVG implementation.',
      rejectionCondition: 'Another documented direction better fits the evidence.',
    }));
    const assessment = { assessments: alternatives.map((alternative, index) => ({
      register: alternative.register,
      score: 3 - index,
      subjectIdentityRationale: `${alternative.register} subject assessment.`,
      conceptRoleRationale: `${alternative.register} role assessment.`,
      uxAccessibilityPerformanceRationale: `${alternative.register} accessibility assessment.`,
      lawfulFeasibilityRationale: `${alternative.register} lawful assessment.`,
      referenceEvidenceRationale: `${alternative.register} evidence assessment.`,
      rejectionRationale: `${alternative.register} ranking assessment.`,
    })) };
    const recipe = { kind: 'fade-in', durationMs: 240 };
    const recipeBytes = canonicalPayload(recipe);
    const recipeSha256 = sha(recipeBytes);
    const projection = recipeDecisionProjectionSha256({
      alternativesSha256: sha(canonicalPayload(alternatives)),
      winner: 'quiet',
      motionDecision: 'one',
      slots: [{ slotId: 'motion', obligationDisposition: 'rejected' }],
      approvedRecipe: { recipeId: 'fade-in', recipeSha256 },
    });
    const receipt = {
      recipeId: 'fade-in',
      recipeBytes,
      recipeSha256,
      activationSha256: artDirectionSha256(invocation.activation),
      buildSha256: invocation.activation.buildSha256,
      decisionSha256: projection,
    };
    const evaluatorResult = {
      winner: 'quiet',
      alternativesSha256: sha(canonicalPayload(alternatives)),
      motionResolution: {
        motionDecision: 'one',
        slots: [{ slotId: 'motion', obligationDisposition: 'rejected', obligationReason: 'The evaluator selected the approved recipe.' }],
        approvedRecipe: { recipeId: 'fade-in', recipeSha256 },
      },
      approvedMotionRecipe: recipe,
      approvedMotionRecipeReceipt: receipt,
    };
    const runRecipe = async (result: Record<string, unknown>) => {
      const input = writeManifest(root, 'recipe-art-direction.json', {
        invocation,
        route: '/',
        alternatives,
        references: [
          { slotId: 'static', signal: 'high-visual-system', positive: true, lawful: true, motionObligation: 'none' },
          { slotId: 'motion', signal: 'high-motion', positive: true, lawful: true, motionObligation: 'none' },
        ],
        evaluatorAssessment: assessment,
        evaluatorResult: result,
        eligibility: { sceneRoles: ['launch transition'], fallbackAttempted: true },
        beats: ['B-1'],
        implementationLane: 'browser',
        fallbackPath: 'CSS/SVG static reduced-motion fallback.',
        performanceAccessibilityBudget: 'Within the declared accessibility and performance budget.',
      });
      return runMutation(root, ['art-direction', 'check', '--input', input], invocation, [
        { purpose: 'evaluator-assessment', payload: canonicalPayload(assessment) },
        { purpose: 'evaluator-result', payload: canonicalPayload(result) },
        { purpose: 'approved-motion-recipe', payload: recipeBytes },
        { purpose: 'current-intent-ledger', payload: readFileSync(join(root, '.omd', (JSON.parse(readFileSync(join(root, '.omd', 'intent-current.json'), 'utf8')) as { record: string }).record)) },
      ]);
    };
    const valid = await runRecipe(evaluatorResult);
    assert.equal(valid.status, 0, valid.stderr);
    const staleProjection = await runRecipe({ ...evaluatorResult, approvedMotionRecipeReceipt: { ...receipt, decisionSha256: sha('stale-projection') } });
    assert.notEqual(staleProjection.status, 0);
    assert.match(staleProjection.stderr, /RECIPE_RECEIPT_STALE/);
    const staleBytes = await runRecipe({ ...evaluatorResult, approvedMotionRecipeReceipt: { ...receipt, recipeBytes: canonicalPayload({ kind: 'fade-in', durationMs: 241 }) } });
    assert.notEqual(staleBytes.status, 0);
    assert.match(staleBytes.stderr, /RECIPE_RECEIPT_STALE/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('source drift fails source check after a valid snapshot', async () => {
  const root = project(); try {
    const value = await manifest(root);
    const input = writeFinalEvidenceManifest(root, '.omd/manifest.json', value);
    const finalized = await finalize(root, input);
    assert.equal(finalized.status, 0, finalized.stderr);
    writeFileSync(join(root, 'brief.js'), 'brief changed');
    const result = run(root, ['source', '--check']);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /SOURCE-SEAL-STALE brief\.js: brief\.js was added, removed, or changed after source seal/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('production CLI rejects stale current intent and art-direction bindings after a valid snapshot', async () => {
  for (const mutate of [
    (root: string) => {
      const pointer = JSON.parse(readFileSync(join(root, '.omd', 'intent-current.json'), 'utf8')) as { record: string };
      writeFileSync(join(root, '.omd', 'intent-current.json'), JSON.stringify({ schemaVersion: 'intent-current-v2', record: pointer.record, sha256: sha('other') }));
    },
    (root: string) => {
      const pointer = JSON.parse(readFileSync(join(root, '.omd', 'intent-current.json'), 'utf8')) as { record: string };
      writeFileSync(join(root, '.omd', pointer.record), JSON.stringify({ schemaVersion: 'intent-ledger-v1', events: [], currentEventId: 'stale' }));
    },
    (root: string) => {
      const pointer = JSON.parse(readFileSync(join(root, '.omd', 'art-direction.json'), 'utf8')) as { record: string };
      writeFileSync(join(root, '.omd', 'art-direction.json'), JSON.stringify({ schemaVersion: 'art-direction-current-v2', record: pointer.record, sha256: sha('other') }));
    },
    (root: string) => {
      const pointer = JSON.parse(readFileSync(join(root, '.omd', 'art-direction.json'), 'utf8')) as { record: string };
      writeFileSync(join(root, '.omd', pointer.record), JSON.stringify({ schemaVersion: 'art-direction-record-v2', changed: true }));
    },
  ]) {
    const root = project(); try {
      const value = await manifest(root); const input = writeFinalEvidenceManifest(root, '.omd/manifest.json', value);
      const finalized = await finalize(root, input);
      assert.equal(finalized.status, 0, finalized.stderr);
      mutate(root);
      const result = await runMutation(root, ['evidence', 'v2', 'check', '--activation', join(root, 'invocation.json')], JSON.parse(readFileSync(join(root, 'invocation.json'), 'utf8')), checkAuthorizations(root));
      assert.notEqual(result.status, 0);
      assert.match(`${result.stdout}${result.stderr}`, /STALE|invalid|could not read|hash changed|not the current/i);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});
test('intent CAS and canonical selection and handoff currentness fail closed', async () => {
  const root = project(); await manifest(root);
  const staleEvent = { eventId: 'stale-cas', currentUser: true, kind: 'explicit-intent', lock: { register: 'quiet' }, recordedAt: '2026-01-01T00:00:01.000Z' };
  const staleIntent = writeManifest(root, 'stale-intent.json', { invocation: JSON.parse(readFileSync(join(root, 'invocation.json'), 'utf8')), event: staleEvent, expectedCurrentSha256: null });
  const cas = await runMutation(root, ['intent', 'append', '--input', staleIntent], JSON.parse(readFileSync(join(root, 'invocation.json'), 'utf8')), [{ purpose: 'current-user-intent-event', payload: canonicalPayload(staleEvent) }]);
  assert.notEqual(cas.status, 0); assert.match(cas.stderr, /CAS_MISMATCH/);
  const selectionPath = join(root, '.omd', 'reference-selection-v2.json');
  writeFileSync(selectionPath, JSON.stringify({ schemaVersion: 'reference-selection-v2', captureSha256: sha('stale'), assemblySha256: sha('stale'), projectionSha256: sha('stale'), candidateId: 'candidate', slots: [] }));
  const staleSelection = run(root, ['ref', 'v2-check', '--input', join(root, '.omd', 'reference-handoffs', 'art-direction.json')]);
  assert.notEqual(staleSelection.status, 0);
  writeFileSync(join(root, '.omd', 'reference-handoffs', 'art-direction.json'), JSON.stringify({ schemaVersion: 'reference-handoff-v2', role: 'art-direction', captureSha256: sha('stale'), assemblySha256: sha('stale'), projectionSha256: sha('stale'), selectionSha256: sha('stale'), positiveMotion: { slots: [] }, payloadSha256: sha('stale') }));
  const staleHandoff = run(root, ['ref', 'v2-check', '--input', join(root, '.omd', 'reference-handoffs', 'art-direction.json')]);
  assert.notEqual(staleHandoff.status, 0);
});

test('reference distance is advisory and cannot become a publication gate', () => {
  const source = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
  assert.match(readFileSync(source, 'utf8'), /tooClose[\s\S]*process\.exit\(0\)/);
});
test('composition v2 gate rejects missing and legacy art-direction artifacts', () => {
  const root = project();
  assert.notEqual(run(root, ['composition', '--check']).status, 0);
  mkdirSync(join(root, '.omd'), { recursive: true });
  writeFileSync(join(root, '.omd', 'art-direction.json'), JSON.stringify({ schemaVersion: 'art-direction-v1' }));
  assert.notEqual(run(root, ['composition', '--check']).status, 0);
});
