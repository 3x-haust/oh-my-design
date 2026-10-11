import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  ACQUISITION_PLAN_V2_SCHEMA,
  validateAcquisitionPlan,
  type AcquisitionPlanV2,
  type AcquisitionZoneV2,
  type ReferenceInfluenceAxis,
} from '../deliberation/contracts.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { validateCurrentProjectRun } from '../runtime/invocation.ts';
import type { PiRoleResult } from '../runtime/pi-role-receipt.ts';
import { verifySignedPiEyeRoleResult } from '../runtime/pi-role-receipt.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { requireProjectWriteAdapter } from '../runtime/project-write.ts';
import type { Reference } from '../types.ts';
import { canonicalJson, sha256 } from './board-artifacts.ts';
import { hasAssemblyPayload } from './board-sanitization.ts';
import { trustedReferenceImage } from './board-security.ts';
import { requireDesignReferenceAdmission } from './design-admission.ts';
import { refIdentity } from './identity.ts';
import { readContainedRegularFile } from './reference-selection.ts';
import { loadRefs, refRecordPath } from './store.ts';

export const REFERENCE_ZONE_REVIEWER_TASK = 'Inspect the supplied complete original or 2x PNG only for the named acquisition zone, exact influence axis, required component state, and recorded acquisition viewport. Judge the visible pixels independently from any existing global direction or support verdict. Return only outputContract.responseTemplate as a top-level JSON object: preserve every immutable binding exactly and replace only the null reviewer fields. visualQuality must describe whether the capture is excellent, ordinary, or weak, with specific pixel-grounded visualEvidence. visualEvidence describes the visible composition and controls, not just the quality enum label. relationshipCompatibility must describe whether the visual relationship between the source and the named destination zone is compatible, bounded, or incompatible, with specific relationshipEvidence tied to that zone and axis. Both evidence fields are source-free prose: omit URLs, hostnames, file paths, image filenames, source record IDs, markup, pixel payloads, and control characters. Slash-separated words are parsed as paths even when intended as ordinary prose; use words joined by conjunctions instead. Keep source identities and immutable bindings only in their designated unchanged fields. Set verdict to zone-compatible only when visualQuality is excellent and relationshipCompatibility is compatible; otherwise set reject. Do not provide or infer an overall appearanceIntent, do not broaden the judgment to another zone, axis, state, or viewport, and do not treat an existing direction or support verdict as scoped authorization.'
  + " Judge only the declared influence axis and inspectable source state, not whether the source implements the destination product. A different industry, object name, brand, content, or feature set is not by itself a visual relationship mismatch. For a scoped confirmation structure, compare visible target naming, consequence explanation, action priority and surrounding context; do not require the source to delete the same kind of object as the destination. Still reject missing required visible states, inadequate craft, or a materially conflicting user relationship or work posture, explaining that conflict in the supplied pixels. For a complete native image, the recorded viewport is the acquisition browser context, not the CSS viewport of the app depicted inside the image. Native raster dimensions, depicted app layout, acquisition browser viewport and destination validation viewports are distinct. Do not reject a complete mobile original merely because it was acquired in a wide browser; do not infer unobserved source reflow or destination behavior.";
export const REFERENCE_ZONE_REVIEWER_TRANSPORT_SCHEMA = 'reference-zone-reviewer-transport-v1' as const;
export const REFERENCE_ZONE_REVIEWER_HANDBACK_SCHEMA = 'reference-zone-reviewer-handback-v1' as const;
export const REFERENCE_ZONE_ADMISSION_RECORD_SCHEMA = 'reference-zone-admission-v1' as const;
export const REFERENCE_ZONE_ADMISSION_POINTER_SCHEMA = 'reference-zone-admission-pointer-v1' as const;
export const REFERENCE_ZONE_ADMISSION_POINTER = '.omd/reference-zone-admission.json';

const RECORD_DIRECTORY = 'reference-zone-admissions';
const SHA = /^[a-f0-9]{64}$/;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const STATIC_AXES: readonly ReferenceInfluenceAxis[] = ['structure', 'proportion', 'density', 'rhythm'];

function fail(code: string): never { throw new Error(code); }
const text = (value: unknown, code: string): string =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : fail(code);
const digest = (value: unknown, code: string): string => {
  const result = text(value, code);
  return SHA.test(result) ? result : fail(code);
};
const object = (value: unknown, code: string): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : fail(code);
const exact = (value: Record<string, unknown>, keys: readonly string[], code: string): void => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
};
const viewportKey = (viewport: Readonly<{ width: number; height: number }>): string =>
  `${viewport.width}x${viewport.height}`;

export type ReferenceZoneVerdict = 'zone-compatible' | 'reject';
export type ReferenceZoneAdmission = Readonly<{
  sourceId: string;
  lane: 'design';
  captureSha256: string;
  imageSha256: string;
  acquisitionSha256: string;
  zoneSha256: string;
  zoneId: string;
  decisionId: string;
  axis: ReferenceInfluenceAxis;
  requiredState: string;
  viewport: Readonly<{ width: number; height: number }>;
  falsifier: string;
  visualQuality: 'excellent' | 'ordinary' | 'weak';
  visualEvidence: string;
  relationshipCompatibility: 'compatible' | 'bounded' | 'incompatible';
  relationshipEvidence: string;
  verdict: ReferenceZoneVerdict;
}>;

type ReferenceRender = Readonly<{
  sourceId: string;
  lane: 'design';
  captureSha256: string;
  imageSha256: string;
  width: number;
  height: number;
  pixelDensity: '2x-or-original';
  pngBase64: string;
}>;
type ZoneProjection = Readonly<{
  zoneId: string;
  decisionId: string;
  question: string;
  job: string;
  axis: ReferenceInfluenceAxis;
  requiredState: string;
  viewport: Readonly<{ width: number; height: number }>;
  falsifier: string;
}>;
type FixedBindings = Readonly<{
  sourceContractSha256: string;
  taskSha256: string;
  captureSetSha256: string;
  acquisitionSha256: string;
  zoneSha256: string;
  previousAdmissionSha256: string | null;
}>;
type ReferenceZoneReviewerPacket = Readonly<{
  schema: typeof REFERENCE_ZONE_REVIEWER_TRANSPORT_SCHEMA;
  evidenceSha256: string;
  evidence: Readonly<{
    task: Readonly<{ request: string; sourceContractSha256: string; taskSha256: string }>;
    acquisition: Readonly<{
      schema: typeof ACQUISITION_PLAN_V2_SCHEMA;
      acquisitionSha256: string;
      plan: AcquisitionPlanV2;
      zoneSha256: string;
      zone: ZoneProjection;
    }>;
    referenceRenders: readonly [ReferenceRender];
  }>;
  outputContract: Readonly<{
    schema: typeof REFERENCE_ZONE_REVIEWER_HANDBACK_SCHEMA;
    lane: 'referenceAdmission';
    fixedBindings: FixedBindings;
    reviewerFields: readonly ['admission'];
    assessmentSchema: typeof ASSESSMENT_SCHEMA;
    responseTemplate: ReferenceZoneHandback;
  }>;
}>;
type ReferenceZoneHandback = Readonly<{
  schema: typeof REFERENCE_ZONE_REVIEWER_HANDBACK_SCHEMA;
  lane: 'referenceAdmission';
  sourceContractSha256: string;
  taskSha256: string;
  captureSetSha256: string;
  acquisitionSha256: string;
  zoneSha256: string;
  previousAdmissionSha256: string | null;
  admission: Readonly<Omit<ReferenceZoneAdmission,
    'visualQuality' | 'visualEvidence' | 'relationshipCompatibility' | 'relationshipEvidence' | 'verdict'> & {
      visualQuality: ReferenceZoneAdmission['visualQuality'] | null;
      visualEvidence: string | null;
      relationshipCompatibility: ReferenceZoneAdmission['relationshipCompatibility'] | null;
      relationshipEvidence: string | null;
      verdict: ReferenceZoneVerdict | null;
    }>;
}>;
export type ReferenceZoneAdmissionRecord = Readonly<{
  schema: typeof REFERENCE_ZONE_ADMISSION_RECORD_SCHEMA;
  packetSha256: string;
  evidenceSha256: string;
  sourceContractSha256: string;
  taskSha256: string;
  captureSetSha256: string;
  acquisitionSha256: string;
  zoneSha256: string;
  previousAdmissionSha256: string | null;
  admission: ReferenceZoneAdmission;
  reviewer: PiRoleResult;
}>;

const ASSESSMENT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['visualQuality', 'visualEvidence', 'relationshipCompatibility', 'relationshipEvidence', 'verdict'],
  properties: {
    visualQuality: { enum: ['excellent', 'ordinary', 'weak'] },
    visualEvidence: { type: 'string', minLength: 1 },
    relationshipCompatibility: { enum: ['compatible', 'bounded', 'incompatible'] },
    relationshipEvidence: { type: 'string', minLength: 1 },
    verdict: { enum: ['zone-compatible', 'reject'] },
  },
});

function parseJson(bytes: Buffer, code: string): unknown {
  try { return JSON.parse(bytes.toString('utf8')); } catch { return fail(code); }
}

function currentRouteBinding(root: string): Readonly<{ sourceContractSha256: string; task: string }> {
  const pointer = object(parseJson(readContainedRegularFile(root, '.omd/route.json', 'route pointer'),
    'REFERENCE_ZONE_ROUTE_INVALID'), 'REFERENCE_ZONE_ROUTE_INVALID');
  exact(pointer, ['schema', 'record', 'sha256'], 'REFERENCE_ZONE_ROUTE_INVALID');
  const recordPath = text(pointer.record, 'REFERENCE_ZONE_ROUTE_INVALID');
  const expected = digest(pointer.sha256, 'REFERENCE_ZONE_ROUTE_INVALID');
  const bytes = readContainedRegularFile(root, `.omd/${recordPath}`, 'route record');
  if (sha256(bytes) !== expected) fail('REFERENCE_ZONE_ROUTE_INVALID');
  const record = object(parseJson(bytes, 'REFERENCE_ZONE_ROUTE_INVALID'), 'REFERENCE_ZONE_ROUTE_INVALID');
  const references = object(record.references, 'REFERENCE_ZONE_ROUTE_INVALID');
  if (references.decision !== 'discover') fail('REFERENCE_ZONE_ADMISSION_STALE');
  return Object.freeze({
    sourceContractSha256: digest(record.sourceContractSha256, 'REFERENCE_ZONE_ROUTE_INVALID'),
    task: text(record.request, 'REFERENCE_ZONE_ROUTE_INVALID'),
  });
}

function currentAcquisition(root: string): Readonly<{
  plan: AcquisitionPlanV2;
  acquisitionSha256: string;
}> {
  const bytes = readContainedRegularFile(root, '.omd/acquisition-plan.json', 'reference acquisition plan');
  const checked = validateAcquisitionPlan(parseJson(bytes, 'REFERENCE_ZONE_ACQUISITION_INVALID'));
  if (checked.value?.schema !== ACQUISITION_PLAN_V2_SCHEMA) fail('REFERENCE_ZONE_ACQUISITION_V2_REQUIRED');
  const plan = checked.value as AcquisitionPlanV2;
  if (plan.zones.some(zone => hasAssemblyPayload(zone.job) || hasAssemblyPayload(zone.question))) {
    fail('REFERENCE_ZONE_SOURCE_PAYLOAD');
  }
  return Object.freeze({ plan, acquisitionSha256: sha256(canonicalJson(plan)) });
}

function zoneProjection(zone: AcquisitionZoneV2, axis: ReferenceInfluenceAxis,
  viewport: Readonly<{ width: number; height: number }>): ZoneProjection {
  if (!STATIC_AXES.includes(axis)) fail('REFERENCE_ZONE_STATIC_AXIS_REQUIRED');
  if (!zone.axes.includes(axis) || !zone.viewports.some(candidate => viewportKey(candidate) === viewportKey(viewport))) {
    fail('REFERENCE_ZONE_SCOPE_INVALID');
  }
  return Object.freeze({
    zoneId: zone.id,
    decisionId: zone.decisionId,
    question: zone.question,
    job: zone.job,
    axis,
    requiredState: zone.requiredState,
    viewport: Object.freeze({ width: viewport.width, height: viewport.height }),
    falsifier: zone.falsifier,
  });
}

function currentZone(root: string, zoneId: string, axis: ReferenceInfluenceAxis,
  viewport: Readonly<{ width: number; height: number }>): Readonly<{
    plan: AcquisitionPlanV2;
    acquisitionSha256: string;
    zone: ZoneProjection;
    zoneSha256: string;
  }> {
  const acquisition = currentAcquisition(root);
  const selected = acquisition.plan.zones.find(zone => zone.id === zoneId)
    ?? fail('REFERENCE_ZONE_SCOPE_INVALID');
  if (!selected.required) fail('REFERENCE_ZONE_SCOPE_INVALID');
  const zone = zoneProjection(selected, axis, viewport);
  return Object.freeze({ ...acquisition, zone, zoneSha256: sha256(canonicalJson(zone)) });
}

function renderFor(root: string, reference: Reference,
  viewport: Readonly<{ width: number; height: number }>): ReferenceRender {
  if (reference.researchLane !== 'design') fail('REFERENCE_ZONE_WRONG_LANE');
  if (reference.viewport === undefined || viewportKey(reference.viewport) !== viewportKey(viewport)) {
    fail('REFERENCE_ZONE_VIEWPORT_MISMATCH');
  }
  requireDesignReferenceAdmission(root, reference, { references: [reference] });
  const imagePath = reference.imagePath ?? fail('REFERENCE_ZONE_CAPTURE_REQUIRED');
  const image = readFileSync(trustedReferenceImage(root, imagePath));
  if (image.length < 24 || !image.subarray(0, 8).equals(PNG_SIGNATURE)) fail('REFERENCE_ZONE_CAPTURE_REQUIRED');
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  if (reference.kind !== 'image' && (width !== viewport.width * 2 || height !== viewport.height * 2)) {
    fail('REFERENCE_ZONE_2X_CAPTURE_REQUIRED');
  }
  const capture = readContainedRegularFile(root, relative(root, refRecordPath(root, reference)),
    'retained design capture');
  return Object.freeze({
    sourceId: refIdentity(reference.source, reference.component),
    lane: 'design',
    captureSha256: sha256(capture),
    imageSha256: sha256(image),
    width,
    height,
    pixelDensity: '2x-or-original',
    pngBase64: image.toString('base64'),
  });
}

function captureSetSha256(render: ReferenceRender): string {
  const { pngBase64: _pngBase64, ...binding } = render;
  return sha256(canonicalJson([binding]));
}

function responseTemplate(fixed: FixedBindings,
  render: Pick<ReferenceRender, 'sourceId' | 'lane' | 'captureSha256' | 'imageSha256'>,
  zone: Omit<ZoneProjection, 'question' | 'job'>): ReferenceZoneHandback {
  return Object.freeze({
    schema: REFERENCE_ZONE_REVIEWER_HANDBACK_SCHEMA,
    lane: 'referenceAdmission',
    ...fixed,
    admission: Object.freeze({
      sourceId: render.sourceId,
      lane: render.lane,
      captureSha256: render.captureSha256,
      imageSha256: render.imageSha256,
      acquisitionSha256: fixed.acquisitionSha256,
      zoneSha256: fixed.zoneSha256,
      zoneId: zone.zoneId,
      decisionId: zone.decisionId,
      axis: zone.axis,
      requiredState: zone.requiredState,
      viewport: zone.viewport,
      falsifier: zone.falsifier,
      visualQuality: null,
      visualEvidence: null,
      relationshipCompatibility: null,
      relationshipEvidence: null,
      verdict: null,
    }),
  });
}

function parseRender(value: unknown): ReferenceRender {
  const row = object(value, 'REFERENCE_ZONE_PACKET_INVALID');
  exact(row, ['sourceId', 'lane', 'captureSha256', 'imageSha256', 'width', 'height', 'pixelDensity', 'pngBase64'],
    'REFERENCE_ZONE_PACKET_INVALID');
  const png = Buffer.from(text(row.pngBase64, 'REFERENCE_ZONE_PACKET_INVALID'), 'base64');
  const imageSha256 = digest(row.imageSha256, 'REFERENCE_ZONE_PACKET_INVALID');
  if (row.lane !== 'design' || row.pixelDensity !== '2x-or-original' || sha256(png) !== imageSha256
    || !Number.isSafeInteger(row.width) || !Number.isSafeInteger(row.height) || png.length < 24
    || !png.subarray(0, 8).equals(PNG_SIGNATURE)
    || row.width !== png.readUInt32BE(16) || row.height !== png.readUInt32BE(20)) {
    fail('REFERENCE_ZONE_PACKET_INVALID');
  }
  return Object.freeze({
    sourceId: text(row.sourceId, 'REFERENCE_ZONE_PACKET_INVALID'),
    lane: 'design',
    captureSha256: digest(row.captureSha256, 'REFERENCE_ZONE_PACKET_INVALID'),
    imageSha256,
    width: row.width as number,
    height: row.height as number,
    pixelDensity: '2x-or-original',
    pngBase64: png.toString('base64'),
  });
}

function parseZone(value: unknown): ZoneProjection {
  const zone = object(value, 'REFERENCE_ZONE_PACKET_INVALID');
  exact(zone, ['zoneId', 'decisionId', 'question', 'job', 'axis', 'requiredState', 'viewport', 'falsifier'],
    'REFERENCE_ZONE_PACKET_INVALID');
  const viewport = object(zone.viewport, 'REFERENCE_ZONE_PACKET_INVALID');
  exact(viewport, ['width', 'height'], 'REFERENCE_ZONE_PACKET_INVALID');
  if (!Number.isSafeInteger(viewport.width) || !Number.isSafeInteger(viewport.height)
    || (viewport.width as number) < 1 || (viewport.height as number) < 1) fail('REFERENCE_ZONE_PACKET_INVALID');
  const axis = text(zone.axis, 'REFERENCE_ZONE_PACKET_INVALID') as ReferenceInfluenceAxis;
  if (!STATIC_AXES.includes(axis)) fail('REFERENCE_ZONE_STATIC_AXIS_REQUIRED');
  if (hasAssemblyPayload(String(zone.job)) || hasAssemblyPayload(String(zone.question))) {
    fail('REFERENCE_ZONE_SOURCE_PAYLOAD');
  }
  return Object.freeze({
    zoneId: text(zone.zoneId, 'REFERENCE_ZONE_PACKET_INVALID'),
    decisionId: text(zone.decisionId, 'REFERENCE_ZONE_PACKET_INVALID'),
    question: text(zone.question, 'REFERENCE_ZONE_PACKET_INVALID'),
    job: text(zone.job, 'REFERENCE_ZONE_PACKET_INVALID'),
    axis,
    requiredState: text(zone.requiredState, 'REFERENCE_ZONE_PACKET_INVALID'),
    viewport: Object.freeze({ width: viewport.width as number, height: viewport.height as number }),
    falsifier: text(zone.falsifier, 'REFERENCE_ZONE_PACKET_INVALID'),
  });
}

function parsePacket(bytes: Buffer): ReferenceZoneReviewerPacket {
  const packet = object(parseJson(bytes, 'REFERENCE_ZONE_PACKET_INVALID'), 'REFERENCE_ZONE_PACKET_INVALID');
  exact(packet, ['schema', 'evidenceSha256', 'evidence', 'outputContract'], 'REFERENCE_ZONE_PACKET_INVALID');
  if (packet.schema !== REFERENCE_ZONE_REVIEWER_TRANSPORT_SCHEMA) fail('REFERENCE_ZONE_PACKET_INVALID');
  const evidence = object(packet.evidence, 'REFERENCE_ZONE_PACKET_INVALID');
  exact(evidence, ['task', 'acquisition', 'referenceRenders'], 'REFERENCE_ZONE_PACKET_INVALID');
  const taskValue = object(evidence.task, 'REFERENCE_ZONE_PACKET_INVALID');
  exact(taskValue, ['request', 'sourceContractSha256', 'taskSha256'], 'REFERENCE_ZONE_PACKET_INVALID');
  const request = text(taskValue.request, 'REFERENCE_ZONE_PACKET_INVALID');
  const sourceContractSha256 = digest(taskValue.sourceContractSha256, 'REFERENCE_ZONE_PACKET_INVALID');
  const taskSha256 = digest(taskValue.taskSha256, 'REFERENCE_ZONE_PACKET_INVALID');
  if (taskSha256 !== sha256(request)) fail('REFERENCE_ZONE_PACKET_INVALID');
  const acquisitionValue = object(evidence.acquisition, 'REFERENCE_ZONE_PACKET_INVALID');
  exact(acquisitionValue, ['schema', 'acquisitionSha256', 'plan', 'zoneSha256', 'zone'],
    'REFERENCE_ZONE_PACKET_INVALID');
  if (acquisitionValue.schema !== ACQUISITION_PLAN_V2_SCHEMA) fail('REFERENCE_ZONE_PACKET_INVALID');
  const checked = validateAcquisitionPlan(acquisitionValue.plan);
  if (checked.value?.schema !== ACQUISITION_PLAN_V2_SCHEMA) fail('REFERENCE_ZONE_PACKET_INVALID');
  const plan = checked.value as AcquisitionPlanV2;
  const acquisitionSha256 = digest(acquisitionValue.acquisitionSha256, 'REFERENCE_ZONE_PACKET_INVALID');
  if (acquisitionSha256 !== sha256(canonicalJson(plan))) fail('REFERENCE_ZONE_PACKET_INVALID');
  const zone = parseZone(acquisitionValue.zone);
  const zoneSha256 = digest(acquisitionValue.zoneSha256, 'REFERENCE_ZONE_PACKET_INVALID');
  if (zoneSha256 !== sha256(canonicalJson(zone))) fail('REFERENCE_ZONE_PACKET_INVALID');
  const sourceZone = plan.zones.find(candidate => candidate.id === zone.zoneId);
  if (sourceZone === undefined || !sourceZone.required
    || canonicalJson(zoneProjection(sourceZone, zone.axis, zone.viewport)) !== canonicalJson(zone)) {
    fail('REFERENCE_ZONE_PACKET_INVALID');
  }
  if (!Array.isArray(evidence.referenceRenders) || evidence.referenceRenders.length !== 1) {
    fail('REFERENCE_ZONE_PACKET_INVALID');
  }
  const render = parseRender(evidence.referenceRenders[0]);
  const normalizedEvidence = Object.freeze({
    task: Object.freeze({ request, sourceContractSha256, taskSha256 }),
    acquisition: Object.freeze({
      schema: ACQUISITION_PLAN_V2_SCHEMA,
      acquisitionSha256,
      plan,
      zoneSha256,
      zone,
    }),
    referenceRenders: Object.freeze([render] as const),
  });
  const evidenceSha256 = digest(packet.evidenceSha256, 'REFERENCE_ZONE_PACKET_INVALID');
  if (evidenceSha256 !== sha256(canonicalJson(normalizedEvidence))) fail('REFERENCE_ZONE_PACKET_INVALID');
  const output = object(packet.outputContract, 'REFERENCE_ZONE_PACKET_INVALID');
  exact(output, ['schema', 'lane', 'fixedBindings', 'reviewerFields', 'assessmentSchema', 'responseTemplate'],
    'REFERENCE_ZONE_PACKET_INVALID');
  const fixedValue = object(output.fixedBindings, 'REFERENCE_ZONE_PACKET_INVALID');
  exact(fixedValue, ['sourceContractSha256', 'taskSha256', 'captureSetSha256', 'acquisitionSha256',
    'zoneSha256', 'previousAdmissionSha256'], 'REFERENCE_ZONE_PACKET_INVALID');
  const fixed: FixedBindings = Object.freeze({
    sourceContractSha256: digest(fixedValue.sourceContractSha256, 'REFERENCE_ZONE_PACKET_INVALID'),
    taskSha256: digest(fixedValue.taskSha256, 'REFERENCE_ZONE_PACKET_INVALID'),
    captureSetSha256: digest(fixedValue.captureSetSha256, 'REFERENCE_ZONE_PACKET_INVALID'),
    acquisitionSha256: digest(fixedValue.acquisitionSha256, 'REFERENCE_ZONE_PACKET_INVALID'),
    zoneSha256: digest(fixedValue.zoneSha256, 'REFERENCE_ZONE_PACKET_INVALID'),
    previousAdmissionSha256: fixedValue.previousAdmissionSha256 === null ? null
      : digest(fixedValue.previousAdmissionSha256, 'REFERENCE_ZONE_PACKET_INVALID'),
  });
  if (output.schema !== REFERENCE_ZONE_REVIEWER_HANDBACK_SCHEMA || output.lane !== 'referenceAdmission'
    || JSON.stringify(output.reviewerFields) !== JSON.stringify(['admission'])
    || canonicalJson(output.assessmentSchema) !== canonicalJson(ASSESSMENT_SCHEMA)
    || fixed.sourceContractSha256 !== sourceContractSha256 || fixed.taskSha256 !== taskSha256
    || fixed.captureSetSha256 !== captureSetSha256(render)
    || fixed.acquisitionSha256 !== acquisitionSha256 || fixed.zoneSha256 !== zoneSha256
    || canonicalJson(object(output.responseTemplate, 'REFERENCE_ZONE_PACKET_INVALID'))
      !== canonicalJson(responseTemplate(fixed, render, zone))) {
    fail('REFERENCE_ZONE_PACKET_INVALID');
  }
  return Object.freeze({
    schema: REFERENCE_ZONE_REVIEWER_TRANSPORT_SCHEMA,
    evidenceSha256,
    evidence: normalizedEvidence,
    outputContract: Object.freeze({
      schema: REFERENCE_ZONE_REVIEWER_HANDBACK_SCHEMA,
      lane: 'referenceAdmission',
      fixedBindings: fixed,
      reviewerFields: ['admission'] as const,
      assessmentSchema: ASSESSMENT_SCHEMA,
      responseTemplate: responseTemplate(fixed, render, zone),
    }),
  });
}

function parseHandback(value: unknown, fixed: FixedBindings,
  template: ReferenceZoneHandback['admission']): Readonly<{
    handback: ReferenceZoneHandback;
    admission: ReferenceZoneAdmission;
  }> {
  const item = object(value, 'REFERENCE_ZONE_HANDBACK_INVALID');
  exact(item, ['schema', 'lane', 'sourceContractSha256', 'taskSha256', 'captureSetSha256',
    'acquisitionSha256', 'zoneSha256', 'previousAdmissionSha256', 'admission'],
  'REFERENCE_ZONE_HANDBACK_INVALID');
  if (item.schema !== REFERENCE_ZONE_REVIEWER_HANDBACK_SCHEMA || item.lane !== 'referenceAdmission') {
    fail('REFERENCE_ZONE_HANDBACK_INVALID');
  }
  for (const key of ['sourceContractSha256', 'taskSha256', 'captureSetSha256', 'acquisitionSha256',
    'zoneSha256', 'previousAdmissionSha256'] as const) {
    if (item[key] !== fixed[key]) fail(`REFERENCE_ZONE_HANDBACK_INVALID:fixed-bindings:${key}`);
  }
  const row = object(item.admission, 'REFERENCE_ZONE_HANDBACK_INVALID');
  exact(row, ['sourceId', 'lane', 'captureSha256', 'imageSha256', 'acquisitionSha256', 'zoneSha256',
    'zoneId', 'decisionId', 'axis', 'requiredState', 'viewport', 'falsifier', 'visualQuality',
    'visualEvidence', 'relationshipCompatibility', 'relationshipEvidence', 'verdict'],
  'REFERENCE_ZONE_HANDBACK_INVALID');
  for (const key of ['sourceId', 'lane', 'captureSha256', 'imageSha256', 'acquisitionSha256', 'zoneSha256',
    'zoneId', 'decisionId', 'axis', 'requiredState', 'falsifier'] as const) {
    if (row[key] !== template[key]) fail(`REFERENCE_ZONE_HANDBACK_INVALID:scope:${key}`);
  }
  if (canonicalJson(row.viewport) !== canonicalJson(template.viewport)) {
    fail('REFERENCE_ZONE_HANDBACK_INVALID:scope:viewport');
  }
  const visualQuality = text(row.visualQuality, 'REFERENCE_ZONE_HANDBACK_INVALID:visualQuality');
  const visualEvidence = text(row.visualEvidence, 'REFERENCE_ZONE_HANDBACK_INVALID:visualEvidence');
  const relationshipCompatibility = text(row.relationshipCompatibility,
    'REFERENCE_ZONE_HANDBACK_INVALID:relationshipCompatibility');
  const relationshipEvidence = text(row.relationshipEvidence,
    'REFERENCE_ZONE_HANDBACK_INVALID:relationshipEvidence');
  if (!ASSESSMENT_SCHEMA.properties.visualQuality.enum.includes(visualQuality)) {
    fail('REFERENCE_ZONE_HANDBACK_INVALID:assessment:visualQuality:enum');
  }
  if (!ASSESSMENT_SCHEMA.properties.relationshipCompatibility.enum.includes(relationshipCompatibility)) {
    fail('REFERENCE_ZONE_HANDBACK_INVALID:assessment:relationshipCompatibility:enum');
  }
  if (hasAssemblyPayload(visualEvidence)) {
    fail('REFERENCE_ZONE_HANDBACK_INVALID:assessment:visualEvidence:source-payload');
  }
  if (hasAssemblyPayload(relationshipEvidence)) {
    fail('REFERENCE_ZONE_HANDBACK_INVALID:assessment:relationshipEvidence:source-payload');
  }
  if (!ASSESSMENT_SCHEMA.properties.verdict.enum.includes(String(row.verdict))) {
    fail('REFERENCE_ZONE_HANDBACK_INVALID:assessment:verdict:enum');
  }
  const verdict = row.verdict as ReferenceZoneVerdict;
  if (verdict === 'zone-compatible' && (visualQuality !== 'excellent'
    || relationshipCompatibility !== 'compatible')) {
    fail('REFERENCE_ZONE_QUALITY_CONTRADICTION');
  }
  const admission: ReferenceZoneAdmission = Object.freeze({
    sourceId: template.sourceId,
    lane: 'design',
    captureSha256: template.captureSha256,
    imageSha256: template.imageSha256,
    acquisitionSha256: template.acquisitionSha256,
    zoneSha256: template.zoneSha256,
    zoneId: template.zoneId,
    decisionId: template.decisionId,
    axis: template.axis,
    requiredState: template.requiredState,
    viewport: template.viewport,
    falsifier: template.falsifier,
    visualQuality: visualQuality as ReferenceZoneAdmission['visualQuality'],
    visualEvidence,
    relationshipCompatibility:
      relationshipCompatibility as ReferenceZoneAdmission['relationshipCompatibility'],
    relationshipEvidence,
    verdict,
  });
  const handback = Object.freeze({ ...fixed, schema: REFERENCE_ZONE_REVIEWER_HANDBACK_SCHEMA,
    lane: 'referenceAdmission' as const, admission });
  return Object.freeze({ handback, admission });
}

function requirePacketCurrent(root: string, packet: ReferenceZoneReviewerPacket): void {
  const route = currentRouteBinding(root);
  if (route.sourceContractSha256 !== packet.evidence.task.sourceContractSha256
    || sha256(route.task) !== packet.evidence.task.taskSha256) fail('REFERENCE_ZONE_ADMISSION_STALE');
  const acquisition = currentZone(root, packet.evidence.acquisition.zone.zoneId,
    packet.evidence.acquisition.zone.axis, packet.evidence.acquisition.zone.viewport);
  if (acquisition.acquisitionSha256 !== packet.evidence.acquisition.acquisitionSha256
    || acquisition.zoneSha256 !== packet.evidence.acquisition.zoneSha256
    || canonicalJson(acquisition.plan) !== canonicalJson(packet.evidence.acquisition.plan)
    || canonicalJson(acquisition.zone) !== canonicalJson(packet.evidence.acquisition.zone)) {
    fail('REFERENCE_ZONE_ADMISSION_STALE');
  }
  const row = packet.evidence.referenceRenders[0];
  const reference = loadRefs(root, { includeDomain: true }).find(candidate =>
    candidate.researchLane === 'design' && refIdentity(candidate.source, candidate.component) === row.sourceId);
  if (reference === undefined
    || (reference.kind !== 'image' && reference.blueprint !== undefined && reference.slot !== acquisition.zone.zoneId)) fail('REFERENCE_ZONE_ADMISSION_STALE');
  const current = renderFor(root, reference, acquisition.zone.viewport);
  if (current.captureSha256 !== row.captureSha256 || current.imageSha256 !== row.imageSha256
    || current.width !== row.width || current.height !== row.height) fail('REFERENCE_ZONE_ADMISSION_STALE');
}

function readHead(root: string): Readonly<{
  sourceContractSha256: string;
  taskSha256: string;
  recordSha256: string;
}> | null {
  if (!existsSync(join(root, REFERENCE_ZONE_ADMISSION_POINTER))) return null;
  let pointer: Record<string, unknown>;
  try {
    pointer = object(parseJson(readContainedRegularFile(root, REFERENCE_ZONE_ADMISSION_POINTER,
      'reference zone admission pointer'), 'REFERENCE_ZONE_ADMISSION_FORGED'),
    'REFERENCE_ZONE_ADMISSION_FORGED');
  } catch { return fail('REFERENCE_ZONE_ADMISSION_FORGED'); }
  exact(pointer, ['schema', 'sourceContractSha256', 'taskSha256', 'record', 'sha256'],
    'REFERENCE_ZONE_ADMISSION_FORGED');
  const recordSha256 = digest(pointer.sha256, 'REFERENCE_ZONE_ADMISSION_FORGED');
  if (pointer.schema !== REFERENCE_ZONE_ADMISSION_POINTER_SCHEMA
    || pointer.record !== `${RECORD_DIRECTORY}/sha256-${recordSha256}.json`) {
    fail('REFERENCE_ZONE_ADMISSION_FORGED');
  }
  return Object.freeze({
    sourceContractSha256: digest(pointer.sourceContractSha256, 'REFERENCE_ZONE_ADMISSION_FORGED'),
    taskSha256: digest(pointer.taskSha256, 'REFERENCE_ZONE_ADMISSION_FORGED'),
    recordSha256,
  });
}

export function buildReferenceZoneReviewerPacket(root: string, input: Readonly<{
  sourceContractSha256: string;
  task: string;
  reference: Reference;
  zoneId: string;
  axis: ReferenceInfluenceAxis;
  viewport: Readonly<{ width: number; height: number }>;
}>): Buffer {
  const route = currentRouteBinding(root);
  const sourceContractSha256 = digest(input.sourceContractSha256, 'REFERENCE_ZONE_SOURCE_CONTRACT_REQUIRED');
  const request = text(input.task, 'REFERENCE_ZONE_TASK_REQUIRED');
  if (route.sourceContractSha256 !== sourceContractSha256 || route.task !== request) {
    fail('REFERENCE_ZONE_ADMISSION_STALE');
  }
  const acquisition = currentZone(root, text(input.zoneId, 'REFERENCE_ZONE_SCOPE_INVALID'),
    input.axis, input.viewport);
  if (input.reference.kind !== 'image' && input.reference.blueprint !== undefined
    && input.reference.slot !== acquisition.zone.zoneId) fail('REFERENCE_ZONE_SCOPE_INVALID');
  const render = renderFor(root, input.reference, acquisition.zone.viewport);
  const task = Object.freeze({ request, sourceContractSha256, taskSha256: sha256(request) });
  const evidence = Object.freeze({
    task,
    acquisition: Object.freeze({
      schema: ACQUISITION_PLAN_V2_SCHEMA,
      acquisitionSha256: acquisition.acquisitionSha256,
      plan: acquisition.plan,
      zoneSha256: acquisition.zoneSha256,
      zone: acquisition.zone,
    }),
    referenceRenders: Object.freeze([render] as const),
  });
  const head = readAuthenticatedReferenceZoneAdmissions(root, sourceContractSha256)[0]?.sha256 ?? null;
  const fixedBindings: FixedBindings = Object.freeze({
    sourceContractSha256,
    taskSha256: task.taskSha256,
    captureSetSha256: captureSetSha256(render),
    acquisitionSha256: acquisition.acquisitionSha256,
    zoneSha256: acquisition.zoneSha256,
    previousAdmissionSha256: head,
  });
  return Buffer.from(canonicalJson({
    schema: REFERENCE_ZONE_REVIEWER_TRANSPORT_SCHEMA,
    evidenceSha256: sha256(canonicalJson(evidence)),
    evidence,
    outputContract: {
      schema: REFERENCE_ZONE_REVIEWER_HANDBACK_SCHEMA,
      lane: 'referenceAdmission',
      fixedBindings,
      reviewerFields: ['admission'],
      assessmentSchema: ASSESSMENT_SCHEMA,
      responseTemplate: responseTemplate(fixedBindings, render, acquisition.zone),
    },
  }));
}

export function publishReferenceZoneAdmission(root: string, packetBytes: Buffer, reviewer: PiRoleResult,
  invocation: ProjectRunInvocation, writer: ProjectWriteAdapter): ReferenceZoneAdmissionRecord {
  const packet = parsePacket(packetBytes);
  requirePacketCurrent(root, packet);
  validateCurrentProjectRun(invocation);
  const head = readAuthenticatedReferenceZoneAdmissions(root,
    packet.evidence.task.sourceContractSha256)[0]?.sha256 ?? null;
  if (packet.outputContract.fixedBindings.previousAdmissionSha256 !== head) {
    fail('REFERENCE_ZONE_ADMISSION_STALE');
  }
  const verified = verifySignedPiEyeRoleResult(reviewer, root);
  if (verified.receipt.buildSha256 !== invocation.current.buildSha256
    || verified.receipt.briefSha256 !== invocation.current.briefSha256
    || verified.receipt.taskSha256 !== sha256(REFERENCE_ZONE_REVIEWER_TASK)
    || verified.receipt.reviewerEvidence.taskSha256 !== verified.receipt.taskSha256
    || verified.receipt.reviewerEvidence.packetSha256 !== sha256(packetBytes)
    || verified.receipt.reviewerEvidence.evidenceSha256 !== packet.evidenceSha256) {
    fail('REFERENCE_ZONE_ADMISSION_UNAUTHORIZED');
  }
  const adapter = requireProjectWriteAdapter(root, writer);
  const reviewerBytes = canonicalJson(reviewer);
  // Authenticated attempts are diagnostic evidence, never an approval pointer.
  adapter.writeContentAddressed(
    `.omd/.cache/reference-zone-reviews/sha256-${sha256(reviewerBytes)}.json`, reviewerBytes,
  );
  let result: unknown;
  try { result = JSON.parse(verified.finalMessage); } catch { return fail('REFERENCE_ZONE_HANDBACK_INVALID'); }
  const parsed = parseHandback(result, packet.outputContract.fixedBindings,
    packet.outputContract.responseTemplate.admission);
  const record: ReferenceZoneAdmissionRecord = Object.freeze({
    schema: REFERENCE_ZONE_ADMISSION_RECORD_SCHEMA,
    packetSha256: sha256(packetBytes),
    evidenceSha256: packet.evidenceSha256,
    sourceContractSha256: parsed.handback.sourceContractSha256,
    taskSha256: parsed.handback.taskSha256,
    captureSetSha256: parsed.handback.captureSetSha256,
    acquisitionSha256: parsed.handback.acquisitionSha256,
    zoneSha256: parsed.handback.zoneSha256,
    previousAdmissionSha256: parsed.handback.previousAdmissionSha256,
    admission: parsed.admission,
    reviewer,
  });
  const bytes = canonicalJson(record);
  const recordSha256 = sha256(bytes);
  const recordPath = `${RECORD_DIRECTORY}/sha256-${recordSha256}.json`;
  adapter.writeContentAddressed(`.omd/${recordPath}`, bytes);
  adapter.write(REFERENCE_ZONE_ADMISSION_POINTER, canonicalJson({
    schema: REFERENCE_ZONE_ADMISSION_POINTER_SCHEMA,
    sourceContractSha256: record.sourceContractSha256,
    taskSha256: record.taskSha256,
    record: recordPath,
    sha256: recordSha256,
  }));
  return record;
}

export function readAuthenticatedReferenceZoneAdmissions(root: string,
  expectedSourceContractSha256: string): readonly Readonly<{
    sha256: string;
    admission: ReferenceZoneAdmission;
    record: ReferenceZoneAdmissionRecord;
  }>[] {
  const expectedSource = digest(expectedSourceContractSha256, 'REFERENCE_ZONE_ADMISSION_STALE');
  const head = readHead(root);
  if (head === null) return [];
  const route = currentRouteBinding(root);
  if (head.sourceContractSha256 !== expectedSource || route.sourceContractSha256 !== expectedSource
    || head.taskSha256 !== sha256(route.task)) fail('REFERENCE_ZONE_ADMISSION_STALE');
  const history: Readonly<{
    sha256: string;
    admission: ReferenceZoneAdmission;
    record: ReferenceZoneAdmissionRecord;
  }>[] = [];
  const visited = new Set<string>();
  let recordSha256: string | null = head.recordSha256;
  while (recordSha256 !== null) {
    if (visited.has(recordSha256)) fail('REFERENCE_ZONE_ADMISSION_FORGED');
    visited.add(recordSha256);
    let bytes: Buffer;
    let raw: unknown;
    try {
      bytes = readContainedRegularFile(root, `.omd/${RECORD_DIRECTORY}/sha256-${recordSha256}.json`,
        'reference zone admission');
      raw = parseJson(bytes, 'REFERENCE_ZONE_ADMISSION_FORGED');
    } catch { return fail('REFERENCE_ZONE_ADMISSION_FORGED'); }
    if (sha256(bytes) !== recordSha256) fail('REFERENCE_ZONE_ADMISSION_FORGED');
    const value = object(raw, 'REFERENCE_ZONE_ADMISSION_FORGED');
    exact(value, ['schema', 'packetSha256', 'evidenceSha256', 'sourceContractSha256', 'taskSha256',
      'captureSetSha256', 'acquisitionSha256', 'zoneSha256', 'previousAdmissionSha256', 'admission', 'reviewer'],
    'REFERENCE_ZONE_ADMISSION_FORGED');
    if (value.schema !== REFERENCE_ZONE_ADMISSION_RECORD_SCHEMA
      || value.sourceContractSha256 !== expectedSource || value.taskSha256 !== head.taskSha256) {
      fail('REFERENCE_ZONE_ADMISSION_STALE');
    }
    let verified;
    try { verified = verifySignedPiEyeRoleResult(value.reviewer, root); }
    catch { return fail('REFERENCE_ZONE_ADMISSION_FORGED'); }
    const packetSha256 = digest(value.packetSha256, 'REFERENCE_ZONE_ADMISSION_FORGED');
    const evidenceSha256 = digest(value.evidenceSha256, 'REFERENCE_ZONE_ADMISSION_FORGED');
    if (verified.receipt.taskSha256 !== sha256(REFERENCE_ZONE_REVIEWER_TASK)
      || verified.receipt.reviewerEvidence.taskSha256 !== verified.receipt.taskSha256
      || verified.receipt.reviewerEvidence.packetSha256 !== packetSha256
      || verified.receipt.reviewerEvidence.evidenceSha256 !== evidenceSha256) {
      fail('REFERENCE_ZONE_ADMISSION_FORGED');
    }
    let final: unknown;
    try { final = JSON.parse(verified.finalMessage); } catch { return fail('REFERENCE_ZONE_ADMISSION_FORGED'); }
    const admissionValue = object(value.admission, 'REFERENCE_ZONE_ADMISSION_FORGED');
    const viewport = object(admissionValue.viewport, 'REFERENCE_ZONE_ADMISSION_FORGED');
    const axis = text(admissionValue.axis, 'REFERENCE_ZONE_ADMISSION_FORGED') as ReferenceInfluenceAxis;
    if (!STATIC_AXES.includes(axis) || typeof viewport.width !== 'number'
      || typeof viewport.height !== 'number' || !Number.isSafeInteger(viewport.width)
      || !Number.isSafeInteger(viewport.height) || viewport.width < 1 || viewport.height < 1) {
      fail('REFERENCE_ZONE_ADMISSION_FORGED');
    }
    const zone = {
      zoneId: text(admissionValue.zoneId, 'REFERENCE_ZONE_ADMISSION_FORGED'),
      decisionId: text(admissionValue.decisionId, 'REFERENCE_ZONE_ADMISSION_FORGED'),
      axis, viewport: { width: viewport.width, height: viewport.height },
      requiredState: text(admissionValue.requiredState, 'REFERENCE_ZONE_ADMISSION_FORGED'),
      falsifier: text(admissionValue.falsifier, 'REFERENCE_ZONE_ADMISSION_FORGED'),
    };
    const render = {
      sourceId: text(admissionValue.sourceId, 'REFERENCE_ZONE_ADMISSION_FORGED'),
      lane: 'design' as const,
      captureSha256: digest(admissionValue.captureSha256, 'REFERENCE_ZONE_ADMISSION_FORGED'),
      imageSha256: digest(admissionValue.imageSha256, 'REFERENCE_ZONE_ADMISSION_FORGED'),
    };
    const fixed: FixedBindings = Object.freeze({
      sourceContractSha256: expectedSource,
      taskSha256: head.taskSha256,
      captureSetSha256: digest(value.captureSetSha256, 'REFERENCE_ZONE_ADMISSION_FORGED'),
      acquisitionSha256: digest(value.acquisitionSha256, 'REFERENCE_ZONE_ADMISSION_FORGED'),
      zoneSha256: digest(value.zoneSha256, 'REFERENCE_ZONE_ADMISSION_FORGED'),
      previousAdmissionSha256: value.previousAdmissionSha256 === null ? null
        : digest(value.previousAdmissionSha256, 'REFERENCE_ZONE_ADMISSION_FORGED'),
    });
    const template = responseTemplate(fixed, render, zone).admission;
    let parsed;
    try { parsed = parseHandback(final, fixed, template); }
    catch { return fail('REFERENCE_ZONE_ADMISSION_FORGED'); }
    if (canonicalJson(parsed.admission) !== canonicalJson(value.admission)) {
      fail('REFERENCE_ZONE_ADMISSION_FORGED');
    }
    const record = value as unknown as ReferenceZoneAdmissionRecord;
    history.push(Object.freeze({ sha256: recordSha256, admission: parsed.admission, record }));
    recordSha256 = fixed.previousAdmissionSha256;
  }
  return Object.freeze(history);
}

export function requireReferenceZoneAdmission(root: string, input: Readonly<{
  reference: Reference;
  sourceContractSha256: string;
  zoneId: string;
  axis: ReferenceInfluenceAxis;
  viewport: Readonly<{ width: number; height: number }>;
}>): ReferenceZoneAdmission {
  const zone = currentZone(root, input.zoneId, input.axis, input.viewport);
  if (input.reference.researchLane !== 'design'
    || (input.reference.kind !== 'image' && input.reference.blueprint !== undefined
      && input.reference.slot !== zone.zone.zoneId)) {
    fail('REFERENCE_ZONE_SCOPE_INVALID');
  }
  const render = renderFor(root, input.reference, zone.zone.viewport);
  const sourceId = refIdentity(input.reference.source, input.reference.component);
  const row = readAuthenticatedReferenceZoneAdmissions(root, input.sourceContractSha256)
    .map(item => item.admission)
    .find(admission => admission.sourceId === sourceId
      && admission.captureSha256 === render.captureSha256
      && admission.imageSha256 === render.imageSha256
      && admission.acquisitionSha256 === zone.acquisitionSha256
      && admission.zoneSha256 === zone.zoneSha256
      && admission.zoneId === zone.zone.zoneId
      && admission.axis === zone.zone.axis
      && viewportKey(admission.viewport) === viewportKey(zone.zone.viewport));
  if (row === undefined) fail('REFERENCE_ZONE_ADMISSION_MISSING');
  if (row.verdict !== 'zone-compatible') fail('REFERENCE_ZONE_ADMISSION_REJECTED');
  return row;
}
