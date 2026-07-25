// The token commitment: the design system's ladders, fixed before composition.
//
// Measured on a real generated page against the references its own scout captured, the build's
// ladders had collapsed: a type scale of two rungs [12, 16] against reference scales of five to
// eight rungs, zero elevation levels against 4–26, and one animated property against four. Nothing
// in the loop had required the ladders to be decided; each component invented its own values, so the
// system never accumulated. Committing the ladders first means an installed recipe and a
// hand-written section land on the same scale instead of drifting apart.
//
// This is a contract, not a generator: it validates that a decision was made and that the decision
// has enough range to carry hierarchy. It never invents values.

export const TOKEN_COMMIT_SCHEMA = 'token-commit-v1' as const;

/**
 * A type scale carries hierarchy only when its steps are separated enough to read as different.
 * Measured references run 3–8 rungs; two adjacent body sizes are not a scale.
 */
export const MIN_TYPE_RUNGS = 4;
/** Consecutive rungs must differ by at least this ratio, or the step is invisible. */
export const MIN_TYPE_RATIO = 1.15;
/** A display moment: the largest rung must be at least this multiple of the smallest. */
export const MIN_DISPLAY_RATIO = 2.5;
/** Spacing needs enough rungs to express tight/normal/loose/section rhythm. */
export const MIN_SPACING_RUNGS = 4;
/** Registers whose correct risk is functional are exempt from the display-moment requirement. */
export const DISPLAY_EXEMPT_REGISTERS: ReadonlySet<string> = new Set(['quiet', 'product']);

export type TokenCommit = {
  readonly schema: typeof TOKEN_COMMIT_SCHEMA;
  /** The register these tokens serve; governs which floors apply. */
  readonly register: string;
  /** Font sizes in px, ascending, no duplicates. */
  readonly typeScale: readonly number[];
  /** Spacing rungs in px, ascending, no duplicates. */
  readonly spacingScale: readonly number[];
  /** Named colour roles; `accent` is required so the palette has a committed identity. */
  readonly colorRoles: Readonly<Record<string, string>>;
  /** Font families by role; at least one. */
  readonly fontRoles: Readonly<Record<string, string>>;
};

export class TokenCommitError extends Error {
  override readonly name = 'TokenCommitError';
  readonly reason: string;
  constructor(reason: string) {
    super(`token commit is invalid: ${reason}`);
    this.reason = reason;
  }
}

const fail = (reason: string): never => { throw new TokenCommitError(reason); };
const asRecord = (v: unknown, reason: string): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(reason);

function exactKeys(record: Record<string, unknown>, expected: readonly string[], reason: string): void {
  const keys = Object.keys(record).sort();
  const want = [...expected].sort();
  if (keys.length !== want.length || keys.some((key, index) => key !== want[index])) fail(reason);
}

function asLadder(value: unknown, label: string, minRungs: number): number[] {
  const list: unknown[] = Array.isArray(value) ? value : fail(`${label} must be an array`);
  const nums = list.map((entry, index) => {
    if (typeof entry !== 'number' || !Number.isFinite(entry) || entry <= 0) return fail(`${label}[${index}] must be a positive number`);
    return entry;
  });
  if (nums.length < minRungs) fail(`${label} needs at least ${minRungs} rungs to carry hierarchy; got ${nums.length}`);
  for (let i = 1; i < nums.length; i += 1) {
    if (nums[i]! <= nums[i - 1]!) fail(`${label} must ascend with no duplicates (${nums[i - 1]} then ${nums[i]})`);
  }
  return nums;
}

function asStringMap(value: unknown, label: string, required: readonly string[]): Record<string, string> {
  const record = asRecord(value, `${label} must be an object`);
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (typeof raw !== 'string' || raw.trim() === '') fail(`${label}.${key} must be a non-empty string`);
    out[key] = (raw as string).trim();
  }
  if (Object.keys(out).length === 0) fail(`${label} must name at least one role`);
  for (const key of required) if (!(key in out)) fail(`${label} must name a \`${key}\` role`);
  return out;
}

/**
 * Validates a token commitment. Throws `TokenCommitError` on any violation.
 *
 * Beyond well-formedness this enforces the ranges that make a scale a scale: enough rungs, a real
 * ratio between them, and — on a register whose job is to persuade — a display moment. A page whose
 * type scale is two adjacent body sizes cannot express hierarchy no matter how it is composed.
 */
export function validateTokenCommit(value: unknown): TokenCommit {
  const record = asRecord(value, 'commit must be an object');
  exactKeys(record, ['colorRoles', 'fontRoles', 'register', 'schema', 'spacingScale', 'typeScale'], 'commit has unknown or missing keys');
  if (record.schema !== TOKEN_COMMIT_SCHEMA) fail(`schema must be ${TOKEN_COMMIT_SCHEMA}`);
  const register = typeof record.register === 'string' && record.register.trim() !== ''
    ? record.register.trim()
    : fail('register must be a non-empty string');

  const typeScale = asLadder(record.typeScale, 'typeScale', MIN_TYPE_RUNGS);
  for (let i = 1; i < typeScale.length; i += 1) {
    const ratio = typeScale[i]! / typeScale[i - 1]!;
    if (ratio < MIN_TYPE_RATIO) {
      fail(`typeScale steps ${typeScale[i - 1]}→${typeScale[i]} differ by ${ratio.toFixed(2)}×, below the ${MIN_TYPE_RATIO}× minimum — the step is invisible and the scale stops carrying hierarchy`);
    }
  }
  if (!DISPLAY_EXEMPT_REGISTERS.has(register)) {
    const displayRatio = typeScale[typeScale.length - 1]! / typeScale[0]!;
    if (displayRatio < MIN_DISPLAY_RATIO) {
      fail(`typeScale spans only ${displayRatio.toFixed(2)}× from ${typeScale[0]} to ${typeScale[typeScale.length - 1]}; a \`${register}\` surface needs a display moment of at least ${MIN_DISPLAY_RATIO}×`);
    }
  }

  const spacingScale = asLadder(record.spacingScale, 'spacingScale', MIN_SPACING_RUNGS);
  const colorRoles = asStringMap(record.colorRoles, 'colorRoles', ['accent']);
  const fontRoles = asStringMap(record.fontRoles, 'fontRoles', []);

  return { schema: TOKEN_COMMIT_SCHEMA, register, typeScale, spacingScale, colorRoles, fontRoles };
}

export type TokenDrift = {
  readonly id: 'TOKEN-DRIFT';
  readonly message: string;
};

/**
 * Compares the values a rendered page actually used against the commitment. Returns null when every
 * observed value sits on a committed rung — the point of committing tokens is that the build lands
 * on them rather than inventing neighbours.
 */
export function checkTokenDrift(commit: TokenCommit, observed: { readonly typeScale: readonly number[]; readonly spacingScale: readonly number[] }): TokenDrift | null {
  const offType = observed.typeScale.filter((size) => !commit.typeScale.includes(size));
  const offSpacing = observed.spacingScale.filter((step) => !commit.spacingScale.includes(step));
  if (offType.length === 0 && offSpacing.length === 0) return null;
  const parts: string[] = [];
  if (offType.length > 0) parts.push(`type sizes ${offType.join(', ')} are not on the committed scale [${commit.typeScale.join(', ')}]`);
  if (offSpacing.length > 0) parts.push(`spacing steps ${offSpacing.join(', ')} are not on the committed scale [${commit.spacingScale.join(', ')}]`);
  return {
    id: 'TOKEN-DRIFT',
    message: `${parts.join('; ')}. Each off-ladder value is a component that invented its own number instead of landing on the system, which is how a scale collapses into a cluster of adjacent sizes.`,
  };
}
