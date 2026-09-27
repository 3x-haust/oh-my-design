import { requiredSurfaceCells, parseSurfacePlan, type SurfacePlan } from '../frame/process-plan.ts';
import { loadMeasurement, assertVerifiedPacket } from '../measure/files.ts';
import type { VisualMeasurement } from '../measure/types.ts';
import { requireFinalReviewerLaneAuthorization, type ProjectRunInvocation } from '../runtime/invocation.ts';
import * as v from './candidate-data.ts';

export type SurfaceCell = Readonly<{ surfaceId: string; stateId: string; viewId: string }>;
export type SurfaceMapping = SurfaceCell & Readonly<{ route: string; state: string; stateRecipeSha256: string }>;
export type SurfaceCapture = SurfaceCell & Readonly<{ packet: v.Receipt; capture: v.Receipt }>;
export const SURFACE_REVIEW_CRITERIA = ['hierarchy', 'readability', 'alignment', 'brandFit', 'interactionClarity'] as const;
export type SurfaceReview = Readonly<{ schema: 'surface-review-v1'; rows: readonly (SurfaceCapture & {
  measurementIds: readonly string[];
  criteria: Readonly<Record<typeof SURFACE_REVIEW_CRITERIA[number], 'pass' | 'fail' | 'unassessed'>>;
})[] }>;
const key = (c: SurfaceCell) => JSON.stringify([c.surfaceId, c.stateId, c.viewId]);
const scope = (x: Record<string, unknown>): SurfaceCell => ({ surfaceId: v.id(x.surfaceId), stateId: v.id(x.stateId), viewId: v.id(x.viewId) });
function exactCells(expected: readonly SurfaceCell[], actual: readonly SurfaceCell[], name: string): void {
  v.unique(actual, key);
  if (v.digest(expected.map(key).sort()) !== v.digest(actual.map(key).sort())) v.fail(`${name} must cover exactly the per-surface required state/view set`);
}
export function parseSurfaceMappings(value: unknown): readonly SurfaceMapping[] {
  return v.list(value, value => {
    const x = v.object(value, ['surfaceId', 'stateId', 'viewId', 'route', 'state', 'stateRecipeSha256']);
    const route = v.text(x.route); if (!route.startsWith('/') || route.startsWith('//')) v.fail('local route required');
    return { ...scope(x), route, state: v.text(x.state), stateRecipeSha256: v.sha(x.stateRecipeSha256) };
  });
}
export function parseSurfaceReview(value: unknown): SurfaceReview {
  const x = v.object(value, ['schema', 'rows']);
  return { schema: v.enumeration(x.schema, ['surface-review-v1']), rows: v.list(x.rows, value => {
    const r = v.object(value, ['surfaceId', 'stateId', 'viewId', 'packet', 'capture', 'measurementIds', 'criteria']);
    const criteria = v.object(r.criteria, SURFACE_REVIEW_CRITERIA);
    return { ...scope(r), packet: v.receipt(r.packet), capture: v.receipt(r.capture), measurementIds: v.ids(r.measurementIds, true),
      criteria: Object.fromEntries(SURFACE_REVIEW_CRITERIA.map(id => [id, v.enumeration(criteria[id], ['pass', 'fail', 'unassessed'])])) as SurfaceReview['rows'][number]['criteria'] };
  }) };
}

/** Exact join over native packets. Equal pixels are lawful only when separate real state captures
 * have different packet/view identities; a filename change or repeated entry image cannot add scope. */
export function joinSurfaceCoverage(plan: SurfacePlan, mappings: readonly SurfaceMapping[], review: SurfaceReview,
  packets: ReadonlyMap<string, VisualMeasurement>) {
  const expected = requiredSurfaceCells(parseSurfacePlan(plan));
  exactCells(expected, mappings, 'expansion mapping'); exactCells(expected, review.rows, 'surface review');
  const captures = new Set<string>();
  for (const row of review.rows) {
    const mapping = mappings.find(m => key(m) === key(row))!;
    const packet = packets.get(row.packet.sha256); if (!packet) v.fail('missing native measurement packet');
    assertVerifiedPacket(packet!);
    const view = packet!.scope.find(s => s.id === row.viewId), capture = packet!.captures.find(c => c.viewId === row.viewId);
    const requiredView = plan.views.find(v => v.id === row.viewId)!;
    if (!view || !capture || view.route !== mapping.route || view.state !== mapping.state || view.stateRecipeSha256 !== mapping.stateRecipeSha256
      || view.viewport.width !== requiredView.width || view.viewport.height !== requiredView.height
      || v.digest(capture.capture) !== v.digest(row.capture)) v.fail('surface capture does not bind its actual route/state/recipe/view/pixels');
    const identity = `${row.packet.sha256}:${row.viewId}`;
    if (captures.has(identity)) v.fail('one capture cannot represent different required cells'); captures.add(identity);
    if (SURFACE_REVIEW_CRITERIA.some(id => row.criteria[id] !== 'pass')) v.fail('every required cell needs an assessed passing review');
    const relevant = packet!.measurements.filter(m => m.viewIds.includes(row.viewId));
    if (row.measurementIds.some(id => !relevant.some(m => m.id === id))
      || relevant.some(m => m.coverage.status !== 'complete')
      || packet!.findings.some(f => f.severity === 'blocking' && f.viewIds.includes(row.viewId))) v.fail('missing, unrelated, incomplete or RED surface measurement evidence');
  }
  return { schema: 'surface-coverage-result-v1', cells: expected, reviewed: review.rows.length, complete: true } as const;
}
export function checkSurfaceCoverage(root: string, plan: SurfacePlan, mappingsValue: unknown, reviewReceipt: v.Receipt, invocation: ProjectRunInvocation) {
  const bytes = v.readReceipt(root, reviewReceipt);
  requireFinalReviewerLaneAuthorization(invocation, root, bytes);
  const review = parseSurfaceReview(JSON.parse(bytes.toString('utf8'))), packets = new Map<string, VisualMeasurement>();
  for (const row of review.rows) if (!packets.has(row.packet.sha256)) packets.set(row.packet.sha256, loadMeasurement(root, row.packet));
  return joinSurfaceCoverage(plan, parseSurfaceMappings(mappingsValue), review, packets);
}

export type SurfaceContentProof = Readonly<{ schema: 'surface-content-proof-v1'; surfaceId: string; caseId: string; stateId: string; viewId: string;
  fixture: v.Receipt; source: v.Receipt; selectedDirectionSha256: string; effectiveTokensSha256: string;
  mapping: SurfaceMapping; packet: v.Receipt; capture: v.Receipt; normalPacket: v.Receipt;
}>;
/** A small fixture ABI gives native IR something concrete to falsify; prose pass assertions are
 * deliberately absent. The fixture contains exact visible stress text/data units and minimum counts. */
export function checkSurfaceContentProof(root: string, plan: SurfacePlan, value: unknown, current: { selectedDirectionSha256: string; effectiveTokensSha256: string }) {
  const p = v.object(value, ['schema', 'surfaceId', 'caseId', 'stateId', 'viewId', 'fixture', 'source', 'selectedDirectionSha256', 'effectiveTokensSha256', 'mapping', 'packet', 'capture', 'normalPacket']);
  v.enumeration(p.schema, ['surface-content-proof-v1']);
  const cell = scope(p), caseId = v.id(p.caseId), fixture = v.receipt(p.fixture), source = v.receipt(p.source);
  const surface = plan.surfaces.find(s => s.id === cell.surfaceId), contentCase = surface?.contentCases.find(c => c.id === caseId);
  if (!contentCase || !contentCase.stateIds.includes(cell.stateId) || !contentCase.viewIds.includes(cell.viewId)
    || v.digest(contentCase.fixture) !== v.digest(fixture)) v.fail('undeclared or misbound content case');
  if (p.selectedDirectionSha256 !== current.selectedDirectionSha256 || p.effectiveTokensSha256 !== current.effectiveTokensSha256) v.fail('content proof chosen system changed');
  v.readReceipt(root, source);
  const f = v.object(JSON.parse(v.readReceipt(root, fixture).toString('utf8')), ['schema', 'units']);
  v.enumeration(f.schema, ['surface-content-fixture-v1']);
  const units = v.list(f.units, value => { const u = v.object(value, ['text', 'count']); return { text: v.text(u.text), count: v.positive(u.count) }; });
  if (!units.length) v.fail('stress fixture needs actual difficult content'); v.unique(units, u => u.text);
  const mapping = parseSurfaceMappings([p.mapping])[0]!;
  if (key(mapping) !== key(cell)) v.fail('stress mapping differs from declared cell');
  const receipt = v.receipt(p.packet), packet = loadMeasurement(root, receipt), normalReceipt = v.receipt(p.normalPacket), normal = loadMeasurement(root, normalReceipt);
  const view = packet.scope.find(s => s.id === cell.viewId), capture = packet.captures.find(c => c.viewId === cell.viewId), normalView = normal.scope.find(s => s.id === cell.viewId);
  const dimensions = plan.views.find(v => v.id === cell.viewId)!;
  if (receipt.sha256 === normalReceipt.sha256 || !view || !normalView || view.stateRecipeSha256 === normalView.stateRecipeSha256
    || view.stateRecipeSha256 !== mapping.stateRecipeSha256 || view.route !== mapping.route || view.state !== mapping.state
    || view.viewport.width !== dimensions.width || view.viewport.height !== dimensions.height || !capture
    || v.digest(capture.capture) !== v.digest(v.receipt(p.capture)) || !packet.binding.production.some(p => p.entry === source.path)) v.fail('stress needs a separate real fixture/state/view/source capture');
  const raw = v.object(JSON.parse(v.readReceipt(root, capture!.ir).toString('utf8')));
  const nodes = v.list(v.object(raw.measurement).nodes, value => v.object(value));
  for (const unit of units) if (nodes.filter(n => n.text === unit.text && n.visibleBox !== null).length < unit.count) v.fail('native stress IR does not contain the actual fixture text/item range');
  const metrics = packet.measurements.filter(m => m.viewIds.includes(cell.viewId));
  if (!metrics.some(m => m.kind === 'clipping-overflow') || metrics.some(m => m.coverage.status !== 'complete')
    || packet.findings.some(f => f.severity === 'blocking' && f.viewIds.includes(cell.viewId))) v.fail('stress failure or missing measurement cannot become research debt');
  return { schema: 'surface-content-proof-v1', ...cell, caseId, fixture, source,
    selectedDirectionSha256: v.sha(p.selectedDirectionSha256), effectiveTokensSha256: v.sha(p.effectiveTokensSha256), mapping, packet: receipt, capture: v.receipt(p.capture), normalPacket: normalReceipt } satisfies SurfaceContentProof;
}
export function requiredContentCells(plan: SurfacePlan) {
  return plan.surfaces.flatMap(surface => surface.contentCases.flatMap(c => c.stateIds.flatMap(stateId => c.viewIds.map(viewId => ({ surfaceId: surface.id, caseId: c.id, stateId, viewId })))));
}
export function checkAllSurfaceContentProofs(root: string, plan: SurfacePlan, values: readonly unknown[], current: { selectedDirectionSha256: string; effectiveTokensSha256: string }) {
  const proofs = values.map(value => checkSurfaceContentProof(root, plan, value, current));
  const identity = (c: SurfaceCell & { caseId: string }) => `${key(c)}:${c.caseId}`;
  v.unique(proofs, identity);
  if (v.digest(proofs.map(identity).sort()) !== v.digest(requiredContentCells(plan).map(identity).sort())) v.fail('every declared content-case/state/view requires its own proof');
  return proofs;
}
