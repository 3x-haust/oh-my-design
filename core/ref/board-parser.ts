import {
  BOARD_TAKE_VALUES,
  REFERENCE_BOARD_SCHEMA_VERSION,
  REFERENCE_BOARD_V2_SCHEMA_VERSION,
  ReferenceBoardValidationError,
  type BoardSourceKind,
  type BoardTake,
  type ReferenceAxis,
  type ReferenceEvidenceAxes,
  type ReferenceRights,
  type ReferenceSignal,
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
    case 'classified-reference': return value;
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
    case 'content': return value;
    case 'voice': return value;
    case 'rejection': return value;
    default: return fail(`${label} must be one of ${BOARD_TAKE_VALUES.join(', ')}`);
  }
};
const rights = (value: unknown, label: string): ReferenceRights => {
  switch (value) {
    case 'lawful': return value;
    case 'restricted': return value;
    case 'unknown': return value;
    default: return fail(`${label} must be a supported rights value`);
  }
};
const signal = (value: unknown, label: string): ReferenceSignal => {
  switch (value) {
    case 'high-visual-system': return value;
    case 'high-motion': return value;
    case 'supporting-component': return value;
    case 'supporting-content': return value;
    case 'anti-reference': return value;
    default: return fail(`${label} must be a supported signal value`);
  }
};
const axis = (value: unknown, label: string): ReferenceAxis => {
  switch (value) {
    case 'available': return value;
    case 'absent': return value;
    default: return fail(`${label} must be a supported axis value`);
  }
};
const evidenceAxes = (value: unknown, label: string): ReferenceEvidenceAxes => {
  const parsed = record(value, label);
  exactKeys(parsed, ['rights', 'signal', 'staticAxis', 'motionAxis'], label);
  return {
    rights: rights(parsed['rights'], `${label}.rights`),
    signal: signal(parsed['signal'], `${label}.signal`),
    staticAxis: axis(parsed['staticAxis'], `${label}.staticAxis`),
    motionAxis: axis(parsed['motionAxis'], `${label}.motionAxis`),
  };
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

const classification = (value: unknown, label: string): { readonly kind: 'content-only' | 'anti-reference'; readonly sha256: string } => {
  const parsed = record(value, label);
  exactKeys(parsed, ['kind', 'sha256'], label);
  const rawKind = parsed['kind'];
  if (rawKind !== 'content-only' && rawKind !== 'anti-reference') fail(`${label}.kind must be content-only or anti-reference`);
  const kind = rawKind as 'content-only' | 'anti-reference';
  const digest = nonEmpty(parsed['sha256'], `${label}.sha256`);
  if (!/^[0-9a-f]{64}$/.test(digest)) fail(`${label}.sha256 must be 64 lowercase hexadecimal characters`);
  return { kind, sha256: digest };
};

const piece = (value: unknown, label: string, version: ReferenceBoardManifest['schemaVersion']): ReferenceBoardPiece => {
  const parsed = record(value, label);
  const kind = sourceKind(parsed['sourceKind'], `${label}.sourceKind`);
  const classified = kind === 'classified-reference';
  exactKeys(parsed, classified
    ? ['slotId', 'sourceKind', 'referenceId', 'targetComponent', 'targetSelector', 'taskIds', 'reason', 'take', 'avoid', 'adaptation', 'grid', 'evidenceAxes', 'classification']
    : ['slotId', 'sourceKind', 'referenceId', 'targetComponent', 'targetSelector', 'taskIds', 'reason', 'take', 'avoid', 'adaptation', 'grid', 'evidenceAxes'], label);
  if (classified && version !== REFERENCE_BOARD_V2_SCHEMA_VERSION) fail(`${label}.sourceKind classified-reference requires ${REFERENCE_BOARD_V2_SCHEMA_VERSION}`);
  const takes = strings(parsed['take'], `${label}.take`, true).map((entry, index) => take(entry, `${label}.take[${index}]`));
  if (new Set(takes).size !== takes.length) fail(`${label}.take must not contain duplicates`);
  if (version === REFERENCE_BOARD_SCHEMA_VERSION && takes.some((entry) => entry === 'content' || entry === 'voice' || entry === 'rejection')) {
    fail(`${label} nonvisual take values require ${REFERENCE_BOARD_V2_SCHEMA_VERSION}`);
  }
  const axes = evidenceAxes(parsed['evidenceAxes'], `${label}.evidenceAxes`);
  const base = {
    slotId: assemblyText(parsed['slotId'], `${label}.slotId`), referenceId: nonEmpty(parsed['referenceId'], `${label}.referenceId`),
    targetComponent: assemblyText(parsed['targetComponent'], `${label}.targetComponent`), targetSelector: localTargetSelector(parsed['targetSelector'], `${label}.targetSelector`),
    taskIds: strings(parsed['taskIds'], `${label}.taskIds`, true, true), reason: assemblyText(parsed['reason'], `${label}.reason`),
    take: takes, avoid: assemblyText(parsed['avoid'], `${label}.avoid`), adaptation: assemblyText(parsed['adaptation'], `${label}.adaptation`), grid: grid(parsed['grid'], `${label}.grid`),
    evidenceAxes: axes,
  };
  if (classified) {
    const binding = classification(parsed['classification'], `${label}.classification`);
    if (binding.kind === 'content-only') {
      if (axes.signal !== 'supporting-content' || takes.some((entry) => entry !== 'content' && entry !== 'voice')) fail(`${label} content-only evidence may take only content or voice`);
    } else if (axes.signal !== 'anti-reference' || takes.some((entry) => entry !== 'rejection')) {
      fail(`${label} anti-reference evidence may take only rejection constraints`);
    }
    if (axes.staticAxis !== 'absent' || axes.motionAxis !== 'absent') fail(`${label} nonvisual evidence cannot expose static or motion axes`);
    return { ...base, sourceKind: kind, classification: binding };
  }
  if (version === REFERENCE_BOARD_V2_SCHEMA_VERSION
    && (takes.some((entry) => entry === 'content' || entry === 'voice' || entry === 'rejection')
      || axes.signal === 'supporting-content' || axes.signal === 'anti-reference')) {
    fail(`${label} v2 nonvisual claims require sourceKind classified-reference`);
  }
  switch (kind) {
    case 'component-capture': return { ...base, sourceKind: kind };
    case 'image-fragment': return { ...base, sourceKind: kind };
  }
};

const candidate = (value: unknown, index: number, version: ReferenceBoardManifest['schemaVersion']): ReferenceBoardCandidate => {
  const label = `candidates[${index}]`; const parsed = record(value, label);
  exactKeys(parsed, ['id', 'label', 'route', 'rationale', 'pieces'], label);
  const entries = array(parsed['pieces'], `${label}.pieces`);
  if (entries.length === 0) fail(`${label}.pieces must be a non-empty array`);
  const pieces = entries.map((entry, pieceIndex) => piece(entry, `${label}.pieces[${pieceIndex}]`, version));
  const slots = pieces.map((entry) => entry.slotId);
  if (new Set(slots).size !== slots.length) fail(`${label}.pieces slotId values must be unique`);
  const orders = pieces.map((entry) => entry.grid.order);
  if (new Set(orders).size !== orders.length) fail(`${label}.pieces grid.order values must be unique`);
  return { id: assemblyText(parsed['id'], `${label}.id`), label: assemblyText(parsed['label'], `${label}.label`), route: localRoute(parsed['route'], `${label}.route`), rationale: assemblyText(parsed['rationale'], `${label}.rationale`), pieces };
};

export function parseReferenceBoard(value: unknown): ReferenceBoardManifest {
  const parsed = record(value, 'reference board');
  const rawVersion = parsed['schemaVersion'];
  if (rawVersion !== REFERENCE_BOARD_SCHEMA_VERSION && rawVersion !== REFERENCE_BOARD_V2_SCHEMA_VERSION) fail(`schemaVersion must be ${REFERENCE_BOARD_SCHEMA_VERSION} or ${REFERENCE_BOARD_V2_SCHEMA_VERSION}`);
  const version = rawVersion as ReferenceBoardManifest['schemaVersion'];
  exactKeys(parsed, version === REFERENCE_BOARD_V2_SCHEMA_VERSION
    ? ['schemaVersion', 'projectSha256', 'frameSha256', 'candidates']
    : ['schemaVersion', 'frameSha256', 'candidates'], 'reference board');
  const projectSha256 = version === REFERENCE_BOARD_V2_SCHEMA_VERSION ? nonEmpty(parsed['projectSha256'], 'projectSha256') : undefined;
  if (projectSha256 !== undefined && !/^[0-9a-f]{64}$/.test(projectSha256)) fail('projectSha256 must be 64 lowercase hexadecimal characters');
  const frameSha256 = nonEmpty(parsed['frameSha256'], 'frameSha256');
  if (!/^[0-9a-f]{64}$/.test(frameSha256)) fail('frameSha256 must be 64 lowercase hexadecimal characters');
  const entries = array(parsed['candidates'], 'candidates');
  if (entries.length === 0) fail('candidates must be a non-empty array');
  const candidates = entries.map((entry, index) => candidate(entry, index, version));
  const ids = candidates.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) fail('candidate id values must be unique');
  return version === REFERENCE_BOARD_V2_SCHEMA_VERSION
    ? { schemaVersion: version, projectSha256: projectSha256!, frameSha256, candidates }
    : { schemaVersion: version, frameSha256, candidates };
}
