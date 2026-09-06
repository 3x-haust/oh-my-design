export const CONTENT_STATE_MODEL_SCHEMA = 'design-development-content-state-model-v1' as const;

export type ContentStateModelErrorCode =
  | 'MALFORMED_CONTENT_STATE_MODEL'
  | 'CONTENT_STATE_PLAN_RECEIPT_MISMATCH'
  | 'INVALID_CONTENT_STATE_PROVENANCE'
  | 'UNSAFE_DURABLE_CONTENT_STATE_VALUE'
  | 'INVENTED_MANDATORY_CONTENT_STATE'
  | 'DANGLING_CONTENT_STATE_REFERENCE'
  | 'DUPLICATE_CONTENT_STATE_ID'
  | 'DUPLICATE_CONTENT_STATE_REFERENCE'
  | 'INVALID_CONTENT_STATE_DENSITY';

export class ContentStateModelError extends Error {
  readonly code: ContentStateModelErrorCode;

  constructor(code: ContentStateModelErrorCode) {
    super(code);
    this.code = code;
  }
}

type InputReceiptKind = 'plan' | 'user-input' | 'domain-research' | 'sanitized-production-sample';
type ContentFidelity = 'representative' | 'production-like';

type ContentStateInputReceipt = Readonly<{
  id: string;
  kind: InputReceiptKind;
  sha256: string;
}>;

type ContentProvenance = Readonly<{
  fidelity: ContentFidelity;
  receiptIds: readonly string[];
}>;

type ModeledContent = Readonly<{
  id: string;
  label: string;
  value: string;
  provenance: ContentProvenance;
}>;

type ModeledTask = Readonly<{
  id: string;
  label: string;
  contentIds: readonly string[];
  applicableStateIds: readonly string[];
}>;

type StateRequirement =
  | Readonly<{ kind: 'input-required'; receiptId: string }>
  | Readonly<{ kind: 'representative' }>;

type ModeledState = Readonly<{
  id: string;
  label: string;
  contentIds: readonly string[];
  requirement: StateRequirement;
}>;

type TransitionRecovery = Readonly<{
  stateId: string;
  action: string;
}>;

type ModeledTransition = Readonly<{
  id: string;
  taskId: string;
  fromStateId: string;
  toStateId: string;
  trigger: string;
  recovery: TransitionRecovery;
}>;

type DensityItemCount = Readonly<{
  minimum: number;
  typical: number;
  maximum: number;
}>;

type DensityProfile = Readonly<{
  id: string;
  label: string;
  itemCount: DensityItemCount;
  contentIds: readonly string[];
  stateIds: readonly string[];
  taskIds: readonly string[];
}>;

export type ContentStateModel = Readonly<{
  schema: typeof CONTENT_STATE_MODEL_SCHEMA;
  planSha256: string;
  inputReceipts: readonly ContentStateInputReceipt[];
  content: readonly ModeledContent[];
  tasks: readonly ModeledTask[];
  states: readonly ModeledState[];
  transitions: readonly ModeledTransition[];
  densityProfiles: readonly DensityProfile[];
}>;

const fail = (code: ContentStateModelErrorCode): never => {
  throw new ContentStateModelError(code);
};

const exactRecord = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('MALFORMED_CONTENT_STATE_MODEL');
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length
    || ownKeys.some((key) => typeof key !== 'string')
    || keys.some((key) => !Object.hasOwn(value, key))) {
    return fail('MALFORMED_CONTENT_STATE_MODEL');
  }
  return value as Record<string, unknown>;
};

const exactArray = (value: unknown): readonly unknown[] => {
  if (!Array.isArray(value)) return fail('MALFORMED_CONTENT_STATE_MODEL');
  const expectedKeys = new Set<string>(['length', ...value.map((_, index) => String(index))]);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== expectedKeys.size
    || ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.has(key))) {
    return fail('MALFORMED_CONTENT_STATE_MODEL');
  }
  return value;
};

const unsafeDurableValue = (value: string): boolean => {
  const patterns = [
    /\blorem\s+ipsum\b|\bdolor\s+sit\s+amet\b/i,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)|\d{2,4})[ .-]\d{3,4}[ .-]\d{4}\b/,
    /\b\d{3}-\d{2}-\d{4}\b/,
    /\b(?:\d[ -]?){13,19}\b/,
    /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i,
    /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*\S+/i,
    /-----BEGIN(?: [A-Z]+)* PRIVATE KEY-----/i,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
    /\bsk-[A-Za-z0-9_-]{16,}\b/,
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
    /https?:\/\/[^/\s:@]+:[^/\s@]+@/i,
  ];
  return patterns.some((pattern) => pattern.test(value));
};

const durableText = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail('MALFORMED_CONTENT_STATE_MODEL');
  }
  const parsed = value.trim();
  if (unsafeDurableValue(parsed)) return fail('UNSAFE_DURABLE_CONTENT_STATE_VALUE');
  return parsed;
};

const id = (value: unknown): string => {
  const parsed = durableText(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(parsed)) {
    return fail('MALFORMED_CONTENT_STATE_MODEL');
  }
  return parsed;
};

const sha256 = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    return fail('MALFORMED_CONTENT_STATE_MODEL');
  }
  return value;
};

const choice = <T extends string>(
  value: unknown,
  choices: readonly T[],
  code: ContentStateModelErrorCode = 'MALFORMED_CONTENT_STATE_MODEL',
): T => {
  if (typeof value !== 'string' || !choices.includes(value as T)) return fail(code);
  return value as T;
};

const compareAscii = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const byId = <T extends Readonly<{ id: string }>>(left: T, right: T): number => compareAscii(left.id, right.id);

const referenceIds = (
  value: unknown,
  options: Readonly<{ allowEmpty?: boolean; emptyCode?: ContentStateModelErrorCode }> = {},
): readonly string[] => {
  const parsed = exactArray(value).map(id);
  if (parsed.length === 0 && options.allowEmpty !== true) {
    return fail(options.emptyCode ?? 'MALFORMED_CONTENT_STATE_MODEL');
  }
  if (new Set(parsed).size !== parsed.length) return fail('DUPLICATE_CONTENT_STATE_REFERENCE');
  return Object.freeze(parsed.sort(compareAscii));
};

const parseReceipt = (value: unknown): ContentStateInputReceipt => {
  const item = exactRecord(value, ['id', 'kind', 'sha256']);
  return Object.freeze({
    id: id(item.id),
    kind: choice(item.kind, ['plan', 'user-input', 'domain-research', 'sanitized-production-sample']),
    sha256: sha256(item.sha256),
  });
};

const parseProvenance = (value: unknown): ContentProvenance => {
  const item = exactRecord(value, ['fidelity', 'receiptIds']);
  return Object.freeze({
    fidelity: choice(item.fidelity, ['representative', 'production-like'], 'INVALID_CONTENT_STATE_PROVENANCE'),
    receiptIds: referenceIds(item.receiptIds, { emptyCode: 'INVALID_CONTENT_STATE_PROVENANCE' }),
  });
};

const parseContent = (value: unknown): ModeledContent => {
  const item = exactRecord(value, ['id', 'label', 'value', 'provenance']);
  return Object.freeze({
    id: id(item.id),
    label: durableText(item.label),
    value: durableText(item.value),
    provenance: parseProvenance(item.provenance),
  });
};

const parseTask = (value: unknown): ModeledTask => {
  const item = exactRecord(value, ['id', 'label', 'contentIds', 'applicableStateIds']);
  return Object.freeze({
    id: id(item.id),
    label: durableText(item.label),
    contentIds: referenceIds(item.contentIds),
    applicableStateIds: referenceIds(item.applicableStateIds),
  });
};

const parseRequirement = (value: unknown): StateRequirement => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('MALFORMED_CONTENT_STATE_MODEL');
  }
  const kind = (value as Record<string, unknown>).kind;
  if (kind === 'representative') {
    exactRecord(value, ['kind']);
    return Object.freeze({ kind: 'representative' });
  }
  if (kind === 'input-required') {
    const item = exactRecord(value, ['kind', 'receiptId']);
    return Object.freeze({ kind: 'input-required', receiptId: id(item.receiptId) });
  }
  return fail('MALFORMED_CONTENT_STATE_MODEL');
};

const parseState = (value: unknown): ModeledState => {
  const item = exactRecord(value, ['id', 'label', 'contentIds', 'requirement']);
  return Object.freeze({
    id: id(item.id),
    label: durableText(item.label),
    contentIds: referenceIds(item.contentIds),
    requirement: parseRequirement(item.requirement),
  });
};

const parseRecovery = (value: unknown): TransitionRecovery => {
  const item = exactRecord(value, ['stateId', 'action']);
  return Object.freeze({ stateId: id(item.stateId), action: durableText(item.action) });
};

const parseTransition = (value: unknown): ModeledTransition => {
  const item = exactRecord(value, ['id', 'taskId', 'fromStateId', 'toStateId', 'trigger', 'recovery']);
  return Object.freeze({
    id: id(item.id),
    taskId: id(item.taskId),
    fromStateId: id(item.fromStateId),
    toStateId: id(item.toStateId),
    trigger: durableText(item.trigger),
    recovery: parseRecovery(item.recovery),
  });
};

const nonnegativeInteger = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return fail('INVALID_CONTENT_STATE_DENSITY');
  }
  return value;
};

const parseItemCount = (value: unknown): DensityItemCount => {
  const item = exactRecord(value, ['minimum', 'typical', 'maximum']);
  const minimum = nonnegativeInteger(item.minimum);
  const typical = nonnegativeInteger(item.typical);
  const maximum = nonnegativeInteger(item.maximum);
  if (minimum > typical || typical > maximum) return fail('INVALID_CONTENT_STATE_DENSITY');
  return Object.freeze({ minimum, typical, maximum });
};

const parseDensityProfile = (value: unknown): DensityProfile => {
  const item = exactRecord(value, ['id', 'label', 'itemCount', 'contentIds', 'stateIds', 'taskIds']);
  return Object.freeze({
    id: id(item.id),
    label: durableText(item.label),
    itemCount: parseItemCount(item.itemCount),
    contentIds: referenceIds(item.contentIds),
    stateIds: referenceIds(item.stateIds),
    taskIds: referenceIds(item.taskIds),
  });
};

const parseCollection = <T extends Readonly<{ id: string }>>(
  value: unknown,
  parse: (entry: unknown) => T,
): readonly T[] => {
  const entries = exactArray(value).map(parse);
  if (entries.length === 0) return fail('MALFORMED_CONTENT_STATE_MODEL');
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    return fail('DUPLICATE_CONTENT_STATE_ID');
  }
  return Object.freeze(entries.sort(byId));
};

const requireReferences = (references: readonly string[], targets: ReadonlySet<string>): void => {
  if (references.some((reference) => !targets.has(reference))) {
    fail('DANGLING_CONTENT_STATE_REFERENCE');
  }
};

export const parseContentStateModel = (value: unknown): ContentStateModel => {
  const item = exactRecord(value, [
    'schema',
    'planSha256',
    'inputReceipts',
    'content',
    'tasks',
    'states',
    'transitions',
    'densityProfiles',
  ]);
  if (item.schema !== CONTENT_STATE_MODEL_SCHEMA) return fail('MALFORMED_CONTENT_STATE_MODEL');

  const planSha256 = sha256(item.planSha256);
  const inputReceipts = parseCollection(item.inputReceipts, parseReceipt);
  const content = parseCollection(item.content, parseContent);
  const tasks = parseCollection(item.tasks, parseTask);
  const states = parseCollection(item.states, parseState);
  const transitions = parseCollection(item.transitions, parseTransition);
  const densityProfiles = parseCollection(item.densityProfiles, parseDensityProfile);

  const planReceipts = inputReceipts.filter((receipt) => receipt.kind === 'plan');
  if (planReceipts.length !== 1 || planReceipts[0]?.sha256 !== planSha256) {
    return fail('CONTENT_STATE_PLAN_RECEIPT_MISMATCH');
  }

  const receiptsById = new Map(inputReceipts.map((receipt) => [receipt.id, receipt]));
  const receiptIds = new Set(receiptsById.keys());
  const contentIds = new Set(content.map((entry) => entry.id));
  const taskIds = new Set(tasks.map((entry) => entry.id));
  const stateIds = new Set(states.map((entry) => entry.id));

  for (const entry of content) {
    requireReferences(entry.provenance.receiptIds, receiptIds);
    if (entry.provenance.fidelity === 'production-like'
      && !entry.provenance.receiptIds.some((receiptId) => receiptsById.get(receiptId)?.kind === 'sanitized-production-sample')) {
      return fail('INVALID_CONTENT_STATE_PROVENANCE');
    }
  }

  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  for (const task of tasks) {
    requireReferences(task.contentIds, contentIds);
    requireReferences(task.applicableStateIds, stateIds);
  }

  for (const state of states) {
    requireReferences(state.contentIds, contentIds);
    if (state.requirement.kind === 'input-required') {
      const receipt = receiptsById.get(state.requirement.receiptId);
      if (receipt === undefined) return fail('DANGLING_CONTENT_STATE_REFERENCE');
      if (receipt.kind !== 'plan' && receipt.kind !== 'user-input') {
        return fail('INVENTED_MANDATORY_CONTENT_STATE');
      }
    }
  }

  for (const transition of transitions) {
    const task = tasksById.get(transition.taskId);
    if (task === undefined) return fail('DANGLING_CONTENT_STATE_REFERENCE');
    requireReferences(
      [transition.fromStateId, transition.toStateId, transition.recovery.stateId],
      stateIds,
    );
    const applicableStates = new Set(task.applicableStateIds);
    requireReferences(
      [transition.fromStateId, transition.toStateId, transition.recovery.stateId],
      applicableStates,
    );
  }

  for (const profile of densityProfiles) {
    requireReferences(profile.contentIds, contentIds);
    requireReferences(profile.stateIds, stateIds);
    requireReferences(profile.taskIds, taskIds);
  }

  return Object.freeze({
    schema: CONTENT_STATE_MODEL_SCHEMA,
    planSha256,
    inputReceipts,
    content,
    tasks,
    states,
    transitions,
    densityProfiles,
  });
};

export const canonicalContentStateModelJson = (value: unknown): string =>
  JSON.stringify(parseContentStateModel(value));
