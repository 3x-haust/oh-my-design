import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateActivationContext } from '../../core/runtime/activation.ts';
import { createLocalCliInvocation, validateCurrentProjectRun, type ProjectRunInvocation } from '../../core/runtime/invocation.ts';
import { createProjectWriteAdapter, type ProjectWriteAdapter } from '../../core/runtime/project-write.ts';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CLI_PATH = join(ROOT, 'bin', 'omd.ts');
let nativePiInvocation: ProjectRunInvocation | undefined;
let nativePiProjectRoot: string | undefined;

export interface Opts {
  _: string[];
  refresh?: boolean;
  recovery?: boolean;
  json?: boolean;
  sites?: string;
  consent?: boolean;
  userAnswer?: string;
  engine?: string;
  browser?: string;
  ir?: string;
  layer?: string;
  out?: string;
  output?: string;
  agent?: string;
  candidate?: string;
  iteration?: string;
  stack?: string;
  viewport?: string;
  checkpoint?: string;
  offset?: string;
  limit?: string;
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
  contentSelector?: string;
  text?: string;
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
  judgment?: string | string[];
  brief?: string;
  role?: string;
  mode?: string;
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
  /** Optional native view-state input for a translated feedback destination. */
  state?: string;
  /** Lighthouse report path for `omd award score --lighthouse <report.json>`. */
  lighthouse?: string;
  /** Reference directory for `omd craft-usage` (default `<cwd>/.omd/refs`). */
  refs?: string;
  /** Task coverage matrix rows for product or mixed surfaces. (`omd frame set --task-matrix "T1 …"`) */
  taskMatrix?: string;
  reality?: string;
  entrySurface?: string;
  entry?: string;
  scope?: string;
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
  current?: boolean;
  gate?: boolean;
  publish?: boolean;
  purpose?: string;
}

const FLAGS = new Set(['current', 'json', 'no-log', 'no-energy', 'no-shot', 'image', 'filmstrip', 'squint', 'full-page', 'from-user', 'all', 'blueprint', 'shot', 'proofs', 'fresh', 'check', 'refresh', 'recovery', 'review-check', 'apply', 'dry-run', 'cache', 'stale-records', 'files', 'selected', 'gate', 'publish', 'consent']);

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
  'user-answer': 'userAnswer',
  'content-selector': 'contentSelector',
};

export function parseArgs(args: string[]): Opts {
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateProjectRunInvocation(value: unknown): ProjectRunInvocation {
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

export function projectWriter(invocation: ProjectRunInvocation, projectRoot = process.cwd()): ProjectWriteAdapter {
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

export function invocationFromActivation(opts: Opts, command: string, projectRoot = process.cwd()): ProjectRunInvocation {
  const activationPath = activationInputPath(opts);
  if (nativePiInvocation !== undefined) {
    if (activationPath !== undefined || realpathSync(projectRoot) !== nativePiProjectRoot) {
      throw new Error('NATIVE_PI_AUTHORITY: external activation or another project cannot replace this command identity');
    }
    return nativePiInvocation;
  }
  return activationPath !== undefined
    ? validateProjectRunInvocation(inputJson(activationPath, command))
    : createLocalCliInvocation({
      cliPath: CLI_PATH,
      argv: process.argv.slice(2),
      brief: command,
      projectRoot,
    });
}

export function projectWriterFromActivation(opts: Opts, command: string, projectRoot = process.cwd()): ProjectWriteAdapter {
  return projectWriter(invocationFromActivation(opts, command, projectRoot), projectRoot);
}

export function ensureProjectParent(adapter: ProjectWriteAdapter, target: string): void {
  const parent = realpathSync(dirname(resolve(target)));
  if (parent !== adapter.projectRoot) adapter.mkdir(relative(adapter.projectRoot, parent));
}

export function inputJson(path: string, command: string): unknown {
  try {
    return JSON.parse(readFileSync(path === '-' ? 0 : resolve(path), 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`${command} could not read valid JSON from ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function currentNativePiInvocation(): ProjectRunInvocation | undefined {
  return nativePiInvocation;
}

export async function bootstrapNativeArgs(argv: string[]): Promise<string[]> {
  let args = [...argv];
  const nativeFlags = args.flatMap((arg, index) => arg === '--pi-command' || arg.startsWith('--pi-command=') ? [index] : []);
  if (nativeFlags.length === 0) return args;
  const index = nativeFlags[0];
  const descriptorPath = index === undefined ? undefined : args[index + 1];
  if (nativeFlags.length !== 1 || index === undefined || index !== args.length - 2
    || args[index] !== '--pi-command' || !descriptorPath || descriptorPath.startsWith('--')
    || args.includes('--activation') || process.env.OMD_ACTIVATION_PATH !== undefined) {
    throw new Error('NATIVE_PI_AUTHORITY: expected one native command descriptor and no external activation');
  }
  const { createNativePiInvocation } = await import('../../core/runtime/native-pi-run.ts');
  nativePiProjectRoot = realpathSync(process.cwd());
  nativePiInvocation = createNativePiInvocation({ projectRoot: nativePiProjectRoot,
    descriptorPath, cliPath: CLI_PATH, argv: process.argv });
  args = args.slice(0, index);
  return args;
}
