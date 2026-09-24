#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { accessSync, closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname, basename, isAbsolute, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stringify } from 'yaml';
import { extractPackSections, PackSectionError } from '../core/pack-sections.ts';
import { parseRealityLedger, readFrame } from '../core/frame/index.ts';
import { writeFrameRecord, reframe, setGenerator, logDecision, logChoice, logTaste, tasteProfile } from '../core/frame/write.ts';
import { logRun, readHistory } from '../core/history/index.ts';
import { analyse } from '../core/coach/index.ts';
import { findLeakedRationale } from '../core/rules/leakage.ts';
import { checkAttribution } from '../core/rules/attribution.ts';
import { checkMotionSpec } from '../core/rules/motion-spec.ts';
import { contextualCheckViolations } from '../core/rules/applicability.ts';
import {
  CANDIDATE_SELECTION_POINTER_PATH,
  resolveCandidateSelection,
  validateCandidateSelectionPointer,
} from '../core/brief/candidate-selection.ts';
import { discoverEvidence, generateDesignMd, validateDesignMd } from '../core/design/index.ts';
import {
  checkContentGrain,
  publishContentFitReceipt,
  publishContentGrain,
  readContentFitReceipt,
} from '../core/content-grain/files.ts';
import { validateCopyDeck, validateCopyDeckV2, validateCopyDeckV2AgainstSelectedArtDirection, validateCopyReviewReportForDeck, validateCurrentCopyReview } from '../core/copy/index.ts';
import { checkInteractionStates } from '../core/design/interaction-states.ts';
import { checkFrameUx } from '../core/frame/check-ux.ts';
import { scanSlopSource } from '../core/slop/index.ts';
import { validateCompositionContract } from '../core/composition-contract/index.ts';
import { validateSourceBoundProofCurrentness } from '../core/composition-contract/source-currentness.ts';
import { servedProjectTreeSha256 } from '../core/render/serve.ts';
import { validateSettledCaptureReceipt } from '../core/evidence/settled-capture-receipt.ts';
import { validateOpticalAdmission } from '../core/evidence/optical-admission.ts';
import { validateAnonymousCandidatePacket } from '../core/evidence/anonymous-candidate-packet.ts';
import { validateSourceSeal, writeSourceSeal } from '../core/source-seal/index.ts';
import { checkFinalEvidence } from '../core/evidence/final.ts';
import { checkTaskEvidence, publishTaskEvidence } from '../core/evidence/task.ts';
import { computeStack } from '../core/stack/index.ts';
import { bridgeGlobals, renderTargetHint } from '../core/stack/shell.ts';
import { scanTextSlop } from '../core/slop/text-slop.ts';
import { validateDomainBrief, unconfirmedPlanningStatements } from '../core/domain/domain-brief.ts';
import { validateReferenceCraft, verifyCraftReproduction } from '../core/ref/reference-craft.ts';
import { evaluateLighthouse, type LighthouseBudget } from '../core/perf/lighthouse.ts';
import { evaluateVisualRichness } from '../core/composition-contract/visual-richness.ts';
import type { VisualRichnessRegister } from '../core/composition-contract/visual-richness.ts';
import type { Category, EnergyCurve, Layer, RawIr, Violation } from '../core/types.ts';
import {
  ART_DIRECTION_CHECK_INPUT_KEYS,
  ART_DIRECTION_POINTER_SCHEMA_VERSION,
  ART_DIRECTION_RECORD_SCHEMA_VERSION,
  artDirectionSha256,
  validateArtDirectionPointer,
  validateArtDirectionRecord,
  validateArtDirectionDecisionShape,
} from '../core/art-direction/schema.ts';
import { beatBudgetForRegister, canonicalArtDirectionReferences, exceedsCanonicalBeatBudget, NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256, recipeDecisionProjectionSha256, resolveMarketingArtDirection, type ApprovedMotionRecipeReceipt, type ArtDirectionEligibility } from '../core/art-direction/decision.ts';
import { validateActivationContext } from '../core/runtime/activation.ts';
import { codexBrowserRoleFromEnvironment, isBrokeredBrowserCliOperation } from '../core/runtime/codex-browser-operation.ts';
import { createLocalCliInvocation, requireCurrentIntentLedgerAuthorization, requireCurrentUserIntentEventAuthorization, requireFinalEvidenceManifestAuthorization, requireFinalReviewerLaneAuthorization, requireStaticEvidenceResultAuthorization, requireStaticReviewReceiptAuthorization, validateCurrentProjectRun, type ProjectRunInvocation } from '../core/runtime/invocation.ts';
import { acquireProjectLock, acquireProjectMutationLock, createExternalObservationDirectory, createProjectWriteAdapter, replaceProjectFileAtomically, writeContentAddressedProjectFile, writeExternalObservationFile, writeImmutableProjectFile, type ExternalObservationKind, type ProjectWriteAdapter } from '../core/runtime/project-write.ts';
import { eventHash, intentLedgerSha256, resolveCurrentUserBeatExceptionReceipt, serializeIntentLedger, validateIntentCurrentPointer, validateIntentLedger } from '../core/runtime/intent.ts';
import { parseReferenceHandoffReceipt, validateDecisionBoundReferenceHandoffs, validateReferenceHandoffCurrentness } from '../core/ref/reference-handoff.ts';
import { parseReferenceSelectionV2, projectRunInvocationSha256, readContainedRegularFile, referenceSelectionV2Sha256, resolveMotionProjection, validatePreReferenceSelectionV2 } from '../core/ref/reference-selection.ts';
import { referenceUsageV2Sha256, validateReferenceUsage } from '../core/ref/reference-usage.ts';
import { canonicalJson, sha256 } from '../core/ref/board-artifacts.ts';
import { commitAiAssetDecision } from '../core/asset-sourcing/ai-decision.ts';
import { checkProductionReadiness } from '../core/runtime/production-reference-gate.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { publishFirstRenderCheck } from '../core/design/first-render-evidence.ts';
import { publishDesignJudgment, readDesignJudgment, DESIGN_JUDGMENT_PATH } from '../core/design/judgment-files.ts';
import { checkCurrentDesignJudgment, designJudgmentInput } from '../core/design/current-judgment.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Opts {
  _: string[];
  refresh?: boolean;
  json?: boolean;
  ir?: string;
  layer?: string;
  out?: string;
  output?: string;
  agent?: string;
  candidate?: string;
  stack?: string;
  viewport?: string;
  preparation?: string;
  lane?: string;
  problem?: string;
  reframe?: string;
  why?: string;
  category?: string;
  set?: string;
  chose?: string;
  to?: string;
  because?: string;
  as?: string;
  technique?: string;
  add?: string;
  noLog?: boolean;
  /** Skip the energy (motion) capture on `omd ref add` — one fewer browser launch for non-motion refs. */
  noEnergy?: boolean;
  /** Record a reference without its image. Requires `--no-shot-reason`. */
  noShot?: boolean;
  /** Why the image was omitted; a bare omission would be unverifiable later. */
  noShotReason?: string;
  /** Corpus of measured pages a composite score compares against. */
  corpus?: string;
  /** Moodboard direction line (`omd ref mood add --direction`). */
  direction?: string;
  /** Felt-quality phrase for a mood item; repeat for each. */
  quality?: string | string[];
  /** Source page URL for a mood capture. */
  source?: string;
  selector?: string;
  image?: boolean;
  filmstrip?: boolean;
  squint?: boolean;
  fullPage?: boolean;
  fromUser?: boolean;
  all?: boolean;
  plan?: string;
  render?: string;
  observed?: string;
  changed?: string;
  decision?: string;
  criterion?: string;
  reason?: string;
  kind?: string;
  evidence?: string;
  aiAssetId?: string;
  project?: string;
  manifest?: string;
  prompt?: string;
  provider?: string;
  zones?: string;
  input?: string;
  sourceSha?: string;
  review?: string;
  mirror?: string;
  ownerReceipt?: string;
  phase?: string;
  activation?: string;
  /** Capture a full-resolution structural blueprint of the selected component. */
  blueprint?: boolean;
  /** Persist a scoped component screenshot alongside its blueprint (`omd ref add --selector … --shot`). */
  shot?: boolean;
  /** Directory of pages for cross-page site consistency check (`omd check --site <dir>`). */
  site?: string;
  /** Similarity threshold for `omd figma diff` / `omd target diff` (0–1, default 0.97). */
  threshold?: string;
  /** Route the emitted art-direction check payload targets (`omd art-direction check-input --route /`). */
  route?: string;
  /** Stage a contract is delivered to (`omd stage deliver --stage art-direction`). */
  stage?: string;
  /** Pack-relative contract path delivered to a stage (`--contract protocol/copy-deck.md`). */
  contract?: string;
  /** Per-stage token ceiling for `omd stage cost --max-stage-tokens`. */
  maxStageTokens?: string;
  /** Whole-run token ceiling for `omd stage cost --max-run-tokens`. */
  maxRunTokens?: string;
  /** Whole-run wall-clock ceiling in minutes for `omd stage cost --max-run-minutes`. */
  maxRunMinutes?: string;
  /** File path a cue is resolved for (`omd cue --path src/landing/Hero.tsx`). */
  path?: string;
  /** Code symbol a cue is resolved for (`omd cue --symbol Dialog`). */
  symbol?: string;
  /** Typed brief field a cue is resolved for (`omd cue --field surface=marketing`). */
  field?: string;
  /** Copy deck the locale gate binds against (`omd locale check --deck .omd/copy-deck.md`). */
  deck?: string;
  /** Canonical locale-design context bound into adaptive routing (`omd route classify --locale-context .omd/locale-design-context.json`). */
  localeContext?: string;
  /** HTTPS source URL fetched and bound into locale evidence (`omd locale source-capture --url ...`). */
  url?: string;
  /** Force re-export even when a cached Figma export exists (`omd figma diff --fresh`). */
  fresh?: boolean;
  /** Named visual target to diff against (`omd target diff --target <name>`). */
  target?: string;
  /** Validate design.md sections rather than discover/generate (`omd design --check`). */
  check?: boolean;
  /** Validate the preserved copy-eye report structure (`omd copy --review-check`). */
  reviewCheck?: boolean;
  /** UX anchor: what task does the user arrive with? (`omd frame set --task "..."`) */
  task?: string;
  /** UX anchor: most frequent action on the primary screen. (`omd frame set --frequent-action "..."`) */
  frequentAction?: string;
  /** UX anchor: costliest error and its recovery path. (`omd frame set --costliest-error "..."`) */
  costliestError?: string;
  /** UX anchor: surface classification — marketing | product | editorial | mixed. (`omd frame set --surface "..."`) */
  surface?: string;
  /** The composition zone a capture is evidence for (`omd ref add … --slot hero`), named by the framer's acquisition plan. */
  slot?: string;
  production?: string;
  /** Page to compare against the committed tokens (`omd tokens check --page <page>`). */
  page?: string;
  /** Lighthouse report path for `omd award score --lighthouse <report.json>`. */
  lighthouse?: string;
  /** Reference directory for `omd craft-usage` (default `<cwd>/.omd/refs`). */
  refs?: string;
  /** Task coverage matrix rows for product or mixed surfaces. (`omd frame set --task-matrix "T1 …"`) */
  taskMatrix?: string;
  reality?: string;
  entrySurface?: string;
  entry?: string;
  /** Render desktop+mobile fixed and full-page proofs in one browser (`omd render <page> --proofs -o <prefix>`). */
  proofs?: boolean;
  /** Register override for `omd visual-richness --register quiet|confident|showpiece`. */
  register?: string;
  /** Lighthouse performance gate budget (`omd lighthouse <report.json> --min-performance 0.9 --max-lcp 2500 --max-tbt 200 --max-cls 0.1`). */
  minPerformance?: string;
  maxLcp?: string;
  maxTbt?: string;
  maxCls?: string;
  /** Apply v2 garbage collection; without this flag, collection is a dry run. */
  apply?: boolean;
  /** Explicitly request v2 garbage collection's default dry-run mode. */
  dryRun?: boolean;
  /** `omd clean --cache` — drop reproducible scratch. */
  cache?: boolean;
  /** `omd clean --stale-records` — drop retired scratch and unreferenced immutable records. */
  staleRecords?: boolean;
  /** `omd status --files` — the storage view rather than the run view. */
  files?: boolean;
  selected?: boolean;
  gate?: boolean;
  publish?: boolean;
}

const FLAGS = new Set(['json', 'no-log', 'no-energy', 'no-shot', 'image', 'filmstrip', 'squint', 'full-page', 'from-user', 'all', 'blueprint', 'shot', 'proofs', 'fresh', 'check', 'refresh', 'review-check', 'apply', 'dry-run', 'cache', 'stale-records', 'files', 'selected', 'gate', 'publish']);
const ALIASES: Record<string, keyof Opts> = {
  o: 'out',
  'no-log': 'noLog',
  'no-energy': 'noEnergy',
  'no-shot': 'noShot',
  'no-shot-reason': 'noShotReason',
  'from-user': 'fromUser',
  'full-page': 'fullPage',
  'frequent-action': 'frequentAction',
  'costliest-error': 'costliestError',
  'review-check': 'reviewCheck',
  'task-matrix': 'taskMatrix',
  'min-performance': 'minPerformance',
  'max-lcp': 'maxLcp',
  'max-tbt': 'maxTbt',
  'max-cls': 'maxCls',
  'max-stage-tokens': 'maxStageTokens',
  'max-run-tokens': 'maxRunTokens',
  'max-run-minutes': 'maxRunMinutes',
  'dry-run': 'dryRun',
  'stale-records': 'staleRecords',
  'locale-context': 'localeContext',
  'ai-asset-id': 'aiAssetId',
  'entry-surface': 'entrySurface',
  'owner-receipt': 'ownerReceipt',
};

function parseArgs(args: string[]): Opts {
  const opts: Opts = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith('-')) {
      opts._.push(arg);
      continue;
    }
    const name = arg.replace(/^--?/, '');
    const key = ALIASES[name] ?? (name as keyof Opts);
    const bag = opts as unknown as Record<string, unknown>;
    if (FLAGS.has(name)) bag[key] = true;
    else {
      const value = args[++i];
      // Repeatable flags accumulate instead of overwriting: `--quality warm --quality quiet` must
      // keep both, or a caller silently loses every entry but the last.
      const previous = bag[key];
      bag[key] = previous === undefined ? value
        : Array.isArray(previous) ? [...previous, value] : [previous, value];
    }
  }
  return opts;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
type ClosedEvaluatorMotionResolution = {
  readonly motionDecision: 'one' | 'none';
  readonly slots: readonly {
    readonly slotId: string;
    readonly obligationDisposition: 'used' | 'rejected';
    readonly obligationReason: string;
  }[];
  readonly approvedRecipe?: { readonly recipeId: string; readonly recipeSha256: string };
};
type ClosedEvaluatorResult = {
  readonly winner: string;
  readonly alternativesSha256: string;
  readonly motionResolution: ClosedEvaluatorMotionResolution;
  readonly approvedMotionRecipeReceipt?: ApprovedMotionRecipeReceipt;
  readonly approvedMotionRecipe?: unknown;
};

function evaluatorResultError(reason: string): never {
  throw new Error(`ART_DIRECTION_EVALUATOR_RESULT_INVALID: ${reason}`);
}
function nonEmptyString(value: unknown, label: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : evaluatorResultError(`${label} must be a non-empty string`);
}
function digest(value: unknown, label: string): string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : evaluatorResultError(`${label} must be a SHA-256 digest`);
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (keys.length !== sortedExpected.length || keys.some((key, index) => key !== sortedExpected[index])) evaluatorResultError(`${label} has unknown or missing keys: expected ${sortedExpected.join(',')}; received ${keys.join(',')}`);
}
function parseClosedEvaluatorResult(value: unknown, alternativesSha256: string): ClosedEvaluatorResult {
  if (!isRecord(value)) evaluatorResultError('result must be an object');
  const result = value;
  const hasRecipe = Object.hasOwn(result, 'approvedMotionRecipe');
  if (hasRecipe !== Object.hasOwn(result, 'approvedMotionRecipeReceipt')) evaluatorResultError('approved recipe payload and receipt must be supplied together');
  exactKeys(result, hasRecipe
    ? ['alternativesSha256', 'approvedMotionRecipe', 'approvedMotionRecipeReceipt', 'boardSha256', 'handoffSha256', 'intentSha256', 'motionResolution', 'preSelectionSha256', 'route', 'taskIds', 'winner']
    : ['alternativesSha256', 'boardSha256', 'handoffSha256', 'intentSha256', 'motionResolution', 'preSelectionSha256', 'route', 'taskIds', 'winner'], 'result');
  if (digest(result.alternativesSha256, 'alternativesSha256') !== alternativesSha256) evaluatorResultError('result must bind the exact alternatives');
  if (!isRecord(result.motionResolution)) evaluatorResultError('motionResolution must be an object');
  const resolution = result.motionResolution;
  const hasApprovedRecipe = Object.hasOwn(resolution, 'approvedRecipe');
  exactKeys(resolution, hasApprovedRecipe ? ['approvedRecipe', 'motionDecision', 'slots'] : ['motionDecision', 'slots'], 'motionResolution');
  const motionDecision = resolution.motionDecision === 'one' || resolution.motionDecision === 'none'
    ? resolution.motionDecision : evaluatorResultError('motionResolution.motionDecision must be one or none');
  if (!Array.isArray(resolution.slots)) evaluatorResultError('motionResolution.slots must be an array');
  const slots: ClosedEvaluatorMotionResolution['slots'] = resolution.slots.map((entry, index) => {
    if (!isRecord(entry)) evaluatorResultError(`motionResolution.slots[${index}] must be an object`);
    exactKeys(entry, ['obligationDisposition', 'obligationReason', 'slotId'], `motionResolution.slots[${index}]`);
    const obligationDisposition = entry.obligationDisposition === 'used' || entry.obligationDisposition === 'rejected'
      ? entry.obligationDisposition : evaluatorResultError(`motionResolution.slots[${index}].obligationDisposition must be used or rejected`);
    return {
      slotId: nonEmptyString(entry.slotId, `motionResolution.slots[${index}].slotId`),
      obligationDisposition,
      obligationReason: nonEmptyString(entry.obligationReason, `motionResolution.slots[${index}].obligationReason`),
    };
  });
  if (new Set(slots.map((slot) => slot.slotId)).size !== slots.length) evaluatorResultError('motionResolution.slots must not contain duplicate slot IDs');
  const approvedRecipe = hasApprovedRecipe ? (() => {
    if (!isRecord(resolution.approvedRecipe)) evaluatorResultError('motionResolution.approvedRecipe must be an object');
    exactKeys(resolution.approvedRecipe, ['recipeId', 'recipeSha256'], 'motionResolution.approvedRecipe');
    return {
      recipeId: nonEmptyString(resolution.approvedRecipe.recipeId, 'motionResolution.approvedRecipe.recipeId'),
      recipeSha256: digest(resolution.approvedRecipe.recipeSha256, 'motionResolution.approvedRecipe.recipeSha256'),
    };
  })() : undefined;
  if (motionDecision === 'none' && approvedRecipe !== undefined) evaluatorResultError('none cannot select an approved recipe');
  if (motionDecision === 'one' && approvedRecipe === undefined && slots.filter((slot) => slot.obligationDisposition === 'used').length !== 1) evaluatorResultError('one must select exactly one reference motion slot');
  if (motionDecision === 'one' && approvedRecipe !== undefined && slots.some((slot) => slot.obligationDisposition !== 'rejected')) evaluatorResultError('a recipe-backed one must reject every reference motion slot');
  if (motionDecision === 'none' && slots.some((slot) => slot.obligationDisposition !== 'rejected')) evaluatorResultError('none must reject every reference motion slot');
  const receipt = hasRecipe ? (() => {
    if (!isRecord(result.approvedMotionRecipeReceipt)) evaluatorResultError('approvedMotionRecipeReceipt must be an object');
    exactKeys(result.approvedMotionRecipeReceipt, ['activationSha256', 'buildSha256', 'decisionSha256', 'recipeBytes', 'recipeId', 'recipeSha256'], 'approvedMotionRecipeReceipt');
    return {
      recipeId: nonEmptyString(result.approvedMotionRecipeReceipt.recipeId, 'approvedMotionRecipeReceipt.recipeId'),
      recipeBytes: nonEmptyString(result.approvedMotionRecipeReceipt.recipeBytes, 'approvedMotionRecipeReceipt.recipeBytes'),
      recipeSha256: digest(result.approvedMotionRecipeReceipt.recipeSha256, 'approvedMotionRecipeReceipt.recipeSha256'),
      activationSha256: digest(result.approvedMotionRecipeReceipt.activationSha256, 'approvedMotionRecipeReceipt.activationSha256'),
      buildSha256: digest(result.approvedMotionRecipeReceipt.buildSha256, 'approvedMotionRecipeReceipt.buildSha256'),
      decisionSha256: digest(result.approvedMotionRecipeReceipt.decisionSha256, 'approvedMotionRecipeReceipt.decisionSha256'),
    };
  })() : undefined;
  if (approvedRecipe === undefined && receipt !== undefined) evaluatorResultError('approved recipe settlement must match its receipt');
  if (approvedRecipe !== undefined) {
    if (receipt === undefined || approvedRecipe.recipeId !== receipt.recipeId || approvedRecipe.recipeSha256 !== receipt.recipeSha256) {
      evaluatorResultError('approved recipe settlement must match its receipt');
    }
  }
  return { winner: nonEmptyString(result.winner, 'winner'), alternativesSha256, motionResolution: { motionDecision, slots, ...(approvedRecipe === undefined ? {} : { approvedRecipe }) }, ...(receipt === undefined ? {} : { approvedMotionRecipeReceipt: receipt, approvedMotionRecipe: result.approvedMotionRecipe }) };
}

function validateProjectRunInvocation(value: unknown): ProjectRunInvocation {
  if (!isRecord(value)) {
    throw new Error('project run invocation must be an object');
  }
  const current = value.current;
  if (!isRecord(current)) {
    throw new Error('project run invocation requires a current run identity');
  }
  const identity = current;
  if (
    typeof identity.buildSha256 !== 'string'
    || typeof identity.loadedSkillSha256 !== 'string'
    || typeof identity.briefSha256 !== 'string'
  ) {
    throw new Error('project run invocation current identity is invalid');
  }
  const invocation: ProjectRunInvocation = {
    activation: validateActivationContext(value.activation),
    current: {
      buildSha256: identity.buildSha256,
      loadedSkillSha256: identity.loadedSkillSha256,
      briefSha256: identity.briefSha256,
    },
  };
  validateCurrentProjectRun(invocation);
  return invocation;
}
function projectWriter(invocation: ProjectRunInvocation, projectRoot = process.cwd()): ProjectWriteAdapter {
  validateCurrentProjectRun(invocation);
  return createProjectWriteAdapter(projectRoot, invocation);
}

function activationInputPath(opts: Opts): string | undefined {
  const hostPath = process.env.OMD_ACTIVATION_PATH;
  const selected = opts.activation ?? hostPath;
  if (process.env.OMD_CODEX_AUTHORITY_SOCKET !== undefined && hostPath !== undefined && selected !== undefined) {
    let exact = false;
    try { exact = realpathSync(resolve(selected)) === realpathSync(resolve(hostPath)); } catch { /* inputJson reports the unreadable path */ }
    if (!exact) throw new Error('CODEX_ACTIVATION_PATH_REJECTED: use the read-only activation path issued by the current host launcher');
  }
  return selected;
}

function invocationFromActivation(opts: Opts, command: string, projectRoot = process.cwd()): ProjectRunInvocation {
  const activationPath = activationInputPath(opts);
  return activationPath !== undefined
    ? validateProjectRunInvocation(inputJson(activationPath, command))
    : createLocalCliInvocation({
      cliPath: fileURLToPath(import.meta.url),
      argv: process.argv.slice(2),
      brief: command,
      projectRoot,
    });
}

function projectWriterFromActivation(opts: Opts, command: string, projectRoot = process.cwd()): ProjectWriteAdapter {
  return projectWriter(invocationFromActivation(opts, command, projectRoot), projectRoot);
}

function ensureProjectParent(adapter: ProjectWriteAdapter, target: string): void {
  const parent = realpathSync(dirname(resolve(target)));
  if (parent !== adapter.projectRoot) adapter.mkdir(relative(adapter.projectRoot, parent));
}
function ensureObservationParent(
  opts: Opts,
  command: string,
  target: string,
  kind: ExternalObservationKind,
): void {
  const invocation = invocationFromActivation(opts, command);
  const absoluteTarget = resolve(target);
  const fromProject = relative(process.cwd(), absoluteTarget);
  if (fromProject === '' || (!fromProject.startsWith('..') && !fromProject.startsWith('/'))) {
    ensureProjectParent(projectWriter(invocation), absoluteTarget);
    return;
  }
  createExternalObservationDirectory({
    projectRoot: process.cwd(),
    absolutePath: dirname(target),
    invocation,
    kind,
  });
}

async function rawIrFor(opts: Opts, target: string | undefined, selector?: string | null): Promise<RawIr> {
  if (target) {
    const { extractIr, parseViewport } = await import('../core/render/index.ts');
    return extractIr(target, { viewport: parseViewport(opts.viewport), selector: selector ?? null });
  }
  const irPath = opts.ir ?? join(process.cwd(), '.omd', '.cache', 'ir.json');
  return JSON.parse(readFileSync(irPath, 'utf8')) as RawIr;
}

/**
 * A desktop renderer opened outside its shell has no preload bridge, so an app that reads
 * `window.<name>` at startup paints a boot error. Say so once, on stderr: a review handed that
 * screenshot would otherwise report the harness as a design defect.
 */
function warnDesktopBridge(target: string | undefined): void {
  if (target === undefined || /^https?:\/\//.test(target)) return;
  const stack = computeStack(process.cwd());
  const globals = bridgeGlobals(process.cwd(), stack.shell);
  if (globals.length === 0) return;
  console.error(
    `[note] ${stack.shell.kind} renderer opened outside its shell: window.${globals.join(', window.')} `
    + 'is undefined here, so a boot error on this capture is the harness, not the design. '
    + `Render the running app at ${stack.shell.devUrl ?? 'its dev URL'} for interaction evidence.`,
  );
}

async function cmdIr(opts: Opts): Promise<never> {
  const raw = await rawIrFor(opts, opts._[0]);
  warnDesktopBridge(opts._[0]);
  const out = opts.out ?? join(process.cwd(), '.omd', '.cache', 'ir.json');
  const adapter = projectWriterFromActivation(opts, 'omd ir');
  adapter.write(relative(process.cwd(), resolve(out)), JSON.stringify(raw, null, 2));
  console.log(`${out}  (${raw.nodes.length} nodes, ${Object.keys(raw.tokens ?? {}).length} tokens)`);
  process.exit(0);
}

async function cmdRender(opts: Opts): Promise<never> {
  const { renderPage, renderProofs, renderFilmstrip, parseViewport } = await import('../core/render/index.ts');
  const target = opts._[0];
  warnDesktopBridge(target);
  if (!target) usage();

  if (opts.filmstrip) {
    // Filmstrip: 4–6 viewport screenshots at ~300ms intervals, plus an HTML index.
    // The HTML index is the deliverable: eye reads it to see what appeared when.
    const out = opts.out ?? 'filmstrip.html';
    const adapter = projectWriterFromActivation(opts, 'omd render');
    ensureProjectParent(adapter, out);
    const frames = await renderFilmstrip(target, { viewport: parseViewport(opts.viewport), out, adapter });
    // Report the index path (sans extension already included) alongside the frame count.
    const indexPath = out.endsWith('.html') || out.endsWith('.htm') ? out : `${out}.html`;
    console.log(`${indexPath}  (${frames.length} frames)`);
    process.exit(0);
  }

  if (opts.proofs) {
    // One browser launch produces all four sketch/craft proofs (fixed + full-page, desktop + mobile).
    const prefix = opts.out ?? 'proof';
    const adapter = projectWriterFromActivation(opts, 'omd render');
    ensureProjectParent(adapter, prefix);
    for (const p of await renderProofs(target, prefix, { adapter })) console.log(p);
    process.exit(0);
  }

  const out = opts.out ?? 'shot.png';
  const adapter = projectWriterFromActivation(opts, 'omd render');
  ensureProjectParent(adapter, out);
  await renderPage(target, {
    viewport: parseViewport(opts.viewport), out,
    ...(opts.squint ? { squint: true } : {}),
    ...(opts.fullPage ? { fullPage: true } : {}),
    adapter,
  });
  console.log(out);
  process.exit(0);
}

async function cmdProbe(opts: Opts): Promise<never> {
  const target = opts._[0];
  if (!target) throw new Error('usage: omd probe <page> [--plan path] [--viewport WxH] [--json] [--out path]');
  const { readProbePlan, runProbe, writeProbeResult } = await import('../core/probe/index.ts');
  const { parseViewport } = await import('../core/render/index.ts');
  const planPath = resolve(opts.plan ?? join(process.cwd(), '.omd', 'probes', 'primary.json'));
  if (!existsSync(planPath)) throw new Error(`probe plan not found: ${planPath}`);
  const result = await runProbe(target, readProbePlan(planPath), parseViewport(opts.viewport));
  const safe = result.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'probe';
  const out = resolve(opts.out ?? join(process.cwd(), '.omd', '.cache', 'probes', `${safe}.json`));
  const command = 'omd probe';
  const fromProject = relative(process.cwd(), out);
  if (fromProject === '' || (!fromProject.startsWith('..') && !fromProject.startsWith('/'))) {
    writeProbeResult(process.cwd(), fromProject, result, projectWriterFromActivation(opts, command));
  } else {
    writeExternalObservationFile({
      projectRoot: process.cwd(),
      absolutePath: opts.out ?? out,
      content: JSON.stringify(result, null, 2),
      invocation: invocationFromActivation(opts, command),
      kind: 'probe-cache',
    });
  }
  if (opts.json) process.stdout.write(JSON.stringify(result));
  else {
    for (const warning of result.warnings) console.log(`[${warning.severity}] ${warning.id}: ${warning.message}`);
    console.log(out);
  }
  process.exit(result.warnings.length ? 1 : 0);
}

async function cmdFlowProbe(opts: Opts): Promise<never> {
  const base = opts._[0];
  if (!base) throw new Error('usage: omd flow-probe <base-url-or-dir> [--plan path] [--json] [--out path]');
  const { runProbeFlow } = await import('../core/probe/flow.ts');
  const { writeProbeResult } = await import('../core/probe/index.ts');
  const planPath = resolve(opts.plan ?? join(process.cwd(), '.omd', 'probes', 'flow.json'));
  if (!existsSync(planPath)) throw new Error(`flow plan not found: ${planPath}`);
  const result = await runProbeFlow(base, JSON.parse(readFileSync(planPath, 'utf8')) as unknown);
  const safe = result.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'flow';
  const out = resolve(opts.out ?? join(process.cwd(), '.omd', '.cache', 'probes', `${safe}-flow.json`));
  const command = 'omd flow-probe';
  const fromProject = relative(process.cwd(), out);
  if (fromProject === '' || (!fromProject.startsWith('..') && !fromProject.startsWith('/'))) {
    writeProbeResult(process.cwd(), fromProject, result as never, projectWriterFromActivation(opts, command));
  } else {
    writeExternalObservationFile({
      projectRoot: process.cwd(),
      absolutePath: opts.out ?? out,
      content: JSON.stringify(result, null, 2),
      invocation: invocationFromActivation(opts, command),
      kind: 'probe-cache',
    });
  }
  if (opts.json) process.stdout.write(JSON.stringify(result));
  else {
    for (const warning of result.warnings) console.log(`[${warning.severity}] ${warning.id}: ${warning.message}`);
    console.log(out);
  }
  process.exit(result.warnings.length ? 1 : 0);
}

async function cmdConfig(sub: string | undefined, opts: Opts): Promise<never> {
  const { readConfig, setCheckpoint } = await import('../core/config/index.ts');
  if (sub === 'show') {
    console.log(JSON.stringify(readConfig(process.cwd()), null, 2));
    process.exit(0);
  }
  if (sub === 'set' && opts._[0] === 'checkpoint' && opts._[1]) {
    console.log(setCheckpoint(process.cwd(), opts._[1], projectWriterFromActivation(opts, 'omd config set')));
    process.exit(0);
  }
  throw new Error('usage: omd config set checkpoint none|concept|structure|both | omd config show');
}

async function cmdCraft(sub: string | undefined, opts: Opts): Promise<never> {
  const { readCraft, recordCraft } = await import('../core/craft/index.ts');
  if (sub === 'checkpoint') {
    const phase = opts._[0];
    if (phase !== 'semantic' && phase !== 'visual') {
      throw new Error('usage: omd craft checkpoint semantic|visual --render <path> --observed "..." --decision revise|retain|reframe --criterion "..." --reason "..." [--changed "..."]');
    }
    console.log(recordCraft(process.cwd(), {
      phase, render: opts.render ?? '', observed: opts.observed ?? '', changed: opts.changed ?? '',
      ...(opts.decision === undefined ? {} : { decision: opts.decision }),
      ...(opts.criterion === undefined ? {} : { criterion: opts.criterion }),
      ...(opts.reason === undefined ? {} : { reason: opts.reason }),
    }, projectWriterFromActivation(opts, 'omd craft checkpoint')));
    process.exit(0);
  }
  if (sub === 'status') {
    const records = readCraft(process.cwd());
    if (opts.json) process.stdout.write(JSON.stringify(records));
    else if (!records.length) console.log('No craft checkpoints recorded.');
    else for (const record of records) console.log(`${record.phase}: ${record.observed} -> ${record.decision ?? 'revise'}: ${record.changed || record.reason} (${record.render})`);
    process.exit(0);
  }
  throw new Error('usage: omd craft checkpoint ... | omd craft status [--json]');
}

async function cmdUsage(opts: Opts): Promise<never> {
  const { computeRunUsage, formatRunUsage } = await import('../core/usage/index.ts');
  const u = computeRunUsage(process.cwd());
  if (!u) {
    if (opts.json) process.stdout.write('null');
    else console.log('실행 사용량: 호스트 세션 로그를 찾지 못했습니다 (Claude Code / Codex 세션 로그 없음).');
    process.exit(0);
  }
  if (opts.json) process.stdout.write(JSON.stringify(u));
  else console.log(formatRunUsage(u));
  process.exit(0);
}

/**
 * Cross-page site consistency check: `omd check --site <dir>`.
 *
 * Loads every .html file (and .json IR cache) in the given directory, extracts
 * IR for each page, compares their design ladders and token coverage, and warns
 * when pages disagree. The comparison logic (checkSite) is pure; only the
 * extraction here touches the browser.
 *
 * CLI shape: `omd check --site ./dist` — all .html files in the directory.
 *            Multiple positional args also work: `omd check a.html b.html`
 *            (when --site is absent and opts._ has ≥2 entries).
 */
async function cmdCheckSite(opts: Opts): Promise<never> {
  const { normalize } = await import('../core/ir/normalize.ts');
  const { extractInvariants } = await import('../core/ref/invariants.ts');
  const { checkSite } = await import('../core/site/index.ts');
  const { extractIr, parseViewport } = await import('../core/render/index.ts');

  // Resolve the list of page paths: either --site <dir> (glob all HTML files)
  // or multiple positional args.
  let pagePaths: string[] = [];
  if (opts.site) {
    const dir = resolve(opts.site);
    const { readdirSync: rds } = await import('node:fs');
    try {
      pagePaths = rds(dir)
        .filter((f) => f.endsWith('.html') || f.endsWith('.htm'))
        .map((f) => join(dir, f))
        .sort();
    } catch (e) {
      console.error(`cannot read directory: ${opts.site} — ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
    if (pagePaths.length === 0) {
      console.error(`no .html files found in: ${opts.site}`);
      process.exit(1);
    }
  } else {
    // Multiple positional args
    pagePaths = opts._.map((p) => resolve(p));
  }

  if (pagePaths.length < 2) {
    console.error('--site requires at least 2 pages to compare; use `omd check <page>` for a single-page check');
    process.exit(1);
  }

  const viewport = parseViewport(opts.viewport);

  const pages: Array<{ path: string; invariants: import('../core/types.ts').Invariants; tokens?: Record<string, string> }> = [];
  for (const pagePath of pagePaths) {
    try {
      const raw = await extractIr(pagePath, { viewport, selector: null });
      const ir = normalize(raw);
      const invariants = extractInvariants(ir);
      pages.push({ path: pagePath, invariants, ...(raw.tokens ? { tokens: raw.tokens } : {}) });
      console.error(`  extracted: ${pagePath} (${ir.nodes.length} nodes)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  skipped: ${pagePath} — ${msg}`);
    }
  }

  if (pages.length < 2) {
    console.error('fewer than 2 pages extracted successfully — cannot compare');
    process.exit(1);
  }

  const violations = checkSite(pages);

  if (opts.json) {
    process.stdout.write(JSON.stringify(violations));
  } else {
    for (const v of violations) {
      console.log(`[${v.severity}] ${v.id}: ${v.message}`);
    }
    if (violations.length === 0) console.log('ok — no cross-page drift detected');
  }

  process.exit(violations.length > 0 ? 1 : 0);
}

async function cmdCheck(opts: Opts): Promise<never> {
  // Route to site-wide consistency check when --site is present or ≥2 positional args given.
  if (opts.site || opts._.length >= 2) return cmdCheckSite(opts);

  const { normalize } = await import('../core/ir/normalize.ts');
  const { loadRules, check } = await import('../core/rules/engine.ts');

  const ir = normalize(await rawIrFor(opts, opts._[0]));
  const rules = loadRules(join(root, 'core', 'rules', 'builtin'));
  const layers = opts.layer?.split(',').map((l) => Number(l.trim()) as Layer);
  const categories = opts.category?.split(',').map((c) => c.trim()) as Category[] | undefined;
  const violations = contextualCheckViolations(
    process.cwd(),
    opts._[0],
    check(ir, rules, { ...(layers ? { layers } : {}), ...(categories ? { categories } : {}) }),
  );

  // Design rationale belongs in .omd/, never in the shipped copy. Checked separately from
  // the YAML rules because it compares page text against these two records, not the IR alone.
  const frameRecords: string[] = [];
  for (const name of ['frame.md', 'decisions.md']) {
    const path = join(process.cwd(), '.omd', name);
    if (existsSync(path)) frameRecords.push(readFileSync(path, 'utf8'));
  }
  const leaks = findLeakedRationale(ir, frameRecords)
    // F3: leaks are layer 1 (like everything in check()); honor --layer the same way
    // check() does, not just --category, or `--layer 2` still emits leak findings.
    .filter((v) => (!categories || categories.includes(v.category)) && (!layers || layers.includes(v.layer)));

  // Attribution audit: only active when .omd/attribution.md exists. Verifies that every
  // token group used on the page is accounted for, and every row's source points to a real
  // capture or theory reference. Keeps attribution honest without requiring it of every page.
  const attrViolations: Violation[] = [];
  const attrPath = join(process.cwd(), '.omd', 'attribution.md');
  if (existsSync(attrPath)) {
    const attrMd = readFileSync(attrPath, 'utf8');
    const { loadRefs, refRecordPath } = await import('../core/ref/store.ts');
    const captureNames = loadRefs(process.cwd()).map(ref => basename(refRecordPath(process.cwd(), ref), '.json'));
    const theoryDir = join(root, 'core', 'theory');
    const theoryNames = existsSync(theoryDir)
      ? readdirSync(theoryDir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3))
      : [];
    attrViolations.push(
      ...checkAttribution(ir, attrMd, captureNames, theoryNames)
        .filter((v) => (!categories || categories.includes(v.category)) && (!layers || layers.includes(v.layer))),
    );
  }

  // Motion-spec audit: only active when .omd/motion-spec.md exists. Compares the scene
  // inventory written by omd-hand (what was planned) against the live probe data (what ran)
  // and the filmstrip energy curve (pixel-level confirmation that catches GSAP/rAF too).
  //
  // Contract: check reads the most recent energy curve from .omd/.cache/ if present.
  // The ultradesign skill runs `omd render --filmstrip` before `omd check`, which writes
  // `<base>-energy.json` alongside the filmstrip HTML. If that file is present, it is
  // used as a supplementary signal; if absent, probe data alone is used.
  const motionSpecViolations: Violation[] = [];
  const motionSpecPath = join(process.cwd(), '.omd', 'motion-spec.md');
  if (existsSync(motionSpecPath)) {
    const motionSpecMd = readFileSync(motionSpecPath, 'utf8');
    const framePath = join(process.cwd(), '.omd', 'frame.md');
    const frameMd = existsSync(framePath) ? readFileSync(framePath, 'utf8') : null;

    let energyCurve: EnergyCurve | null = null;
    const cacheDir = join(process.cwd(), '.omd', '.cache');
    if (existsSync(cacheDir)) {
      const energyFiles = readdirSync(cacheDir).filter((f) => f.endsWith('-energy.json'));
      if (energyFiles.length > 0) {
        try {
          energyCurve = JSON.parse(readFileSync(join(cacheDir, energyFiles[0]!), 'utf8')) as EnergyCurve;
        } catch { /* corrupt or unreadable: skip */ }
      }
    }

    motionSpecViolations.push(
      ...checkMotionSpec(ir, motionSpecMd, frameMd, energyCurve)
        .filter((v) => (!categories || categories.includes(v.category)) && (!layers || layers.includes(v.layer))),
    );
  }

  // Design contract audit: only active when .omd/design.md exists. Validates that all
  // required sections are present and that the Interaction states section enumerates
  // the six required states. A bare project without design.md is not nagged.
  const designViolations: Violation[] = [];
  const designPath = join(process.cwd(), '.omd', 'design.md');
  if (existsSync(designPath)) {
    const designMd = readFileSync(designPath, 'utf8');
    designViolations.push(
      ...validateDesignMd(designMd)
        .filter((v) => (!categories || categories.includes(v.category)) && (!layers || layers.includes(v.layer))),
    );
  }

  // Interaction-state rules: deterministic IR checks for measurable state gaps.
  // Runs unconditionally (no guard file required) — a form without an error state
  // is a defect on any page, whether or not design.md has been established.
  const interactionViolations: Violation[] = checkInteractionStates(ir)
    .filter((v) => (!categories || categories.includes(v.category)) && (!layers || layers.includes(v.layer)));

  // Frame UX audit: only active when .omd/frame.md exists. Checks that the three UX
  // anchor questions (task, frequent-action, costliest-error) have been answered.
  // A bare project without frame.md is not nagged — but a frame that skipped the
  // interrogation is flagged with FRAME-UX-INCOMPLETE.
  const frameUxViolations: Violation[] = [];
  const frameMdPath = join(process.cwd(), '.omd', 'frame.md');
  if (existsSync(frameMdPath)) {
    frameUxViolations.push(
      ...checkFrameUx(process.cwd())
        .filter((v) => (!categories || categories.includes(v.category)) && (!layers || layers.includes(v.layer))),
    );
  }

  // Code-unit order, not localeCompare — same determinism guarantee as check() itself.
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  const combined: Violation[] = [
    ...violations, ...leaks, ...attrViolations, ...motionSpecViolations,
    ...designViolations, ...interactionViolations, ...frameUxViolations,
  ].sort((a, b) => cmp(a.path, b.path) || cmp(a.id, b.id));

  if (opts.json) process.stdout.write(JSON.stringify(combined));
  else for (const v of combined) console.log(`[${v.severity}] ${v.id} ${v.path}: ${v.message}`);

  if (!opts.noLog) {
    const page = opts._[0] ?? opts.ir ?? '(unknown)';
    logRun(process.cwd(), page, combined, projectWriterFromActivation(opts, 'omd check'));
  }

  process.exit(combined.length > 0 ? 1 : 0);
}

/** One decision is one block, so a rule named in both its title and its reason counts once. */
function readDecisionBlocks(cwd: string): string[] {
  const path = join(cwd, '.omd', 'decisions.md');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split(/^## /m).slice(1);
}

function cmdCoach(): never {
  const report = analyse(readHistory(process.cwd()), readDecisionBlocks(process.cwd()));

  if (report.runs === 0) {
    console.log('No check history yet. Run `omd check` on something.');
    process.exit(0);
  }

  if (!report.confident) {
    console.log(`Seen ${report.runs} run${report.runs === 1 ? '' : 's'} so far.`);
    for (const r of report.recurring) console.log(`  ${r.rule}  ${r.total} findings across ${r.runs} runs`);
    console.log(`\nToo little history to claim a trend. Four runs is the minimum; there are ${report.runs}.`);
    process.exit(0);
  }

  for (const r of report.recurring) {
    // A rule with no baseline has no percentage. Say "appeared", never a fabricated number.
    const delta = r.changePct === null ? 'appeared' : `${r.changePct > 0 ? '+' : ''}${r.changePct}%`;
    console.log(`${r.rule}  ${r.total} findings across ${r.runs} runs   ${delta}  ${r.trend}`);
  }

  if (report.overrules.length > 0) {
    console.log('\nOverruled:');
    for (const o of report.overrules) console.log(`  ${o.rule}  x${o.count}`);
  }

  process.exit(0);
}

function cmdFrameShow(): never {
  const frame = readFrame(process.cwd());
  if (!frame) {
    console.error('No frame yet. Run `omd frame set --problem P --reframe R --why EVIDENCE`.');
    process.exit(1);
  }
  console.log(JSON.stringify(frame, null, 2));
  process.exit(0);
}

/**
 * The agent picks, states why, and records it. It does not stop and wait: a loop that
 * halts for a decision the user was never asked to make is a loop that never finishes.
 * The recorded choice is the training signal, and the user can overrule it afterwards.
 */
function cmdChoose(opts: Opts): never {
  const among = opts._;
  if (among.length < 2) {
    console.error('usage: omd choose c1 c2 c3 --chose c3 --why "..."');
    process.exit(1);
  }
  if (!opts.chose || !opts.why) {
    console.error('--chose and --why are both required. A choice without a reason teaches nothing.');
    process.exit(1);
  }
  const path = logChoice(process.cwd(), { among, chose: opts.chose, why: opts.why }, projectWriterFromActivation(opts, 'omd choose'));
  console.log(`${path}  (${tasteProfile(process.cwd(), true).n} choices recorded)`);
  process.exit(0);
}

/**
 * `omd ref add-batch <manifest.json>` — capture many references concurrently over ONE browser.
 * The manifest is a JSON array of `{ source, as, selector?, slot?, blueprint?, shot?, fromUser?, viewport?, energy?, preparation? }`.
 * Same per-reference result as `omd ref add`, minus the energy pass, at a fraction of the wall time.
 */
async function cmdRefAddBatch(opts: Opts): Promise<never> {
  const manifestPath = opts._[0];
  if (!manifestPath) {
    console.error('usage: omd ref add-batch <manifest.json>  (JSON array of { source, as, selector?, slot?, blueprint?, shot?, fromUser?, viewport?, energy?, preparation? }); omd schema reference-capture-preparation');
    process.exit(1);
  }
  const { addRefsBatch } = await import('../core/ref/batch.ts');
  const specs = JSON.parse(readFileSync(resolve(manifestPath), 'utf8')) as import('../core/ref/batch.ts').RefSpec[];
  if (!Array.isArray(specs) || specs.length === 0) throw new Error('manifest must be a non-empty JSON array of reference specs');
  const { captureLane } = await import('../core/ref/capture-intake.ts');
  const invocation = invocationFromActivation(opts, 'omd ref add-batch');
  for (const s of specs) {
    if (!s || typeof s.source !== 'string' || typeof s.as !== 'string') {
      throw new Error('each manifest entry needs a string `source` and `as`');
    }
    s.lane = captureLane(process.cwd(), s, invocation);
  }
  const result = await addRefsBatch(process.cwd(), specs, { rulesRoot: join(root, 'core', 'rules', 'builtin'), invocation }, projectWriterFromActivation(opts, 'omd ref add-batch'));
  if (opts.json) process.stdout.write(JSON.stringify(result));
  else {
    const ok = result.outcomes.filter((o) => o.ok).length;
    console.log(`ref add-batch: ${ok}/${result.outcomes.length} captured (concurrency ${result.concurrency})`);
    for (const o of result.outcomes) {
      if (o.ok) console.log(`  ok   ${o.as}  <- ${o.source}${o.slopCount ? `  (${o.slopCount} slop)` : ''}`);
      else console.error(`  FAIL ${o.as}  <- ${o.source}: ${o.error}`);
    }
  }
  process.exit(result.outcomes.some((o) => !o.ok) ? 1 : 0);
}

async function cmdRefBoard(opts: Opts): Promise<never> {
  if (!opts.input || opts._.length > 0) {
    throw new Error('usage: omd ref board --input <candidate-assemblies.json> [--json]');
  }
  const { authorReferenceBoard } = await import('../core/ref/board-author.ts');
  const board = authorReferenceBoard(process.cwd(), inputJson(opts.input, 'omd ref board'));
  const { resolveReferenceBoardArtifacts } = await import('../core/ref/board-artifacts.ts');
  const artifacts = resolveReferenceBoardArtifacts(process.cwd(), board);
  const adapter = projectWriterFromActivation(opts, 'omd ref board');
  const path = adapter.write('.omd/reference-board.json', canonicalJson(board));
  const result = { path, candidates: artifacts.manifest.candidates.length, pieces: artifacts.manifest.candidates.reduce((count, candidate) => count + candidate.pieces.length, 0) };
  if (opts.json) process.stdout.write(JSON.stringify(result));
  else console.log(`reference board: ${result.candidates} candidates, ${result.pieces} zone-bound pieces`);
  process.exit(0);
}

async function cmdRefAdd(opts: Opts): Promise<never> {
  const target = opts._[0];
  if (!target || !opts.as) {
    console.error('usage: omd ref add <url|file> --as <component> --lane domain|design [--slot <surface>] [--selector "css"] [--image] [--from-user]; selected discovery requires an explicit lane and free-gallery/original-link provenance for design');
    process.exit(1);
  }
  const component = opts.as;
  if (opts.image && opts.selector) {
    console.error('--image and --selector cannot be used together: an image has no subtree to scope.');
    process.exit(1);
  }
  if (opts.blueprint && !opts.selector) {
    console.error('--blueprint requires --selector: a blueprint measures one component, not a whole page.');
    process.exit(1);
  }
  if (opts.shot && !opts.selector) {
    console.error('--shot requires --selector: a scoped screenshot captures one component, not a whole page. Omit --shot to capture the page, or pass --selector.');
    process.exit(1);
  }
  if (opts.noShot && opts.noShotReason === undefined) {
    console.error('--no-shot requires --no-shot-reason: a reference without its image cannot be re-examined later, so the omission is recorded rather than silent.');
    process.exit(1);
  }
  if (opts.preparation && (opts.image || !opts.noEnergy)) throw new Error('--preparation requires a rendered reference and --no-energy');
  const { saveRef } = await import('../core/ref/store.ts');
  const { captureLane, captureFinalUrlGuard } = await import('../core/ref/capture-intake.ts');
  const invocation = invocationFromActivation(opts, 'omd ref add');
  const intent = { source: target, ...(opts.lane ? { lane: opts.lane } : {}), ...(opts.fromUser ? { fromUser: true } : {}),
    ...(opts.selector ? { selector: opts.selector } : {}), shot: !opts.noShot && !opts.image, image: !!opts.image };
  const lane = captureLane(process.cwd(), intent, invocation);
  const validateFinalUrl = captureFinalUrlGuard(process.cwd(), [{ ...intent, lane }], invocation);
  const adapter = projectWriterFromActivation(opts, 'omd ref add');

  if (opts.image) {
    const path = saveRef(process.cwd(), {
      researchLane: lane,
      source: target,
      component,
      kind: 'image',
      capturedAt: new Date().toISOString(),
      ...(opts.slot ? { slot: opts.slot } : {}),
      invariants: null,
      principles: [],
      ...(opts.fromUser ? { origin: 'user' as const } : {}),
    }, adapter);
    console.log(path);
    process.exit(0);
  }

  const { normalize } = await import('../core/ir/normalize.ts');
  const { extractInvariants } = await import('../core/ref/invariants.ts');
  const { designSignal, LOW_SIGNAL } = await import('../core/ref/signal.ts');

  const { loadRules, check } = await import('../core/rules/engine.ts');

  const { capturePageForRef, withBrowser, captureEnergy, parseViewport, REFERENCE_VIEWPORT } = await import('../core/render/index.ts');
  const { designDiscoveryProvider } = await import('../core/ref/design-discovery-sources.ts');
  const galleryImage = lane === 'design' && target.startsWith('https://') && designDiscoveryProvider(target) !== null;
  if (galleryImage && opts.blueprint) throw new Error('DESIGN_GALLERY_IMAGE_ONLY: a gallery image has pixels, not measurable app DOM anatomy');
  const { parseCapturePreparation } = await import('../core/ref/capture-preparation.ts');
  const preparation = opts.preparation ? parseCapturePreparation(JSON.parse(readFileSync(resolve(opts.preparation), 'utf8'))) : undefined;
  const captureViewport = parseViewport(opts.viewport ?? REFERENCE_VIEWPORT);
  const { refImagePath } = await import('../core/ref/store.ts');
  // A reference always keeps its image. `--shot` used to be the only way to get one, so a reference
  // gathered without it could never be re-examined: the measured ladders survive, the screen that
  // produced them does not. Scope the capture to the selector when one was given, and capture the
  // page otherwise, which is still the evidence behind the numbers.
  const absShot = opts.noShot
    ? undefined
    : refImagePath(adapter.projectRoot, { source: target, component: opts.as, researchLane: lane });
  const { raw, shotBytes, shotError, capturePreparation, acquisition, visibleText } = await withBrowser(browser => capturePageForRef(browser, target, captureViewport, {
    selector: opts.selector ?? null,
    requireImageElement: galleryImage,
    validateFinalUrl: (url, visibleText) => validateFinalUrl(0, url, visibleText),
    ...(absShot ? { shotOut: absShot, adapter, deferShotWrite: true } : {}),
    ...(preparation ? { preparation } : {}),
    bestEffortShot: preparation === undefined && !galleryImage,
  }));
  const ir = normalize(raw);
  const invariants = extractInvariants(ir);

  const slopViolations = galleryImage ? [] : check(ir, loadRules(join(root, 'core', 'rules', 'builtin')), { categories: ['slop'] });
  const slopCount = slopViolations.length;
  const slopIds = [...new Set(slopViolations.map((v) => v.id))];

  // Energy curve: capture pixel-diff motion energy for the reference. Uses a second
  // Playwright session so the cost is one extra browser launch per `omd ref add`.
  // Sees ALL motion including GSAP/rAF — closing the getAnimations() blind spot.
  // Failure is silently ignored: a blocked page or unsupported format must not prevent
  // the reference from being saved.
  const energyCurve = opts.noEnergy || galleryImage ? null : await captureEnergy(target, { viewport: captureViewport });

  // Blueprint: full-resolution structural snapshot with skin abstracted to color roles.
  // Only captured when --blueprint is passed together with --selector.
  let blueprint: import('../core/types.ts').Blueprint | undefined;
  if (opts.blueprint && opts.selector) {
    const { captureBlueprint } = await import('../core/ref/blueprint.ts');
    blueprint = captureBlueprint(raw.nodes, opts.selector);
    console.error(`blueprint: ${blueprint.nodes.length} nodes captured`);
  }

  const { commitCapturedReference } = await import('../core/ref/capture-commit.ts');
  const committed = commitCapturedReference(adapter, absShot, shotBytes, imagePath => {
    const imageOmittedReason = imagePath !== undefined
      ? undefined
      : opts.noShotReason ?? (shotError === undefined ? 'the capture produced no image' : `capture failed: ${shotError}`);
    return saveRef(process.cwd(), {
      researchLane: lane,
      acquisition,
      ...((visibleText.match(/[가-힣]/gu)?.length ?? 0) >= 8 ? { visibleKoreanText: true as const } : {}),
      source: target,
      component,
      kind: galleryImage ? 'image' : opts.selector ? 'component' : 'page',
      capturedAt: new Date().toISOString(),
      ...(opts.selector ? { selector: opts.selector } : {}),
      ...(opts.slot ? { slot: opts.slot } : {}),
      invariants: galleryImage ? null : invariants,
      principles: [],
      slopCount,
      ...(opts.fromUser ? { origin: 'user' as const } : {}),
      ...(imageOmittedReason === undefined ? {} : { imageOmittedReason }),
      ...(energyCurve !== null ? { energyCurve } : {}),
      ...(blueprint !== undefined ? { blueprint } : {}),
      ...(imagePath !== undefined ? { imagePath } : {}),
      viewport: captureViewport,
      ...(capturePreparation ? { capturePreparation } : {}),
    }, adapter);
  });
  const path = committed.value;
  if (committed.imagePath) console.error(`shot: ${committed.imagePath}`);
  if (shotError) console.error(`shot skipped: ${shotError}`);
  console.log(path);
  console.log(JSON.stringify(invariants, null, 2));
  console.error(`slop findings: ${slopCount}${slopCount > 0 ? `  [${slopIds.join(', ')}]` : ''}`);

  const signal = designSignal(invariants, blueprint);
  if (!galleryImage && signal.score < LOW_SIGNAL) {
    console.error(
      `warning: low design signal (${signal.score} — missing: ${signal.missing.join(', ')}).\n`
      + 'Measured DOM evidence is insufficient; this is not a visual-quality judgment.\n'
      + 'If the design is inside an image, inspect the saved PNG and use ref import-image for visual-only evidence. Do not measure gallery chrome as the pictured app or replace image references with domain documentation.',
    );
  }
  if (slopCount >= 2) {
    if (opts.fromUser) {
      console.error(
        `note: the reference you provided shows ${slopCount} slop signals (${slopIds.join(', ')}).\n`
        + 'It is saved. Inspect the actual image and record what to transfer or avoid; warnings do not overrule the user target.',
      );
    } else {
      console.error(
        `warning: ${slopCount} slop findings (${slopIds.join(', ')}).\n`
        + 'Review the visible context before retaining or excluding this source; the warning count is not an aesthetic verdict.',
      );
    }
  }
  process.exit(0);
}

/**
 * A principle answers *why* a reference is the way it is, and no function can form that
 * judgement. It is written by a model that looked at the render, and merely recorded here —
 * the same split as everywhere else: the tool measures, the model interprets.
 */
async function cmdRefPrinciples(opts: Opts): Promise<never> {
  const source = opts._[0];
  if (!source || !opts.as || !opts.add) {
    console.error('usage: omd ref principles <source> --as <component> --add "why it is built that way"');
    process.exit(1);
  }
  const { addPrinciples } = await import('../core/ref/store.ts');
  addPrinciples(process.cwd(), source, opts.as, [opts.add], projectWriterFromActivation(opts, 'omd ref principles'));
  console.log(`${source} (${opts.as}): principle recorded`);
  process.exit(0);
}

async function cmdRefShow(opts: Opts): Promise<never> {
  const source = opts._[0];
  if (!source || !opts.as) {
    console.error('usage: omd ref show <source> --as <component>');
    process.exit(1);
  }
  const { loadRefs } = await import('../core/ref/store.ts');
  const ref = loadRefs(process.cwd(), { includeDomain: true }).find((r) => r.source === source && r.component === opts.as);
  if (!ref) {
    console.error(`no reference for ${source} (${opts.as})`);
    process.exit(1);
  }

  console.log(`${ref.source}  ${ref.component}  captured ${ref.capturedAt}`);
  console.log(JSON.stringify(ref.invariants, null, 2));
  if (ref.principles.length === 0) {
    console.log('\nNo principles yet — nothing has looked at it.');
  } else {
    console.log('\nPrinciples:');
    for (const p of ref.principles) console.log(`  - ${p}`);
  }
  if (ref.blueprint) {
    printBlueprint(ref.blueprint);
  }
  process.exit(0);
}

/**
 * Print a blueprint as an indented, buildable spec. Each line is one node with its
 * role, dimensions, typography, surface, color roles, and motion timings. The tree
 * structure is reconstructed from the children arrays.
 */
function printBlueprint(bp: import('../core/types.ts').Blueprint): void {
  const childIds = new Set(bp.nodes.flatMap((n) => n.children));
  const roots = bp.nodes.filter((n) => !childIds.has(n.id));
  const byId = new Map(bp.nodes.map((n) => [n.id, n]));

  const printNode = (id: string, depth: number): void => {
    const node = byId.get(id);
    if (!node) return;
    const indent = '  '.repeat(depth);
    const parts: string[] = [node.role, `${node.box.w}×${node.box.h}`];
    if (node.fontSize != null) parts.push(`${node.fontSize}px`);
    if (node.fontWeight != null) parts.push(`fw:${node.fontWeight}`);
    if (node.lineHeight != null) parts.push(`lh:${node.lineHeight}`);
    if (node.radius != null) parts.push(`r=${node.radius}`);
    if (node.hasShadow) parts.push('shadow');
    if (node.fillRole) parts.push(`fill:${node.fillRole}`);
    if (node.textRole) parts.push(`text:${node.textRole}`);
    if (node.textLength) parts.push(`[${node.textLength}]`);
    if (node.motionDurations?.length) parts.push(`motion:${node.motionDurations.join(',')}ms`);
    if (node.direction) parts.push(node.direction === 'VERTICAL' ? 'col' : 'row');
    if (node.gap != null) parts.push(`gap:${node.gap}`);
    if (node.padding) {
      const [t, r, b, l] = node.padding;
      if ((t ?? 0) + (r ?? 0) + (b ?? 0) + (l ?? 0) > 0) parts.push(`p:${t}/${r}/${b}/${l}`);
    }
    console.log(`${indent}${parts.join('  ')}`);
    for (const childId of node.children) printNode(childId, depth + 1);
  };

  console.log(`\nBlueprint  selector: ${bp.selector}  (${bp.nodes.length} nodes)`);
  for (const root of roots) printNode(root.id, 0);
}

async function cmdRefList(opts: Opts): Promise<never> {
  const { loadRefs, researchLane } = await import('../core/ref/store.ts');
  const { inspectDesignReferenceAdmission } = await import('../core/ref/design-admission.ts');
  const { designSignal, LOW_SIGNAL } = await import('../core/ref/signal.ts');
  const { topKinshipPairs } = await import('../core/ref/distance.ts');
  const lane = opts.lane === undefined ? undefined : researchLane(opts.lane);
  const references = loadRefs(process.cwd(), { includeDomain: true });
  const refs = references.filter(ref => lane === undefined || (ref.researchLane ?? 'design') === lane).map(ref => ({
    ...ref, admission: ref.researchLane === 'domain' ? null : inspectDesignReferenceAdmission(process.cwd(), ref, { references }),
    discoveryAdmission: ref.researchLane === 'domain' ? null
      : inspectDesignReferenceAdmission(process.cwd(), ref, { references, purpose: 'discovery' }),
  }));
  if (opts.json) { process.stdout.write(JSON.stringify(refs)); process.exit(0); }
  if (refs.length === 0) {
    console.log('No references yet.');
    process.exit(0);
  }
  for (const ref of refs) {
    const granularity = ref.selector ? `[${ref.kind} ${ref.selector}]` : `[${ref.kind}]`;
    const admissionNote = ref.admission && !ref.admission.eligible
      ? ref.discoveryAdmission?.eligible ? `  [provenance-only: ${ref.admission.code}]`
        : `  [ineligible: ${ref.admission.code}; inspect ref tidy --json]`
      : '';
    const userNote = `  [${ref.researchLane ?? 'legacy-design'}]${ref.origin === 'user' ? '  [user]' : ''}${admissionNote}`;
    if (ref.kind === 'image' || ref.invariants === null) {
      console.log(`${ref.source}  ${ref.component}  ${granularity}${userNote}`);
      continue;
    }
    const inv = ref.invariants;
    const signal = designSignal(inv, ref.blueprint);
    const lowSignalNote = signal.score < LOW_SIGNAL ? `  [low-signal ${signal.score}]` : '';
    const slopNote = (ref.slopCount ?? 0) >= 2 ? `  [slop:${ref.slopCount}]` : '';
    console.log(
      `${ref.source}  ${ref.component}  ${granularity}  radius=[${inv.radiusLadder.join(',')}] `
      + `spacing=[${inv.spacingLadder.join(',')}] elevation=${inv.elevationLevels}${lowSignalNote}${slopNote}${userNote}`,
    );
  }

  const pairs = topKinshipPairs(refs.filter(ref => ref.researchLane !== 'domain'));
  if (pairs.length > 0) {
    console.log('');
    for (const p of pairs) {
      console.log(`kinship: ${p.a}  ${p.b}  ${p.similarity.toFixed(2)}`);
    }
    console.error(
      'warning: kinship cluster — references scoring ≥0.85 against each other carry the same average.\n'
      + 'A cluster is a contamination signal; drop the duplicates or mark the weaker capture as an anti-reference.',
    );
  }

  process.exit(0);
}

async function cmdRefDistance(opts: Opts): Promise<never> {
  const target = opts._[0];
  if (!target) usage();
  if (opts.gate === true && opts.selected !== true) {
    console.error('--gate requires --selected');
    process.exit(1);
  }
  if (opts.selected === true) {
    const { parseViewport } = await import('../core/render/index.ts');
    const viewport = parseViewport(opts.viewport ?? '1440x900');
    try {
      const {
        measureSelectedReferenceDistance,
        writeSelectedReferenceDistanceReceipt,
      } = await import('../core/ref/selected-reference-distance.ts');
      const receipt = await measureSelectedReferenceDistance(process.cwd(), {
        target,
        viewport,
        extract: (selector) => rawIrFor({ ...opts, viewport: `${viewport.width}x${viewport.height}` }, target, selector),
      });
      if (opts.gate === true) {
        writeSelectedReferenceDistanceReceipt(
          process.cwd(),
          receipt,
          projectWriterFromActivation(opts, 'omd ref distance --selected --gate'),
        );
      }
      if (opts.json === true) console.log(JSON.stringify(receipt));
      else {
        for (const row of receipt.comparisons) {
          console.log(`${row.slotId.padEnd(24)} ${row.similarity.toFixed(2)}  ${row.targetSelector}  [${row.geometry ? 'promised-axis geometry' : 'style-invariant diagnostic'}; not visual-percent]`);
        }
        console.log(`verdict: ${receipt.verdict}`);
      }
      process.exit(opts.gate === true && receipt.verdict === 'fail' ? 1 : 0);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  const { loadRefs } = await import('../core/ref/store.ts');
  const refs = loadRefs(process.cwd());
  if (refs.length === 0) {
    console.log('No references to compare against.');
    process.exit(0);
  }

  const measured = refs.filter((r) => r.invariants !== null);
  const skippedImages = refs.filter((r) => r.kind === 'image').length;

  if (measured.length === 0) {
    console.log('Nothing to compare: no measured references, only image references.');
    process.exit(0);
  }

  const { normalize } = await import('../core/ir/normalize.ts');
  const { extractInvariants } = await import('../core/ref/invariants.ts');
  const { distances } = await import('../core/ref/distance.ts');

  const raw = await rawIrFor(opts, target);
  const ir = normalize(raw);
  const invariants = extractInvariants(ir);
  const results = distances(invariants, measured);

  for (const r of results) {
    console.log(`  ${r.similarity.toFixed(2)}  ${r.reference}   (${r.drivers.join(', ')})`);
  }

  if (skippedImages > 0) {
    console.log(`(skipped ${skippedImages} image reference${skippedImages === 1 ? '' : 's'} — pixels cannot be measured)`);
  }

  const tooClose = results.filter((r) => r.similarity >= 0.6);
  if (tooClose.length > 0) {
    console.error(
      'warning: this page resembles a reference too closely '
      + `(${tooClose.map((r) => r.reference).join(', ')}) — assembled work should resemble none of them.`,
    );
    process.exit(0);
  }
  process.exit(0);
}

const boardPath = (opts: Opts, command: string): string | undefined => {
  if (opts.out !== undefined) throw new Error(`${command} does not accept --out`);
  if (opts._.length > 1) throw new Error(`${command} accepts at most one manifest path`);
  return opts._[0] === undefined ? undefined : resolve(opts._[0]);
};
async function cmdRefCheck(opts: Opts): Promise<never> {
  const { readReferenceBoardArtifacts } = await import('../core/ref/board-artifacts.ts');
  const { referenceSelectionExists, referenceSelectionV2Exists, preReferenceSelectionV2Exists, validateReferenceSelection, validatePreReferenceSelectionV2, validateReferenceSelectionV2 } = await import('../core/ref/reference-selection.ts');
  const manifest = boardPath(opts, 'omd ref check'); const artifacts = readReferenceBoardArtifacts(process.cwd(), manifest);
  if (referenceSelectionExists(process.cwd())) validateReferenceSelection(process.cwd(), manifest);
  if (preReferenceSelectionV2Exists(process.cwd())) validatePreReferenceSelectionV2(process.cwd(), manifest);
  if (referenceSelectionV2Exists(process.cwd())) validateReferenceSelectionV2(process.cwd(), manifest);
  if (artifacts.manifest.schemaVersion === 'reference-board-v3'
    && artifacts.manifest.localeContextSha256 !== null) {
    const { validateReferenceLocaleBindingCurrentness } = await import('../core/ref/reference-locale-binding.ts');
    validateReferenceLocaleBindingCurrentness(process.cwd());
  }
  // Board quality belongs to the gate the protocol already mandates. Left in a separate command, a
  // real run passed `ref check`, never ran `ref granularity`, and carried a board that was 8 of 11
  // from one source with an unresolved kinship pair all the way into typography. Audited only when
  // the framer's plan exists, so unit fixtures with two captures are not judged as boards.
  const findings = existsSync(join(process.cwd(), '.omd', 'acquisition-plan.json'))
    ? await auditBoardForCheck(artifacts.manifest)
    : [];
  if (opts.json) process.stdout.write(`${JSON.stringify(findings)}\n`);
  else if (findings.length === 0) console.log('ok');
  else for (const finding of findings) console.error(`[error] ${finding.id}: ${finding.message}\n  ${finding.refs.join('\n  ')}`);
  process.exit(findings.length > 0 ? 1 : 0);
}

async function cmdRefVerify(opts: Opts): Promise<never> {
  if (opts._.length > 1) throw new Error('usage: omd ref verify [page] [--candidate id] [--json]');
  if (process.env.OMD_PRODUCTION_OWNER_ROLE === 'omd-hand') {
    throw new Error('reference verification belongs after the source-write-only production transaction');
  }
  if (process.env.OMD_NON_PRODUCTION_ROLE && process.env.OMD_NON_PRODUCTION_ROLE !== 'omd-scout') {
    throw new Error('source-aware reference verification is not a source-free reviewer or downstream owner input');
  }
  const { verifyReferenceEvidence } = await import('../core/ref/reference-verification.ts');
  const target = opts._[0];
  const report = await verifyReferenceEvidence(process.cwd(), {
    ...(typeof opts.candidate === 'string' ? { candidateId: opts.candidate } : {}),
    ...(target === undefined ? {} : { extract: (selector: string, viewport: { width: number; height: number }) =>
      rawIrFor({ ...opts, viewport: `${viewport.width}x${viewport.height}` }, target, selector) }),
  });
  // A pipe write can outlive this turn; exiting immediately truncates large reports.
  // Drain the original bytes before preserving the verifier's existing exit status.
  await new Promise<void>((resolveWrite, rejectWrite) => {
    process.stdout.write(`${JSON.stringify(report, null, opts.json ? undefined : 2)}\n`, error => {
      if (error) rejectWrite(error);
      else resolveWrite();
    });
  });
  process.exit(report.rows.some(row => row.acquisition === 'unmeasured-geometry'
    || ('targetError' in row && row.targetError !== null)
    || (target !== undefined && 'missingAxes' in row && row.missingAxes.length > 0)) ? 1 : 0);
}

async function cmdRefLocaleBind(opts: Opts): Promise<never> {
  if (!opts.input || opts._.length > 0) {
    throw new Error('usage: omd ref locale-bind --input <reference-locale-bindings.json> [--json]');
  }
  const {
    buildReferenceLocaleBinding,
    REFERENCE_LOCALE_BINDING_EVIDENCE_PATH,
    REFERENCE_LOCALE_BINDING_PATH,
    referenceLocaleBindingSha256,
    validateReferenceLocaleBindingCurrentness,
  } = await import('../core/ref/reference-locale-binding.ts');
  const bundle = buildReferenceLocaleBinding(
    process.cwd(),
    inputJson(opts.input, 'omd ref locale-bind'),
  );
  const writer = projectWriterFromActivation(opts, 'omd ref locale-bind');
  writer.write(REFERENCE_LOCALE_BINDING_PATH, canonicalJson(bundle.projection));
  writer.write(REFERENCE_LOCALE_BINDING_EVIDENCE_PATH, canonicalJson(bundle.evidence));
  const current = validateReferenceLocaleBindingCurrentness(process.cwd());
  const output = {
    path: REFERENCE_LOCALE_BINDING_PATH,
    sha256: referenceLocaleBindingSha256(current.projection),
    bindings: current.projection.bindings.length,
  };
  if (opts.json) process.stdout.write(JSON.stringify(output));
  else console.log(`${output.path}: ${output.bindings} explicit locale-reference bindings`);
  process.exit(0);
}

async function cmdRefLocaleBindCheck(opts: Opts): Promise<never> {
  if (opts._.length > 0) throw new Error('usage: omd ref locale-bind-check [--json]');
  const {
    referenceLocaleBindingSha256,
    validateReferenceLocaleBindingCurrentness,
  } = await import('../core/ref/reference-locale-binding.ts');
  const current = validateReferenceLocaleBindingCurrentness(process.cwd());
  const output = {
    path: '.omd/reference-locale-binding.json',
    sha256: referenceLocaleBindingSha256(current.projection),
    bindings: current.projection.bindings.length,
  };
  if (opts.json) process.stdout.write(JSON.stringify(output));
  else console.log(`ok — ${output.bindings} locale-bound reference pieces are current`);
  process.exit(0);
}

/** The board audit `omd ref granularity` runs, resolved against the framer's required zones. */
async function auditBoardForCheck(board: import('../core/ref/board-contract.ts').ReferenceBoardManifest): Promise<readonly { id: string; message: string; refs: readonly string[] }[]> {
  const { loadRefs } = await import('../core/ref/store.ts');
  const { auditBoardGranularity } = await import('../core/ref/board-granularity.ts');
  const { acquisitionAuditScope } = await import('../core/ref/acquisition-audit.ts');
  return auditBoardGranularity(loadRefs(process.cwd()), { ...acquisitionAuditScope(process.cwd()), board });
}
async function cmdRefV2Check(opts: Opts): Promise<never> {
  if (!opts.input || opts._.length > 0) throw new Error('usage: omd ref v2-check --input <reference-handoff.json> [--json]');
  const { validateReferenceHandoffCurrentness } = await import('../core/ref/reference-handoff.ts');
  const receipt = validateReferenceHandoffCurrentness(process.cwd(), inputJson(opts.input, 'omd ref v2-check'));
  if (opts.json) process.stdout.write(JSON.stringify(receipt));
  else console.log('ok — canonical v2 reference handoff is current');
  process.exit(0);
}
async function cmdRefUsage(opts: Opts): Promise<never> {
  if (!opts.input || opts._.length > 0) throw new Error('usage: omd ref usage --input <reference-usage-rows.json> [--json]');
  const payload = inputJson(opts.input, 'omd ref usage');
  const usage = (await import('../core/ref/reference-usage.ts')).recordReferenceUsage(
    process.cwd(),
    payload as never,
    projectWriterFromActivation(opts, 'omd ref usage'),
  );
  if (opts.json) process.stdout.write(JSON.stringify(usage)); else console.log('.omd/reference-usage-v2.json');
  process.exit(0);
}

async function cmdRefUsageCheck(opts: Opts): Promise<never> {
  if (opts._.length > 0) throw new Error('usage: omd ref usage-check [--json]');
  const usage = (await import('../core/ref/reference-usage.ts')).validateReferenceUsage(process.cwd());
  if (opts.json) process.stdout.write(JSON.stringify(usage)); else console.log('ok — reference usage binds the current v2 capture, assembly, projection, selection, and production evidence');
  process.exit(0);
}

async function cmdRefInfluenceProof(opts: Opts): Promise<never> {
  if (!opts.input || opts._.length > 0) throw new Error('usage: omd ref influence-proof --input <reference-influence-proof.json> [--json]');
  const { readReferenceBoardArtifacts, canonicalJson } = await import('../core/ref/board-artifacts.ts');
  const { referenceSelectionV2Exists, validatePreReferenceSelectionV2, validateReferenceSelectionV2 } = await import('../core/ref/reference-selection.ts');
  const { validateReferenceInfluenceProofCurrentness } = await import('../core/ref/reference-influence-proof.ts');
  const artifacts = readReferenceBoardArtifacts(process.cwd());
  const selection = referenceSelectionV2Exists(process.cwd())
    ? validateReferenceSelectionV2(process.cwd())
    : validatePreReferenceSelectionV2(process.cwd());
  if (selection.slots.some((slot) => slot.signal === 'high-motion' && slot.rights === 'lawful' && slot.motionAxis === 'available' && slot.obligationDisposition === 'not-applicable')) throw new Error('omd ref influence-proof requires settled motion before production proof');
  const proof = validateReferenceInfluenceProofCurrentness(process.cwd(), inputJson(opts.input, 'omd ref influence-proof'), artifacts.assembly, selection);
  const path = projectWriterFromActivation(opts, 'omd ref influence-proof').write('.omd/reference-influence-proof.json', canonicalJson(proof));
  if (opts.json) process.stdout.write(JSON.stringify({ path, verdict: proof.verdict, observations: proof.observations.length }));
  else console.log(`${path}: ${proof.verdict} (${proof.observations.length} observations)`);
  process.exit(proof.verdict === 'pass' ? 0 : 1);
}

async function cmdRefVisualPacket(opts: Opts): Promise<never> {
  if (!opts.slot || opts._.length > 0) throw new Error('usage: omd ref visual-packet --slot <slot-id[,slot-id]> [--json]');
  const { referenceSelectionV2Exists, validatePreReferenceSelectionV2, validateReferenceSelectionV2 } = await import('../core/ref/reference-selection.ts');
  const { buildReferenceVisualPacket, validateReferenceVisualPacketCurrentness } = await import('../core/ref/reference-visual-packet.ts');
  const selection = referenceSelectionV2Exists(process.cwd())
    ? validateReferenceSelectionV2(process.cwd())
    : validatePreReferenceSelectionV2(process.cwd());
  if (selection.slots.some((slot) => slot.signal === 'high-motion' && slot.rights === 'lawful' && slot.motionAxis === 'available' && slot.obligationDisposition === 'not-applicable')) throw new Error('omd ref visual-packet requires a motion-settled selection');
  const slotIds = opts.slot.split(',').map((slot) => slot.trim()).filter(Boolean);
  const bundle = buildReferenceVisualPacket(process.cwd(), selection, slotIds);
  const invocation = invocationFromActivation(opts, 'omd ref visual-packet');
  for (const [relativePath, content] of bundle.assets) {
    writeContentAddressedProjectFile({ projectRoot: process.cwd(), relativePath, content, invocation });
  }
  const writer = projectWriter(invocation);
  writer.write('.omd/reference-visual-packet.json', canonicalJson(bundle.packet));
  writer.write('.omd/reference-visual-packet-evidence.json', canonicalJson(bundle.evidence));
  const current = validateReferenceVisualPacketCurrentness(process.cwd(), selection);
  if (opts.json) process.stdout.write(JSON.stringify({ packet: '.omd/reference-visual-packet.json', evidence: '.omd/reference-visual-packet-evidence.json', assets: [...current.assets.keys()] }));
  else console.log(`.omd/reference-visual-packet.json: ${current.packet.entries.length} selected no-ship geometry studies`);
  process.exit(0);
}

async function cmdRefVisualPacketCheck(opts: Opts): Promise<never> {
  if (opts._.length > 0) throw new Error('usage: omd ref visual-packet-check [--production <path[,path]>] [--json]');
  const { referenceSelectionV2Exists, validatePreReferenceSelectionV2, validateReferenceSelectionV2 } = await import('../core/ref/reference-selection.ts');
  const { assertReferenceVisualPacketNotShipped, validateReferenceVisualPacketCurrentness } = await import('../core/ref/reference-visual-packet.ts');
  const selection = referenceSelectionV2Exists(process.cwd())
    ? validateReferenceSelectionV2(process.cwd())
    : validatePreReferenceSelectionV2(process.cwd());
  const bundle = validateReferenceVisualPacketCurrentness(process.cwd(), selection);
  const productionPaths = opts.production?.split(',').map((path) => path.trim()).filter(Boolean) ?? [];
  if (productionPaths.length > 0) assertReferenceVisualPacketNotShipped(process.cwd(), bundle, productionPaths);
  if (opts.json) process.stdout.write(JSON.stringify({ status: 'pass', entries: bundle.packet.entries.length, productionPaths }));
  else console.log(`ok — selected visual packet is current${productionPaths.length > 0 ? ' and absent from named production files' : ''}`);
  process.exit(0);
}
async function cmdRefImportImage(opts: Opts): Promise<never> {
  if (opts.out !== undefined) throw new Error('omd ref import-image does not accept --out');
  const input = opts._[0]; if (input === undefined || opts._[1] !== undefined) throw new Error('usage: omd ref import-image <input.json> [--json]');
  const { persistImageFragment } = await import('../core/ref/image-fragment.ts');
  const record = persistImageFragment(process.cwd(), JSON.parse(readFileSync(resolve(input), 'utf8')), invocationFromActivation(opts, 'omd ref import-image'));
  if (opts.json) process.stdout.write(`${JSON.stringify(record)}\n`); else console.log(record.id);
  process.exit(0);
}
async function cmdRefCandidates(opts: Opts): Promise<never> {
  if (opts.json) throw new Error('omd ref candidates emits chat-ready Markdown and does not accept --json');
  const { readReferenceBoardArtifacts } = await import('../core/ref/board-artifacts.ts');
  const { formatReferenceCandidates } = await import('../core/ref/candidate-markdown.ts');
  const artifacts = readReferenceBoardArtifacts(process.cwd(), boardPath(opts, 'omd ref candidates'));
  process.stdout.write(formatReferenceCandidates(artifacts.raw, artifacts.assembly));
  process.exit(0);
}

async function cmdRefAudit(opts: Opts): Promise<never> {
  const { auditCaptureParallelism } = await import('../core/ref/capture-audit.ts');
  const a = auditCaptureParallelism(process.cwd());
  if (opts.json) process.stdout.write(`${JSON.stringify(a)}\n`);
  else console.log(`capture audit: ${a.ok ? 'OK' : 'SEQUENTIAL'} (${a.refs} refs) — ${a.reason}`);
  process.exit(a.ok ? 0 : 1);
}
async function cmdRefSelect(opts: Opts): Promise<never> {
  if (opts.out !== undefined) throw new Error('omd ref select does not accept --out');
  const candidateId = opts._[0]; if (candidateId === undefined || opts._[1] !== undefined) throw new Error('usage: omd ref select <candidate-id> [--json]');
  const invocation = invocationFromActivation(opts, 'omd ref select');
  const { selectReferenceCandidateV2Autonomously } = await import('../core/ref/reference-selection.ts');
  const { writeReferenceHandoffReceipt } = await import('../core/ref/reference-handoff.ts');
  const selection = selectReferenceCandidateV2Autonomously(process.cwd(), candidateId, invocation);
  const handoff = writeReferenceHandoffReceipt(process.cwd(), 'art-direction', invocation);
  if (opts.json) process.stdout.write(`${JSON.stringify({ selection, handoff })}\n`);
  else console.log(`selected ${selection.candidateId}; wrote ${handoff.path}`);
  process.exit(0);
}

async function cmdRefHandoff(opts: Opts): Promise<never> {
  const role = opts._[0];
  if (opts._.length !== 1 || opts.out !== undefined || opts.input !== undefined
    || (role !== 'art-direction' && role !== 'composer' && role !== 'hand')) {
    throw new Error('usage: omd ref handoff <art-direction|composer|hand> [--json]');
  }
  const { readSelectedReferenceHandoff } = await import('../core/ref/selected-handoff.ts');
  const researchExists = existsSync(resolve(process.cwd(), '.omd/reference-research.json'));
  const currentRoute = researchExists
    ? readPersistedRoute(process.cwd(), invocationFromActivation(opts, 'omd ref handoff'))
    : undefined;
  const result = readSelectedReferenceHandoff(process.cwd(), role, currentRoute === undefined ? undefined : {
    sourceContractSha256: currentRoute.sourceContractSha256,
    request: currentRoute.request,
  });
  await new Promise<void>((done, reject) => {
    process.stdout.write(`${JSON.stringify(result, null, opts.json ? undefined : 2)}\n`, error => error ? reject(error) : done());
  });
  process.exit(0);
}

// ── Figma commands ────────────────────────────────────────────────────────────

async function cmdFigmaPull(url: string | undefined, opts: Opts): Promise<never> {
  if (!url) {
    console.error('usage: omd figma pull <file-url>');
    process.exit(1);
  }

  const token = process.env['FIGMA_TOKEN'];
  if (!token) {
    console.error('FIGMA_TOKEN environment variable is not set.\nSet it to a Figma personal access token to use figma pull.');
    process.exit(1);
  }

  const { parseFileKey, fetchAndNormalize } = await import('../core/figma/client.ts');

  let fileKey: string;
  try {
    fileKey = parseFileKey(url);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  console.log(`Fetching Figma file ${fileKey} …`);
  const snapshot = await fetchAndNormalize(fileKey, token);

  const outDir = join(process.cwd(), '.omd', 'figma');
  const snapPath = join(outDir, 'snapshot.json');
  projectWriterFromActivation(opts, 'omd figma pull').write(relative(process.cwd(), snapPath), JSON.stringify(snapshot, null, 2));

  // Human-readable inventory
  const totalFrames = snapshot.pages.reduce((n, p) => n + p.frames.length, 0);
  const setCount = Object.keys(snapshot.componentSets).length;
  console.log(`\nFile: ${snapshot.fileName}`);
  for (const page of snapshot.pages) {
    console.log(`  Page "${page.name}" — ${page.frames.length} frame${page.frames.length === 1 ? '' : 's'}`);
    for (const frame of page.frames) {
      console.log(`    • ${frame.name}`);
    }
  }
  console.log(`\nTotal frames: ${totalFrames}  Component sets: ${setCount}`);
  if (setCount > 0) {
    for (const cs of Object.values(snapshot.componentSets)) {
      const keys = new Set<string>();
      for (const v of cs.variants) {
        const { parseVariantName } = await import('../core/figma/system.ts');
        for (const k of Object.keys(parseVariantName(v.name))) keys.add(k);
      }
      const desc = keys.size > 0 ? ` (${[...keys].join('×')})` : '';
      console.log(`  • ${cs.name} — ${cs.variants.length} variant${cs.variants.length === 1 ? '' : 's'}${desc}`);
    }
  }
  console.log(`\nSnapshot saved: ${snapPath}`);
  process.exit(0);
}

async function cmdFigmaSystem(opts: Opts): Promise<never> {
  const snapPath = join(process.cwd(), '.omd', 'figma', 'snapshot.json');
  if (!existsSync(snapPath)) {
    console.error(`No snapshot found at ${snapPath}\nRun \`omd figma pull <file-url>\` first.`);
    process.exit(1);
  }

  const { buildComponentMatrix, extractTokens, generateCss, generateMarkdown } = await import('../core/figma/system.ts');
  const snapshot = JSON.parse(readFileSync(snapPath, 'utf8')) as import('../core/figma/types.ts').FigmaSnapshot;

  const tokens = extractTokens(snapshot);
  const matrix = buildComponentMatrix(snapshot);
  const css = generateCss(tokens);
  const md = generateMarkdown(tokens, matrix, snapshot.fileName);

  const outDir = join(process.cwd(), '.omd', 'figma');
  const cssPath = join(outDir, 'tokens.css');
  const mdPath = join(outDir, 'design-system.md');
  const adapter = projectWriterFromActivation(opts, 'omd figma system');
  adapter.write('.omd/figma/tokens.css', css);
  adapter.write('.omd/figma/design-system.md', md);

  console.log(`Design system synthesized from: ${snapshot.fileName}`);
  console.log(`  Colors:     ${tokens.colors.length}`);
  console.log(`  Type scale: ${tokens.typeScale.length} steps`);
  console.log(`  Spacing:    ${tokens.spacing.length} values`);
  console.log(`  Radii:      ${tokens.radii.length} values`);
  console.log(`  Shadows:    ${tokens.shadows.length} values`);
  console.log(`  Components: ${matrix.length} set${matrix.length === 1 ? '' : 's'}`);
  console.log(`\n  ${cssPath}`);
  console.log(`  ${mdPath}`);
  process.exit(0);
}

async function cmdFigmaDiff(opts: Opts): Promise<never> {
  const frameId = opts._[0];
  const pageOrUrl = opts._[1];

  if (!frameId || !pageOrUrl) {
    console.error(
      'usage: omd figma diff <frame-id> <page-or-url> [--threshold 0.97] [--fresh] [--json]',
    );
    process.exit(1);
  }
  const adapter = projectWriterFromActivation(opts, 'omd figma diff');
  const { authorizeFigmaArtifact, createFigmaArtifactAuthoritySession } = await import('../core/figma/artifact-authority.ts');
  const artifactAuthority = createFigmaArtifactAuthoritySession(process.cwd(), adapter);

  const threshold =
    opts.threshold !== undefined ? parseFloat(opts.threshold) : 0.97;
  if (isNaN(threshold) || threshold < 0 || threshold > 1) {
    console.error('--threshold must be a number between 0 and 1');
    process.exit(1);
  }

  const fresh = opts.fresh === true;
  const jsonOut = opts.json === true;

  // Load snapshot — frame dimensions and file key live here.
  const snapPath = join(process.cwd(), '.omd', 'figma', 'snapshot.json');
  if (!existsSync(snapPath)) {
    console.error(
      `No snapshot found at ${snapPath}\nRun \`omd figma pull <file-url>\` first.`,
    );
    process.exit(1);
  }

  const snapshotBytes = readFileSync(snapPath);
  const snapshot = JSON.parse(
    snapshotBytes.toString('utf8'),
  ) as import('../core/figma/types.ts').FigmaSnapshot;

  // Locate frame in snapshot.
  let foundFrame: import('../core/figma/types.ts').SnapshotFrame | undefined;
  for (const page of snapshot.pages) {
    const f = page.frames.find((fr) => fr.id === frameId);
    if (f !== undefined) { foundFrame = f; break; }
  }

  if (foundFrame === undefined) {
    console.error(`Frame ID "${frameId}" not found in snapshot.\nKnown frames:`);
    for (const page of snapshot.pages) {
      for (const fr of page.frames) {
        console.error(`  ${fr.id}  ${fr.name}`);
      }
    }
    process.exit(1);
  }

  // Frame dimensions come from the root node's absoluteBoundingBox.
  // collectNodes() always puts the frame node first (index 0).
  const rootNode = foundFrame.nodes[0];
  if (rootNode?.absoluteBoundingBox === undefined) {
    console.error(
      `Frame "${foundFrame.name}" (${frameId}) has no absoluteBoundingBox in snapshot.\n`
      + 'Re-run `omd figma pull` to refresh the snapshot.',
    );
    process.exit(1);
  }

  const { width: frameW, height: frameH } = rootNode.absoluteBoundingBox;

  // ── Step 1: reference PNG (cache or live export) ──────────────────────────

  const safeId = frameId.replace(/[:/]/g, '_');
  const exportsDir = join(process.cwd(), '.omd', 'figma', 'exports');
  const cachePath = join(exportsDir, `${safeId}.png`);
  const { figmaArtifactMatchesReceipt, figmaArtifactReceipt } = await import('../core/figma/artifact-lifecycle.ts');
  const currentExport = figmaArtifactMatchesReceipt(cachePath, 'export', snapshotBytes);

  if (!fresh && currentExport) {
    if (!jsonOut) console.log(`Using cached export: ${cachePath}`);
  } else {
    if (existsSync(cachePath)) {
      console.error(`Refusing to replace an existing Figma deliverable without current-task write authority: ${cachePath}`);
      process.exit(1);
    }
    const token = process.env['FIGMA_TOKEN'];
    if (token === undefined || token.length === 0) {
      console.error(
        'FIGMA_TOKEN environment variable is not set.\n'
        + 'Set it to a Figma personal access token to export frames.',
      );
      process.exit(1);
    }

    if (!jsonOut) console.log(`Exporting frame ${frameId} from Figma …`);

    const imgRes = await fetch(
      `https://api.figma.com/v1/images/${snapshot.fileKey}`
      + `?ids=${encodeURIComponent(frameId)}&format=png&scale=1`,
      { headers: { 'X-Figma-Token': token } },
    );
    if (!imgRes.ok) {
      const body = await imgRes.text().catch(() => '');
      console.error(`Figma image export failed (${imgRes.status}): ${body.slice(0, 300)}`);
      process.exit(1);
    }

    const imgData = (await imgRes.json()) as {
      err?: string;
      images?: Record<string, string | null>;
    };
    if (imgData.err !== undefined && imgData.err !== null) {
      console.error(`Figma image export error: ${imgData.err}`);
      process.exit(1);
    }

    const tempUrl = imgData.images?.[frameId];
    if (tempUrl === undefined || tempUrl === null) {
      console.error(`No image URL returned for frame ${frameId}`);
      process.exit(1);
    }

    const pngRes = await fetch(tempUrl);
    if (!pngRes.ok) {
      console.error(`Failed to download PNG (${pngRes.status}): ${tempUrl}`);
      process.exit(1);
    }

    const pngBytes = Buffer.from(await pngRes.arrayBuffer());
    adapter.write(relative(process.cwd(), cachePath), pngBytes);
    adapter.write(relative(process.cwd(), `${cachePath}.omd.json`), figmaArtifactReceipt({
      kind: 'export', frameId, snapshotBytes, pngBytes,
    }));
    authorizeFigmaArtifact(artifactAuthority, { kind: 'export', frameId, pngPath: cachePath, snapshotBytes });
    if (!jsonOut) console.log(`Exported: ${cachePath}`);
  }

  // ── Step 2: render build at exact frame dimensions ────────────────────────

  if (!jsonOut) {
    console.log(`Rendering ${pageOrUrl} at ${Math.round(frameW)}×${Math.round(frameH)} …`);
  }

  const { renderPage } = await import('../core/render/index.ts');
  const rendersDir = join(process.cwd(), '.omd', 'figma', 'renders');
  adapter.mkdir(relative(process.cwd(), rendersDir));
  const renderPath = join(rendersDir, `${safeId}.png`);
  if (existsSync(renderPath)) {
    console.error(`Refusing to replace an existing Figma deliverable without current-task write authority: ${renderPath}`);
    process.exit(1);
  }

  await renderPage(pageOrUrl, {
    viewport: { width: Math.round(frameW), height: Math.round(frameH) },
    out: renderPath,
    adapter,
  });
  const buildBuf = readFileSync(renderPath);
  adapter.write(relative(process.cwd(), `${renderPath}.omd.json`), figmaArtifactReceipt({
    kind: 'render', frameId, snapshotBytes, pngBytes: buildBuf,
  }));
  authorizeFigmaArtifact(artifactAuthority, { kind: 'render', frameId, pngPath: renderPath, snapshotBytes });

  // ── Step 3: pixel diff ────────────────────────────────────────────────────

  const { compareImages, formatDiffReport } = await import('../core/figma/diff.ts');
  const refBuf = readFileSync(cachePath);

  const result = compareImages(refBuf, buildBuf, threshold);

  if (jsonOut) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n' + formatDiffReport(result));
  }

  process.exit(result.pass ? 0 : 1);
}

/**
 * `omd design [--check]`
 *
 * Without --check: discover repo evidence, then create or refresh `.omd/design.md`.
 * If the file already exists its preamble is preserved and only missing sections are
 * appended; a fresh project gets the full generated template.
 *
 * With --check: validate the existing design.md against the required section schema
 * and the Interaction states enumeration contract. Exits 1 when violations are found.
 * Only active when .omd/design.md exists; a bare project is not nagged.
 */
async function cmdDesign(opts: Opts): Promise<never> {
  const omdDir = join(process.cwd(), '.omd');
  const designPath = join(omdDir, 'design.md');

  if (opts.check) {
    if (!existsSync(designPath)) {
      console.log('No .omd/design.md found. Run `omd design` to create the design contract.');
      process.exit(0);
    }
    const md = readFileSync(designPath, 'utf8');
    const violations = validateDesignMd(md);
    if (opts.json) {
      process.stdout.write(JSON.stringify(violations));
    } else {
      for (const v of violations) {
        console.log(`[${v.severity}] ${v.id} ${v.path}: ${v.message}`);
      }
      if (violations.length === 0) console.log('ok — design.md passes all section checks');
    }
    process.exit(violations.length > 0 ? 1 : 0);
  }

  // Discover → generate/refresh
  const evidence = discoverEvidence(process.cwd());

  if (existsSync(designPath)) {
    // Refresh: report evidence summary and note that the file already exists.
    // We do not overwrite the user's work; instead we report what was found so
    // they can update the open questions manually.
    const existing = readFileSync(designPath, 'utf8');
    const violations = validateDesignMd(existing);
    console.log(`design.md already exists: ${designPath}`);
    console.log(`\nEvidence scan:`);
    console.log(`  framework:   ${evidence.framework ?? 'unknown'}`);
    console.log(`  surfaces:    ${evidence.surfaceCount}`);
    console.log(`  app/tooling: ${evidence.appEvidencePaths.length > 0 ? evidence.appEvidencePaths.join(', ') : 'none found'}`);
    console.log(`  tokens:      ${evidence.hasThemeTokens ? evidence.tokenFilePaths.join(', ') : 'none found'}`);
    console.log(`  references:  ${evidence.captureCount}`);
    console.log(`  frame.md:    ${evidence.frameMd ? 'present' : 'absent'}`);
    console.log(`  motion-spec: ${evidence.hasMotionSpec ? 'present' : 'absent'}`);
    console.log(`  voice-study: ${evidence.hasVoiceStudy ? 'present' : 'absent'}`);
    if (violations.length > 0) {
      console.log(`\n${violations.length} section check${violations.length === 1 ? '' : 's'} failed:`);
      for (const v of violations) {
        console.log(`  [${v.severity}] ${v.id}: ${v.message}`);
      }
      console.log('\nRun `omd design --check` to re-validate after updates.');
    } else {
      console.log('\nAll required sections present. Run `omd design --check` to re-validate.');
    }
    process.exit(0);
  }

  // Create fresh design.md
  const content = generateDesignMd(evidence);
  projectWriterFromActivation(opts, 'omd design').write(relative(process.cwd(), designPath), content);

  console.log(`Created: ${designPath}`);
  console.log(`\nEvidence used:`);
  console.log(`  framework:   ${evidence.framework ?? 'unknown'}`);
  console.log(`  surfaces:    ${evidence.surfaceCount}`);
  console.log(`  app/tooling: ${evidence.appEvidencePaths.length > 0 ? evidence.appEvidencePaths.join(', ') : 'none found'}`);
  console.log(`  tokens:      ${evidence.hasThemeTokens ? evidence.tokenFilePaths.join(', ') : 'none found'}`);
  console.log(`  references:  ${evidence.captureCount}`);
  console.log(`  frame.md:    ${evidence.frameMd ? 'present' : 'absent'}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Fill in the open questions in .omd/design.md`);
  console.log(`  2. Run \`omd design --check\` to validate section coverage`);
  console.log(`  3. Cite design.md sections in every hand decision`);
  process.exit(0);
}

/** Copy-deck structure and current-byte copy-eye review gates; neither judges prose quality or blindness. */
async function cmdCopy(opts: Opts): Promise<never> {
  const v2 = (opts._[0] === 'v2-check' && opts._.length === 1) || (opts._[0] === 'v2' && opts._[1] === 'check' && opts._.length === 2);
  const reviewPublish = opts._[0] === 'review-publish' && opts._.length === 1;
  const reviewInput = opts._[0] === 'review-input' && opts._.length === 1;
  if ((opts.check ? 1 : 0) + (opts.reviewCheck ? 1 : 0) + (v2 ? 1 : 0) + (reviewPublish ? 1 : 0) + (reviewInput ? 1 : 0) !== 1) {
    throw new Error('usage: omd copy --check [--json] | omd copy review-input --json | omd copy --review-check [--json] | omd copy review-publish --input <copy-eye.md> [--json] | omd copy v2 check [--json]');
  }
  if (reviewInput) {
    const { copyReviewInput } = await import('../core/copy/review-input.ts');
    process.stdout.write(JSON.stringify(copyReviewInput(process.cwd())));
    process.exit(0);
  }

  if (reviewPublish) {
    if (!opts.input) throw new Error('usage: omd copy review-publish --input <copy-eye.md> [--json]');
    const content = readFileSync(resolve(opts.input), 'utf8');
    const deckPath = join(process.cwd(), '.omd', 'copy-deck.md');
    const violations = validateCopyReviewReportForDeck(content, existsSync(deckPath) ? readFileSync(deckPath) : undefined);
    if (violations.length > 0) {
      if (opts.json) process.stdout.write(JSON.stringify(violations));
      else for (const violation of violations) console.error(`[error] ${violation.id} ${violation.path}: ${violation.message}`);
      process.exit(1);
    }
    const path = '.omd/.cache/copy-eye.md';
    const writer = projectWriterFromActivation(opts, 'omd copy review-publish');
    writer.mkdir('.omd/.cache');
    writer.write(path, content);
    if (opts.json) process.stdout.write(JSON.stringify({ path }));
    else console.log(path);
    process.exit(0);
  }

  if (opts.reviewCheck) {
    const path = join(process.cwd(), '.omd', '.cache', 'copy-eye.md');
    const deckPath = join(process.cwd(), '.omd', 'copy-deck.md');
    const violations = validateCurrentCopyReview(
      existsSync(path) ? readFileSync(path, 'utf8') : '',
      existsSync(deckPath) ? readFileSync(deckPath) : undefined,
    );
    if (opts.json) process.stdout.write(JSON.stringify(violations));
    else {
      for (const violation of violations) console.log(`[error] ${violation.id} ${violation.path}: ${violation.message}`);
      if (violations.length === 0) console.log('ok — copy-eye.md reviews the current copy-deck bytes; blindness and semantic quality are not proven');
    }
    process.exit(violations.length > 0 ? 1 : 0);
  }

  const path = join(process.cwd(), '.omd', 'copy-deck.md');
  const content = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const direction = v2 ? currentArtDirection(process.cwd()) : undefined;
  const intentPointer = v2
    ? validateIntentCurrentPointer(inputJson(join(process.cwd(), '.omd', 'intent-current.json'), 'intent current pointer'))
    : undefined;
  const beatExceptionReceiptSha256 = v2
    ? resolveCurrentUserBeatExceptionReceipt(validateIntentLedger(inputJson(join(process.cwd(), '.omd', intentPointer!.record), 'intent immutable record')))
      ?? NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256
    : undefined;
  if (v2 && direction!.decision.currentUserBeatExceptionReceiptSha256 !== beatExceptionReceiptSha256) {
    throw new Error('COPY_ART_DIRECTION_BEAT_EXCEPTION_STALE: current art direction does not bind the authorized current-user Beat-exception receipt');
  }
  const violations = v2
    ? [
      ...validateCopyDeckV2(content),
      ...validateCopyDeckV2AgainstSelectedArtDirection(content, {
        selectedRegister: direction!.decision.selectedRegister,
        motionDecision: direction!.decision.motionDecision,
        beatIds: direction!.beatIds,
        currentUserBeatExceptionReceiptSha256: beatExceptionReceiptSha256!,
      }),
    ]
    : validateCopyDeck(content);
  if (opts.json) process.stdout.write(JSON.stringify(violations));
  else {
    for (const violation of violations) console.log(`[error] ${violation.id} ${violation.path}: ${violation.message}`);
    if (violations.length === 0) console.log(v2 ? 'ok — copy-deck.md matches the selected v2 art-direction record' : 'ok — copy-deck.md passes all structural checks');
  }
  process.exit(violations.length > 0 ? 1 : 0);
}

async function cmdReview(mode: string | undefined, opts: Opts): Promise<never> {
  if (mode === 'evidence-projection') {
    if (!opts.input || opts._.length > 0) {
      throw new Error('usage: omd review evidence-projection --input <observation-projection-input.json> [--json]');
    }
    const {
      buildDesignQualityObservationProjection,
    } = await import('../core/evidence/final-v2-browser-observations.ts');
    const { nodeStableProjectFileSystem } = await import('../core/runtime/stable-project-file.ts');
    const projection = buildDesignQualityObservationProjection(
      process.cwd(),
      nodeStableProjectFileSystem(),
      inputJson(opts.input, 'omd review evidence-projection'),
    );
    if (opts.json) process.stdout.write(JSON.stringify(projection));
    else console.log(JSON.stringify(projection, null, 2));
    process.exit(0);
  }
  if (mode === 'final-packet') {
    if (!opts.input || opts._.length > 0) {
      throw new Error('usage: omd review final-packet --input <packet-input.json> --activation <host-issued-invocation.json> [--json]');
    }
    const invocation = invocationFromActivation(opts, 'omd review final-packet');
    requireSourceBoundProofCurrentness(process.cwd());
    const { publishFinalRenderReviewerPacket } = await import('../core/runtime/final-render-review.ts');
    const result = publishFinalRenderReviewerPacket({
      root: process.cwd(),
      invocation,
      writer: projectWriter(invocation),
      packetInput: inputJson(opts.input, 'omd review final-packet'),
    });
    if (opts.json) process.stdout.write(JSON.stringify(result));
    else console.log(result.path);
    process.exit(0);
  }
  if ((mode !== 'publish' && mode !== 'repair-publish' && mode !== 'refinement-publish') || !opts.input || opts._.length > 0) {
    throw new Error('usage: omd review evidence-projection|final-packet|publish|repair-publish|refinement-publish --input <input.json> [--activation <host-issued-invocation.json>] [--json]');
  }
  const publicKeyPath = process.env.OMD_CODEX_AUTHORITY_PUBLIC_KEY_PATH;
  if (publicKeyPath === undefined) throw new Error('FINAL_REVIEW_ROLE_AUTHORITY_REJECTED: trusted Codex host is required');
  const command = `omd review ${mode}`;
  const invocation = invocationFromActivation(opts, command);
  const {
    buildFinalReviewerPublication,
    buildProductionRepairReviewPublication,
  } = await import('../adapters/final-reviewer-publication.ts');
  if (mode === 'refinement-publish') {
    const { buildRefinementReviewerPublication } = await import('../adapters/refinement-reviewer-publication.ts');
    const publication = buildRefinementReviewerPublication(inputJson(opts.input, command), {
      projectRoot: process.cwd(),
      buildSha256: invocation.current.buildSha256,
      briefSha256: invocation.current.briefSha256,
      publicKeyPath,
      invocation,
    });
    requireFinalReviewerLaneAuthorization(invocation, process.cwd(), publication.review.bytes);
    const writer = projectWriter(invocation);
    for (const execution of publication.executions) writer.writeContentAddressed(execution.path, execution.bytes);
    writer.writeContentAddressed(publication.review.path, publication.review.bytes);
    if (opts.json) process.stdout.write(JSON.stringify({ path: publication.review.path, sha256: publication.review.sha256 }));
    else console.log(publication.review.path);
    process.exit(0);
  }
  if (mode === 'repair-publish') {
    const artifact = buildProductionRepairReviewPublication(inputJson(opts.input, command), {
      projectRoot: process.cwd(),
      publicKeyPath,
    });
    requireFinalReviewerLaneAuthorization(invocation, process.cwd(), artifact.bytes);
    projectWriter(invocation).writeContentAddressed(artifact.path, artifact.bytes);
    if (opts.json) process.stdout.write(JSON.stringify({ path: artifact.path, sha256: artifact.sha256 }));
    else console.log(artifact.path);
    process.exit(0);
  }
  requireSourceBoundProofCurrentness(process.cwd());
  const publication = buildFinalReviewerPublication(inputJson(opts.input, 'omd review publish'), {
    projectRoot: process.cwd(),
    buildSha256: invocation.current.buildSha256,
    briefSha256: invocation.current.briefSha256,
    publicKeyPath,
    invocation,
  });
  const writer = projectWriter(invocation);
  for (const artifact of [...publication.executions, publication.lane]) {
    requireFinalReviewerLaneAuthorization(invocation, process.cwd(), artifact.bytes);
    writer.writeContentAddressed(artifact.path, artifact.bytes);
  }
  const result = {
    lane: { path: publication.lane.path, sha256: publication.lane.sha256 },
    executions: publication.executions.map(({ path, sha256: digest }) => ({ path, sha256: digest })),
  };
  if (opts.json) process.stdout.write(JSON.stringify(result));
  else console.log(`${publication.lane.path} (${publication.executions.length} independent Eye executions)`);
  process.exit(0);
}

async function cmdOwner(mode: string | undefined, opts: Opts): Promise<never> {
  if (mode !== 'mirror' || !opts.out || opts._.length > 0) {
    throw new Error('usage: omd owner mirror --out <private-parent-directory> [--activation <host-issued-invocation.json>] [--json]');
  }
  const invocation = invocationFromActivation(opts, 'omd owner mirror');
  const { createProductionRepairMirror } = await import('../core/runtime/production-repair.ts');
  const result = createProductionRepairMirror({
    root: process.cwd(),
    invocation,
    parent: resolve(opts.out),
  });
  if (opts.json) process.stdout.write(JSON.stringify(result));
  else console.log(result.mirrorRoot);
  process.exit(0);
}

/** `omd composition --check [--json]` — structural/freshness gate for composition.md. */
function cmdComposition(opts: Opts): never {
  if (!opts.check) throw new Error('usage: omd composition --check [--activation <host-issued-invocation.json>] [--json]');
  const projectRoot = process.cwd();
  const adaptive = existsSync(join(projectRoot, '.omd', 'route.json'));
  const invocation = adaptive ? invocationFromActivation(opts, 'omd composition --check') : undefined;
  const findings = validateCompositionContract(projectRoot, invocation);
  if (findings.length === 0 && !adaptive) {
    try {
      currentArtDirection(projectRoot);
      requireDecisionBoundHandoffs(projectRoot);
    } catch (error) {
      findings.push({
        id: 'COMPOSITION-STALE',
        path: '.omd/reference-handoffs/composer.json',
        message: `decision-bound handoff lineage is stale: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  if (opts.json) process.stdout.write(JSON.stringify(findings));
  else {
    for (const finding of findings) console.log(`[error] ${finding.id} ${finding.path}: ${finding.message}`);
    if (findings.length === 0) console.log('ok — composition.md passes structure and freshness checks');
  }
  process.exit(findings.length > 0 ? 1 : 0);
}

function cmdCapture(opts: Opts): never {
  if (!opts.check || !opts.input) {
    throw new Error('usage: omd capture --check --input <settled-capture-receipt.json> [--json]');
  }
  const value: unknown = JSON.parse(readFileSync(resolve(opts.input), 'utf8'));
  const findings = validateSettledCaptureReceipt(process.cwd(), value);
  if (opts.json) process.stdout.write(JSON.stringify(findings));
  else {
    for (const finding of findings) console.log(`[error] ${finding.id} ${finding.path}: ${finding.message}`);
    if (findings.length === 0) console.log('ok — settled capture receipt is fixed-viewport, ordered, visible, and pixel-coherent');
  }
  process.exit(findings.length > 0 ? 1 : 0);
}

function cmdOptical(opts: Opts): never {
  if (!opts.input) throw new Error('usage: omd optical --input <raw-optical-evidence.json> [--json]');
  const bytes = readFileSync(resolve(opts.input));
  const value: unknown = JSON.parse(bytes.toString('utf8'));
  const result = validateOpticalAdmission(value, bytes);
  if (opts.json) process.stdout.write(JSON.stringify(result));
  else console.log(`Q/I ${result.ratio.toFixed(6)}${result.pass === null ? ' diagnostic' : result.pass ? ' PASS' : ' FAIL'}`);
  process.exit(result.pass === false ? 1 : 0);
}

function cmdPacket(opts: Opts): never {
  if (!opts.check || !opts.input) throw new Error('usage: omd packet --check --input <anonymous-candidate-packet.json> [--json]');
  const value: unknown = JSON.parse(readFileSync(resolve(opts.input), 'utf8'));
  const findings = validateAnonymousCandidatePacket(process.cwd(), value);
  if (opts.json) process.stdout.write(JSON.stringify(findings));
  else {
    for (const finding of findings) console.log(`[error] ${finding.id} ${finding.path}: ${finding.message}`);
    if (findings.length === 0) console.log('ok — anonymous candidate packet is complete, byte-bound, and identity-clean');
  }
  process.exit(findings.length > 0 ? 1 : 0);
}

function sourceBoundProofFindings(root: string): ReturnType<typeof validateSourceBoundProofCurrentness> {
  const typeProof = existsSync(join(root, '.omd', 'type-proof.md'));
  const composition = existsSync(join(root, '.omd', 'composition.md'));
  return typeProof || composition ? validateSourceBoundProofCurrentness(root) : [];
}

function requireSourceBoundProofCurrentness(root: string): void {
  const findings = sourceBoundProofFindings(root);
  if (findings.length > 0) {
    throw new Error(`SOURCE_BOUND_PROOF_CURRENTNESS_RED:${JSON.stringify(findings)}`);
  }
}

function cmdProof(mode: string | undefined, opts: Opts): never {
  if (mode === 'revision' && opts.input) {
    const revisionSha256 = servedProjectTreeSha256(process.cwd(), opts.input);
    if (opts.json) process.stdout.write(JSON.stringify({ entry: opts.input, revisionSha256 }));
    else console.log(revisionSha256);
    process.exit(0);
  }
  if (!opts.check) throw new Error('usage: omd proof --check [--json]');
  const findings = validateSourceBoundProofCurrentness(process.cwd());
  if (opts.json) process.stdout.write(JSON.stringify(findings));
  else {
    for (const finding of findings) console.log(`[error] ${finding.id} ${finding.path}: ${finding.message}`);
    if (findings.length === 0) console.log('ok — type and composition proofs bind the current production revision');
  }
  process.exit(findings.length > 0 ? 1 : 0);
}

/** Schema lint of the domain-analysis artifact; advisory-adjacent — exits 1 on an invalid brief. */
function cmdDomain(mode: string | undefined, opts: Opts): never {
  if (mode !== 'check') throw new Error('usage: omd domain check [--input <domain-brief.json>] [--json]');
  const file = opts.input ?? join(process.cwd(), '.omd', 'domain-brief.json');
  let planning: readonly string[] = [];
  try {
    planning = unconfirmedPlanningStatements(validateDomainBrief(inputJson(file, 'omd domain check')).planning);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (opts.json) process.stdout.write(JSON.stringify({ ok: false, error: message }));
    else console.error(`[error] ${message}`);
    process.exit(1);
  }
  if (opts.json) process.stdout.write(JSON.stringify({ ok: true, meaning: 'structure-only', unconfirmedPlanning: planning,
    next: planning.length ? 'omd stage next --json' : 'omd brief frame --json' }));
  else console.log(`ok — domain-brief structure is valid${planning.length ? `; planning still needs user evidence: ${planning.join(', ')} (omd stage next --json)` : ''}`);
  process.exit(0);
}

/** Verifies a generated part actually reproduced the craft of the reference it claims (the how-gap gate). */
function cmdCraftFidelity(mode: string | undefined, opts: Opts): never {
  if (mode !== 'check' || !opts.input) throw new Error('usage: omd craft-fidelity check --input <pair.json>  ({ reference, generated } reference-craft-v1 records) [--json]');
  const payload = inputJson(opts.input, 'omd craft-fidelity check');
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) throw new Error('omd craft-fidelity check input must be an object with `reference` and `generated`');
  const { reference, generated } = payload as Record<string, unknown>;
  try {
    const result = verifyCraftReproduction(validateReferenceCraft(reference), validateReferenceCraft(generated));
    if (opts.json) process.stdout.write(JSON.stringify(result));
    else console.log(`ok — reproduction reproduced the reference craft (energy ratio ${result.energyRatio})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (opts.json) process.stdout.write(JSON.stringify({ ok: false, error: message }));
    else console.error(`[error] ${message}`);
    process.exit(1);
  }
  process.exit(0);
}

/** Measures a `reference-craft-v1` from a real browser (role ② craft acquisition). */
async function cmdCraftCapture(opts: Opts): Promise<never> {
  const target = opts._[0];
  if (!target || !opts.as || !opts.technique) {
    throw new Error('usage: omd craft-capture <url|file> --as <slug> --technique "<name>" [--selector <css>] [--viewport WxH] [--json]');
  }
  const { parseViewport } = await import('../core/render/index.ts');
  const { captureReferenceCraft } = await import('../core/ref/reference-craft-capture.ts');
  const craft = await captureReferenceCraft(target, {
    source: target,
    as: opts.as,
    technique: opts.technique,
    selector: opts.selector ?? null,
    viewport: parseViewport(opts.viewport ?? '1440x900'),
  });
  if (opts.json) process.stdout.write(JSON.stringify(craft));
  else console.log(`${craft.as}: peakEnergy ${craft.motion.peakEnergy}, scrollLinked ${craft.motion.scrollLinked}, reducedMotionSafe ${craft.motion.reducedMotionSafe} (${craft.technique})`);
  process.exit(0);
}

/**
 * Gates the "captured role-② craft declined to stillness" under-reach: reads the captured reference
 * signatures, measures the built page in a real browser, and fails when a persuasion surface that
 * captured scroll-linked craft ships static.
 */
async function cmdCraftUsage(opts: Opts): Promise<never> {
  const target = opts._[0];
  if (!target) throw new Error('usage: omd craft-usage <page> [--surface marketing|product|…] [--refs <dir>] [--selector <css>] [--viewport WxH] [--json]');
  const { readCapturedCraftSignals, hasCapturedScrollCraft, checkCraftUsage, EXEMPT_SURFACES } = await import('../core/ref/craft-usage.ts');
  const { parseViewport } = await import('../core/render/index.ts');
  const { captureReferenceCraft } = await import('../core/ref/reference-craft-capture.ts');
  const refsDir = opts.refs ?? join(process.cwd(), '.omd', 'refs');
  const signals = readCapturedCraftSignals(refsDir);
  const capturedScrollCraft = hasCapturedScrollCraft(signals);
  const built = await captureReferenceCraft(target, {
    source: target,
    as: 'built',
    technique: 'as shipped',
    selector: opts.selector ?? null,
    viewport: parseViewport(opts.viewport ?? '1440x900'),
  });
  const surface = opts.surface ?? 'marketing';
  const finding = checkCraftUsage({ surface, capturedScrollCraft, builtScrollLinked: built.motion.scrollLinked });
  const payload = {
    surface,
    refs: signals.length,
    capturedScrollCraft,
    built: { peakEnergy: built.motion.peakEnergy, scrollLinked: built.motion.scrollLinked },
    findings: finding ? [finding] : [],
  };
  if (opts.json) process.stdout.write(JSON.stringify(payload));
  else if (finding) console.error(`[error] ${finding.id} (surface=${surface}, refs=${signals.length}, built peakEnergy=${built.motion.peakEnergy}, scrollLinked=${built.motion.scrollLinked}): ${finding.message}`);
  else {
    const reason = EXEMPT_SURFACES.has(surface)
      ? 'surface is exempt — its correct risk is functional'
      : capturedScrollCraft ? 'captured scroll craft is reproduced in the build' : 'no captured scroll craft to reproduce';
    console.log(`ok — ${reason} (surface=${surface}, refs=${signals.length})`);
  }
  process.exit(finding ? 1 : 0);
}

/**
 * Installs a recipe's real source into the project instead of asking the build to reimplement it
 * from the knowledge-pack document — the step that closes the "seeing is not building" gap.
 */
async function cmdRecipe(mode: string | undefined, opts: Opts): Promise<never> {
  const packRoot = join(root, 'core');
  const { listRecipes, loadRecipe, installRecipe } = await import('../core/recipe/store.ts');
  const { materializeRecipe } = await import('../core/recipe/materialize.ts');

  if (mode === 'list') {
    const refs = listRecipes(packRoot);
    if (opts.json) process.stdout.write(JSON.stringify(refs.map((r) => ({ name: r.name, family: r.family }))));
    else for (const ref of refs) console.log(`  ${ref.family.padEnd(12)} ${ref.name}`);
    process.exit(0);
  }

  const name = opts._[0];
  if (!name || (mode !== 'show' && mode !== 'add')) {
    throw new Error('usage: omd recipe list [--json] | omd recipe show <name> [--stack react|vanilla] [--json] | omd recipe add <name> [--stack react|vanilla] [--out <dir>] [--json]');
  }
  const stack = opts.stack === 'react' ? 'react' : 'vanilla';

  if (mode === 'show') {
    const result = materializeRecipe(loadRecipe(packRoot, name), { stack });
    if (opts.json) process.stdout.write(JSON.stringify(result));
    else {
      for (const file of result.files) console.log(`── ${file.path} ──\n${file.contents}`);
      for (const note of result.notes) console.log(`note: ${note}`);
    }
    process.exit(0);
  }

  const outDir = opts.out ?? join(process.cwd(), 'src', 'omd');
  const invocation = invocationFromActivation(opts, 'omd recipe add');
  const result = installRecipe(packRoot, name, {
    stack,
    outDir,
    writer: projectWriter(invocation),
    beforeWrite: targets => {
      // Validate the actual canonical destinations, including /var vs /private/var aliases,
      // before the first write. This CLI boundary does not depend on Pi's tool_call hook.
      if (!existsSync(join(process.cwd(), '.omd/route.json'))) return;
      const readiness = checkProductionReadiness(process.cwd(), invocation, packRoot,
        targets.map(path => relative(process.cwd(), path)));
      if (!readiness.ok) throw new Error(`OMD_PRODUCTION_BLOCKED: ${readiness.blockers.join('\n')}`);
    },
  });
  if (opts.json) process.stdout.write(JSON.stringify(result));
  else {
    for (const path of result.written) console.log(`installed ${relative(process.cwd(), path)}`);
    for (const note of result.notes) console.log(`note: ${note}`);
    console.log(`Verify it moves once wired: omd craft-capture <page> --as ${name} --technique "${name}" --selector <css>`);
  }
  process.exit(0);
}


async function cmdRefDiscoveryPlan(opts: Opts): Promise<never> {
  if (opts._.length !== 0) throw new Error('usage: omd ref discover-plan [--json] [--activation <host-issued-invocation.json>]');
  const { readPersistedRoute } = await import('../core/route/index.ts');
  const { buildReferenceDiscoveryPlan } = await import('../core/ref/discovery-plan.ts');
  const route = readPersistedRoute(process.cwd(), invocationFromActivation(opts, 'omd ref discover-plan'));
  const plan = buildReferenceDiscoveryPlan(process.cwd(), route);
  process.stdout.write(`${JSON.stringify(plan, null, opts.json ? undefined : 2)}\n`);
  process.exit(0);
}

async function cmdRefResearch(mode: 'set' | 'check', opts: Opts): Promise<never> {
  const usage = mode === 'set'
    ? 'usage: omd ref research-set --input <reference-research.json> [--activation <host-issued-invocation.json>] [--json]'
    : 'usage: omd ref research-check [--activation <host-issued-invocation.json>] [--json]';
  if (opts._.length !== 0 || (mode === 'set' && !opts.input) || (mode === 'check' && opts.input)) {
    throw new Error(usage);
  }
  const { readPersistedRoute } = await import('../core/route/index.ts');
  const { parseReferenceResearch, validateReferenceResearch, publishReferenceResearch, readPublishedReferenceResearch, DOMAIN_REFERENCES_PATH, DESIGN_REFERENCES_PATH } = await import('../core/ref/reference-research.ts');
  const command = `omd ref research-${mode}`;
  const invocation = invocationFromActivation(opts, command);
  const route = readPersistedRoute(process.cwd(), invocation);
  if (route.references.decision !== 'discover') {
    throw new Error('REFERENCE_RESEARCH_NOT_SELECTED');
  }
  const research = mode === 'set'
    ? parseReferenceResearch(inputJson(opts.input!, command))
    : readPublishedReferenceResearch(process.cwd());
  const validation = {
    expectedSourceContractSha256: route.sourceContractSha256,
    benchmarkRequired: route.gates.includes('greenfield-task-flow-benchmark'),
    expectedRequest: route.request,
  };
  validateReferenceResearch(process.cwd(), research, validation);
  const path = '.omd/reference-research.json';
  if (mode === 'set') {
    publishReferenceResearch(process.cwd(), research, validation, projectWriterFromActivation(opts, command));
  }
  const result = {
    path,
    domainPath: DOMAIN_REFERENCES_PATH,
    designPath: DESIGN_REFERENCES_PATH,
    domainSources: research.domainReference.sources.length,
    designSources: research.designReference.sources.length,
    benchmarkBound: research.domainReference.benchmarkSha256 !== null,
  };
  if (opts.json) process.stdout.write(JSON.stringify(result));
  else console.log(`ok — separate domain and design reference lanes are current (${result.domainSources} domain sources, ${result.designSources} design sources${result.benchmarkBound ? ', deep task-flow benchmark bound' : ''})`);
  process.exit(0);
}

async function cmdRefApplication(mode: 'plan' | 'set' | 'check', opts: Opts): Promise<never> {
  const command = `omd ref apply-${mode}`;
  if (opts._.length || (mode === 'set' ? !opts.input : opts.input)) throw new Error(`usage: ${command}${mode === 'set' ? ' --input <application.json>' : ''} [--json]`);
  const { readPersistedRoute } = await import('../core/route/index.ts');
  const { referenceApplicationPlan, publishReferenceApplication, checkReferenceApplication, REFERENCE_APPLICATION_PATH } = await import('../core/ref/reference-application.ts');
  const route = readPersistedRoute(process.cwd(), invocationFromActivation(opts, command));
  if (route.references.decision !== 'discover') throw new Error('REFERENCE_APPLICATION_NOT_SELECTED');
  const options = { expectedSourceContractSha256: route.sourceContractSha256,
    benchmarkRequired: route.gates.includes('greenfield-task-flow-benchmark'), expectedRequest: route.request };
  const result = mode === 'plan' ? referenceApplicationPlan(process.cwd(), options)
    : mode === 'set' ? { path: REFERENCE_APPLICATION_PATH, screens: publishReferenceApplication(process.cwd(), inputJson(opts.input!, command), options, projectWriterFromActivation(opts, command)).screens.length }
      : checkReferenceApplication(process.cwd(), options);
  process.stdout.write(`${JSON.stringify(result, null, opts.json ? undefined : 2)}\n`);
  process.exit(0);
}

async function cmdRefApplicationReview(mode: 'plan' | 'set' | 'check', opts: Opts): Promise<never> {
  const command = `omd ref apply-review-${mode}`;
  if (opts._.length || (mode === 'set' ? !opts.input : opts.input)) throw new Error(`usage: ${command}${mode === 'set' ? ' --input <review.json>' : ''} [--json]`);
  const { readPersistedRoute } = await import('../core/route/index.ts');
  const { checkReferenceApplication } = await import('../core/ref/reference-application.ts');
  const { checkFinalEvidenceV2 } = await import('../core/evidence/final-v2.ts');
  const { referenceApplicationReviewContext, referenceApplicationReviewPlan, publishReferenceApplicationReview, checkReferenceApplicationReview } = await import('../core/ref/reference-application-review.ts');
  const root = process.cwd();
  const invocation = invocationFromActivation(opts, command);
  const route = readPersistedRoute(root, invocation);
  if (route.references.decision !== 'discover') throw new Error('REFERENCE_APPLICATION_NOT_SELECTED');
  const application = checkReferenceApplication(root, { expectedSourceContractSha256: route.sourceContractSha256,
    benchmarkRequired: route.gates.includes('greenfield-task-flow-benchmark'), expectedRequest: route.request });
  // The final evidence gate owns authentication and exact current capture selection. A caller cannot
  // supply an easier graph or arbitrary screenshot to this supplemental criterion review.
  const final = checkFinalEvidenceV2(root, invocation);
  const context = referenceApplicationReviewContext(root, application, final.graph);
  const result = mode === 'plan' ? referenceApplicationReviewPlan(context)
    : mode === 'set' ? publishReferenceApplicationReview(root, inputJson(opts.input!, command), context, projectWriterFromActivation(opts, command))
      : checkReferenceApplicationReview(root, context);
  process.stdout.write(`${JSON.stringify(result, null, opts.json ? undefined : 2)}\n`);
  process.exit(0);
}

async function cmdRefTidy(opts: Opts): Promise<never> {
  const allowed = new Set(['_', 'apply', 'json', 'activation']);
  if (opts._.length || Object.keys(opts).some(key => !allowed.has(key))
    || (opts.apply !== undefined && opts.apply !== true) || (opts.json !== undefined && opts.json !== true)) {
    throw new Error('usage: omd ref tidy [--apply] [--json]; preview by default, --apply archives exact bytes before removing reference clutter');
  }
  const { tidyReferences } = await import('../core/ref/tidy.ts');
  const apply = opts.apply === true;
  const invocation = apply ? invocationFromActivation(opts, 'omd ref tidy') : undefined;
  const release = invocation ? acquireProjectMutationLock(process.cwd(), invocation) : undefined;
  let result: ReturnType<typeof tidyReferences>;
  try { result = tidyReferences(process.cwd(), invocation ? projectWriter(invocation) : undefined); }
  finally { release?.(); }
  if (opts.json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else {
    console.log(`${apply ? 'archived' : 'would archive'} ${result.files.length} file(s)`);
    for (const entry of result.files) console.log(`  ${entry.path} -> ${entry.archivePath}\n    ${entry.reason}`);
    if (!apply && result.files.length) console.log('Re-run with --apply to archive these exact bytes and remove the originals.');
    if (result.manifestPath) console.log(`Recovery manifest: ${result.manifestPath}`);
    console.log(result.guidance);
  }
  process.exit(0);
}

async function cmdRefSearch(opts: Opts): Promise<never> {
  const command = 'omd ref search';
  if (opts._.length || !opts.input) throw new Error('usage: omd ref search --input <lane-query-url-queryParam.json> [--json]; get the exact input with omd schema reference-search');
  const { parseSearchInput, executeReferenceSearch, readSearchExecution, searchObserved } = await import('../core/ref/search-execution.ts');
  const { withBrowser } = await import('../core/render/index.ts');
  const input = parseSearchInput(inputJson(opts.input, command));
  const writer = projectWriterFromActivation(opts, command);
  const receipt = await withBrowser(browser => executeReferenceSearch(browser, input, writer));
  const execution = readSearchExecution(process.cwd(), receipt, input.lane);
  process.stdout.write(`${JSON.stringify({ receipt, execution }, null, opts.json ? undefined : 2)}\n`);
  // A failed attempt is durable evidence of a gap, never an automatically successful search.
  process.exit(searchObserved(execution) ? 0 : 1);
}

async function cmdRefNavigate(opts: Opts): Promise<never> {
  const source = opts._[0];
  const allowed = new Set(['_', 'lane', 'entry', 'activation', 'json']);
  if (!source || opts._.length !== 1 || !opts.lane || Object.keys(opts).some(key => !allowed.has(key))) {
    throw new Error('usage: omd ref navigate <url> --lane domain|design [--entry public-directory|free-gallery] [--json]; direct entries and navigation receipts are not board references');
  }
  if (Object.hasOwn(opts, 'entry') && (typeof opts.entry !== 'string' || !['public-directory', 'free-gallery'].includes(opts.entry))) {
    throw new Error('REFERENCE_DISCOVERY_ENTRY_KIND: --entry requires public-directory or free-gallery');
  }
  const { captureReferenceNavigation } = await import('../core/ref/navigation-capture.ts');
  const { withBrowser } = await import('../core/render/index.ts');
  const writer = projectWriterFromActivation(opts, 'omd ref navigate');
  const receipt = await withBrowser(browser => captureReferenceNavigation(browser, source, opts.lane, writer, opts.entry));
  console.log(JSON.stringify(receipt));
  process.exit(0);
}

/** Fails when the captured board holds no parts to compose section by section. */
/**
 * `omd ref mood <add|show|check>` — the whole-page, visual-only lane.
 *
 * `add` records a local capture as study material; `check` validates the board and proves no mood
 * byte has reached production source. The rights rule is hard here, not advisory.
 */
async function cmdRefMood(mode: string | undefined, opts: Opts): Promise<never> {
  const {
    MOODBOARD_MARKDOWN_PATH, MOODBOARD_PATH, MOOD_STORE_DIRECTORY, formatMoodboardMarkdown,
    moodBytesInProduction, moodImagePath, parseMoodboard, readMoodboard, requireMoodQualities,
  } = await import('../core/ref/mood.ts');
  const root = process.cwd();

  if (mode === 'show') {
    const board = readMoodboard(root);
    if (board === null) throw new Error(`no moodboard at ${MOODBOARD_PATH}; add one with \`omd ref mood add <local.png> --source <url> --direction <line> --quality <phrase> --as <id>\``);
    if (opts.json) process.stdout.write(JSON.stringify(board));
    else process.stdout.write(formatMoodboardMarkdown(board));
    process.exit(0);
  }

  if (mode === 'check') {
    const board = readMoodboard(root);
    if (board === null) {
      if (opts.json) process.stdout.write(JSON.stringify({ ok: false, reason: 'no moodboard' }));
      else console.error(`no moodboard at ${MOODBOARD_PATH}`);
      process.exit(1);
    }
    for (const item of board.items) requireMoodQualities(item);
    const offenders = opts.production === undefined
      ? []
      : moodBytesInProduction(board, readTrackedSources(root, opts.production));
    if (opts.json) process.stdout.write(JSON.stringify({ ok: offenders.length === 0, items: board.items.length, offenders }));
    else {
      console.log(`moodboard: ${board.items.length} study capture${board.items.length === 1 ? '' : 's'} — ${board.direction}`);
      if (offenders.length > 0) console.error(`MOOD_BYTES_IN_PRODUCTION: ${offenders.join(', ')}`);
    }
    process.exit(offenders.length === 0 ? 0 : 1);
  }

  if (mode !== 'add') {
    throw new Error('usage: omd ref mood add <local.png> --source <url> --direction <line> --quality <phrase> --as <id> | show | check [--production <dir>] [--json]');
  }
  if (opts._.length !== 1 || opts.source === undefined || opts.direction === undefined || opts.as === undefined || opts.quality === undefined) {
    throw new Error('usage: omd ref mood add <local.png> --source <url> --direction <line> --quality <phrase> --as <id>  (repeat --quality for each)');
  }
  const { createHash } = await import('node:crypto');
  const { copyFileSync, existsSync, mkdirSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const inputPath = opts._[0]!;
  if (!existsSync(inputPath)) throw new Error(`mood capture ${inputPath} does not exist`);
  const bytes = readFileSync(inputPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const imagePath = moodImagePath(root, sha256);
  mkdirSync(join(root, MOOD_STORE_DIRECTORY), { recursive: true });
  if (!existsSync(join(root, imagePath))) copyFileSync(inputPath, join(root, imagePath));

  const qualities = Array.isArray(opts.quality) ? opts.quality : [opts.quality];
  const existing = readMoodboard(root);
  const item = {
    id: opts.as, source: opts.source, qualities, imagePath, sha256,
    capturedAt: new Date().toISOString(), scope: 'whole' as const, evidence: 'visual-only' as const,
  };
  const board = parseMoodboard({
    schema: 'moodboard-v1',
    direction: opts.direction,
    items: [...(existing?.items ?? []).filter((entry) => entry.id !== item.id), item],
  });
  // Project mutations go through the guarded writer so an activation-less caller is downgraded to
  // the local CLI invocation rather than writing the project directly.
  const writer = projectWriterFromActivation(opts, 'omd ref mood add', root);
  writer.write(MOODBOARD_PATH, `${JSON.stringify(board, null, 2)}\n`);
  writer.write(MOODBOARD_MARKDOWN_PATH, formatMoodboardMarkdown(board));
  if (opts.json) process.stdout.write(JSON.stringify({ path: MOODBOARD_PATH, item: item.id }));
  else console.log(`${MOODBOARD_PATH} (${board.items.length} item${board.items.length === 1 ? '' : 's'})`);
  process.exit(0);
}

/** Reads the production source files a rights check compares against. */
function readTrackedSources(root: string, directory: string): readonly { path: string; bytes: Buffer }[] {
  const target = join(root, directory);
  if (!existsSync(target)) throw new Error(`--production ${directory} does not exist under ${root}`);
  const out: { path: string; bytes: Buffer }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(?:html|css|js|jsx|ts|tsx)$/.test(entry)) continue;
      out.push({ path: relative(root, full), bytes: readFileSync(full) });
    }
  };
  walk(join(root, directory));
  return out;
}

/**
 * `omd ref mood target|round|converge|gates` — derivation, the two-lane loop, and the readings.
 */
async function cmdRefGates(opts: Opts): Promise<never> {
  const { readMoodboard } = await import('../core/ref/mood.ts');
  const { moodLaneFindings, moodQueries, moodConvergence, moodVectorsFor } = await import('../core/ref/mood-query.ts');
  const { deriveMoodTarget, checkMoodTarget, readTasteStatements, userRequestedReferences, moodTargetInteraction } = await import('../core/ref/mood-target.ts');
  const { readReferenceGates, readMoodRightsGate, referenceGateReport } = await import('../core/ref/reference-gates.ts');
  const { validateDomainBrief } = await import('../core/domain/domain-brief.ts');
  const { loadRefs } = await import('../core/ref/store.ts');
  const root = process.cwd();

  const briefPath = join(root, '.omd', 'domain-brief.json');
  const taste = readTasteStatements(root);
  const board = readMoodboard(root);

  if (opts.input === undefined && !existsSync(briefPath)) {
    throw new Error('omd ref gates needs .omd/domain-brief.json (run `omd brief domain`) or --input <invariants.json>');
  }
  const brief = existsSync(briefPath) ? validateDomainBrief(JSON.parse(readFileSync(briefPath, 'utf8'))) : null;

  const target = brief === null ? null : deriveMoodTarget({ brief, tasteRecords: taste });
  const interaction = target === null ? null : moodTargetInteraction(target, brief!.request);
  const targetCheck = target === null ? null : checkMoodTarget(target);
  const laneFindings = board === null ? [] : moodLaneFindings(board, []);

  const readings = opts.input === undefined ? [] : readReferenceGates({
    candidate: inputJson(opts.input, 'omd ref gates') as never,
    categoryMean: [],
    slop: [],
    target: [],
  });
  const rights = board === null || opts.production === undefined
    ? []
    : readMoodRightsGate(board, readTrackedSources(root, opts.production));
  const report = referenceGateReport([...readings, ...rights]);

  const payload = {
    direction: target?.direction ?? null,
    basis: target?.basis ?? null,
    interaction: interaction?.mode ?? null,
    targetFindings: targetCheck?.findings ?? [],
    inCategoryQueries: brief === null ? [] : moodQueries(brief, 'in-category'),
    outOfCategoryQueries: brief === null ? [] : moodQueries(brief, 'out-of-category'),
    laneFindings,
    referencesRequestedByUser: brief === null ? false : userRequestedReferences(brief.request),
    measuredVectors: board === null ? 0 : moodVectorsFor(loadRefs(root)).length,
    convergence: board === null ? null : moodConvergence(moodVectorsFor(loadRefs(root)), board),
    gates: report.findings,
    blocked: report.blocked,
  };
  if (opts.json) process.stdout.write(JSON.stringify(payload));
  else {
    if (target !== null) console.log(`direction: ${target.direction}  (${target.basis}${interaction === null ? '' : `, ${interaction.mode}`})`);
    for (const query of payload.inCategoryQueries) console.log(`  in-category   ${query.query}`);
    for (const query of payload.outOfCategoryQueries) console.log(`  out-of-category ${query.query}`);
    for (const finding of [...payload.targetFindings, ...laneFindings]) console.log(`  ${finding}`);
    for (const finding of report.findings) console.log(`  [${finding.severity}] ${finding.id}: ${finding.message}`);
  }
  process.exit(report.blocked ? 1 : 0);
}

async function cmdRefGranularity(opts: Opts): Promise<never> {  const { loadRefs } = await import('../core/ref/store.ts');
  const { auditBoardGranularity } = await import('../core/ref/board-granularity.ts');
  // Domain-brief surfaces are pages/screens. Reference coverage instead follows the framer's
  // section/region/state acquisition plan — otherwise one landing-page surface falsely looks covered
  // by one nav capture while its hero, proof, process, and CTA have no evidence.
  const { acquisitionAuditScope } = await import('../core/ref/acquisition-audit.ts');
  let board: import('../core/ref/board-contract.ts').ReferenceBoardManifest | undefined;
  const boardManifestPath = join(process.cwd(), '.omd', 'reference-board.json');
  if (existsSync(boardManifestPath)) {
    const { readReferenceBoardArtifacts } = await import('../core/ref/board-artifacts.ts');
    board = readReferenceBoardArtifacts(process.cwd()).manifest;
  }
  const boardOption = board === undefined ? {} : { board };
  const findings = auditBoardGranularity(loadRefs(process.cwd()), { ...acquisitionAuditScope(process.cwd()), ...boardOption });
  // Current routes own motion applicability; the optional domain stage cannot erase it.
  const routePath = join(process.cwd(), '.omd/route.json');
  if (existsSync(routePath)) {
    const { readPersistedRoute } = await import('../core/route/index.ts');
    const { buildReferenceDiscoveryPlan, missingDiscoveryMotionEvidence } = await import('../core/ref/discovery-plan.ts');
    const { readCapturedCraftSignals } = await import('../core/ref/craft-usage.ts');
    const route = readPersistedRoute(process.cwd(), invocationFromActivation(opts, 'omd ref granularity'));
    const discovery = buildReferenceDiscoveryPlan(process.cwd(), route);
    if (missingDiscoveryMotionEvidence(discovery, readCapturedCraftSignals(join(process.cwd(), '.omd/refs')))) {
      findings.push({
        id: 'REF-CRAFT-UNGATHERED',
        message: 'The selected motion-one route has no measured changing reference state. Run the automatic discovery motion lane and capture its relevant live sequence with `omd craft-capture`; a static screenshot, search result, or skipped domain stage does not supply motion evidence.',
        refs: ['selected method: motion-one', 'plan: omd ref discover-plan --json'],
      });
    }
  }
  // Preserve the legacy domain-query check only for projects without an adaptive route.
  const briefPath = join(process.cwd(), '.omd', 'domain-brief.json');
  if (!existsSync(routePath) && existsSync(briefPath)) {
    try {
      const brief = JSON.parse(readFileSync(briefPath, 'utf8')) as { referenceQueries?: { craft?: unknown[] } };
      const declared = brief.referenceQueries?.craft ?? [];
      const { readCapturedCraftSignals } = await import('../core/ref/craft-usage.ts');
      const captured = readCapturedCraftSignals(join(process.cwd(), '.omd', 'refs'))
        .filter((signal) => signal.scrollFired || signal.animatedShare > 0 || signal.peakEnergy > 0).length;
      if (declared.length > 0 && captured === 0) {
        findings.push({
          id: 'REF-CRAFT-UNGATHERED',
          message: `the domain brief declares ${declared.length} role-② craft quer${declared.length === 1 ? 'y' : 'ies'} and the board holds no measured craft record. Component evidence answers how a section is built; craft evidence answers what makes a page worth looking at, and a board with none can only be correct. Capture at least one with \`omd craft-capture <url> --as <slug> --technique "<name>" --selector <css>\`, or remove the craft queries from the brief and record why this surface needs none.`,
          refs: (declared as string[]).map((query) => `craft query: ${String(query).slice(0, 60)}`),
        });
      }
    } catch { /* an unreadable brief is the domain gate's finding, not this one's */ }
  }
  if (opts.json) process.stdout.write(JSON.stringify({ ok: findings.length === 0, findings }));
  else if (findings.length === 0) console.log('ok — the board holds component-scoped parts to compose from');
  else for (const finding of findings) console.error(`[error] ${finding.id}: ${finding.message}\n  ${finding.refs.join('\n  ')}`);
  process.exit(findings.length > 0 ? 1 : 0);
}

/** Fails when the page's content is gated behind JavaScript rather than enhanced by it. */
async function cmdNoJs(opts: Opts): Promise<never> {
  const target = opts._[0];
  if (!target) throw new Error('usage: omd no-js <page> [--viewport WxH] [--json]');
  // An Electron/Tauri renderer ships its own JavaScript runtime, so "does the content survive with
  // scripting off" has no visitor to protect. Report that instead of failing an app for being one.
  const shell = computeStack(process.cwd()).shell;
  if (shell.kind !== 'browser') {
    const skipped = { skipped: true, shell: shell.kind, reason: `no-js does not apply to an ${shell.kind} renderer: the shell is the JavaScript runtime` };
    if (opts.json) process.stdout.write(JSON.stringify({ ...skipped, findings: [] }));
    else console.log(`skipped — ${skipped.reason}`);
    process.exit(0);
  }
  const { parseViewport } = await import('../core/render/index.ts');
  const { observeNoJsContent, checkNoJsContent } = await import('../core/render/no-js.ts');
  const observation = await observeNoJsContent(target, { viewport: parseViewport(opts.viewport ?? '1440x900') });
  const finding = checkNoJsContent(observation);
  if (opts.json) process.stdout.write(JSON.stringify({ ...observation, findings: finding ? [finding] : [] }));
  else if (finding) console.error(`[error] ${finding.id}: ${finding.message}`);
  else console.log(`ok — content survives without JavaScript (text ${Math.round(observation.textRatio * 100)}%, no gated blocks)`);
  process.exit(finding ? 1 : 0);
}

/**
 * Scores a page against the published Awwwards Developer Award rubric from evidence OMD already
 * collects. Axes with no evidence are excluded and reported as coverage, never fabricated.
 */
async function cmdAward(mode: string | undefined, opts: Opts): Promise<never> {
  const target = opts._[0];
  if (mode !== 'score' || !target) throw new Error('usage: omd award score <page> [--lighthouse <report.json>] [--viewport WxH] [--json]');
  const { scoreAward } = await import('../core/award/rubric.ts');
  const { loadRules, check } = await import('../core/rules/engine.ts');
  const { extractLighthouseMetrics } = await import('../core/perf/lighthouse.ts');
  const { parseViewport, extractIr } = await import('../core/render/index.ts');
  const { normalize } = await import('../core/ir/normalize.ts');
  const { observeNoJsContent, checkNoJsContent } = await import('../core/render/no-js.ts');
  const { captureReferenceCraft } = await import('../core/ref/reference-craft-capture.ts');

  const viewport = parseViewport(opts.viewport ?? '1440x900');
  const rules = loadRules(join(root, 'core', 'rules', 'builtin'));
  const ir = normalize(await extractIr(target, { viewport }));
  const violationsList = check(ir, rules);
  const countOf = (id: RegExp): number => violationsList.filter((v: { id: string }) => id.test(v.id)).length;

  // Mobile reflow: the narrow render must not overflow horizontally.
  const mobileIr = normalize(await extractIr(target, { viewport: parseViewport('390x844') }));
  const mobileRoot = mobileIr.nodes.find((n) => n.parent === null);
  const mobileReflows = mobileRoot ? mobileRoot.box.w <= 390 + 1 : undefined;

  const markupFacts = await documentMarkupFacts(target, viewport);
  const craft = await captureReferenceCraft(target, {
    source: target, as: 'award', technique: 'as shipped', selector: null, viewport,
  }).catch(() => null);
  const noJs = await observeNoJsContent(target, { viewport }).catch(() => null);

  const performance = opts.lighthouse
    ? extractLighthouseMetrics(inputJson(opts.lighthouse, 'omd award score')).performance ?? undefined
    : undefined;

  const result = scoreAward({
    ...(performance === undefined ? {} : { performance }),
    ...(mobileReflows === undefined ? {} : { mobileReflows }),
    violations: {
      ux: countOf(/^UX-/), hitArea: countOf(/^HIT-/), headingOrder: countOf(/^HEADING-/),
      system: countOf(/^SYSTEM-|^TOKEN-/), contrast: countOf(/^CONTRAST-/), focus: countOf(/^FOCUS-/),
    },
    markup: markupFacts,
    ...(craft ? { motion: { scrollLinked: craft.motion.scrollLinked, peakEnergy: craft.motion.peakEnergy, reducedMotionSafe: craft.motion.reducedMotionSafe } } : {}),
    ...(noJs ? { noJsSafe: checkNoJsContent(noJs) === null } : {}),
  });

  if (opts.json) process.stdout.write(JSON.stringify(result));
  else {
    for (const axis of result.axes) {
      console.log(`  ${axis.axis.padEnd(10)} w=${axis.weight.toFixed(2)}  ${axis.score === null ? '  — ' : axis.score.toFixed(1).padStart(4)}  ${axis.source}`);
    }
    console.log(`  ${'weighted'.padEnd(10)}         ${result.weighted.toFixed(2)}  (coverage ${Math.round(result.coverage * 100)}%) → ${result.verdict}`);
    if (result.floorFailures.length > 0) console.error(`  floor failures (cannot be averaged away): ${result.floorFailures.join(', ')}`);
  }
  process.exit(result.verdict === 'below-hm' ? 1 : 0);
}

/** Document-level markup facts the semantics/markup axes score. */
async function documentMarkupFacts(target: string, viewport: { width: number; height: number }): Promise<{
  hasLang: boolean; hasTitle: boolean; hasViewportMeta: boolean; hasDescription: boolean; hasOpenGraph: boolean; imagesMissingAlt: number;
}> {
  const { chromium } = await import('playwright');
  const { pathToFileURL } = await import('node:url');
  const url = /^https?:\/\//.test(target) ? target : pathToFileURL(resolve(target)).href;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return await page.evaluate(() => ({
      hasLang: document.documentElement.lang.trim().length > 0,
      hasTitle: document.title.trim().length > 0,
      hasViewportMeta: document.querySelector('meta[name="viewport"]') !== null,
      hasDescription: (document.querySelector('meta[name="description"]') as HTMLMetaElement | null)?.content.trim().length ? true : false,
      hasOpenGraph: document.querySelector('meta[property^="og:"]') !== null,
      imagesMissingAlt: Array.from(document.querySelectorAll('img')).filter((img) => !img.getAttribute('alt')).length,
    }));
  } finally {
    await browser.close();
  }
}


/** Validates the token commitment and, given a page, that the build landed on its ladders. */
async function cmdTokens(mode: string | undefined, opts: Opts): Promise<never> {
  if (mode !== 'check') throw new Error('usage: omd tokens check [--input <tokens.json>] [--page <page>] [--viewport WxH] [--json]');
  const { validateTokenCommit, checkTokenDrift } = await import('../core/tokens/contract.ts');
  const file = opts.input ?? join(process.cwd(), '.omd', 'tokens.json');
  let commit;
  try {
    commit = validateTokenCommit(inputJson(file, 'omd tokens check'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (opts.json) process.stdout.write(JSON.stringify({ ok: false, error: message }));
    else console.error(`[error] ${message}`);
    process.exit(1);
  }

  let drift = null;
  if (opts.page) {
    const { parseViewport, extractIr } = await import('../core/render/index.ts');
    const { normalize } = await import('../core/ir/normalize.ts');
    const { extractInvariants } = await import('../core/ref/invariants.ts');
    const viewport = parseViewport(opts.viewport ?? '1440x900');
    const ir = normalize(await extractIr(opts.page, { viewport }));
    const invariants = extractInvariants(ir);
    drift = checkTokenDrift(commit, { typeScale: invariants.typeScale, spacingScale: invariants.spacingLadder }, viewport.width);
  }

  if (opts.json) process.stdout.write(JSON.stringify({ ok: drift === null, commit, findings: drift ? [drift] : [] }));
  else if (drift) console.error(`[error] ${drift.id}: ${drift.message}`);
  else console.log(`ok — tokens committed (${commit.typeScale.length} type rungs, ${commit.spacingScale.length} spacing rungs, accent ${commit.colorRoles.accent})${opts.page ? ' and the build lands on them' : ''}`);
  process.exit(drift ? 1 : 0);
}

async function cmdInit(opts: Opts): Promise<never> {
  const { designInventoryStatus, initializeDesignInventory, DESIGN_INVENTORY_DOC_PATH } = await import('../core/tokens/inventory.ts');
  const { runtimeInventoryStatus, initializeRuntimeInventory, RUNTIME_INVENTORY_PATH } = await import('../core/tokens/runtime-inventory.ts');
  if (opts._.length || (opts.check && (opts.refresh || opts.input))) throw new Error('usage: omd init [--input <runtime-inventory-input.json>] [--refresh | --check] [--json]');
  if (opts.check) {
    const status = designInventoryStatus(process.cwd());
    const runtime = runtimeInventoryStatus(process.cwd());
    console.log(opts.json ? JSON.stringify({ ...status, ...(runtime.status === 'missing' ? {} : { runtime }) }) : `${status.status} — ${status.path} (${status.observations} observed declarations; ${status.gaps} coverage gaps); runtime: ${runtime.status}`);
    process.exit(status.status === 'current' && ['missing', 'current'].includes(runtime.status) ? 0 : 1);
  }
  const writer = projectWriterFromActivation(opts, 'omd init');
  const inventory = initializeDesignInventory(process.cwd(), writer, opts.refresh);
  const runtimeInput = opts.input ? inputJson(opts.input, 'omd init runtime input')
    : existsSync(resolve(process.cwd(), RUNTIME_INVENTORY_PATH)) ? (inputJson(RUNTIME_INVENTORY_PATH, 'omd init runtime inventory') as { input: unknown }).input : undefined;
  const runtime = runtimeInput === undefined ? undefined : await initializeRuntimeInventory(process.cwd(), runtimeInput, writer, opts.refresh);
  const result = { ...designInventoryStatus(process.cwd()), document: DESIGN_INVENTORY_DOC_PATH, authority: inventory.authority, ...(runtime ? { runtime } : {}) };
  console.log(opts.json ? JSON.stringify(result) : `Saved observed design system: ${DESIGN_INVENTORY_DOC_PATH}\n${result.observations} declarations; ${result.gaps} coverage gaps. Not approved tokens. Application files and .omd/tokens.json unchanged.`);
  process.exit(result.status === 'current' && (!runtime || runtime.status === 'current') ? 0 : 1);
}

/** Persists a moderator handback verbatim or validates the joined run before/final. */
async function cmdDeliberate(mode: string | undefined, opts: Opts): Promise<never> {
  // Every role returns its decision entry in its handback; the coordinator's job is to append it,
  // unedited, to the graph. Left as a hand-merged JSON file, a run reached the build gate with two
  // of five entries and ended there — the entries existed, nobody had put them in the file.
  if (mode === 'append') {
    if (!opts.input || opts._.length > 0) throw new Error('usage: omd deliberate append --input <decision-entry.json> [--json]');
    const { DECISION_GRAPH_SCHEMA, validateDecisionGraph } = await import('../core/deliberation/contracts.ts');
    const entry = inputJson(opts.input, 'omd deliberate append');
    const graphPath = join(process.cwd(), '.omd', 'decision-graph.json');
    const current = existsSync(graphPath)
      ? inputJson(graphPath, 'current decision graph') as { decisions?: unknown[] }
      : { schema: DECISION_GRAPH_SCHEMA, decisions: [] };
    const entries = Array.isArray(entry) ? entry : [entry];
    const decisions = [...(current.decisions ?? [])];
    for (const candidate of entries) {
      const id = isRecord(candidate) ? candidate.id : undefined;
      if (typeof id !== 'string') throw new Error('DECISION_ENTRY_INVALID: each entry needs a kebab-case id');
      const at = decisions.findIndex((existing) => isRecord(existing) && existing.id === id);
      if (at === -1) decisions.push(candidate); else decisions[at] = candidate;
    }
    const graph = { schema: DECISION_GRAPH_SCHEMA, decisions };
    const result = validateDecisionGraph(graph);
    if (result.value === undefined || result.findings.length > 0) {
      throw new Error(`DECISION_GRAPH_INVALID: ${result.findings.map((finding) => `${finding.id} ${finding.path}: ${finding.message}`).join('; ')}`);
    }
    const path = projectWriterFromActivation(opts, 'omd deliberate append').write('.omd/decision-graph.json', `${JSON.stringify(graph, null, 2)}\n`);
    if (opts.json) process.stdout.write(JSON.stringify({ path, decisions: decisions.length }));
    else console.log(`${path} (${decisions.length} decisions)`);
    process.exit(0);
  }
  if (mode === 'preserve') {
    if (!opts.input || opts._.length > 0) throw new Error('usage: omd deliberate preserve --input <moderator.json> [--json]');
    const source = resolve(opts.input);
    const body = readFileSync(source, 'utf8').trim();
    let raw: unknown;
    try { raw = JSON.parse(body); } catch { throw new Error('DELIBERATION_MODERATOR_JSON_INVALID: input must contain only the moderator JSON object, without a Markdown fence'); }
    const { validateDeliberation } = await import('../core/deliberation/contracts.ts');
    const result = validateDeliberation(raw);
    if (!result.value || result.findings.length > 0) throw new Error(result.findings.map((finding) => `${finding.id} ${finding.path}: ${finding.message}`).join('\n'));
    if (result.value.moderator !== 'omd-eye' || !/^[a-z0-9][a-z0-9-]*$/.test(result.value.id)) {
      throw new Error('DELIBERATION_MODERATOR_OWNER_INVALID: receipt needs moderator omd-eye and a kebab-case id');
    }
    const relativePath = `.omd/deliberations/${result.value.id}.json`;
    const destination = join(process.cwd(), relativePath);
    const content = `${body}\n`;
    if (existsSync(destination) && readFileSync(destination, 'utf8') !== content) {
      throw new Error('DELIBERATION_IMMUTABLE_CONFLICT: a different moderator receipt already uses this id');
    }
    const path = projectWriterFromActivation(opts, 'omd deliberate preserve').write(relativePath, content);
    if (opts.json) process.stdout.write(JSON.stringify({ path, id: result.value.id }));
    else console.log(path);
    process.exit(0);
  }
  if (mode !== 'check' || (opts.phase !== undefined && opts.phase !== 'prebuild' && opts.phase !== 'final')) {
    throw new Error('usage: omd deliberate preserve --input <moderator.json> | check [--phase prebuild|final] [--activation <host-issued-invocation.json>] [--json]');
  }
  const { checkDeliberationRun } = await import('../core/deliberation/check.ts');
  const phase = (opts.phase ?? 'final') as import('../core/deliberation/check.ts').DeliberationRunPhase;
  let depth: import('../core/deliberation/check.ts').DeliberationRunApplicability['depth'] = 'required';
  if (activationInputPath(opts) !== undefined) {
    const { readPersistedRoute } = await import('../core/route/index.ts');
    const route = readPersistedRoute(process.cwd(), invocationFromActivation(opts, 'omd deliberate check'));
    if (route.strategy.skips.some((skip) => skip.id === 'depth')) depth = 'skipped';
  }
  const report = checkDeliberationRun(process.cwd(), phase, { depth });
  if (opts.json) process.stdout.write(JSON.stringify(report));
  else {
    for (const finding of report.findings) console.error(`[error] ${finding.id} ${finding.path}: ${finding.message}`);
    if (report.ok) console.log(`ok — ${report.depth?.level ?? '?'} ${phase} decision gate (${report.counts.decisions} decisions, ${report.counts.deliberations} deliberations, ${report.counts.observations} observations, ${report.counts.zones} assembled zones)`);
  }
  process.exit(report.ok ? 0 : 1);
}

/** Selects the least expensive lawful loop depth; it never changes artifact ownership. */
async function cmdDepth(mode: string | undefined, opts: Opts): Promise<never> {
  if (mode !== 'classify' || !opts.input) throw new Error('usage: omd depth classify --input <design-depth-input.json> [--json]');
  const { classifyDepth } = await import('../core/deliberation/depth.ts');
  const result = classifyDepth(inputJson(opts.input, 'omd depth classify') as import('../core/deliberation/depth.ts').DepthInput);
  if (opts.json) process.stdout.write(JSON.stringify(result));
  else console.log(`${result.level} — ${result.reasons.join(', ')}\n${result.stages.join(' → ')}`);
  process.exit(0);
}

/** Scores the four blind same-model/same-prompt comparison variants as quality and quality/cost. */
async function cmdCompare(mode: string | undefined, opts: Opts): Promise<never> {
  if (mode !== 'score' || !opts.input) throw new Error('usage: omd compare score --input <design-comparison.json> [--json]');
  const { scoreComparison } = await import('../core/deliberation/comparison.ts');
  const scores = scoreComparison(inputJson(opts.input, 'omd compare score') as import('../core/deliberation/comparison.ts').Comparison);
  if (opts.json) process.stdout.write(JSON.stringify({ scores }));
  else for (const score of scores) console.log(`${score.id}: quality ${score.quality.toFixed(3)}, cost ${score.cost.toFixed(3)}, quality/cost ${score.qualityPerCost.toFixed(3)}`);
  process.exit(0);
}

/** Persists the framer-owned section/region/state acquisition plan through the project write boundary. */
async function cmdAcquisition(mode: string | undefined, opts: Opts): Promise<never> {
  if (mode !== 'set' || (opts.input === undefined && opts.zones === undefined) || (opts.input !== undefined && opts.zones !== undefined)) throw new Error('usage: omd acquisition set (--input <reference-acquisition-plan.json> | --zones <legacy-json-array>) [--activation <host-issued-invocation.json>]');
  const { ACQUISITION_PLAN_SCHEMA, validateAcquisitionPlan } = await import('../core/deliberation/contracts.ts');
  let plan: unknown;
  if (opts.input !== undefined) plan = inputJson(opts.input, 'omd acquisition set');
  else {
    let zones: unknown;
    try { zones = JSON.parse(opts.zones!); } catch { throw new Error('omd acquisition set --zones must be valid JSON'); }
    plan = { schema: ACQUISITION_PLAN_SCHEMA, owner: 'omd-framer', zones };
  }
  const result = validateAcquisitionPlan(plan);
  if (!result.value) throw new Error(result.findings.map((finding) => `${finding.id} ${finding.path}: ${finding.message}`).join('\n'));
  projectWriterFromActivation(opts, 'omd acquisition set').write('.omd/acquisition-plan.json', `${JSON.stringify(result.value, null, 2)}\n`);
  console.log(join(process.cwd(), '.omd', 'acquisition-plan.json'));
  process.exit(0);
}

/** Final byte-freshness evidence only; this does not judge semantic copy/source fidelity. */
function cmdSource(mode: string | undefined, opts: Opts): never {
  const sourceRoot = resolve(opts._[0] ?? process.cwd());
  if (mode === '--seal') {
    const invocation = invocationFromActivation(opts, 'omd source --seal', sourceRoot);
    if (!existsSync(join(sourceRoot, '.omd', 'route.json'))) {
      currentArtDirection(sourceRoot);
      requireDecisionBoundHandoffs(sourceRoot);
    }
    const path = writeSourceSeal(sourceRoot, invocation);
    if (opts.json) process.stdout.write(JSON.stringify({ path }));
    else console.log(path);
    process.exit(0);
  }
  if (mode === '--check') {
    const invocation = activationInputPath(opts) === undefined
      ? undefined
      : invocationFromActivation(opts, 'omd source --check', sourceRoot);
    const findings = validateSourceSeal(sourceRoot, invocation);
    if (opts.json) process.stdout.write(JSON.stringify(findings));
    else {
      for (const finding of findings) console.log(`[error] ${finding.id} ${finding.path}: ${finding.message}`);
      if (findings.length === 0) console.log('ok — source seal matches approved inputs and production source bytes');
    }
    process.exit(findings.length > 0 ? 1 : 0);
  }
  throw new Error('usage: omd source --seal [root] | --check [root] [--json]');
}
function inputJson(path: string, command: string): unknown {
  try {
    return JSON.parse(readFileSync(path === '-' ? 0 : resolve(path), 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`${command} could not read valid JSON from ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function inputJsonValue(value: string, command: string): unknown {
  if (!value.trim().startsWith('{')) return inputJson(value, command);
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`${command} received invalid inline JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function inputJsonBytes(path: string, command: string): Buffer {
  try {
    return readFileSync(resolve(path));
  } catch (error) {
    throw new Error(`${command} could not read bytes from ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function inputExternalReadonlyBytes(path: string, command: string, projectRoot: string): Buffer {
  const selected = resolve(path);
  let descriptor: number | undefined;
  try {
    const before = lstatSync(selected);
    const canonical = realpathSync(selected);
    const outside = relative(projectRoot, canonical);
    if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o777) !== 0o400
      || (outside !== '..' && !outside.startsWith(`..${sep}`) && !isAbsolute(outside))) {
      throw new Error('must be an external 0400 regular non-symlink file');
    }
    descriptor = openSync(selected, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(descriptor);
    const current = lstatSync(selected);
    const same = (left: typeof before, right: typeof before): boolean => left.dev === right.dev
      && left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs
      && left.ctimeMs === right.ctimeMs;
    if (!opened.isFile() || !current.isFile() || current.isSymbolicLink()
      || (opened.mode & 0o777) !== 0o400 || (current.mode & 0o777) !== 0o400
      || !same(before, opened) || !same(opened, current)) {
      throw new Error('changed before it could be read');
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const final = lstatSync(selected);
    if (!final.isFile() || final.isSymbolicLink() || (final.mode & 0o777) !== 0o400
      || !same(opened, after) || !same(opened, final)) throw new Error('changed while it was read');
    return bytes;
  } catch (error) {
    throw new Error(`${command} could not read exact owner receipt bytes from ${path}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function currentArtDirection(root: string) {
  const pointerPath = join(root, '.omd', 'art-direction.json');
  if (!existsSync(pointerPath)) throw new Error('ART_DIRECTION_DECISION_REQUIRED: run `omd art-direction check --input <decision-check.json>` before composition or copy v2 checks');
  const pointer = validateArtDirectionPointer(inputJson(pointerPath, 'art-direction current record'));
  const record = validateArtDirectionRecord(inputJson(join(root, '.omd', pointer.record), 'art-direction immutable record'));
  if (pointer.sha256 !== artDirectionSha256(record)) throw new Error('ART_DIRECTION_RECORD_STALE: current pointer does not match immutable record');
  const intentPointerPath = join(root, '.omd', 'intent-current.json');
  if (!existsSync(intentPointerPath)) throw new Error('ART_DIRECTION_INTENT_REQUIRED: current art direction requires an intent ledger');
  const intentPointer = validateIntentCurrentPointer(inputJson(intentPointerPath, 'intent current pointer'));
  const ledger = validateIntentLedger(inputJson(join(root, '.omd', intentPointer.record), 'intent immutable record'));
  if (intentLedgerSha256(ledger) !== intentPointer.sha256 || record.intentLedgerSha256 !== intentPointer.sha256) throw new Error('ART_DIRECTION_INTENT_STALE: current art direction is not bound to the current intent ledger');
  return record;
}

function requireDecisionBoundHandoffs(projectRoot: string): void {
  const handoffRoot = join(projectRoot, '.omd', 'reference-handoffs');
  const composerPath = join(handoffRoot, 'composer.json');
  const handPath = join(handoffRoot, 'hand.json');
  if (!existsSync(composerPath) || !existsSync(handPath)) {
    throw new Error('DECISION_BOUND_REFERENCE_HANDOFFS_REQUIRED: resolve art direction before composition, build, or finalization');
  }
  validateDecisionBoundReferenceHandoffs(projectRoot, {
    composer: parseReferenceHandoffReceipt(inputJson(composerPath, 'composer reference handoff')),
    hand: parseReferenceHandoffReceipt(inputJson(handPath, 'hand reference handoff')),
  });
}


async function cmdIntent(mode: string | undefined, opts: Opts): Promise<never> {
  if (mode !== 'append' || !opts.input || opts._.length > 0) {
    throw new Error('usage: omd intent append --input <trusted-intent.json> [--json]');
  }
  const payload = inputJson(opts.input, 'omd intent append');
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) throw new Error('omd intent append input must contain invocation, event, and expectedCurrentSha256');
  const { invocation, event, expectedCurrentSha256 } = payload as Record<string, unknown>;
  if (expectedCurrentSha256 !== null && (typeof expectedCurrentSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedCurrentSha256))) throw new Error('omd intent append expectedCurrentSha256 must be null or the current immutable ledger SHA-256');
  const {
    INTENT_CURRENT_POINTER_SCHEMA_VERSION, INTENT_LEDGER_SCHEMA_VERSION, appendExplicitIntent, intentLedgerSha256,
    validateIntentCurrentPointer, validateIntentLedger,
  } = await import('../core/runtime/intent.ts');
  const run = validateProjectRunInvocation(invocation);
  const eventBytes = Buffer.from(canonicalJson(event));
  const release = acquireProjectLock({ projectRoot: process.cwd(), relativePath: '.omd/intent-current.lock', invocation: run });
  try {
    let ledger = validateIntentLedger({ schemaVersion: INTENT_LEDGER_SCHEMA_VERSION, events: [], currentEventId: null });
    const pointerPath = join(process.cwd(), '.omd', 'intent-current.json');
    let currentSha256: string | null = null;
    if (existsSync(pointerPath)) {
      const pointer = validateIntentCurrentPointer(inputJson(pointerPath, 'intent current pointer'));
      ledger = validateIntentLedger(inputJson(join(process.cwd(), '.omd', pointer.record), 'intent immutable record'));
      if (intentLedgerSha256(ledger) !== pointer.sha256) throw new Error('INTENT_CURRENT_POINTER_STALE: current pointer does not match immutable ledger');
      currentSha256 = pointer.sha256;
    }
    if (currentSha256 !== expectedCurrentSha256) throw new Error('INTENT_CURRENT_CAS_MISMATCH: current ledger changed before guarded append');
    if (currentSha256 !== null) requireCurrentIntentLedgerAuthorization(run, process.cwd(), serializeIntentLedger(ledger));
    requireCurrentUserIntentEventAuthorization(run, process.cwd(), eventBytes);
    const next = appendExplicitIntent(ledger, event as never);
    const digest = intentLedgerSha256(next);
    const record = `intent-runs/sha256-${digest}.json`;
    writeImmutableProjectFile({ projectRoot: process.cwd(), relativePath: `.omd/${record}`, content: serializeIntentLedger(next), invocation: run });
    const pointer = { schemaVersion: INTENT_CURRENT_POINTER_SCHEMA_VERSION, record, sha256: digest };
    const path = replaceProjectFileAtomically({ projectRoot: process.cwd(), relativePath: '.omd/intent-current.json', content: JSON.stringify(pointer, null, 2), invocation: run });
    if (opts.json) process.stdout.write(JSON.stringify({ path, record, sha256: digest }));
    else console.log(path);
  } finally {
    release();
  }
  process.exit(0);
}

/** Prints the canonical skeleton for an input a coordinator authors by hand. */
async function cmdSchema(name: string | undefined, opts: Opts): Promise<never> {
  const { INPUT_SKELETONS, inputSkeleton } = await import('../core/schema/inputs.ts');
  if (name === undefined || name === 'list') {
    if (opts.json) process.stdout.write(JSON.stringify(INPUT_SKELETONS.map((entry) => ({ name: entry.name, path: entry.path, command: entry.command }))));
    else for (const entry of INPUT_SKELETONS) console.log(`  ${entry.name.padEnd(22)} ${entry.path.padEnd(38)} ${entry.command}`);
    process.exit(0);
  }
  const entry = inputSkeleton(name);
  if (opts.json) process.stdout.write(JSON.stringify(entry));
  else {
    console.log(`${entry.name} -> ${entry.path}`);
    console.log(`validated by: ${entry.command}`);
    if (entry.constraints !== undefined) {
      console.log('constraints:');
      for (const constraint of entry.constraints) console.log(`- ${constraint}`);
    }
    console.log(JSON.stringify(entry.skeleton, null, 2));
  }
  process.exit(0);
}

/**
 * Stage state for a run. `status`/`resume` derive everything from artifacts on disk; `deliver`
 * records the one fact that cannot be derived — that a contract's exact bytes reached the stage
 * that must obey them — and `require` refuses to advance without both.
 */
async function cmdStage(mode: string | undefined, opts: Opts): Promise<never> {
  const { STAGES, contractSha256, deliveryReceipt, DELIVERY_LOG, readDeliveryReceipts, requireStage, resolveRunState, serializeDeliveryLog, stageDefinition } = await import('../core/stage/contract.ts');
  const packRoot = join(root, 'core');
  const projectRoot = process.cwd();

  if (mode === 'next') {
    if (opts._.length) throw new Error('usage: omd stage next --json');
    const { nextStageWork } = await import('../core/stage/next.ts');
    const work = nextStageWork(projectRoot, packRoot, invocationFromActivation(opts, 'omd stage next'));
    console.log(JSON.stringify(work));
    process.exit(0);
  }

  if (mode === 'status' || mode === 'resume') {
    if (opts._.length > 0) throw new Error(`usage: omd stage ${mode} [--json]`);
    const invocation = invocationFromActivation(opts, `omd stage ${mode}`);
    const state = resolveRunState(projectRoot, packRoot, invocation);
    const blocked = state.current === null ? undefined : requireStage(projectRoot, packRoot, state.current, invocation);
    const result = { ...state, completedMeaning: 'artifact-presence-only',
      nextValidation: 'omd guard production --json (before source); omd guard completion --json (before completion)',
      blocked: blocked?.ok === false ? blocked : null };
    if (opts.json) process.stdout.write(JSON.stringify(result));
    else {
      for (const stage of state.stages) {
        const contracts = stage.undelivered.length === 0 ? '' : `  undelivered: ${stage.undelivered.join(', ')}`;
        console.log(`  ${stage.present ? 'have' : '    '}  ${stage.stage.padEnd(20)} ${stage.artifact.padEnd(40)} ${stage.owner}${contracts}`);
      }
      if (state.current === null) console.log('every recorded stage artifact exists; resume at the first unproven gate');
      else {
        console.log(`current stage: ${state.current}`);
        for (const contract of blocked?.undeliveredContracts ?? []) console.log(`  deliver first: omd stage deliver --stage ${state.current} --contract ${contract}`);
      }
    }
    process.exit(0);
  }

  if (mode === 'deliver') {
    const contract = opts.contract;
    const stage = opts.stage;
    if (contract === undefined || stage === undefined || opts._.length > 0) {
      throw new Error('usage: omd stage deliver --stage <stage> --contract <pack-relative.md> [--json]');
    }
    const receipt = deliveryReceipt(stageDefinition(stage).id, contract, contractSha256(packRoot, contract), new Date().toISOString());
    const adapter = projectWriterFromActivation(opts, 'omd stage deliver');
    adapter.write(DELIVERY_LOG, serializeDeliveryLog([...readDeliveryReceipts(projectRoot), receipt]));
    if (opts.json) process.stdout.write(JSON.stringify(receipt));
    else console.log(`delivered ${contract} to ${receipt.stage} (${receipt.sha256.slice(0, 12)})`);
    process.exit(0);
  }

  if (mode === 'require') {
    const stage = opts.stage ?? opts._[0];
    if (stage === undefined || opts._.length > 1) throw new Error('usage: omd stage require <stage> [--json]');
    const requirement = requireStage(
      projectRoot,
      packRoot,
      stage,
      invocationFromActivation(opts, 'omd stage require'),
    );
    if (opts.json) process.stdout.write(JSON.stringify(requirement));
    else if (requirement.ok) console.log(`ok — ${requirement.stage} may run`);
    else {
      for (const artifact of requirement.missingArtifacts) console.error(`[owner-blocked] ${requirement.stage} needs an earlier owner's artifact: ${artifact} — spawn that owner; only its failure stops the run`);
      for (const contract of requirement.undeliveredContracts) console.error(`[deliver-then-retry] ${requirement.stage} has no current receipt for ${contract}. This is your own next step, not a run failure: run \`omd stage deliver --stage ${requirement.stage} --contract ${contract}\`, then require again`);
    }
    process.exit(requirement.ok ? 0 : 1);
  }

  if (mode === 'record' || mode === 'cost') {
    const { evaluateStageBudget, readStageUsage, serializeStageUsage, STAGE_USAGE_LOG, STAGE_USAGE_SCHEMA, validateStageUsageSample } = await import('../core/stage/usage.ts');
    if (mode === 'record') {
      const stage = opts.stage ?? opts._[0];
      if (stage === undefined || opts._.length > 1) throw new Error('usage: omd stage record --stage <stage> [--json]');
      const { computeRunUsage } = await import('../core/usage/index.ts');
      const current = computeRunUsage(projectRoot);
      if (current === null) throw new Error('STAGE_USAGE_UNAVAILABLE: no host session log to attribute this stage to');
      const sample = validateStageUsageSample({
        schema: STAGE_USAGE_SCHEMA,
        stage: stageDefinition(stage).id,
        at: new Date().toISOString(),
        totalTokens: current.totalTokens,
        outputTokens: current.outputTokens,
        elapsedMs: current.elapsedMs,
        approximate: current.approximate === true,
      });
      const adapter = projectWriterFromActivation(opts, 'omd stage record');
      adapter.write(STAGE_USAGE_LOG, serializeStageUsage([...readStageUsage(projectRoot), sample]));
      if (opts.json) process.stdout.write(JSON.stringify(sample));
      else console.log(`recorded ${sample.stage}: ${sample.totalTokens} tokens, ${Math.round(sample.elapsedMs / 1000)}s cumulative`);
      process.exit(0);
    }
    const budget = {
      ...(opts.maxStageTokens === undefined ? {} : { maxStageTokens: Number(opts.maxStageTokens) }),
      ...(opts.maxRunTokens === undefined ? {} : { maxRunTokens: Number(opts.maxRunTokens) }),
      ...(opts.maxRunMinutes === undefined ? {} : { maxRunElapsedMs: Number(opts.maxRunMinutes) * 60_000 }),
    };
    const report = evaluateStageBudget(readStageUsage(projectRoot), budget);
    if (opts.json) process.stdout.write(JSON.stringify(report));
    else {
      for (const cost of report.costs) console.log(`  ${cost.stage.padEnd(20)} ${String(cost.totalTokens).padStart(10)} tokens  ${String(Math.round(cost.elapsedMs / 1000)).padStart(6)}s${cost.approximate ? '  (approx)' : ''}`);
      console.log(`  ${'run total'.padEnd(20)} ${String(report.runTokens).padStart(10)} tokens  ${String(Math.round(report.runElapsedMs / 1000)).padStart(6)}s`);
      for (const finding of report.findings) console.error(`[over budget] ${finding}`);
    }
    process.exit(report.ok ? 0 : 1);
  }
  if (mode === 'list') {
    if (opts.json) process.stdout.write(JSON.stringify(STAGES));
    else for (const stage of STAGES) console.log(`  ${stage.id.padEnd(20)} ${stage.owner.padEnd(16)} ${stage.artifact.padEnd(40)} ${stage.requiredContracts.join(', ')}`);
    process.exit(0);
  }

  throw new Error('usage: omd stage next|status|resume|list [--json] | deliver --stage <s> --contract <c> | require <stage> | record --stage <s> | cost [--max-stage-tokens N] [--max-run-tokens N] [--max-run-minutes N]');
}
/**
 * Resolves the contracts a piece of work binds, from inputs a machine evaluates identically twice:
 * file paths, code symbols, and typed brief fields. Never from free-text intent.
 */
async function cmdCue(opts: Opts): Promise<never> {
  const { resolveCues, cueContracts, stageContractsWithCues } = await import('../core/stage/cues.ts');
  const fields: Record<string, string> = {};
  for (const pair of opts.field === undefined ? [] : [opts.field]) {
    const [key, ...rest] = pair.split('=');
    if (key === undefined || rest.length === 0) throw new Error('usage: omd cue --field <name>=<value>');
    fields[key] = rest.join('=');
  }
  const cues = resolveCues({
    ...(opts.path === undefined ? {} : { paths: [opts.path] }),
    ...(opts.symbol === undefined ? {} : { symbols: [opts.symbol] }),
    fields,
  });
  const contracts = opts.stage === undefined ? cueContracts(cues) : stageContractsWithCues(opts.stage, cues);
  const result = { contracts, cues: cues.map((cue) => ({ source: cue.rule.source, matched: cue.matched, contracts: cue.rule.contracts, reason: cue.rule.reason })) };
  if (opts.json) process.stdout.write(JSON.stringify(result));
  else {
    for (const cue of result.cues) console.log(`  ${cue.source.padEnd(7)} ${cue.matched.padEnd(28)} ${cue.contracts.join(', ')}  — ${cue.reason}`);
    console.log(contracts.length === 0 ? 'no contract is bound by these cues' : `deliver: ${contracts.join(', ')}`);
  }
  process.exit(0);
}

function cmdCandidate(mode: string | undefined, opts: Opts): never {
  if (mode !== 'select' || !opts.input || opts._.length > 0) {
    throw new Error('usage: omd candidate select --input <candidate-selection-pointer.json> [--json]');
  }
  const pointer = validateCandidateSelectionPointer(inputJson(opts.input, 'omd candidate select'));
  resolveCandidateSelection(process.cwd(), pointer);
  const writer = projectWriterFromActivation(opts, 'omd candidate select');
  writer.mkdir('.omd/.cache/sketches');
  writer.write(CANDIDATE_SELECTION_POINTER_PATH, `${JSON.stringify(pointer, null, 2)}\n`);
  if (opts.json) {
    process.stdout.write(JSON.stringify({
      path: CANDIDATE_SELECTION_POINTER_PATH,
      directory: pointer.directory,
    }));
  } else {
    console.log(CANDIDATE_SELECTION_POINTER_PATH);
  }
  process.exit(0);
}

/** Plans locale-grounded design or validates multi-locale Beat copy. */
async function cmdLocale(mode: string | undefined, opts: Opts): Promise<never> {
  if (mode === 'plan' && opts._.length === 0) {
    const { localeDesignRouteFindings, routeLocaleDesignContext } = await import('../core/locale/design-context.ts');
    const contextPath = opts.input ?? join(process.cwd(), '.omd', 'locale-design-context.json');
    const route = routeLocaleDesignContext(inputJson(contextPath, 'omd locale plan'));
    const findings = localeDesignRouteFindings(route);
    if (opts.json) process.stdout.write(JSON.stringify({ route, findings }));
    else {
      for (const finding of findings) console.error(`[error] ${finding.id}: ${finding.message}`);
      if (findings.length === 0) console.log(`ok — locale design route: ${route.decision} for ${route.context.surfaceLocale}`);
    }
    process.exit(findings.length > 0 ? 1 : 0);
  }
  if (mode === 'profile' && opts._.length === 0) {
    if (!opts.input) throw new Error('usage: omd locale profile --input <profile.json> --locale-context .omd/locale-design-context.json [--json] | --publish --input <profile.json> --activation <host-issued-invocation.json>');
    if (opts.publish) {
      const { publishCulturalDesignProfile } = await import('../core/locale/cultural-profile-files.ts');
      const result = publishCulturalDesignProfile(
        process.cwd(),
        inputJson(opts.input, 'omd locale profile --publish'),
        invocationFromActivation(opts, 'omd locale profile --publish'),
      );
      const output = {
        profileSha256: result.profileSha256,
        profilePointerPath: result.profilePointerPath,
        projectionSha256: result.projectionSha256,
        projectionPointerPath: result.projectionPointerPath,
      };
      if (opts.json) process.stdout.write(JSON.stringify(output));
      else console.log(`ok — cultural profile ${output.profileSha256}; projection ${output.projectionSha256}`);
      process.exit(0);
    }
    if (!opts.localeContext) throw new Error('usage: omd locale profile --input <profile.json> --locale-context .omd/locale-design-context.json [--json]');
    const { routeLocaleDesignContext } = await import('../core/locale/design-context.ts');
    const {
      culturalDesignProfileSha256,
      culturalDesignProjectionSha256,
      projectCulturalDesignProfile,
      validateCulturalDesignProfile,
    } = await import('../core/locale/cultural-profile.ts');
    const route = routeLocaleDesignContext(inputJson(opts.localeContext, 'omd locale profile --locale-context'));
    const profile = validateCulturalDesignProfile(inputJson(opts.input, 'omd locale profile'), route);
    const projection = projectCulturalDesignProfile(profile, route);
    const result = {
      profileSha256: culturalDesignProfileSha256(profile),
      projection,
      projectionSha256: culturalDesignProjectionSha256(projection),
    };
    if (opts.json) process.stdout.write(JSON.stringify(result));
    else console.log(`ok — cultural profile ${result.profileSha256}; projection ${result.projectionSha256}`);
    process.exit(0);
  }
  if (mode === 'profile-check' && opts._.length === 0) {
    const { readCurrentCulturalDesignProfile } = await import('../core/locale/cultural-profile-files.ts');
    const { verifyRemoteCulturalDesignSources } = await import('../core/locale/source-capture-files.ts');
    const result = readCurrentCulturalDesignProfile(
      process.cwd(),
      invocationFromActivation(opts, 'omd locale profile-check'),
    );
    const remote = await verifyRemoteCulturalDesignSources(
      process.cwd(), result.profile.sources, result.profile.contextSha256,
    );
    const output = {
      profileSha256: result.profileSha256,
      profilePointerPath: result.profilePointerPath,
      projectionSha256: result.projectionSha256,
      projectionPointerPath: result.projectionPointerPath,
      remote,
    };
    if (opts.json) process.stdout.write(JSON.stringify(output));
    else console.log(`ok — cultural profile ${output.profileSha256}; projection ${output.projectionSha256}`);
    process.exit(0);
  }
  if (mode === 'source-capture' && opts._.length === 0) {
    if (!opts.url) throw new Error('usage: omd locale source-capture --url <https-url> --activation <host-issued-invocation.json> [--json]');
    const { captureCulturalDesignSource } = await import('../core/locale/source-capture-files.ts');
    const result = await captureCulturalDesignSource(
      process.cwd(), opts.url, invocationFromActivation(opts, 'omd locale source-capture'),
    );
    const output = {
      status: result.receipt.status,
      url: result.receipt.url,
      attemptedUrl: result.receipt.attemptedUrl,
      capturedAt: result.receipt.capturedAt,
      captureSha256: result.receiptSha256,
      receiptPath: result.receiptPath,
      contentPath: result.contentPath,
      reason: result.receipt.reason,
    };
    if (opts.json) process.stdout.write(JSON.stringify(output));
    else console.log(`ok — locale source ${output.status}: ${output.captureSha256}`);
    process.exit(0);
  }
  if (mode === 'source-stability' && opts._.length === 0) {
    if (!opts.url) throw new Error('usage: omd locale source-stability --url <https-url> --activation <host-issued-invocation.json> [--json]');
    const { captureStableCulturalDesignSource } = await import('../core/locale/source-capture-files.ts');
    const result = await captureStableCulturalDesignSource(
      process.cwd(), opts.url, invocationFromActivation(opts, 'omd locale source-stability'),
    );
    const output = {
      status: result.receipt.status,
      url: result.receipt.url,
      attemptedUrl: result.receipt.attemptedUrl,
      capturedAt: result.receipt.capturedAt,
      captureSha256: result.receiptSha256,
      receiptPath: result.receiptPath,
      contentPath: result.contentPath,
      reason: result.receipt.reason,
    };
    if (opts.json) process.stdout.write(JSON.stringify(output));
    else console.log(`ok — locale source stability ${output.status}: ${output.captureSha256}`);
    process.exit(0);
  }
  if (mode !== 'check' || opts._.length > 0) throw new Error('usage: omd locale plan [--input .omd/locale-design-context.json] [--json] | omd locale source-capture --url <https-url> --activation <host-issued-invocation.json> [--json] | omd locale source-stability --url <https-url> --activation <host-issued-invocation.json> [--json] | omd locale profile --input <profile.json> --locale-context .omd/locale-design-context.json [--json] | omd locale check [--input .omd/locale.json] [--deck .omd/copy-deck.md] [--json]');
  const { checkLocaleCopyBinding, validateLocaleContract } = await import('../core/locale/contract.ts');
  const contractPath = opts.input ?? join(process.cwd(), '.omd', 'locale.json');
  const contract = validateLocaleContract(inputJson(contractPath, 'omd locale check'));
  const deckPath = opts.deck ?? join(process.cwd(), '.omd', 'copy-deck.md');
  const findings = existsSync(deckPath)
    ? checkLocaleCopyBinding(contract, readFileSync(deckPath, 'utf8'))
    : [{ id: 'LOCALE-DECK-MISSING', message: `No copy deck at ${relative(process.cwd(), deckPath)} to bind locales against.` }];
  if (opts.json) process.stdout.write(JSON.stringify({ contract, findings }));
  else {
    for (const finding of findings) console.error(`[error] ${finding.id}: ${finding.message}`);
    if (findings.length === 0) console.log(`ok — ${contract.mode} contract covers ${contract.locales.join(', ')} with primary ${contract.primary}`);
  }
  process.exit(findings.length > 0 ? 1 : 0);
}
/** Correlates the brief's stated requirements with the built page; it adds no style rule. */
async function cmdComplete(mode: string | undefined, opts: Opts): Promise<never> {
  const { checkFunctionalCompleteness, validateFunctionalRequirements } = await import('../core/completeness/index.ts');
  if (mode === 'set') {
    if (!opts.input || opts._.length > 0) throw new Error('usage: omd complete set --input <functional-requirements.json> [--json]');
    const requirements = validateFunctionalRequirements(inputJson(opts.input, 'omd complete set'));
    const path = projectWriterFromActivation(opts, 'omd complete set')
      .write('.omd/functional-requirements.json', `${JSON.stringify(requirements, null, 2)}\n`);
    if (opts.json) process.stdout.write(JSON.stringify({ path, requirements: requirements.requirements.length }));
    else console.log(path);
    process.exit(0);
  }
  if (mode === 'publish') {
    if (!opts.input || opts._.length > 0) throw new Error('usage: omd complete publish --input <completeness-run.json> [--activation <host-issued-invocation.json>] [--json]');
    const { publishCompletenessRun } = await import('../core/completion/evidence.ts');
    const path = publishCompletenessRun(process.cwd(), inputJson(opts.input, 'omd complete publish'), invocationFromActivation(opts, 'omd complete publish'));
    if (opts.json) process.stdout.write(JSON.stringify({ path })); else console.log(path);
    process.exit(0);
  }
  const target = opts._[0];
  if (mode !== 'check' || target === undefined || opts._.length > 1) {
    throw new Error('usage: omd complete set --input <functional-requirements.json> | check <page> [--input <requirements.json>] | publish --input <completeness-run.json> [--json]');
  }
  const requirements = validateFunctionalRequirements(inputJson(opts.input ?? join(process.cwd(), '.omd', 'functional-requirements.json'), 'omd complete check'));
  const raw = await rawIrFor(opts, target);
  const findings = checkFunctionalCompleteness(requirements, raw.nodes);
  if (opts.json) process.stdout.write(JSON.stringify({ requirements: requirements.requirements.length, findings }));
  else {
    for (const finding of findings) console.error(`[error] ${finding.id} ${finding.requirement}: ${finding.message}`);
    if (findings.length === 0) console.log(`ok — all ${requirements.requirements.length} declared requirements are present, operable, and reachable`);
  }
  process.exit(findings.length > 0 ? 1 : 0);
}
async function cmdBenchmark(mode: string | undefined, opts: Opts): Promise<never> {
  if (mode === 'record') {
    if (!opts.input) throw new Error('usage: omd benchmark record --input <reference-flow-input.json> [--json]');
    const { recordLiveReferenceFlow } = await import('../core/ref/live-flow.ts');
    const { withBrowser } = await import('../core/render/index.ts');
    const writer = projectWriterFromActivation(opts, 'omd benchmark record');
    const input = inputJson(opts.input, 'omd benchmark record');
    const result = await withBrowser(browser => recordLiveReferenceFlow(browser, process.cwd(), input, writer));
    console.log(JSON.stringify(result));
    process.exit(result.status === 'completed' ? 0 : 1);
  }
  const {
    parseTaskFlowBenchmark,
    projectTaskFlowBenchmark,
    validateTaskFlowBenchmarkEvidence,
  } = await import('../core/ref/task-flow-benchmark.ts');
  const benchmarkPath = opts.input ?? join(process.cwd(), '.omd', 'task-flow-benchmark.json');
  if (mode === 'set') {
    if (!opts.input || opts._.length > 0) {
      throw new Error('usage: omd benchmark set --input <task-flow-benchmark.json> [--activation <host-issued-invocation.json>] [--json]');
    }
    const benchmark = parseTaskFlowBenchmark(inputJson(opts.input, 'omd benchmark set'), {
      ...(opts.sourceSha ? { expectedSourceContractSha256: opts.sourceSha } : {}),
    });
    const evidenceStrength = validateTaskFlowBenchmarkEvidence(process.cwd(), benchmark);
    const projection = projectTaskFlowBenchmark(benchmark);
    const writer = projectWriterFromActivation(opts, 'omd benchmark set');
    const path = writer.write('.omd/task-flow-benchmark.json', `${JSON.stringify(benchmark, null, 2)}\n`);
    const projectionPath = writer.write('.omd/task-flow-benchmark-projection.json', `${JSON.stringify(projection, null, 2)}\n`);
    if (opts.json) process.stdout.write(JSON.stringify({ path, projectionPath, projection, evidenceStrength }));
    else console.log(`${path}\n${projectionPath}`);
    process.exit(0);
  }
  if (mode === 'check') {
    if (opts._.length > 0) throw new Error('usage: omd benchmark check [--input <task-flow-benchmark.json>] [--source-sha <sha256>] [--json]');
    const benchmark = parseTaskFlowBenchmark(inputJson(benchmarkPath, 'omd benchmark check'), {
      ...(opts.sourceSha ? { expectedSourceContractSha256: opts.sourceSha } : {}),
    });
    const evidenceStrength = validateTaskFlowBenchmarkEvidence(process.cwd(), benchmark);
    const projection = projectTaskFlowBenchmark(benchmark);
    if (opts.json) process.stdout.write(JSON.stringify({ benchmark, projection, evidenceStrength }));
    else console.log(`ok — current evidence files for ${benchmark.sources.length} declared sources, ${benchmark.sources.reduce((count, source) => count + source.screens.length, 0)} screens and ${benchmark.sources.reduce((count, source) => count + source.flows.length, 0)} flows; declared completed native flows verified: ${evidenceStrength.liveFlowVerified}; exclusions and artifact-only records remain unverified`);
    process.exit(0);
  }
  throw new Error('usage: omd benchmark record --input <reference-flow-input.json> | set --input <task-flow-benchmark.json> | check [--input <task-flow-benchmark.json>] [--json]');
}
async function cmdArtDirection(mode: string | undefined, opts: Opts): Promise<never> {
  if (mode === 'alternatives-sha') {
    if (!opts.input || opts._.length > 0) throw new Error('usage: omd art-direction alternatives-sha --input <alternatives.json> [--json]');
    const payload = inputJson(opts.input, 'omd art-direction alternatives-sha');
    const alternatives = Array.isArray(payload)
      ? payload
      : isRecord(payload) && Array.isArray(payload.alternatives)
        ? payload.alternatives
        : undefined;
    if (alternatives === undefined) throw new Error('ART_DIRECTION_ALTERNATIVES_INVALID: input must be an alternatives array or contain an alternatives array');
    const result = { alternativesSha256: sha256(canonicalJson(alternatives)) };
    console.log(opts.json ? JSON.stringify(result) : result.alternativesSha256);
    process.exit(0);
  }
  if (mode === 'check-input') {
    if (opts._.length > 0) throw new Error('usage: omd art-direction check-input [--input <alternatives.json>] [--route /] [--json]');
    const { inputSkeleton } = await import('../core/schema/inputs.ts');
    const { readReferenceBoardArtifacts } = await import('../core/ref/board-artifacts.ts');
    const { createEmptyIntentLedger } = await import('../core/runtime/intent.ts');
    const projectRoot = process.cwd();
    const selection = validatePreReferenceSelectionV2(projectRoot);
    const candidate = readReferenceBoardArtifacts(projectRoot).raw.candidates.find((entry) => entry.id === selection.candidateId);
    if (candidate === undefined) throw new Error('ART_DIRECTION_REFERENCE_CANDIDATE_REQUIRED: current selected candidate is missing');
    if (opts.route !== undefined && opts.route !== candidate.route) throw new Error('ART_DIRECTION_ROUTE_STALE: requested route does not match the selected candidate');
    const handoff = validateReferenceHandoffCurrentness(projectRoot, JSON.parse(readContainedRegularFile(projectRoot, '.omd/reference-handoffs/art-direction.json', 'art-direction handoff').toString('utf8')));
    if (handoff.role !== 'art-direction') throw new Error('ART_DIRECTION_REFERENCE_HANDOFF_REQUIRED: current handoff is not for art direction');
    // Preview the publisher's no-lock default without creating an intent or claiming user input.
    let intentSha256 = intentLedgerSha256(createEmptyIntentLedger());
    if (existsSync(join(projectRoot, '.omd/intent-current.json'))) {
      const pointer = validateIntentCurrentPointer(JSON.parse(readContainedRegularFile(projectRoot, '.omd/intent-current.json', 'intent current pointer').toString('utf8')));
      if (pointer.record !== `intent-runs/sha256-${pointer.sha256}.json`) throw new Error('ART_DIRECTION_INTENT_STALE: current pointer record does not match its immutable digest');
      const ledger = validateIntentLedger(JSON.parse(readContainedRegularFile(projectRoot, `.omd/${pointer.record}`, 'current intent ledger').toString('utf8')));
      intentSha256 = intentLedgerSha256(ledger);
      if (intentSha256 !== pointer.sha256) throw new Error('ART_DIRECTION_INTENT_STALE: current pointer does not match the immutable ledger');
    }
    const skeleton = inputSkeleton('art-direction-check').skeleton as Record<string, unknown>;
    const supplied = opts.input === undefined ? undefined : inputJson(opts.input, 'omd art-direction check-input');
    const alternatives = supplied === undefined ? undefined : Array.isArray(supplied) ? supplied : isRecord(supplied) && Array.isArray(supplied.alternatives) ? supplied.alternatives : undefined;
    if (supplied !== undefined && alternatives === undefined) throw new Error('ART_DIRECTION_ALTERNATIVES_INVALID: input must be an alternatives array or contain an alternatives array');
    const lineage = {
      route: candidate.route,
      taskIds: [...new Set(candidate.pieces.flatMap((piece) => piece.taskIds))].sort(),
      boardSha256: selection.captureSha256,
      preSelectionSha256: referenceSelectionV2Sha256(selection),
      handoffSha256: handoff.payloadSha256,
      intentSha256,
      ...(alternatives === undefined ? {} : { alternativesSha256: sha256(canonicalJson(alternatives)) }),
    };
    const payload = {
      ...skeleton,
      route: candidate.route,
      references: canonicalArtDirectionReferences(selection),
      ...(alternatives === undefined ? {} : { alternatives }),
      evaluatorAssessment: { ...(skeleton.evaluatorAssessment as Record<string, unknown>), ...lineage, ...(alternatives === undefined ? {} : { alternatives }) },
      evaluatorResult: { ...(skeleton.evaluatorResult as Record<string, unknown>), ...lineage },
    };
    console.log(JSON.stringify(payload, null, opts.json ? 0 : 2));
    process.exit(0);
  }
  if (mode !== 'check' || !opts.input || opts._.length > 0) {
    throw new Error('usage: omd art-direction check|alternatives-sha --input <json> [--json], or check-input [--input <alternatives.json>] [--route /] [--json]');
  }
  const command = 'omd art-direction check';
  const payload = inputJson(opts.input, command);
  if (!isRecord(payload)) throw new Error(`${command} input must contain evaluator assessment and result payloads`);
  const allowed = new Set<string>(ART_DIRECTION_CHECK_INPUT_KEYS);
  if (Object.keys(payload).some((key) => !allowed.has(key))) throw new Error('ART_DIRECTION_CALLER_DECISION_FORBIDDEN: evaluator choices, scores, and motion sources must remain inside the evaluator bytes');
  const { alternatives, references, eligibility, evaluatorAssessment, evaluatorResult, beats, invocation, route, implementationLane, fallbackPath, performanceAccessibilityBudget } = payload;
  const run = activationInputPath(opts) === undefined
    ? validateProjectRunInvocation(invocation)
    : invocationFromActivation(opts, command);
  if (evaluatorAssessment === undefined || evaluatorResult === undefined) throw new Error('ART_DIRECTION_EVALUATOR_AUTHORIZATION_REQUIRED: evaluator assessment and result payloads are required');
  const assessmentBytes = Buffer.from(canonicalJson(evaluatorAssessment));
  const resultBytes = Buffer.from(canonicalJson(evaluatorResult));
  const alternativesSha256 = sha256(canonicalJson(alternatives));
  const closedResult = parseClosedEvaluatorResult(evaluatorResult, alternativesSha256);
  if (!isRecord(evaluatorAssessment) || !Array.isArray(evaluatorAssessment.assessments)) evaluatorResultError('assessment must contain assessments');
  const assessments = evaluatorAssessment.assessments as { register?: unknown; score?: unknown }[];
  const winner = [...assessments].sort((left, right) => Number(right.score) - Number(left.score) || String(left.register).localeCompare(String(right.register)))[0];
  if (winner?.register !== closedResult.winner) evaluatorResultError('winner must match the evaluator assessment ranking');

  const releaseMutation = acquireProjectMutationLock(process.cwd(), run);
  try {
  const { INTENT_CURRENT_POINTER_SCHEMA_VERSION, INTENT_LEDGER_SCHEMA_VERSION, createEmptyIntentLedger, resolveCurrentUserBeatExceptionReceipt } = await import('../core/runtime/intent.ts');
  const intentPointerPath = join(process.cwd(), '.omd', 'intent-current.json');
  let ledger = createEmptyIntentLedger();
  let intentSha256 = intentLedgerSha256(ledger);
  let intentLedgerBytes = serializeIntentLedger(ledger);
  if (existsSync(intentPointerPath)) {
    const pointer = validateIntentCurrentPointer(inputJson(intentPointerPath, 'intent current pointer'));
    intentLedgerBytes = readFileSync(join(process.cwd(), '.omd', pointer.record));
    ledger = validateIntentLedger(JSON.parse(intentLedgerBytes.toString('utf8')));
    if (intentLedgerSha256(ledger) !== pointer.sha256) throw new Error('ART_DIRECTION_INTENT_STALE: current intent pointer does not match immutable ledger');
    intentSha256 = pointer.sha256;
  } else {
    const record = `intent-runs/sha256-${intentSha256}.json`;
    writeContentAddressedProjectFile({ projectRoot: process.cwd(), relativePath: `.omd/${record}`, content: intentLedgerBytes, invocation: run });
    replaceProjectFileAtomically({ projectRoot: process.cwd(), relativePath: '.omd/intent-current.json', content: JSON.stringify({ schemaVersion: INTENT_CURRENT_POINTER_SCHEMA_VERSION, record, sha256: intentSha256 }, null, 2), invocation: run });
  }
  if (!isRecord(eligibility)) throw new Error('ART_DIRECTION_ELIGIBILITY_INVALID: eligibility must be an object');
  if ('approvedMotionRecipe' in eligibility || 'selectedMotionReferenceSlotId' in eligibility || 'buildSha256' in eligibility) throw new Error('ART_DIRECTION_ELIGIBILITY_BYPASS_FORBIDDEN: motion source and build binding are host-owned fields');
  const selectedReferenceSlotId = closedResult.motionResolution.slots.find((slot) => slot.obligationDisposition === 'used')?.slotId;
  const approvedMotionRecipeReceipt = closedResult.approvedMotionRecipeReceipt;
  const recipeBytes = closedResult.approvedMotionRecipe === undefined ? undefined : Buffer.from(canonicalJson(closedResult.approvedMotionRecipe));
  if (recipeBytes !== undefined) {
    if (approvedMotionRecipeReceipt === undefined) evaluatorResultError('approved recipe payload and receipt must be supplied together');
    if (approvedMotionRecipeReceipt.recipeBytes !== recipeBytes.toString() || approvedMotionRecipeReceipt.recipeSha256 !== sha256(recipeBytes)) {
      throw new Error('ART_DIRECTION_RECIPE_RECEIPT_STALE: typed recipe receipt must bind the exact recipe payload');
    }
  }
  if (approvedMotionRecipeReceipt !== undefined && approvedMotionRecipeReceipt.decisionSha256 !== recipeDecisionProjectionSha256({
    alternativesSha256: closedResult.alternativesSha256,
    winner: closedResult.winner as 'quiet' | 'confident' | 'showpiece',
    motionDecision: closedResult.motionResolution.motionDecision,
    slots: closedResult.motionResolution.slots,
    approvedRecipe: {
      recipeId: approvedMotionRecipeReceipt.recipeId,
      recipeSha256: approvedMotionRecipeReceipt.recipeSha256,
    },
  })) {
    throw new Error('ART_DIRECTION_RECIPE_RECEIPT_STALE: receipt must bind the canonical recipe decision projection');
  }
  const resolvedEligibility: ArtDirectionEligibility = {
    ...eligibility,
    buildSha256: run.activation.buildSha256,
    ...(selectedReferenceSlotId === undefined ? {} : { selectedMotionReferenceSlotId: selectedReferenceSlotId }),
    ...(approvedMotionRecipeReceipt === undefined ? {} : { approvedMotionRecipe: approvedMotionRecipeReceipt }),
  } as ArtDirectionEligibility;
  const handoffPath = join(process.cwd(), '.omd', 'reference-handoffs', 'art-direction.json');
  if (!existsSync(handoffPath)) throw new Error('ART_DIRECTION_REFERENCE_HANDOFF_REQUIRED: run `omd ref select` before art direction');
  const handoff = validateReferenceHandoffCurrentness(process.cwd(), inputJson(handoffPath, 'art-direction reference handoff'));
  const selection = validatePreReferenceSelectionV2(process.cwd());
  const { persistMotionResolutionProjection, persistSettledReferenceSelection, motionResolutionProjectionSha256 } = await import('../core/ref/reference-selection.ts');
  if (!Array.isArray(beats) || beats.length === 0 || !beats.every((beat) => typeof beat === 'string' && /^B-\d+$/.test(beat)) || new Set(beats).size !== beats.length) throw new Error('ART_DIRECTION_BEATS_INVALID: beats must be a non-empty set of unique stable B-<number> IDs grounded in the content regions');
  const motionInput = {
    activationSha256: artDirectionSha256(run.activation),
    alternativesSha256: closedResult.alternativesSha256,
    handoffSha256: handoff.payloadSha256,
    evaluatorInvocationSha256: projectRunInvocationSha256(run),
    evaluatorPayloadSha256: sha256(assessmentBytes),
    evaluatorResultSha256: sha256(resultBytes),
    motionDecision: closedResult.motionResolution.motionDecision,
    slots: closedResult.motionResolution.slots,
    ...(closedResult.motionResolution.approvedRecipe === undefined ? {} : { approvedRecipe: closedResult.motionResolution.approvedRecipe }),
    selection,
  };
  const projectedMotion = resolveMotionProjection(motionInput);
  const currentBeatException = ledger.events.at(-1)?.kind === 'current-user-beat-exception'
    ? ledger.events.at(-1)
    : undefined;
  const beatExceptionEventBytes = currentBeatException === undefined ? undefined : Buffer.from(canonicalJson({
    eventId: currentBeatException.eventId,
    currentUser: currentBeatException.currentUser,
    kind: currentBeatException.kind,
    lock: currentBeatException.lock,
    recordedAt: currentBeatException.recordedAt,
  }));
  const checked = resolveMarketingArtDirection({
    root: process.cwd(),
    invocation: run,
    intentLedgerBytes,
    evaluatorAssessmentBytes: assessmentBytes,
    evaluatorResultBytes: resultBytes,
    route: typeof route === 'string' ? route : '',
    alternatives: alternatives as never,
    eligibility: resolvedEligibility,
    implementationLane: typeof implementationLane === 'string' ? implementationLane : '',
    fallbackPath: typeof fallbackPath === 'string' ? fallbackPath : '',
    performanceAccessibilityBudget: typeof performanceAccessibilityBudget === 'string' ? performanceAccessibilityBudget : '',
    ...(beatExceptionEventBytes === undefined ? {} : { beatExceptionEventBytes }),
    ...(recipeBytes === undefined ? {} : { approvedMotionRecipeBytes: recipeBytes }),
  });
  const currentBeatExceptionReceipt = currentBeatException === undefined
    ? NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256
    : eventHash(currentBeatException);
  if (checked.currentUserBeatExceptionReceiptSha256 !== currentBeatExceptionReceipt) {
    throw new Error('ART_DIRECTION_BEAT_EXCEPTION_STALE: decision must bind the resolved current-user Beat-exception receipt');
  }
  validateArtDirectionDecisionShape(checked);
  if (exceedsCanonicalBeatBudget(checked.selectedRegister, beats, currentBeatExceptionReceipt)) {
    throw new Error(`ART_DIRECTION_BEAT_BUDGET_EXCEEDED: ${checked.selectedRegister} permits at most ${beatBudgetForRegister(checked.selectedRegister)} Beats without an exact current-user host-authorized Beat-exception receipt`);
  }
  const evaluatorResultDigest = sha256(resultBytes);
  writeContentAddressedProjectFile({
    projectRoot: process.cwd(),
    relativePath: `.omd/evaluator-results/sha256-${evaluatorResultDigest}.json`,
    content: resultBytes,
    invocation: run,
  });
  const motion = persistMotionResolutionProjection(process.cwd(), motionInput, { assessmentBytes, resultBytes, ...(recipeBytes === undefined ? {} : { approvedRecipeBytes: recipeBytes }) }, run);
  const settledSelection = persistSettledReferenceSelection(process.cwd(), selection, motionResolutionProjectionSha256(motion.projection), run);
  const settledMotionResolutionSha256 = motionResolutionProjectionSha256(motion.projection);
  if (checked.motionResolutionProjectionSha256 !== settledMotionResolutionSha256 || checked.settledSelectionSha256 !== referenceSelectionV2Sha256(settledSelection)) {
    throw new Error('ART_DIRECTION_MOTION_SETTLEMENT_STALE: decision must bind the persisted motion settlement');
  }
  const activationSha256 = artDirectionSha256(run.activation);
  if (checked.intentSha256 !== intentSha256 || checked.activationSha256 !== activationSha256) throw new Error('ART_DIRECTION_RUNTIME_BINDING_STALE: decision must bind the current immutable intent ledger and activation');
  if (handoff.role !== 'art-direction' || handoff.preSelectionSha256 !== checked.preSelectionSha256 || handoff.captureSha256 !== checked.boardSha256) throw new Error('ART_DIRECTION_REFERENCE_HANDOFF_STALE: decision must bind the current canonical v2 art-direction handoff');
  const record = { schemaVersion: ART_DIRECTION_RECORD_SCHEMA_VERSION, decision: checked, decisionSha256: artDirectionSha256(checked), referenceHandoffSha256: handoff.payloadSha256, intentLedgerSha256: intentSha256, activationSha256, beatIds: beats };
  validateArtDirectionRecord(record);
  const digest = artDirectionSha256(record);
  const recordPath = `art-direction-runs/sha256-${digest}.json`;
  writeContentAddressedProjectFile({ projectRoot: process.cwd(), relativePath: `.omd/${recordPath}`, content: JSON.stringify(record, null, 2), invocation: run });
  const pointer = { schemaVersion: ART_DIRECTION_POINTER_SCHEMA_VERSION, record: recordPath, sha256: digest };
  const path = replaceProjectFileAtomically({ projectRoot: process.cwd(), relativePath: '.omd/art-direction.json', content: JSON.stringify(pointer, null, 2), invocation: run });
  const { writeReferenceHandoffReceipt } = await import('../core/ref/reference-handoff.ts');
  const composerHandoff = writeReferenceHandoffReceipt(process.cwd(), 'composer', run);
  const handHandoff = writeReferenceHandoffReceipt(process.cwd(), 'hand', run);
  if (opts.json) process.stdout.write(JSON.stringify({ path, record: recordPath, sha256: digest, motionResolution: motion.path, composerHandoff, handHandoff }));
  else console.log(path);
  } finally {
    releaseMutation();
  }
  process.exit(0);
}
function captureReceipt(path: string) {
  const bytes = readFileSync(path);
  return { path, sha256: createHash('sha256').update(bytes).digest('hex') };
}
async function renderedBeatProof(target: string, beatIds: readonly string[], artDirectionHash: string, buildSha256: string, route: string, taskId: string, invocation: ProjectRunInvocation, adapter: ProjectWriteAdapter, out: string) {
  const copyDeck = readFileSync(join(process.cwd(), '.omd', 'copy-deck.md'));
  const copyDeckSha256 = createHash('sha256').update(copyDeck).digest('hex');
  const { captureRenderedBeatReceipt } = await import('../core/render/index.ts');
  const proof = await captureRenderedBeatReceipt(target, { adapter, out, artDirectionHash, buildSha256, route, taskId, invocation, copyDeckSha256, beatIds });
  const { validatePostRenderBeatProof } = await import('../core/copy/index.ts');
  const violations = validatePostRenderBeatProof(copyDeck.toString('utf8'), proof, { beatIds });
  if (violations.length > 0) throw new Error(`RENDERED_BEAT_PROOF_REQUIRED: ${violations.map((violation) => violation.message).join(' ')}`);
  return proof;
}

function requireCurrentLocalProductionTarget(target: string, route: string): void {
  let url: URL;
  try { url = new URL(target); } catch { throw new Error('DIRECTION_EVIDENCE_TARGET_INVALID: capture target must be an absolute localhost production URL'); }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:')
    || (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1' && url.hostname !== '[::1]')
    || url.pathname !== route || url.search !== '' || url.hash !== '') {
    throw new Error('DIRECTION_EVIDENCE_TARGET_STALE: capture target must be the exact current route on localhost with no query or fragment');
  }
}

async function cmdStaticEvidenceCapture(opts: Opts): Promise<never> {
  if (!opts.input || opts._.length > 0) throw new Error('usage: omd evidence static-capture --input <static-capture.json> [--json]');
  const payload = inputJson(opts.input, 'omd evidence static-capture');
  if (!isRecord(payload) || typeof payload.target !== 'string' || typeof payload.outDir !== 'string' || typeof payload.runId !== 'string' || typeof payload.taskId !== 'string') throw new Error('static capture input requires target, outDir, runId, taskId, and invocation');
  const { target, outDir: requestedOutDir, runId, taskId } = payload;
  const run = validateProjectRunInvocation(payload.invocation);
  const direction = currentArtDirection(process.cwd());
  requireCurrentLocalProductionTarget(target, direction.decision.route);
  const settledSelection = parseReferenceSelectionV2(inputJson(join(process.cwd(), '.omd', 'settled-reference-selections', `sha256-${direction.decision.settledSelectionSha256}.json`), 'static capture settlement'));
  if (referenceSelectionV2Sha256(settledSelection) !== direction.decision.settledSelectionSha256
    || settledSelection.slots.some((slot) => slot.signal === 'high-motion' && slot.rights === 'lawful' && slot.motionAxis === 'available' && slot.obligationDisposition !== 'rejected')) {
    throw new Error('STATIC_EVIDENCE_SETTLEMENT_STALE: capture requires the current none-motion settled selection with every pending motion obligation rejected');
  }
  if (direction.decision.motionDecision !== 'none' || direction.activationSha256 !== artDirectionSha256(run.activation)) throw new Error('STATIC_EVIDENCE_DIRECTION_STALE: capture requires the current none-motion art direction and its bound activation');
  const outDir = resolve(requestedOutDir);
  const relativeOut = relative(process.cwd(), outDir);
  if (relativeOut.startsWith('..') || relativeOut.startsWith('/')) throw new Error('static evidence capture outDir must be inside the project');
  const adapter = projectWriter(run);
  adapter.mkdir(relativeOut);
  const beatReceipt = await renderedBeatProof(target, direction.beatIds, artDirectionSha256(direction), run.activation.buildSha256, direction.decision.route, taskId, run, adapter, join(relativeOut, `${runId}-rendered-beats.json`));
  const { renderPage } = await import('../core/render/index.ts');
  const capture = async (name: string, viewport: { width: number; height: number }) => {
    const path = join(outDir, `${runId}-${name}.png`);
    await renderPage(target, { viewport, out: path, adapter });
    return captureReceipt(path);
  };
  const desktop = { width: 1280 as const, height: 900 as const };
  const mobile = { width: 390 as const, height: 844 as const };
  const observations = {
    desktop: { capture: await capture('desktop', desktop), ...desktop },
    mobile: { capture: await capture('mobile', mobile), ...mobile },
    temporalSamples: {
      desktop: [await capture('desktop-static-1', desktop), await capture('desktop-static-2', desktop), await capture('desktop-static-3', desktop)] as const,
      mobile: [await capture('mobile-static-1', mobile), await capture('mobile-static-2', mobile), await capture('mobile-static-3', mobile)] as const,
    },
  };
  const observationManifest = [
    observations.desktop.capture,
    observations.mobile.capture,
    ...observations.temporalSamples.desktop,
    ...observations.temporalSamples.mobile,
  ];
  const observationManifestSha256 = createHash('sha256').update(JSON.stringify(
    observationManifest.map(({ path, sha256 }) => ({ path, sha256 })),
  )).digest('hex');
  const captureRecord = {
    schema: 'static-direction-evidence-v1' as const,
    artDirectionHash: artDirectionSha256(direction),
    motionDecision: 'none' as const,
    expected: {
      artDirectionHash: artDirectionSha256(direction), selectionSha256: direction.decision.settledSelectionSha256,
      handoffSha256: direction.referenceHandoffSha256, buildHash: run.activation.buildSha256, runId,
      route: direction.decision.route, target, taskId,
    },
    observed: {
      runId, buildHash: run.activation.buildSha256,
      selectionSha256: direction.decision.settledSelectionSha256, handoffSha256: direction.referenceHandoffSha256,
      route: direction.decision.route, target, taskId, observationManifestSha256,
    },
    beatReceipt,
    observations,
  };
  if (opts.json) process.stdout.write(JSON.stringify(captureRecord)); else console.log(JSON.stringify(captureRecord, null, 2));
  process.exit(0);
}

async function cmdMotionEvidenceCapture(opts: Opts): Promise<never> {
  if (!opts.input || opts._.length > 0) throw new Error('usage: omd evidence motion-capture --input <motion-capture.json> [--json]');
  const payload = inputJson(opts.input, 'omd evidence motion-capture');
  if (!isRecord(payload) || typeof payload.target !== 'string' || typeof payload.outDir !== 'string' || typeof payload.runId !== 'string' || typeof payload.selector !== 'string'
    || payload.trigger !== 'load') throw new Error('motion capture input requires target, outDir, runId, selector, trigger: load, and invocation');
  const referenceSlotId = typeof payload.referenceSlotId === 'string' ? payload.referenceSlotId : undefined;
  const approvedRecipe = isRecord(payload.approvedRecipe) ? payload.approvedRecipe : undefined;
  if ((referenceSlotId === undefined) === (approvedRecipe === undefined)) throw new Error('motion capture requires exactly one settled referenceSlotId or approvedRecipe');
  const run = validateProjectRunInvocation(payload.invocation);
  requireCurrentLocalProductionTarget(payload.target, currentArtDirection(process.cwd()).decision.route);
  const direction = currentArtDirection(process.cwd());
  if (direction.decision.motionDecision !== 'one' || direction.activationSha256 !== artDirectionSha256(run.activation)) throw new Error('MOTION_EVIDENCE_DIRECTION_STALE: capture requires the current one-motion art direction and its bound activation');
  const { motionResolutionProjectionSha256, validateMotionResolutionProjection } = await import('../core/ref/reference-selection.ts');
  const resolution = validateMotionResolutionProjection(inputJson(join(process.cwd(), '.omd', 'motion-resolutions', `sha256-${direction.decision.motionResolutionProjectionSha256}.json`), 'motion capture settlement'));
  if (motionResolutionProjectionSha256(resolution) !== direction.decision.motionResolutionProjectionSha256
    || resolution.motionDecision !== 'one'
    || resolution.selectionSha256 !== direction.decision.preSelectionSha256
    || resolution.handoffSha256 !== direction.referenceHandoffSha256) throw new Error('MOTION_EVIDENCE_DIRECTION_STALE: capture settlement is not bound to the current art direction');
  const sourceInfluence = referenceSlotId === undefined ? (() => {
    const recipeId = approvedRecipe?.recipeId;
    const recipeSha256 = approvedRecipe?.recipeSha256;
    if (typeof recipeId !== 'string' || typeof recipeSha256 !== 'string'
      || resolution.approvedRecipe === undefined
      || recipeId !== resolution.approvedRecipe.recipeId
      || recipeSha256 !== resolution.approvedRecipe.recipeSha256) throw new Error('MOTION_EVIDENCE_RECIPE_STALE: source influence must bind the authorized approved recipe');
    return { kind: 'approved-recipe' as const, recipeId, recipeSha256 };
  })() : (() => {
    if (!resolution.slots.some((slot) => slot.slotId === referenceSlotId && slot.obligationDisposition === 'used')) throw new Error('MOTION_EVIDENCE_REFERENCE_STALE: source influence must bind the one settled reference slot');
    return { kind: 'reference-slot' as const, referenceSlotId };
  })();
  const outDir = resolve(payload.outDir);
  const relativeOut = relative(process.cwd(), outDir);
  if (relativeOut.startsWith('..') || relativeOut.startsWith('/')) throw new Error('motion evidence capture outDir must be inside the project');
  const adapter = projectWriter(run);
  adapter.mkdir(relativeOut);
  await renderedBeatProof(payload.target, direction.beatIds, artDirectionSha256(direction), run.activation.buildSha256, direction.decision.route, payload.runId, run, adapter, join(relativeOut, `${payload.runId}-rendered-beats.json`));
  const { captureMotionEvidenceV2, parseViewport } = await import('../core/render/index.ts');
  const evidence = await captureMotionEvidenceV2(payload.target, {
    viewport: typeof payload.viewport === 'string' ? parseViewport(payload.viewport) : { width: 390, height: 844 },
    outDir, runId: payload.runId, buildHash: run.activation.buildSha256, artDirectionHash: artDirectionSha256(direction),
    route: direction.decision.route, taskId: payload.runId, invocation: run, sourceInfluence, selector: payload.selector, trigger: 'load', adapter,
  });
  if (opts.json) process.stdout.write(JSON.stringify(evidence)); else console.log(JSON.stringify(evidence, null, 2));
  process.exit(0);
}

async function cmdDirectionEvidenceCheck(mode: 'static-check' | 'motion-check', opts: Opts): Promise<never> {
  if (!opts.input || opts._.length > 0) throw new Error(`usage: omd evidence ${mode} --input <evidence.json> [--json]`);
  const direction = currentArtDirection(process.cwd());
  const settledSelection = mode === 'static-check'
    ? parseReferenceSelectionV2(inputJson(join(process.cwd(), '.omd', 'settled-reference-selections', `sha256-${direction.decision.settledSelectionSha256}.json`), 'static evidence settlement'))
    : undefined;
  if (mode === 'static-check' && (referenceSelectionV2Sha256(settledSelection!) !== direction.decision.settledSelectionSha256
    || settledSelection!.slots.some((slot) => slot.signal === 'high-motion' && slot.rights === 'lawful' && slot.motionAxis === 'available' && slot.obligationDisposition !== 'rejected'))) {
    throw new Error('STATIC_EVIDENCE_SETTLEMENT_STALE: static evidence requires the current none-motion settled selection with every pending motion obligation rejected');
  }
  const input = inputJson(opts.input, `omd evidence ${mode}`);
  const run = isRecord(input) && 'invocation' in input ? validateProjectRunInvocation(input.invocation) : undefined;
  const evidence = mode === 'static-check' && isRecord(input)
    ? (() => {
      const { invocation: _invocation, ...submitted } = input;
      return submitted;
    })()
    : input;
  if (!isRecord(evidence) || evidence.artDirectionHash !== artDirectionSha256(direction)) throw new Error('DIRECTION_EVIDENCE_STALE: evidence does not bind the current immutable art direction');
  if (mode === 'static-check' && run === undefined) throw new Error('STATIC_EVIDENCE_REVIEW_AUTHORIZATION_REQUIRED: a fresh host invocation is required');
  if (mode === 'static-check') requireStaticEvidenceResultAuthorization(run!, process.cwd(), Buffer.from(canonicalJson(evidence)));
  if (mode === 'static-check') {
    if (direction.decision.motionDecision !== 'none') throw new Error('STATIC_EVIDENCE_DIRECTION_MISMATCH');
    const { validatePostRenderBeatProof } = await import('../core/copy/index.ts');
    const { validateRenderedBeatResultAuthority } = await import('../core/render/index.ts');
    const renderedBeatResult = validateRenderedBeatResultAuthority(evidence.beatReceipt, {
      invocation: run!, root: process.cwd(), buildSha256: run!.activation.buildSha256, artDirectionHash: artDirectionSha256(direction),
      route: direction.decision.route, target: typeof (evidence.beatReceipt as Record<string, unknown> | undefined)?.target === 'string' ? (evidence.beatReceipt as Record<string, unknown>).target as string : '',
      taskId: typeof (evidence.beatReceipt as Record<string, unknown> | undefined)?.taskId === 'string' ? (evidence.beatReceipt as Record<string, unknown>).taskId as string : '',
      consumeResult: true,
    });
    const beatViolations = validatePostRenderBeatProof(readFileSync(join(process.cwd(), '.omd', 'copy-deck.md'), 'utf8'), renderedBeatResult, { beatIds: direction.beatIds });
    if (beatViolations.length > 0) throw new Error(`RENDERED_BEAT_PROOF_REQUIRED: ${beatViolations.map((violation) => violation.message).join(' ')}`);
    const { validateStaticDirectionEvidenceV1 } = await import('../core/art-direction/static-evidence.ts');
    if (!isRecord(evidence.reviewReceipts)) throw new Error('STATIC_EVIDENCE_REVIEW_AUTHORIZATION_REQUIRED: review receipts are required');
    for (const receipt of Object.values(evidence.reviewReceipts)) {
      if (!isRecord(receipt) || typeof receipt.path !== 'string') throw new Error('STATIC_EVIDENCE_REVIEW_AUTHORIZATION_REQUIRED: review receipt path is required');
      requireStaticReviewReceiptAuthorization(run!, process.cwd(), readFileSync(resolve(process.cwd(), receipt.path)));
    }
    validateStaticDirectionEvidenceV1(evidence, {
      motionDecision: 'none',
      selectedRegister: direction.decision.selectedRegister,
      selectedStaticReferenceSlotIds: direction.decision.selectedStaticReferenceSlotIds,
      artDirectionHash: artDirectionSha256(direction),
      selectionSha256: direction.decision.settledSelectionSha256,
      handoffSha256: direction.referenceHandoffSha256,
      buildHash: run!.activation.buildSha256,
      runId: isRecord(evidence.expected) && typeof evidence.expected.runId === 'string' ? evidence.expected.runId : '',
      observationRoot: process.cwd(),
      invocation: run!,
      route: direction.decision.route,
      target: renderedBeatResult.target,
      taskId: renderedBeatResult.taskId,
    });
  } else {
    if (direction.decision.motionDecision !== 'one') throw new Error('MOTION_EVIDENCE_DIRECTION_MISMATCH');
    if (run === undefined) throw new Error('MOTION_EVIDENCE_AUTHORIZATION_REQUIRED: a fresh host invocation is required');
    const { validateMotionEvidenceV2 } = await import('../core/render/index.ts');
    validateMotionEvidenceV2(evidence, {
      motionDecision: 'one',
      artDirectionHash: artDirectionSha256(direction),
      buildHash: run.activation.buildSha256,
      root: process.cwd(),
      invocation: run,
      route: direction.decision.route,
      target: typeof evidence.observed === 'object' && evidence.observed !== null && typeof (evidence.observed as Record<string, unknown>).target === 'string' ? (evidence.observed as Record<string, unknown>).target as string : '',
      taskId: typeof evidence.observed === 'object' && evidence.observed !== null && typeof (evidence.observed as Record<string, unknown>).taskId === 'string' ? (evidence.observed as Record<string, unknown>).taskId as string : '',
      consumeResult: true,
    });
  }
  if (opts.json) process.stdout.write(JSON.stringify(mode === 'static-check' ? evidence : { ok: true })); else console.log('ok — observed evidence is path-backed and matches the current art direction');
  process.exit(0);
}

async function cmdCompletion(mode: string | undefined, opts: Opts): Promise<never> {
  if (mode === 'design-check') {
    if (!opts.input || opts._.length > 0) throw new Error('usage: omd completion design-check --input .omd/design-handoff.json [--json]');
    const { checkDesignHandoff } = await import('../core/completion/design-handoff.ts');
    const result = checkDesignHandoff(process.cwd(), inputJson(opts.input, 'omd completion design-check'), invocationFromActivation(opts, 'omd completion design-check'));
    if (opts.json) process.stdout.write(JSON.stringify(result));
    else console.log('ok — design documents and reference evidence are current; review authorship is not attested and application implementation has not been validated');
    process.exit(0);
  }
  if (mode === 'typography-applicability') {
    const activationPath = activationInputPath(opts);
    if (!opts.ir || activationPath === undefined || opts._.length > 0) throw new Error('usage: omd completion typography-applicability --ir <rendered-ir.json> --activation <host-issued-invocation.json> [--json]');
    const invocation = validateProjectRunInvocation(inputJson(activationPath, 'omd completion typography applicability activation'));
    const { publishTypographyApplicability } = await import('../core/completion/evidence.ts');
    const receipt = publishTypographyApplicability(process.cwd(), inputJson(opts.ir, 'omd completion typography applicability rendered IR'), invocation);
    if (opts.json) process.stdout.write(JSON.stringify(receipt)); else console.log(receipt.path);
    process.exit(0);
  }
  if (mode !== 'preflight' || opts._.length > 0) throw new Error('usage: omd completion preflight [--activation <host-issued-invocation.json>] [--json]');
  // Local transport may read the gate; it still cannot mint reviewer/manifest authorization.
  const invocation = invocationFromActivation(opts, 'omd completion preflight');
  const pointerPath = join(process.cwd(), '.omd', 'final-evidence-v2.json');
  if (!existsSync(pointerPath)) throw new Error('FINAL_EVIDENCE_REQUIRED: .omd/final-evidence-v2.json is missing; build/captures are not terminal completion evidence');
  const pointerBytes = readFileSync(pointerPath);
  requireFinalReviewerLaneAuthorization(invocation, process.cwd(), pointerBytes);
  const pointer = JSON.parse(pointerBytes.toString('utf8')) as unknown;
  if (!isRecord(pointer) || typeof pointer.record !== 'string') throw new Error('FINAL_EVIDENCE_MANIFEST_AUTHORIZATION_REQUIRED: final v2 evidence pointer is invalid');
  const recordPath = resolve(process.cwd(), '.omd', 'final-evidence-v2-runs', pointer.record);
  if (relative(join(process.cwd(), '.omd', 'final-evidence-v2-runs'), recordPath).startsWith('..')) throw new Error('FINAL_EVIDENCE_MANIFEST_AUTHORIZATION_REQUIRED: final v2 evidence record escapes the project');
  const recordBytes = readFileSync(recordPath);
  requireFinalEvidenceManifestAuthorization(invocation, process.cwd(), recordBytes);
  const record = JSON.parse(recordBytes.toString('utf8')) as unknown;
  if (!isRecord(record) || !isRecord(record.graph)) throw new Error('FINAL_REVIEWER_LANE_AUTHORIZATION_REQUIRED: final graph is required');
  for (const lane of ['blindLane', 'fidelityLane', 'protocolLane']) {
    const descriptor = record.graph[lane];
    if (!isRecord(descriptor) || typeof descriptor.path !== 'string') throw new Error(`FINAL_REVIEWER_LANE_AUTHORIZATION_REQUIRED: ${lane} receipt is required`);
    requireFinalReviewerLaneAuthorization(invocation, process.cwd(), readFileSync(resolve(process.cwd(), descriptor.path)));
  }
  if (record.graph.schema !== 'final-evidence-v2-adaptive-omission-graph'
    && !(record.graph.schema === 'final-evidence-v2-workflow-graph-v1' && record.graph.productionSchema === 'final-evidence-v2-adaptive-omission-graph')) {
    const intentPointer = validateIntentCurrentPointer(inputJson(join(process.cwd(), '.omd', 'intent-current.json'), 'completion current intent pointer'));
    requireCurrentIntentLedgerAuthorization(invocation, process.cwd(), readFileSync(join(process.cwd(), '.omd', intentPointer.record)));
  }
  if (isRecord(record.staticEvidence) && typeof record.staticEvidence.path === 'string') requireStaticEvidenceResultAuthorization(invocation, process.cwd(), readFileSync(resolve(process.cwd(), record.staticEvidence.path)));
  const { checkTerminalCompletion } = await import('../core/completion/preflight.ts');
  const result = checkTerminalCompletion(process.cwd(), invocation);
  if (opts.json) process.stdout.write(JSON.stringify(result)); else console.log('ok — terminal completion evidence is current');
  process.exit(0);
}

async function cmdGuard(mode: string | undefined, opts: Opts): Promise<never> {
  if (!['production', 'completion'].includes(mode ?? '') || opts._.length > 0) {
    throw new Error('usage: omd guard production [--path <project-relative-file>] [--json] | omd guard completion [--json]');
  }
  const invocation = invocationFromActivation(opts, `omd guard ${mode}`);
  if (mode === 'completion' && readPersistedRoute(process.cwd(), invocation).deliveryMode === 'design-only') {
    return cmdCompletion('design-check', { ...opts, input: '.omd/design-handoff.json' });
  }
  const result = checkProductionReadiness(process.cwd(), invocation, join(root, 'core'), opts.path);
  if (!result.ok || mode === 'production') {
    if (opts.json) process.stdout.write(JSON.stringify(result));
    else console.log(result.ok ? 'ok — selected pre-production inputs are current; this is not completion' : result.blockers.join('\n'));
    process.exit(result.ok ? 0 : 1);
  }
  // Give the portable owner its actionable repair loop before the stronger final reviewer
  // authority check. This preliminary check is NOT final scope/independence authorization.
  const { checkSlopReview } = await import('../core/slop/review.ts');
  checkSlopReview(process.cwd());
  return cmdCompletion('preflight', opts);
}

async function cmdPreflight(opts: Opts): Promise<never> {
  if (!opts.input || opts._.length > 0) throw new Error('usage: omd preflight --input <activation-context.json> [--json]');
  const { validateActivationContext } = await import('../core/runtime/activation.ts');
  const context = validateActivationContext(inputJson(opts.input, 'omd preflight'));
  if (opts.json) process.stdout.write(JSON.stringify(context));
  else console.log('ok — activation context is valid');
  process.exit(0);
}

/**
 * The v1 finalize route deliberately invokes its source-level publication trap before reading
 * the manifest. Legacy evidence remains checkable, but no v1 route can create a record.
 */
async function cmdEvidence(mode: string | undefined, opts: Opts): Promise<never> {
  if (mode === 'static-capture') return cmdStaticEvidenceCapture(opts);
  if (mode === 'motion-capture') return cmdMotionEvidenceCapture(opts);
  if (mode === 'static-check' || mode === 'motion-check') return cmdDirectionEvidenceCheck(mode, opts);
  if (mode === 'finalize') {
    if (!opts.input || opts._.length > 0) throw new Error('usage: omd evidence finalize --input <manifest.json>');
    const { finalizeFinalEvidence } = await import('../core/evidence/final.ts');
    finalizeFinalEvidence(process.cwd(), opts.input);
    throw new Error('LEGACY_PUBLICATION_DISABLED');
  }
  if (mode === 'check') {
    if (opts._.length > 0) throw new Error('usage: omd evidence check [--json]');
    const evidence = checkFinalEvidence(process.cwd());
    if (opts.json) process.stdout.write(JSON.stringify(evidence));
    else console.log('ok — final evidence matches current source seal, build target, and artifacts');
    process.exit(0);
  }
  if (mode === 'v2-finalize') {
    const activationPath = activationInputPath(opts);
    if (!opts.input || activationPath === undefined || opts._.length > 0) throw new Error('usage: omd evidence v2 finalize --input <manifest.json> --activation <host-issued-invocation.json> [--json]');
    const { publishFinalEvidenceV2 } = await import('../core/evidence/final-v2.ts');
    const invocation = validateProjectRunInvocation(inputJson(activationPath, 'omd evidence v2 finalize activation'));
    const manifestBytes = inputJsonBytes(opts.input, 'omd evidence v2 finalize');
    requireFinalEvidenceManifestAuthorization(invocation, process.cwd(), manifestBytes);
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as unknown;
    if (!isRecord(manifest) || !isRecord(manifest.graph)) throw new Error('FINAL_REVIEWER_LANE_AUTHORIZATION_REQUIRED: final graph is required');
    const { checkSlopFinalGraph } = await import('../core/slop/review.ts');
    checkSlopFinalGraph(process.cwd(), manifest.graph);
    for (const lane of ['blindLane', 'fidelityLane', 'protocolLane']) {
      const descriptor = manifest.graph[lane];
      if (!isRecord(descriptor) || typeof descriptor.path !== 'string') throw new Error(`FINAL_REVIEWER_LANE_AUTHORIZATION_REQUIRED: ${lane} receipt is required`);
      const path = resolve(process.cwd(), descriptor.path);
      if (relative(process.cwd(), path).startsWith('..')) throw new Error(`FINAL_REVIEWER_LANE_AUTHORIZATION_REQUIRED: ${lane} path must remain inside the project`);
      requireFinalReviewerLaneAuthorization(invocation, process.cwd(), readFileSync(path));
    }
    if (manifest.graph.schema !== 'final-evidence-v2-adaptive-omission-graph'
      && !(manifest.graph.schema === 'final-evidence-v2-workflow-graph-v1' && manifest.graph.productionSchema === 'final-evidence-v2-adaptive-omission-graph')) {
      const intentPointer = validateIntentCurrentPointer(inputJson(join(process.cwd(), '.omd', 'intent-current.json'), 'final current intent pointer'));
      requireCurrentIntentLedgerAuthorization(invocation, process.cwd(), readFileSync(join(process.cwd(), '.omd', intentPointer.record)));
    }
    if (isRecord(manifest.staticEvidence) && typeof manifest.staticEvidence.path === 'string') requireStaticEvidenceResultAuthorization(invocation, process.cwd(), readFileSync(resolve(process.cwd(), manifest.staticEvidence.path)));
    const path = publishFinalEvidenceV2(process.cwd(), manifest, invocation);
    if (opts.json) process.stdout.write(JSON.stringify({ path }));
    else console.log(path);
    process.exit(0);
  }
  if (mode === 'v2-check') {
    const activationPath = activationInputPath(opts);
    if (activationPath === undefined || opts._.length > 0) throw new Error('usage: omd evidence v2 check --activation <host-issued-invocation.json> [--json]');
    const { checkFinalEvidenceV2 } = await import('../core/evidence/final-v2.ts');
    const invocation = validateProjectRunInvocation(inputJson(activationPath, 'omd evidence v2 check activation'));
    const pointerPath = join(process.cwd(), '.omd', 'final-evidence-v2.json');
    const pointerBytes = readFileSync(pointerPath);
    requireFinalReviewerLaneAuthorization(invocation, process.cwd(), pointerBytes);
    const pointer = inputJson(pointerPath, 'final v2 evidence pointer');
    if (!isRecord(pointer) || typeof pointer.record !== 'string') throw new Error('FINAL_EVIDENCE_MANIFEST_AUTHORIZATION_REQUIRED: final v2 evidence pointer is invalid');
    const recordPath = resolve(process.cwd(), '.omd', 'final-evidence-v2-runs', pointer.record);
    if (relative(join(process.cwd(), '.omd', 'final-evidence-v2-runs'), recordPath).startsWith('..')) throw new Error('FINAL_EVIDENCE_MANIFEST_AUTHORIZATION_REQUIRED: final v2 evidence record escapes the project');
    const recordBytes = readFileSync(recordPath);
    requireFinalEvidenceManifestAuthorization(invocation, process.cwd(), recordBytes);
    const record = JSON.parse(recordBytes.toString('utf8')) as unknown;
    if (!isRecord(record) || !isRecord(record.graph)) throw new Error('FINAL_REVIEWER_LANE_AUTHORIZATION_REQUIRED: final graph is required');
    for (const lane of ['blindLane', 'fidelityLane', 'protocolLane']) {
      const descriptor = record.graph[lane];
      if (!isRecord(descriptor) || typeof descriptor.path !== 'string') throw new Error(`FINAL_REVIEWER_LANE_AUTHORIZATION_REQUIRED: ${lane} receipt is required`);
      const path = resolve(process.cwd(), descriptor.path);
      if (relative(process.cwd(), path).startsWith('..')) throw new Error(`FINAL_REVIEWER_LANE_AUTHORIZATION_REQUIRED: ${lane} path must remain inside the project`);
      requireFinalReviewerLaneAuthorization(invocation, process.cwd(), readFileSync(path));
    }
    if (record.graph.schema !== 'final-evidence-v2-adaptive-omission-graph'
      && !(record.graph.schema === 'final-evidence-v2-workflow-graph-v1' && record.graph.productionSchema === 'final-evidence-v2-adaptive-omission-graph')) {
      const intentPointer = validateIntentCurrentPointer(inputJson(join(process.cwd(), '.omd', 'intent-current.json'), 'final current intent pointer'));
      requireCurrentIntentLedgerAuthorization(invocation, process.cwd(), readFileSync(join(process.cwd(), '.omd', intentPointer.record)));
    }
    if (isRecord(record.staticEvidence) && typeof record.staticEvidence.path === 'string') requireStaticEvidenceResultAuthorization(invocation, process.cwd(), readFileSync(resolve(process.cwd(), record.staticEvidence.path)));
    const evidence = checkFinalEvidenceV2(process.cwd(), invocation);
    if (opts.json) process.stdout.write(JSON.stringify(evidence));
    else console.log('ok — final v2 evidence pointer and immutable record are valid');
    process.exit(0);
  }
  if (mode === 'v2-recover') {
    if (opts._.length > 0) throw new Error('usage: omd evidence v2-recover [--json]');
    const { recoverFinalEvidenceV2Lock } = await import('../core/evidence/final-v2.ts');
    const recovered = recoverFinalEvidenceV2Lock(process.cwd(), invocationFromActivation(opts, 'omd evidence v2-recover'));
    if (opts.json) process.stdout.write(JSON.stringify({ recovered }));
    else console.log(recovered ? 'recovered stale final v2 publication lock' : 'no final v2 publication lock to recover');
    process.exit(0);
  }
  if (mode === 'v2-gc') {
    if (opts._.length > 0 || (opts.apply === true && opts.dryRun === true)) throw new Error('usage: omd evidence v2-gc [--dry-run|--apply] [--json]');
    const { garbageCollectFinalEvidenceV2 } = await import('../core/evidence/final-v2.ts');
    const result = garbageCollectFinalEvidenceV2(process.cwd(), invocationFromActivation(opts, 'omd evidence v2-gc'), { dryRun: opts.apply !== true });
    if (opts.json) process.stdout.write(JSON.stringify(result));
    else console.log(JSON.stringify(result));
    process.exit(0);
  }
  if (mode === 'tasks') {
    if (!opts.input || opts._.length > 0) throw new Error('usage: omd evidence tasks --input .omd/.cache/task-evidence-manifest.json');
    const path = publishTaskEvidence(process.cwd(), opts.input, invocationFromActivation(opts, 'omd evidence tasks'));
    if (opts.json) process.stdout.write(JSON.stringify({ path }));
    else console.log(path);
    process.exit(0);
  }
  if (mode === 'tasks-check') {
    if (opts._.length > 0) throw new Error('usage: omd evidence tasks-check [--json]');
    const evidence = checkTaskEvidence(process.cwd());
    if (opts.json) process.stdout.write(JSON.stringify(evidence));
    else console.log('ok — task evidence matches bound frame, composition, probes, and renders');
    process.exit(0);
  }
  throw new Error('usage: omd evidence static-capture --input <static-capture.json> | motion-capture --input <motion-capture.json> | static-check --input <evidence.json> | motion-check --input <evidence.json> | finalize --input <manifest.json> | check [--json] | v2 finalize --input <manifest.json> --activation <host-issued-invocation.json> | v2 check --activation <host-issued-invocation.json> [--json] | v2-recover [--json] | v2-gc [--dry-run|--apply] [--json] | tasks --input .omd/.cache/task-evidence-manifest.json> | tasks-check [--json]');
}
async function cmdObservation(mode: string | undefined, opts: Opts): Promise<never> {
  if (mode === 'write') {
    if (!opts.input || opts._.length > 0) throw new Error('usage: omd observation write --input <observation.json> [--activation <host-issued-invocation.json>] [--json]');
    const { writeObservationV2 } = await import('../core/runtime/observation.ts');
    const observation = writeObservationV2(process.cwd(), inputJson(opts.input, 'omd observation write') as never, projectWriterFromActivation(opts, 'omd observation write'));
    if (opts.json) process.stdout.write(JSON.stringify(observation)); else console.log('.omd/observation-v2.json');
    process.exit(0);
  }
  if (mode === 'retain') {
    if (!opts.input || opts._.length > 0) throw new Error('usage: omd observation retain --input <retention.json> [--activation <host-issued-invocation.json>] [--json]');
    const { retainObservationV2 } = await import('../core/runtime/observation-retention.ts');
    const retained = retainObservationV2(process.cwd(), inputJson(opts.input, 'omd observation retain') as never, projectWriterFromActivation(opts, 'omd observation retain'));
    if (opts.json) process.stdout.write(JSON.stringify(retained)); else console.log('.omd/observation-v2-retention.json');
    process.exit(0);
  }
  throw new Error('usage: omd observation write --input <observation.json> | retain --input <retention.json>');
}

async function cmdAttest(mode: string | undefined, opts: Opts): Promise<never> {
  if (mode !== 'v2' || opts._.length > 0) throw new Error('usage: omd attest v2 [--activation <host-issued-invocation.json>] [--json]');
  const { attestLegacyV1AsV2 } = await import('../core/migration/attest-v2.ts');
  const attestation = attestLegacyV1AsV2(process.cwd(), projectWriterFromActivation(opts, 'omd attest v2'));
  if (opts.json) process.stdout.write(JSON.stringify(attestation)); else console.log('.omd/attest-v2.json');
  process.exit(0);
}

async function cmdDoctor(): Promise<never> {
  let allPass = true;

  function report(label: string, pass: boolean, detail?: string): void {
    console.log(`${pass ? 'pass' : 'fail'}  ${label}${detail ? `  (${detail})` : ''}`);
    if (!pass) allPass = false;
  }

  // Node version: package.json engines requires >=22.19
  const parts = process.versions.node.split('.').map(Number);
  const [major = 0, minor = 0] = parts;
  const nodeOk = major > 22 || (major === 22 && minor >= 19);
  report('node >=22.19', nodeOk, process.versions.node);

  // Playwright importability + chromium executable
  try {
    const { chromium } = await import('playwright');
    const exePath = chromium.executablePath();
    const exeExists = existsSync(exePath);
    report('playwright chromium', exeExists, exeExists ? 'found' : `not found: ${exePath}`);
  } catch {
    report('playwright chromium', false, 'playwright not importable — run: npx playwright install chromium');
  }

  // Preflight must not create a project record. Check the parent directory's write
  // permission, which is sufficient to create `.omd/` later without touching it now.
  try {
    accessSync(process.cwd(), constants.W_OK);
    report('.omd/ writable', true, 'not created during read-only preflight');
  } catch (e) {
    report('.omd/ writable', false, e instanceof Error ? e.message : String(e));
  }

  // Theory-pack files — resolved relative to the CLI's own root
  const theoryFiles = ['color.md', 'typography.md', 'layout.md', 'motion.md', 'expressive.md', 'components.md', 'craft.md', 'voice.md', 'ux.md'];
  for (const f of theoryFiles) {
    const path = join(root, 'core', 'theory', f);
    report(`theory/${f}`, existsSync(path));
  }

  // FIGMA_TOKEN — optional. Figma integration is unavailable without it, but
  // absence is not a failure. Always report pass; note when not set.
  const figmaToken = process.env['FIGMA_TOKEN'];
  const figmaTokenSet = figmaToken !== undefined && figmaToken.length > 0;
  report(
    'FIGMA_TOKEN',
    true,
    figmaTokenSet ? 'set' : 'not set — Figma optional; export FIGMA_TOKEN to enable omd figma pull',
  );

  process.exit(allPass ? 0 : 1);
}

// ── Target commands ──────────────────────────────────────────────────────────

/**
 * `omd target set <image-path-or-url> --as <name>`
 *
 * Download or copy the reference image into `.omd/target/<name>.png` and record
 * its dimensions (the intended render viewport). Multiple named targets allowed.
 * Accepts local file paths and HTTP/HTTPS URLs; no new dependencies — uses the
 * built-in `fetch` for URL downloads and the in-repo decodePng for dimensions.
 */
async function cmdTargetSet(opts: Opts): Promise<never> {
  const source = opts._[0];
  if (!source || !opts.as) {
    console.error('usage: omd target set <image-path-or-url> --as <name>');
    process.exit(1);
  }

  let buf: Buffer;
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) {
      console.error(`failed to download target image (${res.status}): ${source}`);
      process.exit(1);
    }
    buf = Buffer.from(await res.arrayBuffer());
  } else {
    const absPath = resolve(source);
    if (!existsSync(absPath)) {
      console.error(`file not found: ${source}`);
      process.exit(1);
    }
    buf = readFileSync(absPath);
  }

  const { registerTarget } = await import('../core/target/index.ts');
  const entry = registerTarget(process.cwd(), opts.as, source, buf, projectWriterFromActivation(opts, 'omd target set'));

  console.log(
    `target "${entry.name}" registered  ${entry.viewport.width}×${entry.viewport.height}  ${entry.path}`,
  );
  process.exit(0);
}

/**
 * `omd target diff <page> [--target <name>] [--viewport WxH] [--threshold N] [--json]`
 *
 * Renders the build page at the target's stored viewport dimensions, decodes both
 * PNGs with the in-repo decoder, and compares them using the same algorithm and
 * contract as `omd figma diff`. Exits 1 when the similarity score falls below the
 * threshold (default 0.97). `--json` emits the stable DiffResult for a fix loop.
 */
async function cmdTargetDiff(opts: Opts): Promise<never> {
  const page = opts._[0];
  if (!page) {
    console.error('usage: omd target diff <page> [--target <name>] [--viewport WxH] [--threshold N] [--json]');
    process.exit(1);
  }

  const threshold =
    opts.threshold !== undefined ? parseFloat(opts.threshold) : 0.97;
  if (isNaN(threshold) || threshold < 0 || threshold > 1) {
    console.error('--threshold must be a number between 0 and 1');
    process.exit(1);
  }

  const jsonOut = opts.json === true;

  const { listTargets, findTarget, compareAgainstTarget, formatDiffReport } = await import('../core/target/index.ts');
  const { renderPage, parseViewport } = await import('../core/render/index.ts');

  // Resolve target entry
  let entry;
  if (opts.target) {
    entry = findTarget(process.cwd(), opts.target);
    if (!entry) {
      console.error(`target "${opts.target}" not found. Run \`omd target list\` to see registered targets.`);
      process.exit(1);
    }
  } else {
    const all = listTargets(process.cwd());
    if (all.length === 0) {
      console.error('no targets registered. Run `omd target set <image> --as <name>` first.');
      process.exit(1);
    }
    entry = all[0]!;
    if (!jsonOut) console.log(`using target "${entry.name}" (first registered)`);
  }

  // Render viewport: --viewport flag overrides the target's stored dimensions
  const viewport = opts.viewport
    ? parseViewport(opts.viewport)
    : { width: entry.viewport.width, height: entry.viewport.height };

  // Render the build
  const rendersDir = join(process.cwd(), '.omd', 'target', '.renders');
  const adapter = projectWriterFromActivation(opts, 'omd target diff');
  adapter.mkdir(relative(process.cwd(), rendersDir));
  const safeTarget = entry.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const renderPath = join(rendersDir, `${safeTarget}.png`);

  if (!jsonOut) {
    console.log(`rendering ${page} at ${viewport.width}×${viewport.height} …`);
  }
  await renderPage(page, { viewport, out: renderPath, adapter });

  // Compare
  const targetBuf = readFileSync(entry.path);
  const buildBuf = readFileSync(renderPath);
  const result = compareAgainstTarget(targetBuf, buildBuf, threshold);

  if (jsonOut) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n' + formatDiffReport(result));
  }

  process.exit(result.pass ? 0 : 1);
}

/** `omd target list` — show all registered visual targets. */
async function cmdTargetList(): Promise<never> {
  const { listTargets } = await import('../core/target/index.ts');
  const targets = listTargets(process.cwd());
  if (targets.length === 0) {
    console.log('No targets registered. Run `omd target set <image> --as <name>`.');
    process.exit(0);
  }
  for (const t of targets) {
    console.log(
      `${t.name}  ${t.viewport.width}×${t.viewport.height}  source: ${t.source}  registered: ${t.registeredAt.slice(0, 10)}`,
    );
  }
  process.exit(0);
}

/**
 * `omd pack dir`        — prints the absolute path of the knowledge-pack root (<root>/core).
 * `omd pack list`       — enumerates every .md file in the pack, one relative path per line.
 * `omd pack <relpath>`  — prints one pack file to stdout (e.g. `omd pack theory/color.md`).
 *
 * These three forms let any host (Claude Code, Codex, or a plain shell) resolve pack paths
 * without knowing where the plugin was installed. A prompt that needs theory/color.md can
 * run `omd pack dir` once and Read the file from the printed path — no env-var assumptions.
 */
function cmdPack(sub: string | undefined, ...rest: string[]): never {
  const packsRoot = join(root, 'core');
  // `--section "<heading>"` prints one ##–###### section with descendants, in requested order. A
  // role that needs the framing rules should not pay for the whole protocol: the loop file alone
  // costs about sixteen thousand tokens to read.
  const sections: string[] = [];
  const parts: string[] = [];
  for (let index = 0; index < rest.length; index++) {
    if (rest[index] === '--section') {
      const value = rest[++index];
      if (value === undefined) {
        console.error('usage: omd pack <relpath> --section "<heading>" [--section "<heading>"]');
        process.exit(1);
      }
      sections.push(value);
    } else parts.push(rest[index]!);
  }

  if (sub === 'dir') {
    console.log(packsRoot);
    process.exit(0);
  }

  if (sub === 'list') {
    function* walkMd(dir: string, rel: string): Generator<string> {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) yield* walkMd(join(dir, entry.name), entryRel);
        else if (entry.name.endsWith('.md')) yield entryRel;
      }
    }
    if (!existsSync(packsRoot)) {
      console.error(`pack root not found: ${packsRoot}`);
      process.exit(1);
    }
    for (const rel of walkMd(packsRoot, '')) console.log(rel);
    process.exit(0);
  }

  if (sub) {
    // `omd pack <relpath>` — treat `sub` as a relative path under the pack root.
    const target = join(packsRoot, sub, ...parts);
    if (!existsSync(target)) {
      console.error(`pack file not found: ${target}`);
      process.exit(1);
    }
    const body = readFileSync(target, 'utf8');
    if (sections.length === 0) {
      process.stdout.write(body);
      process.exit(0);
    }
    try {
      process.stdout.write(extractPackSections(body, sections));
    } catch (error) {
      if (!(error instanceof PackSectionError)) throw error;
      console.error(`${error.message}\nsections in ${sub}:\n${error.available.join('\n')}`);
      process.exit(1);
    }
    process.exit(0);
  }

  console.error('usage: omd pack dir | list | <relpath> [--section "<heading>"]');
  process.exit(1);
}

async function cmdSlop(sub: string | undefined, opts: Opts): Promise<never> {
  if (sub === 'checkpoint' || sub === 'review-set' || sub === 'review-check') {
    const { captureSlopCheckpoint, publishSlopReview, checkSlopReview } = await import('../core/slop/review.ts');
    if (sub !== 'review-check' && !opts.input) throw new Error('slop checkpoint/review-set requires --input <json>');
    const result = sub === 'review-check' ? checkSlopReview(process.cwd())
      : sub === 'checkpoint' ? await captureSlopCheckpoint(process.cwd(), inputJson(opts.input!, 'omd slop checkpoint'), projectWriterFromActivation(opts, 'omd slop checkpoint'))
      : publishSlopReview(process.cwd(), inputJson(opts.input!, 'omd slop review-set'), projectWriterFromActivation(opts, 'omd slop review-set'));
    console.log(JSON.stringify(result, null, opts.json ? 0 : 2));
    process.exit(0);
  }
  if (sub !== 'scan' && sub !== 'score') throw new Error('usage: omd slop scan [root] [--json] | omd slop score --input <invariants.json> --corpus <corpus.json> [--json]');
  if (sub === 'scan') {
    const result = scanSlopSource(opts._[0] ?? process.cwd());
    if (opts.json) process.stdout.write(JSON.stringify(result));
    else {
      console.log(`source candidates: ${result.candidates.length} (${result.filesScanned} files scanned)`);
      for (const item of result.candidates) {
        console.log(`${item.path}:${item.line}  ${item.candidateId}  ${item.reviewQuestion}`);
      }
    }
    process.exit(0);
  }
  if (!opts.input || !opts.corpus) {
    throw new Error('usage: omd slop score --input <invariants.json> --corpus <corpus.json> [--json]');
  }
  const { scoreSlop } = await import('../core/slop/score.ts');
  const corpusInput = inputJson(opts.corpus, 'omd slop score corpus');
  if (!Array.isArray(corpusInput)) throw new Error('omd slop score corpus must be an array of { invariants } entries');
  const score = scoreSlop({
    invariants: inputJson(opts.input, 'omd slop score') as never,
    corpus: corpusInput as never,
  });
  if (opts.json) process.stdout.write(JSON.stringify(score));
  else {
    console.log(`slop distance: ${Number.isFinite(score.distance) ? score.distance.toFixed(4) : 'unmeasured'} over ${score.compared.length} axes`);
    console.log(`near slop: ${score.nearSlop ? 'yes (advisory)' : 'no'}`);
    for (const finding of score.findings) console.log(`  [${finding.severity}] ${finding.message}`);
  }
  // Advisory only: a composite over a drifting aesthetic does not gate.
  process.exit(0);
}

async function cmdWorkflow(mode: string | undefined, opts: Opts): Promise<never> {
  if (opts._.length > 0) throw new Error('usage: omd workflow plan|readiness|slice|artifacts --input <workflow.json> [--activation <host-issued-invocation.json>] | check-readiness|check [--activation <host-issued-invocation.json>] [--json]');
  const invocation = invocationFromActivation(opts, `omd workflow ${mode ?? 'check'}`);
  const {
    checkAdaptiveWorkflow, checkAdaptiveWorkflowProductionReadiness, checkAdaptiveWorkflowProductionSlice,
    publishAdaptiveWorkflowArtifacts, publishAdaptiveWorkflowPlan, publishAdaptiveWorkflowProductionReadiness,
    publishAdaptiveWorkflowProductionSlice,
  } = await import('../core/design-development/workflow-persistence.ts');
  if (mode === 'plan') {
    if (!opts.input) throw new Error('usage: omd workflow plan --input <workflow-plan-input.json> --activation <host-issued-invocation.json> [--json]');
    const path = publishAdaptiveWorkflowPlan(process.cwd(), inputJson(opts.input, 'omd workflow plan'), projectWriter(invocation), invocation);
    if (opts.json) process.stdout.write(JSON.stringify({ path })); else console.log(path);
    process.exit(0);
  }
  if (mode === 'readiness') {
    if (!opts.input) throw new Error('usage: omd workflow readiness --input <workflow-readiness.json> --activation <host-issued-invocation.json> [--json]');
    const path = publishAdaptiveWorkflowProductionReadiness(process.cwd(), inputJson(opts.input, 'omd workflow readiness'), projectWriter(invocation), invocation);
    if (opts.json) process.stdout.write(JSON.stringify({ path })); else console.log(path);
    process.exit(0);
  }
  if (mode === 'slice') {
    if (!opts.input) throw new Error('usage: omd workflow slice --input <workflow-production-slice.json> --activation <host-issued-invocation.json> [--json]');
    const path = publishAdaptiveWorkflowProductionSlice(process.cwd(), inputJson(opts.input, 'omd workflow slice'), projectWriter(invocation), invocation);
    if (opts.json) process.stdout.write(JSON.stringify({ path })); else console.log(path);
    process.exit(0);
  }
  if (mode === 'artifacts') {
    if (!opts.input) throw new Error('usage: omd workflow artifacts --input <workflow-artifacts.json> --activation <host-issued-invocation.json> [--json]');
    const path = publishAdaptiveWorkflowArtifacts(process.cwd(), inputJson(opts.input, 'omd workflow artifacts'), projectWriter(invocation), invocation);
    if (opts.json) process.stdout.write(JSON.stringify({ path })); else console.log(path);
    process.exit(0);
  }
  if (mode === 'check-readiness') {
    if (opts.input) throw new Error('usage: omd workflow check-readiness --activation <host-issued-invocation.json> [--json]');
    const current = checkAdaptiveWorkflowProductionReadiness(process.cwd(), invocation);
    if (opts.json) process.stdout.write(JSON.stringify(current)); else console.log('ok — workflow production readiness is current');
    process.exit(0);
  }
  if (mode === 'check-slice') {
    if (opts.input) throw new Error('usage: omd workflow check-slice --activation <host-issued-invocation.json> [--json]');
    const current = checkAdaptiveWorkflowProductionSlice(process.cwd(), invocation);
    if (opts.json) process.stdout.write(JSON.stringify(current)); else console.log('ok — authenticated workflow production slice is current');
    process.exit(0);
  }
  if (mode === 'check') {
    if (opts.input) throw new Error('usage: omd workflow check --activation <host-issued-invocation.json> [--json]');
    const current = checkAdaptiveWorkflow(process.cwd(), invocation);
    if (opts.json) process.stdout.write(JSON.stringify(current)); else console.log(`ok — ${current.plan.development.mode} workflow is complete and current`);
    process.exit(0);
  }
  throw new Error('usage: omd workflow plan|readiness|slice|artifacts --input <workflow.json> --activation <host-issued-invocation.json> | check-readiness|check-slice|check --activation <host-issued-invocation.json> [--json]');
}

/**
 * `omd route` — how much loop this request needs, and what it is not allowed to touch.
 *
 * A run that classifies a themed pass over a shipped product as a full brand establishment does
 * not produce a better result; it produces the same result an hour later. The route is the gate
 * that stops that, and its scope lock is what stops a UI request from creating repositories.
 */
async function cmdRoute(mode: string | undefined, opts: Opts): Promise<never> {
  const { adaptiveRouteRecordSha256, changedPathsForAdaptiveRoute, classifyRoute, pathsOutsideScope, publishAdaptiveRoute, readPersistedRoute, validateRouteInput } = await import('../core/route/index.ts');
  const recordPath = join(process.cwd(), '.omd', 'route.json');

  if (mode === 'validate') {
    if (!opts.input || opts._.length > 0) throw new Error('usage: omd route validate --input <route-input.json> [--json]');
    const { diagnoseAdaptiveRouteInput, routeAdaptiveFlow } = await import('../core/route/adaptive-flow.ts');
    const input = inputJson(opts.input, 'omd route validate');
    let localeDesign: import('../core/locale/design-context.ts').LocaleDesignRoute | undefined;
    if (opts.localeContext !== undefined) {
      if (resolve(opts.localeContext) !== resolve(process.cwd(), '.omd/locale-design-context.json')) {
        throw new Error('LOCALE_DESIGN_CONTEXT_PATH: --locale-context must name .omd/locale-design-context.json');
      }
      const { routeLocaleDesignContext } = await import('../core/locale/design-context.ts');
      localeDesign = routeLocaleDesignContext(inputJson(opts.localeContext, 'omd route validate --locale-context'));
    }
    const diagnostics = diagnoseAdaptiveRouteInput(input, localeDesign);
    const report = { schema: 'adaptive-route-validation-v1', ok: diagnostics.length === 0, published: false, diagnostics };
    if (diagnostics.length) {
      const next = 'Repair the named fields together, preserving user facts, risk, scope and selected work; rerun route validate with the same input and locale context. Do not run completion or guess unrelated stages. Classification is available only after validation passes.';
      if (opts.json) process.stdout.write(JSON.stringify({ ...report, next }));
      else console.error(`${diagnostics.map(d => `${d.path}: ${d.message}`).join('\n')}\n${next}`);
      process.exit(1);
    }
    // A clean diagnostic report still goes through the canonical fail-closed validator.
    const record = routeAdaptiveFlow(input, undefined, localeDesign);
    if (opts.json) process.stdout.write(JSON.stringify({ ...report, deliveryMode: record.deliveryMode ?? 'implementation', stages: record.strategy.stages,
      next: 'Run route classify with this input and the same locale context; then stage resume. Validation alone did not publish or complete any stage.' }));
    else console.log('ok — route input is valid; no project state was written');
    process.exit(0);
  }

  if (mode === 'classify') {
    if (!opts.input) throw new Error('usage: omd route classify --input <route-input.json> [--activation <host-issued-invocation.json>] [--json]');
    const input = validateRouteInput(inputJson(opts.input, 'omd route classify'));
    let localeDesign: import('../core/locale/design-context.ts').LocaleDesignRoute | undefined;
    if (opts.localeContext !== undefined) {
      const canonicalLocalePath = resolve(process.cwd(), '.omd', 'locale-design-context.json');
      if (resolve(opts.localeContext) !== canonicalLocalePath) {
        throw new Error('LOCALE_DESIGN_CONTEXT_PATH: --locale-context must name .omd/locale-design-context.json');
      }
      const { routeLocaleDesignContext } = await import('../core/locale/design-context.ts');
      localeDesign = routeLocaleDesignContext(inputJson(opts.localeContext, 'omd route classify --locale-context'));
    }
    const invocation = invocationFromActivation(opts, 'omd route classify');
    const writer = projectWriter(invocation);
    const published = publishAdaptiveRoute(
      process.cwd(),
      input,
      writer,
      invocation,
      localeDesign,
    );
    const activationEvidencePath = process.env.OMD_ACTIVATION_EVIDENCE_PATH;
    if (activationEvidencePath !== undefined && validateActivationContext(inputJson(activationEvidencePath, 'Codex activation evidence')).briefSha256 === invocation.activation.briefSha256) {
      writer.mkdir('.omd/receipts');
      writer.write('.omd/receipts/activation.json', `${canonicalJson(invocation.activation)}\n`);
    }
    const record = published.record;
    const path = published.pointerPath;
    if (opts.json) process.stdout.write(JSON.stringify(record));
    else {
      console.log(`route: ${record.route} -> ${path}`);
      console.log(`  rationale: ${record.strategy.rationale}`);
      console.log(`  roles: ${record.strategy.roles.join(', ')}`);
      console.log(`  stages: ${record.strategy.stages.join(' -> ')}`);
      console.log(`  methods: ${record.strategy.methods.join(', ')}`);
      console.log(`  references: ${record.references.decision} — ${record.references.intended}`);
    }
    process.exit(0);
  }

  if (mode === 'show' || mode === undefined) {
    if (opts._.length > 0) throw new Error('usage: omd route show [--activation <host-issued-invocation.json>] [--json]');
    if (!existsSync(recordPath)) throw new Error('ROUTE_UNCLASSIFIED: run `omd route classify --input <route-input.json>` first');
    const record = readPersistedRoute(process.cwd(), invocationFromActivation(opts, 'omd route show'));
    if (opts.json) process.stdout.write(JSON.stringify(record));
    else {
      console.log(`route: ${record.route}`);
      console.log(`  request: ${record.request}`);
      console.log(`  roles: ${record.strategy.roles.join(', ')}`);
      console.log(`  stages: ${record.strategy.stages.join(' -> ')}`);
      console.log(`  methods: ${record.strategy.methods.join(', ')}`);
      console.log(`  allowed: ${record.allowedPaths.join(', ')}`);
      for (const skipped of record.strategy.skips) console.log(`  skip ${skipped.id}: ${skipped.reason}`);
    }
    process.exit(0);
  }

  if (mode === 'check') {
    if (opts._.length > 0) throw new Error('usage: omd route check [--activation <host-issued-invocation.json>] [--json]');
    if (!existsSync(recordPath)) throw new Error('ROUTE_UNCLASSIFIED: run `omd route classify --input <route-input.json>` first');
    const invocation = invocationFromActivation(opts, 'omd route check');
    const record = readPersistedRoute(process.cwd(), invocation);
    let changed: readonly string[];
    try {
      changed = changedPathsForAdaptiveRoute(
        process.cwd(), record, adaptiveRouteRecordSha256(record), invocation,
      );
    } catch (error) {
      throw new Error(`ROUTE_SCOPE_UNVERIFIABLE: ${error instanceof Error ? error.message : String(error)}`);
    }
    const outside = pathsOutsideScope(record, changed);
    if (opts.json) process.stdout.write(JSON.stringify({ route: record.route, changed: changed.length, outside }));
    else if (outside.length === 0) console.log(`ok — ${changed.length} changed paths, all inside the ${record.route} route scope`);
    else {
      console.error(`ROUTE_SCOPE_EXCEEDED: ${outside.length} path(s) outside the declared scope`);
      for (const path of outside) console.error(`  - ${path}`);
      console.error(`  allowed: ${record.allowedPaths.join(', ')}`);
    }
    process.exit(outside.length === 0 ? 0 : 1);
  }

  if (mode === 'preview') {
    if (!opts.input) throw new Error('usage: omd route preview --input <route-input.json> [--json]');
    const result = classifyRoute(validateRouteInput(inputJson(opts.input, 'omd route preview')));
    if (opts.json) process.stdout.write(JSON.stringify(result));
    else console.log(`route: ${result.route} (${result.strategy.rationale})`);
    process.exit(0);
  }

  throw new Error('usage: omd route validate|classify --input <route-input.json> | show | check | preview --input <route-input.json>');
}

/**
 * `omd brief <stage>` — everything a stage owner needs, derived from this project's own state.
 *
 * This is the supply point that replaces reading a coordinator skill: no instructions about how to
 * reason, only what the stage owns, the evidence gathered for it, the contracts bound to it, and
 * the commands that will judge it. None of that changes when the model changes.
 */
async function cmdBrief(stage: string | undefined, opts: Opts): Promise<never> {
  const { buildBrief, formatBrief, writeBrief, EXTRA_BRIEF_STAGES } = await import('../core/brief/index.ts');
  const { STAGES } = await import('../core/stage/contract.ts');
  if (stage === undefined || opts._.length > 0) {
    throw new Error(`usage: omd brief <stage> [--check] [--json]  (stages: ${[...STAGES.map((s) => s.id), ...EXTRA_BRIEF_STAGES].join(', ')})`);
  }
  const invocation = invocationFromActivation(opts, 'omd brief');
  const { checkBriefEntry } = await import('../core/brief/entry.ts');
  const brief = (opts.check ? checkBriefEntry : buildBrief)(
    process.cwd(),
    stage as Parameters<typeof buildBrief>[1],
    join(root, 'core'),
    invocation,
  );
  // Persist what the stage was handed. A brief that exists only for the length of one command
  // leaves no record of what an owner actually received, which is the question asked later.
  writeBrief(process.cwd(), brief, projectWriter(invocation));
  if (opts.json) process.stdout.write(JSON.stringify(brief));
  else process.stdout.write(formatBrief(brief));
  process.exit(opts.check && brief.blockers.length > 0 ? 1 : 0);
}

/** `omd status --files` — what this project actually holds, by what it is for. */
async function cmdStatus(opts: Opts): Promise<never> {
  const { scanProject } = await import('../core/layout/scan.ts');
  const scan = scanProject(process.cwd());
  const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)}KB`;
  if (opts.json) {
    process.stdout.write(JSON.stringify(scan));
    process.exit(0);
  }
  console.log(`Design record        ${String(scan.byClass.human.files).padStart(4)}  ${kb(scan.byClass.human.bytes)}`);
  console.log(`Reference captures   ${String(scan.byClass.refs.files).padStart(4)}  ${kb(scan.byClass.refs.bytes)}`);
  console.log(`Trust state          ${String(scan.byClass.state.files).padStart(4)}  ${kb(scan.byClass.state.bytes)}`);
  console.log(`Scratch (cache)      ${String(scan.byClass.cache.files).padStart(4)}  ${kb(scan.byClass.cache.bytes)}`);
  const cleanable = scan.cleanable.length + scan.retired.length + scan.orphanRecords.length;
  console.log(`Safe to clean        ${String(cleanable).padStart(4)}  ${kb([...scan.cleanable, ...scan.retired, ...scan.orphanRecords].reduce((sum, entry) => sum + entry.bytes, 0))}`);
  if (scan.unclassified.length > 0) {
    console.log(`Unclassified         ${String(scan.unclassified.length).padStart(4)}  (never cleaned automatically)`);
    for (const entry of scan.unclassified.slice(0, 10)) console.log(`  ? .omd/${entry.path}`);
  }
  process.exit(0);
}

/**
 * `omd clean` — remove only what a rerun can rebuild. Dry run is the default because the one
 * unrecoverable mistake here is deleting an audit record something still cites.
 */
async function cmdClean(opts: Opts): Promise<never> {
  if (opts.cache !== true && opts.staleRecords !== true && opts.all !== true) {
    throw new Error('usage: omd clean --cache | --stale-records | --all [--apply] [--json]  (dry run unless --apply)');
  }
  const { citedFigmaArtifactPaths, scanProject } = await import('../core/layout/scan.ts');
  const apply = opts.apply === true;
  const invocation = invocationFromActivation(opts, 'omd clean');
  const release = apply ? acquireProjectMutationLock(process.cwd(), invocation) : undefined;
  let selected: readonly import('../core/layout/scan.ts').ScannedEntry[];
  try {
    const scan = scanProject(process.cwd());
    selected = [
      ...(opts.cache === true || opts.all === true ? scan.cleanable : []),
      ...(opts.staleRecords === true || opts.all === true ? [...scan.retired, ...scan.orphanRecords] : []),
    ];
    if (apply) {
      const adapter = projectWriter(invocation);
      const figmaSelected = selected.filter((entry) => /^figma\/(exports|renders)\//.test(entry.path));
      const nonFigmaSelected = selected.filter((entry) => !figmaSelected.includes(entry));
      const removedFigma = opts.cache === true || opts.all === true
        ? (await import('../core/figma/artifact-authority.ts')).applyAuthorizedFigmaCleanup(
            process.cwd(), adapter, citedFigmaArtifactPaths(process.cwd()),
          )
        : [];
      for (const entry of nonFigmaSelected) adapter.remove(join('.omd', entry.path));
      selected = [...nonFigmaSelected, ...removedFigma.map((path) => ({ path, bytes: 0 }))];
    }
  } finally {
    release?.();
  }
  if (opts.json) process.stdout.write(JSON.stringify({ applied: apply, removed: selected.map((entry) => entry.path) }));
  else {
    console.log(`${apply ? 'removed' : 'would remove'} ${selected.length} file(s)`);
    for (const entry of selected) console.log(`  - .omd/${entry.path}`);
    if (!apply && selected.length > 0) console.log('re-run with --apply to delete');
  }
  process.exit(0);
}
/** Performance gate over a Lighthouse JSON report (the agent runs Lighthouse; OMD gates it). */
function cmdLighthouse(opts: Opts): never {
  const file = opts._[0];
  if (!file) {
    throw new Error('usage: omd lighthouse <lighthouse-report.json> [--json] [--min-performance 0.9] [--max-lcp 2500] [--max-tbt 200] [--max-cls 0.1]');
  }
  const report: unknown = JSON.parse(readFileSync(file, 'utf8'));
  const budget: LighthouseBudget = {};
  if (opts.minPerformance !== undefined) budget.minPerformance = Number(opts.minPerformance);
  if (opts.maxLcp !== undefined) budget.maxLcpMs = Number(opts.maxLcp);
  if (opts.maxTbt !== undefined) budget.maxTbtMs = Number(opts.maxTbt);
  if (opts.maxCls !== undefined) budget.maxCls = Number(opts.maxCls);
  const result = evaluateLighthouse(report, budget);
  if (opts.json) process.stdout.write(JSON.stringify(result));
  else {
    const score = result.metrics.performance;
    console.log(`lighthouse: ${result.pass ? 'PASS' : 'FAIL'} — performance ${score === null ? 'n/a' : Math.round(score * 100)}`);
    for (const finding of result.findings) console.log(`  - ${finding}`);
  }
  process.exit(result.pass ? 0 : 1);
}

/** Advisory AI-cliche scan of copy-deck / rendered copy. Non-gating; always exit 0. */
function cmdTextSlop(opts: Opts): never {
  const file = opts._[0] ?? join(process.cwd(), '.omd', 'copy-deck.md');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const candidates = scanTextSlop(text);
  if (opts.json) process.stdout.write(JSON.stringify({ file, candidates }));
  else {
    console.log(`text-slop candidates: ${candidates.length} (${file})`);
    for (const c of candidates) console.log(`${file}:${c.line}  ${c.candidateId}  ${c.reviewQuestion}`);
    if (candidates.length === 0) console.log('ok — no AI-cliche phrase candidates (advisory only; not proof of good prose)');
  }
  process.exit(0);
}

/** `omd judgment input|publish|check` — interpret reference observations before composition. */
async function cmdJudgment(mode: string | undefined, opts: Opts): Promise<never> {
  const projectRoot = process.cwd();
  if (mode === 'input') {
    console.log(JSON.stringify(designJudgmentInput(projectRoot)));
    process.exit(0);
  }
  if (mode === 'publish') {
    if (opts.input === undefined) throw new Error('usage: omd judgment publish --input <design-judgment.json> [--json]');
    const invocation = invocationFromActivation(opts, 'omd judgment publish');
    const pointer = publishDesignJudgment(projectRoot, inputJson(opts.input, 'omd judgment publish'), projectWriter(invocation));
    if (opts.json) process.stdout.write(JSON.stringify(pointer));
    else console.log(`${DESIGN_JUDGMENT_PATH} -> ${pointer.sha256}`);
    process.exit(0);
  }
  if (mode === 'check') {
    const record = readDesignJudgment(projectRoot);
    if (record === null) {
      if (opts.json) process.stdout.write(JSON.stringify({ ok: false, error: 'DESIGN_JUDGMENT_REQUIRED' }));
      else console.error('DESIGN_JUDGMENT_REQUIRED: publish an interpretation before composition');
      process.exit(1);
    }
    const result = checkCurrentDesignJudgment(projectRoot);
    if (opts.json) process.stdout.write(JSON.stringify(result));
    else {
      console.log(result.ok ? `ok — design hypothesis is specific (${record.referenceBoardSha256})` : 'design hypothesis needs revision');
      for (const finding of result.findings) console.log(`  - ${finding}`);
    }
    process.exit(result.ok ? 0 : 1);
  }
  throw new Error('usage: omd judgment input|publish|check [--input <design-judgment.json>] [--json]');
}

/** `omd first-render check --page <local-build.html> --input <first-render-surface.json>` — current rendered gestalt. */
async function cmdFirstRender(mode: string | undefined, opts: Opts): Promise<never> {
  if (mode !== 'check' || opts.input === undefined || opts.page === undefined) {
    throw new Error('usage: omd first-render check --page <local-build.html> --input <first-render-surface.json> [--json]');
  }
  const hypothesis = readDesignJudgment(process.cwd());
  if (hypothesis === null) {
    throw new Error('DESIGN_JUDGMENT_REQUIRED: publish the composition hypothesis before checking a render');
  }
  const writer = projectWriterFromActivation(opts, 'omd first-render check');
  const checked = await publishFirstRenderCheck(process.cwd(), opts.page, inputJson(opts.input, 'omd first-render check'), writer);
  const report = checked.report;
  if (opts.json) process.stdout.write(JSON.stringify(checked));
  else {
    console.log(`first render: ${report.verdict} (${report.findings.length} finding${report.findings.length === 1 ? '' : 's'})`);
    for (const finding of report.findings) console.log(`  [${finding.severity}] ${finding.id}: ${finding.message}`);
  }
  process.exit(report.verdict === 'retain' ? 0 : 1);
}

/** Advisory interchangeability read of the copy deck. Non-gating; always exit 0. */
async function cmdCopySpecificity(opts: Opts): Promise<never> {
  const { readCopySpecificity } = await import('../core/copy/specificity.ts');
  const { validateDomainBrief } = await import('../core/domain/domain-brief.ts');
  const file = opts._[0] ?? join(process.cwd(), '.omd', 'copy-deck.md');
  if (!existsSync(file)) throw new Error(`no copy deck at ${file}; write one with \`omd brief copy\``);
  const markdown = readFileSync(file, 'utf8');

  const briefPath = join(process.cwd(), '.omd', 'domain-brief.json');
  let coreObjects: readonly string[] = [];
  let surfaces: readonly string[] = [];
  if (existsSync(briefPath)) {
    const brief = validateDomainBrief(JSON.parse(readFileSync(briefPath, 'utf8')));
    coreObjects = brief.coreObjects.map((object) => object.name);
    surfaces = brief.surfaces.map((surface) => surface.name);
  }

  const findings = readCopySpecificity({ markdown, coreObjects, surfaces });
  if (opts.json) process.stdout.write(JSON.stringify({ file, findings }));
  else {
    console.log(`interchangeable lines: ${findings.length} (${file})`);
    for (const finding of findings) console.log(`${file}:${finding.line}  ${finding.reviewQuestion}\n    ${finding.text}`);
    if (findings.length === 0) console.log('ok — every line names something particular (advisory only; not proof of good prose)');
  }
  process.exit(0);
}

/** Advisory carrier / visual-richness read of composition.md. Non-gating; always exit 0. */
function cmdVisualRichness(opts: Opts): never {
  const file = opts._[0] ?? join(process.cwd(), '.omd', 'composition.md');
  const contract = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const valid = ['quiet', 'confident', 'showpiece'];
  const register = valid.includes(opts.register ?? '') ? (opts.register as VisualRichnessRegister) : undefined;
  const findings = evaluateVisualRichness(register ? { contract, register } : { contract });
  if (opts.json) process.stdout.write(JSON.stringify({ file, register: register ?? null, findings }));
  else {
    console.log(`visual-richness advisories: ${findings.length} (${file}${register ? `, register=${register}` : ''})`);
    for (const f of findings) console.log(`[advisory] ${f.id} ${f.section}: ${f.message}`);
    if (findings.length === 0) console.log('ok — every content section names a purposeful visual carrier (advisory only)');
  }
  process.exit(0);
}

/** `omd stack` — deterministic stack routing from folder evidence; plain HTML/CSS/JS by default. */
function cmdStack(opts: Opts): never {
  const d = computeStack(process.cwd());
  if (opts.json) process.stdout.write(JSON.stringify(d));
  else {
    console.log(`stack: ${d.stack}${d.framework ? ` (${d.framework})` : ''}`);
    console.log(`  reason: ${d.reason}`);
    console.log(`  greenfield: ${d.greenfield}`);
    console.log(`  shell: ${d.shell.kind}${d.shell.evidence.length > 0 ? ` (${d.shell.evidence.join(', ')})` : ''}`);
    if (d.shell.kind !== 'browser') {
      console.log(`  ${renderTargetHint(d.shell)}`);
      console.log('  not applicable to this shell:');
      for (const check of d.shell.inapplicableChecks) console.log(`    - ${check}`);
    }
  }
  process.exit(0);
}

function cmdGrain(args: string[]): never {
  const subcommand = args[0];
  const opts = parseArgs(args.slice(1));
  const root = process.cwd();

  if (subcommand === 'check') {
    const result = checkContentGrain(root);
    console.log(opts['json']
      ? JSON.stringify(result, null, 2)
      : `content grain: ${result.status} (${result.traitIds.length} traits, ${result.fixtureIds.length} fixtures)`);
    process.exit(0);
  }
  if (subcommand === 'set') {
    if (typeof opts['input'] !== 'string') {
      throw new Error('Usage: omd grain set --input <json> --activation <host-issued-invocation.json>');
    }
    const invocation = invocationFromActivation(opts, 'omd grain set');
    const input = JSON.parse(
      readContainedRegularFile(root, opts['input'], 'Content Grain input').toString('utf8'),
    );
    const result = publishContentGrain(root, input, invocation);
    console.log(opts['json'] ? JSON.stringify(result, null, 2) : `content grain: ${result.status}`);
    process.exit(0);
  }
  if (subcommand === 'fit') {
    if (typeof opts['input'] !== 'string') {
      throw new Error('Usage: omd grain fit --input <json> --activation <host-issued-invocation.json>');
    }
    const invocation = invocationFromActivation(opts, 'omd grain fit');
    const input = JSON.parse(
      readContainedRegularFile(root, opts['input'], 'Content Fit input').toString('utf8'),
    );
    const receipt = publishContentFitReceipt(root, input, invocation);
    console.log(opts['json'] ? JSON.stringify(receipt, null, 2) : `content fit: ${receipt.status}`);
    process.exit(0);
  }
  if (subcommand === 'fit-check') {
    const grain = checkContentGrain(root);
    const receipt = readContentFitReceipt(root);
    if (receipt.grain.sha256 !== grain.grainSha256) {
      throw new Error('STALE_CONTENT_FIT_GRAIN: receipt does not bind the current Content Grain');
    }
    const coverage = receipt.checks.reduce(
      (counts, check) => ({ ...counts, [check.viewport]: counts[check.viewport] + 1 }),
      { desktop: 0, mobile: 0 },
    );
    const result = {
      schema: 'content-fit-check-v1',
      status: receipt.status,
      grainSha256: grain.grainSha256,
      traitIds: grain.traitIds,
      fixtureIds: grain.fixtureIds,
      coverage,
    };
    console.log(opts['json'] ? JSON.stringify(result, null, 2) : `content fit: ${result.status}`);
    process.exit(0);
  }
  throw new Error('Usage: omd grain <set|check|fit|fit-check>');
}

function usage(): never {
  console.error(
    'usage: omd <command>\n\n'
    + '  ir <page> [-o f]                            rendered DOM -> Design IR\n'
    + '  render <page> -o shot.png [--viewport WxH]  headless screenshot\n'
    + '  render <page> --full-page -o shot.png         supplementary long-page capture\n'
    + '  render <page> --squint -o shot.png            grayscale + blur hierarchy isolation\n'
    + '  render <page> --proofs -o <prefix>            all four proofs (fixed+full, desktop+mobile) in one browser\n'
    + '  render <page> --filmstrip -o f.html [--viewport WxH]  load-time filmstrip\n'
    + '  probe <page> [--plan path] [--json] [--out path]  declared local interaction path\n'
    + '  check [<page>|--ir f] [--json] [--category slop] [--no-log]\n'
    + '  check --site <dir>                          cross-page consistency (SITE-*)\n'
    + '  check <page1> <page2> ...                   same, multi-page positional\n'
    + '  slop scan [root] [--json]                   read-only source candidate scan\n'
    + '  slop checkpoint --input <scope.json>       capture local build views and scan source/render slop\n'
    + '  slop review-set --input <review.json>       record each rendered judgment and repair resolution\n'
    + '  slop review-check [--json]                  require current closed review/repair history\n'
    + '  slop score --input f --corpus f [--json]    advisory composite slop proximity over the shared visual space\n'
    + '  stack [--json]                              deterministic stack routing (blank greenfield -> plain HTML/CSS/JS)\n'
    + '  coach                                        trends across `omd check` history\n'
    + '  usage [--json]                              this run\'s elapsed time + token total (host session log)\n'
    + '  hash <.omd/artifact-path> [--json]          read-only exact evidence digest; no shell or publication\n'
    + '  copy review-input --json                   exact copy text and byte digest for a fresh review\n'
    + '\n'
    + '  lifecycle plan|run --project <dir> [--manifest <json>]\n'
    + '                                               trusted browser evaluation and observation\n'
    + '  lifecycle refinement-evidence --project <dir> --activation <json> --json\n'
    + '                                               verified before/after PNG packet for isolated Eye review\n'
    + '  lifecycle refine --project <dir> --activation <json> --review <content-addressed-review>\n'
    + '                                               commit an evidence-bound refinement checkpoint\n'
    + '  lifecycle refinement-rollback --project <dir> --activation <json> --review <content-addressed-review>\n'
    + '                                               atomically restore a reviewer-preferred baseline\n'
    + '  frame show\n'
    + '  frame set --problem P --reframe R --why EVIDENCE\n'
    + '            [--task T --frequent-action A --costliest-error E --surface S --task-matrix "T1 …" --entry-surface contract.json]\n'
    + '  frame reframe --to "..." --because "what the render revealed"\n'
    + '  frame generator --set "metaphor"\n'
    + '\n'
    + '  choose c1 c2 c3 --chose c3 --why "..."\n'
    + '  decision "what" --why "why"\n'
    + '  taste record "subject" --kind selection|praise|rejection|overrule --evidence "verbatim" --from-user\n'
    + '  taste profile [--all]\n'
    + '  config set checkpoint none|concept|structure|both | config show\n'
    + '  craft checkpoint semantic|visual --render P --observed "..." --decision revise|retain|reframe --criterion "..." --reason "..." [--changed "..."]\n'
    + '  craft status [--json]\n'
    + '\n'
    + '  ref add <url|file> --as <component> [--lane domain|design] [--selector "css"] [--image] [--blueprint]\n'
    + '                                                render, extract invariants, save\n'
    + '  ref add ... --selector ".nav" --blueprint     also capture a component blueprint\n'
    + '  ref add ... --selector ".nav" --blueprint --shot  also save the component screenshot beside its blueprint\n'
    + '  ref add ... --no-energy --preparation <json>  prepare explicit disclosure clicks and verify visibility before capture\n'
    + '  ref add-batch <manifest.json>               capture zone-bound references in parallel over one browser\n'
    + '  ref discover-plan [--json]                  derive automatic search lanes from the current task; no user URLs required\n'
    + '  ref research-set --input research.json     bind separate domain/design lane evidence to current outputs\n'
    + '  ref research-check                         require both lanes and re-hash their evidence and outputs\n'
    + '  ref search --input <json>                  execute a public query GET and record actual links/capture or failure\n'
    + '  ref tidy [--apply] [--json]                preview clutter; --apply archives exact bytes before guarded removal\n'
    + '  ref apply-plan --json                      draft screen-by-screen use from current research/domain brief\n'
    + '  ref apply-set --input application.json      publish interpreted domain/design decisions for every screen\n'
    + '  ref apply-check --json                     verify current decisions and export source-free screen guidance\n'
    + '  ref apply-review-plan --json               enumerate every screen criterion against authenticated final captures\n'
    + '  ref apply-review-set --input <json>         record met/revise/justified-departure judgments on current captures\n'
    + '  ref apply-review-check --json              reject missing, unresolved, or stale rendered application reviews\n'
    + '  ref board --input candidate-assemblies.json   author and persist a validated board from captured source/component pieces\n'
    + '  ref locale-bind --input bindings.json         bind local reference pieces to current cultural evidence decisions\n'
    + '  ref locale-bind-check                         revalidate board/profile/source locale bindings\n'
    + '  ref navigate <url> --lane domain|design     capture a discovery hop; add --entry public-directory|free-gallery for an explicit direct root\n'
    + '  ref list [--lane domain|design] [--json]     inspect separate capture inventories\n'
    + '  ref distance <page> [--selected [--gate]] [--json]  compare all refs, or selected destination selectors\n'
    + '  ref principles <source> --as C --add "..."   record why a reference works\n'
    + '  ref show <source> --as C                    invariants + principles\n'
    + '  ref check [manifest] [--json]               validate board evidence and any saved selection\n'
    + '  ref verify [page] [--candidate id] [--json] inspect acquisition and measured layout transfer\n'
    + '  ref v2-check --input handoff.json [--json]  validate the canonical v2 reference handoff\n'
    + '  ref handoff <art-direction|composer|hand> [--json]  export current selected source-free feature content\n'
    + '  ref import-image <input.json> [--json]      save a provenance-bound image fragment\n'
    + '  ref candidates [manifest]                   print chat-ready Korean-first candidate Markdown\n'
    + '  ref select <candidate-id> [--json]          bind a closed candidate selection to its evidence\n'
    + '  ref influence-proof --input <proof.json>   bind every used influence to current viewport evidence\n'
    + '  ref visual-packet --slot <id[,id]>          create selected source-free no-ship geometry studies\n'
    + '  ref visual-packet-check [--production paths] validate packet currentness and non-reuse\n'
    + '  ref audit [--json]                          warn when references were captured sequentially (use ref add-batch)\n'
    + '  ref granularity [--json]                    fail when the board does not cover the composition zones\n'
    + '\n'
    + '  design                                       discover evidence and create/refresh .omd/design.md\n'
    + '  design --check                              validate design.md section coverage\n'
    + '  init [--input <runtime-input.json>] [--refresh | --check] [--json]  inventory source/runtime styles; preserve approved tokens\n'
    + '  copy --check [--json]                       validate required copy deck structure and fact refs\n'
    + '  copy --review-check [--json]                validate copy-eye structure and current deck hash\n'
    + '  copy review-publish --input <report>         preserve a validated blind copy-eye report\n'
    + '  review evidence-projection --input <observation-projection-input.json>  emit source-free aggregate/state/viewport/capture bindings for final Eyes\n'
    + '  review final-packet --input <packet-input.json>  publish the current anonymous production-image packet for two isolated final Eyes\n'
    + '  review publish --input <publication.json>    persist two host-signed Eye results as one quorum lane\n'
    + '  review refinement-publish --input <publication.json>  persist two independent Eye comparison votes\n'
    + '  candidate select --input <pointer.json>       bind production to one validated Sketch candidate\n'
    + '  copy v2 check [--json]                      validate selected register and stable v2 Beat IDs\n'
    + '  composition --check [--activation <invocation>] [--json]  validate composition sections and input freshness\n'
    + '  capture --check --input <receipt.json> [--json]  validate fixed-viewport settlement and pixel coherence\n'
    + '  optical --input <raw.json> [--json]          independently recompute clipped Q/I optical admission\n'
    + '  packet --check --input <packet.json> [--json] validate complete anonymous candidate review evidence\n'
    + '  proof revision --input <entry> [--json]     hash the current production revision\n'
    + '  proof --check [--json]                      validate type/composition production revision bindings\n'
    + '  acquisition set --input <json-file|->        persist framer-owned v2 reference targets; - reads stdin\n'
    + '  brief <stage> [--check] [--json]            inspect a stage; --check refuses blocked/unselected entry\n'
    + '  route validate --input route-input.json [--json]  read-only grouped input diagnostics before publication\n'
    + '  route classify --input route-input.json [--locale-context .omd/locale-design-context.json]  validate an adaptive contract-derived strategy and lock scope\n'
    + '  route show | route check [--json]           the chosen route, and writes outside its scope\n'
    + '  workflow plan|readiness|slice|artifacts|check-readiness|check-slice|check --activation <host-issued-invocation.json>  persist/check immutable design-development checkpoints\n'
    + '  status [--files] [--json]                   what this project holds, by what it is for\n'
    + '  clean --cache | --stale-records | --all [--apply]  remove only what a rerun can rebuild\n'
    + '  depth classify --input depth.json [--json]      choose L1–L4 from design risk, never from convenience\n'
    + '  deliberate check [--phase prebuild|final] [--json] validate owner decisions before build or the complete visual loop\n'
    + '  deliberate preserve --input moderator.json    validate and persist an exact omd-eye moderator handback\n'
    + '  compare score --input comparison.json [--json] blind same-model quality and quality/cost comparison\n'
    + '  source --seal [root]                        write final approved-input/source byte seal\n'
    + '  source --check [root] [--json]              fail when the source seal is missing or stale\n'
    + '  evidence finalize --input manifest.json      disabled: v1 publication is permanently trapped\n'
    + '  evidence check [--json]                     read-only legacy evidence verification\n'
    + '  evidence v2 finalize --input manifest.json --activation <host-issued-invocation.json> atomically publish final-evidence-v2\n'
    + '  evidence v2 check --activation <host-issued-invocation.json> [--json] validate only the v2 pointer and selected immutable record\n'
    + '  evidence static-capture --input capture.json  capture desktop/mobile path-backed static observations\n'
    + '  evidence motion-capture --input capture.json  capture pre-trigger, motion, and reduced-motion proof\n'
    + '  evidence static-check --input evidence.json   validate path-backed static direction evidence\n'
    + '  evidence motion-check --input evidence.json   validate measured motion direction evidence\n'
    + '  evidence v2-recover [--json]                remove only an unambiguously stale v2 publication lock\n'
    + '  evidence v2-gc [--dry-run|--apply] [--json] retain current pointer; dry-run is the default\n'
    + '  evidence tasks --input .omd/.cache/task-evidence-manifest.json  publish strict production task evidence\n'
    + '  evidence tasks-check [--json]               revalidate strict production task evidence\n'
    + '\n'
    + '  art-direction check --input decision-check.json [--json]  persist a host-authorized direction\n'
    + '  art-direction alternatives-sha --input alternatives.json [--json]  canonical digest every perspective and receipt must bind\n'
    + '  art-direction check-input [--route /] [--json]  emit the check payload skeleton with canonical references filled in\n'
    + '  schema list | schema <name> [--json]        print the exact skeleton for a hand-authored input\n'
    + '  stage list|status|resume [--json]           stage owners, artifacts, and where a resumed run continues\n'
    + '  stage deliver --stage <s> --contract <pack-relative.md>  record that a contract reached its stage\n'
    + '  stage require <stage> [--json]              block until earlier artifacts exist and contracts are delivered\n'
    + '  stage record --stage <s> | stage cost [--max-stage-tokens N] [--max-run-tokens N] [--max-run-minutes N]  per-stage cost and budget\n'
    + '  cue [--path p] [--symbol s] [--field k=v] [--stage s] [--json]  contracts this work binds, from deterministic inputs only\n'
    + '  locale plan [--input .omd/locale-design-context.json] [--json]  route locale mechanics, clarification, or market research\n'
    + '  locale profile --input profile.json --locale-context .omd/locale-design-context.json [--json]  validate and sanitize a source-bound cultural profile\n'
    + '  locale source-capture --url https://… --activation invocation.json [--json]  fetch and bind current source bytes to the locale context\n'
    + '  locale source-stability --url https://… --activation invocation.json [--json]  bind immediate byte instability as canonical unavailability\n'
    + '  locale profile --publish --input profile.json --activation host.json | profile-check --activation host.json  persist/revalidate current cultural records\n'
    + '  locale check [--input .omd/locale.json] [--deck .omd/copy-deck.md] [--json]  validate declared locales and their Beat copy\n'
    + '  complete check <page> [--input .omd/functional-requirements.json] [--json]  every declared requirement is present, operable, reachable\n'
    + '  complete publish --input <completeness-run.json>  publish a current immutable zero-finding completeness receipt\n'
    + '  completion typography-applicability --ir <rendered-ir.json> --activation <host-issued-invocation.json>  publish immutable Korean display applicability\n'
    + '  guard production [--path <file>] [--json]  validate selected inputs before application writes\n'
    + '  guard completion [--json]  selected inputs plus delivery-mode-specific terminal gate\n'
    + '  completion preflight [--activation <host-issued-invocation.json>] [--json]  terminal evidence gate; retains reviewer authorization\n'
    + '  intent append --input trusted-intent.json [--json]  append trusted intent and update its guarded current pointer\n'
    + '  domain check [--input domain-brief.json] [--json]  validate the domain-analysis brief\n'
    + '  craft-fidelity check --input pair.json [--json]  verify a generated part reproduced the reference craft\n'
    + '  craft-capture <url> --as <slug> --technique "<t>" [--selector <css>] [--viewport WxH] [--json]  measure a reference-craft-v1 from a real browser\n'
    + '  craft-usage <page> [--surface S] [--refs dir] [--json]  fail when captured scroll craft was declined to a static build\n'
    + '  recipe list [--json]                        list the installable recipe library\n'
    + '  no-js <page> [--viewport WxH] [--json]      fail when content is gated behind JavaScript\n'
    + '  award score <page> [--lighthouse report.json] [--json]  score against the Awwwards developer rubric\n'
    + '  tokens check [--input tokens.json] [--page <page>] [--json]  validate the committed ladders and their use\n'
    + '  recipe show <name> [--stack S] [--json]     print the files an install would write\n'
    + '  recipe add <name> [--stack react|vanilla] [--out dir]  install a recipe as real source\n'
    + '  preflight --input activation-context.json [--json]  read-only activation validation\n'
    + '  text-slop [file] [--json]                   advisory AI-cliche scan of copy (default .omd/copy-deck.md)\n'
    + '  copy-specificity [file] [--json]            advisory: lines that could ship from any product in the category\n'
    + '  visual-richness [file] [--register R] [--json]  advisory carrier read of composition (default .omd/composition.md)\n'
    + '\n'
    + '  pack dir                                    print the knowledge-pack root path\n'
    + '  pack list                                   list all pack .md files\n'
    + '  pack <relpath>                              print one pack file (e.g. theory/color.md)\n'
    + '\n'
    + '  doctor                                       check environment prerequisites\n'
  + '\n'
  + '  figma pull <file-url>                        fetch Figma file -> .omd/figma/snapshot.json\n'
  + '  figma system                                 synthesize design system from snapshot\n'
  + '  figma diff <frame-id> <page-or-url>          pixel diff: Figma export vs build render\n'
  + '\n'
  + '  target set <image-path-or-url> --as <name>  register a visual target (mockup / screenshot)\n'
  + '  target list                                  show registered targets\n'
  + '  target diff <page> [--target <name>] [--viewport WxH] [--threshold N] [--json]\n'
  + '                                               pixel diff: target vs build render (exit 1 below threshold)',
  );
  process.exit(1);
}

async function main(): Promise<never> {
  const args = process.argv.slice(2);
  const [cmd, sub] = args;

  if (cmd === '--version') {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
    console.log(pkg.version);
    process.exit(0);
  }

  if (cmd === 'lifecycle' && (sub === '--help' || sub === 'help')) {
    console.log([
      'Usage:',
      '  omd lifecycle plan --project <dir> [--output .omd/.cache/trusted-lifecycle-manifest.json] --activation <json>',
      '  omd lifecycle run|evaluate --project <dir> --manifest <json> [--activation <json>]',
      '  omd lifecycle repair --project <dir> --activation <json> --review <json> --mirror <dir> --owner-receipt <json>',
      '  omd lifecycle refinement-evidence --project <dir> --activation <json> --json',
      '  omd lifecycle refine --project <dir> --activation <json> --review <content-addressed-review>',
      '  omd lifecycle refinement-rollback --project <dir> --activation <json> --review <content-addressed-review>',
      '  omd lifecycle finalize --project <dir> --activation <json> --input <final-v2.json>',
    ].join('\n'));
    process.exit(0);
  }
  if (cmd === 'lifecycle' && sub === 'plan') {
    const opts = parseArgs(args.slice(2));
    if (!opts.project) {
      throw new Error('usage: omd lifecycle plan --project <dir> [--output .omd/.cache/trusted-lifecycle-manifest.json] [--activation <host-issued-invocation.json>]');
    }
    const project = realpathSync(resolve(opts.project));
    const canonicalOutput = '.omd/.cache/trusted-lifecycle-manifest.json';
    const output = relative(project, resolve(project, opts.output ?? canonicalOutput));
    if (output !== canonicalOutput) throw new Error('TRUSTED_EVALUATION_PLAN_OUTPUT_FORBIDDEN');
    const invocation = invocationFromActivation(opts, 'omd lifecycle plan', project);
    const { deriveTrustedEvaluationPlanFromProject } = await import('../core/runtime/trusted-evaluation-plan.ts');
    const { trustedEvaluationPlanBytes } = await import('../core/runtime/trusted-evaluation-contract.ts');
    const manifest = deriveTrustedEvaluationPlanFromProject({ root: project, invocation });
    const writer = projectWriter(invocation, project);
    writer.mkdir('.omd/.cache');
    writer.write(canonicalOutput, trustedEvaluationPlanBytes(manifest));
    console.log(opts.json ? JSON.stringify(manifest) : canonicalOutput);
    process.exit(0);
  }
  if (cmd === 'ir') return cmdIr(parseArgs(args.slice(1)));
  if (cmd === 'lifecycle' && (sub === 'run' || sub === 'evaluate')) {
    throw new Error('omd lifecycle run/evaluate was removed with the host launcher. Run the evaluation from the host session (see `omd lifecycle --help`).');
  }
  if (cmd === 'lifecycle' && sub === 'repair') {
    const opts = parseArgs(args.slice(2));
    if (!opts.project || !opts.activation || !opts.review || !opts.mirror || !opts.ownerReceipt) return usage();
    const project = realpathSync(resolve(opts.project));
    const invocation = validateProjectRunInvocation(
      inputJson(opts.activation, 'omd lifecycle repair activation'),
    );
    const review = inputJson(opts.review, 'omd lifecycle repair review');
    const {
      applyProductionRepair,
      stageProductionRepair,
    } = await import('../core/runtime/production-repair.ts');
    const staged = stageProductionRepair({
      root: project,
      invocation,
      review: review as Parameters<typeof stageProductionRepair>[0]['review'],
      mirrorRoot: realpathSync(resolve(opts.mirror)),
      ownerReceipt: inputExternalReadonlyBytes(opts.ownerReceipt, 'omd lifecycle repair owner receipt', project),
    });
    const outcome = applyProductionRepair({
      root: project,
      invocation,
      writer: createProjectWriteAdapter(project, invocation),
      staged,
    });
    console.log(opts.json ? JSON.stringify(outcome) : `REPAIR: COMMITTED\noutcome: ${outcome.outcomePath}`);
    process.exit(0);
  }
  if (cmd === 'lifecycle' && sub === 'refinement-evidence') {
    const opts = parseArgs(args.slice(2));
    if (!opts.project || !opts.activation || opts._.length > 0) return usage();
    const project = realpathSync(resolve(opts.project));
    const invocation = validateProjectRunInvocation(
      inputJson(opts.activation, 'omd lifecycle refinement-evidence activation'),
    );
    const {
      publishRenderedRefinementReviewerPacket,
    } = await import('../core/runtime/rendered-refinement.ts');
    const packet = publishRenderedRefinementReviewerPacket({
      root: project,
      invocation,
      writer: createProjectWriteAdapter(project, invocation),
    });
    if (opts.json) process.stdout.write(JSON.stringify(packet));
    else console.log(packet.path);
    process.exit(0);
  }
  if (cmd === 'lifecycle' && sub === 'refine') {
    const opts = parseArgs(args.slice(2));
    if (!opts.project || !opts.activation || !opts.review || opts._.length > 0) return usage();
    const project = realpathSync(resolve(opts.project));
    const invocation = validateProjectRunInvocation(
      inputJson(opts.activation, 'omd lifecycle refine activation'),
    );
    const { commitRenderedRefinementCheckpoint } = await import('../core/runtime/rendered-refinement.ts');
    const checkpoint = commitRenderedRefinementCheckpoint({
      root: project,
      invocation,
      writer: createProjectWriteAdapter(project, invocation),
      reviewPath: relative(project, resolve(project, opts.review)),
    });
    console.log(opts.json ? JSON.stringify(checkpoint) : `REFINEMENT: ${checkpoint.status.toUpperCase()}\naction: ${checkpoint.action}`);
    process.exit(checkpoint.status === 'regress' ? 1 : 0);
  }
  if (cmd === 'lifecycle' && sub === 'refinement-rollback') {
    const opts = parseArgs(args.slice(2));
    if (!opts.project || !opts.activation || !opts.review || opts._.length > 0) return usage();
    const project = realpathSync(resolve(opts.project));
    const invocation = validateProjectRunInvocation(
      inputJson(opts.activation, 'omd lifecycle refinement-rollback activation'),
    );
    const reviewPath = relative(project, resolve(project, opts.review));
    const {
      recoverRejectedProductionRepairRollback,
      rollbackRejectedProductionRepair,
      validateRejectedProductionRepairRollback,
    } = await import('../core/runtime/production-repair.ts');
    const writer = createProjectWriteAdapter(project, invocation);
    const recovery = recoverRejectedProductionRepairRollback({ root: project, invocation, writer, reviewPath });
    const rolledBack = recovery.status === 'rolled-back'
      ? recovery.outcome!
      : rollbackRejectedProductionRepair({ root: project, invocation, writer, reviewPath });
    const verified = validateRejectedProductionRepairRollback({ root: project, invocation, reviewPath });
    if (canonicalJson(rolledBack) !== canonicalJson(verified)) {
      throw new Error('REPAIR_ROLLBACK_STALE: rollback result did not revalidate');
    }
    console.log(opts.json ? JSON.stringify(verified) : `REFINEMENT: ROLLED BACK\npath: ${verified.path}`);
    process.exit(0);
  }
  if (cmd === 'lifecycle' && sub === 'finalize') {
    const opts = parseArgs(args.slice(2));
    if (!opts.project || !opts.activation || !opts.input) return usage();
    process.chdir(realpathSync(resolve(opts.project)));
    return cmdEvidence('v2-finalize', opts);
  }
  if (cmd === 'render') return cmdRender(parseArgs(args.slice(1)));
  if (cmd === 'probe') return cmdProbe(parseArgs(args.slice(1)));
  if (cmd === 'flow-probe') return cmdFlowProbe(parseArgs(args.slice(1)));
  if (cmd === 'check') return cmdCheck(parseArgs(args.slice(1)));
  if (cmd === 'slop') return cmdSlop(sub, parseArgs(args.slice(2)));
  if (cmd === 'lighthouse') return cmdLighthouse(parseArgs(args.slice(1)));
  if (cmd === 'coach') return cmdCoach();
  if (cmd === 'usage') return cmdUsage(parseArgs(args.slice(1)));
  if (cmd === 'config') return cmdConfig(sub, parseArgs(args.slice(2)));
  if (cmd === 'craft') return cmdCraft(sub, parseArgs(args.slice(2)));

  if (cmd === 'frame') {
    if (args.slice(1).some(arg => arg === '--help' || arg === '-h') || sub === 'help') {
      console.log('omd frame set --input <frame-input.json>\n  Print the complete input: omd schema frame\n  Or: frame set --problem P --reframe R --why EVIDENCE --task TASK --frequent-action ACTION --costliest-error ERROR --surface product|mixed|marketing|editorial [--task-matrix ROWS] [--reality <json-file>] [--entry-surface <json-file>]\n  Product/mixed needs --task-matrix (seven-field T1 rows), not functional-requirements JSON.\nomd frame check --json  validates current UX framing\nomd frame show  inspection only');
      process.exit(0);
    }
    const opts = parseArgs(args.slice(2));
    if (sub === 'show') return cmdFrameShow();

    if (sub === 'check') {
      const blockers = readFrame(process.cwd()) === null ? ['frame missing: run omd schema frame, then frame set --input <json>'] : checkFrameUx(process.cwd()).map(f => f.message);
      console.log(opts.json ? JSON.stringify({ ok: blockers.length === 0, blockers }) : blockers.join('\n') || 'ok — frame UX anchors and task coverage are valid');
      process.exit(blockers.length ? 1 : 0);
    }

    if (sub === 'set') {
      const allowed = new Set(['_', 'input', 'problem', 'reframe', 'why', 'task', 'frequentAction', 'costliestError', 'surface', 'taskMatrix', 'reality', 'entrySurface', 'activation', 'json']);
      const unknown = Object.keys(opts).filter(key => !allowed.has(key));
      if (unknown.length || opts._.length) throw new Error(`FRAME_OPTIONS_INVALID: unknown options/arguments: ${[...unknown, ...opts._].join(', ')}; run omd frame set --help or omd schema frame`);
      const malformed = Object.entries(opts).filter(([key, value]) => key !== '_' && key !== 'json' && (typeof value !== 'string' || !value.trim()));
      if (malformed.length) throw new Error(`FRAME_OPTIONS_INVALID: options need exactly one nonempty value: ${malformed.map(([key]) => key).join(', ')}; run omd frame set --help`);
      if (opts.input && Object.keys(opts).some(key => !['_', 'input', 'activation', 'json'].includes(key))) throw new Error('FRAME_OPTIONS_INVALID: --input cannot be mixed with inline frame fields');
      const { parseFrameInput } = await import('../core/frame/input.ts');
      const current = opts.input ? null : readFrame(process.cwd());
      const section = (heading: string) => current?.body.split(`## ${heading}\n`)[1]?.split(/^## /m)[0]?.trim();
      // Preserve separately published reality/entry contracts on a legacy inline UX update.
      // The complete --input form intentionally supplies a replacement record atomically.
      const fields = opts.input ? parseFrameInput(inputJson(opts.input, 'omd frame set')) : {
        problem: opts.problem ?? section('The given problem') ?? '',
        reframe: opts.reframe ?? section('The reframing') ?? '',
        ...(opts.why ? { why: opts.why } : {}),
        ...((opts.task ?? current?.uxTask) ? { uxTask: opts.task ?? current!.uxTask } : {}),
        ...((opts.frequentAction ?? current?.uxFrequentAction) ? { uxFrequentAction: opts.frequentAction ?? current!.uxFrequentAction } : {}),
        ...((opts.costliestError ?? current?.uxCostliestError) ? { uxCostliestError: opts.costliestError ?? current!.uxCostliestError } : {}),
        ...((opts.surface ?? current?.uxSurface) ? { uxSurface: opts.surface ?? current!.uxSurface } : {}),
        ...((opts.taskMatrix ?? section('Task coverage matrix')) ? { taskCoverageMatrix: opts.taskMatrix ?? section('Task coverage matrix') } : {}),
        ...(opts.reality ? { reality: parseRealityLedger(inputJsonValue(opts.reality, 'omd frame set reality ledger')) } : current?.reality ? { reality: current.reality } : {}),
        ...(opts.entrySurface ? {
          entrySurface: (await import('../core/frame/entry-surface-contract.ts'))
            .parseEntrySurfaceContract(inputJsonValue(opts.entrySurface, 'omd frame set entry surface')),
        } : current?.entrySurface ? { entrySurface: current.entrySurface } : {}),
      };
      const path = writeFrameRecord(process.cwd(), fields, projectWriterFromActivation(opts, 'omd frame set'));
      console.log(path);
      process.exit(0);
    }

    if (sub === 'reframe') {
      if (!opts.to || !opts.because) {
        console.error('usage: omd frame reframe --to "..." --because "what the render revealed"');
        process.exit(1);
      }
      console.log(reframe(process.cwd(), { to: opts.to, because: opts.because }, projectWriterFromActivation(opts, 'omd frame reframe')));
      process.exit(0);
    }

    if (sub === 'generator') {
      if (!opts.set) usage();
      setGenerator(process.cwd(), opts.set, projectWriterFromActivation(opts, 'omd frame generator'));
      console.log(`generator: ${opts.set}`);
      process.exit(0);
    }
    return usage();
  }

  if (cmd === 'ref') {
    if (sub === 'tidy' && args.slice(2).some(arg => arg === '--help' || arg === '-h')) {
      console.log('omd ref tidy [--apply] [--json]\n  Preview recognized legacy search/navigation files and unqualified design records.\n  --apply archives exact bytes and a recovery manifest in .omd/archive/references before guarded removal.\n  Eligible design references, domain references and unknown files remain. Revalidate dependent research and boards afterward.');
      process.exit(0);
    }
    const opts = parseArgs(args.slice(2));
    if (sub === 'tidy') return cmdRefTidy(opts);
    if (sub === 'navigate') return cmdRefNavigate(opts);
    if (sub === 'discover-plan') return cmdRefDiscoveryPlan(opts);
    if (sub === 'research-set') return cmdRefResearch('set', opts);
    if (sub === 'research-check') return cmdRefResearch('check', opts);
    if (sub === 'search') return cmdRefSearch(opts);
    if (sub === 'apply-plan') return cmdRefApplication('plan', opts);
    if (sub === 'apply-set') return cmdRefApplication('set', opts);
    if (sub === 'apply-check') return cmdRefApplication('check', opts);
    if (sub === 'apply-review-plan') return cmdRefApplicationReview('plan', opts);
    if (sub === 'apply-review-set') return cmdRefApplicationReview('set', opts);
    if (sub === 'apply-review-check') return cmdRefApplicationReview('check', opts);
    if (sub === 'add') return cmdRefAdd(opts);
    if (sub === 'add-batch') return cmdRefAddBatch(opts);
    if (sub === 'board') return cmdRefBoard(opts);
    if (sub === 'locale-bind') return cmdRefLocaleBind(opts);
    if (sub === 'locale-bind-check') return cmdRefLocaleBindCheck(opts);
    if (sub === 'list') return cmdRefList(opts);
    if (sub === 'distance') return cmdRefDistance(opts);
    if (sub === 'principles') return cmdRefPrinciples(opts);
    if (sub === 'show') return cmdRefShow(opts);
    if (sub === 'check') return cmdRefCheck(opts);
    if (sub === 'verify') return cmdRefVerify(opts);
    if (sub === 'v2-check') return cmdRefV2Check(opts);
    if (sub === 'v2' && args[2] === 'check') return cmdRefV2Check(parseArgs(args.slice(3)));
    if (sub === 'usage') return cmdRefUsage(opts);
    if (sub === 'usage-check') return cmdRefUsageCheck(opts);
    if (sub === 'influence-proof') return cmdRefInfluenceProof(opts);
    if (sub === 'visual-packet') return cmdRefVisualPacket(opts);
    if (sub === 'visual-packet-check') return cmdRefVisualPacketCheck(opts);
    if (sub === 'import-image') return cmdRefImportImage(opts);
    if (sub === 'candidates') return cmdRefCandidates(opts);
    if (sub === 'select') return cmdRefSelect(opts);
    if (sub === 'handoff') return cmdRefHandoff(opts);
    if (sub === 'audit') return cmdRefAudit(opts);
    if (sub === 'granularity') return cmdRefGranularity(opts);
    if (sub === 'mood') return cmdRefMood(args[2], parseArgs(args.slice(3)));
    if (sub === 'gates') return cmdRefGates(opts);
    return usage();
  }

  if (cmd === 'design') return cmdDesign(parseArgs(args.slice(1)));
  if (cmd === 'copy') return cmdCopy(parseArgs(args.slice(1)));
  if (cmd === 'hash') {
    const opts = parseArgs(args.slice(1));
    const path = opts._[0];
    if (!path || opts._.length !== 1) throw new Error('usage: omd hash <.omd/artifact-path> [--json]');
    const { artifactDigest } = await import('../core/runtime/artifact-digest.ts');
    const result = artifactDigest(process.cwd(), path);
    console.log(opts.json ? JSON.stringify(result) : `${result.sha256}  ${result.path}`);
    process.exit(0);
  }
  if (cmd === 'review') return cmdReview(sub, parseArgs(args.slice(2)));
  if (cmd === 'owner') return cmdOwner(sub, parseArgs(args.slice(2)));
  if (cmd === 'candidate') return cmdCandidate(sub, parseArgs(args.slice(2)));
  if (cmd === 'locale') return cmdLocale(sub, parseArgs(args.slice(2)));
  if (cmd === 'complete') return cmdComplete(sub, parseArgs(args.slice(2)));
  if (cmd === 'benchmark') return cmdBenchmark(sub, parseArgs(args.slice(2)));
  if (cmd === 'completion') return cmdCompletion(sub, parseArgs(args.slice(2)));
  if (cmd === 'guard') return cmdGuard(sub, parseArgs(args.slice(2)));
  if (cmd === 'art-direction') return cmdArtDirection(sub, parseArgs(args.slice(2)));
  if (cmd === 'schema') return cmdSchema(sub, parseArgs(args.slice(2)));
  if (cmd === 'grain') return cmdGrain(args.slice(1));
  if (cmd === 'stage') return cmdStage(sub, parseArgs(args.slice(2)));
  if (cmd === 'cue') return cmdCue(parseArgs(args.slice(1)));
  if (cmd === 'preflight') return cmdPreflight(parseArgs(args.slice(1)));
  if (cmd === 'composition') return cmdComposition(parseArgs(args.slice(1)));
  if (cmd === 'capture') return cmdCapture(parseArgs(args.slice(1)));
  if (cmd === 'optical') return cmdOptical(parseArgs(args.slice(1)));
  if (cmd === 'packet') return cmdPacket(parseArgs(args.slice(1)));
  if (cmd === 'proof') {
    const mode = args[1] === 'revision' ? 'revision' : undefined;
    return cmdProof(mode, parseArgs(args.slice(mode === undefined ? 1 : 2)));
  }
  if (cmd === 'source') return cmdSource(sub, parseArgs(args.slice(2)));
  if (cmd === 'evidence') {
    if (sub === 'v2') {
      const v2Mode = args[2];
      if (v2Mode !== 'finalize' && v2Mode !== 'check') return usage();
      return cmdEvidence(`v2-${v2Mode}`, parseArgs(args.slice(3)));
    }
    return cmdEvidence(sub, parseArgs(args.slice(2)));
  }
  if (cmd === 'observation') return cmdObservation(sub, parseArgs(args.slice(2)));
  if (cmd === 'attest') return cmdAttest(sub, parseArgs(args.slice(2)));
  if (cmd === 'intent') return cmdIntent(sub, parseArgs(args.slice(2)));
  if (cmd === 'domain') return cmdDomain(sub, parseArgs(args.slice(2)));
  if (cmd === 'craft-fidelity') return cmdCraftFidelity(sub, parseArgs(args.slice(2)));
  if (cmd === 'craft-capture') return cmdCraftCapture(parseArgs(args.slice(1)));
  if (cmd === 'craft-usage') return cmdCraftUsage(parseArgs(args.slice(1)));
  if (cmd === 'recipe') return cmdRecipe(sub, parseArgs(args.slice(2)));
  if (cmd === 'no-js') return cmdNoJs(parseArgs(args.slice(1)));
  if (cmd === 'award') return cmdAward(sub, parseArgs(args.slice(2)));
  if (cmd === 'tokens') return cmdTokens(sub, parseArgs(args.slice(2)));
  if (cmd === 'init') return cmdInit(parseArgs(args.slice(1)));
  if (cmd === 'depth') return cmdDepth(sub, parseArgs(args.slice(2)));
  if (cmd === 'deliberate') return cmdDeliberate(sub, parseArgs(args.slice(2)));
  if (cmd === 'compare') return cmdCompare(sub, parseArgs(args.slice(2)));
  if (cmd === 'acquisition') return cmdAcquisition(sub, parseArgs(args.slice(2)));
  if (cmd === 'brief') return cmdBrief(sub, parseArgs(args.slice(2)));
  if (cmd === 'route') return cmdRoute(sub, parseArgs(args.slice(2)));
  if (cmd === 'workflow') return cmdWorkflow(sub, parseArgs(args.slice(2)));
  if (cmd === 'status') return cmdStatus(parseArgs(args.slice(1)));
  if (cmd === 'clean') return cmdClean(parseArgs(args.slice(1)));
  if (cmd === 'stack') return cmdStack(parseArgs(args.slice(1)));
  if (cmd === 'text-slop') return cmdTextSlop(parseArgs(args.slice(1)));
  if (cmd === 'copy-specificity') return cmdCopySpecificity(parseArgs(args.slice(1)));
  if (cmd === 'judgment') return cmdJudgment(sub, parseArgs(args.slice(2)));
  if (cmd === 'first-render') return cmdFirstRender(sub, parseArgs(args.slice(2)));
  if (cmd === 'visual-richness') return cmdVisualRichness(parseArgs(args.slice(1)));
  if (cmd === 'pack') return cmdPack(sub, ...args.slice(2));
  if (cmd === 'doctor') return cmdDoctor();
  if (cmd === 'figma') {
    if (sub === 'pull') return cmdFigmaPull(args[2], parseArgs(args.slice(3)));
    if (sub === 'system') return cmdFigmaSystem(parseArgs(args.slice(2)));
    if (sub === 'diff') return cmdFigmaDiff(parseArgs(args.slice(2)));
    return usage();
  }

  if (cmd === 'target') {
    const opts = parseArgs(args.slice(2));
    if (sub === 'set') return cmdTargetSet(opts);
    if (sub === 'list') return cmdTargetList();
    if (sub === 'diff') return cmdTargetDiff(opts);
    return usage();
  }

  if (cmd === 'choose') return cmdChoose(parseArgs(args.slice(1)));

  if (cmd === 'decision') {
    const opts = parseArgs(args.slice(1));
    const what = opts._[0];
    const aiFields = [opts.aiAssetId, opts.prompt, opts.provider];
    if (!what || !opts.why || (aiFields.some((value) => value !== undefined) && aiFields.some((value) => !value))) {
      console.error('usage: omd decision "what" --why "why" [--ai-asset-id <id> --prompt <exact> --provider <exact>]\nA decision without a reason is not a decision.');
      process.exit(1);
    }
    const invocation = invocationFromActivation(opts, 'omd decision');
    const writer = projectWriter(invocation);
    const aiReference = opts.aiAssetId === undefined ? undefined : commitAiAssetDecision(process.cwd(), {
      decisionId: opts.aiAssetId, prompt: opts.prompt as string,
      provider: opts.provider as string, reason: opts.why,
    }, writer, invocation);
    const path = logDecision(process.cwd(), what, opts.why, writer);
    console.log(opts.json ? JSON.stringify({ path, aiAssetDecision: aiReference }) : path);
    process.exit(0);
  }

  if (cmd === 'taste' && sub === 'record') {
    const opts = parseArgs(args.slice(2));
    const subject = opts._[0];
    if (!subject || !opts.kind || !['selection', 'praise', 'rejection', 'overrule'].includes(opts.kind) || !opts.evidence) {
      throw new Error('usage: omd taste record "subject" --kind selection|praise|rejection|overrule --evidence "verbatim" --from-user');
    }
    console.log(logTaste(process.cwd(), {
      subject, kind: opts.kind as 'selection' | 'praise' | 'rejection' | 'overrule',
      evidence: opts.evidence, fromUser: opts.fromUser === true,
    }, projectWriterFromActivation(opts, 'omd taste record')));
    process.exit(0);
  }

  if (cmd === 'taste' && sub === 'profile') {
    const opts = parseArgs(args.slice(2));
    const { n, records } = tasteProfile(process.cwd(), opts.all);
    if (n === 0) console.log(opts.all ? 'No taste records yet.' : 'No explicit user taste recorded yet.');
    else {
      const lines = records.map((r) => {
        if (r.among && r.chose) {
          const over = r.among.filter((a) => a !== r.chose).join(',');
          return `  [${r.actor}] ${r.chose} over ${over}${r.why ? ` \u2014 ${r.why}` : ''}`;
        }
        return `  [${r.actor}] ${r.kind}: ${r.subject} \u2014 ${r.evidence}`;
      });
      console.log(`${n} taste records\n${lines.join('\n')}`);
    }
    process.exit(0);
  }

  return usage();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
