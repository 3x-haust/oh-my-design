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

export const DOMAIN_BRIEF_SCHEMA = 'domain-brief-v1' as const;

/** A domain has at least one canonical surface and never an unbounded page count. */
export const MIN_SURFACES = 1;
export const MAX_SURFACES = 12;
/** The real entities the domain manipulates (an ERP's purchase-order, invoice, stock item, …). */
export const MAX_CORE_OBJECTS = 24;
/** Per-role reference queries stay a focused acquisition list, never an unbounded crawl. */
export const MIN_QUERIES_PER_ROLE = 1;
export const MAX_QUERIES_PER_ROLE = 12;

export type DomainSurface = {
  /** Canonical surface name for the domain (e.g. "inventory dashboard", "purchase order detail"). */
  readonly name: string;
  /** What task the surface serves — one clause, not a paragraph. */
  readonly purpose: string;
};

export type DomainReferenceQueries = {
  /** Role ① — detailed component/section design queries good sites can answer. */
  readonly component: readonly string[];
  /** Role ② — motion / scroll-animation / sculptural craft queries for top-tier galleries. */
  readonly craft: readonly string[];
};

export type DomainBrief = {
  readonly schema: typeof DOMAIN_BRIEF_SCHEMA;
  /** The raw request, normalized and trimmed — what the user actually asked. */
  readonly request: string;
  /** The identified domain in a few words ("ERP", "developer-tool marketing landing"). */
  readonly domain: string;
  /** One-line plain description of what this domain/product is and does. */
  readonly summary: string;
  /** The canonical surfaces (pages / screens / reachable states) this domain needs. */
  readonly surfaces: readonly DomainSurface[];
  /** The real objects the domain manipulates — its nouns, not UI widgets. */
  readonly coreObjects: readonly string[];
  /** Who the work is for — the audience whose task the design serves. */
  readonly audience: string;
  /** Reference acquisition queries for the scout, split by the two reference roles. */
  readonly referenceQueries: DomainReferenceQueries;
  /**
   * True when the brief is backed by external research (a lookup of what the domain is and needs),
   * false when it is honest inference from prior knowledge alone. Either is lawful; the flag records
   * which, so a purely-inferred brief for an unfamiliar domain can be treated with due caution.
   */
  readonly researched: boolean;
};

export class DomainBriefError extends Error {
  override readonly name = 'DomainBriefError';
  readonly reason: string;
  constructor(reason: string) {
    super(`domain brief is invalid: ${reason}`);
    this.reason = reason;
  }
}

const fail = (reason: string): never => { throw new DomainBriefError(reason); };

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

function validateSurface(value: unknown, index: number): DomainSurface {
  const record = asRecord(value, `surfaces[${index}] must be an object`);
  exactKeys(record, ['name', 'purpose'], `surfaces[${index}] has unknown or missing keys`);
  return {
    name: asNonEmptyString(record.name, `surfaces[${index}].name must be a non-empty string`),
    purpose: asNonEmptyString(record.purpose, `surfaces[${index}].purpose must be a non-empty string`),
  };
}

function validateReferenceQueries(value: unknown): DomainReferenceQueries {
  const record = asRecord(value, 'referenceQueries must be an object');
  exactKeys(record, ['component', 'craft'], 'referenceQueries has unknown or missing keys');
  return {
    component: asStringList(record.component, MIN_QUERIES_PER_ROLE, MAX_QUERIES_PER_ROLE, 'referenceQueries.component'),
    craft: asStringList(record.craft, MIN_QUERIES_PER_ROLE, MAX_QUERIES_PER_ROLE, 'referenceQueries.craft'),
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
    ['audience', 'coreObjects', 'domain', 'referenceQueries', 'request', 'researched', 'schema', 'summary', 'surfaces'],
    'brief has unknown or missing keys',
  );
  if (record.schema !== DOMAIN_BRIEF_SCHEMA) fail(`schema must be ${DOMAIN_BRIEF_SCHEMA}`);
  const request = asNonEmptyString(record.request, 'request must be a non-empty string');
  const domain = asNonEmptyString(record.domain, 'domain must be a non-empty string');
  const summary = asNonEmptyString(record.summary, 'summary must be a non-empty string');

  const rawSurfaces: unknown[] = Array.isArray(record.surfaces) ? record.surfaces : fail('surfaces must be an array');
  if (rawSurfaces.length < MIN_SURFACES) fail(`surfaces must name at least ${MIN_SURFACES} canonical surface`);
  if (rawSurfaces.length > MAX_SURFACES) fail(`surfaces is bounded to ${MAX_SURFACES} entries`);
  const surfaces = rawSurfaces.map((surface, index) => validateSurface(surface, index));
  if (new Set(surfaces.map((s) => s.name.toLowerCase())).size !== surfaces.length) fail('surfaces must not repeat a name');

  const coreObjects = asStringList(record.coreObjects, 1, MAX_CORE_OBJECTS, 'coreObjects');
  const audience = asNonEmptyString(record.audience, 'audience must be a non-empty string');
  const referenceQueries = validateReferenceQueries(record.referenceQueries);
  const researched: boolean = typeof record.researched === 'boolean' ? record.researched : fail('researched must be a boolean');

  return {
    schema: DOMAIN_BRIEF_SCHEMA,
    request,
    domain,
    summary,
    surfaces,
    coreObjects,
    audience,
    referenceQueries,
    researched,
  };
}
