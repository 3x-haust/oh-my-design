// Domain-understanding contract — the first loop step, run before framing.
//
// A raw request ("make me an ERP", "a landing page for this tool") is not yet designable: the
// harness does not yet know what the domain IS, what surfaces it canonically needs, what real
// objects it manipulates, or who it is for. Designing straight from the words produces a generic
// shape because the request under-specifies the domain. This module defines the artifact the
// domain-analysis step must produce: a bounded, validated `domain-brief-v1` that names the domain,
// its canonical surfaces, its core objects, its audience, and — crucially — the reference search
// queries the scout will run, split by the two reference roles:
//
//   role ① component  — detailed section/component/button design to source from good sites.
//   role ② craft      — motion, scroll animation, and sculptural/visual craft to source from
//                        top-tier galleries (Awwwards, theFWA, …).
//
// The brief is the bridge: domain understanding on one side, concrete reference acquisition on the
// other. It is data only — it carries no rationale, authorship, or source bytes.

import type { ExplicitUserEvidence } from '../brief/evidence-claims.ts';

export const DOMAIN_BRIEF_SCHEMA = 'domain-brief-v1' as const;

/** A domain has at least one canonical surface and never an unbounded page count. */
export const MIN_SURFACES = 1;
export const MAX_SURFACES = 64;
/** The real entities the domain manipulates (an ERP's purchase-order, invoice, stock item, …). */
export const MAX_CORE_OBJECTS = 24;
/** Per-role reference queries stay a focused acquisition list, never an unbounded crawl. */
export const MIN_QUERIES_PER_ROLE = 1;
export const MAX_QUERIES_PER_ROLE = 12;

/**
 * How a domain claim came to be known. `observed` and `user-provided` are evidence-backed;
 * `inferred` is prior-knowledge alone and never sufficient on its own.
 */
export type DomainClaimStatus = 'observed' | 'user-provided' | 'inferred';

/**
 * One source behind a domain claim. `reference` is a URL, or a project-relative capture path
 * (e.g. `.omd/captures/purchase-order.png`) for an observation made in the browser.
 *
 * This is a DOMAIN FACT source: it proves the screen or object exists. It is never a design
 * reference, and citing it as the visual basis of a section is the confusion this type exists to
 * prevent — see `protocol/domain-analysis.md` "Domain observation is not a design reference".
 */
export type DomainClaimEvidence = {
  readonly status: DomainClaimStatus;
  readonly reference: string;
};

export type DomainSurface = {
  /** Canonical surface name for the domain (e.g. "inventory dashboard", "purchase order detail"). */
  readonly name: string;
  /** What task the surface serves — one clause, not a paragraph. */
  readonly purpose: string;
  /** Where this surface claim comes from. At least one non-`inferred` entry is required. */
  readonly evidence: readonly DomainClaimEvidence[];
};

/** The domain's real nouns, each carrying the source that establishes it. */
export type DomainObject = {
  readonly name: string;
  readonly evidence: readonly DomainClaimEvidence[];
};

export type DomainAudience = {
  /** Who the work is for — the audience whose task the design serves. */
  readonly description: string;
  readonly evidence: readonly DomainClaimEvidence[];
};

export type DomainReferenceQueries = {
  /** Role ① — detailed component/section design queries good sites can answer. */
  readonly component: readonly string[];
  /** Role ② — motion / scroll-animation / sculptural craft queries for top-tier galleries. */
  readonly craft: readonly string[];
  /** Role ③ — felt-direction queries for the whole-page, visual-only moodboard lane. */
  readonly mood: readonly string[];
};

/**
 * Planning intent — why this work exists and what would make it succeed. This is not discoverable:
 * no amount of searching tells you the user's business goal, so it is either stated by the user or
 * it is a hypothesis the run must not silently promote into fact.
 */
export type DomainPlanningStatement = {
  readonly text: string;
  /** Present only when the user actually said it; its absence makes this a hypothesis. */
  readonly userEvidence?: readonly ExplicitUserEvidence[];
};

export type DomainPlanning = {
  readonly businessGoal: DomainPlanningStatement;
  readonly successSignal: DomainPlanningStatement;
  readonly nonGoals: readonly DomainPlanningStatement[];
};

export type DomainBrief = {
  readonly schema: typeof DOMAIN_BRIEF_SCHEMA;
  /** The complete request bytes — what the user actually asked. */
  readonly request: string;
  /** The identified domain in a few words ("ERP", "developer-tool marketing landing"). */
  readonly domain: string;
  /** One-line plain description of what this domain/product is and does. */
  readonly summary: string;
  /** The canonical surfaces (pages / screens / reachable states) this domain needs. */
  readonly surfaces: readonly DomainSurface[];
  /** The real objects the domain manipulates — its nouns, not UI widgets. */
  readonly coreObjects: readonly DomainObject[];
  /** Who the work is for — the audience whose task the design serves. */
  readonly audience: DomainAudience;
  /** Reference acquisition queries for the scout, split by the two reference roles. */
  readonly referenceQueries: DomainReferenceQueries;
  /** Why the work exists and what success means — user-stated, or an explicit open hypothesis. */
  readonly planning: DomainPlanning;
};

export const DOMAIN_BRIEF_ERROR_CODES = Object.freeze([
  'MALFORMED_DOMAIN_BRIEF',
  'UNSOURCED_DOMAIN_CLAIM',
  'UNSOURCED_PLANNING_CLAIM',
] as const);

export type DomainBriefErrorCode = (typeof DOMAIN_BRIEF_ERROR_CODES)[number];

export class DomainBriefError extends Error {
  override readonly name = 'DomainBriefError';
  readonly reason: string;
  /**
   * The code callers gate on. `UNSOURCED_DOMAIN_CLAIM` says the domain is asserted from inference
   * alone; `UNSOURCED_PLANNING_CLAIM` says planning intent was invented rather than asked.
   */
  readonly code: DomainBriefErrorCode;
  constructor(reason: string, code: DomainBriefErrorCode = 'MALFORMED_DOMAIN_BRIEF') {
    super(`domain brief is invalid: ${reason}`);
    this.reason = reason;
    this.code = code;
  }
}

const fail = (reason: string): never => { throw new DomainBriefError(reason); };
const failUnsourced = (reason: string): never => { throw new DomainBriefError(reason, 'UNSOURCED_DOMAIN_CLAIM'); };
const failUnsourcedPlanning = (reason: string): never => { throw new DomainBriefError(reason, 'UNSOURCED_PLANNING_CLAIM'); };

const asRecord = (v: unknown, reason: string): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(reason);

const asNonEmptyString = (v: unknown, reason: string): string =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : fail(reason);

function exactKeys(record: Record<string, unknown>, expected: readonly string[], reason: string): void {
  const keys = Object.keys(record).sort();
  const want = [...expected].sort();
  if (keys.length !== want.length || keys.some((key, index) => key !== want[index])) fail(reason);
}

function asStringList(value: unknown, min: number, max: number, label: string): string[] {
  const list: unknown[] = Array.isArray(value) ? value : fail(`${label} must be an array`);
  if (list.length < min) fail(`${label} must have at least ${min} entr${min === 1 ? 'y' : 'ies'}`);
  if (list.length > max) fail(`${label} is bounded to ${max} entries`);
  const out = list.map((entry, index) => asNonEmptyString(entry, `${label}[${index}] must be a non-empty string`));
  if (new Set(out.map((s) => s.toLowerCase())).size !== out.length) fail(`${label} must not repeat an entry`);
  return out;
}

function validateEvidence(value: unknown, label: string): readonly DomainClaimEvidence[] {
  const list: unknown[] = Array.isArray(value) ? value : fail(`${label} must be an array`);
  if (list.length === 0) fail(`${label} must carry at least one source`);
  return list.map((entry, index) => {
    const record = asRecord(entry, `${label}[${index}] must be an object`);
    exactKeys(record, ['reference', 'status'], `${label}[${index}] has unknown or missing keys`);
    const status = asNonEmptyString(record.status, `${label}[${index}].status must be a non-empty string`);
    if (status !== 'observed' && status !== 'user-provided' && status !== 'inferred') {
      fail(`${label}[${index}].status must be observed, user-provided, or inferred`);
    }
    return {
      status: status as DomainClaimStatus,
      reference: asNonEmptyString(record.reference, `${label}[${index}].reference must be a non-empty string`),
    };
  });
}

/**
 * A claim is substantiated only when at least one source is an observation or a user artifact.
 * A chain of pure inference is the statistical average this contract exists to reject.
 */
function requireSubstantiated(evidence: readonly DomainClaimEvidence[], label: string): void {
  if (evidence.every((entry) => entry.status === 'inferred')) {
    failUnsourced(`${label} is unsourced: at least one evidence entry must be observed or user-provided. An observed entry is a domain FACT (this screen exists); it is not a design reference, and it does not authorize citing that page's visual treatment as this design's basis`);
  }
}

function validateObject(value: unknown, index: number): DomainObject {
  const record = asRecord(value, `coreObjects[${index}] must be an object`);
  exactKeys(record, ['evidence', 'name'], `coreObjects[${index}] has unknown or missing keys`);
  const name = asNonEmptyString(record.name, `coreObjects[${index}].name must be a non-empty string`);
  const evidence = validateEvidence(record.evidence, `coreObjects[${index}].evidence`);
  requireSubstantiated(evidence, `coreObjects[${index}]`);
  return { name, evidence };
}

function validateAudience(value: unknown): DomainAudience {
  const record = asRecord(value, 'audience must be an object');
  exactKeys(record, ['description', 'evidence'], 'audience has unknown or missing keys');
  const description = asNonEmptyString(record.description, 'audience.description must be a non-empty string');
  const evidence = validateEvidence(record.evidence, 'audience.evidence');
  requireSubstantiated(evidence, 'audience');
  return { description, evidence };
}

function validateSurface(value: unknown, index: number): DomainSurface {
  const record = asRecord(value, `surfaces[${index}] must be an object`);
  exactKeys(record, ['evidence', 'name', 'purpose'], `surfaces[${index}] has unknown or missing keys`);
  const evidence = validateEvidence(record.evidence, `surfaces[${index}].evidence`);
  requireSubstantiated(evidence, `surfaces[${index}]`);
  return {
    name: asNonEmptyString(record.name, `surfaces[${index}].name must be a non-empty string`),
    purpose: asNonEmptyString(record.purpose, `surfaces[${index}].purpose must be a non-empty string`),
    evidence,
  };
}

function validateUserEvidence(value: unknown, label: string): readonly ExplicitUserEvidence[] {
  const list: unknown[] = Array.isArray(value) ? value : fail(`${label} must be an array`);
  if (list.length === 0) fail(`${label} must carry at least one explicit user evidence entry`);
  return list.map((entry, index) => {
    const record = asRecord(entry, `${label}[${index}] must be an object`);
    exactKeys(record, ['excerpt', 'kind', 'reference', 'source'], `${label}[${index}] has unknown or missing keys`);
    if (record.kind !== 'explicit-user-evidence') fail(`${label}[${index}].kind must be explicit-user-evidence`);
    const source = asNonEmptyString(record.source, `${label}[${index}].source must be a non-empty string`);
    if (source !== 'user-message' && source !== 'user-provided-artifact') {
      fail(`${label}[${index}].source must be user-message or user-provided-artifact`);
    }
    return Object.freeze({
      kind: 'explicit-user-evidence' as const,
      source: source as ExplicitUserEvidence['source'],
      reference: asNonEmptyString(record.reference, `${label}[${index}].reference must be a non-empty string`),
      excerpt: asNonEmptyString(record.excerpt, `${label}[${index}].excerpt must be a non-empty string`),
    });
  });
}

function validatePlanningStatement(value: unknown, label: string): DomainPlanningStatement {
  const record = asRecord(value, `${label} must be an object`);
  const keys = Object.keys(record);
  const withEvidence = keys.includes('userEvidence');
  if (!withEvidence) exactKeys(record, ['text'], `${label} carries an unknown key; a statement without userEvidence is a hypothesis`);
  const text = asNonEmptyString(record.text, `${label}.text must be a non-empty string`);
  if (!withEvidence) return Object.freeze({ text });
  return Object.freeze({ text, userEvidence: validateUserEvidence(record.userEvidence, `${label}.userEvidence`) });
}

function validatePlanning(value: unknown): DomainPlanning {
  const record = asRecord(value, 'planning must be an object');
  exactKeys(record, ['businessGoal', 'nonGoals', 'successSignal'], 'planning has unknown or missing keys');
  const rawNonGoals: unknown[] = Array.isArray(record.nonGoals) ? record.nonGoals : fail('planning.nonGoals must be an array');
  return {
    businessGoal: validatePlanningStatement(record.businessGoal, 'planning.businessGoal'),
    successSignal: validatePlanningStatement(record.successSignal, 'planning.successSignal'),
    nonGoals: Object.freeze(rawNonGoals.map((entry, index) => validatePlanningStatement(entry, `planning.nonGoals[${index}]`))),
  };
}

/**
 * Planning intent is asked, never inferred. A statement the user never made stays a hypothesis — it
 * is lawful in the brief, but it is not a basis for production, so the caller gates on this.
 */
export function unconfirmedPlanningStatements(planning: DomainPlanning): readonly string[] {
  const labels: string[] = [];
  if (planning.businessGoal.userEvidence === undefined) labels.push('businessGoal');
  if (planning.successSignal.userEvidence === undefined) labels.push('successSignal');
  planning.nonGoals.forEach((statement, index) => {
    if (statement.userEvidence === undefined) labels.push(`nonGoals[${index}]`);
  });
  return Object.freeze(labels);
}

/** Throws `UNSOURCED_PLANNING_CLAIM` when a run would carry an invented plan into production. */
export function requireConfirmedPlanning(planning: DomainPlanning): void {
  const unconfirmed = unconfirmedPlanningStatements(planning);
  if (unconfirmed.length > 0) {
    failUnsourcedPlanning(`planning is unconfirmed for ${unconfirmed.join(', ')}: ask the user before production rather than inventing a business goal`);
  }
}

function validateReferenceQueries(value: unknown): DomainReferenceQueries {
  const record = asRecord(value, 'referenceQueries must be an object');
  exactKeys(record, ['component', 'craft', 'mood'], 'referenceQueries has unknown or missing keys');
  return {
    component: asStringList(record.component, MIN_QUERIES_PER_ROLE, MAX_QUERIES_PER_ROLE, 'referenceQueries.component'),
    craft: asStringList(record.craft, MIN_QUERIES_PER_ROLE, MAX_QUERIES_PER_ROLE, 'referenceQueries.craft'),
    mood: asStringList(record.mood, MIN_QUERIES_PER_ROLE, MAX_QUERIES_PER_ROLE, 'referenceQueries.mood'),
  };
}

/**
 * Validates a domain brief. Throws `DomainBriefError` on any violation. A valid brief names the
 * domain, a one-line summary, a bounded set of canonical surfaces (each with a purpose), the domain's
 * core objects, the audience, and per-role reference queries for both the component and craft roles.
 */
export function validateDomainBrief(value: unknown): DomainBrief {
  const record = asRecord(value, 'brief must be an object');
  exactKeys(
    record,
    ['audience', 'coreObjects', 'domain', 'planning', 'referenceQueries', 'request', 'schema', 'summary', 'surfaces'],
    'brief has unknown or missing keys',
  );
  if (record.schema !== DOMAIN_BRIEF_SCHEMA) fail(`schema must be ${DOMAIN_BRIEF_SCHEMA}`);
  const request = typeof record.request === 'string' && record.request.trim() !== ''
    ? record.request : fail('request must be a non-empty string');
  const domain = asNonEmptyString(record.domain, 'domain must be a non-empty string');
  const summary = asNonEmptyString(record.summary, 'summary must be a non-empty string');

  const rawSurfaces: unknown[] = Array.isArray(record.surfaces) ? record.surfaces : fail('surfaces must be an array');
  if (rawSurfaces.length < MIN_SURFACES) fail(`surfaces must name at least ${MIN_SURFACES} canonical surface`);
  if (rawSurfaces.length > MAX_SURFACES) fail(`surfaces is bounded to ${MAX_SURFACES} entries`);
  const surfaces = rawSurfaces.map((surface, index) => validateSurface(surface, index));
  if (new Set(surfaces.map((s) => s.name.toLowerCase())).size !== surfaces.length) fail('surfaces must not repeat a name');

  const rawObjects: unknown[] = Array.isArray(record.coreObjects) ? record.coreObjects : fail('coreObjects must be an array');
  if (rawObjects.length < 1) fail('coreObjects must have at least 1 entry');
  if (rawObjects.length > MAX_CORE_OBJECTS) fail(`coreObjects is bounded to ${MAX_CORE_OBJECTS} entries`);
  const coreObjects = rawObjects.map((object, index) => validateObject(object, index));
  if (new Set(coreObjects.map((object) => object.name.toLowerCase())).size !== coreObjects.length) fail('coreObjects must not repeat a name');

  const audience = validateAudience(record.audience);
  const referenceQueries = validateReferenceQueries(record.referenceQueries);

  return {
    schema: DOMAIN_BRIEF_SCHEMA,
    request,
    domain,
    summary,
    surfaces,
    coreObjects,
    audience,
    referenceQueries,
    planning: validatePlanning(record.planning),
  };
}
