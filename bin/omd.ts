#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
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
import { validateCopyDeck, validateCopyReviewReport } from '../core/copy/index.ts';
import { checkInteractionStates } from '../core/design/interaction-states.ts';
import { checkFrameUx } from '../core/frame/check-ux.ts';
import { scanSlopSource } from '../core/slop/index.ts';
import { validateCompositionContract } from '../core/composition-contract/index.ts';
import { validateSourceSeal, writeSourceSeal } from '../core/source-seal/index.ts';
import type { Category, EnergyCurve, Layer, RawIr, Violation } from '../core/types.ts';

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
  /** Capture a full-resolution structural blueprint of the selected component. */
  blueprint?: boolean;
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
}

const FLAGS = new Set(['json', 'no-log', 'image', 'filmstrip', 'squint', 'full-page', 'from-user', 'all', 'blueprint', 'fresh', 'check', 'review-check']);
const ALIASES: Record<string, keyof Opts> = {
  o: 'out',
  'no-log': 'noLog',
  'from-user': 'fromUser',
  'full-page': 'fullPage',
  'frequent-action': 'frequentAction',
  'costliest-error': 'costliestError',
  'review-check': 'reviewCheck',
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
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, JSON.stringify(raw, null, 2));
  console.log(`${out}  (${raw.nodes.length} nodes, ${Object.keys(raw.tokens ?? {}).length} tokens)`);
  process.exit(0);
}

async function cmdRender(opts: Opts): Promise<never> {
  const { renderPage, renderFilmstrip, parseViewport } = await import('../core/render/index.ts');
  const target = opts._[0];
  if (!target) usage();

  if (opts.filmstrip) {
    // Filmstrip: 4–6 viewport screenshots at ~300ms intervals, plus an HTML index.
    // The HTML index is the deliverable: eye reads it to see what appeared when.
    const out = opts.out ?? 'filmstrip.html';
    mkdirSync(dirname(resolve(out)), { recursive: true });
    const frames = await renderFilmstrip(target, { viewport: parseViewport(opts.viewport), out });
    // Report the index path (sans extension already included) alongside the frame count.
    const indexPath = out.endsWith('.html') || out.endsWith('.htm') ? out : `${out}.html`;
    console.log(`${indexPath}  (${frames.length} frames)`);
    process.exit(0);
  }

  const out = opts.out ?? 'shot.png';
  mkdirSync(dirname(resolve(out)), { recursive: true });
  await renderPage(target, {
    viewport: parseViewport(opts.viewport), out,
    ...(opts.squint ? { squint: true } : {}),
    ...(opts.fullPage ? { fullPage: true } : {}),
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
  writeProbeResult(out, result);
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
    console.log(setCheckpoint(process.cwd(), opts._[1]));
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
    }));
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
    logRun(process.cwd(), page, combined);
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
  const path = logChoice(process.cwd(), { among, chose: opts.chose, why: opts.why });
  console.log(`${path}  (${tasteProfile(process.cwd(), true).n} choices recorded)`);
  process.exit(0);
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
  const { saveRef } = await import('../core/ref/store.ts');

  if (opts.image) {
    const path = saveRef(process.cwd(), {
      source: target,
      component: opts.as,
      kind: 'image',
      capturedAt: new Date().toISOString(),
      invariants: null,
      principles: [],
      ...(opts.fromUser ? { origin: 'user' as const } : {}),
    });
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
  const energyCurve = await captureEnergy(target, { viewport: parseViewport(opts.viewport) });

  // Blueprint: full-resolution structural snapshot with skin abstracted to color roles.
  // Only captured when --blueprint is passed together with --selector.
  let blueprint: import('../core/types.ts').Blueprint | undefined;
  if (opts.blueprint && opts.selector) {
    const { captureBlueprint } = await import('../core/ref/blueprint.ts');
    blueprint = captureBlueprint(raw.nodes, opts.selector);
    console.error(`blueprint: ${blueprint.nodes.length} nodes captured`);
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
  });
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
  addPrinciples(process.cwd(), source, opts.as, [opts.add]);
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
    process.exit(1);
  }
  process.exit(0);
}

// ── Figma commands ────────────────────────────────────────────────────────────

async function cmdFigmaPull(url: string | undefined): Promise<never> {
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
  mkdirSync(outDir, { recursive: true });
  const snapPath = join(outDir, 'snapshot.json');
  writeFileSync(snapPath, JSON.stringify(snapshot, null, 2));

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

async function cmdFigmaSystem(): Promise<never> {
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
  writeFileSync(cssPath, css);
  writeFileSync(mdPath, md);

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

    mkdirSync(exportsDir, { recursive: true });
    writeFileSync(cachePath, Buffer.from(await pngRes.arrayBuffer()));
    if (!jsonOut) console.log(`Exported: ${cachePath}`);
  }

  // ── Step 2: render build at exact frame dimensions ────────────────────────

  if (!jsonOut) {
    console.log(`Rendering ${pageOrUrl} at ${Math.round(frameW)}×${Math.round(frameH)} …`);
  }

  const { renderPage } = await import('../core/render/index.ts');
  const rendersDir = join(process.cwd(), '.omd', 'figma', 'renders');
  mkdirSync(rendersDir, { recursive: true });
  const renderPath = join(rendersDir, `${safeId}.png`);

  await renderPage(pageOrUrl, {
    viewport: { width: Math.round(frameW), height: Math.round(frameH) },
    out: renderPath,
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
  mkdirSync(omdDir, { recursive: true });
  const content = generateDesignMd(evidence);
  writeFileSync(designPath, content);

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
  if (opts.check === opts.reviewCheck) {
    throw new Error('usage: omd copy --check [--json] | omd copy --review-check [--json]');
  }

  if (opts.reviewCheck) {
    const path = join(process.cwd(), '.omd', '.cache', 'copy-eye.md');
    const violations = validateCopyReviewReport(existsSync(path) ? readFileSync(path, 'utf8') : '');
    if (opts.json) process.stdout.write(JSON.stringify(violations));
    else {
      for (const violation of violations) {
        console.log(`[error] ${violation.id} ${violation.path}: ${violation.message}`);
      }
      if (violations.length === 0) {
        console.log('ok — copy-eye.md passes report-structure checks only; blindness and semantic quality are not proven');
      }
    }
    process.exit(violations.length > 0 ? 1 : 0);
  }

  const path = join(process.cwd(), '.omd', 'copy-deck.md');
  const violations = validateCopyDeck(existsSync(path) ? readFileSync(path, 'utf8') : '');
  if (opts.json) process.stdout.write(JSON.stringify(violations));
  else {
    for (const violation of violations) {
      console.log(`[error] ${violation.id} ${violation.path}: ${violation.message}`);
    }
    if (violations.length === 0) console.log('ok — copy-deck.md passes all structural checks');
  }
  process.exit(violations.length > 0 ? 1 : 0);
}

/** `omd composition --check [--json]` — structural/freshness gate for composition.md. */
function cmdComposition(opts: Opts): never {
  if (!opts.check) throw new Error('usage: omd composition --check [--json]');
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
  if (mode === '--seal') {
    const path = writeSourceSeal(sourceRoot);
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

  // .omd/ writability at cwd
  const omdDir = join(process.cwd(), '.omd');
  try {
    mkdirSync(omdDir, { recursive: true });
    const probe = join(omdDir, '.doctor-probe');
    writeFileSync(probe, '');
    try { unlinkSync(probe); } catch { /* ignore */ }
    report('.omd/ writable', true);
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
  const entry = registerTarget(process.cwd(), opts.as, source, buf);

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
  mkdirSync(rendersDir, { recursive: true });
  const safeTarget = entry.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const renderPath = join(rendersDir, `${safeTarget}.png`);

  if (!jsonOut) {
    console.log(`rendering ${page} at ${viewport.width}×${viewport.height} …`);
  }
  await renderPage(page, { viewport, out: renderPath });

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

function usage(): never {
  console.error(
    'usage: omd <command>\n\n'
    + '  ir <page> [-o f]                            rendered DOM -> Design IR\n'
    + '  render <page> -o shot.png [--viewport WxH]  headless screenshot\n'
    + '  render <page> --full-page -o shot.png         supplementary long-page capture\n'
    + '  render <page> --squint -o shot.png            grayscale + blur hierarchy isolation\n'
    + '  render <page> --filmstrip -o f.html [--viewport WxH]  load-time filmstrip\n'
    + '  probe <page> [--plan path] [--json] [--out path]  declared local interaction path\n'
    + '  check [<page>|--ir f] [--json] [--category slop] [--no-log]\n'
    + '  check --site <dir>                          cross-page consistency (SITE-*)\n'
    + '  check <page1> <page2> ...                   same, multi-page positional\n'
    + '  slop scan [root] [--json]                   read-only source candidate scan\n'
    + '  coach                                        trends across `omd check` history\n'
    + '\n'
    + '  frame show\n'
    + '  frame set --problem P --reframe R --why EVIDENCE\n'
    + '            [--task T --frequent-action A --costliest-error E]\n'
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
    + '  ref list                                    one line per saved reference\n'
    + '  ref distance <page>                         compare a page to every saved reference\n'
    + '  ref principles <source> --as C --add "..."   record why a reference works\n'
    + '  ref show <source> --as C                    invariants + principles\n'
    + '\n'
    + '  design                                       discover evidence and create/refresh .omd/design.md\n'
    + '  design --check                              validate design.md section coverage\n'
    + '  copy --check [--json]                       validate required copy deck structure and fact refs\n'
    + '  copy --review-check [--json]                validate copy-eye report structure only (not blindness)\n'
    + '  composition --check [--json]                validate composition sections and input freshness\n'
    + '  source --seal [root]                        write final approved-input/source byte seal\n'
    + '  source --check [root] [--json]              fail when the source seal is missing or stale\n'
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
  if (cmd === 'coach') return cmdCoach();
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
      });
      console.log(path);
      process.exit(0);
    }

    if (sub === 'reframe') {
      if (!opts.to || !opts.because) {
        console.error('usage: omd frame reframe --to "..." --because "what the render revealed"');
        process.exit(1);
      }
      console.log(reframe(process.cwd(), { to: opts.to, because: opts.because }));
      process.exit(0);
    }

    if (sub === 'generator') {
      if (!opts.set) usage();
      setGenerator(process.cwd(), opts.set);
      console.log(`generator: ${opts.set}`);
      process.exit(0);
    }
    return usage();
  }

  if (cmd === 'ref') {
    const opts = parseArgs(args.slice(2));
    if (sub === 'add') return cmdRefAdd(opts);
    if (sub === 'list') return cmdRefList();
    if (sub === 'distance') return cmdRefDistance(opts);
    if (sub === 'principles') return cmdRefPrinciples(opts);
    if (sub === 'show') return cmdRefShow(opts);
    return usage();
  }

  if (cmd === 'design') return cmdDesign(parseArgs(args.slice(1)));
  if (cmd === 'copy') return cmdCopy(parseArgs(args.slice(1)));
  if (cmd === 'composition') return cmdComposition(parseArgs(args.slice(1)));
  if (cmd === 'source') return cmdSource(sub, parseArgs(args.slice(2)));
  if (cmd === 'pack') return cmdPack(sub, ...args.slice(2));
  if (cmd === 'doctor') return cmdDoctor();

  if (cmd === 'figma') {
    if (sub === 'pull') return cmdFigmaPull(args[2]);
    if (sub === 'system') return cmdFigmaSystem();
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
    console.log(logDecision(process.cwd(), what, opts.why));
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
    }));
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
