#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { accessSync, constants, existsSync, readFileSync, readdirSync, realpathSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { readFrame } from '../core/frame/index.ts';
import { writeFrameRecord, reframe, setGenerator, logDecision, logChoice, logTaste, tasteProfile } from '../core/frame/write.ts';
import { logRun, readHistory } from '../core/history/index.ts';
import { analyse } from '../core/coach/index.ts';
import { findLeakedRationale } from '../core/rules/leakage.ts';
import { checkAttribution } from '../core/rules/attribution.ts';
import { checkMotionSpec } from '../core/rules/motion-spec.ts';
import { discoverEvidence, generateDesignMd, validateDesignMd } from '../core/design/index.ts';
import { validateCopyDeck, validateCopyDeckV2, validateCopyDeckV2AgainstSelectedArtDirection, validateCopyReviewReport } from '../core/copy/index.ts';
import { checkInteractionStates } from '../core/design/interaction-states.ts';
import { checkFrameUx } from '../core/frame/check-ux.ts';
import { scanSlopSource } from '../core/slop/index.ts';
import { validateCompositionContract } from '../core/composition-contract/index.ts';
import { validateSourceSeal, writeSourceSeal } from '../core/source-seal/index.ts';
import { checkFinalEvidence } from '../core/evidence/final.ts';
import { checkTaskEvidence, publishTaskEvidence } from '../core/evidence/task.ts';
import { computeStack } from '../core/stack/index.ts';
import { scanTextSlop } from '../core/slop/text-slop.ts';
import { evaluateLighthouse, type LighthouseBudget } from '../core/perf/lighthouse.ts';
import { evaluateVisualRichness } from '../core/composition-contract/visual-richness.ts';
import type { VisualRichnessRegister } from '../core/composition-contract/visual-richness.ts';
import type { Category, EnergyCurve, Layer, RawIr, Violation } from '../core/types.ts';
import {
  ART_DIRECTION_POINTER_SCHEMA_VERSION,
  ART_DIRECTION_RECORD_SCHEMA_VERSION,
  artDirectionSha256,
  validateArtDirectionPointer,
  validateArtDirectionRecord,
} from '../core/art-direction/schema.ts';
import { beatBudgetForRegister, exceedsCanonicalBeatBudget, NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256, recipeDecisionProjectionSha256, resolveMarketingArtDirection, type ApprovedMotionRecipeReceipt, type ArtDirectionEligibility } from '../core/art-direction/decision.ts';
import { validateActivationContext } from '../core/runtime/activation.ts';
import { createLocalCliInvocation, requireCurrentIntentLedgerAuthorization, requireCurrentUserIntentEventAuthorization, requireEvaluatorAssessmentAuthorization, requireEvaluatorResultAuthorization, requireFinalEvidenceManifestAuthorization, requireFinalReviewerLaneAuthorization, requireStaticEvidenceResultAuthorization, requireStaticReviewReceiptAuthorization, validateCurrentProjectRun, type ProjectRunInvocation } from '../core/runtime/invocation.ts';
import { acquireProjectLock, createExternalObservationDirectory, createProjectWriteAdapter, replaceProjectFileAtomically, writeExternalObservationFile, writeImmutableProjectFile, type ExternalObservationKind, type ProjectWriteAdapter } from '../core/runtime/project-write.ts';
import { intentLedgerSha256, resolveCurrentUserBeatExceptionReceipt, serializeIntentLedger, validateIntentCurrentPointer, validateIntentLedger } from '../core/runtime/intent.ts';
import { validateDecisionBoundReferenceHandoffs, validateReferenceHandoffCurrentness } from '../core/ref/reference-handoff.ts';
import { parseReferenceSelectionV2, referenceSelectionV2Sha256, resolveMotionProjection, validateReferenceSelectionV2 } from '../core/ref/reference-selection.ts';
import { referenceUsageV2Sha256, validateReferenceUsage } from '../core/ref/reference-usage.ts';
import { canonicalJson, sha256 } from '../core/ref/board-artifacts.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Opts {
  _: string[];
  json?: boolean;
  ir?: string;
  layer?: string;
  out?: string;
  viewport?: string;
  problem?: string;
  reframe?: string;
  why?: string;
  category?: string;
  set?: string;
  chose?: string;
  to?: string;
  because?: string;
  as?: string;
  add?: string;
  noLog?: boolean;
  /** Skip the energy (motion) capture on `omd ref add` — one fewer browser launch for non-motion refs. */
  noEnergy?: boolean;
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
  kind?: string;
  evidence?: string;
  input?: string;
  activation?: string;
  /** Capture a full-resolution structural blueprint of the selected component. */
  blueprint?: boolean;
  /** Persist a scoped component screenshot alongside its blueprint (`omd ref add --selector … --shot`). */
  shot?: boolean;
  /** Directory of pages for cross-page site consistency check (`omd check --site <dir>`). */
  site?: string;
  /** Similarity threshold for `omd figma diff` / `omd target diff` (0–1, default 0.97). */
  threshold?: string;
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
  /** Task coverage matrix rows for product or mixed surfaces. (`omd frame set --task-matrix "T1 …"`) */
  taskMatrix?: string;
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
}

const FLAGS = new Set(['json', 'no-log', 'no-energy', 'image', 'filmstrip', 'squint', 'full-page', 'from-user', 'all', 'blueprint', 'shot', 'proofs', 'fresh', 'check', 'review-check', 'apply', 'dry-run']);
const ALIASES: Record<string, keyof Opts> = {
  o: 'out',
  'no-log': 'noLog',
  'no-energy': 'noEnergy',
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
  'dry-run': 'dryRun',
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
    else bag[key] = args[++i];
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
  if (keys.length !== sortedExpected.length || keys.some((key, index) => key !== sortedExpected[index])) evaluatorResultError(`${label} has unknown or missing keys`);
}
function parseClosedEvaluatorResult(value: unknown, alternativesSha256: string): ClosedEvaluatorResult {
  if (!isRecord(value)) evaluatorResultError('result must be an object');
  const result = value;
  const hasRecipe = Object.hasOwn(result, 'approvedMotionRecipe');
  if (hasRecipe !== Object.hasOwn(result, 'approvedMotionRecipeReceipt')) evaluatorResultError('approved recipe payload and receipt must be supplied together');
  exactKeys(result, hasRecipe
    ? ['alternativesSha256', 'approvedMotionRecipe', 'approvedMotionRecipeReceipt', 'motionResolution', 'winner']
    : ['alternativesSha256', 'motionResolution', 'winner'], 'result');
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

function invocationFromActivation(opts: Opts, command: string, projectRoot = process.cwd()): ProjectRunInvocation {
  return opts.activation
    ? validateProjectRunInvocation(inputJson(opts.activation, command))
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

async function cmdIr(opts: Opts): Promise<never> {
  const raw = await rawIrFor(opts, opts._[0]);
  const out = opts.out ?? join(process.cwd(), '.omd', '.cache', 'ir.json');
  const adapter = projectWriterFromActivation(opts, 'omd ir');
  adapter.write(relative(process.cwd(), resolve(out)), JSON.stringify(raw, null, 2));
  console.log(`${out}  (${raw.nodes.length} nodes, ${Object.keys(raw.tokens ?? {}).length} tokens)`);
  process.exit(0);
}

async function cmdRender(opts: Opts): Promise<never> {
  const { renderPage, renderProofs, renderFilmstrip, parseViewport } = await import('../core/render/index.ts');
  const target = opts._[0];
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
  if (!target) throw new Error('usage: omd probe <page> [--plan path] [--json] [--out path]');
  const { readProbePlan, runProbe, writeProbeResult } = await import('../core/probe/index.ts');
  const planPath = resolve(opts.plan ?? join(process.cwd(), '.omd', 'probes', 'primary.json'));
  if (!existsSync(planPath)) throw new Error(`probe plan not found: ${planPath}`);
  const result = await runProbe(target, readProbePlan(planPath));
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
      throw new Error('usage: omd craft checkpoint semantic|visual --render <path> --observed "..." --changed "..."');
    }
    console.log(recordCraft(process.cwd(), {
      phase, render: opts.render ?? '', observed: opts.observed ?? '', changed: opts.changed ?? '',
    }, projectWriterFromActivation(opts, 'omd craft checkpoint')));
    process.exit(0);
  }
  if (sub === 'status') {
    const records = readCraft(process.cwd());
    if (opts.json) process.stdout.write(JSON.stringify(records));
    else if (!records.length) console.log('No craft checkpoints recorded.');
    else for (const record of records) console.log(`${record.phase}: ${record.observed} -> ${record.changed} (${record.render})`);
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
  const violations = check(ir, rules, { ...(layers ? { layers } : {}), ...(categories ? { categories } : {}) });

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
    const refsDir = join(process.cwd(), '.omd', 'refs');
    const captureNames = existsSync(refsDir)
      ? readdirSync(refsDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
      : [];
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
 * The manifest is a JSON array of `{ source, as, selector?, blueprint?, shot?, fromUser?, viewport? }`.
 * Same per-reference result as `omd ref add`, minus the energy pass, at a fraction of the wall time.
 */
async function cmdRefAddBatch(opts: Opts): Promise<never> {
  const manifestPath = opts._[0];
  if (!manifestPath) {
    console.error('usage: omd ref add-batch <manifest.json>  (JSON array of { source, as, selector?, blueprint?, shot?, fromUser?, viewport? })');
    process.exit(1);
  }
  const { addRefsBatch } = await import('../core/ref/batch.ts');
  const specs = JSON.parse(readFileSync(resolve(manifestPath), 'utf8')) as import('../core/ref/batch.ts').RefSpec[];
  if (!Array.isArray(specs) || specs.length === 0) throw new Error('manifest must be a non-empty JSON array of reference specs');
  for (const s of specs) {
    if (!s || typeof s.source !== 'string' || typeof s.as !== 'string') {
      throw new Error('each manifest entry needs a string `source` and `as`');
    }
  }
  const result = await addRefsBatch(process.cwd(), specs, { rulesRoot: join(root, 'core', 'rules', 'builtin') }, projectWriterFromActivation(opts, 'omd ref add-batch'));
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

async function cmdRefAdd(opts: Opts): Promise<never> {
  const target = opts._[0];
  if (!target || !opts.as) {
    console.error('usage: omd ref add <url|file> --as <component> [--selector "css"] [--image]');
    process.exit(1);
  }
  if (opts.image && opts.selector) {
    console.error('--image and --selector cannot be used together: an image has no subtree to scope.');
    process.exit(1);
  }
  if (opts.blueprint && !opts.selector) {
    console.error('--blueprint requires --selector: a blueprint measures one component, not a whole page.');
    process.exit(1);
  }
  if (opts.shot && !opts.selector) {
    console.error('--shot requires --selector: a scoped screenshot captures one component, not a whole page.');
    process.exit(1);
  }
  const { saveRef } = await import('../core/ref/store.ts');
  const adapter = projectWriterFromActivation(opts, 'omd ref add');

  if (opts.image) {
    const path = saveRef(process.cwd(), {
      source: target,
      component: opts.as,
      kind: 'image',
      capturedAt: new Date().toISOString(),
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

  const raw = await rawIrFor(opts, target, opts.selector);
  const ir = normalize(raw);
  const invariants = extractInvariants(ir);

  const slopViolations = check(ir, loadRules(join(root, 'core', 'rules', 'builtin')), { categories: ['slop'] });
  const slopCount = slopViolations.length;
  const slopIds = [...new Set(slopViolations.map((v) => v.id))];

  // Energy curve: capture pixel-diff motion energy for the reference. Uses a second
  // Playwright session so the cost is one extra browser launch per `omd ref add`.
  // Sees ALL motion including GSAP/rAF — closing the getAnimations() blind spot.
  // Failure is silently ignored: a blocked page or unsupported format must not prevent
  // the reference from being saved.
  const { captureEnergy, parseViewport } = await import('../core/render/index.ts');
  const energyCurve = opts.noEnergy ? null : await captureEnergy(target, { viewport: parseViewport(opts.viewport) });

  // Blueprint: full-resolution structural snapshot with skin abstracted to color roles.
  // Only captured when --blueprint is passed together with --selector.
  let blueprint: import('../core/types.ts').Blueprint | undefined;
  if (opts.blueprint && opts.selector) {
    const { captureBlueprint } = await import('../core/ref/blueprint.ts');
    blueprint = captureBlueprint(raw.nodes, opts.selector);
    console.error(`blueprint: ${blueprint.nodes.length} nodes captured`);
  }

  // Scoped screenshot: pair the component's pixels with its blueprint/invariants on one
  // record so image-first art direction can seed from both (see core/theory/imagegen.md).
  // A render failure must not lose the reference — warn and continue.
  let imagePath: string | undefined;
  if (opts.shot && opts.selector) {
    const { renderElement } = await import('../core/render/index.ts');
    const { refImagePath } = await import('../core/ref/store.ts');
    const absShot = refImagePath(adapter.projectRoot, { source: target, component: opts.as });
    adapter.mkdir(relative(adapter.projectRoot, dirname(absShot)));
    try {
      await renderElement(target, { viewport: parseViewport(opts.viewport), selector: opts.selector, out: absShot, adapter });
      imagePath = relative(adapter.projectRoot, absShot);
      console.error(`shot: ${imagePath}`);
    } catch (err) {
      console.error(`shot skipped: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const path = saveRef(process.cwd(), {
    source: target,
    component: opts.as,
    kind: opts.selector ? 'component' : 'page',
    capturedAt: new Date().toISOString(),
    ...(opts.selector ? { selector: opts.selector } : {}),
    invariants,
    principles: [],
    slopCount,
    ...(opts.fromUser ? { origin: 'user' as const } : {}),
    ...(energyCurve !== null ? { energyCurve } : {}),
    ...(blueprint !== undefined ? { blueprint } : {}),
    ...(imagePath !== undefined ? { imagePath } : {}),
  }, adapter);
  console.log(path);
  console.log(JSON.stringify(invariants, null, 2));
  console.error(`slop findings: ${slopCount}${slopCount > 0 ? `  [${slopIds.join(', ')}]` : ''}`);

  const signal = designSignal(invariants);
  if (signal.score < LOW_SIGNAL) {
    console.error(
      `warning: low design signal (${signal.score} — missing: ${signal.missing.join(', ')}).\n`
      + 'This page makes almost no visual decisions; as a visual reference it teaches nothing.\n'
      + 'Keep it only as a content or anti-reference, and say so in its principles.',
    );
  }
  if (slopCount >= 2) {
    if (opts.fromUser) {
      console.error(
        `note: the reference you provided shows ${slopCount} slop signals (${slopIds.join(', ')}) — using it as a stated anti-reference.\n`
        + 'It is saved; mark its principles to document what to avoid.',
      );
    } else {
      console.error(
        `warning: ${slopCount} slop findings (${slopIds.join(', ')}) — this page reproduces patterns the tool exists to avoid.\n`
        + 'Board it only as an explicitly-stated anti-reference.',
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
  const ref = loadRefs(process.cwd()).find((r) => r.source === source && r.component === opts.as);
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

async function cmdRefList(): Promise<never> {
  const { loadRefs } = await import('../core/ref/store.ts');
  const { designSignal, LOW_SIGNAL } = await import('../core/ref/signal.ts');
  const { topKinshipPairs } = await import('../core/ref/distance.ts');
  const refs = loadRefs(process.cwd());
  if (refs.length === 0) {
    console.log('No references yet.');
    process.exit(0);
  }
  for (const ref of refs) {
    const granularity = ref.selector ? `[${ref.kind} ${ref.selector}]` : `[${ref.kind}]`;
    const userNote = ref.origin === 'user' ? '  [user]' : '';
    if (ref.kind === 'image' || ref.invariants === null) {
      console.log(`${ref.source}  ${ref.component}  ${granularity}${userNote}`);
      continue;
    }
    const inv = ref.invariants;
    const signal = designSignal(inv);
    const lowSignalNote = signal.score < LOW_SIGNAL ? `  [low-signal ${signal.score}]` : '';
    const slopNote = (ref.slopCount ?? 0) >= 2 ? `  [slop:${ref.slopCount}]` : '';
    console.log(
      `${ref.source}  ${ref.component}  ${granularity}  radius=[${inv.radiusLadder.join(',')}] `
      + `spacing=[${inv.spacingLadder.join(',')}] elevation=${inv.elevationLevels}${lowSignalNote}${slopNote}${userNote}`,
    );
  }

  const pairs = topKinshipPairs(refs);
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
  const { referenceSelectionExists, referenceSelectionV2Exists, validateReferenceSelection, validateReferenceSelectionV2 } = await import('../core/ref/reference-selection.ts');
  const manifest = boardPath(opts, 'omd ref check'); readReferenceBoardArtifacts(process.cwd(), manifest);
  if (referenceSelectionExists(process.cwd())) validateReferenceSelection(process.cwd(), manifest);
  if (referenceSelectionV2Exists(process.cwd())) validateReferenceSelectionV2(process.cwd(), manifest);
  if (opts.json) process.stdout.write('[]\n'); else console.log('ok');
  process.exit(0);
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

  const snapshot = JSON.parse(
    readFileSync(snapPath, 'utf8'),
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

  if (!fresh && existsSync(cachePath)) {
    if (!jsonOut) console.log(`Using cached export: ${cachePath}`);
  } else {
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

    adapter.write(relative(process.cwd(), cachePath), Buffer.from(await pngRes.arrayBuffer()));
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

  await renderPage(pageOrUrl, {
    viewport: { width: Math.round(frameW), height: Math.round(frameH) },
    out: renderPath,
    adapter,
  });

  // ── Step 3: pixel diff ────────────────────────────────────────────────────

  const { compareImages, formatDiffReport } = await import('../core/figma/diff.ts');
  const refBuf = readFileSync(cachePath);
  const buildBuf = readFileSync(renderPath);

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

/** Copy-deck or copy-eye report structure gates; neither judges prose quality or blindness. */
function cmdCopy(opts: Opts): never {
  const v2 = (opts._[0] === 'v2-check' && opts._.length === 1) || (opts._[0] === 'v2' && opts._[1] === 'check' && opts._.length === 2);
  if ((opts.check ? 1 : 0) + (opts.reviewCheck ? 1 : 0) + (v2 ? 1 : 0) !== 1) {
    throw new Error('usage: omd copy --check [--json] | omd copy --review-check [--json] | omd copy v2 check [--json]');
  }

  if (opts.reviewCheck) {
    const path = join(process.cwd(), '.omd', '.cache', 'copy-eye.md');
    const violations = validateCopyReviewReport(existsSync(path) ? readFileSync(path, 'utf8') : '');
    if (opts.json) process.stdout.write(JSON.stringify(violations));
    else {
      for (const violation of violations) console.log(`[error] ${violation.id} ${violation.path}: ${violation.message}`);
      if (violations.length === 0) console.log('ok — copy-eye.md passes report-structure checks only; blindness and semantic quality are not proven');
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

/** `omd composition --check [--json]` — structural/freshness gate for composition.md. */
function cmdComposition(opts: Opts): never {
  if (!opts.check) throw new Error('usage: omd composition --check [--json]');
  const direction = currentArtDirection(process.cwd());
  requireDecisionBoundHandoffs(process.cwd(), artDirectionSha256(direction));
  const findings = validateCompositionContract(process.cwd());
  if (opts.json) process.stdout.write(JSON.stringify(findings));
  else {
    for (const finding of findings) console.log(`[error] ${finding.id} ${finding.path}: ${finding.message}`);
    if (findings.length === 0) console.log('ok — composition.md passes structure and freshness checks');
  }
  process.exit(findings.length > 0 ? 1 : 0);
}

/** Final byte-freshness evidence only; this does not judge semantic copy/source fidelity. */
function cmdSource(mode: string | undefined, opts: Opts): never {
  const sourceRoot = resolve(opts._[0] ?? process.cwd());
  if (mode === '--seal') requireDecisionBoundHandoffs(sourceRoot, artDirectionSha256(currentArtDirection(sourceRoot)));
  if (mode === '--seal') {
    const path = writeSourceSeal(sourceRoot, invocationFromActivation(opts, 'omd source --seal', sourceRoot));
    if (opts.json) process.stdout.write(JSON.stringify({ path }));
    else console.log(path);
    process.exit(0);
  }
  if (mode === '--check') {
    const findings = validateSourceSeal(sourceRoot);
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
    return JSON.parse(readFileSync(resolve(path), 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`${command} could not read valid JSON from ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function inputJsonBytes(path: string, command: string): Buffer {
  try {
    return readFileSync(resolve(path));
  } catch (error) {
    throw new Error(`${command} could not read bytes from ${path}: ${error instanceof Error ? error.message : String(error)}`);
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

function requireDecisionBoundHandoffs(projectRoot: string, directionSha256: string): void {
  const handoffRoot = join(projectRoot, '.omd', 'reference-handoffs');
  const composerPath = join(handoffRoot, 'composer.json');
  const handPath = join(handoffRoot, 'hand.json');
  if (!existsSync(composerPath) || !existsSync(handPath)) {
    throw new Error('DECISION_BOUND_REFERENCE_HANDOFFS_REQUIRED: resolve art direction before composition, build, or finalization');
  }
  validateDecisionBoundReferenceHandoffs({
    composer: validateReferenceHandoffCurrentness(projectRoot, inputJson(composerPath, 'composer reference handoff')),
    hand: validateReferenceHandoffCurrentness(projectRoot, inputJson(handPath, 'hand reference handoff')),
  }, directionSha256);
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

async function cmdArtDirection(mode: string | undefined, opts: Opts): Promise<never> {
  if (mode !== 'check' || !opts.input || opts._.length > 0) {
    throw new Error('usage: omd art-direction check --input <decision-check.json> [--json]');
  }
  const payload = inputJson(opts.input, 'omd art-direction check');
  if (!isRecord(payload)) throw new Error('omd art-direction check input must contain host-authorized evaluator assessment and result payloads');
  const allowed = new Set(['alternatives', 'references', 'eligibility', 'evaluatorAssessment', 'evaluatorResult', 'beats', 'invocation', 'route', 'implementationLane', 'fallbackPath', 'performanceAccessibilityBudget']);
  if (Object.keys(payload).some((key) => !allowed.has(key))) throw new Error('ART_DIRECTION_CALLER_DECISION_FORBIDDEN: evaluator choices, scores, and motion sources must be inside the host-authorized evaluator bytes');
  const { alternatives, references, eligibility, evaluatorAssessment, evaluatorResult, beats, invocation, route, implementationLane, fallbackPath, performanceAccessibilityBudget } = payload;
  const run = validateProjectRunInvocation(invocation);
  if (evaluatorAssessment === undefined || evaluatorResult === undefined) throw new Error('ART_DIRECTION_EVALUATOR_AUTHORIZATION_REQUIRED: evaluator assessment and result payloads are required');
  const assessmentBytes = Buffer.from(canonicalJson(evaluatorAssessment));
  const resultBytes = Buffer.from(canonicalJson(evaluatorResult));
  requireEvaluatorAssessmentAuthorization(run, process.cwd(), assessmentBytes);
  requireEvaluatorResultAuthorization(run, process.cwd(), resultBytes);
  const closedResult = parseClosedEvaluatorResult(evaluatorResult, sha256(canonicalJson(alternatives)));
  if (!isRecord(evaluatorAssessment) || !Array.isArray(evaluatorAssessment.assessments)) evaluatorResultError('assessment must contain assessments');
  const assessments = evaluatorAssessment.assessments as { register?: unknown; score?: unknown }[];
  const winner = [...assessments].sort((left, right) => Number(right.score) - Number(left.score) || String(left.register).localeCompare(String(right.register)))[0];
  if (winner?.register !== closedResult.winner) evaluatorResultError('winner must match the host-authorized assessment ranking');
  const evaluatorEvidence = {
    invocationSha256: sha256(assessmentBytes),
    payloadSha256: sha256(assessmentBytes),
    resultSha256: sha256(resultBytes),
    assessments: evaluatorAssessment.assessments,
  };
  const evaluatorResultDigest = sha256(resultBytes);
  writeImmutableProjectFile({
    projectRoot: process.cwd(),
    relativePath: `.omd/evaluator-results/sha256-${evaluatorResultDigest}.json`,
    content: resultBytes,
    invocation: run,
  });

  const { INTENT_CURRENT_POINTER_SCHEMA_VERSION, INTENT_LEDGER_SCHEMA_VERSION, createEmptyIntentLedger, resolveCurrentUserIntent, resolveCurrentUserBeatExceptionReceipt } = await import('../core/runtime/intent.ts');
  const intentPointerPath = join(process.cwd(), '.omd', 'intent-current.json');
  let ledger = createEmptyIntentLedger();
  let intentSha256 = intentLedgerSha256(ledger);
  if (existsSync(intentPointerPath)) {
    const pointer = validateIntentCurrentPointer(inputJson(intentPointerPath, 'intent current pointer'));
    ledger = validateIntentLedger(inputJson(join(process.cwd(), '.omd', pointer.record), 'intent immutable record'));
    if (intentLedgerSha256(ledger) !== pointer.sha256) throw new Error('ART_DIRECTION_INTENT_STALE: current intent pointer does not match immutable ledger');
    intentSha256 = pointer.sha256;
    requireCurrentIntentLedgerAuthorization(run, process.cwd(), readFileSync(join(process.cwd(), '.omd', pointer.record)));
  } else {
    const record = `intent-runs/sha256-${intentSha256}.json`;
    writeImmutableProjectFile({ projectRoot: process.cwd(), relativePath: `.omd/${record}`, content: JSON.stringify(ledger, null, 2), invocation: run });
    replaceProjectFileAtomically({ projectRoot: process.cwd(), relativePath: '.omd/intent-current.json', content: JSON.stringify({ schemaVersion: INTENT_CURRENT_POINTER_SCHEMA_VERSION, record, sha256: intentSha256 }, null, 2), invocation: run });
  }
  const lock = resolveCurrentUserIntent(ledger);
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
  const selection = validateReferenceSelectionV2(process.cwd());
  const selectionSha256 = referenceSelectionV2Sha256(selection);
  const { persistMotionResolutionProjection, persistSettledReferenceSelection, motionResolutionProjectionSha256 } = await import('../core/ref/reference-selection.ts');
  const input = {
    activationSha256: artDirectionSha256(run.activation), intentSha256, boardSha256: selection.captureSha256,
    selectionSha256, route: typeof route === 'string' ? route : '', intent: lock, alternatives: alternatives as never,
    references: references as never, referenceBindings: { selection, handoff, canonicalSelectionSha256: selectionSha256, canonicalHandoffSha256: handoff.payloadSha256 },
    evaluatorEvidence: evaluatorEvidence as never, eligibility: resolvedEligibility, implementationLane: typeof implementationLane === 'string' ? implementationLane : '',
    fallbackPath: typeof fallbackPath === 'string' ? fallbackPath : '', performanceAccessibilityBudget: typeof performanceAccessibilityBudget === 'string' ? performanceAccessibilityBudget : '',
    beatExceptionReceiptSha256: resolveCurrentUserBeatExceptionReceipt(ledger),
  };
  if (!Array.isArray(beats) || !beats.every((beat) => typeof beat === 'string' && /^B-\d+$/.test(beat)) || new Set(beats).size !== beats.length) throw new Error('ART_DIRECTION_BEATS_INVALID: beats must be unique stable B-<number> IDs');
  const motionInput = {
    activationSha256: input.activationSha256,
    alternativesSha256: closedResult.alternativesSha256,
    handoffSha256: handoff.payloadSha256,
    evaluatorInvocationSha256: evaluatorEvidence.invocationSha256,
    evaluatorPayloadSha256: evaluatorEvidence.payloadSha256,
    evaluatorResultSha256: evaluatorEvidence.resultSha256,
    motionDecision: closedResult.motionResolution.motionDecision,
    slots: closedResult.motionResolution.slots,
    ...(closedResult.motionResolution.approvedRecipe === undefined ? {} : { approvedRecipe: closedResult.motionResolution.approvedRecipe }),
    selection,
  };
  const projectedMotion = resolveMotionProjection(motionInput);
  const checked = resolveMarketingArtDirection({ ...input, motionResolution: projectedMotion });
  const currentBeatExceptionReceipt = resolveCurrentUserBeatExceptionReceipt(ledger) ?? NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256;
  if (checked.currentUserBeatExceptionReceiptSha256 !== currentBeatExceptionReceipt) {
    throw new Error('ART_DIRECTION_BEAT_EXCEPTION_STALE: decision must bind the resolved current-user Beat-exception receipt');
  }
  if (exceedsCanonicalBeatBudget(checked.selectedRegister, beats, currentBeatExceptionReceipt)) {
    throw new Error(`ART_DIRECTION_BEAT_BUDGET_EXCEEDED: ${checked.selectedRegister} permits at most ${beatBudgetForRegister(checked.selectedRegister)} Beats without an exact current-user host-authorized Beat-exception receipt`);
  }
  const motion = persistMotionResolutionProjection(process.cwd(), motionInput, { assessmentBytes, resultBytes, ...(recipeBytes === undefined ? {} : { approvedRecipeBytes: recipeBytes }) }, run);
  const settledSelection = persistSettledReferenceSelection(process.cwd(), selection, { ...motion.projection, selection }, run);
  const settledMotionResolutionSha256 = motionResolutionProjectionSha256(motion.projection);
  if (checked.motionResolutionProjectionSha256 !== settledMotionResolutionSha256 || checked.settledSelectionSha256 !== referenceSelectionV2Sha256(settledSelection)) {
    throw new Error('ART_DIRECTION_MOTION_SETTLEMENT_STALE: decision must bind the persisted motion settlement');
  }
  const activationSha256 = artDirectionSha256(run.activation);
  if (checked.intentSha256 !== intentSha256 || checked.activationSha256 !== activationSha256) throw new Error('ART_DIRECTION_RUNTIME_BINDING_STALE: decision must bind the current immutable intent ledger and activation');
  if ((lock.register !== undefined && checked.selectedRegister !== lock.register) || (lock.motionDecision !== undefined && checked.motionDecision !== lock.motionDecision)) throw new Error('ART_DIRECTION_INTENT_LOCK_VIOLATION: decision ignores a current-user register or motion lock');
  if (handoff.role !== 'art-direction' || handoff.preSelectionSha256 !== checked.preSelectionSha256 || handoff.captureSha256 !== checked.boardSha256) throw new Error('ART_DIRECTION_REFERENCE_HANDOFF_STALE: decision must bind the current canonical v2 art-direction handoff');
  const record = { schemaVersion: ART_DIRECTION_RECORD_SCHEMA_VERSION, decision: checked, decisionSha256: artDirectionSha256(checked), referenceHandoffSha256: handoff.payloadSha256, intentLedgerSha256: intentSha256, activationSha256, beatIds: beats };
  const digest = artDirectionSha256(record);
  const recordPath = `art-direction-runs/sha256-${digest}.json`;
  writeImmutableProjectFile({ projectRoot: process.cwd(), relativePath: `.omd/${recordPath}`, content: JSON.stringify(record, null, 2), invocation: run });
  const pointer = { schemaVersion: ART_DIRECTION_POINTER_SCHEMA_VERSION, record: recordPath, sha256: digest };
  const path = replaceProjectFileAtomically({ projectRoot: process.cwd(), relativePath: '.omd/art-direction.json', content: JSON.stringify(pointer, null, 2), invocation: run });
  const { writeReferenceHandoffReceipt } = await import('../core/ref/reference-handoff.ts');
  const settlement = { motionResolutionProjectionSha256: settledMotionResolutionSha256, settledSelectionSha256: referenceSelectionV2Sha256(settledSelection), settledSelection };
  const composerHandoff = writeReferenceHandoffReceipt(process.cwd(), 'composer', run, digest, settlement);
  const handHandoff = writeReferenceHandoffReceipt(process.cwd(), 'hand', run, digest, settlement);
  if (opts.json) process.stdout.write(JSON.stringify({ path, record: recordPath, sha256: digest, motionResolution: motion.path, composerHandoff, handHandoff }));
  else console.log(path);
  process.exit(0);
}
function captureReceipt(path: string) {
  const bytes = readFileSync(path);
  return { path, sha256: createHash('sha256').update(bytes).digest('hex') };
}
async function renderedBeatProof(target: string, beatIds: readonly string[], artDirectionHash: string, adapter: ProjectWriteAdapter, out: string) {
  const copyDeck = readFileSync(join(process.cwd(), '.omd', 'copy-deck.md'));
  const copyDeckSha256 = createHash('sha256').update(copyDeck).digest('hex');
  const { captureRenderedBeatReceipt } = await import('../core/render/index.ts');
  const proof = await captureRenderedBeatReceipt(target, { adapter, out, artDirectionHash, copyDeckSha256, beatIds });
  const { validatePostRenderBeatProof } = await import('../core/copy/index.ts');
  const violations = validatePostRenderBeatProof(copyDeck.toString('utf8'), proof, { beatIds });
  if (violations.length > 0) throw new Error(`RENDERED_BEAT_PROOF_REQUIRED: ${violations.map((violation) => violation.message).join(' ')}`);
  return proof;
}

async function cmdStaticEvidenceCapture(opts: Opts): Promise<never> {
  if (!opts.input || opts._.length > 0) throw new Error('usage: omd evidence static-capture --input <static-capture.json> [--json]');
  const payload = inputJson(opts.input, 'omd evidence static-capture');
  if (!isRecord(payload) || typeof payload.target !== 'string' || typeof payload.outDir !== 'string' || typeof payload.runId !== 'string') throw new Error('static capture input requires target, outDir, runId, and invocation');
  const { target, outDir: requestedOutDir, runId } = payload;
  const run = validateProjectRunInvocation(payload.invocation);
  const direction = currentArtDirection(process.cwd());
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
  const beatReceipt = await renderedBeatProof(target, direction.beatIds, artDirectionSha256(direction), adapter, join(relativeOut, `${runId}-rendered-beats.json`));
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
  const observedSha256 = createHash('sha256').update(JSON.stringify([
    observations.desktop.capture.sha256, observations.mobile.capture.sha256,
    ...observations.temporalSamples.desktop.map((capture) => capture.sha256),
    ...observations.temporalSamples.mobile.map((capture) => capture.sha256),
  ])).digest('hex');
  const captureRecord = {
    schema: 'static-direction-capture-v1' as const,
    artDirectionHash: artDirectionSha256(direction),
    motionDecision: 'none' as const,
    expected: {
      artDirectionHash: artDirectionSha256(direction), selectionSha256: direction.decision.settledSelectionSha256,
      handoffSha256: direction.referenceHandoffSha256, buildHash: run.activation.buildSha256, runId: payload.runId,
    },
    observed: {
      runId: payload.runId, buildHash: run.activation.buildSha256,
      selectionSha256: direction.decision.settledSelectionSha256, handoffSha256: direction.referenceHandoffSha256, observedSha256,
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
  await renderedBeatProof(payload.target, direction.beatIds, artDirectionSha256(direction), adapter, join(relativeOut, `${payload.runId}-rendered-beats.json`));
  const { captureMotionEvidenceV2, parseViewport } = await import('../core/render/index.ts');
  const evidence = await captureMotionEvidenceV2(payload.target, {
    viewport: typeof payload.viewport === 'string' ? parseViewport(payload.viewport) : { width: 390, height: 844 },
    outDir, runId: payload.runId, buildHash: run.activation.buildSha256, artDirectionHash: artDirectionSha256(direction),
    sourceInfluence, selector: payload.selector, trigger: 'load', adapter,
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
  const evidence = mode === 'static-check' && isRecord(input) && isRecord(input.capture)
    ? { ...input.capture, schema: 'static-direction-evidence-v1', reviewReceipts: input.reviewReceipts }
    : input;
  if (!isRecord(evidence) || evidence.artDirectionHash !== artDirectionSha256(direction)) throw new Error('DIRECTION_EVIDENCE_STALE: evidence does not bind the current immutable art direction');
  if (mode === 'static-check' && run === undefined) throw new Error('STATIC_EVIDENCE_REVIEW_AUTHORIZATION_REQUIRED: a fresh host invocation is required');
  if (mode === 'static-check') requireStaticEvidenceResultAuthorization(run!, process.cwd(), Buffer.from(canonicalJson(evidence)));
  if (mode === 'static-check') {
    if (direction.decision.motionDecision !== 'none') throw new Error('STATIC_EVIDENCE_DIRECTION_MISMATCH');
    const { validatePostRenderBeatProof } = await import('../core/copy/index.ts');
    const beatViolations = validatePostRenderBeatProof(readFileSync(join(process.cwd(), '.omd', 'copy-deck.md'), 'utf8'), evidence.beatReceipt as import('../core/copy/index.ts').RenderedBeatProof, { beatIds: direction.beatIds });
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
      runId: run!.activation.buildSha256,
      observationRoot: process.cwd(),
      invocation: run!,
    });
  } else {
    if (direction.decision.motionDecision !== 'one') throw new Error('MOTION_EVIDENCE_DIRECTION_MISMATCH');
    const { validateMotionEvidenceV2 } = await import('../core/render/index.ts');
    validateMotionEvidenceV2(evidence, { motionDecision: 'one' });
  }
  if (opts.json) process.stdout.write(JSON.stringify(mode === 'static-check' ? evidence : { ok: true })); else console.log('ok — observed evidence is path-backed and matches the current art direction');
  process.exit(0);
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
    if (!opts.input || !opts.activation || opts._.length > 0) throw new Error('usage: omd evidence v2 finalize --input <manifest.json> --activation <host-issued-invocation.json> [--json]');
    const { publishFinalEvidenceV2 } = await import('../core/evidence/final-v2.ts');
    const invocation = validateProjectRunInvocation(inputJson(opts.activation, 'omd evidence v2 finalize activation'));
    const manifestBytes = inputJsonBytes(opts.input, 'omd evidence v2 finalize');
    requireFinalEvidenceManifestAuthorization(invocation, process.cwd(), manifestBytes);
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as unknown;
    if (!isRecord(manifest) || !isRecord(manifest.graph)) throw new Error('FINAL_REVIEWER_LANE_AUTHORIZATION_REQUIRED: final graph is required');
    for (const lane of ['blindLane', 'fidelityLane', 'protocolLane']) {
      const descriptor = manifest.graph[lane];
      if (!isRecord(descriptor) || typeof descriptor.path !== 'string') throw new Error(`FINAL_REVIEWER_LANE_AUTHORIZATION_REQUIRED: ${lane} receipt is required`);
      const path = resolve(process.cwd(), descriptor.path);
      if (relative(process.cwd(), path).startsWith('..')) throw new Error(`FINAL_REVIEWER_LANE_AUTHORIZATION_REQUIRED: ${lane} path must remain inside the project`);
      requireFinalReviewerLaneAuthorization(invocation, process.cwd(), readFileSync(path));
    }
    const intentPointer = validateIntentCurrentPointer(inputJson(join(process.cwd(), '.omd', 'intent-current.json'), 'final current intent pointer'));
    requireCurrentIntentLedgerAuthorization(invocation, process.cwd(), readFileSync(join(process.cwd(), '.omd', intentPointer.record)));
    if (isRecord(manifest.staticEvidence) && typeof manifest.staticEvidence.path === 'string') requireStaticEvidenceResultAuthorization(invocation, process.cwd(), readFileSync(resolve(process.cwd(), manifest.staticEvidence.path)));
    const path = publishFinalEvidenceV2(process.cwd(), manifest, invocation);
    if (opts.json) process.stdout.write(JSON.stringify({ path }));
    else console.log(path);
    process.exit(0);
  }
  if (mode === 'v2-check') {
    if (!opts.activation || opts._.length > 0) throw new Error('usage: omd evidence v2 check --activation <host-issued-invocation.json> [--json]');
    const { checkFinalEvidenceV2 } = await import('../core/evidence/final-v2.ts');
    const invocation = validateProjectRunInvocation(inputJson(opts.activation, 'omd evidence v2 check activation'));
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
    const intentPointer = validateIntentCurrentPointer(inputJson(join(process.cwd(), '.omd', 'intent-current.json'), 'final current intent pointer'));
    requireCurrentIntentLedgerAuthorization(invocation, process.cwd(), readFileSync(join(process.cwd(), '.omd', intentPointer.record)));
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

async function cmdDoctor(): Promise<never> {
  let allPass = true;

  function report(label: string, pass: boolean, detail?: string): void {
    console.log(`${pass ? 'pass' : 'fail'}  ${label}${detail ? `  (${detail})` : ''}`);
    if (!pass) allPass = false;
  }

  // Node version: package.json engines requires >=22.18
  const parts = process.versions.node.split('.').map(Number);
  const [major = 0, minor = 0] = parts;
  const nodeOk = major > 22 || (major === 22 && minor >= 18);
  report('node >=22.18', nodeOk, process.versions.node);

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
    const target = join(packsRoot, sub, ...rest);
    if (!existsSync(target)) {
      console.error(`pack file not found: ${target}`);
      process.exit(1);
    }
    process.stdout.write(readFileSync(target, 'utf8'));
    process.exit(0);
  }

  console.error('usage: omd pack dir | list | <relpath>');
  process.exit(1);
}

function cmdSlop(sub: string | undefined, opts: Opts): never {
  if (sub !== 'scan') throw new Error('usage: omd slop scan [root] [--json]');
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
  }
  process.exit(0);
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
    + '  stack [--json]                              deterministic stack routing (blank greenfield -> plain HTML/CSS/JS)\n'
    + '  coach                                        trends across `omd check` history\n'
    + '  usage [--json]                              this run\'s elapsed time + token total (host session log)\n'
    + '\n'
    + '  frame show\n'
    + '  frame set --problem P --reframe R --why EVIDENCE\n'
    + '            [--task T --frequent-action A --costliest-error E --surface S --task-matrix "T1 …"]\n'
    + '  frame reframe --to "..." --because "what the render revealed"\n'
    + '  frame generator --set "metaphor"\n'
    + '\n'
    + '  choose c1 c2 c3 --chose c3 --why "..."\n'
    + '  decision "what" --why "why"\n'
    + '  taste record "subject" --kind selection|praise|rejection|overrule --evidence "verbatim" --from-user\n'
    + '  taste profile [--all]\n'
    + '  config set checkpoint none|concept|structure|both | config show\n'
    + '  craft checkpoint semantic|visual --render P --observed "..." --changed "..."\n'
    + '  craft status [--json]\n'
    + '\n'
    + '  ref add <url|file> --as <component> [--selector "css"] [--image] [--blueprint]\n'
    + '                                                render, extract invariants, save\n'
    + '  ref add ... --selector ".nav" --blueprint     also capture a component blueprint\n'
    + '  ref add ... --selector ".nav" --blueprint --shot  also save the component screenshot beside its blueprint\n'
    + '  ref add-batch <manifest.json>               capture many references in parallel over one browser\n'
    + '  ref list                                    one line per saved reference\n'
    + '  ref distance <page>                         compare a page to every saved reference\n'
    + '  ref principles <source> --as C --add "..."   record why a reference works\n'
    + '  ref show <source> --as C                    invariants + principles\n'
    + '  ref check [manifest] [--json]               validate board evidence and any saved selection\n'
    + '  ref v2-check --input handoff.json [--json]  validate the canonical v2 reference handoff\n'
    + '  ref import-image <input.json> [--json]      save a provenance-bound image fragment\n'
    + '  ref candidates [manifest]                   print chat-ready Korean-first candidate Markdown\n'
    + '  ref select <candidate-id> [--json]          bind a closed candidate selection to its evidence\n'
    + '  ref audit [--json]                          warn when references were captured sequentially (use ref add-batch)\n'
    + '\n'
    + '  design                                       discover evidence and create/refresh .omd/design.md\n'
    + '  design --check                              validate design.md section coverage\n'
    + '  copy --check [--json]                       validate required copy deck structure and fact refs\n'
    + '  copy --review-check [--json]                validate copy-eye report structure only (not blindness)\n'
    + '  copy v2 check [--json]                      validate selected register and stable v2 Beat IDs\n'
    + '  composition --check [--json]                validate composition sections and input freshness\n'
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
    + '  art-direction check --input decision-check.json [--json]  persist the canonical selected direction before composition\n'
    + '  intent append --input trusted-intent.json [--json]  append trusted intent and update its guarded current pointer\n'
    + '  preflight --input activation-context.json [--json]  read-only activation validation\n'
    + '  text-slop [file] [--json]                   advisory AI-cliche scan of copy (default .omd/copy-deck.md)\n'
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

  if (cmd === 'ir') return cmdIr(parseArgs(args.slice(1)));
  if (cmd === 'render') return cmdRender(parseArgs(args.slice(1)));
  if (cmd === 'probe') return cmdProbe(parseArgs(args.slice(1)));
  if (cmd === 'check') return cmdCheck(parseArgs(args.slice(1)));
  if (cmd === 'slop') return cmdSlop(sub, parseArgs(args.slice(2)));
  if (cmd === 'lighthouse') return cmdLighthouse(parseArgs(args.slice(1)));
  if (cmd === 'coach') return cmdCoach();
  if (cmd === 'usage') return cmdUsage(parseArgs(args.slice(1)));
  if (cmd === 'config') return cmdConfig(sub, parseArgs(args.slice(2)));
  if (cmd === 'craft') return cmdCraft(sub, parseArgs(args.slice(2)));

  if (cmd === 'frame') {
    const opts = parseArgs(args.slice(2));
    if (sub === 'show') return cmdFrameShow();

    if (sub === 'set') {
      const path = writeFrameRecord(process.cwd(), {
        problem: opts.problem ?? '',
        reframe: opts.reframe ?? '',
        ...(opts.why ? { why: opts.why } : {}),
        ...(opts.task ? { uxTask: opts.task } : {}),
        ...(opts.frequentAction ? { uxFrequentAction: opts.frequentAction } : {}),
        ...(opts.costliestError ? { uxCostliestError: opts.costliestError } : {}),
        ...(opts.surface ? { uxSurface: opts.surface } : {}),
        ...(opts.taskMatrix ? { taskCoverageMatrix: opts.taskMatrix } : {}),
      }, projectWriterFromActivation(opts, 'omd frame set'));
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
    const opts = parseArgs(args.slice(2));
    if (sub === 'add') return cmdRefAdd(opts);
    if (sub === 'add-batch') return cmdRefAddBatch(opts);
    if (sub === 'list') return cmdRefList();
    if (sub === 'distance') return cmdRefDistance(opts);
    if (sub === 'principles') return cmdRefPrinciples(opts);
    if (sub === 'show') return cmdRefShow(opts);
    if (sub === 'check') return cmdRefCheck(opts);
    if (sub === 'v2-check') return cmdRefV2Check(opts);
    if (sub === 'v2' && args[2] === 'check') return cmdRefV2Check(parseArgs(args.slice(3)));
    if (sub === 'usage') return cmdRefUsage(opts);
    if (sub === 'usage-check') return cmdRefUsageCheck(opts);
    if (sub === 'import-image') return cmdRefImportImage(opts);
    if (sub === 'candidates') return cmdRefCandidates(opts);
    if (sub === 'select') return cmdRefSelect(opts);
    if (sub === 'audit') return cmdRefAudit(opts);
    return usage();
  }

  if (cmd === 'design') return cmdDesign(parseArgs(args.slice(1)));
  if (cmd === 'copy') return cmdCopy(parseArgs(args.slice(1)));
  if (cmd === 'art-direction') return cmdArtDirection(sub, parseArgs(args.slice(2)));
  if (cmd === 'preflight') return cmdPreflight(parseArgs(args.slice(1)));
  if (cmd === 'composition') return cmdComposition(parseArgs(args.slice(1)));
  if (cmd === 'source') return cmdSource(sub, parseArgs(args.slice(2)));
  if (cmd === 'evidence') {
    if (sub === 'v2') {
      const v2Mode = args[2];
      if (v2Mode !== 'finalize' && v2Mode !== 'check') return usage();
      return cmdEvidence(`v2-${v2Mode}`, parseArgs(args.slice(3)));
    }
    return cmdEvidence(sub, parseArgs(args.slice(2)));
  }
  if (cmd === 'intent') return cmdIntent(sub, parseArgs(args.slice(2)));
  if (cmd === 'stack') return cmdStack(parseArgs(args.slice(1)));
  if (cmd === 'text-slop') return cmdTextSlop(parseArgs(args.slice(1)));
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
    if (!what || !opts.why) {
      console.error('usage: omd decision "what" --why "why"\nA decision without a reason is not a decision.');
      process.exit(1);
    }
    console.log(logDecision(process.cwd(), what, opts.why, projectWriterFromActivation(opts, 'omd decision')));
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
