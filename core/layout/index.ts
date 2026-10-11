// One registry for everything OMD writes under `.omd/`.
// See core/protocol/omd-layout.md for retention decisions, owners, readers and write cadence.
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
  family('reference-analysis', 'reference-analysis.json', 'file', 'human', 'whole-screen reference analysis and selected patterns'),
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
  family('design-judgment', 'design-judgment.json', 'file', 'human', 'reference interpretations and composition hypothesis'),
  family('first-render-critic', 'first-render-critic.json', 'file', 'human', 'first viewport gestalt verdict against the design hypothesis'),
  family('first-render-evidence', 'first-render', 'directory', 'state', 'native first-render captures and immutable current-input-bound reports'),
  family('runtime-design-system', 'runtime-design-system.json', 'file', 'human', 'observed computed styles and variables by component/state'),
  family('runtime-design-system-doc', 'runtime-design-system.md', 'file', 'human', 'readable runtime component style inventory'),
  family('probes', 'probes', 'directory', 'human', 'declared primary, recovery and flow probe plans'),
  family('reference-analysis-doc', 'analysis.md', 'file', 'human', 'reference analysis rationale'),
  family('moodboard', 'moodboard.json', 'file', 'human', 'visual mood direction and sources'),
  family('moodboard-doc', 'moodboard.md', 'file', 'human', 'readable visual mood direction'),
  family('design-system-decisions', 'design-system-decisions.md', 'file', 'human', 'intentional departures from the existing design system'),
  family('existing-design-system', 'existing-design-system.json', 'file', 'human', 'observed existing component inventory'),
  family('existing-design-system-doc', 'existing-design-system.md', 'file', 'human', 'readable existing component inventory'),
  family('reference-application-doc', 'reference-application.md', 'file', 'human', 'reference application rationale'),
  family('design-judgment-doc', 'design-judgment.md', 'file', 'human', 'readable design judgment'),
  family('content-grain', 'content-grain.json', 'file', 'human', 'selected content grain'),
  family('content-fit', 'content-fit.json', 'file', 'human', 'content fit decision receipt'),
  family('confidence-debt', 'confidence-debt.json', 'file', 'human', 'explicit unresolved confidence debt'),
  family('design-handoff', 'design-handoff.json', 'file', 'human', 'production handoff decisions'),
  family('design-directory', 'design', 'directory', 'human', 'design-system and review records'),
  family('runtime-design-system-evidence', 'runtime-design-system', 'directory', 'state', 'runtime inventory captures and immutable records'),

  // ── captured research ───────────────────────────────────────────────────
  family('refs', 'refs', 'directory', 'refs', 'captured reference records, blueprints, and images'),
  family('reference-discovery', 'discovery', 'directory', 'refs', 'signed reference discovery traces, observations, and retained source pixels'),
  family('figma', 'figma', 'directory', 'refs', 'Figma snapshot and derived system'),
  family('target', 'target', 'directory', 'refs', 'registered visual targets'),
  family('reference-archive', 'archive', 'directory', 'refs', 'archived reference evidence'),
  family('locale-source-bytes', 'locale-source-bytes', 'directory', 'refs', 'locale research source bytes'),
  family('locale-source-receipts', 'locale-source-receipts', 'directory', 'refs', 'locale research receipts'),

  // ── machine trust state ─────────────────────────────────────────────────
  family('visual-measurement', 'visual-measurement.json', 'file', 'state', 'current native pixel measurement pointer'),
  family('visual-measurements', 'visual-measurements', 'directory', 'state', 'immutable signed pixel measurement packets'),
  family('visual-measurement-ir', 'visual-measurement-ir', 'directory', 'state', 'exact measured DOM and geometry records'),
  family('visual-measurement-captures', 'visual-measurement-captures', 'directory', 'state', 'fixed viewport measurement PNGs'),
  family('slop-review', 'slop', 'directory', 'state', 'retained slop checkpoints, captures and review decisions'),
  family('surface-captures', 'surface-captures.json', 'file', 'state', 'current Frame surface and content-case capture inventory'),
  family('selected-direction-evidence', 'selected-direction-evidence.json', 'file', 'state', 'current source-bound selected motion and Beat captures'),
  family('selected-direction-captures', 'selected-direction-captures', 'directory', 'state', 'owned production motion and Beat capture records'),
  family('refinement-policy', 'refinement', 'directory', 'state', 'signed native post-repair measurements and repeated-defect history'),
  family('route', 'route.json', 'file', 'state', 'selected run route and scope lock'),
  family('route-scope', 'route-scope.json', 'file', 'state', 'route scope boundary'),
  family('route-source', 'route-source.json', 'file', 'state', 'authenticated route source pointer'),
  family('route-sources', 'route-sources', 'directory', 'state', 'immutable route source records'),
  family('request-source', 'request-source.json', 'file', 'state', 'current request authority pointer'),
  family('request-sources', 'request-sources', 'directory', 'state', 'immutable request authorities'),
  family('activation', 'activation', 'directory', 'state', 'project invocation authority receipts'),
  family('native-pi', 'native-pi', 'directory', 'state', 'native Pi invocation and payload authority'),
  family('browser-profile', 'browser-profile', 'directory', 'state', 'browser profile receipts'),
  family('ai-asset-decisions', 'ai-asset-decisions', 'directory', 'state', 'AI asset sourcing decisions'),
  family('decision-graphs', 'decision-graphs', 'directory', 'state', 'immutable decision graph records'),
  family('design-judgments', 'design-judgments', 'directory', 'state', 'immutable design judgments'),
  family('completeness-current', 'completeness-current.json', 'file', 'state', 'current completion decision pointer'),
  family('completeness-runs', 'completeness-runs', 'directory', 'state', 'immutable completion decisions'),
  family('workflow-plan', 'workflow-plan.json', 'file', 'state', 'current production plan pointer'),
  family('workflow-readiness', 'workflow-production-readiness.json', 'file', 'state', 'production readiness pointer'),
  family('workflow-slice', 'workflow-production-slice.json', 'file', 'state', 'production slice pointer'),
  family('workflow-artifacts', 'workflow-artifacts.json', 'file', 'state', 'production artifact pointer'),
  family('workflow-records', 'workflow', 'directory', 'state', 'immutable workflow decisions'),
  family('learning', 'learning', 'directory', 'state', 'learned rules and observed outcomes'),
  family('coach', 'coach', 'directory', 'state', 'validated coaching decisions'),
  family('locale-design-context', 'locale-design-context.json', 'file', 'state', 'declared locale authority'),
  family('cultural-design-profile', 'cultural-design-profile.json', 'file', 'state', 'current locale profile pointer'),
  family('cultural-design-projection', 'cultural-design-projection.json', 'file', 'state', 'source-free locale projection'),
  family('typography-applicability', 'typography-applicability', 'directory', 'state', 'locale typography applicability proofs'),
  family('final-review', 'final-review', 'directory', 'state', 'signed reviewer executions, lanes and repairs'),
  family('production-repairs', 'production-repairs', 'directory', 'state', 'immutable production repair records'),
  family('production-repair-blobs', 'production-repair-blobs', 'directory', 'state', 'repair byte receipts'),
  family('reference-research-current', 'reference-research.json', 'file', 'state', 'current reference research receipt'),
  family('reference-application', 'reference-application.json', 'file', 'state', 'reference application decisions'),
  family('reference-application-projection', 'reference-application-projection.json', 'file', 'state', 'sanitized reference application'),
  family('reference-application-review', 'reference-application-review.json', 'file', 'state', 'current application review'),
  family('reference-application-reviews', 'reference-application-reviews', 'directory', 'state', 'immutable application reviews'),
  family('reference-visual-packet', 'reference-visual-packet.json', 'file', 'state', 'current visual packet pointer'),
  family('reference-visual-packets', 'reference-visual-packets', 'directory', 'state', 'immutable visual packets'),
  family('reference-visual-packet-evidence', 'reference-visual-packet-evidence.json', 'file', 'state', 'visual packet proof'),
  family('reference-influence-proof', 'reference-influence-proof.json', 'file', 'state', 'reference influence boundary'),
  family('reference-locale-binding', 'reference-locale-binding.json', 'file', 'state', 'locale reference binding'),
  family('reference-locale-binding-evidence', 'reference-locale-binding-evidence.json', 'file', 'state', 'locale reference binding proof'),
  family('task-flow-benchmark', 'task-flow-benchmark.json', 'file', 'state', 'benchmark task-flow evidence'),
  family('task-flow-benchmark-projection', 'task-flow-benchmark-projection.json', 'file', 'state', 'sanitized benchmark task-flow'),
  family('token-extensions', 'token-extensions.json', 'file', 'state', 'token extension pointer'),
  family('token-extension-receipt', 'token-extension-receipt.json', 'file', 'state', 'token extension proof'),
  family('token-extension-runs', 'token-extension-runs', 'directory', 'state', 'immutable token extensions'),
  family('build', 'build.json', 'file', 'state', 'native build result'),
  family('observation-v2-records', 'observation-v2', 'directory', 'state', 'immutable runtime observations'),
  family('observation-repair-predecessor', 'observation-v2-repair-predecessor.json', 'file', 'state', 'repair predecessor proof'),
  family('attestation-records', 'attest-v2', 'directory', 'state', 'immutable attestations'),
  family('refinement-checkpoint', 'refinement-checkpoint.json', 'file', 'state', 'current refinement checkpoint'),
  family('receipts', 'receipts', 'directory', 'state', 'project authority receipts'),
  family('captures', 'captures', 'directory', 'state', 'browser and comparison captures'),
  family('review-purpose-authorities', 'review-purpose-authorities', 'directory', 'state', 'host-observed review-purpose origin receipts'),
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
  family('selected-reference-distance', 'selected-reference-distance.json', 'file', 'state', 'current selected-slot visual fidelity receipt'),
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
  'briefs',
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
