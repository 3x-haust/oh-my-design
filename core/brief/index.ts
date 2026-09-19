// What a stage actually needs, assembled from this project's own state.
//
// OMD used to answer "what do I do now" with prose: a ~19k-token coordinator skill plus hundreds of
// imperative sentences. That layer rots. Every model release changes prompt guidance, and nobody can
// tell which of those sentences stopped working without running the loop and watching it fail.
//
// A brief carries no instructions about how to reason. It carries four things that are true whatever
// model is reading them: what this stage owns, the evidence gathered for it, the contracts bound to
// it, and the commands that will judge its output. Those are derived from disk, so they cannot drift
// from reality, and a new model needs no new prose to use them.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { STAGES, resolveRunState, type StageId } from '../stage/contract.ts';
import { formatBrief } from './format.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { detectAppShell, renderTargetHint, type AppShell } from '../stack/shell.ts';
import { readPersistedRoute, type RouteRecord } from '../route/index.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { checkContentGrain, CONTENT_GRAIN_PATH } from '../content-grain/files.ts';
import { readFrame, type RealityLedger } from '../frame/index.ts';
import { buildReferenceDiscoveryPlan, type ReferenceDiscoveryPlan } from '../ref/discovery-plan.ts';
import {
  CANDIDATE_SELECTION_POINTER_PATH,
  resolveCandidateSelection,
  validateCandidateSelectionPointer,
} from './candidate-selection.ts';
import {
  CULTURAL_DESIGN_PROJECTION_POINTER_PATH,
  readCurrentCulturalDesignProfile,
} from '../locale/cultural-profile-files.ts';
import {
  REFERENCE_LOCALE_BINDING_PATH,
  referenceLocaleBindingSha256,
  validateReferenceLocaleBindingCurrentness,
} from '../ref/reference-locale-binding.ts';
import { readSelectedReferenceHandoff } from '../ref/selected-handoff.ts';
import type { ReferenceHandoffRole } from '../ref/reference-handoff.ts';
import { readPublishedReferenceResearch, validateReferenceResearch } from '../ref/reference-research.ts';
import { designInventoryStatus, DESIGN_INVENTORY_DOC_PATH } from '../tokens/inventory.ts';
import { loadRefs, refRecordPath } from '../ref/store.ts';

export {
  EVIDENCE_CLAIM_PUBLICATION_SCHEMA,
  EvidenceClaimError,
  parseEvidenceClaimPublication,
  type ConfirmedEvidenceClaim,
  type EvidenceClaim,
  type EvidenceClaimErrorCode,
  type EvidenceClaimPublication,
  type EvidenceClaimStatus,
  type ExplicitUserEvidence,
  type HypothesisEvidenceClaim,
  type TemporaryDecisionEvidenceClaim,
} from './evidence-claims.ts';

export { formatBrief } from './format.ts';

export {
  TASK_OUTCOME_CONTRACT_SCHEMA,
  TaskOutcomeContractError,
  parseTaskOutcomeContract,
  type TaskOutcomeContract,
  type TaskOutcomeContractErrorCode,
} from './task-outcome.ts';

/** Stages the route can name that are not artifact stages in `STAGES`. */
export const EXTRA_BRIEF_STAGES = ['candidate-generation', 'production', 'independent-review', 'review'] as const;
export type BriefStage = StageId | (typeof EXTRA_BRIEF_STAGES)[number];

/**
 * Where a stage brief is kept.
 *
 * A brief is what one owner was actually handed: its permitted inputs, the contracts it must obey,
 * and the checks that will judge it. It used to exist only for the length of one command, so a run
 * left no record of what any stage received — a gap when the question later is "what did Composer
 * have when it made that choice?".
 *
 * It lives under `.omd/briefs/` rather than at the record root because it is a derived view of a
 * stage, not a design artifact in its own right. One file per stage, overwritten as the stage is
 * re-entered, because the brief describes the CURRENT inputs and a stale copy would be worse than
 * none.
 */
export const BRIEF_DIRECTORY = '.omd/briefs';
export const briefPath = (stage: BriefStage): string => `${BRIEF_DIRECTORY}/${stage}.json`;
export const briefMarkdownPath = (stage: BriefStage): string => `${BRIEF_DIRECTORY}/${stage}.md`;

/**
 * A brief is evidence, not a reading list. A mature run holds a hundred captures; printing all of
 * them recreates the wall of text this command exists to replace, so the brief carries the ones
 * that actually carry a measured principle and reports the rest as a count.
 */
export const MAX_BRIEF_REFERENCES = 12;

export type BriefReference = {
  readonly path: string;
  readonly component: string;
  readonly slot: string | null;
  /** Measured principles — what this capture is evidence *for*. */
  readonly take: readonly string[];
};

export type BriefCheck = {
  readonly command: string;
  /** What a failure means, in one clause. Never advice on how to avoid it. */
  readonly fails: string;
};

export type Brief = {
  readonly existingDesignSystem?: ReturnType<typeof designInventoryStatus> | null;
  readonly stage: BriefStage;
  readonly owner: string;
  readonly owns: readonly string[];
  readonly route: {
    readonly deliveryMode?: 'design-only';
    readonly name: string;
    readonly projectMode: 'greenfield' | 'existing';
    readonly roles: readonly string[];
    readonly references: string;
  } | null;
  readonly contentGrain: {
    readonly path: typeof CONTENT_GRAIN_PATH;
    readonly schema: 'content-grain-v1';
    readonly status: 'active' | 'no-stable-grain';
    readonly sha256: string;
  } | null;
  /** Existing route policy only; never infer a candidate mode from absent authority or prose. */
  readonly designQuality: RouteRecord['behavior']['active']['designQuality'] | null;
  readonly localeDesign: {
    readonly decision: 'mechanics-only' | 'research';
    readonly contextPath: '.omd/locale-design-context.json';
    readonly contextSha256: string;
    readonly surfaceLocale: string;
    readonly marketRegion: string | null;
    readonly audience: string | null;
    readonly projection: null | Readonly<{
      readonly path: typeof CULTURAL_DESIGN_PROJECTION_POINTER_PATH;
      readonly sha256: string;
    }>;
    readonly referenceBinding: null | Readonly<{
      readonly path: typeof REFERENCE_LOCALE_BINDING_PATH;
      readonly sha256: string;
    }>;
  } | null;
  readonly reality: RealityLedger | null;
  readonly discovery: Readonly<{
    command: 'omd ref discover-plan --json';
    lanes: readonly string[];
    userUrlsRequired: false;
    motionEvidenceRequired: boolean;
  }> | null;
  readonly references: readonly BriefReference[];
  /** Coordinator export command; the raw inventory above is not the role-facing payload. */
  readonly referenceHandoff: Readonly<{
    command: string;
    role: ReferenceHandoffRole;
    sha256: string;
    pieces: number;
  }> | null;
  /** Captures gathered but not printed. `omd ref list` shows them all. */
  readonly referencesOmitted: number;
  readonly contracts: readonly { readonly path: string; readonly delivered: boolean }[];
  readonly schemas: readonly { readonly name: string; readonly command: string }[];
  readonly shell: { readonly kind: string; readonly target: string } | null;
  readonly judgedBy: readonly BriefCheck[];
  readonly prior: readonly string[];
  /** Missing inputs this stage cannot start without. */
  readonly blockers: readonly string[];
};

export function projectRealityForBrief(
  root: string,
  stage: BriefStage,
  projectMode: 'greenfield' | 'existing',
): Readonly<{ reality: RealityLedger | null; blocker: string | null }> {
  const consumer = (
    ['copy', 'composition', 'candidate-generation', 'production', 'independent-review', 'review'] as readonly BriefStage[]
  ).includes(stage);
  const reality = consumer ? readFrame(root)?.reality ?? null : null;
  const blocker = consumer && projectMode === 'greenfield' && reality === null
    ? 'greenfield reality ledger unavailable: run `omd frame set --reality <reality-ledger.json>`'
    : null;
  return Object.freeze({ reality, blocker });
}

const OWNER: Readonly<Record<string, string>> = {
  'candidate-generation': 'omd-sketch',
  production: 'omd-hand',
  'independent-review': 'omd-eye',
  review: 'omd-eye',
};
const OWNS: Readonly<Record<string, readonly string[]>> = {
  scout: ['.omd/scout.md', '.omd/refs/domain/research.json', '.omd/refs/design/research.json', '.omd/reference-research.json', '.omd/task-flow-benchmark.json'],
  'candidate-generation': ['structurally distinct UX candidates and selected model metadata'],
  production: ['production source (every file the surface ships)'],
  'independent-review': ['the independent review verdict returned to the coordinator'],
  review: ['the independent review verdict returned to the coordinator'],
};

/**
 * Which commands judge a stage. This is the acceptance contract: a stage owner should be able to
 * predict its own verdict, and a rule that is checked here never needs to be written as prose.
 */
const JUDGED_BY: Readonly<Record<string, readonly BriefCheck[]>> = {
  frame: [{ command: 'omd frame show', fails: 'the frame is missing a required field or its evidence' }],
  acquisition: [{ command: 'omd ref granularity --json', fails: 'a declared zone has no capture bound to it' }],
  scout: [
    { command: 'omd ref research-check --json', fails: 'either domain or design research is missing, reused across lanes, stale, or unbound to its current output' },
    { command: 'omd ref check', fails: 'the board is one-source, kinship-unresolved, low-signal, or zone-uncovered' },
    { command: 'omd ref audit', fails: 'captures were taken sequentially instead of in one batch' },
    { command: 'omd benchmark check', fails: 'applicable product research lacks multiple bounded real-service task flows or its source contract is stale' },
  ],
  'reference-board': [{ command: 'omd ref check', fails: 'board evidence or the saved selection is stale' }],
  copy: [
    { command: 'omd copy --check', fails: 'the deck is missing required structure or fact refs' },
    { command: 'omd locale check', fails: 'a declared locale has no Beat copy' },
  ],
  'type-proof': [{ command: 'omd check <specimen>', fails: 'type scale, leading, or contrast violates the committed ladders' }],
  composition: [
    { command: 'omd composition --check', fails: 'composition sections are incomplete or their inputs are stale' },
    { command: 'omd grain check --json', fails: 'selected Content Grain is missing, stale, or malformed' },
  ],
  'candidate-generation': [
    { command: 'omd composition --check', fails: 'candidate inputs are stale or composition is invalid' },
    { command: 'omd benchmark check', fails: 'candidate topology is not bound to the current task-flow benchmark' },
    { command: 'omd check <candidate>', fails: 'candidate tokens, accessibility, or slop rules are violated' },
  ],
  production: [
    { command: 'omd check <page> --no-log', fails: 'tokens, accessibility, or slop rules are violated' },
    { command: 'omd grain check --json', fails: 'selected Content Grain is missing, stale, or malformed' },
    { command: 'omd complete check <page>', fails: 'a declared affordance is absent, inert, or keyboard-unreachable' },
    { command: 'omd route check --activation <host-issued-invocation.json>', fails: 'a file was written outside the route scope' },
    { command: 'omd slop scan <root>', fails: 'source-level slop candidates need triage' },
  ],
  'independent-review': [{ command: 'omd check <page> --json', fails: 'the deterministic findings the verdict must account for' }],
  review: [{ command: 'omd check <page> --json', fails: 'the deterministic findings the verdict must account for' }],
};

/** Hand-authored inputs a stage owner writes, and the command that prints their exact shape. */
const SCHEMAS: Readonly<Record<string, readonly string[]>> = {
  domain: ['domain-brief'],
  depth: ['depth-input'],
  frame: ['functional-requirements', 'reality-ledger'],
  'content-grain': ['content-grain'],
  acquisition: ['functional-requirements'],
  'reference-board': ['reference-board', 'reference-locale-binding'],
  'art-direction': ['art-direction-check'],
  copy: ['locale-contract'],
  production: ['route-input'],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readRoute(root: string, invocation?: ProjectRunInvocation): RouteRecord | null {
  const path = join(root, '.omd', 'route.json');
  if (!existsSync(path)) return null;
  if (invocation === undefined) throw new Error('adaptive route authority is required');
  return readPersistedRoute(root, invocation);
}

/**
 * The captures gathered for this run, with the principle each one was kept for.
 *
 * A reference with its measured principle is the instruction. "Make it distinctive" is not.
 */
export function briefReferences(root: string): readonly BriefReference[] {
  return loadRefs(root).map(ref => ({
    path: relative(root, refRecordPath(root, ref)), component: ref.component,
    slot: ref.slot ?? null, take: ref.principles.filter((entry): entry is string => typeof entry === 'string'),
  })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function selectedCandidateEvidence(root: string): readonly string[] {
  const sketches = join(root, '.omd', '.cache', 'sketches');
  const pointerPath = join(root, CANDIDATE_SELECTION_POINTER_PATH);
  if (existsSync(pointerPath)) {
    try {
      return resolveCandidateSelection(
        root,
        validateCandidateSelectionPointer(JSON.parse(readFileSync(pointerPath, 'utf8'))),
      );
    } catch {
      return [];
    }
  }
  try {
    return readdirSync(sketches, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.endsWith('-selected'))
      .flatMap((entry) => ['index.html', 'noun-swap-test.json', 'selection.json', 'ux-models.json']
        .map((name) => `.omd/.cache/sketches/${entry.name}/${name}`)
        .filter((path) => existsSync(join(root, path))))
      .sort();
  } catch {
    return [];
  }
}

function selectedStageInputs(
  root: string,
  selectedStages: readonly string[],
  consumerStage: 'candidate-generation' | 'production',
): Readonly<{ present: readonly string[]; missing: readonly string[] }> {
  const consumerIndex = selectedStages.indexOf(consumerStage);
  const upstreamStages = consumerIndex < 0 ? selectedStages : selectedStages.slice(0, consumerIndex);
  const stageInputs = STAGES
    .filter((stage) => upstreamStages.includes(stage.id))
    .map((stage) => stage.artifact);
  const candidateInputs = upstreamStages.includes('candidate-generation')
    ? selectedCandidateEvidence(root)
    : [];
  const missing = stageInputs.filter((path) => !existsSync(join(root, path)));
  if (upstreamStages.includes('candidate-generation') && candidateInputs.length === 0) {
    missing.push('candidate-generation');
  }
  return Object.freeze({
    present: Object.freeze([...stageInputs.filter((path) => existsSync(join(root, path))), ...candidateInputs]),
    missing: Object.freeze(missing),
  });
}

/** Renders and probes an earlier round already produced, so a revision compares instead of guessing. */
function priorEvidence(root: string, selectedInputs: readonly string[]): readonly string[] {
  const durable = [
    '.omd/task-flow-benchmark-projection.json',
    '.omd/functional-requirements.json',
    ...selectedInputs,
  ].filter((path) => existsSync(join(root, path)));
  const dir = join(root, '.omd', '.cache');
  try {
    return [...durable, ...readdirSync(dir)
      .filter((name) =>
        /\.(png|json)$/.test(name)
        && /(render|desktop|mobile|shot|probe|filmstrip|review|squint|sharp|ir)/i.test(name))
      .sort()
      .slice(0, 8)
      .map((name) => `.omd/.cache/${name}`)];
  } catch {
    return durable;
  }
}

export function buildBrief(
  root: string,
  stage: BriefStage,
  packRoot = join(root, 'core'),
  invocation?: ProjectRunInvocation,
): Brief {
  const definition = STAGES.find((entry) => entry.id === stage);
  if (definition === undefined && !(EXTRA_BRIEF_STAGES as readonly string[]).includes(stage)) {
    throw new Error(`unknown stage ${stage}; known: ${[...STAGES.map((s) => s.id), ...EXTRA_BRIEF_STAGES].join(', ')}`);
  }

  const route = readRoute(root, invocation);
  const qualityStage = stage === 'review' ? 'independent-review' : stage;
  const designQualityConsumer = (
    ['art-direction', 'composition', 'candidate-generation', 'production', 'independent-review'] as readonly string[]
  ).includes(qualityStage);
  const designQuality = route !== null
    && designQualityConsumer
    && (route.strategy.stages as readonly string[]).includes(qualityStage)
    ? route.behavior.active.designQuality
    : null;
  const shell: AppShell = detectAppShell(root);
  const routeReferenceLimit = MAX_BRIEF_REFERENCES;
  const gathered = briefReferences(root);
  // A capture that recorded a measured principle is usable evidence; one that did not is a file path.
  const ranked = [...gathered].sort((left, right) => right.take.length - left.take.length);
  const references = ranked.slice(0, routeReferenceLimit);
  const contracts = definition === undefined
    ? []
    : (() => {
      const state = resolveRunState(root, packRoot, invocation);
      const stageState = state.stages.find((entry) => entry.stage === definition.id);
      return definition.requiredContracts.map((path) => ({
        path,
        delivered: stageState?.delivered.includes(path) ?? false,
      }));
    })();

  const blockers: string[] = [];
  const inventoryStatus = designInventoryStatus(root);
  const existingDesignSystem = inventoryStatus.status === 'missing' ? null : inventoryStatus;
  const inventoryConsumer = ['art-direction', 'composition', 'candidate-generation', 'production'].includes(stage);
  if (inventoryConsumer && existingDesignSystem && existingDesignSystem.status !== 'current') {
    blockers.push(`existing design inventory ${existingDesignSystem.status}: inspect source changes and run omd init --refresh`);
  }
  let referenceHandoff: Brief['referenceHandoff'] = null;
  const handoffRole: ReferenceHandoffRole | undefined = stage === 'art-direction' ? 'art-direction'
    : stage === 'composition' || stage === 'candidate-generation' ? 'composer'
      : stage === 'production' ? 'hand' : undefined;
  const selectedArtDirection = route === null ? existsSync(join(root, '.omd/art-direction.json'))
    : route.strategy.stages.includes('art-direction');
  if (handoffRole !== undefined && (handoffRole === 'art-direction' || selectedArtDirection)
    && existsSync(join(root, '.omd/reference-pre-selection-v2.json'))) {
    try {
      const payload = readSelectedReferenceHandoff(root, handoffRole);
      referenceHandoff = {
        command: `omd ref handoff ${handoffRole} --json`, role: handoffRole,
        sha256: payload.sha256, pieces: payload.pieces.length,
      };
    } catch {
      blockers.push(`selected reference handoff unavailable: omd ref handoff ${handoffRole} --json`);
    }
  }
  let discoveryPlan: ReferenceDiscoveryPlan | null = null;
  if (route?.references.decision === 'discover' && ['frame', 'acquisition', 'scout', 'reference-board'].includes(stage)) {
    try { discoveryPlan = buildReferenceDiscoveryPlan(root, route); }
    catch (error) { blockers.push(error instanceof Error ? error.message : String(error)); }
  }
  if (route === null) blockers.push('no route: run `omd route validate --input <route-input.json>`, repair named input errors, then `omd route classify --input <route-input.json>`; Pi/local CLI does not require an external activation file');
  if (route?.deliveryMode === 'design-only' && ['production', 'browser-evidence'].includes(stage)) {
    blockers.push('design-only route forbids application implementation; finish the design handoff instead');
  }
  if (definition !== undefined) {
    for (const contract of contracts) {
      if (!contract.delivered) blockers.push(`contract not delivered: omd stage deliver --stage ${definition.id} --contract ${contract.path}`);
    }
  }
  if (stage === 'production' && route?.references.decision === 'discover' && references.length === 0) {
    blockers.push('selected reference discovery has no gathered evidence');
  }
  const selectedInputs = (stage === 'candidate-generation' || stage === 'production') && route !== null
    ? selectedStageInputs(root, route.strategy.stages, stage)
    : Object.freeze({ present: Object.freeze([]), missing: Object.freeze([]) });
  for (const path of selectedInputs.missing) {
    blockers.push(`selected ${stage} input missing: ${path}`);
  }
  const judgmentPath = '.omd/design-judgment.json';
  const judgmentConsumer = stage === 'composition' || stage === 'candidate-generation' || stage === 'production';
  if (judgmentConsumer && route && (route.gates.includes('dual-reference-research')
    || (route.projectMode === 'greenfield' && existsSync(join(root, '.omd/reference-research.json'))))) {
    const researchPath = join(root, '.omd/reference-research.json');
    try {
      if (!existsSync(researchPath)) throw new Error('missing');
      const research = readPublishedReferenceResearch(root);
      validateReferenceResearch(root, research, {
        expectedSourceContractSha256: route.sourceContractSha256,
        benchmarkRequired: route.gates.includes('greenfield-task-flow-benchmark'),
      });
    } catch (error) {
      blockers.push(`selected ${stage} input missing or stale: .omd/reference-research.json — complete and verify both domain-reference and design-reference lanes (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  const hasReferenceBoard = existsSync(join(root, '.omd/reference-board.json'));
  const referenceDirectory = join(root, '.omd/refs');
  const hasReferenceEvidence = hasReferenceBoard && existsSync(referenceDirectory)
    && readdirSync(referenceDirectory).some((entry) => !entry.startsWith('.'));
  const greenfieldReferenceConsumer = route?.projectMode === 'greenfield' && judgmentConsumer;
  if (greenfieldReferenceConsumer && !hasReferenceEvidence) {
    blockers.push(`selected ${stage} input missing: visual reference evidence under .omd/refs/ and .omd/reference-board.json — discover and interpret references before composition`);
  }
  const judgmentPresent = judgmentConsumer && hasReferenceBoard && existsSync(join(root, judgmentPath));
  if (judgmentConsumer && hasReferenceBoard && !judgmentPresent) {
    blockers.push(`selected ${stage} input missing: ${judgmentPath} — interpret the observations before applying them`);
  }
  const copyReviewPath = '.omd/.cache/copy-eye.md';
  const copyReviewRequired = stage === 'production'
    && route?.behavior.active.copyRepairWorkflow.status === 'selected';
  const copyReviewPresent = copyReviewRequired && existsSync(join(root, copyReviewPath));
  if (copyReviewRequired && !copyReviewPresent) {
    blockers.push(`selected production input missing: ${copyReviewPath}`);
  }
  const contentGrainConsumer = (
    ['composition', 'candidate-generation', 'production', 'independent-review', 'review'] as readonly BriefStage[]
  ).includes(stage);
  let contentGrain: Brief['contentGrain'] = null;
  if (contentGrainConsumer && route?.strategy.stages.includes('content-grain')) {
    try {
      const current = checkContentGrain(root);
      contentGrain = {
        path: CONTENT_GRAIN_PATH,
        schema: 'content-grain-v1',
        status: current.status,
        sha256: current.grainSha256,
      };
    } catch (error) {
      blockers.push(`content grain unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const localeRoute = route?.sourceContract.localeDesign;
  const localeProjectionConsumer = (
    ['composition', 'candidate-generation', 'production', 'independent-review', 'review'] as readonly BriefStage[]
  ).includes(stage);
  let localeDesign: Brief['localeDesign'] = localeRoute === undefined ? null : {
    decision: localeRoute.decision as 'mechanics-only' | 'research',
    contextPath: '.omd/locale-design-context.json',
    contextSha256: localeRoute.contextSha256,
    surfaceLocale: localeRoute.context.surfaceLocale,
    marketRegion: localeRoute.context.marketRegion,
    audience: localeRoute.context.audience,
    projection: null,
    referenceBinding: null,
  };
  if (localeRoute?.decision === 'research' && localeProjectionConsumer) {
    try {
      if (invocation === undefined) throw new Error('adaptive route authority is required');
      const current = readCurrentCulturalDesignProfile(root, invocation);
      localeDesign = {
        ...localeDesign!,
        projection: {
          path: CULTURAL_DESIGN_PROJECTION_POINTER_PATH,
          sha256: current.projectionSha256,
        },
      };
    } catch (error) {
      blockers.push(`cultural design projection unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (route?.strategy.stages.includes('reference-board')
      && existsSync(join(root, '.omd', 'reference-board.json'))) {
      try {
        const binding = validateReferenceLocaleBindingCurrentness(root);
        localeDesign = {
          ...localeDesign!,
          referenceBinding: {
            path: REFERENCE_LOCALE_BINDING_PATH,
            sha256: referenceLocaleBindingSha256(binding.projection),
          },
        };
      } catch (error) {
        blockers.push(`locale reference binding unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  const projectedReality = projectRealityForBrief(root, stage, route?.projectMode ?? 'existing');
  if (projectedReality.blocker !== null) blockers.push(projectedReality.blocker);
  const designReview = route?.deliveryMode === 'design-only' && ['independent-review', 'review'].includes(stage);
  const judgedBy = (designReview
    ? [{ command: 'omd completion design-check --input .omd/design-handoff.json --json', fails: 'design artifacts, reference evidence or write scope are missing or stale; this check does not attest review independence or application behavior' }]
    : JUDGED_BY[stage] ?? []).filter((check) =>
    (
      check.command !== 'omd grain check --json'
      || route === null
      || route.strategy.stages.includes('content-grain')
    )
    && (
      check.command !== 'omd locale check'
      || existsSync(join(root, '.omd', 'locale.json'))
    )
  );
  const localeJudgedBy = localeRoute?.decision === 'research' && localeProjectionConsumer
    ? [{
      command: 'omd locale profile-check --activation <host-issued-invocation.json>',
      fails: 'the cultural profile, type proof, source bytes, remote source, or sanitized projection is stale',
    }]
    : [];
  const localeReferenceJudgedBy = localeRoute?.decision === 'research'
    && localeProjectionConsumer
    && route?.strategy.stages.includes('reference-board')
    ? [{
      command: 'omd ref locale-bind-check --json',
      fails: 'a local reference piece is not bound to the current profile decision, source receipt, board, or locale context',
    }]
    : [];

  return {
    stage,
    existingDesignSystem,
    owner: definition?.owner ?? OWNER[stage] ?? 'coordinator',
    owns: designReview ? ['.omd/design/review.md'] : definition === undefined ? OWNS[stage] ?? [] : [definition.artifact],
    route: route === null ? null : {
      name: route.route,
      ...(route.deliveryMode === undefined ? {} : { deliveryMode: route.deliveryMode }),
      projectMode: route.projectMode,
      roles: route.strategy.roles,
      references: route.references.decision === 'discover'
        ? `discover — ${route.references.intended}`
        : `skip — ${route.references.actual.description}`,
    },
    contentGrain,
    designQuality,
    localeDesign,
    reality: projectedReality.reality,
    discovery: discoveryPlan === null ? null : {
      command: 'omd ref discover-plan --json',
      lanes: discoveryPlan.lanes.map(lane => lane.id),
      userUrlsRequired: false,
      motionEvidenceRequired: discoveryPlan.motionEvidenceRequired,
    },
    references,
    referenceHandoff,
    referencesOmitted: gathered.length - references.length,
    contracts,
    schemas: (designReview ? ['design-handoff'] : SCHEMAS[stage] ?? []).map((name) => ({ name, command: `omd schema ${name}` })),
    shell: shell.kind === 'browser' ? null : { kind: shell.kind, target: renderTargetHint(shell) },
    judgedBy: [...judgedBy, ...localeJudgedBy, ...localeReferenceJudgedBy],
    prior: priorEvidence(root, [
      ...(existingDesignSystem?.status === 'current' && inventoryConsumer ? [existingDesignSystem.path, DESIGN_INVENTORY_DOC_PATH,
        ...(existsSync(join(root, '.omd/design-system-decisions.md')) ? ['.omd/design-system-decisions.md'] : [])] : []),
      ...selectedInputs.present,
      ...(judgmentPresent ? [judgmentPath] : []),
      ...(localeDesign?.projection === null || localeDesign === null ? [] : [localeDesign.projection.path]),
      ...(localeDesign?.referenceBinding === null || localeDesign === null ? [] : [localeDesign.referenceBinding.path]),
      ...(copyReviewPresent ? [copyReviewPath] : []),
    ]),
    blockers,
  };
}

/**
 * Persists the brief a stage was handed, so the run keeps a record of what each owner received.
 * Written through the project-write adapter like every other project mutation.
 *
 * Both forms are written: the JSON is what a later command reads, and the markdown is what a human
 * reads when asking why a stage made the choice it did.
 */
export function writeBrief(
  root: string,
  brief: Brief,
  adapter: ProjectWriteAdapter,
): Readonly<{ json: string; markdown: string }> {
  const json = adapter.write(briefPath(brief.stage), `${JSON.stringify(brief, null, 2)}\n`);
  const markdown = adapter.write(briefMarkdownPath(brief.stage), formatBrief(brief));
  return Object.freeze({ json, markdown });
}

/** Reads a persisted brief back. Returns null when the stage has never run in this project. */
export function readBrief(root: string, stage: BriefStage): Brief | null {
  const path = join(root, briefPath(stage));
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Brief;
  } catch {
    return null;
  }
}
