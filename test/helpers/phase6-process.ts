import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { createProjectWriteAdapter } from '../../core/runtime/project-write.ts';
import { publishTestAdaptiveRoute } from './project-write.ts';
import { readPersistedRoute } from '../../core/route/index.ts';
import { INTERACTIVE_PROCESS_POLICY } from '../../core/route/process-policy.ts';
import { candidateContentProjection, publishCandidatePlan, type CandidatePlan, type CandidateContent, type CandidateSet } from '../../core/brief/candidate-plan.ts';
import { publishCandidatePacket, pendingDirection } from '../../core/brief/candidate-choice.ts';
import { signNativeObservation } from '../../core/runtime/self-signed-activation.ts';
import { hash, digest, fileReceipt, jsonBytes, readReceipt, type Receipt } from '../../core/brief/candidate-data.ts';
import { selectedBaseTokens, type MinimalTokenCommit } from '../../core/tokens/minimal.ts';
import { measureProject } from '../../core/measure/index.ts';
import { parseVisualMeasurement } from '../../core/measure/schema.ts';
import { ACCESSIBILITY_CONCERNS, type SurfacePlan } from '../../core/frame/process-plan.ts';

export const repo = fileURLToPath(new URL('../..', import.meta.url)), pack = join(repo, 'core');
export function write(root: string, path: string, data: string): void { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), data); }
export const snapshot = (root: string) => readdirSync(root, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => { const path = join(e.parentPath, e.name); return [path, hash(readFileSync(path))]; }).sort();
export function routeInput() {
  const input = JSON.parse(readFileSync(join(repo, 'test/fixtures/adaptive-flow/synth-marketing.json'), 'utf8'));
  input.processPolicy = INTERACTIVE_PROCESS_POLICY;
  const s = input.strategyDecision;
  s.roles.push('omd-art-director'); s.methods.push('concept-exploration');
  s.stages = ['domain', 'frame', 'scout', 'reference-board', 'reference-selection', 'copy', 'candidate-generation', 'art-direction', 'type-proof', 'composition', 'production', 'browser-evidence', 'independent-review'];
  s.executionWaves = s.executionWaves.filter((w: { id: string }) => w.id !== 'candidates');
  s.executionWaves.splice(2, 0, { id: 'concepts', mode: 'concurrent', roles: ['omd-art-director', 'omd-sketch'] });
  return input;
}
export const seed: MinimalTokenCommit = { schema: 'token-commit-v3', scope: { representativeSurfaceId: 'main' }, primitives: {
  ink: { type: 'color', value: '#111111' }, paper: { type: 'color', value: '#ffffff' }, family: { type: 'font-family', value: ['system-ui'] }, size: { type: 'number', value: 16, unit: 'px' }, leading: { type: 'number', value: 1.5, unit: 'unitless' }, space: { type: 'number', value: 24, unit: 'px' },
}, semantic: { text: { ref: 'ink' }, canvas: { ref: 'paper' } }, textStyles: { body: { familyRef: 'family', sizeRef: 'size', weight: 400, lineHeightRef: 'leading', letterSpacingRef: null } } };
export const surfacePlan: SurfacePlan = { schema: 'surface-plan-v1', representativeSurfaceId: 'main', views: [{ id: 'desktop-1280x900@1', width: 1280, height: 900 }, { id: 'mobile-390x844@1', width: 390, height: 844 }], surfaces: [
  { id: 'main', purpose: 'Explain patching', taskIds: [], componentIds: ['details'], states: [{ id: 'initial', required: true, reason: 'Entry screen', primaryActionId: null, primaryRequired: false }], viewIds: ['desktop-1280x900@1', 'mobile-390x844@1'], referenceCoverage: 'brief-derived', referenceIds: [], referenceGap: 'Reference acquisition is unverified.', referenceDecision: 'Only supplied content enters the representative study.', contentCases: [] },
  { id: 'details', purpose: 'Disclose supplied terms', taskIds: [], componentIds: ['details'], states: [{ id: 'initial', required: true, reason: 'Details entry', primaryActionId: null, primaryRequired: false }], viewIds: ['mobile-390x844@1'], referenceCoverage: 'brief-derived', referenceIds: [], referenceGap: 'No qualified reference.', referenceDecision: 'Preserve truthful missing terms.', contentCases: [] },
] };
export function frameInput() { return { schema: 'frame-input-v2', problem: 'Explain a patchable synthesizer.', reframe: 'Show the signal relationship with truthful details.', why: 'The original request asks for patching and does not supply commercial terms.', uxTask: 'Understand patching', uxFrequentAction: 'Read details', uxCostliestError: 'Invented commercial claim', uxSurface: 'marketing',
  reality: { schema: 'reality-ledger-v1', mode: 'greenfield', facts: [{ category: 'subject', status: 'supplied', statement: 'Compact patchable synthesizer' }] }, surfacePlan: structuredClone(surfacePlan), validationPlan: { schema: 'validation-plan-v1', items: [] }, accessibilityPlan: { schema: 'accessibility-plan-v1', items: ACCESSIBILITY_CONCERNS.map(concern => ({ id: concern, concern, applicability: 'unknown', surfaceIds: ['main'], taskIds: [], stateIds: ['initial'], viewIds: ['desktop-1280x900@1', 'mobile-390x844@1'], rationale: 'Needs actual applicability assessment.', requiredEvidence: ['actual browser observation'], method: 'browser inspection' })) } }; }
export function fixture(t: { after(fn: () => void): void }, autonomous = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-phase6-'))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = routeInput();
  if (autonomous) {
    const grant = { schema: 'direction-autonomy-grant-v1', projectRoot: root, requestSha256: hash(input.request), userMessage: 'Run autonomously and let the isolated Eye choose the direction.', policy: 'autonomous-direction', source: 'host-user-input' };
    write(root, '.omd/autonomy.json', jsonBytes({ ...grant, signature: signNativeObservation(root, 'direction-autonomy-grant-v1', digest(grant)) }));
    input.processPolicy = { schema: 'human-design-process-v1', interactionMode: 'autonomous', autonomyGrant: fileReceipt(root, '.omd/autonomy.json') };
  }
  const invocation = publishTestAdaptiveRoute(root, input), writer = createProjectWriteAdapter(root, invocation), route = readPersistedRoute(root, invocation);
  const frame = frameInput(); write(root, '.omd/frame.md', `---\n${stringify({ uxSurface: frame.uxSurface, uxTask: frame.uxTask, uxFrequentAction: frame.uxFrequentAction, uxCostliestError: frame.uxCostliestError, reality: frame.reality, surfacePlan: frame.surfacePlan, validationPlan: frame.validationPlan, accessibilityPlan: frame.accessibilityPlan })}---\nFrame\n`);
  write(root, '.omd/tokens.json', jsonBytes(seed));
  const content: CandidateContent = { schema: 'candidate-content-v1', surfaceId: 'main', stateId: 'initial', copy: null, units: [{ id: 'heading', text: 'Patch the instrument', roleId: 'body' }, { id: 'body', text: 'Explore source and destination.', roleId: 'body' }, { id: 'terms', text: 'Commercial terms are not supplied.', roleId: 'body' }], facts: ['A compact patchable synthesizer.'], truthBoundary: 'Representative study, not a functioning preorder.' };
  write(root, '.omd/.cache/sketches/content.json', jsonBytes(content));
  const plan: CandidatePlan = { schema: 'candidate-plan-v2', owner: 'omd-art-director', sourceContractSha256: route.sourceContractSha256, representative: { surfaceId: 'main', stateId: 'initial', selectionReason: 'The shared source-to-destination relationship governs the launch direction.' }, content: { receipt: fileReceipt(root, '.omd/.cache/sketches/content.json'), projectionSha256: candidateContentProjection(root, content), contentIds: content.units.map(u => u.id), status: 'provisional' }, tokens: fileReceipt(root, '.omd/tokens.json'), referenceApplication: null, referenceAnalysis: null, existingSystem: null, views: surfacePlan.views, candidateCount: 2, countReason: 'Two structural readings resolve the uncertainty.', candidates: ['A', 'B'].map(id => ({ id, layoutStrategy: id === 'A' ? 'Vertical reading sequence' : 'Adjacent source/destination columns', relationship: id === 'A' ? 'Read cause before effect' : 'Compare cause and effect', densityStrategy: 'Keep the full three-unit content set.', typographyStrategy: 'Readable neutral system type.', tone: 'Quiet', rationale: 'Fit actual supplied content.', tradeoffs: ['One reading order is emphasized.'], primitiveOverrides: {}, reuse: [], departures: [], falsifier: 'The patching relationship is unclear.' })) };
  return { root, invocation, writer, route, input, frame, content, plan };
}
export type Fixture = ReturnType<typeof fixture>;
export async function renderedSet(f: Fixture, colorOnly = false): Promise<CandidateSet> {
  const plan = publishCandidatePlan(f.root, f.plan, f.writer, f.invocation), candidates: CandidateSet['candidates'][number][] = [];
  for (const c of f.plan.candidates) {
    const source = `.omd/.cache/sketches/${c.id}/index.html`;
    write(f.root, source, `<!doctype html><html><head><title>Representative study</title><style>body{margin:24px;color:${colorOnly && c.id === 'B' ? '#222' : '#111'};background:#fff;font:400 16px/1.5 system-ui}main{display:${c.id === 'A' || colorOnly ? 'block' : 'grid'};grid-template-columns:1fr 1fr;gap:24px}p{font:inherit;margin:0 0 24px}@media(max-width:600px){main{display:block}}</style></head><body><main>${f.content.units.map(u => `<p data-omd-content-id="${u.id}" data-omd-text-style="${u.roleId}">${u.text}</p>`).join('')}</main></body></html>`);
    const measured = await measureProject({ root: f.root, entry: source, writer: f.writer, invocation: f.invocation });
    const packet = parseVisualMeasurement(JSON.parse(readReceipt(f.root, measured.packet).toString('utf8'))), sourceReceipt = fileReceipt(f.root, source);
    candidates.push({ id: c.id, source: sourceReceipt, assets: [], effectiveTokensSha256: digest(selectedBaseTokens(seed, c.primitiveOverrides)), limitations: ['Decision study, not production behavior proof.'], previews: packet.captures.map(p => ({ renderId: `${measured.packet.sha256}:${p.viewId}`, sourceSha256: sourceReceipt.sha256, surfaceId: 'main', stateId: 'initial', viewId: p.viewId, viewport: packet.scope.find(v => v.id === p.viewId)!.viewport, png: p.capture, capture: measured.packet })) });
  }
  return { schema: 'candidate-set-v2', plan, candidates };
}
export function userChoice(f: Fixture, publication: ReturnType<typeof publishCandidatePacket>, selectedId = 'B', userMessage = 'I choose B') {
  const pending = publication.pending ?? pendingDirection('', publication.displayedSet, []);
  const input = { schema: 'direction-user-input-v1', projectRoot: f.root, requestSha256: hash(f.route.request), sourceContractSha256: f.route.sourceContractSha256, inputDigest: pending.inputDigest, displayedSet: publication.displayedSet, pendingId: pending.id, userMessage, source: 'host-user-input', resumeAuthority: null };
  const observation = { ...input, signature: signNativeObservation(f.root, 'direction-user-input-v1', digest(input)) }, sha256 = hash(jsonBytes(observation));
  const receipt: Receipt = { path: `.omd/.cache/sketches/authority/sha256-${sha256}.json`, sha256 };
  return { schema: 'candidate-selection-input-v2', candidateSet: publication.candidateSet, selectedId, inputDigest: pending.inputDigest,
    decision: { decidedBy: 'user', userMessage, userInputReceipt: receipt, displayedSet: publication.displayedSet }, userInputObservation: observation };
}
