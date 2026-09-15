import { createHash } from 'node:crypto';
import { parseEvidenceClaimPublication, type EvidenceClaimPublication } from '../brief/evidence-claims.ts';
import { parseTaskOutcomeContract, type TaskOutcomeContract } from '../brief/task-outcome.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';

export const TRUSTED_PROJECT_CONTRACT_SCHEMA = 'trusted-project-contract-v1' as const;

export class TrustedProjectContractError extends Error {
  readonly code: 'MALFORMED_TRUSTED_PROJECT_CONTRACT' | 'INCOMPLETE_TRUSTED_EVALUATION_COVERAGE';

  constructor(code: TrustedProjectContractError['code'], detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = 'TrustedProjectContractError';
    this.code = code;
  }
}

export type TrustedProjectContract = Readonly<{
  schema: typeof TRUSTED_PROJECT_CONTRACT_SCHEMA;
  taskOutcome: TaskOutcomeContract;
  evidenceClaims: EvidenceClaimPublication;
  allowedPaths: readonly string[];
  decisionRefs: readonly string[];
}>;

const KEYS = new Set(['schema', 'taskOutcome', 'evidenceClaims', 'allowedPaths', 'decisionRefs']);

const fail = (code: TrustedProjectContractError['code'], detail?: string): never => {
  throw new TrustedProjectContractError(code, detail);
};

function strings(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0
    || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    return fail('MALFORMED_TRUSTED_PROJECT_CONTRACT');
  }
  const values = value.map((item) => (item as string).trim());
  if (new Set(values).size !== values.length) return fail('MALFORMED_TRUSTED_PROJECT_CONTRACT');
  return Object.freeze(values);
}

export function parseTrustedProjectContract(input: unknown): TrustedProjectContract {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return fail('MALFORMED_TRUSTED_PROJECT_CONTRACT');
  }
  const value = input as Record<string, unknown>;
  const own = Reflect.ownKeys(value);
  if (own.length !== KEYS.size || own.some((key) => typeof key !== 'string' || !KEYS.has(key))
    || value.schema !== TRUSTED_PROJECT_CONTRACT_SCHEMA) {
    return fail('MALFORMED_TRUSTED_PROJECT_CONTRACT');
  }
  return Object.freeze({
    schema: TRUSTED_PROJECT_CONTRACT_SCHEMA,
    taskOutcome: parseTaskOutcomeContract(value.taskOutcome),
    evidenceClaims: parseEvidenceClaimPublication(value.evidenceClaims),
    allowedPaths: strings(value.allowedPaths),
    decisionRefs: strings(value.decisionRefs),
  });
}

export function trustedProjectContractSha256(value: TrustedProjectContract): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function requireExactEvaluationCoverage(
  contract: Pick<TrustedProjectContract, 'taskOutcome'>,
  scripts: readonly Readonly<{
    outcomeRef: string;
    actions: readonly unknown[];
    assertions: readonly unknown[];
  }>[],
): void {
  const expected = (['mustHave', 'mustNotHave', 'completionEvidence'] as const)
    .flatMap((kind) => contract.taskOutcome[kind].map((_, index) => ({
      ref: `${kind}:${index}`,
      assertionKind: kind === 'mustNotHave' ? 'absent-text' : 'visible-text',
    })));
  const incomplete = (): never => fail('INCOMPLETE_TRUSTED_EVALUATION_COVERAGE',
    `expected ${expected.length} scripts in canonical order [${expected.map(({ ref }) => ref).join(', ')}]; `
    + `received ${scripts.length}. Use these short outcomeRef values, not requirement prose or hashed refs. `
    + 'Each script requires assertions: absent-text for mustNotHave, visible-text otherwise. '
    + 'Do not substitute unrelated page text for a non-browser requirement.');
  if (scripts.length !== expected.length) return incomplete();
  const actual = scripts.map((script) => script.outcomeRef);
  if (new Set(actual).size !== actual.length
    || actual.some((value, index) => value !== expected[index]?.ref)
    || scripts.some((script, index) => script.assertions.length === 0
      || script.assertions.some((assertion) =>
        typeof assertion !== 'object' || assertion === null
        || Reflect.get(assertion, 'kind') !== expected[index]?.assertionKind))) {
    return incomplete();
  }
}
