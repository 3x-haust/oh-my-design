import {
  digest,
  fields,
  integer,
  oneOf,
  receipts,
  sameReceipts,
  sameSet,
  text,
  token,
  uniqueTokens,
  values,
  type ArtifactReceipt,
  type ProofFail,
} from './proof-primitives.ts';

export const STRUCTURAL_WIREFRAME_SCHEMA = 'structural-wireframe-v1' as const;

export type StructuralRegionRole = 'navigation' | 'work-object' | 'context' | 'action' | 'feedback' | 'recovery' | 'supporting';
export type StructuralViewport = 'desktop' | 'mobile';
export type StructuralWireframeErrorCode =
  | 'STRUCTURAL_WIREFRAME_MALFORMED'
  | 'STRUCTURAL_WIREFRAME_EXPRESSION_FIELD'
  | 'STRUCTURAL_WIREFRAME_STALE_PLAN'
  | 'STRUCTURAL_WIREFRAME_STALE_INPUT'
  | 'STRUCTURAL_WIREFRAME_DANGLING_REFERENCE'
  | 'STRUCTURAL_WIREFRAME_UNCOVERED_REFERENCE'
  | 'STRUCTURAL_WIREFRAME_VIEWPORT_COVERAGE'
  | 'STRUCTURAL_WIREFRAME_INVALID_RELATIONSHIP';

export class StructuralWireframeError extends Error {
  override readonly name = 'StructuralWireframeError';
  readonly code: StructuralWireframeErrorCode;

  constructor(code: StructuralWireframeErrorCode, message: string = code) {
    super(message);
    this.code = code;
  }
}

export type StructuralWireframeCurrent = Readonly<{
  planSha256: string;
  inputs: readonly ArtifactReceipt[];
  taskIds: readonly string[];
  contentIds: readonly string[];
  stateIds: readonly string[];
}>;
export type StructuralRegion = Readonly<{
  id: string;
  role: StructuralRegionRole;
  parentId: string | null;
  order: number;
  taskIds: readonly string[];
  contentIds: readonly string[];
  stateIds: readonly string[];
}>;
export type StructuralLayout = Readonly<{
  viewport: StructuralViewport;
  regionId: string;
  placement: string;
  priority: number;
}>;
export type StructuralWireframe = Readonly<{
  schema: typeof STRUCTURAL_WIREFRAME_SCHEMA;
  planSha256: string;
  inputs: readonly ArtifactReceipt[];
  regions: readonly StructuralRegion[];
  layouts: readonly StructuralLayout[];
}>;

const ROLES: readonly StructuralRegionRole[] = ['navigation', 'work-object', 'context', 'action', 'feedback', 'recovery', 'supporting'];
const VIEWPORTS: readonly StructuralViewport[] = ['desktop', 'mobile'];
const EXPRESSION_FIELD = /(palette|colou?r|font|typeface|typography|material|motion|animation|easing|duration|gradient|shadow|radius|texture|opacity|decorative|media|image)/i;

function rejectExpressionFields(value: unknown, seen = new WeakSet<object>()): void {
  if (typeof value !== 'object' || value === null || seen.has(value)) return;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === 'string' && EXPRESSION_FIELD.test(key)) {
      throw new StructuralWireframeError('STRUCTURAL_WIREFRAME_EXPRESSION_FIELD', `structural proof cannot contain expression field ${key}`);
    }
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) rejectExpressionFields(descriptor.value, seen);
  }
}

function parse(value: unknown, currentValue: StructuralWireframeCurrent): StructuralWireframe {
  const malformed: ProofFail = (message) => { throw new StructuralWireframeError('STRUCTURAL_WIREFRAME_MALFORMED', message); };
  rejectExpressionFields(value);
  const current = fields(currentValue, ['planSha256', 'inputs', 'taskIds', 'contentIds', 'stateIds'], 'current structural evidence', malformed);
  const expectedPlan = digest(current.get('planSha256'), 'current structural evidence.planSha256', malformed);
  const expectedInputs = receipts(current.get('inputs'), 'current structural evidence.inputs', malformed);
  const expectedTaskIds = uniqueTokens(current.get('taskIds'), 'current structural evidence.taskIds', malformed, false);
  const expectedContentIds = uniqueTokens(current.get('contentIds'), 'current structural evidence.contentIds', malformed);
  const expectedStateIds = uniqueTokens(current.get('stateIds'), 'current structural evidence.stateIds', malformed);

  const item = fields(value, ['schema', 'planSha256', 'inputs', 'regions', 'layouts'], 'structural wireframe', malformed);
  if (item.get('schema') !== STRUCTURAL_WIREFRAME_SCHEMA) malformed('structural wireframe schema is invalid');
  const planSha256 = digest(item.get('planSha256'), 'structural wireframe.planSha256', malformed);
  if (planSha256 !== expectedPlan) throw new StructuralWireframeError('STRUCTURAL_WIREFRAME_STALE_PLAN');
  const inputs = receipts(item.get('inputs'), 'structural wireframe.inputs', malformed);
  if (!sameReceipts(inputs, expectedInputs)) throw new StructuralWireframeError('STRUCTURAL_WIREFRAME_STALE_INPUT');

  const taskSet = new Set(expectedTaskIds);
  const contentSet = new Set(expectedContentIds);
  const stateSet = new Set(expectedStateIds);
  const regions = values(item.get('regions'), 'structural wireframe.regions', malformed).map((regionValue, index): StructuralRegion => {
    const label = `structural wireframe.regions[${index}]`;
    const region = fields(regionValue, ['id', 'role', 'parentId', 'order', 'taskIds', 'contentIds', 'stateIds'], label, malformed);
    const id = token(region.get('id'), `${label}.id`, malformed);
    const parentValue = region.get('parentId');
    const parentId = parentValue === null ? null : token(parentValue, `${label}.parentId`, malformed);
    const taskIds = uniqueTokens(region.get('taskIds'), `${label}.taskIds`, malformed, false);
    const contentIds = uniqueTokens(region.get('contentIds'), `${label}.contentIds`, malformed);
    const stateIds = uniqueTokens(region.get('stateIds'), `${label}.stateIds`, malformed);
    if (taskIds.some((reference) => !taskSet.has(reference))
      || contentIds.some((reference) => !contentSet.has(reference))
      || stateIds.some((reference) => !stateSet.has(reference))) {
      throw new StructuralWireframeError('STRUCTURAL_WIREFRAME_DANGLING_REFERENCE');
    }
    return Object.freeze({
      id,
      role: oneOf(region.get('role'), ROLES, `${label}.role`, malformed),
      parentId,
      order: integer(region.get('order'), `${label}.order`, malformed),
      taskIds,
      contentIds,
      stateIds,
    });
  });
  if (regions.length === 0 || new Set(regions.map(({ id }) => id)).size !== regions.length) malformed('structural regions must be non-empty and uniquely identified');

  const byId = new Map(regions.map((region) => [region.id, region]));
  for (const region of regions) {
    if (region.parentId !== null && (!byId.has(region.parentId) || region.parentId === region.id)) {
      throw new StructuralWireframeError('STRUCTURAL_WIREFRAME_INVALID_RELATIONSHIP');
    }
    const ancestors = new Set<string>([region.id]);
    let parentId = region.parentId;
    while (parentId !== null) {
      if (ancestors.has(parentId)) throw new StructuralWireframeError('STRUCTURAL_WIREFRAME_INVALID_RELATIONSHIP');
      ancestors.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }

  const siblings = new Map<string, number[]>();
  for (const region of regions) {
    const parent = region.parentId ?? '<root>';
    const orders = siblings.get(parent) ?? [];
    orders.push(region.order);
    siblings.set(parent, orders);
  }
  for (const orders of siblings.values()) {
    const sorted = [...orders].sort((left, right) => left - right);
    if (new Set(sorted).size !== sorted.length || sorted.some((order, index) => order !== index)) {
      throw new StructuralWireframeError('STRUCTURAL_WIREFRAME_INVALID_RELATIONSHIP');
    }
  }

  const usedTasks = regions.flatMap(({ taskIds }) => taskIds);
  const usedContent = regions.flatMap(({ contentIds }) => contentIds);
  const usedStates = regions.flatMap(({ stateIds }) => stateIds);
  if (!sameSet(usedTasks, expectedTaskIds) || !sameSet(usedContent, expectedContentIds) || !sameSet(usedStates, expectedStateIds)) {
    throw new StructuralWireframeError('STRUCTURAL_WIREFRAME_UNCOVERED_REFERENCE');
  }

  const layouts = values(item.get('layouts'), 'structural wireframe.layouts', malformed).map((layoutValue, index): StructuralLayout => {
    const label = `structural wireframe.layouts[${index}]`;
    const layout = fields(layoutValue, ['viewport', 'regionId', 'placement', 'priority'], label, malformed);
    const regionId = token(layout.get('regionId'), `${label}.regionId`, malformed);
    if (!byId.has(regionId)) throw new StructuralWireframeError('STRUCTURAL_WIREFRAME_DANGLING_REFERENCE');
    return Object.freeze({
      viewport: oneOf(layout.get('viewport'), VIEWPORTS, `${label}.viewport`, malformed),
      regionId,
      placement: text(layout.get('placement'), `${label}.placement`, malformed),
      priority: integer(layout.get('priority'), `${label}.priority`, malformed),
    });
  });

  for (const viewport of VIEWPORTS) {
    const viewportLayouts = layouts.filter((layout) => layout.viewport === viewport);
    if (viewportLayouts.length !== regions.length || !sameSet(viewportLayouts.map(({ regionId }) => regionId), byId.keys())) {
      throw new StructuralWireframeError('STRUCTURAL_WIREFRAME_VIEWPORT_COVERAGE');
    }
    const priorities = viewportLayouts.map(({ priority }) => priority).sort((left, right) => left - right);
    if (new Set(priorities).size !== priorities.length || priorities.some((priority, index) => priority !== index)) {
      throw new StructuralWireframeError('STRUCTURAL_WIREFRAME_INVALID_RELATIONSHIP');
    }
    const priorityByRegion = new Map(viewportLayouts.map((layout) => [layout.regionId, layout.priority]));
    for (const region of regions) {
      if (region.parentId !== null && (priorityByRegion.get(region.parentId) ?? Number.MAX_SAFE_INTEGER) >= (priorityByRegion.get(region.id) ?? -1)) {
        throw new StructuralWireframeError('STRUCTURAL_WIREFRAME_INVALID_RELATIONSHIP');
      }
    }
  }

  return Object.freeze({
    schema: STRUCTURAL_WIREFRAME_SCHEMA,
    planSha256,
    inputs,
    regions: Object.freeze([...regions].sort((left, right) => left.id.localeCompare(right.id))),
    layouts: Object.freeze([...layouts].sort((left, right) => VIEWPORTS.indexOf(left.viewport) - VIEWPORTS.indexOf(right.viewport)
      || left.priority - right.priority || left.regionId.localeCompare(right.regionId))),
  });
}

/** Parses an untrusted structural proof against the exact current workflow and model evidence. */
export function parseStructuralWireframe(value: unknown, current: StructuralWireframeCurrent): StructuralWireframe {
  try {
    return parse(value, current);
  } catch (error) {
    if (error instanceof StructuralWireframeError) throw error;
    throw new StructuralWireframeError('STRUCTURAL_WIREFRAME_MALFORMED');
  }
}
