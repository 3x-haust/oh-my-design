import { hasSelectorPayload, hasSourcePayload } from './board-sanitization.ts';

export const REFERENCE_USAGE_SCHEMA_VERSION = 'reference-usage-v1' as const;
export const REFERENCE_USAGE_STATUSES = ['used', 'rejected', 'anti-reference'] as const;

export type ReferenceUsageStatus = (typeof REFERENCE_USAGE_STATUSES)[number];
export type ReferenceUsageTarget = { readonly route: string; readonly component: string; readonly selector: string };
export type ReferenceUsageEvidence = { readonly path: string; readonly selector: string };
export type ReferenceUsageRow = {
  readonly slotId: string;
  readonly status: ReferenceUsageStatus;
  readonly target: ReferenceUsageTarget;
  readonly borrowedProperties: readonly string[];
  readonly nonBorrowedProperties: readonly string[];
  readonly transformation: string;
  readonly evidence: ReferenceUsageEvidence;
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
  const parsed = record(value, 'evidence'); exactKeys(parsed, ['path', 'selector'], 'evidence');
  return { path: path(parsed['path'], 'evidence.path'), selector: selector(parsed['selector'], 'evidence.selector') };
};
const row = (value: unknown, index: number): ReferenceUsageRow => {
  const parsed = record(value, `rows[${index}]`);
  exactKeys(parsed, ['slotId', 'status', 'target', 'borrowedProperties', 'nonBorrowedProperties', 'transformation', 'evidence', 'verificationNote'], `rows[${index}]`);
  const parsedStatus = status(parsed['status']); const borrowedProperties = strings(parsed['borrowedProperties'], `rows[${index}].borrowedProperties`); const nonBorrowedProperties = strings(parsed['nonBorrowedProperties'], `rows[${index}].nonBorrowedProperties`);
  switch (parsedStatus) {
    case 'used': if (borrowedProperties.length === 0 || nonBorrowedProperties.length === 0) fail(`rows[${index}] must have non-empty borrowedProperties and nonBorrowedProperties for used`); break;
    case 'rejected':
    case 'anti-reference': if (borrowedProperties.length !== 0 || nonBorrowedProperties.length === 0) fail(`rows[${index}] must have empty borrowedProperties and non-empty nonBorrowedProperties for ${parsedStatus}`); break;
  }
  const parsedTarget = target(parsed['target']); const parsedEvidence = evidence(parsed['evidence']);
  if (parsedEvidence.selector !== parsedTarget.selector) fail(`rows[${index}].evidence.selector must match target.selector`);
  return { slotId: text(parsed['slotId'], `rows[${index}].slotId`), status: parsedStatus, target: parsedTarget, borrowedProperties, nonBorrowedProperties, transformation: text(parsed['transformation'], `rows[${index}].transformation`), evidence: parsedEvidence, verificationNote: text(parsed['verificationNote'], `rows[${index}].verificationNote`) };
};
const rows = (value: unknown): readonly ReferenceUsageRow[] => {
  if (!Array.isArray(value) || value.length === 0) return fail('rows must be a non-empty array');
  const parsed = value.map(row); const slots = parsed.map((entry) => entry.slotId);
  if (new Set(slots).size !== slots.length) fail('rows must not duplicate slotId');
  return parsed;
};

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
