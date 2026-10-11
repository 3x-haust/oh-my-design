import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildBrief, type BriefStage } from './index.ts';
import { loadRoleProfile, PROFILE_MODES } from './profiles.ts';
import { checkCandidateStudy, parseSketchBrief, type SketchBrief } from './candidate-study.ts';
import { CANDIDATE_PLAN_PATH, checkCandidatePlan } from './candidate-plan.ts';
import { readCurrentCandidateSelection } from './candidate-choice.ts';
import * as v from './candidate-data.ts';
import { readPersistedRoute } from '../route/index.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { readFrame } from '../frame/index.ts';
import { readWholeScreenReferenceHandoff } from '../ref/reference-handoff.ts';
import { designInventoryStatus, DESIGN_INVENTORY_DOC_PATH, type DesignInventory } from '../tokens/inventory.ts';
import { runtimeInventoryStatus, RUNTIME_INVENTORY_DOC } from '../tokens/runtime-inventory.ts';
import { resolveSelectedTokens } from '../tokens/resolve.ts';
import { isSelectedArtDirection, readSelectedArtDirection, selectedArtCopyProjection } from '../art-direction/selected.ts';

export type RoleBriefOptions = Readonly<{ role: string; mode?: string; sketch?: SketchBrief; sourceRoot?: string }>;
const ROLES: Readonly<Record<string, readonly BriefStage[]>> = {
  'omd-framer': ['domain', 'frame', 'content-grain', 'acquisition'],
  'omd-scout': ['scout', 'reference-board'], 'omd-writer': ['copy', 'safety-validation'],
  'omd-art-director': ['candidate-generation', 'art-direction'], 'omd-sketch': ['candidate-generation'],
  'omd-typesetter': ['type-proof'], 'omd-composer': ['composition'],
  'omd-hand': ['production', 'browser-evidence'], 'omd-eye': ['independent-review', 'review', 'candidate-generation', 'copy', 'type-proof'],
};
const fail = (reason: string): never => { throw new Error(`ROLE_BRIEF: ${reason}`); };
function document(root: string, path: string) {
  if (!existsSync(join(root, path))) return null;
  const bytes = v.readBytes(root, path);
  return { receipt: { path, sha256: v.hash(bytes) }, content: bytes.toString('utf8') };
}

/** Delivers actual current system material, not an inventory path presented as a proof of reuse. */
export function roleSystemProjection(root: string) {
  const status = designInventoryStatus(root), runtime = runtimeInventoryStatus(root);
  const inventoryDocument = status.status === 'current' ? document(root, status.path) : null;
  const inventory = inventoryDocument ? JSON.parse(inventoryDocument.content) as DesignInventory : null;
  return {
    schema: 'role-system-projection-v1', authority: 'observed-not-approved', status,
    inventory: inventoryDocument, document: status.status === 'current' ? document(root, DESIGN_INVENTORY_DOC_PATH) : null,
    decisions: document(root, '.omd/design-system-decisions.md'),
    committedTokens: document(root, '.omd/tokens.json'),
    components: inventory?.components.map(path => ({ id: path, path, variantCoverage: 'unverified' })) ?? [],
    observations: inventory?.observations ?? [], gaps: inventory?.gaps ?? [{ path: status.path, reason: status.status }],
    runtime: { status: runtime, inventory: runtime.status === 'current' ? document(root, runtime.path) : null,
      document: runtime.status === 'current' ? document(root, RUNTIME_INVENTORY_DOC) : null },
    precedence: ['current-user-and-brand-invariants', 'committed-tokens', 'authored-system-decisions', 'observed-not-approved'],
  };
}

/** Coordinator inventory is never forwarded to a blind reviewer. The isolated host combines the
 * one profile with its own closed, sanitized packet and binds both in its execution configuration. */
export function buildRoleBrief(root: string, stage: BriefStage, options: RoleBriefOptions, packRoot: string, invocation: ProjectRunInvocation) {
  if (!ROLES[options.role]?.includes(stage)) return fail(`${options.role} does not own/support ${stage}`);
  const profiled = Object.hasOwn(PROFILE_MODES, options.role);
  if (profiled && !options.mode) return fail('an explicit role mode is required');
  if (!profiled && options.mode !== undefined) return fail('this role has no mode');
  const profile = profiled ? loadRoleProfile(options.role, options.mode!, options.sourceRoot) : null;
  if (options.role === 'omd-eye') {
    return { schema: 'role-brief-v1', role: options.role, mode: options.mode, stage, profile,
      delivery: 'isolated-host-packet-required', inputs: [], images: [], owns: [],
      limitation: 'This profile projection contains no review evidence and cannot attest independent execution.' };
  }
  const route = readPersistedRoute(root, invocation);
  if (!route.strategy.roles.includes(options.role as never)) return fail('role is not selected by the current route');
  if (options.role === 'omd-hand' && options.mode !== (stage === 'production' ? 'source' : 'observer')) return fail('Hand mode must match source/observation stage');
  const brief = buildBrief(root, stage, packRoot, invocation);
  const maker = ['omd-art-director', 'omd-sketch', 'omd-typesetter', 'omd-composer', 'omd-hand'].includes(options.role);
  const gaps: string[] = [];
  let references: ReturnType<typeof readWholeScreenReferenceHandoff> | null = null;
  if (maker && existsSync(join(root, '.omd/reference-analysis.json'))) {
    try {
      references = readWholeScreenReferenceHandoff(root, options.role === 'omd-hand' ? 'hand' : options.role === 'omd-composer' ? 'composer' : 'concept',
        { sourceContractSha256: route.sourceContractSha256, request: route.request });
    } catch (error) { gaps.push(`Reference analysis excluded: ${error instanceof Error ? error.message : String(error)}`); }
  } else if (maker && route.references.decision === 'discover') gaps.push('Selected whole-screen reference analysis is missing; no grounded-reference claim.');
  let selected: ReturnType<typeof readCurrentCandidateSelection> | null = null;
  let tokens: ReturnType<typeof resolveSelectedTokens> | null = null;
  if (maker && brief.direction?.selectionStatus === 'current') {
    selected = readCurrentCandidateSelection(root);
    tokens = resolveSelectedTokens(root, selected);
  }
  let sketch: SketchBrief | null = null;
  let candidate: ReturnType<typeof checkCandidatePlan>['plan']['candidates'][number] | null = null;
  if (options.role === 'omd-sketch') {
    if (!route.sourceContract.processPolicy) return fail('legacy Sketch uses its historical contract, not a current study brief');
    sketch = parseSketchBrief(options.sketch);
    if (sketch.mode !== options.mode) return fail('Sketch profile and committed mode differ');
    const pointer = v.object(JSON.parse(v.readBytes(root, CANDIDATE_PLAN_PATH).toString('utf8')), ['schema', 'plan']);
    if (pointer.schema !== 'candidate-plan-pointer-v2' || v.digest(pointer.plan) !== v.digest(sketch.plan)) return fail('Sketch needs its current committed plan before source');
    const checked = checkCandidatePlan(root, JSON.parse(v.readReceipt(root, sketch.plan).toString('utf8')), route.sourceContractSha256);
    candidate = checked.plan.candidates.find(c => c.id === sketch!.candidateId) ?? fail('candidate absent from committed plan');
    // Expose only this hypothesis, not sibling source, tradeoffs or review scores.
  } else if (options.sketch !== undefined) return fail('only Sketch receives a sketch brief');
  const paths = options.role === 'omd-writer' ? ['.omd/copy-deck.md', '.omd/functional-requirements.json']
    : maker ? ['.omd/copy-deck.md', '.omd/functional-requirements.json',
      ...(stage === 'candidate-generation' ? [] : ['.omd/type-proof.md', '.omd/composition.md'])] : [];
  return {
    schema: 'role-brief-v1', role: options.role, mode: options.mode ?? null, stage, profile,
    delivery: 'owner-task-not-review-authority', sourceContractSha256: route.sourceContractSha256,
    request: route.request, taskOutcome: route.sourceContract.taskOutcome, evidenceClaims: route.sourceContract.evidenceClaims,
    writeScope: options.role === 'omd-hand' && options.mode === 'source' ? { allowedPaths: route.allowedPaths, namedDependencies: route.namedDependencies } : null,
    entryGate: brief.entryGate, blockers: brief.blockers, confidenceDebt: brief.confidenceDebt, gaps,
    owns: sketch ? [sketch.sourceDirectory] : brief.owns,
    scope: readFrame(root), inputs: paths.flatMap(path => { const doc = document(root, path); return doc ? [doc] : []; }),
    system: maker ? roleSystemProjection(root) : null, references,
    images: references && 'images' in references ? references.images : [],
    selectedDirection: selected ? { id: selected.selectedId, inputDigest: selected.inputDigest, decidedBy: selected.decision.decidedBy,
      source: selected.selectedSource, previews: selected.previews, effectiveBaseTokensSha256: selected.effectiveBaseTokensSha256 } : null,
    artDirection: isSelectedArtDirection(root) ? (() => {
      const art = readSelectedArtDirection(root, route.sourceContractSha256);
      return options.role === 'omd-writer' ? selectedArtCopyProjection(art) : maker ? art.decision : null;
    })() : null,
    tokens, sketch, candidate,
    candidateInputs: sketch ? (() => {
      const { plan } = checkCandidatePlan(root, JSON.parse(v.readReceipt(root, sketch.plan).toString('utf8')), route.sourceContractSha256);
      return { content: document(root, plan.content.receipt.path), tokens: document(root, plan.tokens.path), views: plan.views, representative: plan.representative };
    })() : null,
    contracts: brief.contracts, schemas: brief.schemas, checks: brief.judgedBy,
  };
}

export function checkRoleHandback(root: string, options: RoleBriefOptions, value: unknown, invocation: ProjectRunInvocation) {
  const route = readPersistedRoute(root, invocation);
  if (options.role !== 'omd-sketch' || !options.sketch || options.mode !== options.sketch.mode) return fail('study handback requires the exact Sketch task/mode');
  return checkCandidateStudy(root, options.sketch, value, route.sourceContractSha256);
}
