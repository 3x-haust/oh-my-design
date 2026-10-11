import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { readFrame } from '../frame/index.ts';
import { parseCopySections, validateCopyDeck } from '../copy/index.ts';
import { readPersistedRoute } from '../route/index.ts';
import { selectedBaseTokens, validateMinimalTokens, validatePrimitiveOverrides, parsePrimitive, type Primitive } from '../tokens/minimal.ts';
import { acquireProjectMutationLock, replaceProjectFileAtomically, requireProjectWriteAdapterForInvocation, type ProjectWriteAdapter } from '../runtime/project-write.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { servedProjectTreeSha256 } from '../render/serve.ts';
import { parseVisualMeasurement } from '../measure/schema.ts';
import { packetPayload, digest as measurementDigest } from '../measure/identity.ts';
import { decodePng } from '../motion/energy.ts';
import type { MeasuredIr } from '../measure/types.ts';
import * as v from './candidate-data.ts';
export type Receipt = v.Receipt;
export const CANDIDATE_PLAN_PATH = '.omd/.cache/sketches/plan.json';
export const CANDIDATE_SET_PATH = '.omd/.cache/sketches/set.json';
export type CandidateContent = Readonly<{ schema: 'candidate-content-v1'; surfaceId: string; stateId: string; copy: Receipt | null;
  units: readonly { id: string; text: string; roleId: string }[]; facts: readonly string[]; truthBoundary: string }>;
export type CandidatePlan = Readonly<{
  schema: 'candidate-plan-v2'; owner: 'omd-art-director'; sourceContractSha256: string;
  representative: { surfaceId: string; stateId: string; selectionReason: string };
  content: { receipt: Receipt; projectionSha256: string; contentIds: readonly string[]; status: 'approved' | 'supplied' | 'provisional' };
  tokens: Receipt; referenceApplication: Receipt | null; referenceAnalysis: Receipt | null; existingSystem: Receipt | null;
  views: readonly { id: string; width: number; height: number }[]; candidateCount: 2 | 3; countReason: string;
  candidates: readonly { id: string; layoutStrategy: string; relationship: string; densityStrategy: string; typographyStrategy: string; tone: string; rationale: string; tradeoffs: readonly string[];
    primitiveOverrides: Readonly<Record<string, Primitive>>; reuse: readonly { componentId: string; tokenIds: readonly string[] }[]; departures: readonly { subjectId: string; reason: string }[]; falsifier: string }[];
}>;
export type CandidatePreview = Readonly<{ renderId: string; sourceSha256: string; surfaceId: string; stateId: string; viewId: string;
  viewport: { width: number; height: number }; png: Receipt; capture: Receipt }>;
export type CandidateSet = Readonly<{ schema: 'candidate-set-v2'; plan: Receipt; candidates: readonly {
  id: string; source: Receipt; assets: readonly Receipt[]; previews: readonly CandidatePreview[]; effectiveTokensSha256: string; limitations: readonly string[];
}[] }>;
export function parseCandidateContent(value: unknown): CandidateContent {
  const c = v.object(value, ['schema', 'surfaceId', 'stateId', 'copy', 'units', 'facts', 'truthBoundary']); v.enumeration(c.schema, ['candidate-content-v1']);
  const units = v.list(c.units, value => { const u = v.object(value, ['id', 'text', 'roleId']); return { id: v.id(u.id), text: v.text(u.text), roleId: v.id(u.roleId) }; }); v.unique(units, u => u.id);
  if (!units.length) v.fail('representative content must include real visible strings/data values');
  return { schema: 'candidate-content-v1', surfaceId: v.id(c.surfaceId), stateId: v.id(c.stateId), copy: v.nullableReceipt(c.copy), units, facts: v.list(c.facts, v.text), truthBoundary: v.text(c.truthBoundary) };
}
/** Later Writer art metadata does not change the visible-copy/facts/truth projection. */
export function candidateCopyProjection(md: string): string {
  const sections = parseCopySections(md);
  return v.digest(['sources and fact ledger', 'truth contract', 'surface copy', 'navigation and actions', 'states and recovery'].map(key => [key, sections.get(key)?.trim() ?? '']));
}
export function candidateContentProjection(root: string, content: CandidateContent): string {
  let copyProjection: string | null = null;
  if (content.copy !== null) {
    const current = v.readBytes(root, content.copy.path).toString('utf8');
    const problems = validateCopyDeck(current); if (problems.length) v.fail(`invalid base copy: ${problems.map(p => p.message).join('; ')}`);
    copyProjection = candidateCopyProjection(current);
    const visible = parseCopySections(current).get('surface copy') ?? '';
    if (content.units.some(unit => !visible.includes(unit.text))) v.fail('representative strings/data must be present verbatim in the base Surface copy');
  }
  return v.digest({ ...content, copy: content.copy === null ? null : { path: content.copy.path, projectionSha256: copyProjection } });
}
export function parseCandidatePlan(value: unknown): CandidatePlan {
  const p = v.object(value, ['schema', 'owner', 'sourceContractSha256', 'representative', 'content', 'tokens', 'referenceApplication', 'referenceAnalysis', 'existingSystem', 'views', 'candidateCount', 'countReason', 'candidates']);
  v.enumeration(p.schema, ['candidate-plan-v2']); v.enumeration(p.owner, ['omd-art-director']);
  const r = v.object(p.representative, ['surfaceId', 'stateId', 'selectionReason']), c = v.object(p.content, ['receipt', 'projectionSha256', 'contentIds', 'status']);
  const views = v.list(p.views, value => { const x = v.object(value, ['id', 'width', 'height']); return { id: v.id(x.id), width: v.positive(x.width), height: v.positive(x.height) }; }); v.unique(views, x => x.id);
  if (!views.length) v.fail('representative study requires its declared view set');
  const candidates = v.list(p.candidates, value => {
    const x = v.object(value, ['id', 'layoutStrategy', 'relationship', 'densityStrategy', 'typographyStrategy', 'tone', 'rationale', 'tradeoffs', 'primitiveOverrides', 'reuse', 'departures', 'falsifier']);
    const primitiveOverrides = Object.fromEntries(Object.entries(v.object(x.primitiveOverrides)).map(([key, value]) => [v.id(key), parsePrimitive(value)]));
    const candidateId = v.id(x.id);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(candidateId) || ['plans', 'sets', 'selections', 'presentations', 'packets', 'authority'].includes(candidateId)) v.fail('candidate ID must name its own non-reserved source directory');
    return { id: candidateId, layoutStrategy: v.text(x.layoutStrategy), relationship: v.text(x.relationship), densityStrategy: v.text(x.densityStrategy), typographyStrategy: v.text(x.typographyStrategy), tone: v.text(x.tone), rationale: v.text(x.rationale), tradeoffs: v.list(x.tradeoffs, v.text), primitiveOverrides,
      reuse: v.list(x.reuse, value => { const z = v.object(value, ['componentId', 'tokenIds']); return { componentId: v.id(z.componentId), tokenIds: v.ids(z.tokenIds) }; }),
      departures: v.list(x.departures, value => { const z = v.object(value, ['subjectId', 'reason']); return { subjectId: v.id(z.subjectId), reason: v.text(z.reason) }; }), falsifier: v.text(x.falsifier) };
  }); v.unique(candidates, x => x.id);
  const candidateCount = v.enumeration(p.candidateCount, [2, 3]);
  if (candidates.length !== candidateCount) v.fail('candidateCount must name exactly two or three candidates before generation');
  // A declaration is not proof of a visible structural difference; that judgment belongs to the
  // observed study/review. Identical hypotheses cannot even declare a direction comparison.
  v.unique(candidates, c => v.digest([c.layoutStrategy, c.relationship, c.densityStrategy, c.typographyStrategy]));
  return { schema: 'candidate-plan-v2', owner: 'omd-art-director', sourceContractSha256: v.sha(p.sourceContractSha256), representative: { surfaceId: v.id(r.surfaceId), stateId: v.id(r.stateId), selectionReason: v.text(r.selectionReason) },
    content: { receipt: v.receipt(c.receipt), projectionSha256: v.sha(c.projectionSha256), contentIds: v.ids(c.contentIds, true), status: v.enumeration(c.status, ['approved', 'supplied', 'provisional']) }, tokens: v.receipt(p.tokens), referenceApplication: v.nullableReceipt(p.referenceApplication), referenceAnalysis: v.nullableReceipt(p.referenceAnalysis), existingSystem: v.nullableReceipt(p.existingSystem), views, candidateCount, countReason: v.text(p.countReason), candidates };
}
export function checkCandidatePlan(root: string, value: unknown, sourceContractSha256: string): { plan: CandidatePlan; content: CandidateContent; seed: ReturnType<typeof validateMinimalTokens> } {
  const plan = parseCandidatePlan(value);
  if (plan.sourceContractSha256 !== sourceContractSha256) v.fail('candidate plan belongs to a changed route');
  const frame = readFrame(root), surface = frame?.surfacePlan?.surfaces.find(s => s.id === plan.representative.surfaceId);
  if (!surface || frame?.surfacePlan?.representativeSurfaceId !== surface.id || !surface.states.some(s => s.id === plan.representative.stateId)) v.fail('representative surface/state must belong to the current Frame');
  const expectedViews = frame!.surfacePlan!.views.filter(view => surface!.viewIds.includes(view.id));
  if (v.digest(plan.views) !== v.digest(expectedViews)) v.fail('all concepts require the same representative Frame view set');
  const seed = validateMinimalTokens(JSON.parse(v.readReceipt(root, plan.tokens).toString('utf8')));
  if (plan.tokens.path !== '.omd/tokens.json' || seed.scope.representativeSurfaceId !== surface!.id) v.fail('seed must bind .omd/tokens.json and the representative surface');
  const content = parseCandidateContent(JSON.parse(v.readReceipt(root, plan.content.receipt).toString('utf8')));
  if (content.surfaceId !== surface!.id || content.stateId !== plan.representative.stateId || v.digest(content.units.map(u => u.id).sort()) !== v.digest([...plan.content.contentIds].sort()) || candidateContentProjection(root, content) !== plan.content.projectionSha256) v.fail('representative content/facts/truth projection changed');
  if (content.copy === null && plan.content.status !== 'provisional') v.fail('without base copy the representative content is provisional, never approved/supplied copy');
  if (content.copy !== null && content.copy.path !== '.omd/copy-deck.md') v.fail('base copy must be the Writer-owned copy deck');
  if (content.units.some(u => !Object.hasOwn(seed.textStyles, u.roleId))) v.fail('minimal seed must cover each actual representative text role');
  for (const r of [plan.referenceApplication, plan.referenceAnalysis, plan.existingSystem]) if (r) v.readReceipt(root, r);
  for (const c of plan.candidates) {
    validatePrimitiveOverrides(seed, c.primitiveOverrides);
    for (const reuse of c.reuse) if (reuse.tokenIds.some(id => !Object.hasOwn(seed.primitives, id) && !Object.hasOwn(seed.semantic, id) && !Object.hasOwn(seed.textStyles, id))) v.fail('reuse cites an unknown seed token');
  }
  return { plan, content, seed };
}
export function publishCandidatePlan(root: string, value: unknown, writer: ProjectWriteAdapter, invocation: ProjectRunInvocation): Receipt {
  requireProjectWriteAdapterForInvocation(root, writer, invocation);
  const unlock = acquireProjectMutationLock(root, invocation);
  try {
    const route = readPersistedRoute(root, invocation);
    if (!route.sourceContract.processPolicy || !route.strategy.methods.includes('concept-exploration')) v.fail('concept-exploration must be selected on the current process route');
    const { plan, content } = checkCandidatePlan(root, value, route.sourceContractSha256);
    // The hypothesis is committed before candidate source exists, not reconstructed after viewing.
    const previous = existsSync(join(root, CANDIDATE_PLAN_PATH)) ? v.receipt(v.object(JSON.parse(v.readBytes(root, CANDIDATE_PLAN_PATH).toString('utf8')), ['schema', 'plan']).plan) : null;
    if (previous && v.digest(JSON.parse(v.readReceipt(root, previous).toString('utf8'))) === v.digest(plan)) return previous;
    if (content.copy) v.readReceipt(root, content.copy);
    if (plan.candidates.some(c => existsSync(join(root, `.omd/.cache/sketches/${c.id}/index.html`)))) v.fail('commit the plan before generation; changed hypotheses use fresh candidate directories');
    const receipt = v.publishRecord(writer, '.omd/.cache/sketches/plans', plan);
    replaceProjectFileAtomically({ projectRoot: root, relativePath: CANDIDATE_PLAN_PATH, content: v.jsonBytes({ schema: 'candidate-plan-pointer-v2', plan: receipt }), invocation });
    return receipt;
  } finally { unlock(); }
}
export function requireCandidateSourcePlan(root: string, relativePath: string, sourceContractSha256: string): void {
  const match = /^\.omd\/\.cache\/sketches\/([^/]+)\//.exec(relativePath);
  if (!match) return;
  const pointer = v.object(JSON.parse(v.readBytes(root, CANDIDATE_PLAN_PATH).toString('utf8')), ['schema', 'plan']);
  const { plan } = checkCandidatePlan(root, JSON.parse(v.readReceipt(root, v.receipt(pointer.plan)).toString('utf8')), sourceContractSha256);
  if (!plan.candidates.some(c => c.id === match[1])) v.fail('source author may write only the assigned committed candidate directory');
}
export function parseCandidatePreview(value: unknown): CandidatePreview {
  const p = v.object(value, ['renderId', 'sourceSha256', 'surfaceId', 'stateId', 'viewId', 'viewport', 'png', 'capture']), view = v.object(p.viewport, ['width', 'height']);
  return { renderId: v.id(p.renderId), sourceSha256: v.sha(p.sourceSha256), surfaceId: v.id(p.surfaceId), stateId: v.id(p.stateId), viewId: v.id(p.viewId), viewport: { width: v.positive(view.width), height: v.positive(view.height) }, png: v.receipt(p.png), capture: v.receipt(p.capture) };
}
export function parseCandidateSet(value: unknown): CandidateSet {
  const s = v.object(value, ['schema', 'plan', 'candidates']); v.enumeration(s.schema, ['candidate-set-v2']);
  const candidates = v.list(s.candidates, value => { const c = v.object(value, ['id', 'source', 'assets', 'previews', 'effectiveTokensSha256', 'limitations']);
    const previews = v.list(c.previews, parseCandidatePreview); v.unique(previews, p => p.viewId);
    const assets = v.list(c.assets, v.receipt); v.unique(assets, r => r.path);
    return { id: v.id(c.id), source: v.receipt(c.source), assets, previews, effectiveTokensSha256: v.sha(c.effectiveTokensSha256), limitations: v.list(c.limitations, v.text) }; }); v.unique(candidates, c => c.id);
  return { schema: 'candidate-set-v2', plan: v.receipt(s.plan), candidates };
}
const normalizedText = (text: string) => text.replace(/\s+/gu, ' ').trim();
export function checkCandidatePreview(root: string, preview: CandidatePreview, source: Receipt, plan: CandidatePlan, content: CandidateContent, tokens: ReturnType<typeof selectedBaseTokens>): string {
  const packet = parseVisualMeasurement(JSON.parse(v.readReceipt(root, preview.capture).toString('utf8')));
  const payload = measurementDigest(packetPayload(packet));
  if (packet.binding.authority !== 'native-local' || packet.attestation.kind !== 'native-observation-v1'
    || packet.attestation.payloadSha256 !== payload || !packet.attestation.signature
    || !verifyNativeObservation(realpathSync(root), 'visual-measurement-v1', payload, packet.attestation.signature)
    || packet.binding.sourceContractSha256 !== plan.sourceContractSha256) v.fail('preview needs an actual native measurement capture for the current route');
  const captured = packet.captures.find(c => c.viewId === preview.viewId), scope = packet.scope.find(s => s.id === preview.viewId);
  const view = plan.views.find(v => v.id === preview.viewId);
  const tree = packet.binding.production.find(p => p.entry === source.path);
  if (!view || !captured || !scope || !tree || tree.servedTreeSha256 !== servedProjectTreeSha256(root, source.path)
    || scope.browserZoom !== 1 || scope.state !== preview.stateId || v.digest(scope.viewport) !== v.digest(preview.viewport)
    || view.width !== preview.viewport.width || view.height !== preview.viewport.height
    || preview.surfaceId !== plan.representative.surfaceId || preview.stateId !== plan.representative.stateId
    || preview.sourceSha256 !== source.sha256 || preview.renderId !== `${preview.capture.sha256}:${preview.viewId}`
    || v.digest(captured.capture) !== v.digest(preview.png) || captured.stability.status !== 'stable') v.fail('preview source/state/view/render binding differs from the representative plan');
  const png = decodePng(v.readReceipt(root, preview.png));
  if (png.width !== view.width || png.height !== view.height || v.hash(png.pixels) !== captured.stability.beforePixelSha256) v.fail('preview must be the native fixed-viewport PNG');
  const raw = JSON.parse(v.readReceipt(root, captured.ir).toString('utf8')) as MeasuredIr;
  if (measurementDigest(raw.measurement) !== captured.stability.beforeProjectionSha256) v.fail('preview IR projection changed');
  const actual = raw.measurement.nodes.filter(n => n.text.trim()).map(n => normalizedText(n.text)).sort();
  const expected = content.units.map(u => normalizedText(u.text)).sort();
  if (v.digest(actual) !== v.digest(expected)) v.fail('all candidates must render exactly the same visible strings/data item set; do not remove difficult content');
  if (!captured.fonts.ready || captured.fonts.failedFamilies.length) v.fail('candidate fonts are not ready; disclose unavailable rendering instead of presenting a false type treatment');
  for (const unit of content.units) {
    const style = tokens.textStyles[unit.roleId]!;
    const size = tokens.primitives[style.sizeRef] as Extract<Primitive, { type: 'number' }>;
    const family = tokens.primitives[style.familyRef] as Extract<Primitive, { type: 'font-family' }>;
    const leading = tokens.primitives[style.lineHeightRef] as Extract<Primitive, { type: 'number' }>;
    const expectedLeading = leading.unit === 'px' ? leading.value : leading.value * size.value;
    const tracking = style.letterSpacingRef === null ? null : tokens.primitives[style.letterSpacingRef] as Extract<Primitive, { type: 'number' }>;
    const nodes = raw.measurement.nodes.filter(n => normalizedText(n.text) === normalizedText(unit.text));
    if (nodes.some(n => Math.abs(n.size - size.value) > 0.25 || n.weight !== style.weight
      || n.leading === 'normal' || Math.abs(n.leading - expectedLeading) > 0.25
      || tracking !== null && Math.abs(n.tracking - tracking.value) > 0.25
      || v.digest(n.families) !== v.digest(family.value.map(f => f.trim().toLowerCase())))) v.fail(`rendered type treatment differs from candidate overrides for ${unit.id}`);
  }
  // Exclude color, filenames, IDs and authored hypotheses. Equal observed geometry/type across
  // every view cannot constitute structural exploration. A difference is NOT a creativity score.
  return v.digest(raw.measurement.nodes.filter(n => n.text.trim() || n.media).map(n => ({
    text: normalizedText(n.text), box: n.box, media: n.media, size: n.size, weight: n.weight,
    families: n.families, leading: n.leading, tracking: n.tracking,
  })).sort((a, b) => v.digest(a).localeCompare(v.digest(b))));
}
export function checkCandidateSet(root: string, value: unknown, sourceContractSha256: string) {
  const set = parseCandidateSet(value);
  const current = v.object(JSON.parse(v.readBytes(root, CANDIDATE_PLAN_PATH).toString('utf8')), ['schema', 'plan']);
  if (current.schema !== 'candidate-plan-pointer-v2' || v.digest(current.plan) !== v.digest(set.plan)) v.fail('candidate set does not bind the committed plan');
  const { plan, seed, content } = checkCandidatePlan(root, JSON.parse(v.readReceipt(root, set.plan).toString('utf8')), sourceContractSha256);
  if (v.digest(set.candidates.map(c => c.id).sort()) !== v.digest(plan.candidates.map(c => c.id).sort())) v.fail('candidate membership differs from the frozen plan');
  const observedRelationships = new Set<string>();
  for (const c of set.candidates) {
    if (c.source.path !== `.omd/.cache/sketches/${c.id}/index.html`) v.fail('Sketch source must stay in its assigned candidate directory');
    v.readReceipt(root, c.source);
    for (const asset of c.assets) { if (!asset.path.startsWith(`.omd/.cache/sketches/${c.id}/`)) v.fail('candidate assets must be retained in its source directory'); v.readReceipt(root, asset); }
    if (v.digest(c.previews.map(p => p.viewId).sort()) !== v.digest(plan.views.map(v => v.id).sort())) v.fail('every candidate must include exactly the common representative views');
    const hypothesis = plan.candidates.find(p => p.id === c.id)!;
    if (c.effectiveTokensSha256 !== v.digest(selectedBaseTokens(seed, hypothesis.primitiveOverrides))) v.fail('candidate token projection differs from seed plus typed overrides');
    const observed = v.digest([...c.previews].sort((a, b) => a.viewId.localeCompare(b.viewId))
      .map(p => [p.viewId, checkCandidatePreview(root, p, c.source, plan, content, selectedBaseTokens(seed, hypothesis.primitiveOverrides))]));
    if (observedRelationships.has(observed)) v.fail('candidate previews have identical observed structure/density/type; color-only variants are not direction concepts');
    observedRelationships.add(observed);
  }
  // All displayed alternatives, not just the winner, are choice inputs. Future extensions and
  // nonrepresentative Frame changes deliberately do not occur in this digest.
  const surface = readFrame(root)!.surfacePlan!.surfaces.find(s => s.id === plan.representative.surfaceId)!;
  const representativeScope = { id: surface.id, purpose: surface.purpose, taskIds: surface.taskIds,
    state: surface.states.find(s => s.id === plan.representative.stateId), viewIds: surface.viewIds };
  return { set, plan, content, seed, inputDigest: v.digest({ set, plan, representativeScope, contentProjection: plan.content.projectionSha256 }) };
}
