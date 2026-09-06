import { hasSelectorPayload, hasSourcePayload } from './board-sanitization.ts';

export const REFERENCE_USAGE_SCHEMA_VERSION = 'reference-usage-v1' as const;
/** The historical v1 row shape predates task/build-observation bindings. It is read-only. */
export const LEGACY_REFERENCE_USAGE_SCHEMA_VERSION = 'reference-usage-v1' as const;
export const REFERENCE_USAGE_STATUSES = ['used', 'rejected', 'anti-reference'] as const;

export type ReferenceUsageStatus = (typeof REFERENCE_USAGE_STATUSES)[number];
export type ReferenceUsageTarget = { readonly route: string; readonly component: string; readonly selector: string };
export type ReferenceUsageEvidence = { readonly path: string; readonly selector: string; readonly sha256: string };
export type LegacyReferenceUsageEvidence = { readonly path: string; readonly selector: string };
export type ReferenceProductionObservation = {
  readonly schema: 'reference-production-observation-v1';
  readonly slotId: string;
  readonly route: string;
  readonly component: string;
  readonly selector: string;
  readonly taskIds: readonly string[];
  readonly buildSha256: string;
};
export type ReferenceUsageRow = {
  readonly slotId: string;
  readonly taskIds: readonly string[];
  readonly status: ReferenceUsageStatus;
  readonly target: ReferenceUsageTarget;
  readonly borrowedProperties: readonly string[];
  readonly nonBorrowedProperties: readonly string[];
  readonly transformation: string;
  readonly evidence: ReferenceUsageEvidence;
  readonly productionObservation: ReferenceProductionObservation;
  readonly verificationNote: string;
};
export type ReferenceUsage = {
  readonly schemaVersion: typeof REFERENCE_USAGE_SCHEMA_VERSION;
  readonly rawBoardSha256: string;
  readonly assemblySha256: string;
  readonly selectionSha256: string;

  readonly attributionSha256: string;
  readonly rows: readonly ReferenceUsageRow[];
};
export type ReferenceUsageInput = { readonly rows: readonly ReferenceUsageRow[] };
export type LegacyReferenceUsageRow = {
  readonly slotId: string;
  readonly status: ReferenceUsageStatus;
  readonly target: ReferenceUsageTarget;
  readonly borrowedProperties: readonly string[];
  readonly nonBorrowedProperties: readonly string[];
  readonly transformation: string;
  readonly evidence: LegacyReferenceUsageEvidence;
  readonly verificationNote: string;
};
export type LegacyReferenceUsage = {
  readonly schemaVersion: typeof LEGACY_REFERENCE_USAGE_SCHEMA_VERSION;
  readonly rawBoardSha256: string;
  readonly assemblySha256: string;
  readonly selectionSha256: string;
  readonly attributionSha256: string;
  readonly rows: readonly LegacyReferenceUsageRow[];
};
export type LegacyReferenceUsageInput = { readonly rows: readonly LegacyReferenceUsageRow[] };

export class ReferenceUsageValidationError extends Error {
  override readonly name = 'ReferenceUsageValidationError';
  readonly reason: string;

  constructor(reason: string) {
    super(`reference usage is invalid: ${reason}`);
    this.reason = reason;
  }
}

const fail = (reason: string): never => { throw new ReferenceUsageValidationError(reason); };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const record = (value: unknown, label: string): Record<string, unknown> => isRecord(value) ? value : fail(`${label} must be an object`);
const exactKeys = (value: Record<string, unknown>, expected: readonly string[], label: string): void => {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) fail(`${label} has unknown or missing keys`);
};
const markdownOrControl = (value: string): boolean => /[\u0000-\u001f\u007f-\u009f\u061c\u200e-\u200f\u202a-\u202e\u2066-\u2069|`]/.test(value) || /[!]?\[[^\]]*\]\([^)]*\)|<[^>]*>/.test(value);
const text = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim() !== value || value === '') return fail(`${label} must be a non-empty trimmed string`);
  if (markdownOrControl(value) || hasSourcePayload(value)) return fail(`${label} must not include source, Markdown, HTML, or control payloads`);
  return value;
};
const hash = (value: unknown, label: string): string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value : fail(`${label} must be a lowercase SHA-256 digest`);
const path = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim() !== value || value === '' || markdownOrControl(value)) return fail(`${label} must be a non-empty safe project-relative path`);
  const parsed = value;
  if (parsed.includes('\\') || parsed.startsWith('/') || /^[A-Za-z]:\//.test(parsed) || parsed.split('/').some((part) => part === '' || part === '.' || part === '..')) return fail(`${label} must be a safe project-relative path`);
  return parsed;
};
const localRoute = (value: unknown, label: string): string => {
  const parsed = text(value, label);
  if (parsed === '/') return parsed;
  if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@/-]*$/.test(parsed) || parsed.startsWith('//') || parsed.slice(1).split('/').some((part) => part === '.' || part === '..')) return fail(`${label} must be a safe local route`);
  return parsed;
};
const selector = (value: unknown, label: string): string => {
  const parsed = text(value, label);
  if (hasSelectorPayload(parsed)) return fail(`${label} must be a local CSS selector`);
  return parsed;
};
const strings = (value: unknown, label: string): readonly string[] => {
  if (!Array.isArray(value)) return fail(`${label} must be an array`);
  const parsed = value.map((entry, index) => text(entry, `${label}[${index}]`));
  if (new Set(parsed).size !== parsed.length) fail(`${label} must not contain duplicates`);
  return parsed;
};
const status = (value: unknown): ReferenceUsageStatus => {
  switch (value) {
    case 'used': return value;
    case 'rejected': return value;
    case 'anti-reference': return value;
    default: return fail('status must be used, rejected, or anti-reference');
  }
};
const target = (value: unknown): ReferenceUsageTarget => {
  const parsed = record(value, 'target'); exactKeys(parsed, ['route', 'component', 'selector'], 'target');
  return { route: localRoute(parsed['route'], 'target.route'), component: text(parsed['component'], 'target.component'), selector: selector(parsed['selector'], 'target.selector') };
};
const evidence = (value: unknown): ReferenceUsageEvidence => {
  const parsed = record(value, 'evidence'); exactKeys(parsed, ['path', 'selector', 'sha256'], 'evidence');
  return { path: path(parsed['path'], 'evidence.path'), selector: selector(parsed['selector'], 'evidence.selector'), sha256: hash(parsed['sha256'], 'evidence.sha256') };
};
export const parseReferenceProductionObservation = (value: unknown): ReferenceProductionObservation => {
  const parsed = record(value, 'productionObservation');
  exactKeys(parsed, ['schema', 'slotId', 'route', 'component', 'selector', 'taskIds', 'buildSha256'], 'productionObservation');
  if (parsed['schema'] !== 'reference-production-observation-v1') fail('productionObservation.schema must be reference-production-observation-v1');
  return {
    schema: 'reference-production-observation-v1',
    slotId: text(parsed['slotId'], 'productionObservation.slotId'),
    route: localRoute(parsed['route'], 'productionObservation.route'),
    component: text(parsed['component'], 'productionObservation.component'),
    selector: selector(parsed['selector'], 'productionObservation.selector'),
    taskIds: strings(parsed['taskIds'], 'productionObservation.taskIds'),
    buildSha256: hash(parsed['buildSha256'], 'productionObservation.buildSha256'),
  };
};
const legacyEvidence = (value: unknown): LegacyReferenceUsageEvidence => {
  const parsed = record(value, 'evidence'); exactKeys(parsed, ['path', 'selector'], 'evidence');
  return { path: path(parsed['path'], 'evidence.path'), selector: selector(parsed['selector'], 'evidence.selector') };
};
const validateProperties = (parsedStatus: ReferenceUsageStatus, borrowedProperties: readonly string[], nonBorrowedProperties: readonly string[], index: number): void => {
  switch (parsedStatus) {
    case 'used': if (borrowedProperties.length === 0 || nonBorrowedProperties.length === 0) fail(`rows[${index}] must have non-empty borrowedProperties and nonBorrowedProperties for used`); break;
    case 'rejected':
    case 'anti-reference': if (borrowedProperties.length !== 0 || nonBorrowedProperties.length === 0) fail(`rows[${index}] must have empty borrowedProperties and non-empty nonBorrowedProperties for ${parsedStatus}`); break;
  }
};
const legacyRow = (value: unknown, index: number): LegacyReferenceUsageRow => {
  const parsed = record(value, `rows[${index}]`);
  exactKeys(parsed, ['slotId', 'status', 'target', 'borrowedProperties', 'nonBorrowedProperties', 'transformation', 'evidence', 'verificationNote'], `rows[${index}]`);
  const parsedStatus = status(parsed['status']);
  const borrowedProperties = strings(parsed['borrowedProperties'], `rows[${index}].borrowedProperties`);
  const nonBorrowedProperties = strings(parsed['nonBorrowedProperties'], `rows[${index}].nonBorrowedProperties`);
  validateProperties(parsedStatus, borrowedProperties, nonBorrowedProperties, index);
  const parsedTarget = target(parsed['target']); const parsedEvidence = legacyEvidence(parsed['evidence']);
  if (parsedEvidence.selector !== parsedTarget.selector) fail(`rows[${index}].evidence.selector must match target.selector`);
  return { slotId: text(parsed['slotId'], `rows[${index}].slotId`), status: parsedStatus, target: parsedTarget, borrowedProperties, nonBorrowedProperties, transformation: text(parsed['transformation'], `rows[${index}].transformation`), evidence: parsedEvidence, verificationNote: text(parsed['verificationNote'], `rows[${index}].verificationNote`) };
};
const row = (value: unknown, index: number): ReferenceUsageRow => {
  const parsed = record(value, `rows[${index}]`);
  exactKeys(parsed, ['slotId', 'taskIds', 'status', 'target', 'borrowedProperties', 'nonBorrowedProperties', 'transformation', 'evidence', 'productionObservation', 'verificationNote'], `rows[${index}]`);
  const parsedStatus = status(parsed['status']); const borrowedProperties = strings(parsed['borrowedProperties'], `rows[${index}].borrowedProperties`); const nonBorrowedProperties = strings(parsed['nonBorrowedProperties'], `rows[${index}].nonBorrowedProperties`);
  validateProperties(parsedStatus, borrowedProperties, nonBorrowedProperties, index);
  const parsedSlotId = text(parsed['slotId'], `rows[${index}].slotId`); const taskIds = strings(parsed['taskIds'], `rows[${index}].taskIds`); const parsedTarget = target(parsed['target']); const parsedEvidence = evidence(parsed['evidence']); const parsedProductionObservation = parseReferenceProductionObservation(parsed['productionObservation']);
  if (parsedEvidence.selector !== parsedTarget.selector) fail(`rows[${index}].evidence.selector must match target.selector`);
  if (parsedProductionObservation.slotId !== parsedSlotId
    || parsedProductionObservation.route !== parsedTarget.route
    || parsedProductionObservation.component !== parsedTarget.component
    || parsedProductionObservation.selector !== parsedTarget.selector
    || JSON.stringify(parsedProductionObservation.taskIds) !== JSON.stringify(taskIds)) {
    fail(`rows[${index}].productionObservation must exactly bind the selected slot, target, and tasks`);
  }
  return { slotId: parsedSlotId, taskIds, status: parsedStatus, target: parsedTarget, borrowedProperties, nonBorrowedProperties, transformation: text(parsed['transformation'], `rows[${index}].transformation`), evidence: parsedEvidence, productionObservation: parsedProductionObservation, verificationNote: text(parsed['verificationNote'], `rows[${index}].verificationNote`) };
};
const legacyRows = (value: unknown): readonly LegacyReferenceUsageRow[] => {
  if (!Array.isArray(value) || value.length === 0) return fail('rows must be a non-empty array');
  const parsed = value.map(legacyRow); const slots = parsed.map((entry) => entry.slotId);
  if (new Set(slots).size !== slots.length) fail('rows must not duplicate slotId');
  return parsed;
};
const rows = (value: unknown): readonly ReferenceUsageRow[] => {
  if (!Array.isArray(value) || value.length === 0) return fail('rows must be a non-empty array');
  const parsed = value.map(row); const slots = parsed.map((entry) => entry.slotId);
  if (new Set(slots).size !== slots.length) fail('rows must not duplicate slotId');
  return parsed;
};

export function parseLegacyReferenceUsageInput(value: unknown): LegacyReferenceUsageInput {
  const parsed = record(value, 'legacy reference usage input'); exactKeys(parsed, ['rows'], 'legacy reference usage input');
  return { rows: legacyRows(parsed['rows']) };
}

export function parseLegacyReferenceUsage(value: unknown): LegacyReferenceUsage {
  const parsed = record(value, 'legacy reference usage');
  exactKeys(parsed, ['schemaVersion', 'rawBoardSha256', 'assemblySha256', 'selectionSha256', 'attributionSha256', 'rows'], 'legacy reference usage');
  if (parsed['schemaVersion'] !== LEGACY_REFERENCE_USAGE_SCHEMA_VERSION) fail(`schemaVersion must be ${LEGACY_REFERENCE_USAGE_SCHEMA_VERSION}`);
  return { schemaVersion: LEGACY_REFERENCE_USAGE_SCHEMA_VERSION, rawBoardSha256: hash(parsed['rawBoardSha256'], 'rawBoardSha256'), assemblySha256: hash(parsed['assemblySha256'], 'assemblySha256'), selectionSha256: hash(parsed['selectionSha256'], 'selectionSha256'), attributionSha256: hash(parsed['attributionSha256'], 'attributionSha256'), rows: legacyRows(parsed['rows']) };
}

/** Parses bytes emitted by the original reference-usage-v1 writer. */
export function parseLegacyReferenceUsageRecord(bytes: Uint8Array | string): LegacyReferenceUsage {
  const source = typeof bytes === 'string' ? bytes : Buffer.from(bytes).toString('utf8');
  let value: unknown;
  try { value = JSON.parse(source); } catch { return fail('legacy reference usage record must be valid JSON'); }
  return parseLegacyReferenceUsage(value);
}

export function parseReferenceUsageInput(value: unknown): ReferenceUsageInput {
  const parsed = record(value, 'reference usage input'); exactKeys(parsed, ['rows'], 'reference usage input');
  return { rows: rows(parsed['rows']) };
}

export function parseReferenceUsage(value: unknown): ReferenceUsage {
  const parsed = record(value, 'reference usage');
  exactKeys(parsed, ['schemaVersion', 'rawBoardSha256', 'assemblySha256', 'selectionSha256', 'attributionSha256', 'rows'], 'reference usage');
  if (parsed['schemaVersion'] !== REFERENCE_USAGE_SCHEMA_VERSION) fail(`schemaVersion must be ${REFERENCE_USAGE_SCHEMA_VERSION}`);
  return { schemaVersion: REFERENCE_USAGE_SCHEMA_VERSION, rawBoardSha256: hash(parsed['rawBoardSha256'], 'rawBoardSha256'), assemblySha256: hash(parsed['assemblySha256'], 'assemblySha256'), selectionSha256: hash(parsed['selectionSha256'], 'selectionSha256'), attributionSha256: hash(parsed['attributionSha256'], 'attributionSha256'), rows: rows(parsed['rows']) };
}
