import { createHash } from 'node:crypto';
import { isModelLedProcess } from '../route/process-policy.ts';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { PiRoleResult } from '../runtime/pi-role-receipt.ts';
import { verifySignedPiEyeRoleResult } from '../runtime/pi-role-receipt.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { validateCurrentProjectRun } from '../runtime/invocation.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { requireProjectWriteAdapter } from '../runtime/project-write.ts';
import { MAX_INLINE_EVIDENCE_BYTES } from '../runtime/evidence-proxy.ts';
import type { Reference } from '../types.ts';
import { canonicalJson, sha256 } from './board-artifacts.ts';
import { hasAssemblyPayload } from './board-sanitization.ts';
import { trustedReferenceImage } from './board-security.ts';
import { requireDesignReferenceAdmission } from './design-admission.ts';
import { refIdentity } from './identity.ts';
import { loadDesignCandidates, promoteDesignCandidate } from './reference-candidate.ts';
import { readContainedRegularFile } from './reference-selection.ts';
import { loadRefs, refRecordPath } from './store.ts';

const PREVIOUS_REFERENCE_DIRECTION_REVIEWER_TASK = 'Inspect every supplied complete original or 2x candidate PNG against the supplied destination task. For each image separately judge visible populated task content, aesthetic composition and typography, usable hierarchy at this viewport, and whether its actual visual character can transfer to the requested product. Empty, loading, obscured, substituted, visually weak, or irrelevant screens cannot become a direction; assess these as pixels in context rather than by source reputation. Return only outputContract.responseTemplate as a top-level JSON object, not its wrapper: copy every immutable field and every admission row exactly, replace each null verdict with direction, support, or reject based on the pixels, and write a specific source-free appearanceIntent only for direction (otherwise leave it null). Include every supplied image once; support cannot authorize visual direction, and reject must remain rejected.';
const SCOPED_REFERENCE_DIRECTION_REVIEWER_TASK = 'Inspect each saved original or 2x PNG as a complete capture, before writing appearanceIntent. For every image assess what the pixels actually depict and their scope, with specific visible evidence: a complete released product/app task screen, finished website, documentation/help shell, changelog/promotional wrapper, reference-discovery catalogue or directory, isolated component/menu detail, blocked/loading content, or uncertain content. The discovery-list captureType means a gallery, search result or directory collecting reference candidates, not a working list inside a finished product. A populated in-product work list, board, search interface or calendar can be a finished-product-task-screen when its work object, purpose and relevant controls are visible. A complete task screen need not show global navigation or every later step of its flow; an isolated control without its necessary task context is still bounded detail. Judge task transfer through the visible work objects, information roles and interaction sequence, not identical business sector, feature names or branding; do not infer destination capabilities from the reference. A page wrapping a partial embedded app screenshot is still the page wrapper; a beautiful isolated submenu is at most bounded support, never an overall app direction. A finished website can qualify when its visual system transfers to the destination task without sharing features or branding. Independently judge visible population, aesthetic excellence, composition, typography, hierarchy, and task transfer; correct scope classification does not guarantee approval, and weak or irrelevant surfaces must not be approved. Only a clearly qualifying complete finished surface may receive direction; wrappers, reference-discovery catalogues/directories, isolated details, blocked/loading and uncertain captures cannot. Return only outputContract.responseTemplate as a top-level JSON object: preserve immutable fields and each admission binding, fill every assessment captureType, directionQualification and specific visibleEvidence before verdict, replace null verdict with direction, support or reject, and write source-free appearanceIntent only for direction (otherwise null). Both visibleEvidence and appearanceIntent must be source-free plain sentences: omit URLs, DNS names, file paths, source or image identifiers, encoded image data, markup and slash-separated shorthand. Describe a visible branded footer as a footer or logo without transcribing its domain; write date and time rather than date/time. Immutable binding fields remain exact. Include every image exactly once; support cannot authorize visual direction.';
export const REFERENCE_DIRECTION_REVIEWER_TASK = SCOPED_REFERENCE_DIRECTION_REVIEWER_TASK + ' Also record visualQuality as excellent, ordinary or weak with separate pixel-grounded visualEvidence, and userRelationship as fits, bounded or incompatible with separate relationshipEvidence. A readable populated layout is not by itself aesthetically excellent: explain the deliberate composition, hierarchy, typography and visual character that make it desirable, not just which status fields exist. Evaluate destination user relationship and work posture independently of business sector. Organizational administration, multi-person assignment and oversight can be incompatible with a calm personal service even when status fields transfer; bounded information-role transfer is support, not overall direction. Direction requires excellent visualQuality and fits userRelationship, as well as qualifying scope. No dimension compensates for another; ordinary craft or bounded/incompatible relationship cannot receive direction. All evidence fields use the same source-free plain-sentence rules as visibleEvidence. Missing evidence stays unresolved rather than gaining a favorable inference.';
const LEGACY_REFERENCE_DIRECTION_REVIEWER_TASK = 'Inspect every supplied full-resolution retained reference PNG against the supplied destination task. Return only outputContract.responseTemplate as a top-level JSON object, not its wrapper: copy every immutable field and every admission row exactly, replace each null verdict with direction, support, or reject based on the pixels, and write a specific source-free appearanceIntent only for direction (otherwise leave it null). Include every supplied image once; support cannot authorize visual direction, and reject must remain rejected.';
export const REFERENCE_DIRECTION_ADMISSION_POINTER = '.omd/reference-direction-admission.json';
export const hasReferenceDirectionAdmission = (root: string): boolean => existsSync(join(root, REFERENCE_DIRECTION_ADMISSION_POINTER));
const PACKET_SCHEMA = 'reference-direction-reviewer-transport-v1' as const;
const PACKET_SCHEMA_V2 = 'reference-direction-reviewer-transport-v2' as const;
const PACKET_SCHEMA_V3 = 'reference-direction-reviewer-transport-v3' as const;
const PACKET_SCHEMA_V4 = 'reference-direction-reviewer-transport-v4' as const;
const HANDBACK_SCHEMA = 'reference-direction-reviewer-handback-v1' as const;
const HANDBACK_SCHEMA_V2 = 'reference-direction-reviewer-handback-v2' as const;
const HANDBACK_SCHEMA_V3 = 'reference-direction-reviewer-handback-v3' as const;
const HANDBACK_SCHEMA_V4 = 'reference-direction-reviewer-handback-v4' as const;
const RECORD_SCHEMA = 'reference-direction-admission-v1' as const;
const RECORD_SCHEMA_V2 = 'reference-direction-admission-v2' as const;
const RECORD_SCHEMA_V3 = 'reference-direction-admission-v3' as const;
const RECORD_SCHEMA_V4 = 'reference-direction-admission-v4' as const;
const POINTER_SCHEMA = 'reference-direction-admission-pointer-v1' as const;
const SHA = /^[a-f0-9]{64}$/;
const fail = (code: string): never => { throw new Error(code); };
const text = (value: unknown, code: string): string => typeof value === 'string' && value.trim() ? value.trim() : fail(code);
const digest = (value: unknown, code: string): string => { const result = text(value, code); return SHA.test(result) ? result : fail(code); };
const object = (value: unknown, code: string): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : fail(code);
const exact = (value: Record<string, unknown>, keys: readonly string[], code: string): void => {
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail(code);
};

export type ReferenceDirectionVerdict = 'direction' | 'support' | 'reject';
type CaptureType = 'finished-product-task-screen' | 'finished-website' | 'documentation-help-wrapper'
  | 'changelog-promotional-wrapper' | 'discovery-list' | 'isolated-component-detail'
  | 'blocked-or-loading-content' | 'uncertain-content';
type DirectionAssessment = Readonly<{
  captureType: CaptureType; directionQualification: 'qualifies' | 'support-only' | 'ineligible'; visibleEvidence: string;
  visualQuality?: 'excellent' | 'ordinary' | 'weak'; visualEvidence?: string;
  userRelationship?: 'fits' | 'bounded' | 'incompatible'; relationshipEvidence?: string;
}>;
const ASSESSMENT_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['captureType', 'directionQualification', 'visibleEvidence',
    'visualQuality', 'visualEvidence', 'userRelationship', 'relationshipEvidence'],
  properties: {
    captureType: { enum: ['finished-product-task-screen', 'finished-website', 'documentation-help-wrapper',
      'changelog-promotional-wrapper', 'discovery-list', 'isolated-component-detail',
      'blocked-or-loading-content', 'uncertain-content'] },
    directionQualification: { enum: ['qualifies', 'support-only', 'ineligible'] },
    visibleEvidence: { type: 'string', minLength: 1 },
    visualQuality: { enum: ['excellent', 'ordinary', 'weak'] },
    visualEvidence: { type: 'string', minLength: 1 },
    userRelationship: { enum: ['fits', 'bounded', 'incompatible'] },
    relationshipEvidence: { type: 'string', minLength: 1 },
  },
});
export type ReferenceDirectionAdmission = Readonly<{
  sourceId: string;
  lane: 'design';
  captureSha256: string;
  imageSha256: string;
  assessment?: DirectionAssessment;
  verdict: ReferenceDirectionVerdict;
  appearanceIntent: string | null;
}>;
type ReviewerPacket = Readonly<{
  schema: typeof PACKET_SCHEMA | typeof PACKET_SCHEMA_V2 | typeof PACKET_SCHEMA_V3 | typeof PACKET_SCHEMA_V4;
  evidenceSha256: string;
  evidence: Readonly<{
    task: Readonly<{ request: string; sourceContractSha256: string; taskSha256: string }>;
    referenceRenders: readonly Readonly<{
      sourceId: string; lane: 'design'; captureSha256: string; imageSha256: string;
      width: number; height: number; pixelDensity: '2x-or-original'; pngBase64: string;
    }>[];
  }>;
  outputContract: Readonly<{
    schema: typeof HANDBACK_SCHEMA | typeof HANDBACK_SCHEMA_V2 | typeof HANDBACK_SCHEMA_V3 | typeof HANDBACK_SCHEMA_V4;
    lane: 'referenceAdmission';
    fixedBindings: Readonly<{ sourceContractSha256: string; taskSha256: string; captureSetSha256: string; previousAdmissionSha256?: string | null }>;
    reviewerFields: readonly ['admissions'];
    assessmentSchema: typeof ASSESSMENT_SCHEMA;
    responseTemplate: Readonly<{
      schema: typeof HANDBACK_SCHEMA | typeof HANDBACK_SCHEMA_V2 | typeof HANDBACK_SCHEMA_V3 | typeof HANDBACK_SCHEMA_V4; lane: 'referenceAdmission';
      sourceContractSha256: string; taskSha256: string; captureSetSha256: string;
      previousAdmissionSha256?: string | null;
      admissions: readonly Readonly<Pick<ReferenceDirectionAdmission, 'sourceId' | 'lane' | 'captureSha256' | 'imageSha256'>
        & { assessment?: { captureType: null; directionQualification: null; visibleEvidence: null;
          visualQuality?: null; visualEvidence?: null; userRelationship?: null; relationshipEvidence?: null };
          verdict: null; appearanceIntent: null }>[];
    }>;
  }>;
}>;
type Handback = Readonly<{
  schema: typeof HANDBACK_SCHEMA | typeof HANDBACK_SCHEMA_V2 | typeof HANDBACK_SCHEMA_V3 | typeof HANDBACK_SCHEMA_V4;
  lane: 'referenceAdmission';
  sourceContractSha256: string;
  taskSha256: string;
  captureSetSha256: string;
  previousAdmissionSha256?: string | null;
  admissions: readonly ReferenceDirectionAdmission[];
}>;
type AdmissionRecord = Readonly<{
  schema: typeof RECORD_SCHEMA | typeof RECORD_SCHEMA_V2 | typeof RECORD_SCHEMA_V3 | typeof RECORD_SCHEMA_V4;
  packetSha256: string;
  sourceContractSha256: string;
  taskSha256: string;
  captureSetSha256: string;
  previousAdmissionSha256?: string | null;
  admissions: readonly ReferenceDirectionAdmission[];
  reviewer: PiRoleResult;
}>;

function responseTemplate(fixed: ReviewerPacket['outputContract']['fixedBindings'],
  renders: ReviewerPacket['evidence']['referenceRenders'], schema: Handback['schema']): ReviewerPacket['outputContract']['responseTemplate'] {
  return Object.freeze({ schema, lane: 'referenceAdmission', ...fixed,
    admissions: Object.freeze(renders.map(({ sourceId, lane, captureSha256, imageSha256 }) =>
      Object.freeze({ sourceId, lane, captureSha256, imageSha256,
        ...(schema === HANDBACK_SCHEMA_V3 || schema === HANDBACK_SCHEMA_V4 ? { assessment: {
          captureType: null, directionQualification: null, visibleEvidence: null,
          ...(schema === HANDBACK_SCHEMA_V4 ? {
            visualQuality: null, visualEvidence: null, userRelationship: null, relationshipEvidence: null,
          } : {}),
        } } : {}),
        verdict: null, appearanceIntent: null }))) });
}

function parsePacket(bytes: Buffer): ReviewerPacket {
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString('utf8')); } catch { return fail('REFERENCE_DIRECTION_PACKET_INVALID'); }
  const packet = object(parsed, 'REFERENCE_DIRECTION_PACKET_INVALID');
  exact(packet, ['schema', 'evidenceSha256', 'evidence', 'outputContract'], 'REFERENCE_DIRECTION_PACKET_INVALID');
  if (packet.schema !== PACKET_SCHEMA_V4) fail('REFERENCE_DIRECTION_PACKET_INVALID');
  const versionTwo = true;
  const evidence = object(packet.evidence, 'REFERENCE_DIRECTION_PACKET_INVALID');
  exact(evidence, ['task', 'referenceRenders'], 'REFERENCE_DIRECTION_PACKET_INVALID');
  const task = object(evidence.task, 'REFERENCE_DIRECTION_PACKET_INVALID');
  exact(task, ['request', 'sourceContractSha256', 'taskSha256'], 'REFERENCE_DIRECTION_PACKET_INVALID');
  const request = text(task.request, 'REFERENCE_DIRECTION_PACKET_INVALID');
  const sourceContractSha256 = digest(task.sourceContractSha256, 'REFERENCE_DIRECTION_PACKET_INVALID');
  const taskSha256 = digest(task.taskSha256, 'REFERENCE_DIRECTION_PACKET_INVALID');
  if (taskSha256 !== sha256(request)) fail('REFERENCE_DIRECTION_PACKET_INVALID');
  if (!Array.isArray(evidence.referenceRenders) || evidence.referenceRenders.length === 0) fail('REFERENCE_DIRECTION_PACKET_INVALID');
  const renderValues = evidence.referenceRenders as unknown[];
  const referenceRenders: ReviewerPacket['evidence']['referenceRenders'] = renderValues.map((value): ReviewerPacket['evidence']['referenceRenders'][number] => {
    const row = object(value, 'REFERENCE_DIRECTION_PACKET_INVALID');
    exact(row, ['sourceId', 'lane', 'captureSha256', 'imageSha256', 'width', 'height', 'pixelDensity', 'pngBase64'], 'REFERENCE_DIRECTION_PACKET_INVALID');
    const png = Buffer.from(text(row.pngBase64, 'REFERENCE_DIRECTION_PACKET_INVALID'), 'base64');
    const imageSha256 = digest(row.imageSha256, 'REFERENCE_DIRECTION_PACKET_INVALID');
    if (row.lane !== 'design' || row.pixelDensity !== '2x-or-original' || sha256(png) !== imageSha256
      || !Number.isSafeInteger(row.width) || !Number.isSafeInteger(row.height)
      || row.width !== png.readUInt32BE(16) || row.height !== png.readUInt32BE(20)) fail('REFERENCE_DIRECTION_PACKET_INVALID');
    return Object.freeze({ sourceId: text(row.sourceId, 'REFERENCE_DIRECTION_PACKET_INVALID'), lane: 'design' as const,
      captureSha256: digest(row.captureSha256, 'REFERENCE_DIRECTION_PACKET_INVALID'), imageSha256,
      width: row.width as number, height: row.height as number, pixelDensity: '2x-or-original' as const,
      pngBase64: png.toString('base64') });
  });
  if (new Set(referenceRenders.map(row => row.sourceId)).size !== referenceRenders.length) fail('REFERENCE_DIRECTION_PACKET_INVALID');
  const normalizedEvidence = { task: { request, sourceContractSha256, taskSha256 }, referenceRenders };
  const evidenceSha256 = digest(packet.evidenceSha256, 'REFERENCE_DIRECTION_PACKET_INVALID');
  if (evidenceSha256 !== sha256(canonicalJson(normalizedEvidence))) fail('REFERENCE_DIRECTION_PACKET_INVALID');
  const output = object(packet.outputContract, 'REFERENCE_DIRECTION_PACKET_INVALID');
  exact(output, ['schema', 'lane', 'fixedBindings', 'reviewerFields', 'assessmentSchema', 'responseTemplate'], 'REFERENCE_DIRECTION_PACKET_INVALID');
  if (canonicalJson(output.assessmentSchema) !== canonicalJson(ASSESSMENT_SCHEMA)) fail('REFERENCE_DIRECTION_PACKET_INVALID');
  const fixed = object(output.fixedBindings, 'REFERENCE_DIRECTION_PACKET_INVALID');
  exact(fixed, versionTwo
    ? ['sourceContractSha256', 'taskSha256', 'captureSetSha256', 'previousAdmissionSha256']
    : ['sourceContractSha256', 'taskSha256', 'captureSetSha256'], 'REFERENCE_DIRECTION_PACKET_INVALID');
  const previousAdmissionSha256 = versionTwo
    ? fixed.previousAdmissionSha256 === null ? null : digest(fixed.previousAdmissionSha256, 'REFERENCE_DIRECTION_PACKET_INVALID')
    : undefined;
  const captureSetSha256 = sha256(canonicalJson(referenceRenders.map(({ pngBase64: _png, ...row }) => row)));
  const handbackSchema = HANDBACK_SCHEMA_V4;
  if (output.schema !== handbackSchema || output.lane !== 'referenceAdmission'
    || JSON.stringify(output.reviewerFields) !== JSON.stringify(['admissions'])
    || fixed.sourceContractSha256 !== sourceContractSha256 || fixed.taskSha256 !== taskSha256
    || fixed.captureSetSha256 !== captureSetSha256) fail('REFERENCE_DIRECTION_PACKET_INVALID');
  const normalizedFixed = versionTwo
    ? { sourceContractSha256, taskSha256, captureSetSha256,
      previousAdmissionSha256: previousAdmissionSha256 === undefined ? fail('REFERENCE_DIRECTION_PACKET_INVALID') : previousAdmissionSha256 }
    : { sourceContractSha256, taskSha256, captureSetSha256 };
  const template = responseTemplate(normalizedFixed, referenceRenders, handbackSchema);
  if (canonicalJson(object(output.responseTemplate, 'REFERENCE_DIRECTION_PACKET_INVALID')) !== canonicalJson(template))
    fail('REFERENCE_DIRECTION_PACKET_INVALID');
  return Object.freeze({ schema: PACKET_SCHEMA_V4, evidenceSha256, evidence: Object.freeze(normalizedEvidence),
    outputContract: Object.freeze({ schema: handbackSchema, lane: 'referenceAdmission',
      fixedBindings: Object.freeze(normalizedFixed), reviewerFields: ['admissions'] as const,
      assessmentSchema: ASSESSMENT_SCHEMA, responseTemplate: template }) });
}

function parseHandback(value: unknown, packet: Readonly<{
  outputContract: Pick<ReviewerPacket['outputContract'], 'fixedBindings'>;
  evidence: Readonly<{ referenceRenders: readonly Pick<ReviewerPacket['evidence']['referenceRenders'][number],
    'sourceId' | 'lane' | 'captureSha256' | 'imageSha256'>[] }>;
}>, legacyScope = false): Handback {
  const item = object(value, 'REFERENCE_DIRECTION_HANDBACK_INVALID:object');
  const versionTwo = true;
  exact(item, versionTwo
    ? ['schema', 'lane', 'sourceContractSha256', 'taskSha256', 'captureSetSha256', 'previousAdmissionSha256', 'admissions']
    : ['schema', 'lane', 'sourceContractSha256', 'taskSha256', 'captureSetSha256', 'admissions'], 'REFERENCE_DIRECTION_HANDBACK_INVALID:top-fields');
  const fixed = packet.outputContract.fixedBindings;
  if (item.schema !== (legacyScope ? HANDBACK_SCHEMA_V3 : HANDBACK_SCHEMA_V4) || item.lane !== 'referenceAdmission')
    fail('REFERENCE_DIRECTION_HANDBACK_INVALID:header');
  for (const key of ['sourceContractSha256', 'taskSha256', 'captureSetSha256', 'previousAdmissionSha256'] as const) {
    if (key === 'previousAdmissionSha256' && !versionTwo) continue;
    if (item[key] !== fixed[key]) fail(`REFERENCE_DIRECTION_HANDBACK_INVALID:fixed-bindings:${key}`);
  }
  if (!Array.isArray(item.admissions) || item.admissions.length !== packet.evidence.referenceRenders.length)
    fail('REFERENCE_DIRECTION_HANDBACK_INVALID:admission-count');
  const expected = new Map(packet.evidence.referenceRenders.map(row => [row.sourceId, row]));
  const admissionValues = item.admissions as unknown[];
  const admissions: readonly ReferenceDirectionAdmission[] = admissionValues.map((value): ReferenceDirectionAdmission => {
    const row = object(value, 'REFERENCE_DIRECTION_HANDBACK_INVALID:row-object');
    exact(row, ['sourceId', 'lane', 'captureSha256', 'imageSha256', 'assessment', 'verdict', 'appearanceIntent'], 'REFERENCE_DIRECTION_HANDBACK_INVALID:row-fields');
    const assessment = object(row.assessment, 'REFERENCE_DIRECTION_HANDBACK_INVALID:assessment');
    exact(assessment, legacyScope ? ['captureType', 'directionQualification', 'visibleEvidence']
      : ASSESSMENT_SCHEMA.required, 'REFERENCE_DIRECTION_HANDBACK_INVALID:assessment');
    if (!ASSESSMENT_SCHEMA.properties.captureType.enum.some(type => type === assessment.captureType))
      fail('REFERENCE_DIRECTION_HANDBACK_INVALID:assessment.captureType');
    if (!ASSESSMENT_SCHEMA.properties.directionQualification.enum.some(value => value === assessment.directionQualification))
      fail('REFERENCE_DIRECTION_HANDBACK_INVALID:assessment.directionQualification');
    const visibleEvidence = text(assessment.visibleEvidence, 'REFERENCE_DIRECTION_HANDBACK_INVALID:assessment');
    if (hasAssemblyPayload(visibleEvidence)) fail('REFERENCE_DIRECTION_APPEARANCE_SOURCE_PAYLOAD:assessment.visibleEvidence');
    const quality = legacyScope ? undefined : {
      visualQuality: text(assessment.visualQuality, 'REFERENCE_DIRECTION_HANDBACK_INVALID:visualQuality'),
      visualEvidence: text(assessment.visualEvidence, 'REFERENCE_DIRECTION_HANDBACK_INVALID:visualEvidence'),
      userRelationship: text(assessment.userRelationship, 'REFERENCE_DIRECTION_HANDBACK_INVALID:userRelationship'),
      relationshipEvidence: text(assessment.relationshipEvidence, 'REFERENCE_DIRECTION_HANDBACK_INVALID:relationshipEvidence'),
    };
    if (quality && (!ASSESSMENT_SCHEMA.properties.visualQuality.enum.includes(quality.visualQuality)
      || !ASSESSMENT_SCHEMA.properties.userRelationship.enum.includes(quality.userRelationship)))
      fail('REFERENCE_DIRECTION_HANDBACK_INVALID:quality');
    if (quality && (hasAssemblyPayload(quality.visualEvidence) || hasAssemblyPayload(quality.relationshipEvidence)))
      fail('REFERENCE_DIRECTION_APPEARANCE_SOURCE_PAYLOAD:quality');
    const sourceId = text(row.sourceId, 'REFERENCE_DIRECTION_HANDBACK_INVALID:row-identity');
    const evidence = expected.get(sourceId);
    if (evidence === undefined) return fail('REFERENCE_DIRECTION_HANDBACK_INVALID:row-identity');
    if (row.lane !== 'design' || row.captureSha256 !== evidence.captureSha256 || row.imageSha256 !== evidence.imageSha256)
      fail('REFERENCE_DIRECTION_HANDBACK_INVALID:row-bindings');
    if (!['direction', 'support', 'reject'].includes(row.verdict as string)) fail('REFERENCE_DIRECTION_HANDBACK_INVALID:verdict');
    const verdict = row.verdict as ReferenceDirectionVerdict;
    if (verdict === 'direction' && quality
      && (quality.visualQuality !== 'excellent' || quality.userRelationship !== 'fits'))
      fail('REFERENCE_DIRECTION_QUALITY_CONTRADICTION');
    if (verdict === 'direction' && (assessment.directionQualification !== 'qualifies'
      || !['finished-product-task-screen', 'finished-website'].includes(assessment.captureType as string))
      || verdict !== 'direction' && assessment.directionQualification === 'qualifies'
      || verdict === 'support' && assessment.directionQualification !== 'support-only'
      || verdict === 'reject' && assessment.directionQualification !== 'ineligible') fail('REFERENCE_DIRECTION_ASSESSMENT_CONTRADICTION');
    const appearanceIntent = verdict === 'direction' ? text(row.appearanceIntent, 'REFERENCE_DIRECTION_HANDBACK_INVALID:direction-intent')
      : row.appearanceIntent === null ? null : fail('REFERENCE_DIRECTION_HANDBACK_INVALID:non-direction-intent');
    if (appearanceIntent !== null && hasAssemblyPayload(appearanceIntent)) fail('REFERENCE_DIRECTION_APPEARANCE_SOURCE_PAYLOAD:appearanceIntent');
    return Object.freeze({ sourceId, lane: 'design' as const, captureSha256: evidence.captureSha256,
      imageSha256: evidence.imageSha256, assessment: Object.freeze({ captureType: assessment.captureType as CaptureType,
        directionQualification: assessment.directionQualification as DirectionAssessment['directionQualification'], visibleEvidence,
        ...(quality ? { visualQuality: quality.visualQuality as NonNullable<DirectionAssessment['visualQuality']>,
          visualEvidence: quality.visualEvidence, userRelationship: quality.userRelationship as NonNullable<DirectionAssessment['userRelationship']>,
          relationshipEvidence: quality.relationshipEvidence } : {}),
      }), verdict, appearanceIntent });
  });
  if (new Set(admissions.map(row => row.sourceId)).size !== admissions.length) fail('REFERENCE_DIRECTION_HANDBACK_INVALID:duplicate');
  return Object.freeze({ schema: legacyScope ? HANDBACK_SCHEMA_V3 : HANDBACK_SCHEMA_V4,
    lane: 'referenceAdmission', ...fixed, admissions: Object.freeze(admissions) });
}

export function buildReferenceDirectionReviewerPacket(root: string, input: Readonly<{
  sourceContractSha256: string; task: string; references: readonly Reference[]; previousAdmissionSha256?: string | null;
}>): Buffer {
  const sourceContractSha256 = digest(input.sourceContractSha256, 'REFERENCE_DIRECTION_SOURCE_CONTRACT_REQUIRED');
  const request = text(input.task, 'REFERENCE_DIRECTION_TASK_REQUIRED');
  if (input.references.length === 0) fail('REFERENCE_DIRECTION_CAPTURE_REQUIRED');
  const candidates = loadDesignCandidates(root);
  const referenceRenders = input.references.map(reference => {
    if (reference.researchLane !== 'design') fail('REFERENCE_DIRECTION_ADMISSION_WRONG_LANE');
    const candidate = candidates.find(item => item.reference.source === reference.source
      && item.reference.component === reference.component && item.reference.capturedAt === reference.capturedAt);
    requireDesignReferenceAdmission(root, reference, { references: input.references, ...(candidate ? { candidate } : {}) });
    const imagePath = reference.imagePath;
    if (!imagePath) return fail('REFERENCE_DIRECTION_CAPTURE_REQUIRED');
    const image = candidate?.image ?? readFileSync(trustedReferenceImage(root, imagePath));
    if (image.length < 24 || !image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) fail('REFERENCE_DIRECTION_CAPTURE_REQUIRED');
    const width = image.readUInt32BE(16), height = image.readUInt32BE(20);
    if (reference.kind !== 'image' && (!reference.viewport || width !== reference.viewport.width * 2 || height !== reference.viewport.height * 2)) {
      fail('REFERENCE_DIRECTION_2X_CAPTURE_REQUIRED');
    }
    const capture = candidate?.capture
      ?? readContainedRegularFile(root, relative(root, refRecordPath(root, reference)), 'retained design capture');
    return Object.freeze({ sourceId: refIdentity(reference.source, reference.component), lane: 'design' as const,
      captureSha256: sha256(capture), imageSha256: sha256(image), width, height,
      pixelDensity: '2x-or-original' as const, pngBase64: image.toString('base64') });
  });
  if (new Set(referenceRenders.map(row => row.sourceId)).size !== referenceRenders.length) fail('REFERENCE_DIRECTION_CAPTURE_DUPLICATE');
  const task = { request, sourceContractSha256, taskSha256: sha256(request) };
  const evidence = { task, referenceRenders };
  const captureSetSha256 = sha256(canonicalJson(referenceRenders.map(({ pngBase64: _png, ...row }) => row)));
  const previousAdmissionSha256 = input.previousAdmissionSha256 == null ? null
    : digest(input.previousAdmissionSha256, 'REFERENCE_DIRECTION_ADMISSION_STALE');
  const fixedBindings = { sourceContractSha256, taskSha256: task.taskSha256, captureSetSha256, previousAdmissionSha256 };
  const handbackSchema = HANDBACK_SCHEMA_V4;
  return Buffer.from(canonicalJson({ schema: PACKET_SCHEMA_V4,
    evidenceSha256: sha256(canonicalJson(evidence)), evidence,
    outputContract: { schema: handbackSchema, lane: 'referenceAdmission',
      fixedBindings, reviewerFields: ['admissions'], assessmentSchema: ASSESSMENT_SCHEMA,
      responseTemplate: responseTemplate(fixedBindings, referenceRenders, handbackSchema) } }));
}

export function planReferenceDirectionReview(root: string, input: Readonly<{
  sourceContractSha256: string; task: string; references: readonly Reference[];
}>): Readonly<{ packet: Buffer | null; selected: number; pending: number; carried: number }> {
  const history = authenticatedHistoryForReview(root, input.sourceContractSha256, input.task);
  const candidates = loadDesignCandidates(root);
  const prior = history.filter(item => item.record.schema === RECORD_SCHEMA_V4).flatMap(item => item.admissions);
  const fresh = input.references.filter(reference => {
    const imagePath = reference.imagePath;
    if (!imagePath) return fail('REFERENCE_DIRECTION_CAPTURE_REQUIRED');
    const candidate = candidates.find(item => item.reference.source === reference.source
      && item.reference.component === reference.component && item.reference.capturedAt === reference.capturedAt);
    const capture = candidate?.capture
      ?? readContainedRegularFile(root, relative(root, refRecordPath(root, reference)), 'retained design capture');
    const image = candidate?.image ?? readFileSync(trustedReferenceImage(root, imagePath));
    return !prior.some(row => row.sourceId === refIdentity(reference.source, reference.component)
      && row.imageSha256 === sha256(image)
      && row.captureSha256 === sha256(capture));
  // Finished-site pages are the primary candidates, so they are reviewed first when one packet cannot hold everything.
  }).sort((a, b) => Number(a.kind === 'image') - Number(b.kind === 'image')
    || refIdentity(a.source, a.component).localeCompare(refIdentity(b.source, b.component)));
  const selected: Reference[] = [];
  let packet: Buffer | null = null;
  for (const reference of fresh) {
    const candidate = buildReferenceDirectionReviewerPacket(root, {
      ...input, references: [...selected, reference], previousAdmissionSha256: history[0]?.sha256 ?? null,
    });
    if (candidate.byteLength > MAX_INLINE_EVIDENCE_BYTES) {
      if (selected.length === 0) fail('REFERENCE_DIRECTION_CAPTURE_TOO_LARGE');
      break;
    }
    selected.push(reference);
    packet = candidate;
  }
  return { packet, selected: selected.length, pending: fresh.length - selected.length,
    carried: input.references.length - fresh.length };
}

function requirePacketCurrent(root: string, packet: ReviewerPacket): void {
  const references = loadRefs(root, { includeDomain: true });
  const candidates = loadDesignCandidates(root);
  for (const row of packet.evidence.referenceRenders) {
    const candidate = candidates.find(item => refIdentity(item.reference.source, item.reference.component) === row.sourceId
      && sha256(item.capture) === row.captureSha256 && sha256(item.image) === row.imageSha256);
    const reference = candidate?.reference ?? references.find(item => item.researchLane === 'design'
      && refIdentity(item.source, item.component) === row.sourceId);
    if (reference === undefined) return fail('REFERENCE_DIRECTION_ADMISSION_STALE');
    const imagePath = reference.imagePath;
    if (!imagePath) return fail('REFERENCE_DIRECTION_ADMISSION_STALE');
    const capture = candidate?.capture
      ?? readContainedRegularFile(root, relative(root, refRecordPath(root, reference)), 'retained design capture');
    const image = candidate?.image ?? readFileSync(trustedReferenceImage(root, imagePath));
    if (sha256(capture) !== row.captureSha256 || sha256(image) !== row.imageSha256
      || image.readUInt32BE(16) !== row.width || image.readUInt32BE(20) !== row.height
      || reference.kind !== 'image' && (!reference.viewport
        || row.width !== reference.viewport.width * 2 || row.height !== reference.viewport.height * 2)) {
      fail('REFERENCE_DIRECTION_ADMISSION_STALE');
    }
  }
}

export function publishReferenceDirectionAdmission(root: string, packetBytes: Buffer, reviewer: PiRoleResult,
  invocation: ProjectRunInvocation, writer: ProjectWriteAdapter): AdmissionRecord {
  const packet = parsePacket(packetBytes);
  requirePacketCurrent(root, packet);
  validateCurrentProjectRun(invocation);
  const current = currentReferenceDirectionBinding(root);
  if (current === null) return fail('REFERENCE_DIRECTION_ADMISSION_STALE');
  if (current.sourceContractSha256 !== packet.evidence.task.sourceContractSha256
    || sha256(current.task) !== packet.evidence.task.taskSha256) fail('REFERENCE_DIRECTION_ADMISSION_STALE');
  const previous = authenticatedHistoryForReview(root, current.sourceContractSha256, current.task);
  const previousSha256 = previous[0]?.sha256 ?? null;
  if (packet.outputContract.fixedBindings.previousAdmissionSha256 !== previousSha256) fail('REFERENCE_DIRECTION_ADMISSION_STALE');
  for (const render of packet.evidence.referenceRenders) {
    if (previous.some(({ record }) => record.schema === RECORD_SCHEMA_V4 && record.admissions.some(row => row.sourceId === render.sourceId
      && row.captureSha256 === render.captureSha256 && row.imageSha256 === render.imageSha256)))
      fail('REFERENCE_DIRECTION_ADMISSION_ALREADY_REVIEWED');
  }
  const verified = verifySignedPiEyeRoleResult(reviewer, root);
  if (verified.receipt.buildSha256 !== invocation.current.buildSha256
    || verified.receipt.briefSha256 !== invocation.current.briefSha256
    || verified.receipt.reviewerEvidence.packetSha256 !== sha256(packetBytes)
    || verified.receipt.reviewerEvidence.evidenceSha256 !== packet.evidenceSha256
    || verified.receipt.taskSha256 !== sha256(REFERENCE_DIRECTION_REVIEWER_TASK)) fail('REFERENCE_DIRECTION_ADMISSION_UNAUTHORIZED');
  let value: unknown;
  try { value = JSON.parse(verified.finalMessage); } catch { return fail('REFERENCE_DIRECTION_HANDBACK_INVALID'); }
  const handback = parseHandback(value, packet);
  const record: AdmissionRecord = Object.freeze({ schema: RECORD_SCHEMA_V4,
    packetSha256: sha256(packetBytes),
    sourceContractSha256: handback.sourceContractSha256, taskSha256: handback.taskSha256,
    captureSetSha256: handback.captureSetSha256,
    previousAdmissionSha256: previousSha256,
    admissions: handback.admissions, reviewer });
  const bytes = canonicalJson(record); const recordSha256 = sha256(bytes);
  const adapter = requireProjectWriteAdapter(root, writer);
  const recordPath = `reference-direction-admissions/sha256-${recordSha256}.json`;
  adapter.writeContentAddressed(`.omd/${recordPath}`, bytes);
  const candidates = loadDesignCandidates(root);
  const rollbacks: (() => void)[] = [];
  try {
    for (const row of handback.admissions.filter(item => item.verdict === 'direction' || item.verdict === 'support')) {
      const candidate = candidates.find(item => refIdentity(item.reference.source, item.reference.component) === row.sourceId
        && sha256(item.capture) === row.captureSha256 && sha256(item.image) === row.imageSha256);
      if (candidate) rollbacks.push(promoteDesignCandidate(root, candidate, adapter));
    }
    adapter.write(REFERENCE_DIRECTION_ADMISSION_POINTER, canonicalJson({ schema: POINTER_SCHEMA,
      sourceContractSha256: record.sourceContractSha256, taskSha256: record.taskSha256,
      record: recordPath, sha256: recordSha256 }));
  } catch (error) {
    for (const restore of rollbacks.reverse()) restore();
    throw error;
  }
  return record;
}

function authenticatedHistoryForReview(root: string, expectedSourceContractSha256: string, expectedTask: string):
readonly Readonly<{ sha256: string; admissions: readonly ReferenceDirectionAdmission[]; record: AdmissionRecord }>[] {
  const task = text(expectedTask, 'REFERENCE_DIRECTION_TASK_REQUIRED');
  const current = currentReferenceDirectionBinding(root);
  if (current === null || current.sourceContractSha256 !== expectedSourceContractSha256
    || current.task !== task) fail('REFERENCE_DIRECTION_ADMISSION_STALE');
  if (!existsSync(join(root, REFERENCE_DIRECTION_ADMISSION_POINTER))) {
    return readAuthenticatedAdmissionHistory(root, expectedSourceContractSha256);
  }
  let pointer: Record<string, unknown>;
  try { pointer = object(JSON.parse(readContainedRegularFile(root, REFERENCE_DIRECTION_ADMISSION_POINTER, 'reference direction admission pointer').toString('utf8')), 'REFERENCE_DIRECTION_ADMISSION_FORGED'); }
  catch { return fail('REFERENCE_DIRECTION_ADMISSION_FORGED'); }
  exact(pointer, ['schema', 'sourceContractSha256', 'taskSha256', 'record', 'sha256'], 'REFERENCE_DIRECTION_ADMISSION_FORGED');
  const pointerSourceContractSha256 = digest(pointer.sourceContractSha256, 'REFERENCE_DIRECTION_ADMISSION_FORGED');
  const pointerTaskSha256 = digest(pointer.taskSha256, 'REFERENCE_DIRECTION_ADMISSION_FORGED');
  const recordSha256 = digest(pointer.sha256, 'REFERENCE_DIRECTION_ADMISSION_FORGED');
  if (pointer.schema !== POINTER_SCHEMA
    || pointer.record !== `reference-direction-admissions/sha256-${recordSha256}.json`) {
    fail('REFERENCE_DIRECTION_ADMISSION_STALE');
  }
  if (pointerSourceContractSha256 === expectedSourceContractSha256
    && pointerTaskSha256 === sha256(task)) {
    return readAuthenticatedAdmissionHistory(root, expectedSourceContractSha256);
  }
  readAuthenticatedAdmissionHistoryBound(root, pointerSourceContractSha256, pointerTaskSha256);
  return [];
}

function readAuthenticatedAdmissionHistoryBound(root: string, expectedSourceContractSha256: string,
  historicalTaskSha256?: string):
readonly Readonly<{ sha256: string; admissions: readonly ReferenceDirectionAdmission[]; record: AdmissionRecord }>[] {
  if (!existsSync(join(root, REFERENCE_DIRECTION_ADMISSION_POINTER))) {
    const directory = join(root, '.omd/reference-direction-admissions');
    if (existsSync(directory) && readdirSync(directory).some(name => /^sha256-[a-f0-9]{64}\.json$/.test(name)))
      fail('REFERENCE_DIRECTION_ADMISSION_MISSING');
    return [];
  }
  let pointer: Record<string, unknown>;
  try { pointer = object(JSON.parse(readContainedRegularFile(root, REFERENCE_DIRECTION_ADMISSION_POINTER, 'reference direction admission pointer').toString('utf8')), 'REFERENCE_DIRECTION_ADMISSION_FORGED'); }
  catch { return fail('REFERENCE_DIRECTION_ADMISSION_FORGED'); }
  exact(pointer, ['schema', 'sourceContractSha256', 'taskSha256', 'record', 'sha256'], 'REFERENCE_DIRECTION_ADMISSION_FORGED');
  let recordSha256: string | null = digest(pointer.sha256, 'REFERENCE_DIRECTION_ADMISSION_FORGED');
  if (pointer.schema !== POINTER_SCHEMA || pointer.sourceContractSha256 !== expectedSourceContractSha256
    || pointer.record !== `reference-direction-admissions/sha256-${recordSha256}.json`) fail('REFERENCE_DIRECTION_ADMISSION_STALE');
  const pointerTaskSha256 = digest(pointer.taskSha256, 'REFERENCE_DIRECTION_ADMISSION_FORGED');
  if (historicalTaskSha256 === undefined) {
    const current = currentReferenceDirectionBinding(root);
    if (current === null || current.sourceContractSha256 !== expectedSourceContractSha256
      || pointerTaskSha256 !== sha256(current.task)) fail('REFERENCE_DIRECTION_ADMISSION_STALE');
  } else if (digest(historicalTaskSha256, 'REFERENCE_DIRECTION_ADMISSION_STALE') !== pointerTaskSha256) {
    fail('REFERENCE_DIRECTION_ADMISSION_STALE');
  }
  const history: Readonly<{ sha256: string; admissions: readonly ReferenceDirectionAdmission[]; record: AdmissionRecord }>[] = [];
  const visited = new Set<string>();
  const tuples = new Set<string>();
  while (recordSha256 !== null) {
    if (visited.has(recordSha256)) fail('REFERENCE_DIRECTION_ADMISSION_FORGED');
    visited.add(recordSha256);
    let bytes: Buffer; let raw: unknown;
    try {
      bytes = readContainedRegularFile(root, `.omd/reference-direction-admissions/sha256-${recordSha256}.json`, 'reference direction admission');
      raw = JSON.parse(bytes.toString('utf8'));
    } catch { return fail('REFERENCE_DIRECTION_ADMISSION_FORGED'); }
    if (sha256(bytes) !== recordSha256) fail('REFERENCE_DIRECTION_ADMISSION_FORGED');
    const record = object(raw, 'REFERENCE_DIRECTION_ADMISSION_FORGED');
    const versionTwo = record.schema === RECORD_SCHEMA_V2 || record.schema === RECORD_SCHEMA_V3 || record.schema === RECORD_SCHEMA_V4;
    exact(record, versionTwo
      ? ['schema', 'packetSha256', 'sourceContractSha256', 'taskSha256', 'captureSetSha256', 'previousAdmissionSha256', 'admissions', 'reviewer']
      : ['schema', 'packetSha256', 'sourceContractSha256', 'taskSha256', 'captureSetSha256', 'admissions', 'reviewer'], 'REFERENCE_DIRECTION_ADMISSION_FORGED');
    if ((!versionTwo && record.schema !== RECORD_SCHEMA)
      || record.sourceContractSha256 !== expectedSourceContractSha256
      || record.taskSha256 !== pointerTaskSha256 || !Array.isArray(record.admissions))
      fail('REFERENCE_DIRECTION_ADMISSION_STALE');
    let verified;
    try { verified = verifySignedPiEyeRoleResult(record.reviewer, root); } catch { return fail('REFERENCE_DIRECTION_ADMISSION_FORGED'); }
    const validReviewerTasks = record.schema === RECORD_SCHEMA_V4
      ? [sha256(REFERENCE_DIRECTION_REVIEWER_TASK)]
      : record.schema === RECORD_SCHEMA_V3 ? [sha256(SCOPED_REFERENCE_DIRECTION_REVIEWER_TASK)]
        : [sha256(PREVIOUS_REFERENCE_DIRECTION_REVIEWER_TASK), sha256(LEGACY_REFERENCE_DIRECTION_REVIEWER_TASK)];
    if (verified.receipt.reviewerEvidence.packetSha256 !== record.packetSha256
      || verified.receipt.reviewerEvidence.evidenceSha256 === undefined
      || !validReviewerTasks.includes(verified.receipt.taskSha256)) fail('REFERENCE_DIRECTION_ADMISSION_FORGED');
    let final: unknown;
    try { final = JSON.parse(verified.finalMessage); } catch { return fail('REFERENCE_DIRECTION_ADMISSION_FORGED'); }
    const handback = object(final, 'REFERENCE_DIRECTION_ADMISSION_FORGED');
    if (handback.sourceContractSha256 !== record.sourceContractSha256 || handback.taskSha256 !== record.taskSha256
      || handback.captureSetSha256 !== record.captureSetSha256
      || versionTwo && (handback.schema !== (record.schema === RECORD_SCHEMA_V4 ? HANDBACK_SCHEMA_V4
        : record.schema === RECORD_SCHEMA_V3 ? HANDBACK_SCHEMA_V3 : HANDBACK_SCHEMA_V2)
        || handback.previousAdmissionSha256 !== record.previousAdmissionSha256)
      || canonicalJson(handback.admissions) !== canonicalJson(record.admissions)) fail('REFERENCE_DIRECTION_ADMISSION_FORGED');
    const admissionValues: readonly unknown[] = Array.isArray(record.admissions)
      ? record.admissions : fail('REFERENCE_DIRECTION_ADMISSION_FORGED');
    const admissions = record.schema === RECORD_SCHEMA_V3 || record.schema === RECORD_SCHEMA_V4
      ? parseHandback(handback, {
        outputContract: { fixedBindings: {
          sourceContractSha256: digest(record.sourceContractSha256, 'REFERENCE_DIRECTION_ADMISSION_FORGED'),
          taskSha256: digest(record.taskSha256, 'REFERENCE_DIRECTION_ADMISSION_FORGED'),
          captureSetSha256: digest(record.captureSetSha256, 'REFERENCE_DIRECTION_ADMISSION_FORGED'),
          previousAdmissionSha256: record.previousAdmissionSha256 === null ? null
            : digest(record.previousAdmissionSha256, 'REFERENCE_DIRECTION_ADMISSION_FORGED'),
        } },
        evidence: { referenceRenders: admissionValues.map(value => {
          const row = object(value, 'REFERENCE_DIRECTION_ADMISSION_FORGED');
          return { sourceId: text(row.sourceId, 'REFERENCE_DIRECTION_ADMISSION_FORGED'),
            lane: row.lane === 'design' ? 'design' as const : fail('REFERENCE_DIRECTION_ADMISSION_FORGED'),
            captureSha256: digest(row.captureSha256, 'REFERENCE_DIRECTION_ADMISSION_FORGED'),
            imageSha256: digest(row.imageSha256, 'REFERENCE_DIRECTION_ADMISSION_FORGED') };
        }) },
      }, record.schema === RECORD_SCHEMA_V3).admissions
      : record.admissions as ReferenceDirectionAdmission[];
    for (const row of admissions) {
      const tuple = canonicalJson([row.sourceId, row.lane, row.captureSha256, row.imageSha256]);
      if (tuples.has(tuple) && record.schema === RECORD_SCHEMA_V4) fail('REFERENCE_DIRECTION_ADMISSION_FORGED');
      tuples.add(tuple);
    }
    // Keep legacy signed rows in record for inspection and lineage, but never expose them as current directions.
    history.push({ sha256: recordSha256, admissions: record.schema === RECORD_SCHEMA_V4 ? admissions : [],
      record: record as unknown as AdmissionRecord });
    recordSha256 = versionTwo
      ? record.previousAdmissionSha256 === null ? null : digest(record.previousAdmissionSha256, 'REFERENCE_DIRECTION_ADMISSION_FORGED')
      : null;
  }
  return history;
}

export function readAuthenticatedAdmissionHistory(root: string, expectedSourceContractSha256: string):
readonly Readonly<{ sha256: string; admissions: readonly ReferenceDirectionAdmission[]; record: AdmissionRecord }>[] {
  return readAuthenticatedAdmissionHistoryBound(root, expectedSourceContractSha256);
}

export function requireReferenceDirectionAdmission(root: string, reference: Reference,
  expectedSourceContractSha256: string, required: 'direction' | 'support' = 'direction'): ReferenceDirectionAdmission {
  if (reference.researchLane !== 'design') fail('REFERENCE_DIRECTION_ADMISSION_WRONG_LANE');
  const history = readAuthenticatedAdmissionHistory(root, expectedSourceContractSha256);
  if (history.length === 0) fail('REFERENCE_DIRECTION_ADMISSION_MISSING');
  const sourceId = refIdentity(reference.source, reference.component);
  const row = history.filter(item => item.record.schema === RECORD_SCHEMA_V4).flatMap(item => item.admissions)
    .find(admission => admission.sourceId === sourceId && admission.lane === 'design');
  if (row === undefined) return fail('REFERENCE_DIRECTION_ADMISSION_MISSING');
  const capture = readContainedRegularFile(root, relative(root, refRecordPath(root, reference)), 'retained design capture');
  const imagePath = reference.imagePath;
  if (!imagePath) return fail('REFERENCE_DIRECTION_ADMISSION_STALE');
  const image = readFileSync(trustedReferenceImage(root, imagePath));
  if (row.captureSha256 !== sha256(capture) || row.imageSha256 !== sha256(image)) fail('REFERENCE_DIRECTION_ADMISSION_STALE');
  if (row.verdict === 'reject') fail('REFERENCE_DIRECTION_ADMISSION_REJECTED');
  if (required === 'direction' && row.verdict !== 'direction') fail('REFERENCE_DIRECTION_ADMISSION_SUPPORT_ONLY');
  return row;
}

export function readApprovedReferenceAppearanceIntent(root: string, reference: Reference,
  expectedSourceContractSha256?: string): readonly string[] {
  const sourceContract = expectedSourceContractSha256 ?? currentReferenceDirectionSourceContract(root);
  if (sourceContract === null) return [];
  const admission = requireReferenceDirectionAdmission(root, reference, sourceContract, 'direction');
  return admission.appearanceIntent === null ? [] : [admission.appearanceIntent];
}

function currentReferenceDirectionBinding(root: string): Readonly<{ sourceContractSha256: string; task: string }> | null {
  const path = join(root, '.omd/route.json');
  if (!existsSync(path)) return null;
  try {
    const pointer = object(JSON.parse(readContainedRegularFile(root, '.omd/route.json', 'route pointer').toString('utf8')), 'REFERENCE_DIRECTION_ROUTE_INVALID');
    const recordPath = text(pointer.record, 'REFERENCE_DIRECTION_ROUTE_INVALID');
    const expected = digest(pointer.sha256, 'REFERENCE_DIRECTION_ROUTE_INVALID');
    const bytes = readContainedRegularFile(root, `.omd/${recordPath}`, 'route record');
    if (sha256(bytes) !== expected) fail('REFERENCE_DIRECTION_ROUTE_INVALID');
    const record = object(JSON.parse(bytes.toString('utf8')), 'REFERENCE_DIRECTION_ROUTE_INVALID');
    const references = object(record.references, 'REFERENCE_DIRECTION_ROUTE_INVALID');
    // A model-led route browses and keeps references itself, so its keeps are reviewed the same way.
    const modelLed = typeof record.sourceContract === 'object' && record.sourceContract !== null
      && isModelLedProcess(record.sourceContract as Parameters<typeof isModelLedProcess>[0]);
    return references.decision === 'discover' || modelLed ? Object.freeze({
      sourceContractSha256: digest(record.sourceContractSha256, 'REFERENCE_DIRECTION_ROUTE_INVALID'),
      task: text(record.request, 'REFERENCE_DIRECTION_ROUTE_INVALID'),
    }) : null;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('REFERENCE_DIRECTION_')) throw error;
    return fail('REFERENCE_DIRECTION_ROUTE_INVALID');
  }
}

export function currentReferenceDirectionSourceContract(root: string): string | null {
  return currentReferenceDirectionBinding(root)?.sourceContractSha256 ?? null;
}
