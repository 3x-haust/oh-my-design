import { createHash } from 'node:crypto';

import { canonicalWorkflowPlanJson, type AdaptiveWorkflowPlan } from './workflow-plan.ts';
import {
  digest,
  fields,
  receipt,
  safePath,
  text,
  token,
  values,
  type ArtifactReceipt,
  type ProofFail,
} from './proof-primitives.ts';

export const ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_SCHEMA = 'adaptive-workflow-production-slice-v1' as const;
export const ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_INPUT_SCHEMA = 'adaptive-workflow-production-slice-input-v1' as const;

export type WorkflowProductionSliceEntry = Readonly<{
  investigationId: string;
  component: Readonly<{
    source: ArtifactReceipt<'production-source'>;
    selector: string;
    contractSha256: string;
  }>;
  representativeContext: Readonly<{
    source: ArtifactReceipt<'production-source'>;
    route: string;
    selector: string;
  }>;
}>;

export type AdaptiveWorkflowProductionSlice = Readonly<{
  schema: typeof ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_SCHEMA;
  route: AdaptiveWorkflowPlan['route'];
  plan: ArtifactReceipt<'adaptive-workflow-plan-v1'>;
  readiness: ArtifactReceipt<'adaptive-workflow-production-readiness-v1'>;
  owner: Readonly<{
    role: 'omd-hand';
    buildSha256: string;
    loadedSkillSha256: string;
    briefSha256: string;
  }>;
  slices: readonly WorkflowProductionSliceEntry[];
}>;

export type CreateWorkflowProductionSliceInput = Readonly<{
  route: AdaptiveWorkflowPlan['route'];
  plan: ArtifactReceipt<'adaptive-workflow-plan-v1'>;
  readiness: ArtifactReceipt<'adaptive-workflow-production-readiness-v1'>;
  owner: AdaptiveWorkflowProductionSlice['owner'];
  slices: unknown;
  readSource: (path: string) => Uint8Array;
}>;

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const fail: ProofFail = (message) => { throw new Error(`adaptive workflow production slice: ${message}`); };

function sourceReceipt(pathValue: unknown, label: string, readSource: (path: string) => Uint8Array): ArtifactReceipt<'production-source'> {
  const path = safePath(pathValue, `${label}.path`, fail);
  let bytes: Uint8Array;
  try { bytes = readSource(path); } catch { return fail(`${label} could not be read`); }
  if (bytes.byteLength === 0) fail(`${label} must not be empty`);
  return Object.freeze({ path, schema: 'production-source', sha256: hash(bytes) });
}

function routePath(value: unknown, label: string): string {
  const route = text(value, label, fail);
  if (!route.startsWith('/') || route.startsWith('//') || route.includes('\\')
    || route.slice(1).split('/').some((part) => part === '.' || part === '..')) fail(`${label} must be a safe local route`);
  return route;
}

export function createWorkflowProductionSlice(input: CreateWorkflowProductionSliceInput): AdaptiveWorkflowProductionSlice {
  const plan = receipt(input.plan, 'production slice plan', fail);
  const readiness = receipt(input.readiness, 'production slice readiness', fail);
  if (plan.schema !== 'adaptive-workflow-plan-v1' || readiness.schema !== 'adaptive-workflow-production-readiness-v1') {
    fail('plan and readiness schemas are invalid');
  }
  const ownerFields = fields(input.owner, ['role', 'buildSha256', 'loadedSkillSha256', 'briefSha256'], 'production slice owner', fail);
  if (ownerFields.get('role') !== 'omd-hand') fail('production slice belongs to omd-hand');
  const owner = Object.freeze({
    role: 'omd-hand' as const,
    buildSha256: digest(ownerFields.get('buildSha256'), 'production slice owner.buildSha256', fail),
    loadedSkillSha256: digest(ownerFields.get('loadedSkillSha256'), 'production slice owner.loadedSkillSha256', fail),
    briefSha256: digest(ownerFields.get('briefSha256'), 'production slice owner.briefSha256', fail),
  });
  const slices = values(input.slices, 'production slice entries', fail).map((raw, index): WorkflowProductionSliceEntry => {
    const entry = fields(raw, ['investigationId', 'component', 'representativeContext'], `production slice entries[${index}]`, fail);
    const component = fields(entry.get('component'), ['sourcePath', 'selector', 'contractSha256'], `production slice entries[${index}].component`, fail);
    const context = fields(entry.get('representativeContext'), ['sourcePath', 'route', 'selector'], `production slice entries[${index}].representativeContext`, fail);
    const componentSource = sourceReceipt(component.get('sourcePath'), `production slice entries[${index}].component.source`, input.readSource);
    const contextSource = sourceReceipt(context.get('sourcePath'), `production slice entries[${index}].representativeContext.source`, input.readSource);
    if (componentSource.path === contextSource.path) fail('component source and representative page context must be distinct source files');
    return Object.freeze({
      investigationId: token(entry.get('investigationId'), `production slice entries[${index}].investigationId`, fail),
      component: Object.freeze({
        source: componentSource,
        selector: text(component.get('selector'), `production slice entries[${index}].component.selector`, fail),
        contractSha256: digest(component.get('contractSha256'), `production slice entries[${index}].component.contractSha256`, fail),
      }),
      representativeContext: Object.freeze({
        source: contextSource,
        route: routePath(context.get('route'), `production slice entries[${index}].representativeContext.route`),
        selector: text(context.get('selector'), `production slice entries[${index}].representativeContext.selector`, fail),
      }),
    });
  });
  if (slices.length === 0 || new Set(slices.map(({ investigationId }) => investigationId)).size !== slices.length) {
    fail('production slice entries must be non-empty and uniquely identified');
  }
  return Object.freeze({
    schema: ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_SCHEMA,
    route: input.route,
    plan: Object.freeze({ path: plan.path, schema: 'adaptive-workflow-plan-v1', sha256: plan.sha256 }),
    readiness: Object.freeze({ path: readiness.path, schema: 'adaptive-workflow-production-readiness-v1', sha256: readiness.sha256 }),
    owner,
    slices: Object.freeze([...slices].sort((left, right) => left.investigationId.localeCompare(right.investigationId))),
  });
}

export function workflowProductionSliceBytes(value: AdaptiveWorkflowProductionSlice): Buffer {
  return Buffer.from(`${canonicalWorkflowPlanJson(value)}\n`);
}

export function parseWorkflowProductionSlice(value: unknown): AdaptiveWorkflowProductionSlice {
  const root = fields(value, ['schema', 'route', 'plan', 'readiness', 'owner', 'slices'], 'production slice', fail);
  if (root.get('schema') !== ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_SCHEMA) fail('schema is invalid');
  const route = fields(root.get('route'), ['recordSha256', 'sourceContractSha256', 'authoritySha256'], 'production slice route', fail);
  const parsedRoute = Object.freeze({
    recordSha256: digest(route.get('recordSha256'), 'production slice route.recordSha256', fail),
    sourceContractSha256: digest(route.get('sourceContractSha256'), 'production slice route.sourceContractSha256', fail),
    authoritySha256: digest(route.get('authoritySha256'), 'production slice route.authoritySha256', fail),
  });
  const plan = receipt(root.get('plan'), 'production slice plan', fail);
  const readiness = receipt(root.get('readiness'), 'production slice readiness', fail);
  const ownerFields = fields(root.get('owner'), ['role', 'buildSha256', 'loadedSkillSha256', 'briefSha256'], 'production slice owner', fail);
  if (ownerFields.get('role') !== 'omd-hand' || plan.schema !== 'adaptive-workflow-plan-v1' || readiness.schema !== 'adaptive-workflow-production-readiness-v1') fail('binding is invalid');
  const slices = values(root.get('slices'), 'production slice entries', fail).map((raw, index): WorkflowProductionSliceEntry => {
    const entry = fields(raw, ['investigationId', 'component', 'representativeContext'], `production slice entries[${index}]`, fail);
    const component = fields(entry.get('component'), ['source', 'selector', 'contractSha256'], `production slice entries[${index}].component`, fail);
    const context = fields(entry.get('representativeContext'), ['source', 'route', 'selector'], `production slice entries[${index}].representativeContext`, fail);
    const componentSource = receipt(component.get('source'), 'production slice component source', fail);
    const contextSource = receipt(context.get('source'), 'production slice context source', fail);
    if (componentSource.schema !== 'production-source' || contextSource.schema !== 'production-source' || componentSource.path === contextSource.path) fail('source binding is invalid');
    return Object.freeze({
      investigationId: token(entry.get('investigationId'), 'production slice investigationId', fail),
      component: Object.freeze({ source: componentSource as ArtifactReceipt<'production-source'>, selector: text(component.get('selector'), 'production slice component selector', fail), contractSha256: digest(component.get('contractSha256'), 'production slice component contract', fail) }),
      representativeContext: Object.freeze({ source: contextSource as ArtifactReceipt<'production-source'>, route: routePath(context.get('route'), 'production slice representative route'), selector: text(context.get('selector'), 'production slice representative selector', fail) }),
    });
  });
  if (slices.length === 0 || new Set(slices.map(({ investigationId }) => investigationId)).size !== slices.length) fail('slice entries are invalid');
  return Object.freeze({
    schema: ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_SCHEMA,
    route: parsedRoute,
    plan: plan as ArtifactReceipt<'adaptive-workflow-plan-v1'>,
    readiness: readiness as ArtifactReceipt<'adaptive-workflow-production-readiness-v1'>,
    owner: Object.freeze({ role: 'omd-hand', buildSha256: digest(ownerFields.get('buildSha256'), 'production slice owner build', fail), loadedSkillSha256: digest(ownerFields.get('loadedSkillSha256'), 'production slice owner skill', fail), briefSha256: digest(ownerFields.get('briefSha256'), 'production slice owner brief', fail) }),
    slices: Object.freeze([...slices].sort((left, right) => left.investigationId.localeCompare(right.investigationId))),
  });
}
