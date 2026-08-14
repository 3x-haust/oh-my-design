import { createHash } from 'node:crypto';

import { decodePng } from '../motion/energy.ts';
import { canonicalWorkflowPlanJson } from './workflow-plan.ts';
import { parseComponentStressProof, type ApplicableStressCase, type ComponentStressProof } from './component-stress-proof.ts';
import { ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_SCHEMA, type WorkflowProductionSliceEntry } from './production-slice.ts';
import {
  booleanValue,
  digest,
  fields,
  integer,
  oneOf,
  receipt,
  receipts,
  safePath,
  sameReceipts,
  text,
  token,
  values,
  type ArtifactReceipt,
  type ProofFail,
} from './proof-primitives.ts';

export const COMPONENT_STRESS_PROOF_V2_SCHEMA = 'component-stress-proof-v2' as const;
export const INTERACTION_BEHAVIOR_PROOF_SCHEMA = 'interaction-behavior-proof-v1' as const;

export type ProductionProofCurrent = Readonly<{
  planSha256: string;
  investigationId: string;
  inputs: readonly ArtifactReceipt[];
  sliceReceipt: ArtifactReceipt<typeof ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_SCHEMA>;
  slice: WorkflowProductionSliceEntry;
  readFile: (path: string) => Uint8Array;
}>;

export type ComponentStressProofV2 = Readonly<{
  schema: typeof COMPONENT_STRESS_PROOF_V2_SCHEMA;
  planSha256: string;
  investigationId: string;
  inputs: readonly ArtifactReceipt[];
  productionSlice: ArtifactReceipt<typeof ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_SCHEMA>;
  component: Readonly<{ sourcePath: string; selector: string; contractSha256: string; sourceSha256: string }>;
  cases: ComponentStressProof['cases'];
}>;

export type InteractionBehaviorProof = Readonly<{
  schema: typeof INTERACTION_BEHAVIOR_PROOF_SCHEMA;
  planSha256: string;
  investigationId: string;
  inputs: readonly ArtifactReceipt[];
  productionSlice: ArtifactReceipt<typeof ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_SCHEMA>;
  component: ComponentStressProofV2['component'];
  cases: readonly Readonly<{
    id: string;
    evidenceId: string;
    stateId: string;
    viewport: 'desktop' | 'mobile';
    width: number;
    height: number;
    context: 'representative-page';
    render: ArtifactReceipt<'png'>;
    assertions: readonly Readonly<{ behavior: string; expected: string; observed: string; pass: true }>[];
  }>[];
}>;

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const malformed: ProofFail = (message) => { throw new Error(`adaptive workflow production proof: ${message}`); };

function currentBindings(value: unknown): ProductionProofCurrent {
  const current = fields(value, ['planSha256', 'investigationId', 'inputs', 'sliceReceipt', 'slice', 'readFile'], 'current production proof', malformed);
  const sliceReceipt = receipt(current.get('sliceReceipt'), 'current production proof slice receipt', malformed);
  if (sliceReceipt.schema !== ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_SCHEMA) malformed('current production proof slice schema is invalid');
  const readFile = current.get('readFile');
  if (typeof readFile !== 'function') malformed('current production proof readFile must be a function');
  return {
    planSha256: digest(current.get('planSha256'), 'current production proof plan', malformed),
    investigationId: token(current.get('investigationId'), 'current production proof investigation', malformed),
    inputs: receipts(current.get('inputs'), 'current production proof inputs', malformed),
    sliceReceipt: sliceReceipt as ArtifactReceipt<typeof ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_SCHEMA>,
    slice: current.get('slice') as WorkflowProductionSliceEntry,
    readFile: readFile as (path: string) => Uint8Array,
  };
}

function componentIdentity(value: unknown, label: string) {
  const item = fields(value, ['sourcePath', 'selector', 'contractSha256', 'sourceSha256'], label, malformed);
  return Object.freeze({
    sourcePath: safePath(item.get('sourcePath'), `${label}.sourcePath`, malformed),
    selector: text(item.get('selector'), `${label}.selector`, malformed),
    contractSha256: digest(item.get('contractSha256'), `${label}.contractSha256`, malformed),
    sourceSha256: digest(item.get('sourceSha256'), `${label}.sourceSha256`, malformed),
  });
}

function validateCommon(root: ReadonlyMap<string, unknown>, current: ProductionProofCurrent) {
  const planSha256 = digest(root.get('planSha256'), 'production proof planSha256', malformed);
  const investigationId = token(root.get('investigationId'), 'production proof investigationId', malformed);
  const inputs = receipts(root.get('inputs'), 'production proof inputs', malformed);
  const productionSlice = receipt(root.get('productionSlice'), 'production proof slice', malformed);
  const component = componentIdentity(root.get('component'), 'production proof component');
  if (planSha256 !== current.planSha256 || investigationId !== current.investigationId
    || !sameReceipts(inputs, current.inputs)
    || canonicalWorkflowPlanJson(productionSlice) !== canonicalWorkflowPlanJson(current.sliceReceipt)) malformed('proof bindings are stale');
  const expected = current.slice.component;
  if (component.sourcePath !== expected.source.path || component.selector !== expected.selector
    || component.contractSha256 !== expected.contractSha256 || component.sourceSha256 !== expected.source.sha256) malformed('component binding is stale');
  let source: Uint8Array;
  let context: Uint8Array;
  try { source = current.readFile(expected.source.path); context = current.readFile(current.slice.representativeContext.source.path); }
  catch { return malformed('production slice source is stale'); }
  if (hash(source) !== expected.source.sha256 || hash(context) !== current.slice.representativeContext.source.sha256) malformed('production slice source is stale');
  return { planSha256, investigationId, inputs, productionSlice: productionSlice as ArtifactReceipt<typeof ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_SCHEMA>, component };
}

export function parseComponentStressProofV2(value: unknown, currentValue: ProductionProofCurrent, applicableCases: readonly ApplicableStressCase[]): ComponentStressProofV2 {
  const current = currentBindings(currentValue);
  const root = fields(value, ['schema', 'planSha256', 'investigationId', 'inputs', 'productionSlice', 'component', 'cases'], 'component stress proof v2', malformed);
  if (root.get('schema') !== COMPONENT_STRESS_PROOF_V2_SCHEMA) malformed('component stress proof v2 schema is invalid');
  const common = validateCommon(root, current);
  const legacy = parseComponentStressProof({
    schema: 'component-stress-proof-v1',
    planSha256: common.planSha256,
    inputs: common.inputs,
    component: { sourcePath: common.component.sourcePath, selector: common.component.selector, contractSha256: common.component.contractSha256 },
    cases: root.get('cases'),
  }, {
    planSha256: current.planSha256,
    inputs: current.inputs,
    component: { sourcePath: current.slice.component.source.path, selector: current.slice.component.selector, contractSha256: current.slice.component.contractSha256 },
    applicableCases,
    readRender: current.readFile,
  });
  return Object.freeze({ schema: COMPONENT_STRESS_PROOF_V2_SCHEMA, ...common, cases: legacy.cases });
}

export function parseInteractionBehaviorProof(value: unknown, currentValue: ProductionProofCurrent, evidenceIds: readonly string[]): InteractionBehaviorProof {
  const current = currentBindings(currentValue);
  const root = fields(value, ['schema', 'planSha256', 'investigationId', 'inputs', 'productionSlice', 'component', 'cases'], 'interaction behavior proof', malformed);
  if (root.get('schema') !== INTERACTION_BEHAVIOR_PROOF_SCHEMA) malformed('interaction behavior proof schema is invalid');
  const common = validateCommon(root, current);
  const cases = values(root.get('cases'), 'interaction behavior cases', malformed).map((raw, index) => {
    const item = fields(raw, ['id', 'evidenceId', 'stateId', 'viewport', 'width', 'height', 'context', 'render', 'assertions'], `interaction behavior cases[${index}]`, malformed);
    const evidenceId = token(item.get('evidenceId'), `interaction behavior cases[${index}].evidenceId`, malformed);
    if (!evidenceIds.includes(evidenceId)) malformed('interaction behavior case cites inapplicable evidence');
    if (item.get('context') !== 'representative-page') malformed('interaction behavior proof requires representative page context');
    const renderValue = receipt(item.get('render'), `interaction behavior cases[${index}].render`, malformed);
    if (renderValue.schema !== 'png') malformed('interaction behavior render must be png');
    const width = integer(item.get('width'), `interaction behavior cases[${index}].width`, malformed, 1);
    const height = integer(item.get('height'), `interaction behavior cases[${index}].height`, malformed, 1);
    let bytes: Uint8Array;
    try { bytes = current.readFile(renderValue.path); } catch { return malformed('interaction behavior render is stale'); }
    if (hash(bytes) !== renderValue.sha256) malformed('interaction behavior render is stale');
    let dimensions: ReturnType<typeof decodePng>;
    try { dimensions = decodePng(Buffer.from(bytes)); } catch { return malformed('interaction behavior render is invalid'); }
    if (dimensions.width !== width || dimensions.height !== height) malformed('interaction behavior render dimensions are stale');
    const assertions = values(item.get('assertions'), `interaction behavior cases[${index}].assertions`, malformed).map((rawAssertion, assertionIndex) => {
      const assertion = fields(rawAssertion, ['behavior', 'expected', 'observed', 'pass'], `interaction behavior assertion ${assertionIndex}`, malformed);
      if (!booleanValue(assertion.get('pass'), 'interaction behavior assertion pass', malformed)) malformed('interaction behavior assertion failed');
      return Object.freeze({ behavior: token(assertion.get('behavior'), 'interaction behavior assertion behavior', malformed), expected: text(assertion.get('expected'), 'interaction behavior assertion expected', malformed), observed: text(assertion.get('observed'), 'interaction behavior assertion observed', malformed), pass: true as const });
    });
    if (assertions.length === 0 || new Set(assertions.map(({ behavior }) => behavior)).size !== assertions.length) malformed('interaction behavior assertions are incomplete');
    return Object.freeze({
      id: token(item.get('id'), `interaction behavior cases[${index}].id`, malformed), evidenceId,
      stateId: token(item.get('stateId'), `interaction behavior cases[${index}].stateId`, malformed),
      viewport: oneOf(item.get('viewport'), ['desktop', 'mobile'] as const, `interaction behavior cases[${index}].viewport`, malformed),
      width, height, context: 'representative-page' as const,
      render: renderValue as ArtifactReceipt<'png'>, assertions: Object.freeze(assertions),
    });
  });
  if (cases.length === 0 || new Set(cases.map(({ id }) => id)).size !== cases.length
    || evidenceIds.some((id) => !cases.some((entry) => entry.evidenceId === id))) malformed('interaction behavior evidence coverage is incomplete');
  return Object.freeze({ schema: INTERACTION_BEHAVIOR_PROOF_SCHEMA, ...common, cases: Object.freeze(cases) });
}
