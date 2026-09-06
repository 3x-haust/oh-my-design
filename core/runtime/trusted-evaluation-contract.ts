import { createHash } from 'node:crypto';
import type { EvidenceClaimPublication } from '../brief/evidence-claims.ts';
import type { TaskOutcomeContract } from '../brief/task-outcome.ts';
import type { DesignDecision } from '../deliberation/contracts.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';

export const TRUSTED_LIFECYCLE_MANIFEST_SCHEMA = 'trusted-lifecycle-manifest-v1' as const;

export type TrustedEvaluationContractErrorCode =
  | 'MALFORMED_TRUSTED_LIFECYCLE_MANIFEST'
  | 'LIFECYCLE_MANIFEST_AUTHORITY_FORBIDDEN'
  | 'TRUSTED_EVALUATION_ENTRY_OUTSIDE_ROUTE';

export class TrustedEvaluationContractError extends Error {
  readonly code: TrustedEvaluationContractErrorCode;

  constructor(code: TrustedEvaluationContractErrorCode) {
    super(code);
    this.name = 'TrustedEvaluationContractError';
    this.code = code;
  }
}

export type TrustedEvaluationAction =
  | Readonly<{
    kind: 'click';
    selector: string;
    viewports?: readonly TrustedEvaluationViewport[];
  }>
  | Readonly<{
    kind: 'fill';
    selector: string;
    value: string;
    viewports?: readonly TrustedEvaluationViewport[];
  }>;

export type TrustedEvaluationViewport = '1280x900' | '390x844';

export type TrustedEvaluationAssertion = Readonly<{
  kind: 'visible-text' | 'absent-text';
  selector: string;
  text: string;
}>;

export type TrustedEntrySurface = Readonly<{
  benchmarkProjectionSha256: string;
  prerequisiteTaskId: string;
  dependentTaskId: string;
  purpose: Readonly<{ selector: string; text: string }>;
  workObject: Readonly<{ selector: string; anchorSelector: string; anchorText: string }>;
  nextAction?: Readonly<{ selector: string; accessibleName: string }>;
  trigger: Exclude<TrustedEvaluationAction, Readonly<{ viewports: readonly TrustedEvaluationViewport[] }>>;
  consequence: Readonly<{ selector: string; beforeText: string; afterText: string }>;
}>;

export type TrustedLifecycleManifest = Readonly<{
  schema: typeof TRUSTED_LIFECYCLE_MANIFEST_SCHEMA;
  entryPath: string;
  scripts: readonly Readonly<{
    outcomeRef: string;
    actions: readonly TrustedEvaluationAction[];
    assertions: readonly TrustedEvaluationAssertion[];
  }>[];
  entrySurface?: TrustedEntrySurface;
}>;

export type TrustedEvaluationIdentity = Readonly<{
  sourceContractSha256: string;
  entryPath: string;
  requiredOutcomeRefs: readonly string[];
  confirmedClaimRefs: readonly string[];
}>;

export type TrustedEvaluationRefSets = Readonly<{
  requiredOutcomeRefs: readonly string[];
  confirmedClaimRefs: readonly string[];
}>;

const MANIFEST_KEYS = new Set(['schema', 'entryPath', 'scripts']);
const ENTRY_MANIFEST_KEYS = new Set([...MANIFEST_KEYS, 'entrySurface']);
const SCRIPT_KEYS = new Set(['outcomeRef', 'actions', 'assertions']);
const CLICK_ACTION_KEYS = new Set(['kind', 'selector']);
const SCOPED_CLICK_ACTION_KEYS = new Set(['kind', 'selector', 'viewports']);
const FILL_ACTION_KEYS = new Set(['kind', 'selector', 'value']);
const SCOPED_FILL_ACTION_KEYS = new Set(['kind', 'selector', 'value', 'viewports']);
const EVALUATION_VIEWPORTS = new Set<TrustedEvaluationViewport>(['1280x900', '390x844']);
const ASSERTION_KEYS = new Set(['kind', 'selector', 'text']);
const ENTRY_SURFACE_KEYS = new Set([
  'benchmarkProjectionSha256',
  'prerequisiteTaskId',
  'dependentTaskId',
  'purpose',
  'workObject',
  'nextAction',
  'trigger',
  'consequence',
]);
const ENTRY_SURFACE_WITHOUT_NEXT_ACTION_KEYS = new Set(
  [...ENTRY_SURFACE_KEYS].filter((key) => key !== 'nextAction'),
);
const ENTRY_PURPOSE_KEYS = new Set(['selector', 'text']);
const ENTRY_WORK_OBJECT_KEYS = new Set(['selector', 'anchorSelector', 'anchorText']);
const ENTRY_NEXT_ACTION_KEYS = new Set(['selector', 'accessibleName']);
const ENTRY_CONSEQUENCE_KEYS = new Set(['selector', 'beforeText', 'afterText']);
const SHA256 = /^[a-f0-9]{64}$/;

function evaluationViewport(value: unknown): value is TrustedEvaluationViewport {
  return value === '1280x900' || value === '390x844';
}

function fail(code: TrustedEvaluationContractErrorCode): never {
  throw new TrustedEvaluationContractError(code);
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('MALFORMED_TRUSTED_LIFECYCLE_MANIFEST');
  }
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: ReadonlySet<string>): void {
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.size || own.some((key) => typeof key !== 'string' || !keys.has(key))) {
    return fail('MALFORMED_TRUSTED_LIFECYCLE_MANIFEST');
  }
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    return fail('MALFORMED_TRUSTED_LIFECYCLE_MANIFEST');
  }
  return value.trim();
}

function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) return fail('MALFORMED_TRUSTED_LIFECYCLE_MANIFEST');
  return value;
}

function hash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function glob(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001').replace(/\*/g, '[^/]*').replace(/\u0000/g, '(?:.*/)?')
    .replace(/\u0001/g, '.*').replace(/\?/g, '[^/]');
  return new RegExp(`^${escaped}$`);
}

function safeScopedPath(path: string, allowedPaths: readonly string[]): boolean {
  const normalized = path.replace(/^\.\//, '');
  if (normalized === '' || normalized.includes('\0') || normalized.includes('\\')
    || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)
    || normalized.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    return false;
  }
  return allowedPaths.some((pattern) => glob(pattern).test(normalized));
}

function parseEntrySurface(value: unknown): TrustedEntrySurface {
  const entry = record(value);
  const hasNextAction = Object.hasOwn(entry, 'nextAction');
  exact(entry, hasNextAction ? ENTRY_SURFACE_KEYS : ENTRY_SURFACE_WITHOUT_NEXT_ACTION_KEYS);
  const benchmarkProjectionSha256 = text(entry.benchmarkProjectionSha256);
  if (!SHA256.test(benchmarkProjectionSha256)) {
    return fail('MALFORMED_TRUSTED_LIFECYCLE_MANIFEST');
  }
  const purpose = record(entry.purpose);
  exact(purpose, ENTRY_PURPOSE_KEYS);
  const workObject = record(entry.workObject);
  exact(workObject, ENTRY_WORK_OBJECT_KEYS);
  const nextAction = hasNextAction ? record(entry.nextAction) : undefined;
  if (nextAction !== undefined) exact(nextAction, ENTRY_NEXT_ACTION_KEYS);
  const trigger = record(entry.trigger);
  if (trigger.kind === 'click') exact(trigger, CLICK_ACTION_KEYS);
  else if (trigger.kind === 'fill') exact(trigger, FILL_ACTION_KEYS);
  else return fail('MALFORMED_TRUSTED_LIFECYCLE_MANIFEST');
  const consequence = record(entry.consequence);
  exact(consequence, ENTRY_CONSEQUENCE_KEYS);
  const beforeText = text(consequence.beforeText);
  const afterText = text(consequence.afterText);
  if (beforeText === afterText) return fail('MALFORMED_TRUSTED_LIFECYCLE_MANIFEST');
  return Object.freeze({
    benchmarkProjectionSha256,
    prerequisiteTaskId: text(entry.prerequisiteTaskId),
    dependentTaskId: text(entry.dependentTaskId),
    purpose: Object.freeze({
      selector: text(purpose.selector),
      text: text(purpose.text),
    }),
    workObject: Object.freeze({
      selector: text(workObject.selector),
      anchorSelector: text(workObject.anchorSelector),
      anchorText: text(workObject.anchorText),
    }),
    ...(nextAction === undefined
      ? {}
      : {
        nextAction: Object.freeze({
          selector: text(nextAction.selector),
          accessibleName: text(nextAction.accessibleName),
        }),
      }),
    trigger: trigger.kind === 'click'
      ? Object.freeze({ kind: 'click' as const, selector: text(trigger.selector) })
      : Object.freeze({
        kind: 'fill' as const,
        selector: text(trigger.selector),
        value: text(trigger.value),
      }),
    consequence: Object.freeze({
      selector: text(consequence.selector),
      beforeText,
      afterText,
    }),
  });
}

export function parseTrustedLifecycleManifest(input: unknown): TrustedLifecycleManifest {
  const value = record(input);
  if (Object.hasOwn(value, 'authority')) return fail('LIFECYCLE_MANIFEST_AUTHORITY_FORBIDDEN');
  exact(value, Object.hasOwn(value, 'entrySurface') ? ENTRY_MANIFEST_KEYS : MANIFEST_KEYS);
  if (value.schema !== TRUSTED_LIFECYCLE_MANIFEST_SCHEMA) {
    return fail('MALFORMED_TRUSTED_LIFECYCLE_MANIFEST');
  }
  const scripts = array(value.scripts).map((candidate) => {
    const script = record(candidate);
    exact(script, SCRIPT_KEYS);
    const actions = array(script.actions).map((candidateAction) => {
      const action = record(candidateAction);
      const scoped = Object.hasOwn(action, 'viewports');
      if (action.kind === 'click') exact(action, scoped ? SCOPED_CLICK_ACTION_KEYS : CLICK_ACTION_KEYS);
      else if (action.kind === 'fill') exact(action, scoped ? SCOPED_FILL_ACTION_KEYS : FILL_ACTION_KEYS);
      else return fail('MALFORMED_TRUSTED_LIFECYCLE_MANIFEST');
      const viewports = action.viewports === undefined
        ? undefined
        : array(action.viewports).map((viewport) => {
          if (!evaluationViewport(viewport) || !EVALUATION_VIEWPORTS.has(viewport)) {
            return fail('MALFORMED_TRUSTED_LIFECYCLE_MANIFEST');
          }
          return viewport;
        });
      if (viewports !== undefined && (viewports.length === 0 || new Set(viewports).size !== viewports.length)) {
        return fail('MALFORMED_TRUSTED_LIFECYCLE_MANIFEST');
      }
      const selector = text(action.selector);
      if (action.kind === 'click') {
        return Object.freeze({
          kind: 'click' as const,
          selector,
          ...(viewports === undefined ? {} : { viewports: Object.freeze(viewports) }),
        });
      }
      return Object.freeze({
        kind: 'fill' as const,
        selector,
        value: text(action.value),
        ...(viewports === undefined ? {} : { viewports: Object.freeze(viewports) }),
      });
    });
    const assertions = array(script.assertions).map((candidateAssertion) => {
      const assertion = record(candidateAssertion);
      exact(assertion, ASSERTION_KEYS);
      if (assertion.kind !== 'visible-text' && assertion.kind !== 'absent-text') {
        return fail('MALFORMED_TRUSTED_LIFECYCLE_MANIFEST');
      }
      return Object.freeze({
        kind: assertion.kind,
        selector: text(assertion.selector),
        text: text(assertion.text),
      });
    });
    return Object.freeze({
      outcomeRef: text(script.outcomeRef),
      actions: Object.freeze(actions),
      assertions: Object.freeze(assertions),
    });
  });
  return Object.freeze({
    schema: TRUSTED_LIFECYCLE_MANIFEST_SCHEMA,
    entryPath: text(value.entryPath),
    scripts: Object.freeze(scripts),
    ...(value.entrySurface === undefined ? {} : { entrySurface: parseEntrySurface(value.entrySurface) }),
  });
}

export function trustedEvaluationPlanBytes(manifest: TrustedLifecycleManifest): Buffer {
  return Buffer.from(`${canonicalJson(manifest)}\n`);
}

export function deriveTrustedEvaluationRefSets(input: Readonly<{
  sourceContractSha256: string;
  taskOutcome: TaskOutcomeContract;
  evidenceClaims: EvidenceClaimPublication;
}>): TrustedEvaluationRefSets {
  if (!SHA256.test(input.sourceContractSha256)) {
    return fail('MALFORMED_TRUSTED_LIFECYCLE_MANIFEST');
  }
  const requiredOutcomeRefs = (['mustHave', 'mustNotHave', 'completionEvidence'] as const)
    .flatMap((kind) => input.taskOutcome[kind].map((value, index) =>
      `outcome:${input.sourceContractSha256}:${kind}:${index}:${hash(value)}`));
  const byId = new Map(input.evidenceClaims.claims.map((claim) => [claim.id, claim]));
  const confirmedClaimRefs = input.evidenceClaims.userFacts.map((id) => {
    const claim = byId.get(id);
    if (claim === undefined || claim.status !== 'confirmed') {
      return fail('MALFORMED_TRUSTED_LIFECYCLE_MANIFEST');
    }
    return `claim:${input.sourceContractSha256}:${id}:${hash(claim)}`;
  });
  return Object.freeze({
    requiredOutcomeRefs: Object.freeze(requiredOutcomeRefs),
    confirmedClaimRefs: Object.freeze(confirmedClaimRefs),
  });
}

export function deriveTrustedDecisionRefs(
  sourceContractSha256: string,
  decisions: readonly DesignDecision[],
): readonly string[] {
  if (!SHA256.test(sourceContractSha256) || decisions.length === 0
    || new Set(decisions.map((decision) => decision.id)).size !== decisions.length) {
    return fail('MALFORMED_TRUSTED_LIFECYCLE_MANIFEST');
  }
  return Object.freeze(decisions.map((decision) =>
    `decision:${sourceContractSha256}:${decision.id}:${hash(decision)}`));
}

export function deriveTrustedEvaluationIdentity(input: Readonly<{
  sourceContractSha256: string;
  taskOutcome: TaskOutcomeContract;
  evidenceClaims: EvidenceClaimPublication;
  allowedPaths: readonly string[];
  entryPath: string;
}>): TrustedEvaluationIdentity {
  if (!safeScopedPath(input.entryPath, input.allowedPaths)) {
    return fail('TRUSTED_EVALUATION_ENTRY_OUTSIDE_ROUTE');
  }
  const refs = deriveTrustedEvaluationRefSets(input);
  return Object.freeze({
    sourceContractSha256: input.sourceContractSha256,
    entryPath: input.entryPath,
    requiredOutcomeRefs: refs.requiredOutcomeRefs,
    confirmedClaimRefs: refs.confirmedClaimRefs,
  });
}
