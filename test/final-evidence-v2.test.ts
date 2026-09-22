import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync, writeSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import test from 'node:test';
import { checkFinalEvidenceV2 as guardedCheckFinalEvidenceV2, garbageCollectFinalEvidenceV2 as guardedGarbageCollectFinalEvidenceV2, publishFinalEvidenceV2 as guardedPublishFinalEvidenceV2, recoverFinalEvidenceV2Lock as guardedRecoverFinalEvidenceV2Lock, validateFinalEvidenceV2Manifest, FINAL_EVIDENCE_V2_GC_TTL_MS, type FinalEvidenceV2Manifest } from '../core/evidence/final-v2.ts';
import { publishTaskEvidence } from '../core/evidence/task.ts';
import { validateFinalEvidenceV2GraphFiles, type ArtifactReceipt } from '../core/evidence/final-v2-graph.ts';
import { parseReferenceHandoffReceipt, referenceHandoffPayloadSha256, writeReferenceHandoffReceipt, type ReferenceHandoffReceipt } from '../core/ref/reference-handoff.ts';
import { materializeSettledReferenceSelection, motionResolutionProjectionSha256, referenceSelectionV2Sha256, resolveMotionProjection, selectReferenceCandidateV2, type MotionResolutionProjection, type ReferenceSelectionV2 } from '../core/ref/reference-selection.ts';
import { refIdentity } from '../core/ref/identity.ts';
import { refImagePath, saveRef } from '../core/ref/store.ts';
import { createSourceSeal } from '../core/source-seal/index.ts';
import { LEGACY_ART_DIRECTION_RECORD_SCHEMA_VERSION, artDirectionSha256 } from '../core/art-direction/schema.ts';
import { NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256 } from '../core/art-direction/decision.ts';
import { EvidenceClaimError, type EvidenceClaimPublication } from '../core/brief/evidence-claims.ts';
import { COPY_DECK_RECEIPT_SCHEMA_VERSION, copyDeckSha256, validateCanonicalCopyDeckReceipt } from '../core/copy/index.ts';
import { CURRENT_COMPOSITION_SECTIONS } from '../core/composition-contract/index.ts';
import { DESIGN_QUALITY_AXES } from '../core/evidence/final-v2-design-quality.ts';
import { INTENT_CURRENT_POINTER_SCHEMA_VERSION, appendExplicitIntent, intentLedgerSha256, resolveCurrentUserBeatExceptionReceipt, type IntentLedger } from '../core/runtime/intent.ts';
import { captureMotionEvidenceV2, validateMotionEvidenceV2 } from '../core/render/index.ts';
import { authorizeTestProjectRunPayloads, authorizeTestTaskEvidencePayloads, createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { createProjectWriteAdapter, requireProjectWriteAdapter, writeProjectFile } from '../core/runtime/project-write.ts';
import { observationV2Sha256, readCurrentObservationV2, redactObservationEvidence, writeObservationV2 } from '../core/runtime/observation.ts';
import { retainObservationV2 } from '../core/runtime/observation-retention.ts';
import { writeBrowserDecisionFixture } from './helpers/browser-observation-decision-links.ts';
import { registerFinalBrowserObservationCases } from './helpers/browser-observation-final-v2-cases.ts';
import { attestLegacyV1AsV2 } from '../core/migration/attest-v2.ts';
import { parseReferenceUsageV2, referenceUsageV2Sha256 } from '../core/ref/reference-usage-snapshot.ts';

const finalEvidenceInvocation = (directory: string) => createTestProjectRunInvocation(directory, 'brief');
const finalEvidenceGraphFilesystem = { readFile: readFileSync, lstat: lstatSync, open: openSync, fstat: fstatSync, close: closeSync };
function finalEvidenceGraphAuthorizations(directory: string, manifest: FinalEvidenceV2Manifest): { purpose: 'current-intent-ledger' | 'final-reviewer-lane' | 'motion-evidence' | 'motion-result' | 'product-capture-result' | 'product-probe-result' | 'rendered-beat-result' | 'static-evidence-result' | 'static-review-receipt'; payload: Buffer }[] {
  const laneAuthorizations = (['blindLane', 'fidelityLane', 'protocolLane'] as const).flatMap((lane) => {
    const laneBytes = readFileSync(resolve(directory, manifest.graph[lane].path));
    const laneValue = JSON.parse(laneBytes.toString('utf8')) as { executionReceipts: Array<{ path: string }> };
    return [
      { purpose: 'final-reviewer-lane' as const, payload: laneBytes },
      ...laneValue.executionReceipts.map(({ path }) => ({ purpose: 'final-reviewer-lane' as const, payload: readFileSync(resolve(directory, path)) })),
    ];
  });
  const taskAuthorizations = manifest.graph.taskEvidence === undefined ? [] : (() => {
    const taskEvidence = JSON.parse(readFileSync(resolve(directory, manifest.graph.taskEvidence.path), 'utf8')) as {
      tasks: Array<{
        probes: Array<{ resultPath: string }>;
        invalidSubmit?: { resultPath: string };
        renders: Array<{ authorization: unknown }>;
        transient?: Array<{ authorization: unknown }>;
      }>;
    };
    return [
      ...taskEvidence.tasks.flatMap((task) =>
        [...task.probes, ...(task.invalidSubmit === undefined ? [] : [task.invalidSubmit])].map((probe) => ({
          purpose: 'product-probe-result' as const,
          payload: readFileSync(resolve(directory, probe.resultPath)),
        })),
      ),
      ...taskEvidence.tasks.flatMap((task) =>
        [...task.renders, ...(task.transient ?? [])].map((capture) => ({
          purpose: 'product-capture-result' as const,
          payload: Buffer.from(canonical(capture.authorization)),
        })),
      ),
    ];
  })();
  const authorizations: { purpose: 'current-intent-ledger' | 'final-reviewer-lane' | 'motion-evidence' | 'motion-result' | 'product-capture-result' | 'product-probe-result' | 'rendered-beat-result' | 'static-evidence-result' | 'static-review-receipt'; payload: Buffer }[] = [
    { purpose: 'current-intent-ledger', payload: readFileSync(resolve(directory, manifest.graph.intent.path)) },
    ...laneAuthorizations,
    ...taskAuthorizations,
    { purpose: 'rendered-beat-result', payload: Buffer.from(`${canonical(JSON.parse(readFileSync(resolve(directory, manifest.graph.renderedBeats.path), 'utf8')))}\n`) },
  ];
  if (manifest.motionEvidence !== undefined) {
    const motionBytes = readFileSync(resolve(directory, manifest.motionEvidence.path));
    return [
      ...authorizations,
      { purpose: 'motion-evidence', payload: motionBytes },
      { purpose: 'motion-result', payload: Buffer.from(`${canonical(JSON.parse(motionBytes.toString('utf8')))}\n`) },
    ];
  }
  if (manifest.staticEvidence === undefined) return authorizations;
  const staticBytes = readFileSync(resolve(directory, manifest.staticEvidence.path));
  const staticEvidence = JSON.parse(staticBytes.toString('utf8')) as { reviewReceipts: Record<string, { path: string }> };
  return [
    ...authorizations,
    { purpose: 'static-evidence-result', payload: staticBytes },
    ...Object.values(staticEvidence.reviewReceipts).map(({ path }) => ({ purpose: 'static-review-receipt' as const, payload: readFileSync(resolve(directory, path)) })),
  ];
}
function publishFinalEvidenceV2As(directory: string, input: unknown, invocation: ReturnType<typeof finalEvidenceInvocation>): string {
  const submitted = validateFinalEvidenceV2Manifest(input);
  const preflightInvocation = finalEvidenceInvocation(directory);
  authorizeTestProjectRunPayloads(directory, preflightInvocation, finalEvidenceGraphAuthorizations(directory, submitted));
  const graphRootHash = validateFinalEvidenceV2GraphFiles(directory, submitted.graph, finalEvidenceGraphFilesystem, preflightInvocation).rootHash;
  authorizeTestProjectRunPayloads(directory, invocation, finalEvidenceGraphAuthorizations(directory, submitted));
  authorizeTestProjectRunPayloads(directory, invocation, [{ purpose: 'final-evidence-manifest', payload: Buffer.from(`${canonical({ ...submitted, graphRootHash })}\n`) }]);
  if (existsSync(join(directory, '.omd', 'final-evidence-v2.json'))) authorizeFinalEvidenceCheck(directory, invocation);
  return guardedPublishFinalEvidenceV2(directory, input, invocation);
}

function publishFinalEvidenceV2(directory: string, input: unknown): string {
  return publishFinalEvidenceV2As(directory, input, finalEvidenceInvocation(directory));
}
function authorizeFinalEvidenceCheck(directory: string, invocation: ReturnType<typeof finalEvidenceInvocation>): void {
  const pointer = readFileSync(join(directory, '.omd', 'final-evidence-v2.json'));
  const { record } = JSON.parse(pointer.toString('utf8')) as { record: string };
  const manifestBytes = readFileSync(join(directory, '.omd', 'final-evidence-v2-runs', record));
  const manifest = validateFinalEvidenceV2Manifest(JSON.parse(manifestBytes.toString('utf8')));
  authorizeTestProjectRunPayloads(directory, invocation, [
    { purpose: 'final-reviewer-lane', payload: pointer },
    { purpose: 'final-evidence-manifest', payload: manifestBytes },
    ...finalEvidenceGraphAuthorizations(directory, manifest),
  ]);
}
function checkFinalEvidenceV2(directory: string): FinalEvidenceV2Manifest {
  const invocation = finalEvidenceInvocation(directory);
  authorizeFinalEvidenceCheck(directory, invocation);
  return guardedCheckFinalEvidenceV2(directory, invocation);
}
function recoverFinalEvidenceV2Lock(directory: string): boolean {
  const invocation = finalEvidenceInvocation(directory);
  if (existsSync(join(directory, '.omd', 'final-evidence-v2.json'))) authorizeFinalEvidenceCheck(directory, invocation);
  return guardedRecoverFinalEvidenceV2Lock(directory, invocation);
}
function garbageCollectFinalEvidenceV2(directory: string, options: Parameters<typeof guardedGarbageCollectFinalEvidenceV2>[2] = {}): ReturnType<typeof guardedGarbageCollectFinalEvidenceV2> {
  const invocation = finalEvidenceInvocation(directory);
  if (existsSync(join(directory, '.omd', 'final-evidence-v2.json'))) authorizeFinalEvidenceCheck(directory, invocation);
  if ('seams' in options) throw new Error('test seams are not available to production final-v2 APIs');
  return guardedGarbageCollectFinalEvidenceV2(directory, invocation, options);
}

const sha = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`fixture is missing ${label}`);
  return value;
}
function setReceiptSha(receipt: ArtifactReceipt, value: string): void { Reflect.set(receipt, 'sha256', value); }
function setGraphFixture(input: FinalEvidenceV2Manifest, key: string, value: unknown): void { Reflect.set(input.graph, key, value); }
const claimPublication = (): EvidenceClaimPublication => ({
  schema: 'evidence-claim-publication-v1',
  claims: [
    {
      id: 'requested-outcome',
      text: 'The user requested the current outcome.',
      status: 'confirmed',
      userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'fixture-message', excerpt: 'Produce the current outcome.' }],
    },
    { id: 'layout-option', text: 'The selected layout may improve hierarchy.', status: 'hypothesis', basis: 'The current evidence supports testing this layout.' },
    { id: 'implementation-order', text: 'Use the current implementation order for this run.', status: 'temporary-decision', basis: 'The order is reversible and model-owned.' },
  ],
  userFacts: ['requested-outcome'],
  workingContext: ['layout-option', 'implementation-order'],
});
const root = (): string => mkdtempSync(join(tmpdir(), 'omd-final-v2-'));
const clean = (path: string): void => rmSync(path, { recursive: true, force: true });
const crc32 = (bytes: Buffer): number => {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
};
const png = (width: number, height: number): Buffer => {
  const chunk = (type: string, value: Buffer): Buffer => {
    const bytes = Buffer.alloc(value.length + 12);
    bytes.writeUInt32BE(value.length, 0); bytes.write(type, 4); value.copy(bytes, 8);
    bytes.writeUInt32BE(crc32(bytes.subarray(4, value.length + 8)), value.length + 8);
    return bytes;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc((width * 3 + 1) * height))), chunk('IEND', Buffer.alloc(0))]);
};
const canonical = (value: unknown): string => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
const receipt = <T extends string>(directory: string, name: string, schema: T, value: Record<string, unknown>): { path: string; schema: T; sha256: string } => {
  const path = join('.omd', 'receipts', `${name}.json`); const bytes = `${canonical(value)}\n`;
  mkdirSync(join(directory, '.omd', 'receipts'), { recursive: true }); writeFileSync(join(directory, path), bytes);
  return { path, schema, sha256: sha(bytes) };
};
const taskFrame = (surface: string, goal = 'save'): string => `---
uxTask: Save the edited document
uxFrequentAction: Save document changes
uxCostliestError: Lose an unsaved document edit
uxSurface: ${surface}
---

## Task coverage matrix

T1 | goal: ${goal} | start: editor | actions: edit | success: saved | recovery: retry | viewports: desktop, mobile | requirements: none
`;
const publishCurrentTaskEvidence = (directory: string, surface: 'product' | 'mixed'): { path: string; schema: 'task-evidence-v1'; sha256: string } => {
  const secondFrameRow = surface === 'mixed'
    ? '\nT2 | goal: inspect | start: editor | actions: inspect | success: inspected | recovery: retry | viewports: desktop, mobile | requirements: none\n'
    : '';
  const frame = `${taskFrame(surface)}${secondFrameRow}`;
  const taskRows = surface === 'mixed'
    ? 'T1 | production: / | locator: #save |\nT2 | production: /secondary | locator: #inspect |'
    : 'T1 | production: / | locator: #save |';
  const composition = `${readFileSync(join(directory, '.omd', 'composition.md'), 'utf8')
    .replace(/- Frame SHA-256: [a-f0-9]{64}/, `- Frame SHA-256: ${sha(frame)}`)}\n\n## UX task coverage\n\n${taskRows}\n`;
  writeFileSync(join(directory, '.omd', 'frame.md'), frame); writeFileSync(join(directory, '.omd', 'composition.md'), composition);
  const put = (name: string, value: unknown) => { const bytes = Buffer.from(JSON.stringify(value)); const path = `.omd/.cache/${name}`; mkdirSync(join(directory, '.omd', '.cache'), { recursive: true }); writeFileSync(join(directory, path), bytes); return { path, sha256: sha(bytes) }; };
  const probe = (taskId: string, route: string, locator: string, role: 'primary' | 'recovery', viewport: 'desktop' | 'mobile') => {
    const value = { name: `${taskId} ${role} save ${viewport}`, destructive: false, steps: [{ action: 'click', selector: locator, expect: [{ type: 'visible', selector: locator }] }, { action: 'click', selector: '#saved', expect: [{ type: 'text', selector: '#saved', value: 'Saved' }] }] };
    const plan = put(`task-${taskId}-${role}-${viewport}-plan.json`, value); const result = put(`task-${taskId}-${role}-${viewport}-result.json`, { name: value.name, target: `http://localhost${route}`, viewport: viewport === 'desktop' ? { width: 1280, height: 900 } : { width: 390, height: 844 }, steps: value.steps.map(step => ({ action: step.action, selector: step.selector, ok: true, expectations: step.expect.map(expectation => ({ ...expectation, ok: true })) })), warnings: [] });
    return { planPath: plan.path, planSha256: plan.sha256, resultPath: result.path, resultSha256: result.sha256, role, viewport };
  };
  const desktop = png(1280, 900); const mobile = png(390, 844);
  mkdirSync(join(directory, '.omd', '.cache'), { recursive: true });
  writeFileSync(join(directory, '.omd', '.cache', 'task-desktop.png'), desktop); writeFileSync(join(directory, '.omd', '.cache', 'task-mobile.png'), mobile);
  const invocation = finalEvidenceInvocation(directory);
  const task = (id: string, route: string, locator: string) => {
    const desktopPath = `.omd/.cache/${id}-task-desktop.png`; const mobilePath = `.omd/.cache/${id}-task-mobile.png`;
    writeFileSync(join(directory, desktopPath), desktop); writeFileSync(join(directory, mobilePath), mobile);
    const capture = (path: string, sha256: string, viewport: 'desktop' | 'mobile', executionId: string) => ({
      path, sha256, viewport,
      authorization: { schemaVersion: 1, buildSha256: invocation.current.buildSha256, executionId, taskId: id, route, target: `http://localhost${route}`, viewport, capturePath: path, captureSha256: sha256, role: 'render' as const },
    });
    return { id, context: 'production' as const, production: { route, locator, workObject: 'document' }, probes: [probe(id, route, locator, 'primary', 'desktop'), probe(id, route, locator, 'primary', 'mobile'), probe(id, route, locator, 'recovery', 'desktop'), probe(id, route, locator, 'recovery', 'mobile')], renders: [capture(desktopPath, sha(desktop), 'desktop', `${id}-render-desktop`), capture(mobilePath, sha(mobile), 'mobile', `${id}-render-mobile`)] };
  };
  const tasks = surface === 'mixed' ? [task('T1', '/', '#save'), task('T2', '/secondary', '#inspect')] : [task('T1', '/', '#save')];
  const evidence = { schemaVersion: 1, buildSha256: invocation.current.buildSha256, surface, frame: { path: '.omd/frame.md', sha256: sha(frame) }, composition: { path: '.omd/composition.md', sha256: sha(composition) }, tasks };
  const input = join(directory, '.omd', '.cache', 'task-evidence-manifest.json'); writeFileSync(input, JSON.stringify(evidence));
  authorizeTestTaskEvidencePayloads(directory, invocation, {
    probeResults: evidence.tasks.flatMap((task) =>
      task.probes.map((probe) => readFileSync(join(directory, probe.resultPath))),
    ),
    captureResults: [],
  });
  authorizeTestProjectRunPayloads(directory, invocation, evidence.tasks.flatMap(task =>
    task.renders.map(capture => ({ purpose: 'product-capture-result' as const, payload: Buffer.from(canonical(capture.authorization)) })),
  ));
  publishTaskEvidence(directory, input, invocation);
  return { path: '.omd/task-evidence.json', schema: 'task-evidence-v1', sha256: sha(readFileSync(join(directory, '.omd', 'task-evidence.json'))) };
};
const refreshSourceSeal = (directory: string, input: FinalEvidenceV2Manifest): FinalEvidenceV2Manifest => {
  const value = createSourceSeal(directory, '2026-01-01T00:00:00.000Z'); const bytes = Buffer.from(`${canonical(value)}\n`);
  writeFileSync(join(directory, '.omd', 'source-seal.json'), bytes);
  return { ...input, graph: { ...input.graph, sourceSeal: { path: '.omd/source-seal.json', schema: 'source-seal-v1', sha256: sha(bytes) } } };
};
const refreshReferenceDistance = (
  directory: string,
  input: FinalEvidenceV2Manifest,
  updates: Readonly<Record<string, unknown>>,
): FinalEvidenceV2Manifest => {
  const graph = input.graph as typeof input.graph & { referenceDistance?: ArtifactReceipt };
  const current = required(graph.referenceDistance, 'selected reference distance');
  const value = JSON.parse(readFileSync(join(directory, current.path), 'utf8')) as Record<string, unknown>;
  const bytes = canonical({ ...value, ...updates });
  writeFileSync(join(directory, current.path), bytes);
  return {
    ...input,
    graph: {
      ...input.graph,
      referenceDistance: { ...current, sha256: sha(bytes) },
    },
  };
};
const attachCurrentTaskEvidence = (directory: string, input: FinalEvidenceV2Manifest, surface: 'product' | 'mixed'): FinalEvidenceV2Manifest => {
  const taskEvidence = publishCurrentTaskEvidence(directory, surface);
  const task = JSON.parse(readFileSync(join(directory, taskEvidence.path), 'utf8')).tasks[0] as {
    id: string;
    production: { route: string };
    probes: Array<{ resultPath: string }>;
  };
  const probe = required(task.probes[0], 'task probe');
  const target = (JSON.parse(readFileSync(join(directory, probe.resultPath), 'utf8')) as { target: string }).target;
  const currentBeats = JSON.parse(readFileSync(join(directory, input.graph.renderedBeats.path), 'utf8')) as Record<string, unknown>;
  const renderedBeats = receipt(directory, `beats-${surface}`, 'rendered-beat-receipt-v1', {
    ...currentBeats,
    route: task.production.route,
    target,
    taskId: task.id,
  });
  let output: FinalEvidenceV2Manifest = {
    ...input,
    graph: { ...input.graph, taskEvidence, renderedBeats },
  };
  if (output.staticEvidence !== undefined) {
    const currentStatic = JSON.parse(readFileSync(join(directory, output.staticEvidence.path), 'utf8')) as Record<string, any>;
    const beatReceipt = JSON.parse(readFileSync(join(directory, renderedBeats.path), 'utf8'));
    currentStatic.beatReceipt = beatReceipt;
    for (const key of ['expected', 'observed'] as const) {
      currentStatic[key].route = task.production.route;
      currentStatic[key].target = target;
      currentStatic[key].taskId = task.id;
    }
    for (const review of Object.values(currentStatic.reviewReceipts) as { path: string; sha256: string }[]) {
      const reviewPath = join(directory, review.path);
      const value = JSON.parse(readFileSync(reviewPath, 'utf8')) as Record<string, unknown>;
      const bytes = `${canonical({ ...value, route: task.production.route, target, taskId: task.id })}\n`;
      writeFileSync(reviewPath, bytes);
      review.sha256 = sha(bytes);
    }
    output = {
      ...output,
      staticEvidence: receipt(directory, `static-${surface}`, 'static-direction-evidence-v1', currentStatic),
    };
  }
  output = refreshReferenceDistance(directory, output, {
    route: task.production.route,
    target,
  });
  return refreshSourceSeal(directory, output);
};
const copyDeckV2 = (
  selectedRegister: 'quiet' | 'confident' | 'showpiece',
  motionDecision: 'none' | 'one',
  currentUserBeatExceptionReceiptSha256 = NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256,
  beatIds: readonly string[] = ['B-1'],
): string => `# Copy

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

## Truth contract

- Result boundary: navigation
- Storage boundary: none

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
- Current-user exception: ${currentUserBeatExceptionReceiptSha256 === NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256 ? 'N/A — no host-authorized Beat exception' : 'current-user: host-authorized Beat exception'}
- Current-user Beat-exception receipt SHA-256: ${currentUserBeatExceptionReceiptSha256}

| Beat ID | Evidence IDs |
| --- | --- |
${beatIds.map((beatId) => `| ${beatId} | F-001 |`).join('\n')}
`;
const manifest = (directory: string, decision: 'none' | 'one' = 'none', motionRegister: 'confident' | 'showpiece' = 'confident'): FinalEvidenceV2Manifest => {
  const invocation = finalEvidenceInvocation(directory);
  const current = invocation.current;
  const activation = receipt(directory, 'activation', 'activation-context-v2', { schemaVersion: 'activation-context-v2', buildSha256: current.buildSha256, loadedSkillSha256: current.loadedSkillSha256, briefSha256: current.briefSha256, hostCapability: { host: 'local' } });
  const intentValue: IntentLedger = { schemaVersion: 'intent-ledger-v1', events: [], currentEventId: null };
  const intentSha256 = intentLedgerSha256(intentValue);
  const intentRecord = `intent-runs/sha256-${intentSha256}.json`;
  mkdirSync(join(directory, '.omd', 'intent-runs'), { recursive: true });
  writeFileSync(join(directory, '.omd', intentRecord), `${JSON.stringify(intentValue)}\n`);
  writeFileSync(join(directory, '.omd', 'intent-current.json'), `${canonical({ schemaVersion: INTENT_CURRENT_POINTER_SCHEMA_VERSION, record: intentRecord, sha256: intentSha256 })}\n`);
  const intent = { path: join('.omd', intentRecord), schema: 'intent-ledger-v1', sha256: sha(readFileSync(join(directory, '.omd', intentRecord))) };
  const activationSha256 = artDirectionSha256(JSON.parse(readFileSync(join(directory, activation.path), 'utf8')));
  const referenceSource = 'https://capture.example/hero';
  const referenceComponent = 'hero';
  const referenceImage = refImagePath(directory, { source: referenceSource, component: referenceComponent });
  mkdirSync(join(directory, '.omd'), { recursive: true });
  saveRef(directory, {
    source: referenceSource, component: referenceComponent, kind: 'component', capturedAt: '2026-01-01T00:00:00.000Z',
    selector: '#hero', invariants: { spacingLadder: [8], radiusLadder: [4], elevationLevels: 0, centeredRatio: 0, tokenCoverage: 1, paddingWeight: 8, typeScale: [], fontFamilies: [], weightLadder: [], motionDurations: [], easingVocab: [], animatedShare: 0, hoverCoverage: 0, focusCoverage: 0, animatedProperties: [], hasReducedMotion: false, scrollChoreography: [] },
    principles: ['Keep the hierarchy.'], blueprint: { selector: '#hero', capturedAt: '2026-01-01T00:00:00.000Z', nodes: [{ id: 'hero', role: 'container', children: [], box: { w: 160, h: 40 } }] }, imagePath: referenceImage.slice(directory.length + 1), viewport: { width: 1280, height: 900 },
  }, createTestProjectWriteAdapter(directory));
  writeFileSync(referenceImage, png(1, 1));
  const boardValue = { schemaVersion: 'reference-board-v1', frameSha256: sha('frame'), candidates: [{ id: 'candidate', label: 'Candidate', route: '/', rationale: 'Lawful evidence', pieces: [{ slotId: 'static', sourceKind: 'component-capture', referenceId: refIdentity(referenceSource, referenceComponent), targetComponent: 'Hero', targetSelector: '#hero', taskIds: ['T1'], reason: 'Use structure', take: ['structure'], avoid: 'Avoid copying', adaptation: 'Adapt lawfully', evidenceAxes: { rights: 'lawful', signal: 'high-visual-system', staticAxis: 'available', motionAxis: 'absent' }, grid: { column: 1, span: 12, order: 0 } }, { slotId: 'motion-reference', sourceKind: 'component-capture', referenceId: refIdentity(referenceSource, referenceComponent), targetComponent: 'Hero', targetSelector: '#hero', taskIds: ['T1'], reason: 'Use observed motion.', take: ['motion'], avoid: 'Avoid copying', adaptation: 'Adapt lawfully', evidenceAxes: { rights: 'lawful', signal: 'high-motion', staticAxis: 'absent', motionAxis: 'available' }, grid: { column: 1, span: 12, order: 1 } }] }] };
  writeFileSync(join(directory, '.omd', 'reference-board.json'), `${canonical(boardValue)}\n`);
  const board = receipt(directory, 'board', 'reference-board-v1', boardValue);
  const selectionValue = selectReferenceCandidateV2(directory, 'candidate', [{ slotId: 'static', obligationDisposition: 'used', obligationReason: 'Selected static evidence.' }, { slotId: 'motion-reference', obligationDisposition: 'not-applicable', obligationReason: 'Motion awaits evaluator resolution.' }], invocation);
  const selection = receipt(directory, 'selection', 'reference-selection-v2', selectionValue);
  const preSelectionSha256 = referenceSelectionV2Sha256(selectionValue);
  const preHandoffValue = writeReferenceHandoffReceipt(directory, 'art-direction', invocation).receipt;
  mkdirSync(join(directory, 'src'), { recursive: true });
  const staticProductionObservation = { schema: 'reference-production-observation-v1', slotId: 'static', route: '/', component: 'Hero', selector: '#hero', taskIds: ['T1'], buildSha256: invocation.current.buildSha256 };
  const motionProductionObservation = { schema: 'reference-production-observation-v1', slotId: 'motion-reference', route: '/', component: 'Hero', selector: '#hero', taskIds: ['T1'], buildSha256: invocation.current.buildSha256 };
  writeFileSync(join(directory, 'src', 'Hero.tsx'), `${canonical(staticProductionObservation)}\n`);
  writeFileSync(join(directory, 'src', 'HeroMotion.tsx'), `${canonical(motionProductionObservation)}\n`);
  const attribution = 'Reference attribution.';
  writeFileSync(join(directory, '.omd', 'attribution.md'), attribution);
  let usage: { path: string; schema: 'reference-usage-v2'; sha256: string };
  const alternatives = [
    { register: 'quiet', subjectIdentityFit: 'Quiet editorial framing fits the subject.', staticReferenceSlotIds: ['static'], motionReferenceSlotIds: [], conceptRole: 'Editorial clarity', macroCompositionHypothesis: 'Template-breaking asymmetric editorial departure.', motionHypothesis: 'none', uxAccessibilityPerformanceRisks: ['Reduced motion remains available.'], lawfulImplementationPath: 'CSS and SVG implementation.', rejectionCondition: 'Another evidenced direction better fits the launch.' },
    { register: 'confident', subjectIdentityFit: 'Confident framing fits the subject.', staticReferenceSlotIds: ['static'], motionReferenceSlotIds: decision === 'one' ? ['motion-reference'] : [], conceptRole: 'Launch transition', macroCompositionHypothesis: 'Layered promotional composition.', motionHypothesis: 'one', uxAccessibilityPerformanceRisks: ['Reduced motion remains available.'], lawfulImplementationPath: 'CSS and SVG implementation.', rejectionCondition: 'Another evidenced direction better fits the launch.' },
    { register: 'showpiece', subjectIdentityFit: 'Showpiece framing fits the subject.', staticReferenceSlotIds: ['static'], motionReferenceSlotIds: decision === 'one' ? ['motion-reference'] : [], conceptRole: 'Signature reveal', macroCompositionHypothesis: 'Layered promotional composition.', motionHypothesis: 'one', uxAccessibilityPerformanceRisks: ['Reduced motion remains available.'], lawfulImplementationPath: 'CSS and SVG implementation.', rejectionCondition: 'Another evidenced direction better fits the launch.' },
  ] as const;
  const selected = decision === 'none' ? alternatives[0] : (motionRegister === 'showpiece' ? alternatives[2] : alternatives[1]);
  const authorInvocationSha256 = sha('author-invocation');
  const authorPayloadSha256 = sha('author-payload');
  const authorResultSha256 = sha('author-result');
  const alternativesSha256 = sha(canonical(alternatives));
  const motionResolution = resolveMotionProjection({
    activationSha256,
    alternativesSha256,
    handoffSha256: preHandoffValue.payloadSha256,
    evaluatorInvocationSha256: authorInvocationSha256,
    evaluatorPayloadSha256: authorPayloadSha256,
    evaluatorResultSha256: authorResultSha256,
    motionDecision: decision,
    slots: [{ slotId: 'motion-reference', obligationDisposition: decision === 'one' ? 'used' : 'rejected', obligationReason: decision === 'one' ? 'Evaluator selected observed motion evidence.' : 'Evaluator rejected observed motion evidence.' }],
    selection: selectionValue,
  });
  const motionResolutionSha256 = motionResolutionProjectionSha256(motionResolution);
  const settledSelection = materializeSettledReferenceSelection(selectionValue, { ...motionResolution, selection: selectionValue });
  const settledSelectionSha256 = referenceSelectionV2Sha256(settledSelection);
  mkdirSync(join(directory, '.omd', 'settled-reference-selections'), { recursive: true });
  writeFileSync(join(directory, '.omd', 'settled-reference-selections', `sha256-${settledSelectionSha256}.json`), `${canonical(settledSelection)}\n`);
  writeFileSync(join(directory, '.omd', 'reference-selection-v2.json'), `${canonical(settledSelection)}\n`);
  const settledSelectionReceipt = receipt(directory, 'settled-selection', 'reference-selection-v2', settledSelection);
  const selectionSha256 = settledSelectionSha256;
  const handoffValue = preHandoffValue;
  const handoff = { path: '.omd/reference-handoffs/art-direction.json', schema: 'reference-handoff-v2', sha256: sha(readFileSync(join(directory, '.omd', 'reference-handoffs', 'art-direction.json'))) };
  mkdirSync(join(directory, '.omd', 'motion-resolutions'), { recursive: true });
  writeFileSync(join(directory, '.omd', 'motion-resolutions', `sha256-${motionResolutionSha256}.json`), `${canonical(motionResolution)}\n`);
  const decisionValue = {
    schemaVersion: 'art-direction-v1' as const,
    activationSha256,
    intentSha256,
    boardSha256: selectionValue.captureSha256,
    preSelectionSha256,
    route: '/',
    source: 'explicit-user' as const,
    consideredAlternatives: alternatives,
    alternativesSha256,
    selectedRegister: selected.register,
    motionDecision: decision,
    conceptRole: selected.conceptRole,
    selectedStaticReferenceSlotIds: selected.staticReferenceSlotIds,
    selectedMotionReferenceSlotIds: selected.motionReferenceSlotIds,
    motionResolutionProjectionSha256: motionResolutionSha256,
    settledSelectionSha256,
    implementationLane: 'browser',
    fallbackPath: 'CSS/SVG static reduced-motion fallback.',
    performanceAccessibilityBudget: 'Within the declared accessibility and performance budget.',
    rejectedAlternatives: alternatives.filter((alternative) => alternative.register !== selected.register).map((alternative) => ({ register: alternative.register, reason: 'A different evidenced direction was explicitly selected.', citedReferenceSlotIds: alternative.staticReferenceSlotIds })),
    authorInvocationSha256,
    authorPayloadSha256,
    authorResultSha256,
    currentUserBeatExceptionReceiptSha256: NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256,
  };
  const artDirectionValue = { schemaVersion: LEGACY_ART_DIRECTION_RECORD_SCHEMA_VERSION, decision: decisionValue, decisionSha256: artDirectionSha256(decisionValue), referenceHandoffSha256: handoffValue.payloadSha256, intentLedgerSha256: intentSha256, activationSha256, beatIds: ['B-1'] };
  const artDirectionSemanticSha256 = artDirectionSha256(artDirectionValue);
  const artDirection = { path: `.omd/art-direction-runs/sha256-${artDirectionSemanticSha256}.json`, schema: LEGACY_ART_DIRECTION_RECORD_SCHEMA_VERSION, sha256: sha(`${canonical(artDirectionValue)}\n`) };
  mkdirSync(join(directory, '.omd', 'art-direction-runs'), { recursive: true });
  writeFileSync(join(directory, artDirection.path), `${canonical(artDirectionValue)}\n`);
  writeFileSync(join(directory, '.omd', 'art-direction.json'), `${canonical({ schemaVersion: 'art-direction-current-v2', record: artDirection.path.slice('.omd/'.length), sha256: artDirectionSemanticSha256 })}\n`);
  const settlement = {
    motionResolutionProjectionSha256: motionResolutionSha256,
    settledSelectionSha256,
    settledSelection,
  };
  const composerHandoff = writeReferenceHandoffReceipt(directory, 'composer', invocation).receipt;
  const handHandoff = writeReferenceHandoffReceipt(directory, 'hand', invocation).receipt;
  const usageValue = {
    schemaVersion: 'reference-usage-v2',
    captureSha256: selectionValue.captureSha256,
    assemblySha256: selectionValue.assemblySha256,
    projectionSha256: selectionValue.projectionSha256,
    selectionSha256,
    artDirectionSha256: artDirectionSemanticSha256,
    motionResolutionProjectionSha256: settlement.motionResolutionProjectionSha256,
    settledSelectionSha256: settlement.settledSelectionSha256,
    composerHandoffSha256: composerHandoff.payloadSha256,
    handHandoffSha256: handHandoff.payloadSha256,
    attributionSha256: sha(attribution),
    rows: [
      { slotId: 'static', taskIds: ['T1'], status: 'used', target: { route: '/', component: 'Hero', selector: '#hero' }, borrowedProperties: ['structure'], nonBorrowedProperties: ['branding'], transformation: 'Adapted structure', evidence: { path: 'src/Hero.tsx', selector: '#hero', sha256: sha(readFileSync(join(directory, 'src', 'Hero.tsx'))) }, productionObservation: staticProductionObservation, verificationNote: 'Verified' },
      { slotId: 'motion-reference', taskIds: ['T1'], status: decision === 'one' ? 'used' : 'rejected', target: { route: '/', component: 'Hero', selector: '#hero' }, borrowedProperties: decision === 'one' ? ['motion'] : [], nonBorrowedProperties: ['branding'], transformation: 'Adapted motion timing', evidence: { path: 'src/HeroMotion.tsx', selector: '#hero', sha256: sha(readFileSync(join(directory, 'src', 'HeroMotion.tsx'))) }, productionObservation: motionProductionObservation, verificationNote: 'Verified' },
    ],
  };
  writeFileSync(join(directory, '.omd', 'reference-usage-v2.json'), `${canonical(usageValue)}\n`);
  usage = { path: '.omd/reference-usage-v2.json', schema: 'reference-usage-v2', sha256: sha(readFileSync(join(directory, '.omd', 'reference-usage-v2.json'))) };
  const selectedReferenceDistanceValue = {
    schemaVersion: 'selected-reference-distance-v1',
    selectionSha256,
    usageSha256: referenceUsageV2Sha256(parseReferenceUsageV2(usageValue)),
    buildSha256: current.buildSha256,
    candidateId: 'candidate',
    route: '/',
    target: 'file://fixture/',
    viewport: { width: 1280, height: 900 },
    threshold: 0.6,
    verdict: 'pass',
    comparisons: [
      {
        slotId: 'static',
        referenceId: refIdentity(referenceSource, referenceComponent),
        sourceSelector: '#hero',
        targetSelector: '#hero',
        similarity: 1,
        drivers: [],
      },
      ...(decision === 'one' ? [{
        slotId: 'motion-reference',
        referenceId: refIdentity(referenceSource, referenceComponent),
        sourceSelector: '#hero',
        targetSelector: '#hero',
        similarity: 1,
        drivers: [],
      }] : []),
    ].sort((left, right) => left.slotId.localeCompare(right.slotId)),
  };
  const selectedReferenceDistancePath = join(directory, '.omd', 'selected-reference-distance.json');
  writeFileSync(selectedReferenceDistancePath, canonical(selectedReferenceDistanceValue));
  const referenceDistance = {
    path: '.omd/selected-reference-distance.json',
    schema: 'selected-reference-distance-v1',
    sha256: sha(readFileSync(selectedReferenceDistancePath)),
  };
  const copyDeck = copyDeckV2(decisionValue.selectedRegister, decisionValue.motionDecision);
  writeFileSync(join(directory, '.omd', 'copy-deck.md'), copyDeck);
  const copyValue = {
    schemaVersion: COPY_DECK_RECEIPT_SCHEMA_VERSION,
    copyDeckSha256: copyDeckSha256(Buffer.from(copyDeck)),
    artDirectionSha256: artDirectionSemanticSha256,
    selectedRegister: decisionValue.selectedRegister,
    motionDecision: decisionValue.motionDecision,
    beatIds: ['B-1'],
    currentUserBeatExceptionReceiptSha256: decisionValue.currentUserBeatExceptionReceiptSha256,
  };
  validateCanonicalCopyDeckReceipt(copyValue, Buffer.from(copyDeck), {
    selectedRegister: decisionValue.selectedRegister,
    motionDecision: decisionValue.motionDecision,
    beatIds: artDirectionValue.beatIds,
    currentUserBeatExceptionReceiptSha256: decisionValue.currentUserBeatExceptionReceiptSha256,
  });
  const copy = receipt(directory, 'copy', COPY_DECK_RECEIPT_SCHEMA_VERSION, copyValue);
  const desktopBeatCapture = 'beats-desktop.png';
  const mobileBeatCapture = 'beats-mobile.png';
  writeFileSync(join(directory, desktopBeatCapture), png(1280, 900));
  writeFileSync(join(directory, mobileBeatCapture), png(390, 844));
  const renderedBeats = receipt(directory, 'beats', 'rendered-beat-receipt-v1', { schema: 'rendered-beat-receipt-v1', artDirectionHash: artDirectionSemanticSha256, buildSha256: current.buildSha256, copyDeckSha256: copyValue.copyDeckSha256, beatIds: ['B-1'], renderedBeats: [{ id: 'B-1', boundary: true, distinctRegions: 0, ancestorBeatIds: [], rendered: true, observedViewport: { width: 1280, height: 900 } }, { id: 'B-1', boundary: true, distinctRegions: 0, ancestorBeatIds: [], rendered: true, observedViewport: { width: 390, height: 844 } }], captureViewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }], captures: [{ path: desktopBeatCapture, sha256: sha(readFileSync(join(directory, desktopBeatCapture))), viewport: { width: 1280, height: 900 } }, { path: mobileBeatCapture, sha256: sha(readFileSync(join(directory, mobileBeatCapture))), viewport: { width: 390, height: 844 } }], route: '/', target: 'file://fixture/', taskId: 'B-1' });
  const buildIdentity = receipt(directory, 'build', 'omd-build-identity-v1', { schemaVersion: 'omd-build-identity-v1', packageVersion: '1.0.0', buildSha256: current.buildSha256, sourceSkillSha256: current.loadedSkillSha256 });
  // allow: SIZE_OK - the legacy 1,000+ LOC integration fixture keeps one setup call; browser decision construction lives in the bounded helper to avoid duplicating the canonical final-v2 authority topology.
  const browserFixture = writeBrowserDecisionFixture(directory);
  writeObservationV2(directory, {
    currentArtifact: { path: buildIdentity.path, sha256: buildIdentity.sha256 },
    buildSha256: current.buildSha256,
    observedAt: '2026-01-01T00:00:30.000Z',
    evidence: { referenceProductionObservations: [staticProductionObservation, motionProductionObservation] },
  }, createTestProjectWriteAdapter(directory));
  writeFileSync(join(directory, '.omd', 'type-proof.md'), 'type-proof');
  const frameContent = '---\nuxTask: evaluate the launch\nuxFrequentAction: compare the direction\nuxCostliestError: publish an incorrect direction\nuxSurface: marketing\n---\n';
  writeFileSync(join(directory, '.omd', 'frame.md'), frameContent);
  const compositionFingerprint = [
    `- Frame SHA-256: ${sha(frameContent)}`,
    `- Copy deck SHA-256: ${sha(copyDeck)}`,
    `- Type proof SHA-256: ${sha('type-proof')}`,
    '- Scout SHA-256: N/A — the fixture uses only local lawful reference artifacts and performs no external scout pass.',
    `- Art direction record SHA-256: ${artDirectionSemanticSha256}`,
    `- Motion resolution projection SHA-256: ${motionResolutionSha256}`,
    `- Settled selection SHA-256: ${settledSelectionSha256}`,
    `- Composer handoff SHA-256: ${composerHandoff.payloadSha256}`,
  ].join('\n');
  const colourRoles = `| Role | Token/value | Intended use |
| --- | --- | --- |
| Dominant | #FFFFFF | Primary canvas |
| Secondary | #F5F5F5 | Secondary surfaces |
| Accent | #005FCC | Primary action and selected state |
| Semantic success | #137333 | Confirmed success state |
| Semantic error | #B3261E | Critical error state |`;
  const composition = CURRENT_COMPOSITION_SECTIONS.map((section) =>
    `## ${section}\n\n${section === 'Input fingerprint' ? compositionFingerprint : section === 'Colour roles' ? colourRoles : `Decision for ${section}.`}`,
  ).join('\n\n');
  writeFileSync(join(directory, '.omd', 'composition.md'), composition);
  writeFileSync(join(directory, 'brief.js'), '{"argv":[],"brief":"brief"}');
  writeFileSync(join(directory, 'skill.js'), readFileSync(new URL('../bin/omd.ts', import.meta.url)));
  const observed = (name: string, width: number, height: number) => {
    const path = `${name}.png`; const bytes = png(width, height); writeFileSync(join(directory, path), bytes);
    return { path, sha256: sha(bytes) };
  };
  const desktopSamples = [observed('desktop-sample-1', 1280, 900), observed('desktop-sample-2', 1280, 900), observed('desktop-sample-3', 1280, 900)] as const;
  const mobileSamples = [observed('mobile-sample-1', 390, 844), observed('mobile-sample-2', 390, 844), observed('mobile-sample-3', 390, 844)] as const;
  const first = receipt(directory, 'observation-1', 'observation-v2', { schema: 'observation-v2', buildSha256: current.buildSha256, currentArtifact: { path: buildIdentity.path, sha256: buildIdentity.sha256 }, predecessorSha256: null, observedAt: '2026-01-01T00:00:00.000Z', evidence: browserFixture.evidence([{ testedState: 'desktop-loaded', path: desktopBeatCapture, sha256: sha(readFileSync(join(directory, desktopBeatCapture))), viewport: { width: 1280, height: 900 } }, ...desktopSamples.map((capture, index) => ({ testedState: `desktop-temporal-${index + 1}`, ...capture, viewport: { width: 1280, height: 900 } }))]) });
  const firstSha256 = sha(canonical(JSON.parse(readFileSync(join(directory, first.path), 'utf8'))));
  const second = receipt(directory, 'observation-2', 'observation-v2', { schema: 'observation-v2', buildSha256: current.buildSha256, currentArtifact: { path: buildIdentity.path, sha256: buildIdentity.sha256 }, predecessorSha256: firstSha256, observedAt: '2026-01-01T00:01:00.000Z', evidence: browserFixture.evidence([{ testedState: 'mobile-loaded', path: mobileBeatCapture, sha256: sha(readFileSync(join(directory, mobileBeatCapture))), viewport: { width: 390, height: 844 } }, ...mobileSamples.map((capture, index) => ({ testedState: `mobile-temporal-${index + 1}`, ...capture, viewport: { width: 390, height: 844 } }))]) });
  const secondSha256 = sha(canonical(JSON.parse(readFileSync(join(directory, second.path), 'utf8'))));
  const lane = (name: 'blind' | 'fidelity' | 'protocol', schema: 'blind-review-v2' | 'fidelity-review-v1' | 'protocol-review-v1') => {
    const contract = {
      blind: { verdicts: { blindVisual: 'GREEN', blindNarrative: 'GREEN' }, criticalFloors: { composition: 3, copy: 3 } },
      fidelity: { verdicts: { referenceFidelity: 'GREEN', renderFidelity: 'GREEN' }, criticalFloors: { desktop: 3, mobile: 3 } },
      protocol: { verdicts: { evidenceIntegrity: 'GREEN', publicationProtocol: 'GREEN' }, criticalFloors: { authority: 3, currentness: 3 } },
    }[name];
    const sessionSha256 = sha(`${name}-isolation`);
    const reviewerIds = [`${name}-reviewer-a`, `${name}-reviewer-b`];
    const observationSha256s = [firstSha256, secondSha256];
    const designQuality = {
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
            observationSha256: firstSha256,
            viewport: 'desktop',
            state: 'desktop-loaded',
            region: 'primary work surface',
            visibleCondition: 'The intended priority is visible.',
            userConsequence: 'The next decision is legible.',
          },
          {
            observationSha256: secondSha256,
            viewport: 'mobile',
            state: 'mobile-loaded',
            region: 'primary work surface',
            visibleCondition: 'The priority is recomposed.',
            userConsequence: 'Decision context remains available.',
          },
        ],
      })),
    };
    const processBase = { blind: 10_000, fidelity: 20_000, protocol: 30_000 }[name];
    const executionReceipts = reviewerIds.map((reviewerId, index) => receipt(
      directory,
      `${name}-execution-${index}`,
      name === 'blind' ? 'final-reviewer-execution-v2' : 'final-reviewer-execution-v1',
      {
        schema: name === 'blind' ? 'final-reviewer-execution-v2' : 'final-reviewer-execution-v1',
        lane: `${name}Lane`,
        reviewerId,
        verdicts: contract.verdicts,
        criticalFloors: contract.criticalFloors,
        ...(name === 'blind' ? { designQuality } : {}),
        isolationReceiptSha256: sessionSha256,
        observationSha256s,
        artDirectionSha256: artDirectionSemanticSha256,
        buildSha256: current.buildSha256,
        briefSha256: current.briefSha256,
        browserSha256: sha(`${name}-browser-${index}`),
        childPid: processBase + index,
        sessionId: `${name}-session-${index}`,
        nonce: `${name}-nonce-${index}`,
        evidenceSha256: sha(`${name}-evidence-${index}`),
        configurationSha256: sha(`${name}-configuration-${index}`),
      },
    ));
    return receipt(directory, name, schema, {
      schema, artDirectionSha256: artDirectionSemanticSha256, buildSha256: current.buildSha256,
      isolationReceipt: { schema: 'reviewer-isolation-v1', sha256: sessionSha256 },
      ...contract,
      ...(name === 'blind' ? { designQuality } : {}),
      quorum: { required: 2, passed: 2 },
      provenance: { observationSha256s, reviewerIds, reviewerSessionSha256: sessionSha256 },
      executionReceipts: executionReceipts.map(({ path, sha256 }) => ({ path, sha256 })),
    });
  };
  const staticSlot = observed('static-slot', 1280, 900);
  const renderedBeatValue = JSON.parse(readFileSync(join(directory, renderedBeats.path), 'utf8')) as { captures: Array<{ path: string; sha256: string; viewport: { width: number; height: number } }> };
  const currentDesktopBeatCapture = renderedBeatValue.captures.find((capture) => capture.viewport.width === 1280 && capture.viewport.height === 900) ?? assert.fail('desktop Beat capture is missing');
  const currentMobileBeatCapture = renderedBeatValue.captures.find((capture) => capture.viewport.width === 390 && capture.viewport.height === 844) ?? assert.fail('mobile Beat capture is missing');
  const desktopRender = { path: currentDesktopBeatCapture.path, sha256: currentDesktopBeatCapture.sha256 };
  const mobileRender = { path: currentMobileBeatCapture.path, sha256: currentMobileBeatCapture.sha256 };
  const macro = observed('macro', 1280, 900);
  const fidelity = observed('fidelity', 1280, 900);
  const fallback = observed('fallback', 1280, 900);
  const blindSignature = observed('blind-signature', 1280, 900);
  const blindNarrative = observed('blind-narrative', 1280, 900);
  const blindMotionFit = observed('blind-motion-fit', 1280, 900);
  const observationManifestSha256 = sha(JSON.stringify([desktopRender, mobileRender, ...desktopSamples, ...mobileSamples].map((observation) => ({ path: observation.path, sha256: observation.sha256 }))));
  const review = (role: 'signature' | 'narrative' | 'motionFit' | 'fidelity' | 'fallback' | 'blind', actor: 'host-reviewer' | 'host-evaluator') => {
    const path = `${role}-${actor}.json`;
    const value = { schema: 'static-review-receipt-v1', role, verdict: 'pass', artDirectionHash: artDirectionSemanticSha256, buildHash: current.buildSha256, selectionSha256, handoffSha256: handoffValue.payloadSha256, runId: current.buildSha256, route: '/', target: 'file://fixture/', taskId: 'B-1', observationManifestSha256, launchId: `${role}-${actor}-launch`, sessionId: `${role}-${actor}-session`, processIdentity: `${role}-${actor}-process`, configurationSha256: sha(`${role}-${actor}-configuration`) };
    writeFileSync(join(directory, path), `${canonical(value)}\n`);
    return { path, sha256: sha(readFileSync(join(directory, path))) };
  };
  const staticEvidence = receipt(directory, 'static', 'static-direction-evidence-v1', {
    schema: 'static-direction-evidence-v1', artDirectionHash: artDirectionSemanticSha256, motionDecision: 'none',
    expected: { artDirectionHash: artDirectionSemanticSha256, selectionSha256, handoffSha256: handoffValue.payloadSha256, buildHash: current.buildSha256, runId: current.buildSha256, route: '/', target: 'file://fixture/', taskId: 'B-1' },
    observed: { runId: current.buildSha256, buildHash: current.buildSha256, selectionSha256, handoffSha256: handoffValue.payloadSha256, route: '/', target: 'file://fixture/', taskId: 'B-1', observationManifestSha256 },
    beatReceipt: renderedBeatValue,
    observations: { desktop: { capture: desktopRender, width: 1280, height: 900 }, mobile: { capture: mobileRender, width: 390, height: 844 }, temporalSamples: { desktop: desktopSamples, mobile: mobileSamples } },
    reviewReceipts: { signature: review('signature', 'host-reviewer'), narrative: review('narrative', 'host-evaluator'), motionFit: review('motionFit', 'host-reviewer'), fidelity: review('fidelity', 'host-evaluator'), fallback: review('fallback', 'host-reviewer'), blind: review('blind', 'host-evaluator') },
  });
  writeFileSync(join(directory, '.omd', 'frame.md'), frameContent);
  const sourceSealValue = createSourceSeal(directory, '2026-01-01T00:00:00.000Z');
  writeFileSync(join(directory, '.omd', 'source-seal.json'), `${canonical(sourceSealValue)}\n`);
  const sourceSeal = { path: '.omd/source-seal.json', schema: 'source-seal-v1', sha256: sha(readFileSync(join(directory, '.omd', 'source-seal.json'))) };
  const graph = { schema: 'final-evidence-v2-graph' as const, activation, intent, artDirection, board, selection, settledSelection: settledSelectionReceipt, handoff, usage, referenceDistance, copy, renderedBeats, sourceSeal, buildIdentity, blindLane: lane('blind', 'blind-review-v2'), fidelityLane: lane('fidelity', 'fidelity-review-v1'), protocolLane: lane('protocol', 'protocol-review-v1'), observations: [first, second] } as unknown as FinalEvidenceV2Manifest['graph'];
  return decision === 'one'
    ? { schema: 'final-evidence-v2', motionDecision: 'one', claimPublication: claimPublication(), graph, motionEvidence: receipt(directory, 'motion', 'motion-evidence-v2', { schema: 'motion-evidence-v2', artDirectionHash: artDirectionSemanticSha256, motionDecision: 'one', observed: {}, scenes: [] }) }
    : { schema: 'final-evidence-v2', motionDecision: 'none', claimPublication: claimPublication(), graph, staticEvidence };
};
const forgeBeatFinalization = (
  directory: string,
  input: FinalEvidenceV2Manifest,
  selectedRegister: 'quiet' | 'confident',
  beatCount: number,
  currentUserException: boolean,
): FinalEvidenceV2Manifest => {
  const beatIds = Array.from({ length: beatCount }, (_, index) => `B-${index + 1}`);
  let graph = { ...input.graph };
  let intentSha256 = intentLedgerSha256(JSON.parse(readFileSync(join(directory, graph.intent.path), 'utf8')) as IntentLedger);
  let exceptionReceipt = sha('forged-noncanonical-beat-exception');
  if (currentUserException) {
    const ledger = appendExplicitIntent(JSON.parse(readFileSync(join(directory, graph.intent.path), 'utf8')) as IntentLedger, {
      eventId: 'beat-exception', currentUser: true, kind: 'current-user-beat-exception', lock: {}, recordedAt: '2026-01-01T00:00:01.000Z',
    });
    intentSha256 = intentLedgerSha256(ledger);
    const intentRecord = `intent-runs/sha256-${intentSha256}.json`;
    writeFileSync(join(directory, '.omd', intentRecord), `${JSON.stringify(ledger)}\n`);
    writeFileSync(join(directory, '.omd', 'intent-current.json'), `${canonical({ schemaVersion: INTENT_CURRENT_POINTER_SCHEMA_VERSION, record: intentRecord, sha256: intentSha256 })}\n`);
    graph = { ...graph, intent: { path: `.omd/${intentRecord}`, schema: 'intent-ledger-v1', sha256: sha(readFileSync(join(directory, '.omd', intentRecord))) } };
    exceptionReceipt = resolveCurrentUserBeatExceptionReceipt(ledger) ?? assert.fail('typed Beat exception must have a receipt');
  }
  const artPath = join(directory, graph.artDirection.path);
  const art = JSON.parse(readFileSync(artPath, 'utf8')) as Record<string, any>;
  const alternative = (art.decision.consideredAlternatives as Record<string, any>[]).find(({ register }) => register === selectedRegister) ?? assert.fail('selected register alternative is missing');
  art.decision = {
    ...art.decision, intentSha256, selectedRegister, conceptRole: alternative.conceptRole,
    selectedStaticReferenceSlotIds: alternative.staticReferenceSlotIds, selectedMotionReferenceSlotIds: alternative.motionReferenceSlotIds,
    rejectedAlternatives: (art.decision.consideredAlternatives as Record<string, any>[]).filter(({ register }) => register !== selectedRegister)
      .map((item) => ({ register: item.register, reason: 'A different evidenced direction was explicitly selected.', citedReferenceSlotIds: item.staticReferenceSlotIds })),
    currentUserBeatExceptionReceiptSha256: exceptionReceipt,
  };
  art.decisionSha256 = artDirectionSha256(art.decision);
  art.intentLedgerSha256 = intentSha256;
  art.beatIds = beatIds;
  const artDirectionSemanticSha256 = artDirectionSha256(art);
  const artRecordRelativePath = `.omd/art-direction-runs/sha256-${artDirectionSemanticSha256}.json`;
  const artRecordPath = join(directory, artRecordRelativePath);
  writeFileSync(artRecordPath, `${canonical(art)}\n`);
  writeFileSync(join(directory, '.omd', 'art-direction.json'), `${canonical({ schemaVersion: 'art-direction-current-v2', record: artRecordRelativePath.slice('.omd/'.length), sha256: artDirectionSemanticSha256 })}\n`);
  graph = { ...graph, artDirection: { ...graph.artDirection, path: artRecordRelativePath, sha256: sha(readFileSync(artRecordPath)) } };

  const invocation = finalEvidenceInvocation(directory);
  const motionResolution = JSON.parse(readFileSync(join(directory, '.omd', 'motion-resolutions', `sha256-${art.decision.motionResolutionProjectionSha256}.json`), 'utf8')) as MotionResolutionProjection;
  const settledSelection = JSON.parse(readFileSync(join(directory, '.omd', 'reference-selection-v2.json'), 'utf8')) as ReferenceSelectionV2;
  const settlement = {
    motionResolutionProjectionSha256: motionResolutionProjectionSha256(motionResolution),
    settledSelectionSha256: referenceSelectionV2Sha256(settledSelection),
    settledSelection,
  };
  assert.equal(settlement.motionResolutionProjectionSha256, art.decision.motionResolutionProjectionSha256);
  assert.equal(settlement.settledSelectionSha256, art.decision.settledSelectionSha256);
  const composer = writeReferenceHandoffReceipt(directory, 'composer', invocation).receipt;
  const hand = writeReferenceHandoffReceipt(directory, 'hand', invocation).receipt;
  const usage = JSON.parse(readFileSync(join(directory, graph.usage.path), 'utf8')) as Record<string, any>;
  usage.artDirectionSha256 = artDirectionSemanticSha256;
  usage.composerHandoffSha256 = composer.payloadSha256;
  usage.handHandoffSha256 = hand.payloadSha256;
  writeFileSync(join(directory, '.omd', 'reference-usage-v2.json'), `${canonical(usage)}\n`);
  graph = { ...graph, usage: { ...graph.usage, sha256: sha(readFileSync(join(directory, '.omd', 'reference-usage-v2.json'))) } };
  graph = refreshReferenceDistance(directory, { ...input, graph }, {
    usageSha256: referenceUsageV2Sha256(parseReferenceUsageV2(usage)),
  }).graph;

  const copyDeck = copyDeckV2(selectedRegister, art.decision.motionDecision, exceptionReceipt, beatIds);
  writeFileSync(join(directory, '.omd', 'copy-deck.md'), copyDeck);
  const copy = receipt(directory, `copy-${selectedRegister}-${beatCount}`, COPY_DECK_RECEIPT_SCHEMA_VERSION, {
    schemaVersion: COPY_DECK_RECEIPT_SCHEMA_VERSION, copyDeckSha256: copyDeckSha256(Buffer.from(copyDeck)), artDirectionSha256: artDirectionSemanticSha256,
    selectedRegister, motionDecision: art.decision.motionDecision, beatIds, currentUserBeatExceptionReceiptSha256: exceptionReceipt,
  });
  const desktopBeatCapture = `beats-${selectedRegister}-${beatCount}-desktop.png`;
  const mobileBeatCapture = `beats-${selectedRegister}-${beatCount}-mobile.png`;
  writeFileSync(join(directory, desktopBeatCapture), png(1280, 900));
  writeFileSync(join(directory, mobileBeatCapture), png(390, 844));
  const renderedBeats = receipt(directory, `beats-${selectedRegister}-${beatCount}`, 'rendered-beat-receipt-v1', {
    schema: 'rendered-beat-receipt-v1', artDirectionHash: artDirectionSemanticSha256, buildSha256: invocation.current.buildSha256, copyDeckSha256: copyDeckSha256(Buffer.from(copyDeck)), beatIds,
    renderedBeats: beatIds.flatMap((id) => [{ id, boundary: true, distinctRegions: 0, ancestorBeatIds: [], rendered: true, observedViewport: { width: 1280, height: 900 } }, { id, boundary: true, distinctRegions: 0, ancestorBeatIds: [], rendered: true, observedViewport: { width: 390, height: 844 } }]),
    captureViewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }],
    captures: [{ path: desktopBeatCapture, sha256: sha(readFileSync(join(directory, desktopBeatCapture))), viewport: { width: 1280, height: 900 } }, { path: mobileBeatCapture, sha256: sha(readFileSync(join(directory, mobileBeatCapture))), viewport: { width: 390, height: 844 } }],
    route: '/', target: 'file://fixture/', taskId: 'B-1',
  });
  graph = { ...graph, copy, renderedBeats };
  for (const lane of ['blindLane', 'fidelityLane', 'protocolLane'] as const) {
    const value = JSON.parse(readFileSync(join(directory, graph[lane].path), 'utf8')) as Record<string, any>;
    value.executionReceipts = (value.executionReceipts as Array<{ path: string; sha256: string }>).map((execution) => {
      const executionPath = join(directory, execution.path);
      const executionValue = JSON.parse(readFileSync(executionPath, 'utf8')) as Record<string, unknown>;
      const bytes = `${canonical({ ...executionValue, artDirectionSha256: artDirectionSemanticSha256 })}\n`;
      writeFileSync(executionPath, bytes);
      return { path: execution.path, sha256: sha(bytes) };
    });
    graph = { ...graph, [lane]: receipt(directory, `${lane}-${selectedRegister}-${beatCount}`, value.schema, { ...value, artDirectionSha256: artDirectionSemanticSha256 }) };
  }
  const compositionPath = join(directory, '.omd', 'composition.md');
  const refreshedComposition = readFileSync(compositionPath, 'utf8')
    .replace(/- Copy deck SHA-256: [a-f0-9]{64}/, `- Copy deck SHA-256: ${sha(copyDeck)}`)
    .replace(/- Art direction record SHA-256: [a-f0-9]{64}/, `- Art direction record SHA-256: ${artDirectionSemanticSha256}`)
    .replace(/- Composer handoff SHA-256: [a-f0-9]{64}/, `- Composer handoff SHA-256: ${composer.payloadSha256}`);
  writeFileSync(compositionPath, refreshedComposition);

  let output: FinalEvidenceV2Manifest = { ...input, graph };
  if (output.staticEvidence !== undefined) {
    const staticValue = JSON.parse(readFileSync(join(directory, output.staticEvidence.path), 'utf8')) as Record<string, any>;
    const beatValue = JSON.parse(readFileSync(join(directory, renderedBeats.path), 'utf8')) as { captures: Array<{ path: string; sha256: string; viewport: { width: number; height: number } }> };
    const desktopCapture = beatValue.captures.find((capture) => capture.viewport.width === 1280 && capture.viewport.height === 900) ?? assert.fail('desktop Beat capture is missing');
    const mobileCapture = beatValue.captures.find((capture) => capture.viewport.width === 390 && capture.viewport.height === 844) ?? assert.fail('mobile Beat capture is missing');
    staticValue.observations.desktop.capture = { path: desktopCapture.path, sha256: desktopCapture.sha256 };
    staticValue.observations.mobile.capture = { path: mobileCapture.path, sha256: mobileCapture.sha256 };
    const observationManifestSha256 = sha(JSON.stringify([
      staticValue.observations.desktop.capture,
      staticValue.observations.mobile.capture,
      ...staticValue.observations.temporalSamples.desktop,
      ...staticValue.observations.temporalSamples.mobile,
    ].map((observation: { path: string; sha256: string }) => ({ path: observation.path, sha256: observation.sha256 }))));
    for (const review of Object.values(staticValue.reviewReceipts) as { path: string; sha256: string }[]) {
      const path = join(directory, review.path);
      const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>;
      writeFileSync(path, `${canonical({ ...value, artDirectionHash: artDirectionSemanticSha256, observationManifestSha256 })}\n`);
      review.sha256 = sha(readFileSync(path));
    }
    staticValue.artDirectionHash = artDirectionSemanticSha256;
    staticValue.expected.artDirectionHash = artDirectionSemanticSha256;
    staticValue.observed.observationManifestSha256 = observationManifestSha256;
    staticValue.beatReceipt = beatValue;
    output = { ...output, staticEvidence: receipt(directory, `static-${selectedRegister}-${beatCount}`, 'static-direction-evidence-v1', staticValue) };
  }
  return refreshSourceSeal(directory, output);
};
test('finalization rejects forged over-budget Beat authority and accepts the exact typed current-user exception', () => {
  for (const [selectedRegister, beatCount] of [['quiet', 6], ['confident', 8]] as const) {
    const directory = root(); try {
      const input = forgeBeatFinalization(directory, manifest(directory, selectedRegister === 'quiet' ? 'none' : 'one'), selectedRegister, beatCount, false);
      assert.throws(() => publishFinalEvidenceV2(directory, input), /Beat exception receipt does not match the current intent ledger/);
    } finally { clean(directory); }
  }
  const directory = root(); try {
    const input = forgeBeatFinalization(directory, manifest(directory), 'quiet', 6, true);
    publishFinalEvidenceV2(directory, input);
    assert.equal(checkFinalEvidenceV2(directory).graph.copy.path, input.graph.copy.path);
  } finally { clean(directory); }
});

test('new final publication rejects a legacy composition even when its exact bytes have a fresh source seal', () => {
  const directory = root(); try {
    let input = manifest(directory);
    const compositionPath = join(directory, '.omd', 'composition.md');
    const legacy = readFileSync(compositionPath, 'utf8').replace(/\n\n## Colour roles[\s\S]*?(?=\n\n## Transfer boundary)/, '');
    writeFileSync(compositionPath, legacy);
    input = refreshSourceSeal(directory, input);
    assert.throws(() => publishFinalEvidenceV2(directory, input), /current composition contract.*Colour roles/);
    assert.deepEqual(readFileSync(compositionPath), Buffer.from(legacy));
  } finally { clean(directory); }
});

test('v2 publishes only a complete receipt graph and checker revalidates backing artifacts', () => {
  const directory = root(); try {
    const input = manifest(directory); publishFinalEvidenceV2(directory, input);
    assert.equal(checkFinalEvidenceV2(directory).graphRootHash?.length, 64);
    writeFileSync(join(directory, input.graph.artDirection.path), `${canonical({ schemaVersion: 'art-direction-record-v2', changed: true })}\n`);
    assert.throws(() => checkFinalEvidenceV2(directory));
  } finally { clean(directory); }
});
// allow: SIZE_OK - this measured legacy integration fixture exposes only its canonical authority/publisher harness; focused browser cases and assertions live in a bounded helper.
registerFinalBrowserObservationCases({
  createRoot: root,
  cleanRoot: clean,
  manifest,
  writeObservation({ directory, name, evidence, input }) {
    return receipt(directory, `observation-${name}`, 'observation-v2', {
      schema: 'observation-v2', buildSha256: finalEvidenceInvocation(directory).current.buildSha256,
      currentArtifact: { path: input.graph.buildIdentity.path, sha256: input.graph.buildIdentity.sha256 },
      predecessorSha256: null, observedAt: '2026-01-01T00:00:00.000Z', evidence,
    });
  },
  publishInvalid(directory, input) {
    const invocation = finalEvidenceInvocation(directory);
    authorizeTestProjectRunPayloads(directory, invocation, finalEvidenceGraphAuthorizations(directory, input));
    guardedPublishFinalEvidenceV2(directory, input, invocation);
  },
  publish: publishFinalEvidenceV2,
  check: checkFinalEvidenceV2,
});
test('canonical final publication preserves labeled claims and rejects non-facts as user facts', () => {
  const validDirectory = root();
  try {
    const input = manifest(validDirectory);
    publishFinalEvidenceV2(validDirectory, input);
    const published = checkFinalEvidenceV2(validDirectory).claimPublication;
    assert.deepEqual(published.userFacts, ['requested-outcome']);
    assert.deepEqual(published.workingContext, ['layout-option', 'implementation-order']);
    assert.deepEqual(published.claims.map((claim) => claim.status), ['confirmed', 'hypothesis', 'temporary-decision']);
  } finally {
    clean(validDirectory);
  }

  const invalidDirectory = root();
  try {
    const input = manifest(invalidDirectory);
    const claimInput = claimPublication();
    const malformed = {
      ...claimInput,
      userFacts: ['requested-outcome', 'layout-option'],
      workingContext: ['implementation-order'],
    };
    assert.throws(
      () => guardedPublishFinalEvidenceV2(invalidDirectory, { ...input, claimPublication: malformed }, finalEvidenceInvocation(invalidDirectory)),
      (error: unknown) => error instanceof EvidenceClaimError && error.code === 'UNCONFIRMED_USER_FACT',
    );
    assert.equal(existsSync(join(invalidDirectory, '.omd', 'final-evidence-v2.json')), false);
    assert.equal(existsSync(join(invalidDirectory, '.omd', '.final-evidence-v2.lock')), false);
  } finally {
    clean(invalidDirectory);
  }
});

test('the final graph root binds complete stable current frame bytes', () => {
  const directory = root(); try {
    const input = manifest(directory);
    publishFinalEvidenceV2(directory, input);
    writeFileSync(join(directory, '.omd', 'frame.md'), '---\nuxTask: evaluate the launch\nuxFrequentAction: compare the direction\nuxCostliestError: publish an incorrect direction\nuxSurface: marketing\n---\n\nChanged current-frame content.\n');
    assert.throws(() => checkFinalEvidenceV2(directory), /graph root hash changed|composition contract is not semantically valid/);
  } finally { clean(directory); }
});
test('malformed # Copy cannot publish even when its receipt hash is updated', () => {
  const directory = root(); try {
    const input = manifest(directory);
    const malformed = '# Copy\n';
    writeFileSync(join(directory, '.omd', 'copy-deck.md'), malformed);
    const descriptor = input.graph.copy as { path: string; sha256: string };
    const copy = JSON.parse(readFileSync(join(directory, descriptor.path), 'utf8')) as Record<string, unknown>;
    const bytes = `${canonical({ ...copy, copyDeckSha256: copyDeckSha256(Buffer.from(malformed)) })}\n`;
    writeFileSync(join(directory, descriptor.path), bytes);
    descriptor.sha256 = sha(bytes);
    assert.throws(() => publishFinalEvidenceV2(directory, input), /copy receipt does not bind the canonical copy deck/);
  } finally { clean(directory); }
});
test('closed none enums pass while placeholder art-direction prose fails', () => {
  const validDirectory = root(); try {
    assert.doesNotThrow(() => publishFinalEvidenceV2(validDirectory, manifest(validDirectory)));
  } finally { clean(validDirectory); }
  for (const placeholder of ['todo', 'placeholder']) {
    const invalidDirectory = root(); try {
      const input = manifest(invalidDirectory);
      const path = join(invalidDirectory, input.graph.artDirection.path);
      const artDirection = JSON.parse(readFileSync(path, 'utf8')) as { decision: Record<string, unknown>; decisionSha256: string };
      artDirection.decision.fallbackPath = placeholder;
      artDirection.decisionSha256 = artDirectionSha256(artDirection.decision);
      const bytes = `${canonical(artDirection)}\n`;
      writeFileSync(path, bytes);
      setReceiptSha(input.graph.artDirection, sha(bytes));
      assert.throws(() => publishFinalEvidenceV2(invalidDirectory, input), /hand-authored placeholder/);
    } finally { clean(invalidDirectory); }
  }
});
test('final reviewer lanes require their own verdicts, floors, reviewers, session evidence, and current build', () => {
  const replaceLane = (
    directory: string,
    input: FinalEvidenceV2Manifest,
    lane: 'blindLane' | 'fidelityLane' | 'protocolLane',
    mutate: (value: Record<string, unknown>) => Record<string, unknown>,
  ): void => {
    const descriptor = input.graph[lane];
    const value = JSON.parse(readFileSync(join(directory, descriptor.path), 'utf8')) as Record<string, unknown>;
    const bytes = `${canonical(mutate(value))}\n`;
    writeFileSync(join(directory, descriptor.path), bytes);
    setReceiptSha(descriptor, sha(bytes));
  };
  const validDirectory = root(); try {
    assert.doesNotThrow(() => publishFinalEvidenceV2(validDirectory, manifest(validDirectory)));
  } finally { clean(validDirectory); }
  const scenarios: readonly [string, (directory: string, input: FinalEvidenceV2Manifest) => void][] = [
    ['swapped generic lanes', (directory, input) => replaceLane(directory, input, 'blindLane', (lane) => ({ ...lane, verdicts: { independentVisual: 'GREEN', independentProtocol: 'GREEN' }, criticalFloors: { fidelity: 3 } }))],
    ['missing or wrong floor dimensions', (directory, input) => replaceLane(directory, input, 'fidelityLane', (lane) => ({ ...lane, criticalFloors: { desktop: 3, composition: 3 } }))],
    ['duplicate reviewer identities', (directory, input) => {
      const blind = JSON.parse(readFileSync(join(directory, input.graph.blindLane.path), 'utf8')) as { provenance: { reviewerIds: string[] } };
      replaceLane(directory, input, 'protocolLane', (lane) => ({ ...lane, provenance: { ...(lane.provenance as Record<string, unknown>), reviewerIds: blind.provenance.reviewerIds } }));
    }],
    ['forged or unbound reviewer session evidence', (directory, input) => replaceLane(directory, input, 'blindLane', (lane) => ({ ...lane, provenance: { ...(lane.provenance as Record<string, unknown>), reviewerSessionSha256: sha('forged-session') } }))],
    ['stale lane evidence', (directory, input) => replaceLane(directory, input, 'protocolLane', (lane) => ({ ...lane, buildSha256: sha('stale-build') }))],
  ];
  for (const [scenario, mutate] of scenarios) {
    const directory = root(); try {
      const input = manifest(directory);
      mutate(directory, input);
      assert.throws(() => publishFinalEvidenceV2(directory, input), new RegExp(scenario === 'stale lane evidence' ? 'does not bind art direction and build' : 'final-evidence-v2 graph'));
    } finally { clean(directory); }
  }
});

test('digest-only, missing, mixed, branch-mismatched, red, and forked graphs cannot publish', () => {
  const directory = root(); try {
    assert.throws(() => validateFinalEvidenceV2Manifest({ schema: 'final-evidence-v2', motionDecision: 'none', bindings: { activationHash: 'a'.repeat(64) } }));
    for (const mutate of [
      (input: FinalEvidenceV2Manifest) => { rmSync(join(directory, input.graph.copy.path)); },
      (input: FinalEvidenceV2Manifest) => { setGraphFixture(input, 'board', { ...input.graph.board, schema: 'board-v1' }); },
      (input: FinalEvidenceV2Manifest) => { (input as { motionEvidence?: unknown }).motionEvidence = input.staticEvidence; },
      (input: FinalEvidenceV2Manifest) => { const lane = JSON.parse(readFileSync(join(directory, input.graph.blindLane.path), 'utf8')) as Record<string, unknown>; const bytes = `${canonical({ ...lane, verdicts: { blindVisual: 'RED', blindNarrative: 'GREEN' } })}\n`; writeFileSync(join(directory, input.graph.blindLane.path), bytes); setReceiptSha(input.graph.blindLane, sha(bytes)); },
      (input: FinalEvidenceV2Manifest) => { setGraphFixture(input, 'observations', [input.graph.observations[0], receipt(directory, 'fork', 'observation-v2', { schema: 'observation-v2', buildSha256: sha('build-output'), currentArtifact: { path: input.graph.buildIdentity.path, sha256: input.graph.buildIdentity.sha256 }, predecessorSha256: null, observedAt: '2026-01-01T00:02:00.000Z', evidence: {} })]); },
    ]) {
      const input = manifest(directory); mutate(input); assert.throws(() => publishFinalEvidenceV2(directory, input)); assert.equal(existsSync(join(directory, '.omd', 'final-evidence-v2.json')), false);
    }
  } finally { clean(directory); }
});
test('final graph rejects unhost-authorized current intent bytes and duplicate reviewer observation sets', () => {
  const directory = root(); try {
    const input = manifest(directory);
    const noIntentInvocation = finalEvidenceInvocation(directory);
    authorizeTestProjectRunPayloads(
      directory,
      noIntentInvocation,
      finalEvidenceGraphAuthorizations(directory, input).filter(({ purpose }) => purpose !== 'current-intent-ledger'),
    );
    assert.throws(
      () => validateFinalEvidenceV2GraphFiles(directory, input.graph, finalEvidenceGraphFilesystem, noIntentInvocation),
      /current-intent-ledger/,
    );

    const lane = JSON.parse(readFileSync(join(directory, input.graph.blindLane.path), 'utf8')) as {
      provenance: { observationSha256s: string[] };
    };
    const bytes = `${canonical({
      ...lane,
      provenance: { ...lane.provenance, observationSha256s: [required(lane.provenance.observationSha256s[0], 'lane observation'), required(lane.provenance.observationSha256s[0], 'lane observation')] },
    })}\n`;
    writeFileSync(join(directory, input.graph.blindLane.path), bytes);
    (input.graph.blindLane as { sha256: string }).sha256 = sha(bytes);
    const duplicateLaneInvocation = finalEvidenceInvocation(directory);
    authorizeTestProjectRunPayloads(directory, duplicateLaneInvocation, finalEvidenceGraphAuthorizations(directory, input));
    assert.throws(
      () => validateFinalEvidenceV2GraphFiles(directory, input.graph, finalEvidenceGraphFilesystem, duplicateLaneInvocation),
      /duplicate-free observed evidence set/,
    );
  } finally { clean(directory); }
});
test('final graph rejects duplicate semantic observations and execution observation sets', () => {
  const directory = root(); try {
    const input = manifest(directory);
    const firstObservation = required(input.graph.observations[0], 'first observation');
    const first = JSON.parse(readFileSync(join(directory, firstObservation.path), 'utf8')) as Record<string, unknown>;
    setGraphFixture(input, 'observations', [...input.graph.observations, receipt(directory, 'observation-duplicate', 'observation-v2', first)]);
    const duplicateGraphInvocation = finalEvidenceInvocation(directory);
    authorizeTestProjectRunPayloads(directory, duplicateGraphInvocation, finalEvidenceGraphAuthorizations(directory, input));
    assert.throws(
      () => validateFinalEvidenceV2GraphFiles(directory, input.graph, finalEvidenceGraphFilesystem, duplicateGraphInvocation),
      /graph observations must be a duplicate-free exact set/,
    );

    const executionInput = manifest(directory);
    const lane = JSON.parse(readFileSync(join(directory, executionInput.graph.blindLane.path), 'utf8')) as {
      executionReceipts: Array<{ path: string; sha256: string }>;
    };
    const executionReceipt = required(lane.executionReceipts[0], 'lane execution receipt');
    const executionPath = executionReceipt.path;
    const execution = JSON.parse(readFileSync(join(directory, executionPath), 'utf8')) as { observationSha256s: string[] };
    const executionObservation = required(execution.observationSha256s[0], 'execution observation');
    const executionBytes = `${canonical({ ...execution, observationSha256s: [executionObservation, executionObservation] })}\n`;
    writeFileSync(join(directory, executionPath), executionBytes);
    executionReceipt.sha256 = sha(executionBytes);
    const laneBytes = `${canonical(lane)}\n`;
    writeFileSync(join(directory, executionInput.graph.blindLane.path), laneBytes);
    (executionInput.graph.blindLane as { sha256: string }).sha256 = sha(laneBytes);
    const duplicateExecutionInvocation = finalEvidenceInvocation(directory);
    authorizeTestProjectRunPayloads(directory, duplicateExecutionInvocation, finalEvidenceGraphAuthorizations(directory, executionInput));
    assert.throws(
      () => validateFinalEvidenceV2GraphFiles(directory, executionInput.graph, finalEvidenceGraphFilesystem, duplicateExecutionInvocation),
      /duplicate-free lane observation set/,
    );
  } finally { clean(directory); }
});
test('production APIs reject unissued filesystem seams and issued writers cannot be mutated', () => {
  const directory = root(); try {
    const invocation = finalEvidenceInvocation(directory);
    assert.throws(
      () => Reflect.apply(guardedCheckFinalEvidenceV2, undefined, [directory, invocation, { fs: { readFile: readFileSync } }]),
      /does not accept caller-controlled seams/,
    );
    const adapter = createTestProjectWriteAdapter(directory);
    assert.equal(Object.isFrozen(adapter), true);
    assert.equal(Reflect.set(adapter, 'write', () => directory), false);
    assert.doesNotThrow(() => requireProjectWriteAdapter(directory, adapter));
  } finally { clean(directory); }
});
test('selected reference distance gates new art-selected publication', () => {
  const passing = root(); try {
    assert.doesNotThrow(() => publishFinalEvidenceV2(passing, manifest(passing)));
  } finally { clean(passing); }

  for (const scenario of ['missing', 'failed', 'stale-selection', 'wrong-target', 'wrong-slot'] as const) {
    const directory = root(); try {
      const input = manifest(directory);
      const graph = input.graph as typeof input.graph & { referenceDistance?: ArtifactReceipt };
      const descriptor = required(graph.referenceDistance, 'selected reference distance');
      if (scenario === 'missing') {
        delete graph.referenceDistance;
      } else {
        const value = JSON.parse(readFileSync(join(directory, descriptor.path), 'utf8')) as {
          selectionSha256: string;
          target: string;
          verdict: 'pass' | 'fail';
          comparisons: Array<{ similarity: number; slotId: string }>;
        };
        if (scenario === 'failed') {
          value.comparisons[0]!.similarity = 0.1;
          value.verdict = 'fail';
        } else if (scenario === 'stale-selection') {
          value.selectionSha256 = sha('stale-selection');
        } else if (scenario === 'wrong-target') {
          value.target = 'file://wrong-target/';
        } else {
          value.comparisons[0]!.slotId = 'forged-slot';
        }
        const bytes = canonical(value);
        writeFileSync(join(directory, descriptor.path), bytes);
        (descriptor as { sha256: string }).sha256 = sha(bytes);
      }
      assert.throws(
        () => publishFinalEvidenceV2(directory, input),
        /selected reference distance|referenceDistance/,
        scenario,
      );
      assert.equal(existsSync(join(directory, '.omd', 'final-evidence-v2.json')), false);
    } finally { clean(directory); }
  }
});
test('unrelated usage raw-board, assembly, or selection receipt bindings cannot substitute selected artifacts', () => {
  const directory = root(); try {
    for (const field of ['captureSha256', 'assemblySha256', 'projectionSha256', 'selectionSha256', 'settledSelectionSha256'] as const) {
      const input = manifest(directory);
      const usage = JSON.parse(readFileSync(join(directory, input.graph.usage.path), 'utf8')) as Record<string, unknown>;
      const bytes = `${canonical({ ...usage, [field]: sha(`unrelated-${field}`) })}\n`;
      writeFileSync(join(directory, input.graph.usage.path), bytes);
      setReceiptSha(input.graph.usage, sha(bytes));
      assert.throws(() => publishFinalEvidenceV2(directory, input));
      assert.equal(existsSync(join(directory, '.omd', 'final-evidence-v2.json')), false);
    }
  } finally { clean(directory); }
});
test('pre-selection and settled-selection receipts reject their distinct joins', () => {
  const directory = root(); try {
    const preSubstituted = manifest(directory);
    setGraphFixture(preSubstituted, 'selection', receipt(directory, 'settled-as-pre-selection', 'reference-selection-v2', JSON.parse(readFileSync(join(directory, preSubstituted.graph.settledSelection.path), 'utf8')) as Record<string, unknown>));
    assert.throws(() => publishFinalEvidenceV2(directory, preSubstituted), /immutable pre-selection/);

    const settledSubstituted = manifest(directory);
    setGraphFixture(settledSubstituted, 'settledSelection', receipt(directory, 'pre-as-settled-selection', 'reference-selection-v2', JSON.parse(readFileSync(join(directory, settledSubstituted.graph.selection.path), 'utf8')) as Record<string, unknown>));
    assert.throws(() => publishFinalEvidenceV2(directory, settledSubstituted), /settled capture, assembly, projection, and selection/);
  } finally { clean(directory); }
});
test('semantic-edge substitutions cannot cross canonical graph joins', () => {
  const directory = root(); try {
    const rewrite = (input: FinalEvidenceV2Manifest, key: 'handoff' | 'copy' | 'renderedBeats' | 'sourceSeal' | 'buildIdentity' | 'blindLane', value: Record<string, unknown>): void => {
      const descriptor = input.graph[key];
      const bytes = `${canonical(value)}\n`;
      writeFileSync(join(directory, descriptor.path), bytes);
      (descriptor as { sha256: string }).sha256 = sha(bytes);
    };
    for (const field of ['captureSha256', 'assemblySha256', 'projectionSha256', 'preSelectionSha256'] as const) {
      const input = manifest(directory);
      const handoff = parseReferenceHandoffReceipt(JSON.parse(readFileSync(join(directory, input.graph.handoff.path), 'utf8')));
      const { payloadSha256: _payloadSha256, ...payload } = handoff;
      const substituted: Omit<ReferenceHandoffReceipt, 'payloadSha256'> = { ...payload, [field]: sha(`substituted-handoff-${field}`) };
      rewrite(input, 'handoff', { ...substituted, payloadSha256: referenceHandoffPayloadSha256(substituted) });
      assert.throws(() => publishFinalEvidenceV2(directory, input));
    }
    for (const [key, mutate] of [
      ['copy', (value: Record<string, unknown>) => ({ ...value, artDirectionSha256: sha('substituted-copy-art-direction') })],
      ['renderedBeats', (value: Record<string, unknown>) => ({ ...value, copySha256: sha('substituted-rendered-beats-copy') })],
      ['sourceSeal', (value: Record<string, unknown>) => ({ ...value, inputs: { ...(value.inputs as Record<string, unknown>), copyDeckSha256: sha('substituted-source-seal-copy') } })],
      ['buildIdentity', (value: Record<string, unknown>) => ({ ...value, buildSha256: sha('substituted-build') })],
      ['blindLane', (value: Record<string, unknown>) => ({ ...value, artDirectionSha256: sha('substituted-lane-art-direction') })],
    ] as const) {
      const input = manifest(directory);
      const descriptor = input.graph[key];
      const value = JSON.parse(readFileSync(join(directory, descriptor.path), 'utf8')) as Record<string, unknown>;
      rewrite(input, key, mutate(value));
      assert.throws(() => publishFinalEvidenceV2(directory, input));
    }
    const input = manifest(directory);
    const staticEvidence = required(input.staticEvidence, 'static evidence');
    const value = JSON.parse(readFileSync(join(directory, staticEvidence.path), 'utf8')) as Record<string, unknown>;
    const bytes = `${canonical({ ...value, artDirectionHash: input.graph.artDirection.sha256 })}\n`;
    writeFileSync(join(directory, staticEvidence.path), bytes);
    setReceiptSha(staticEvidence, sha(bytes));
    assert.throws(() => publishFinalEvidenceV2(directory, input));
  } finally { clean(directory); }
});
test('motion evidence accepts one observed scene and rejects empty or multi-scene branches', async () => {
  const directory = root(); try {
    const input = manifest(directory, 'one');
    const artDirectionHash = artDirectionSha256(JSON.parse(readFileSync(join(directory, input.graph.artDirection.path), 'utf8')));
    const buildHash = (JSON.parse(readFileSync(join(directory, input.graph.activation.path), 'utf8')) as { buildSha256: string }).buildSha256;
    const target = join(directory, 'motion.html');
    writeFileSync(target, `<!doctype html><html><style>
      html, body { width: 100%; height: 100%; margin: 0; }
      #scene { width: 240px; height: 180px; background: #111; animation: production-scene 1000ms linear 100ms forwards; }
      @keyframes production-scene { to { background: #eee; } }
      @media (prefers-reduced-motion: reduce) { #scene { background: #eee; animation: none !important; } }
    </style><body><main id="scene">motion</main></body></html>`);
    const observationDirectory = join(directory, '.omd', 'motion-observations', 'run-1');
    const invocation = finalEvidenceInvocation(directory);
    const adapter = createProjectWriteAdapter(directory, invocation);
    adapter.mkdir('.omd/motion-observations/run-1');
    const motion = await captureMotionEvidenceV2(target, {
      viewport: { width: 390, height: 300 }, outDir: observationDirectory, runId: 'run-1', buildHash,
      artDirectionHash, route: '/', taskId: 'motion-proof', invocation,
      referenceSlotId: 'motion-reference', selector: '#scene',
      trigger: 'load', intervalMs: 160, adapter,
    });
    const scene = required(motion.scenes[0], 'motion scene');
    for (const [stage, capture] of Object.entries({
      start: scene.start.capture,
      mid: scene.mid.capture,
      end: scene.end.capture,
      reduced: scene.reducedMotion.capture,
    })) {
      assert.equal(capture.path, `.omd/motion-observations/run-1/run-1-${stage}.png`);
      assert.deepEqual(readFileSync(join(directory, capture.path)), Buffer.from(capture.bytesBase64, 'base64'));
    }
    const sourceSealValue = createSourceSeal(directory, '2026-01-01T00:00:00.000Z');
    writeFileSync(join(directory, '.omd', 'source-seal.json'), `${canonical(sourceSealValue)}\n`);
    (input.graph.sourceSeal as { sha256: string }).sha256 = sha(readFileSync(join(directory, '.omd', 'source-seal.json')));
    const publish = (name: string) => {
      const originalDirectory = process.cwd();
      try {
        process.chdir(directory);
        return publishFinalEvidenceV2(directory, {
          ...input,
          motionEvidence: receipt(directory, name, 'motion-evidence-v2', motion),
        });
      } finally {
        process.chdir(originalDirectory);
      }
    };
    assert.doesNotThrow(() => publish('motion-one'));
    assert.doesNotThrow(() => publish('motion-one'));
    assert.throws(
      () => publishFinalEvidenceV2(directory, {
        ...input,
        motionEvidence: receipt(directory, 'motion-replay', 'motion-evidence-v2', motion),
      }),
      /durably consumed/,
    );
    rmSync(join(directory, '.omd', 'final-evidence-v2.json'));
    assert.throws(() => publish('motion-one'), /durably consumed/);
    const noScenes: unknown = { ...motion, scenes: [] };
    assert.throws(() => validateMotionEvidenceV2(noScenes, { motionDecision: 'one', buildHash, artDirectionHash, root: directory }), /exactly one|one requires exactly one/);
    const twoScenes: unknown = { ...motion, scenes: [scene, scene] };
    assert.throws(() => validateMotionEvidenceV2(twoScenes, { motionDecision: 'one', buildHash, artDirectionHash, root: directory }), /exactly one|one requires exactly one/);
  } finally { clean(directory); }
});

test('orphan GC rejects symlinked runs and quarantine parent directories', () => {
  const runsDirectory = root(); const quarantineDirectory = root(); const outside = root(); try {
    mkdirSync(join(runsDirectory, '.omd'), { recursive: true });
    symlinkSync(outside, join(runsDirectory, '.omd', 'final-evidence-v2-runs'));
    assert.throws(() => garbageCollectFinalEvidenceV2(runsDirectory, { dryRun: false }), /GC runs parent/);

    mkdirSync(join(quarantineDirectory, '.omd', 'final-evidence-v2-runs'), { recursive: true });
    symlinkSync(outside, join(quarantineDirectory, '.omd', 'final-evidence-v2-quarantine'));
    assert.throws(() => garbageCollectFinalEvidenceV2(quarantineDirectory, { dryRun: true }), /GC quarantine parent/);
  } finally { clean(runsDirectory); clean(quarantineDirectory); clean(outside); }
});

test('unguarded final-v2 publication cannot create its output directory', () => {
  const directory = root(); try {
    assert.throws(() => guardedPublishFinalEvidenceV2(directory, manifest(directory), {} as never));
    assert.equal(existsSync(join(directory, '.omd', 'final-evidence-v2.json')), false);
  } finally { clean(directory); }
});

test('content-addressed record symlinks fail closed on EEXIST publication and post-commit validation', () => {
  const directory = root(); const outside = root(); try {
    const input = manifest(directory);
    const invocation = finalEvidenceInvocation(directory); authorizeTestProjectRunPayloads(directory, invocation, finalEvidenceGraphAuthorizations(directory, input));
    const graphRootHash = validateFinalEvidenceV2GraphFiles(directory, input.graph, finalEvidenceGraphFilesystem, invocation).rootHash;
    const record = `sha256-${sha(`${canonical({ ...input, graphRootHash })}\n`)}.json`;
    const recordPath = join(directory, '.omd', 'final-evidence-v2-runs', record);
    mkdirSync(join(directory, '.omd', 'final-evidence-v2-runs'), { recursive: true });
    const outsideRecord = join(outside, 'record.json'); writeFileSync(outsideRecord, '{}\n'); symlinkSync(outsideRecord, recordPath);
    assert.throws(() => publishFinalEvidenceV2(directory, input), /unsafe file|content-addressed record/);
    assert.equal(existsSync(join(directory, '.omd', 'final-evidence-v2.json')), false);
    rmSync(recordPath);

    publishFinalEvidenceV2(directory, input);
    rmSync(recordPath);
    symlinkSync(outsideRecord, recordPath);
    const postCommitInvocation = finalEvidenceInvocation(directory);
    const persistedManifest = Buffer.from(`${canonical({ ...input, graphRootHash })}\n`);
    authorizeTestProjectRunPayloads(directory, postCommitInvocation, [{ purpose: 'final-reviewer-lane', payload: readFileSync(join(directory, '.omd', 'final-evidence-v2.json')) }, { purpose: 'final-evidence-manifest', payload: persistedManifest }, ...finalEvidenceGraphAuthorizations(directory, input)]);
    assert.throws(() => guardedCheckFinalEvidenceV2(directory, postCommitInvocation), /unsafe file|final evidence record/);
    writeFileSync(join(directory, '.omd', '.final-evidence-v2.lock'), JSON.stringify({ schema: 'final-evidence-v2-lock', operation: 'publication', hash: sha(readFileSync(join(directory, '.omd', 'final-evidence-v2.json'))), host: 'host', pid: 1, startedAt: 0 }));
    assert.throws(() => guardedRecoverFinalEvidenceV2Lock(directory, postCommitInvocation), /unsafe file|final evidence record|lock owner liveness/);
  } finally { clean(directory); clean(outside); }
});

test('product and mixed final-v2 publications require current typed task evidence', () => {
  for (const surface of ['product', 'mixed'] as const) {
    const directory = root(); try {
      let input = manifest(directory); writeFileSync(join(directory, '.omd', 'frame.md'), taskFrame(surface)); input = refreshSourceSeal(directory, input);
      assert.throws(() => publishFinalEvidenceV2(directory, input), /requires current task evidence/);
      input = attachCurrentTaskEvidence(directory, input, surface);
      const invocation = finalEvidenceInvocation(directory);
      authorizeTestProjectRunPayloads(directory, invocation, finalEvidenceGraphAuthorizations(directory, input));
      const graph = validateFinalEvidenceV2GraphFiles(directory, input.graph, finalEvidenceGraphFilesystem, invocation);
      assert.deepEqual(graph.bindings.motionTask, {
        taskId: 'T1',
        route: '/',
        targets: ['http://localhost/'],
      });
      publishFinalEvidenceV2(directory, input);
      rmSync(join(directory, '.omd', 'task-evidence.json'));
      assert.throws(() => checkFinalEvidenceV2(directory), /ENOENT|current task evidence validation failed|task evidence/);
    } finally { clean(directory); }
  }
});
test('product routes reject a one signature scene even with current task evidence', () => {
  const directory = root(); try {
    let input = manifest(directory, 'one');
    input = attachCurrentTaskEvidence(directory, input, 'product');
    assert.throws(() => publishFinalEvidenceV2(directory, input), /product routes cannot publish an unscoped signature scene/);
  } finally { clean(directory); }
});

test('showpiece product motion publishes only when task evidence scopes its target', () => {
  const directory = root(); try {
    let input = manifest(directory, 'one', 'showpiece');
    input = attachCurrentTaskEvidence(directory, input, 'product');
    const invocation = finalEvidenceInvocation(directory);
    authorizeTestProjectRunPayloads(
      directory,
      invocation,
      finalEvidenceGraphAuthorizations(directory, input),
    );
    assert.doesNotThrow(() => validateFinalEvidenceV2GraphFiles(
      directory,
      input.graph,
      finalEvidenceGraphFilesystem,
      invocation,
    ));
  } finally { clean(directory); }
});

test('product final-v2 evidence rejects stale task evidence and marketing, editorial, or static frames reject task matrices', () => {
  const product = root(); try {
    let input = manifest(product); input = attachCurrentTaskEvidence(product, input, 'product'); publishFinalEvidenceV2(product, input);
    writeFileSync(join(product, '.omd', 'frame.md'), taskFrame('product', 'changed'));
    assert.throws(() => checkFinalEvidenceV2(product), /current task evidence validation failed|task evidence/);
  } finally { clean(product); }

  for (const surface of ['marketing', 'editorial', 'static'] as const) {
    const directory = root(); try {
      let input = manifest(directory); input = attachCurrentTaskEvidence(directory, input, 'product');
      writeFileSync(join(directory, '.omd', 'frame.md'), taskFrame(surface)); input = refreshSourceSeal(directory, input);
      assert.throws(() => publishFinalEvidenceV2(directory, input), /current frame fails UX contract: FRAME-UX-INCOMPLETE/);
    } finally { clean(directory); }
  }
});
test('task evidence surface must exactly match the current frame in both directions', () => {
  const product = root(); try {
    let input = manifest(product);
    input = attachCurrentTaskEvidence(product, input, 'product');
    assert.doesNotThrow(() => publishFinalEvidenceV2(product, input));
  } finally { clean(product); }

  const mixedEvidenceForProduct = root(); try {
    let input = manifest(mixedEvidenceForProduct);
    input = attachCurrentTaskEvidence(mixedEvidenceForProduct, input, 'mixed');
    writeFileSync(join(mixedEvidenceForProduct, '.omd', 'frame.md'), taskFrame('product'));
    input = refreshSourceSeal(mixedEvidenceForProduct, input);
    assert.throws(() => publishFinalEvidenceV2(mixedEvidenceForProduct, input), {
      message: 'final-evidence-v2 graph: current task evidence validation failed: frame or composition digest mismatch',
    });
  } finally { clean(mixedEvidenceForProduct); }

  const taskMatrixForMarketing = root(); try {
    let input = manifest(taskMatrixForMarketing);
    input = attachCurrentTaskEvidence(taskMatrixForMarketing, input, 'product');
    writeFileSync(join(taskMatrixForMarketing, '.omd', 'frame.md'), '---\nuxTask: evaluate the launch\nuxFrequentAction: compare the direction\nuxCostliestError: publish an incorrect direction\nuxSurface: marketing\n---\n');
    input = refreshSourceSeal(taskMatrixForMarketing, input);
    assert.throws(() => publishFinalEvidenceV2(taskMatrixForMarketing, input), {
      message: 'final-evidence-v2 graph: marketing final publication must not include task evidence',
    });
  } finally { clean(taskMatrixForMarketing); }
});
test('project writes reject an existing symlink ancestor', () => {
  const directory = root(); const outside = root(); try {
    symlinkSync(outside, join(directory, 'linked'));
    assert.throws(() => writeProjectFile({
      projectRoot: directory,
      relativePath: 'linked/escape.txt',
      content: 'blocked',
      invocation: createTestProjectRunInvocation(directory),
    }));
    assert.equal(existsSync(join(outside, 'escape.txt')), false);
  } finally { clean(directory); clean(outside); }
});
test('project writes reject an existing symlink leaf target', () => {
  const directory = root(); const outside = root(); try {
    const outsideTarget = join(outside, 'target.txt');
    writeFileSync(outsideTarget, 'original');
    symlinkSync(outsideTarget, join(directory, 'leaf.txt'));
    assert.throws(() => writeProjectFile({
      projectRoot: directory,
      relativePath: 'leaf.txt',
      content: 'blocked',
      invocation: createTestProjectRunInvocation(directory),
    }));
    assert.equal(readFileSync(outsideTarget, 'utf8'), 'original');
  } finally { clean(directory); clean(outside); }
});
test('motionDecision one rejects every additional scroll-scene evidence carrier', () => {
  const directory = root(); try {
    const input = manifest(directory, 'one', 'showpiece');
    const extra = receipt(directory, 'scroll', 'scroll-scene-evidence-v1', { schema: 'scroll-scene-evidence-v1' });
    assert.throws(
      () => validateFinalEvidenceV2Manifest({ ...input, scrollSceneEvidence: extra }),
      /unexpected keys|exactly one motion evidence/,
    );
  } finally { clean(directory); }
});
test('observation-v2 rejects forged currentness and persists only redacted hash-chained evidence', () => {
  const directory = root(); try {
    const artifactPath = join(directory, '.omd', 'current-artifact.json');
    mkdirSync(join(directory, '.omd'), { recursive: true });
    const buildSha256 = sha('current-build');
    writeFileSync(artifactPath, `${JSON.stringify({ buildSha256 })}\n`);
    const currentArtifact = { path: '.omd/current-artifact.json', sha256: sha(readFileSync(artifactPath)) };
    const writer = createTestProjectWriteAdapter(directory);
    assert.throws(() => writeObservationV2(directory, { currentArtifact: { ...currentArtifact, sha256: sha('forged') }, buildSha256, evidence: {} }, writer), /stale/);
    assert.throws(() => writeObservationV2(directory, { currentArtifact, buildSha256, evidence: {}, observedAt: 'not-a-date' }, writer), /observedAt/);
    const first = writeObservationV2(directory, { currentArtifact, buildSha256, observedAt: '2026-01-01T00:00:00.000Z', evidence: { email: 'person@example.com', nested: { authorization: 'Bearer super-secret-token-value-123456' } } }, writer);
    const second = writeObservationV2(directory, { currentArtifact, buildSha256, observedAt: '2026-01-02T00:00:00.000Z', evidence: { note: 'safe' } }, writer);
    writeFileSync(artifactPath, '{"current":false}\n');
    assert.throws(() => writeObservationV2(directory, { currentArtifact, buildSha256, evidence: {} }, writer), /stale/);
    assert.deepEqual(first.evidence, { email: '[REDACTED]', nested: { authorization: '[REDACTED]' } });
    assert.equal(readCurrentObservationV2(directory)?.predecessorSha256, observationV2Sha256(first));
    assert.equal(second.predecessorSha256, observationV2Sha256(first));
    assert.doesNotMatch(readFileSync(join(directory, '.omd', 'observation-v2.json'), 'utf8') + readFileSync(join(directory, '.omd', 'observation-v2', `sha256-${observationV2Sha256(first)}.json`), 'utf8'), /person@example\.com|super-secret-token/);
  } finally { clean(directory); }
});

test('observation-v2 preserves current trusted reference formats without weakening secret redaction', () => {
  const digest = 'a'.repeat(64);
  const decisionDigest = 'b'.repeat(64);
  const trusted = [
    `decision:${digest}:evidence-gated-case-workspace:${decisionDigest}`,
    `outcome:${digest}:mustNotHave:0:${decisionDigest}`,
    `outcome:${digest}:completionEvidence:1:${decisionDigest}`,
  ];
  assert.deepEqual(redactObservationEvidence(trusted), trusted);
  assert.deepEqual(redactObservationEvidence({
    prerequisiteTaskId: 'identify-exception-shipment',
    dependentTaskId: 'inspect-temperature-excursion',
  }), {
    prerequisiteTaskId: 'identify-exception-shipment',
    dependentTaskId: 'inspect-temperature-excursion',
  });
  assert.equal(
    redactObservationEvidence(`decision:${digest}:invalid id:${decisionDigest}`),
    'decision:[REDACTED]:invalid id:[REDACTED]',
  );
  assert.deepEqual(redactObservationEvidence({ prerequisiteTaskId: 'Bearer super-secret-token-value-123456' }), { prerequisiteTaskId: '[REDACTED]' });
  assert.equal(redactObservationEvidence('Bearer super-secret-token-value-123456'), '[REDACTED]');
});

test('observation retention keeps graph-current records and requires a trusted writer', () => {
  const directory = root(); try {
    const artifactPath = join(directory, '.omd', 'current-artifact.json');
    const buildSha256 = sha('current-build');
    mkdirSync(join(directory, '.omd'), { recursive: true }); writeFileSync(artifactPath, JSON.stringify({ buildSha256 }));
    const currentArtifact = { path: '.omd/current-artifact.json', sha256: sha(readFileSync(artifactPath)) };
    const writer = createTestProjectWriteAdapter(directory);
    writeObservationV2(directory, { currentArtifact, buildSha256, observedAt: '2026-01-01T00:00:00.000Z', evidence: { id: 1 } }, writer);
    writeObservationV2(directory, { currentArtifact, buildSha256, observedAt: '2026-01-02T00:00:00.000Z', evidence: { id: 2 } }, writer);
    const retained = retainObservationV2(directory, { currentArtifact, maxRecords: 1 }, writer);
    assert.equal(retained.retained.length, 2);
    assert.throws(() => retainObservationV2(directory, { currentArtifact, maxRecords: 0 }, writer), /positive integer/);
    assert.throws(() => retainObservationV2(directory, { currentArtifact, maxRecords: 1 }, { projectRoot: directory, mkdir() { return ''; }, write() { return ''; }, writeContentAddressed() { return ''; }, remove() { return ''; }, removeEmptyDirectory() { return ''; } }), /trusted (?:active|immutable) project-write adapter/);
  } finally { clean(directory); }
});

test('legacy v1 migration rechecks published artifacts rather than accepting caller data', () => {
  const directory = root(); try {
    assert.throws(() => attestLegacyV1AsV2(directory, createTestProjectWriteAdapter(directory)), /final-evidence/);
  } finally { clean(directory); }
});
test('rendered Beat evidence rejects stale builds, altered DOM facts, and swapped capture bytes', () => {
  const cases: Array<(directory: string, input: FinalEvidenceV2Manifest) => void> = [
    (directory, input) => {
      const receipt = JSON.parse(readFileSync(join(directory, input.graph.renderedBeats.path), 'utf8')) as Record<string, unknown>;
      const bytes = `${canonical({ ...receipt, buildSha256: sha('stale-render-build') })}\n`;
      writeFileSync(join(directory, input.graph.renderedBeats.path), bytes);
      (input.graph.renderedBeats as { sha256: string }).sha256 = sha(bytes);
    },
    (directory, input) => {
      const receipt = JSON.parse(readFileSync(join(directory, input.graph.renderedBeats.path), 'utf8')) as { renderedBeats: Array<Record<string, unknown>> };
      required(receipt.renderedBeats[0], 'rendered Beat').boundary = false;
      const bytes = `${canonical(receipt)}\n`;
      writeFileSync(join(directory, input.graph.renderedBeats.path), bytes);
      (input.graph.renderedBeats as { sha256: string }).sha256 = sha(bytes);
    },
    (directory, input) => {
      const receipt = JSON.parse(readFileSync(join(directory, input.graph.renderedBeats.path), 'utf8')) as { captures: Array<{ path: string }> };
      writeFileSync(join(directory, required(receipt.captures[0], 'rendered Beat capture').path), 'swapped capture bytes');
    },
  ];
  for (const mutate of cases) {
    const directory = root(); try {
      const input = manifest(directory);
      mutate(directory, input);
      assert.throws(() => publishFinalEvidenceV2(directory, input), /rendered Beat|renderedBeats|current art direction/);
    } finally { clean(directory); }
  }
});
test('final publication recovery derives durable consumptions from the immutable manifest', () => {
  const directory = root(); try {
    const input = manifest(directory);
    publishFinalEvidenceV2(directory, input);
    const pointerPath = join(directory, '.omd', 'final-evidence-v2.json');
    const pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) as { record: string; sha256: string };
    const recoveryInvocation = finalEvidenceInvocation(directory);
    authorizeFinalEvidenceCheck(directory, recoveryInvocation);
    rmSync(pointerPath);
    rmSync(join(directory, '.omd', 'final-evidence-v2-motion-consumptions'), { recursive: true, force: true });
    writeFileSync(join(directory, '.omd', '.final-evidence-v2-publication.journal'), `${canonical({
      schema: 'final-evidence-v2-publication-journal',
      manifestSha256: pointer.sha256,
      pointer: { schema: 'final-evidence-v2-pointer', record: pointer.record, sha256: pointer.sha256 },
    })}\n`);
    writeFileSync(join(directory, '.omd', '.final-evidence-v2.lock'), `${canonical({
      schema: 'final-evidence-v2-lock', operation: 'publication', hash: pointer.sha256, host: hostname(), pid: 999999, startedAt: 0,
    })}\n`);
    assert.equal(guardedRecoverFinalEvidenceV2Lock(directory, recoveryInvocation), true);
    assert.equal(existsSync(pointerPath), true);
    assert.equal(existsSync(join(directory, '.omd', '.final-evidence-v2-publication.journal')), false);
    assert.equal(readdirSync(join(directory, '.omd', 'final-evidence-v2-motion-consumptions')).length, 1);

    writeFileSync(join(directory, '.omd', '.final-evidence-v2.lock'), `${canonical({
      schema: 'final-evidence-v2-lock', operation: 'publication', hash: pointer.sha256, host: hostname(), pid: 999999, startedAt: 0,
    })}\n`);
    assert.equal(recoverFinalEvidenceV2Lock(directory), true);

    rmSync(join(directory, '.omd', 'final-evidence-v2-motion-consumptions'), { recursive: true, force: true });
    assert.throws(() => checkFinalEvidenceV2(directory), /required motion consumption is missing/);
  } finally { clean(directory); }
});
