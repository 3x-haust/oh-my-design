#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { readFrame } from '../core/frame/index.ts';
import { writeFrameRecord, reframe, setGenerator, logDecision, logChoice, tasteProfile } from '../core/frame/write.ts';
import { logRun, readHistory } from '../core/history/index.ts';
import { analyse } from '../core/coach/index.ts';
import { findLeakedRationale } from '../core/rules/leakage.ts';
import { checkAttribution } from '../core/rules/attribution.ts';
import { checkMotionSpec } from '../core/rules/motion-spec.ts';
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
  fromUser?: boolean;
  /** Directory of pages for cross-page site consistency check (`omd check --site <dir>`). */
  site?: string;
}

const FLAGS = new Set(['json', 'no-log', 'image', 'filmstrip', 'from-user']);
const ALIASES: Record<string, keyof Opts> = { o: 'out', 'no-log': 'noLog', 'from-user': 'fromUser' };

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
  await renderPage(target, { viewport: parseViewport(opts.viewport), out });
  console.log(out);
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

  // Code-unit order, not localeCompare — same determinism guarantee as check() itself.
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  const combined: Violation[] = [...violations, ...leaks, ...attrViolations, ...motionSpecViolations].sort((a, b) => cmp(a.path, b.path) || cmp(a.id, b.id));

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
  console.log(`${path}  (${tasteProfile(process.cwd()).n} choices recorded)`);
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
  process.exit(0);
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
  const theoryFiles = ['color.md', 'typography.md', 'layout.md', 'motion.md', 'expressive.md', 'components.md', 'craft.md'];
  for (const f of theoryFiles) {
    const path = join(root, 'core', 'theory', f);
    report(`theory/${f}`, existsSync(path));
  }

  process.exit(allPass ? 0 : 1);
}

function usage(): never {
  console.error(
    'usage: omd <command>\n\n'
    + '  ir <page> [-o f]                            rendered DOM -> Design IR\n'
    + '  render <page> -o shot.png [--viewport WxH]  headless screenshot\n'
    + '  render <page> --filmstrip -o f.html [--viewport WxH]  load-time filmstrip\n'
    + '  check [<page>|--ir f] [--json] [--category slop] [--no-log]\n'
    + '  check --site <dir>                          cross-page consistency (SITE-*)\n'
    + '  check <page1> <page2> ...                   same, multi-page positional\n'
    + '  coach                                        trends across `omd check` history\n'
    + '\n'
    + '  frame show\n'
    + '  frame set --problem P --reframe R --why EVIDENCE\n'
    + '  frame reframe --to "..." --because "what the render revealed"\n'
    + '  frame generator --set "metaphor"\n'
    + '\n'
    + '  choose c1 c2 c3 --chose c3 --why "..."\n'
    + '  decision "what" --why "why"\n'
    + '  taste profile\n'
    + '\n'
    + '  ref add <url|file> --as <component> [--selector "css"] [--image]\n'
    + '                                                render, extract invariants, save\n'
    + '  ref list                                    one line per saved reference\n'
    + '  ref distance <page>                         compare a page to every saved reference\n'
    + '  ref principles <source> --as C --add "..."   record why a reference works\n'
    + '  ref show <source> --as C                    invariants + principles\n'
    + '\n'
    + '  doctor                                       check environment prerequisites',
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
  if (cmd === 'check') return cmdCheck(parseArgs(args.slice(1)));
  if (cmd === 'coach') return cmdCoach();

  if (cmd === 'frame') {
    const opts = parseArgs(args.slice(2));
    if (sub === 'show') return cmdFrameShow();

    if (sub === 'set') {
      const path = writeFrameRecord(process.cwd(), {
        problem: opts.problem ?? '',
        reframe: opts.reframe ?? '',
        ...(opts.why ? { why: opts.why } : {}),
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

  if (cmd === 'doctor') return cmdDoctor();

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

  if (cmd === 'taste' && sub === 'profile') {
    const { n, records } = tasteProfile(process.cwd());
    if (n === 0) console.log('No choices recorded yet.');
    else {
      const lines = records.map((r) => {
        const over = r.among.filter((a) => a !== r.chose).join(',');
        return `  ${r.chose} over ${over}${r.why ? ` \u2014 ${r.why}` : ''}`;
      });
      console.log(`${n} choices\n${lines.join('\n')}`);
    }
    process.exit(0);
  }

  return usage();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
