// One registry for everything OMD writes under `.omd/`.
//
// Before this existed, every module built its own `.omd/...` string, so nobody could answer two
// questions a user actually asks: "which of these files am I supposed to read?" and "which of
// these can I delete?". A path that is not in this registry is unclassified, and unclassified is
// treated as a blocker rather than silently swept into a cleanable bucket.

/**
 * `human` — the design record a person reads and reviews.
 * `refs`  — captured reference evidence; large, but the scout's actual research.
 * `state` — machine trust state: current pointers, immutable records, receipts, logs. Committed,
 *           because it is the audit trail, but never something a person opens by hand.
 * `cache` — reproducible or single-run scratch: role tasks/handbacks, drafts, renders, probes.
 */
export type ArtifactClass = 'human' | 'refs' | 'state' | 'cache';

export type ArtifactFamily = {
  readonly id: string;
  /** Path relative to `.omd/`, as written today. */
  readonly path: string;
  readonly kind: 'file' | 'directory';
  readonly cls: ArtifactClass;
  /** One clause a person can read in `omd status --files`. */
  readonly summary: string;
  /**
   * Cleanable families can be removed without invalidating a current pointer or published
   * evidence. Everything else is retained until an owner supersedes it.
   */
  readonly cleanable?: boolean;
};

const family = (
  id: string,
  path: string,
  kind: 'file' | 'directory',
  cls: ArtifactClass,
  summary: string,
  cleanable = false,
): ArtifactFamily => ({ id, path, kind, cls, summary, ...(cleanable ? { cleanable } : {}) });

/**
 * Every family OMD writes. Ordered the way a run produces them so `omd status --files` reads like
 * the loop itself rather than like a directory listing.
 */
export const ARTIFACT_FAMILIES: readonly ArtifactFamily[] = [
  // ── the design record ────────────────────────────────────────────────────
  family('domain-brief', 'domain-brief.json', 'file', 'human', 'domain analysis the run started from'),
  family('frame', 'frame.md', 'file', 'human', 'framing, task coverage, and reality ledger'),
  family('requirements', 'functional-requirements.json', 'file', 'human', 'affordances the build owes the visitor'),
  family('reference-coverage', 'acquisition-plan.json', 'file', 'human', 'zones the references must cover'),
  family('reference-research', 'scout.md', 'file', 'human', 'sanitized reference synthesis'),
  family('reference-board', 'reference-board.json', 'file', 'human', 'assembled candidate boards'),
  family('copy-deck', 'copy-deck.md', 'file', 'human', 'real copy, registers, and fact ledger'),
  family('type-proof', 'type-proof.md', 'file', 'human', 'typography proof verdict'),
  family('composition', 'composition.md', 'file', 'human', 'composition contract'),
  family('design', 'design.md', 'file', 'human', 'assembled design record'),
  family('decisions', 'decisions.md', 'file', 'human', 'disclosed decisions in prose'),
  family('decision-graph', 'decision-graph.json', 'file', 'human', 'owner-attributed decision graph'),
  family('locale', 'locale.json', 'file', 'human', 'declared locales and primary language'),
  family('tokens', 'tokens.json', 'file', 'human', 'committed design-system ladders'),
  family('attribution', 'attribution.md', 'file', 'human', 'reference attribution'),
  family('reference-report', 'reference-report.md', 'file', 'human', 'final provenance report'),
  family('motion-spec', 'motion-spec.md', 'file', 'human', 'declared motion specification'),

  // ── captured research ───────────────────────────────────────────────────
  family('refs', 'refs', 'directory', 'refs', 'captured reference records, blueprints, and images'),
  family('figma', 'figma', 'directory', 'refs', 'Figma snapshot and derived system'),
  family('target', 'target', 'directory', 'refs', 'registered visual targets'),

  // ── machine trust state ─────────────────────────────────────────────────
  family('route', 'route.json', 'file', 'state', 'selected run route and scope lock'),
  family('depth', 'depth.json', 'file', 'state', 'depth classifier input'),
  family('intent-pointer', 'intent-current.json', 'file', 'state', 'current intent pointer'),
  family('intent-records', 'intent-runs', 'directory', 'state', 'immutable intent ledgers'),
  family('art-direction-pointer', 'art-direction.json', 'file', 'state', 'current art-direction pointer'),
  family('art-direction-records', 'art-direction-runs', 'directory', 'state', 'immutable art-direction records'),
  family('evaluator-results', 'evaluator-results', 'directory', 'state', 'immutable evaluator results'),
  family('deliberations', 'deliberations', 'directory', 'state', 'preserved moderator handbacks'),
  family('pre-selection-pointer', 'reference-pre-selection-v2.json', 'file', 'state', 'proposed reference selection pointer'),
  family('pre-selections', 'pre-reference-selections', 'directory', 'state', 'immutable proposed selections'),
  family('selection', 'reference-selection-v2.json', 'file', 'state', 'settled reference selection'),
  family('settled-selections', 'settled-reference-selections', 'directory', 'state', 'immutable settled selections'),
  family('legacy-selection', 'reference-selection.json', 'file', 'state', 'legacy v1 selection record'),
  family('motion-resolutions', 'motion-resolutions', 'directory', 'state', 'immutable motion-resolution projections'),
  family('reference-handoffs', 'reference-handoffs', 'directory', 'state', 'decision-bound role receipts'),
  family('reference-usage', 'reference-usage-v2.json', 'file', 'state', 'production reference usage ledger'),
  family('assembly-coverage', 'assembly-coverage.json', 'file', 'state', 'assembly coverage record'),
  family('observation', 'observation-v2.json', 'file', 'state', 'runtime observation record'),
  family('observation-retention', 'observation-v2-retention.json', 'file', 'state', 'observation retention record'),
  family('observations', 'observations', 'directory', 'state', 'external observation captures'),
  family('attestation', 'attest-v2.json', 'file', 'state', 'legacy-to-v2 attestation'),
  family('source-seal', 'source-seal.json', 'file', 'state', 'approved source byte seal'),
  family('task-evidence', 'task-evidence.json', 'file', 'state', 'published task evidence pointer'),
  family('task-evidence-records', 'task-evidence-runs', 'directory', 'state', 'immutable task evidence'),
  family('final-evidence', 'final-evidence-v2.json', 'file', 'state', 'published final evidence pointer'),
  family('final-evidence-records', 'final-evidence-v2-runs', 'directory', 'state', 'immutable final evidence'),
  family('legacy-final-evidence', 'final-evidence.json', 'file', 'state', 'legacy v1 final evidence'),
  family('legacy-final-evidence-records', 'final-evidence-runs', 'directory', 'state', 'legacy v1 final evidence records'),
  family('evidence', 'evidence', 'directory', 'state', 'task and review evidence tree'),
  family('delivery-log', 'delivery.jsonl', 'file', 'state', 'contract delivery receipts'),
  family('stage-usage-log', 'stage-usage.jsonl', 'file', 'state', 'per-stage cost records'),
  family('history-log', 'history.jsonl', 'file', 'state', 'check history'),
  family('craft-log', 'craft.jsonl', 'file', 'state', 'craft checkpoint log'),
  family('taste', 'taste', 'directory', 'state', 'recorded taste preferences'),
  family('config', 'config.json', 'file', 'state', 'project checkpoint configuration'),

  // ── scratch ─────────────────────────────────────────────────────────────
  family('cache', '.cache', 'directory', 'cache', 'role tasks, handbacks, drafts, renders, probes', true),
  family('probes', 'probes', 'directory', 'cache', 'probe output', true),
];

const BY_PATH = new Map(ARTIFACT_FAMILIES.map((entry) => [entry.path, entry]));

/**
 * Families a previous OMD wrote at the project root that are now scratch. They are cleanable and,
 * unlike `.cache`, they are no longer written: an owner's interim handback belongs in
 * `.cache/handbacks/`, not beside the design record.
 */
export const RETIRED_ROOT_SCRATCH: readonly string[] = [
  'framer-decisions',
  'writer-decisions',
  'refs/decisions',
  'refs/candidate-assemblies.json',
];

export function classifyArtifact(relativePath: string): ArtifactFamily | undefined {
  const normalized = relativePath.replace(/^\.omd\//, '').replace(/\/+$/, '');
  const direct = BY_PATH.get(normalized);
  if (direct !== undefined) return direct;
  const owner = ARTIFACT_FAMILIES.find((entry) => entry.kind === 'directory' && normalized.startsWith(`${entry.path}/`));
  return owner;
}

export function familiesOfClass(cls: ArtifactClass): readonly ArtifactFamily[] {
  return ARTIFACT_FAMILIES.filter((entry) => entry.cls === cls);
}

export function artifactFamily(id: string): ArtifactFamily {
  const found = ARTIFACT_FAMILIES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`unknown artifact family ${id}`);
  return found;
}
