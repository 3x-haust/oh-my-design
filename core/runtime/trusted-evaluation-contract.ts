import { createHash } from 'node:crypto';
import type { EvidenceClaimPublication } from '../brief/evidence-claims.ts';
import type { TaskOutcomeContract } from '../brief/task-outcome.ts';
import type { DesignDecision } from '../deliberation/contracts.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { parseMeasureScope } from '../measure/schema.ts';
import type { ViewRequest } from '../measure/types.ts';

export const TRUSTED_LIFECYCLE_MANIFEST_SCHEMA = 'trusted-lifecycle-manifest-v1' as const;
export const MEASURED_LIFECYCLE_MANIFEST_SCHEMA = 'trusted-lifecycle-manifest-v2' as const;
export const TRUSTED_EVALUATION_KEYS = [
  'Tab', 'Shift+Tab', 'Enter', 'Space', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End',
] as const;

export type TrustedEvaluationContractErrorCode =
  | 'MALFORMED_TRUSTED_LIFECYCLE_MANIFEST'
  | 'LIFECYCLE_MANIFEST_AUTHORITY_FORBIDDEN'
  | 'TRUSTED_EVALUATION_ENTRY_OUTSIDE_ROUTE';

export class TrustedEvaluationContractError extends Error {
  readonly code: TrustedEvaluationContractErrorCode;

  constructor(code: TrustedEvaluationContractErrorCode, detail?: string) {
    // The detail names the field to repair; the code alone sent authors round the same schema again.
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = 'TrustedEvaluationContractError';
    this.code = code;
  }
}

export type TrustedEvaluationAction =
  | Readonly<{
    kind: 'reload';
    viewports?: readonly TrustedEvaluationViewport[];
  }>
  | Readonly<{
    kind: 'click';
    selector: string;
    viewports?: readonly TrustedEvaluationViewport[];
  }>
  | Readonly<{
    kind: 'press';
    selector: string;
    key: typeof TRUSTED_EVALUATION_KEYS[number];
    viewports?: readonly TrustedEvaluationViewport[];
  }>
  | Readonly<{
    kind: 'fill';
    selector: string;
    value: string;
    viewports?: readonly TrustedEvaluationViewport[];
  }>
  | Readonly<{
    kind: 'hover' | 'focus' | 'press-start';
    selector: string;
    viewports?: readonly TrustedEvaluationViewport[];
  }>;

export type TrustedEvaluationViewport = '1280x900' | '390x844';

export type TrustedEvaluationState = 'default' | 'hover' | 'focus' | 'pressed' | 'open';
export type TrustedEvaluationAssertion =
  | Readonly<{
    kind: 'visible-text' | 'preserved-text' | 'absent-text';
    selector: string;
    text: string;
  }>
  | Readonly<{
    kind: 'element-state';
    selector: string;
    state: 'hovered' | 'focused' | 'focus-visible' | 'pressed' | 'expanded';
  }>;
export type TrustedEvaluationCaptureState = Readonly<{
  component: string;
  state: TrustedEvaluationState;
}>;

export type TrustedEntrySurface = Readonly<{
  benchmarkProjectionSha256: string;
  prerequisiteTaskId: string;
  dependentTaskId: string;
  purpose: Readonly<{ selector: string; text: string }>;
  workObject: Readonly<{ selector: string; anchorSelector: string; anchorText: string }>;
  nextAction?: Readonly<{ selector: string; accessibleName: string }>;
  trigger: Extract<TrustedEvaluationAction, Readonly<{ kind: 'click' | 'fill' }>>;
  consequence: Readonly<{ selector: string; beforeText: string; afterText: string }>;
}>;

export type TrustedLifecycleManifest = Readonly<{
  schema: typeof TRUSTED_LIFECYCLE_MANIFEST_SCHEMA | typeof MEASURED_LIFECYCLE_MANIFEST_SCHEMA;
  measurementViews?: readonly ViewRequest[];
  entryPath: string;
  scripts: readonly Readonly<{
    outcomeRef: string;
    actions: readonly TrustedEvaluationAction[];
    assertions: readonly TrustedEvaluationAssertion[];
    captureState?: TrustedEvaluationCaptureState;
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
const CAPTURED_SCRIPT_KEYS = new Set([...SCRIPT_KEYS, 'captureState']);
const CLICK_ACTION_KEYS = new Set(['kind', 'selector']);
const SCOPED_CLICK_ACTION_KEYS = new Set(['kind', 'selector', 'viewports']);
const FILL_ACTION_KEYS = new Set(['kind', 'selector', 'value']);
const SCOPED_FILL_ACTION_KEYS = new Set(['kind', 'selector', 'value', 'viewports']);
const PRESS_ACTION_KEYS = new Set(['kind', 'selector', 'key']);
const SCOPED_PRESS_ACTION_KEYS = new Set(['kind', 'selector', 'key', 'viewports']);
const RELOAD_ACTION_KEYS = new Set(['kind']);
const SCOPED_RELOAD_ACTION_KEYS = new Set(['kind', 'viewports']);
const STATE_ACTION_KEYS = new Set(['kind', 'selector']);
const SCOPED_STATE_ACTION_KEYS = new Set(['kind', 'selector', 'viewports']);
const EVALUATION_VIEWPORTS = new Set<TrustedEvaluationViewport>(['1280x900', '390x844']);
const ASSERTION_KEYS = new Set(['kind', 'selector', 'text']);
const STATE_ASSERTION_KEYS = new Set(['kind', 'selector', 'state']);
const CAPTURE_STATE_KEYS = new Set(['component', 'state']);
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
function evaluationState(value: unknown): value is TrustedEvaluationState {
  return value === 'default' || value === 'hover' || value === 'focus'
    || value === 'pressed' || value === 'open';
}

function fail(code: TrustedEvaluationContractErrorCode, detail?: string): never {
  throw new TrustedEvaluationContractError(code, detail);
}
const malformed = (detail: string): never => fail('MALFORMED_TRUSTED_LIFECYCLE_MANIFEST', detail);

function record(value: unknown, where = 'manifest'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return malformed(`${where} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: ReadonlySet<string>, where = 'manifest'): void {
  const own = Reflect.ownKeys(value);
  if (own.some((key) => typeof key !== 'string' || key === 'authority')) return malformed(`${where} has a forbidden field`);
  const missing = [...keys].filter((key) => !Object.hasOwn(value, key));
  if (missing.length > 0) return malformed(`${where} is missing ${missing.join(', ')}`);
  for (const key of own) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) return malformed(`${where}.${String(key)} must be a plain value`);
    if (!keys.has(key as string)) process.emitWarning(`ignored unknown lifecycle manifest field: ${String(key)}`);
  }
}

function text(value: unknown, where = 'field'): string {
  if (typeof value !== 'string' || value.trim() === '') {
    return malformed(`${where} must be non-empty text`);
  }
  return value.trim();
}

function array(value: unknown, where = 'field'): readonly unknown[] {
  if (!Array.isArray(value)) return malformed(`${where} must be an array`);
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
  const entry = record(value, 'entrySurface');
  const hasNextAction = Object.hasOwn(entry, 'nextAction');
  exact(entry, hasNextAction ? ENTRY_SURFACE_KEYS : ENTRY_SURFACE_WITHOUT_NEXT_ACTION_KEYS, 'entrySurface');
  const benchmarkProjectionSha256 = text(entry.benchmarkProjectionSha256, 'entrySurface.benchmarkProjectionSha256');
  if (!SHA256.test(benchmarkProjectionSha256)) {
    return malformed('entrySurface.benchmarkProjectionSha256 must be a sha256 digest');
  }
  const purpose = record(entry.purpose, 'entrySurface.purpose');
  exact(purpose, ENTRY_PURPOSE_KEYS, 'entrySurface.purpose');
  const workObject = record(entry.workObject, 'entrySurface.workObject');
  exact(workObject, ENTRY_WORK_OBJECT_KEYS, 'entrySurface.workObject');
  const nextAction = hasNextAction ? record(entry.nextAction, 'entrySurface.nextAction') : undefined;
  if (nextAction !== undefined) exact(nextAction, ENTRY_NEXT_ACTION_KEYS, 'entrySurface.nextAction');
  const trigger = record(entry.trigger, 'entrySurface.trigger');
  if (trigger.kind === 'click') exact(trigger, CLICK_ACTION_KEYS, 'entrySurface.trigger');
  else if (trigger.kind === 'fill') exact(trigger, FILL_ACTION_KEYS, 'entrySurface.trigger');
  else return malformed('entrySurface.trigger.kind must be click or fill');
  const consequence = record(entry.consequence, 'entrySurface.consequence');
  exact(consequence, ENTRY_CONSEQUENCE_KEYS, 'entrySurface.consequence');
  const beforeText = text(consequence.beforeText, 'entrySurface.consequence.beforeText');
  const afterText = text(consequence.afterText, 'entrySurface.consequence.afterText');
  if (beforeText === afterText) return malformed('entrySurface.consequence beforeText and afterText must differ');
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
  const measured = value.schema === MEASURED_LIFECYCLE_MANIFEST_SCHEMA;
  exact(value, new Set([...(Object.hasOwn(value, 'entrySurface') ? ENTRY_MANIFEST_KEYS : MANIFEST_KEYS), ...(measured ? ['measurementViews'] : [])]));
  if (value.schema !== TRUSTED_LIFECYCLE_MANIFEST_SCHEMA && !measured) {
    return malformed(`schema must be ${TRUSTED_LIFECYCLE_MANIFEST_SCHEMA} or ${MEASURED_LIFECYCLE_MANIFEST_SCHEMA}`);
  }
  const scripts = array(value.scripts, 'scripts').map((candidate, scriptIndex) => {
    const at = `scripts[${scriptIndex}]`;
    const script = record(candidate, at);
    exact(script, Object.hasOwn(script, 'captureState') ? CAPTURED_SCRIPT_KEYS : SCRIPT_KEYS, at);
    const actions = array(script.actions, `${at}.actions`).map((candidateAction, actionIndex) => {
      const where = `${at}.actions[${actionIndex}]`;
      const action = record(candidateAction, where);
      const scoped = Object.hasOwn(action, 'viewports');
      if (action.kind === 'click') exact(action, scoped ? SCOPED_CLICK_ACTION_KEYS : CLICK_ACTION_KEYS, where);
      else if (action.kind === 'fill') exact(action, scoped ? SCOPED_FILL_ACTION_KEYS : FILL_ACTION_KEYS, where);
      else if (action.kind === 'press') exact(action, scoped ? SCOPED_PRESS_ACTION_KEYS : PRESS_ACTION_KEYS, where);
      else if (action.kind === 'reload') {
        const keys = scoped ? SCOPED_RELOAD_ACTION_KEYS : RELOAD_ACTION_KEYS;
        exact(action, keys, where);
        if (Object.keys(action).some(key => !keys.has(key))) return malformed(`${where} reload takes only kind and viewports`);
      }
      else if (action.kind === 'hover' || action.kind === 'focus' || action.kind === 'press-start') {
        exact(action, scoped ? SCOPED_STATE_ACTION_KEYS : STATE_ACTION_KEYS, where);
      }
      else return malformed(`${where}.kind must be click, fill, press, reload, hover, focus or press-start`);
      const viewports = action.viewports === undefined
        ? undefined
        : array(action.viewports, `${where}.viewports`).map((viewport) => {
          if (!evaluationViewport(viewport) || !EVALUATION_VIEWPORTS.has(viewport)) {
            return malformed(`${where}.viewports entries must be 1280x900 or 390x844`);
          }
          return viewport;
        });
      if (viewports !== undefined && (viewports.length === 0 || new Set(viewports).size !== viewports.length)) {
        return malformed(`${where}.viewports must be non-empty and unique`);
      }
      if (action.kind === 'reload') {
        return Object.freeze({
          kind: 'reload' as const,
          ...(viewports === undefined ? {} : { viewports: Object.freeze(viewports) }),
        });
      }
      const selector = text(action.selector, `${where}.selector`);
      if (action.kind === 'press') {
        const key = TRUSTED_EVALUATION_KEYS.find(candidate => candidate === action.key);
        if (key === undefined) return malformed(`${where}.key must be one of ${TRUSTED_EVALUATION_KEYS.join(', ')}`);
        return Object.freeze({ kind: 'press' as const, selector, key,
          ...(viewports === undefined ? {} : { viewports: Object.freeze(viewports) }) });
      }
      if (action.kind === 'click') {
        return Object.freeze({
          kind: 'click' as const,
          selector,
          ...(viewports === undefined ? {} : { viewports: Object.freeze(viewports) }),
        });
      }
      if (action.kind === 'hover' || action.kind === 'focus' || action.kind === 'press-start') {
        return Object.freeze({
          kind: action.kind,
          selector,
          ...(viewports === undefined ? {} : { viewports: Object.freeze(viewports) }),
        });
      }
      return Object.freeze({
        kind: 'fill' as const,
        selector,
        value: text(action.value, `${where}.value`),
        ...(viewports === undefined ? {} : { viewports: Object.freeze(viewports) }),
      });
    });
    const pressStarts = actions.flatMap((action, index) =>
      action.kind === 'press-start' ? [index] : []);
    if (pressStarts.length > 1 || (pressStarts.length === 1 && pressStarts[0] !== actions.length - 1)) {
      return malformed(`${at}.actions may hold one press-start, and only as the last action`);
    }
    const assertions = array(script.assertions, `${at}.assertions`).map((candidateAssertion, assertionIndex) => {
      const where = `${at}.assertions[${assertionIndex}]`;
      const assertion = record(candidateAssertion, where);
      if (assertion.kind === 'element-state') {
        exact(assertion, STATE_ASSERTION_KEYS, where);
        if (assertion.state !== 'hovered' && assertion.state !== 'focused'
          && assertion.state !== 'focus-visible' && assertion.state !== 'pressed'
          && assertion.state !== 'expanded') {
          return malformed(`${where}.state must be hovered, focused, focus-visible, pressed or expanded`);
        }
        return Object.freeze({
          kind: 'element-state' as const,
          selector: text(assertion.selector, `${where}.selector`),
          state: assertion.state,
        });
      }
      exact(assertion, ASSERTION_KEYS, where);
      if (assertion.kind !== 'visible-text' && assertion.kind !== 'preserved-text' && assertion.kind !== 'absent-text') {
        return malformed(`${where}.kind must be visible-text, preserved-text, absent-text or element-state`);
      }
      return Object.freeze({
        kind: assertion.kind,
        selector: text(assertion.selector, `${where}.selector`),
        text: text(assertion.text, `${where}.text`),
      });
    });
    const captureState = script.captureState === undefined ? undefined : (() => {
      const capture = record(script.captureState, `${at}.captureState`);
      exact(capture, CAPTURE_STATE_KEYS, `${at}.captureState`);
      if (!evaluationState(capture.state)) return malformed(`${at}.captureState.state must be default, hover, focus, pressed or open`);
      return Object.freeze({ component: text(capture.component, `${at}.captureState.component`), state: capture.state });
    })();
    if (captureState !== undefined) {
      const finalAction = actions.at(-1);
      const matchingAction = captureState.state === 'hover' ? finalAction?.kind === 'hover'
        : captureState.state === 'focus' ? finalAction?.kind === 'focus'
        : captureState.state === 'pressed' ? finalAction?.kind === 'press-start'
        : captureState.state === 'open' ? finalAction?.kind === 'click' || finalAction?.kind === 'press'
        : actions.length === 0 || finalAction?.kind === 'reload';
      const finalSelector = finalAction !== undefined && 'selector' in finalAction ? finalAction.selector : undefined;
      const matchingAssertion = captureState.state === 'hover'
        ? assertions.some(assertion => assertion.kind === 'element-state'
          && assertion.state === 'hovered' && assertion.selector === finalSelector)
        : captureState.state === 'focus'
          ? assertions.some(assertion => assertion.kind === 'element-state'
            && (assertion.state === 'focused' || assertion.state === 'focus-visible')
            && assertion.selector === finalSelector)
          : captureState.state === 'pressed'
            ? assertions.some(assertion => assertion.kind === 'element-state'
              && assertion.state === 'pressed' && assertion.selector === finalSelector)
            : captureState.state === 'open'
              ? assertions.some(assertion => assertion.kind === 'element-state'
                && assertion.state === 'expanded' && assertion.selector === finalSelector)
              : true;
      if (!matchingAction || !matchingAssertion) {
        // Say exactly what this state needs, so the plan is corrected in one edit.
        const needs = captureState.state === 'default' ? 'no actions, or a final reload action'
          : captureState.state === 'hover' ? 'a final hover action on S and an element-state assertion { "selector": S, "state": "hovered" }'
          : captureState.state === 'focus' ? 'a final focus action on S and an element-state assertion { "selector": S, "state": "focused" }'
          : captureState.state === 'pressed' ? 'a final press-start action on S and an element-state assertion { "selector": S, "state": "pressed" }'
          : 'a final click or press action on S and an element-state assertion { "selector": S, "state": "expanded" }';
        return malformed(`${at}.captureState ${captureState.state} needs a matching final action and element-state assertion on the same selector: `
          + `${needs}. Found final action ${finalAction === undefined ? 'none' : `${finalAction.kind}${finalSelector ? ` on ${finalSelector}` : ''}`}`);
      }
    }
    return Object.freeze({
      outcomeRef: text(script.outcomeRef, `${at}.outcomeRef`),
      actions: Object.freeze(actions),
      assertions: Object.freeze(assertions),
      ...(captureState === undefined ? {} : { captureState }),
    });
  });
  return Object.freeze({
    schema: measured ? MEASURED_LIFECYCLE_MANIFEST_SCHEMA : TRUSTED_LIFECYCLE_MANIFEST_SCHEMA,
    ...(measured ? { measurementViews: parseMeasureScope({ schema: 'visual-measurement-scope-v1', views: value.measurementViews }) } : {}),
    entryPath: text(value.entryPath, 'entryPath'),
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
