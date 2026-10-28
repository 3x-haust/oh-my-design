import type { VisualMeasurement } from './types.ts';
import { canonicalBytes, digest } from './identity.ts';

const ALL_VIEW_SUBJECTS = 'all-subjects-of-its-views';
type Patch = [path: (string | number)[], value: unknown][];

/** Path-wise differences; arrays of different length are replaced whole so a patch never reorders. */
const keyedRows = (value: unknown): Map<string, unknown> | null => {
  if (!Array.isArray(value)) return null;
  const rows = new Map<string, unknown>();
  for (const row of value) {
    const id = row && typeof row === 'object' ? (row as Record<string, unknown>).id : undefined;
    if (typeof id !== 'string' || rows.has(id)) return null;
    rows.set(id, row);
  }
  return rows;
};
function patchFrom(base: unknown, next: unknown, path: (string | number)[] = [], out: Patch = []): Patch {
  if (digest(base) === digest(next)) return out;
  const before = keyedRows(base), after = keyedRows(next);
  if (before && after && (base as unknown[]).length !== (next as unknown[]).length) {
    out.push([path, { keyedBy: 'id', removed: [...before.keys()].filter(id => !after.has(id)),
      upserted: [...after].filter(([id, row]) => digest(before.get(id)) !== digest(row)).map(([, row]) => row) }]);
  } else if (Array.isArray(base) && Array.isArray(next) && base.length === next.length) {
    next.forEach((item, index) => patchFrom(base[index], item, [...path, index], out));
  } else if (base && next && typeof base === 'object' && typeof next === 'object' && !Array.isArray(base) && !Array.isArray(next)
    && Object.keys(base).sort().join() === Object.keys(next).sort().join()) {
    for (const key of Object.keys(next)) patchFrom((base as Record<string, unknown>)[key], (next as Record<string, unknown>)[key], [...path, key], out);
  } else out.push([path, next]);
  return out;
}
const size = (value: unknown) => canonicalBytes(value).length;
const ARRAY_LIMIT = 24;
type Box = { x: number; y: number; w: number; h: number };
/** Sub-pixel geometry is noise to a reader; whole pixels keep every layout relationship legible. */
const pixels = (box: Box | null | undefined): Box | null => box ? { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h) } : null;
/** Long raw sample lists inside a value are summarised; the reviewer cites ids, and validation reads the stored packet. */
function capArrays(value: unknown): unknown {
  if (Array.isArray(value)) {
    const kept = value.slice(0, ARRAY_LIMIT).map(capArrays);
    return value.length > ARRAY_LIMIT ? [...kept, `${value.length - ARRAY_LIMIT} more entries omitted from this projection`] : kept;
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, capArrays(item)]));
  return value;
}

/**
 * Visible native facts only: no source selectors, paths, references, rationale or scores.
 *
 * The projection is what a reviewer reads, so it is compacted without losing a citable fact. Every
 * outcome state re-measures the same pixels, and a full listing repeated each view's subject ids in
 * every measurement and every identical value: one landing page projected to several million tokens
 * and overflowed the reviewer before it could answer. Identical view subject sets and identical
 * view-relative values are now written once and referenced; validation still resolves every citation
 * against the full stored packet.
 */
export function measurementProjection(packet: VisualMeasurement, packetSha256: string) {
  const locators = new Map(packet.subjects.map(s => [s.locator, `object-${digest(s.locator).slice(0, 16)}`]));
  const clean = (value: unknown): unknown => {
    if (typeof value === 'string') return locators.get(value) ?? value;
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['locator', 'field'].includes(key)).map(([key, item]) => [key, clean(item)]));
    return value;
  };
  const relative = (viewId: string, value: unknown): unknown => {
    if (typeof value === 'string') return value.startsWith(`${viewId}:`) ? `:${value.slice(viewId.length + 1)}` : value;
    if (Array.isArray(value)) return value.map(item => relative(viewId, item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, relative(viewId, item)]));
    return value;
  };
  const viewSubjects = new Map<string, string[]>();
  for (const subject of packet.subjects) viewSubjects.set(subject.viewId, [...viewSubjects.get(subject.viewId) ?? [], subject.id]);
  // A near-identical later state (a toast, a copied label) is written as a patch of the first full
  // entry of the same family: the same viewport for subject sets, the same kind and viewport for values.
  const family = (viewIds: readonly string[]) => viewIds.map(id => packet.scope.find(view => view.id === id)?.viewport.width).join();
  const intern = (table: unknown[], index: Map<string, number>, bases: Map<string, number>, full: Map<number, unknown>,
    key: string, value: unknown): number => {
    const found = index.get(digest(value));
    if (found !== undefined) return found;
    const base = bases.get(key);
    const patch = base === undefined ? null : patchFrom(full.get(base), value);
    const at = table.length;
    if (patch !== null && size(patch) * 2 < size(value)) table.push({ base, patch });
    else { table.push(value); full.set(at, value); if (base === undefined) bases.set(key, at); }
    index.set(digest(value), at);
    return at;
  };
  const sets: unknown[] = [], setViews: string[][] = [];
  const setIndex = new Map<string, number>(), setBases = new Map<string, number>(), setFull = new Map<number, unknown>();
  for (const view of packet.scope) {
    const rows = packet.subjects.filter(s => s.viewId === view.id)
      .map(({ id, role, box, visibleBox, textExcerpt }) => {
        const outer = pixels(box), visible = pixels(visibleBox);
        return { id: relative(view.id, id), role, box: outer,
          ...(digest(outer) === digest(visible) ? {} : { visibleBox: visible }), textExcerpt };
      });
    const at = intern(sets, setIndex, setBases, setFull, family([view.id]), rows);
    (setViews[at] ??= []).push(view.id);
  }
  const subjectSets = sets.map((subjects, at) => ({ viewIds: setViews[at] ?? [], subjects }));
  const values: unknown[] = [];
  const valueIndex = new Map<string, number>(), valueBases = new Map<string, number>(), valueFull = new Map<number, unknown>();
  const valueRef = (kind: string, viewIds: readonly string[], value: unknown): number =>
    intern(values, valueIndex, valueBases, valueFull, `${kind}|${family(viewIds)}`, value);
  return {
    packetSha256,
    notation: `A subject id written ":<local>" inside a subject set or a single-view value means "<viewId>:<local>" for that view; cite full ids. A measurement whose subjectIds is "${ALL_VIEW_SUBJECTS}" covers every subject of its views. valueRef indexes values. An entry {base, patch} equals the full entry at index base of the same table with each [path, value] pair replaced. A patch value {keyedBy: "id", removed, upserted} means the base rows without the removed ids, with each upserted row replacing the row of the same id or added. A subject without visibleBox is fully visible within box. coverage.excluded lists the subjects that native measurement could not cover.`,
    views: packet.scope.map(({ id, state, viewport, browserZoom, stateRecipeSha256 }) => ({ id, state, viewport, browserZoom, stateRecipeSha256 })),
    subjectSets,
    measurements: packet.measurements.map(m => {
      const all = m.viewIds.flatMap(id => viewSubjects.get(id) ?? []);
      const covered = m.subjectIds.length === all.length && all.every(id => m.subjectIds.includes(id));
      const value = m.kind === 'contract-conformance' ? { applicability: m.value.applicability, observations: m.value.observations.map(({ field: _field, ...o }) => ({ ...o,
        expected: o.property === 'before' ? 'committed order' : o.property === 'input' ? 'measurable contract' : o.expected,
        actual: o.property === 'input' ? ['unmeasurable'] : o.actual })) } : clean(m.value);
      return { id: m.id, kind: m.kind, viewIds: m.viewIds, subjectIds: covered ? ALL_VIEW_SUBJECTS : m.subjectIds,
        coverage: { ...m.coverage, excluded: m.coverage.excluded.map(e => m.viewIds.length === 1 ? relative(m.viewIds[0]!, e.subjectId) : e.subjectId) },
        valueRef: valueRef(m.kind, m.viewIds, capArrays(m.viewIds.length === 1 ? relative(m.viewIds[0]!, value) : value)) };
    }),
    values,
    findings: packet.findings.map(({ id, code, severity, basis, axes, viewIds, subjectIds, measurementIds }) => ({ id, code, severity, basis, axes, viewIds, subjectIds, measurementIds })),
    summary: packet.summary,
  };
}
