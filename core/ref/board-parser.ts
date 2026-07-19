import {
  BOARD_TAKE_VALUES,
  REFERENCE_BOARD_SCHEMA_VERSION,
  ReferenceBoardValidationError,
  type BoardSourceKind,
  type BoardTake,
  type ReferenceBoardCandidate,
  type ReferenceBoardGrid,
  type ReferenceBoardManifest,
  type ReferenceBoardPiece,
} from './board-contract.ts';
import { hasAssemblyPayload, hasSelectorPayload, hasSourcePayload } from './board-sanitization.ts';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const fail = (reason: string): never => { throw new ReferenceBoardValidationError(reason); };
const record = (value: unknown, label: string): Record<string, unknown> => isRecord(value) ? value : fail(`${label} must be an object`);
const array = (value: unknown, label: string): readonly unknown[] => Array.isArray(value) ? value : fail(`${label} must be an array`);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[], label: string): void => {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) fail(`${label} has unknown or missing keys`);
};
const nonEmpty = (value: unknown, label: string): string => typeof value === 'string' && value.trim() !== '' ? value : fail(`${label} must be a non-empty string`);
const assemblyText = (value: unknown, label: string): string => {
  const parsed = nonEmpty(value, label);
  if (hasAssemblyPayload(parsed)) fail(`${label} must not include source, pixel, markup, or control payloads`);
  return parsed;
};
const integer = (value: unknown, label: string): number => typeof value === 'number' && Number.isSafeInteger(value) ? value : fail(`${label} must be a safe integer`);
const localTargetSelector = (value: unknown, label: string): string => {
  const selector = nonEmpty(value, label);
  if (hasSelectorPayload(selector)) fail(`${label} must be a stable local CSS selector`);
  return selector;
};
const localRoute = (value: unknown, label: string): string => {
  const route = nonEmpty(value, label);
  if (hasSourcePayload(route)) fail(`${label} must be a local route`);
  if (route === '/') return route;
  if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@\/-]*$/.test(route) || route.startsWith('//') || route.slice(1).split('/').some((segment) => segment === '.' || segment === '..')) fail(`${label} must be a local route`);
  return route;
};
const sourceKind = (value: unknown, label: string): BoardSourceKind => {
  switch (value) {
    case 'component-capture': return value;
    case 'image-fragment': return value;
    default: return fail(`${label} must be a supported sourceKind`);
  }
};
const take = (value: unknown, label: string): BoardTake => {
  switch (value) {
    case 'structure': return value;
    case 'proportion': return value;
    case 'density': return value;
    case 'rhythm': return value;
    case 'motion': return value;
    default: return fail(`${label} must be one of ${BOARD_TAKE_VALUES.join(', ')}`);
  }
};
const strings = (value: unknown, label: string, required: boolean, emitted = false): readonly string[] => {
  const entries = array(value, label);
  if (required && entries.length === 0) fail(`${label} must be a non-empty array`);
  const parsed = entries.map((entry, index) => emitted ? assemblyText(entry, `${label}[${index}]`) : nonEmpty(entry, `${label}[${index}]`));
  if (new Set(parsed).size !== parsed.length) fail(`${label} must not contain duplicates`);
  return parsed;
};
const grid = (value: unknown, label: string): ReferenceBoardGrid => {
  const parsed = record(value, label);
  exactKeys(parsed, ['column', 'span', 'order'], label);
  const column = integer(parsed['column'], `${label}.column`); const span = integer(parsed['span'], `${label}.span`); const order = integer(parsed['order'], `${label}.order`);
  if (column < 1 || column > 12) fail(`${label}.column must be an integer from 1 through 12`);
  if (span < 1 || span > 12 || column + span > 13) fail(`${label}.span must fit the 12-column grid`);
  if (order < 0) fail(`${label}.order must be a non-negative integer`);
  return { column, span, order };
};

const piece = (value: unknown, label: string): ReferenceBoardPiece => {
  const parsed = record(value, label);
  exactKeys(parsed, ['slotId', 'sourceKind', 'referenceId', 'targetComponent', 'targetSelector', 'taskIds', 'reason', 'take', 'avoid', 'adaptation', 'grid'], label);
  const kind = sourceKind(parsed['sourceKind'], `${label}.sourceKind`);
  const takes = strings(parsed['take'], `${label}.take`, true).map((entry, index) => take(entry, `${label}.take[${index}]`));
  if (new Set(takes).size !== takes.length) fail(`${label}.take must not contain duplicates`);
  const base = {
    slotId: assemblyText(parsed['slotId'], `${label}.slotId`), referenceId: nonEmpty(parsed['referenceId'], `${label}.referenceId`),
    targetComponent: assemblyText(parsed['targetComponent'], `${label}.targetComponent`), targetSelector: localTargetSelector(parsed['targetSelector'], `${label}.targetSelector`),
    taskIds: strings(parsed['taskIds'], `${label}.taskIds`, true, true), reason: assemblyText(parsed['reason'], `${label}.reason`),
    take: takes, avoid: assemblyText(parsed['avoid'], `${label}.avoid`), adaptation: assemblyText(parsed['adaptation'], `${label}.adaptation`), grid: grid(parsed['grid'], `${label}.grid`),
  };
  switch (kind) {
    case 'component-capture': return { ...base, sourceKind: kind };
    case 'image-fragment': return { ...base, sourceKind: kind };
  }
};

const candidate = (value: unknown, index: number): ReferenceBoardCandidate => {
  const label = `candidates[${index}]`; const parsed = record(value, label);
  exactKeys(parsed, ['id', 'label', 'route', 'rationale', 'pieces'], label);
  const entries = array(parsed['pieces'], `${label}.pieces`);
  if (entries.length === 0) fail(`${label}.pieces must be a non-empty array`);
  const pieces = entries.map((entry, pieceIndex) => piece(entry, `${label}.pieces[${pieceIndex}]`));
  const slots = pieces.map((entry) => entry.slotId);
  if (new Set(slots).size !== slots.length) fail(`${label}.pieces slotId values must be unique`);
  const orders = pieces.map((entry) => entry.grid.order);
  if (new Set(orders).size !== orders.length) fail(`${label}.pieces grid.order values must be unique`);
  return { id: assemblyText(parsed['id'], `${label}.id`), label: assemblyText(parsed['label'], `${label}.label`), route: localRoute(parsed['route'], `${label}.route`), rationale: assemblyText(parsed['rationale'], `${label}.rationale`), pieces };
};

export function parseReferenceBoard(value: unknown): ReferenceBoardManifest {
  const parsed = record(value, 'reference board');
  exactKeys(parsed, ['schemaVersion', 'frameSha256', 'candidates'], 'reference board');
  if (parsed['schemaVersion'] !== REFERENCE_BOARD_SCHEMA_VERSION) fail(`schemaVersion must be ${REFERENCE_BOARD_SCHEMA_VERSION}`);
  const frameSha256 = nonEmpty(parsed['frameSha256'], 'frameSha256');
  if (!/^[0-9a-f]{64}$/.test(frameSha256)) fail('frameSha256 must be 64 lowercase hexadecimal characters');
  const entries = array(parsed['candidates'], 'candidates');
  if (entries.length === 0) fail('candidates must be a non-empty array');
  const candidates = entries.map(candidate);
  const ids = candidates.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) fail('candidate id values must be unique');
  return { schemaVersion: REFERENCE_BOARD_SCHEMA_VERSION, frameSha256, candidates };
}
