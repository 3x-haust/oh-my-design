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

export type TrustedEvaluationAction = Readonly<{
  kind: 'click';
  selector: string;
}>;

export type TrustedEvaluationAssertion = Readonly<{
  kind: 'visible-text' | 'absent-text';
  selector: string;
  text: string;
}>;

export type TrustedLifecycleManifest = Readonly<{
  schema: typeof TRUSTED_LIFECYCLE_MANIFEST_SCHEMA;
  entryPath: string;
  scripts: readonly Readonly<{
    outcomeRef: string;
    actions: readonly TrustedEvaluationAction[];
    assertions: readonly TrustedEvaluationAssertion[];
  }>[];
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
const SCRIPT_KEYS = new Set(['outcomeRef', 'actions', 'assertions']);
const ACTION_KEYS = new Set(['kind', 'selector']);
const ASSERTION_KEYS = new Set(['kind', 'selector', 'text']);
const SHA256 = /^[a-f0-9]{64}$/;

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

export function parseTrustedLifecycleManifest(input: unknown): TrustedLifecycleManifest {
  const value = record(input);
  if (Object.hasOwn(value, 'authority')) return fail('LIFECYCLE_MANIFEST_AUTHORITY_FORBIDDEN');
  exact(value, MANIFEST_KEYS);
  if (value.schema !== TRUSTED_LIFECYCLE_MANIFEST_SCHEMA) {
    return fail('MALFORMED_TRUSTED_LIFECYCLE_MANIFEST');
  }
  const scripts = array(value.scripts).map((candidate) => {
    const script = record(candidate);
    exact(script, SCRIPT_KEYS);
    const actions = array(script.actions).map((candidateAction) => {
      const action = record(candidateAction);
      exact(action, ACTION_KEYS);
      if (action.kind !== 'click') return fail('MALFORMED_TRUSTED_LIFECYCLE_MANIFEST');
      return Object.freeze({ kind: 'click' as const, selector: text(action.selector) });
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
