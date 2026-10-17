import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { printUsage } from './help.ts';
import { logRun } from '../../core/history/index.ts';
import { findLeakedRationale } from '../../core/rules/leakage.ts';
import { checkAttribution } from '../../core/rules/attribution.ts';
import { checkMotionSpec } from '../../core/rules/motion-spec.ts';
import { contextualCheckViolations } from '../../core/rules/applicability.ts';
import { validateDesignMd } from '../../core/design/index.ts';
import { checkInteractionStates } from '../../core/design/interaction-states.ts';
import { checkFrameUx } from '../../core/frame/check-ux.ts';
import { scanSlopSource } from '../../core/slop/index.ts';
import { computeStack } from '../../core/stack/index.ts';
import { bridgeGlobals } from '../../core/stack/shell.ts';
import { evaluateLighthouse, type LighthouseBudget } from '../../core/perf/lighthouse.ts';
import { publishFirstRenderCheck } from '../../core/design/first-render-evidence.ts';
import { writeExternalObservationFile } from '../../core/runtime/project-write.ts';
import type { Category, EnergyCurve, Layer, RawIr, Violation } from '../../core/types.ts';
import {
  ROOT,
  currentNativePiInvocation,
  ensureProjectParent,
  inputJson,
  invocationFromActivation,
  parseArgs,
  projectWriter,
  projectWriterFromActivation,
  type Opts,
} from '../cli/runtime.ts';

async function rawIrFor(opts: Opts, target: string | undefined, selector?: string | null): Promise<RawIr> {
  if (target) {
    const { extractIr, parseViewport } = await import('../../core/render/index.ts');
    return extractIr(target, { viewport: parseViewport(opts.viewport), selector: selector ?? null });
  }
  const irPath = opts.ir ?? join(process.cwd(), '.omd', '.cache', 'ir.json');
  return JSON.parse(readFileSync(irPath, 'utf8')) as RawIr;
}

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

async function cmdRender(opts: Opts): Promise<never> {
  const { renderPage, renderProofs, renderFilmstrip, parseViewport } = await import('../../core/render/index.ts');
  const target = opts._[0];
  warnDesktopBridge(target);
  if (!target) printUsage();

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
  const { readProbePlan, runProbe, writeProbeResult } = await import('../../core/probe/index.ts');
  const { parseViewport } = await import('../../core/render/index.ts');
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

async function cmdCheckSite(opts: Opts): Promise<never> {
  const { normalize } = await import('../../core/ir/normalize.ts');
  const { extractInvariants } = await import('../../core/ref/invariants.ts');
  const { checkSite } = await import('../../core/site/index.ts');
  const { extractIr, parseViewport } = await import('../../core/render/index.ts');

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

  const pages: Array<{ path: string; invariants: import('../../core/types.ts').Invariants; tokens?: Record<string, string> }> = [];
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

  const { normalize } = await import('../../core/ir/normalize.ts');
  const { loadRules, check } = await import('../../core/rules/engine.ts');

  const ir = normalize(await rawIrFor(opts, opts._[0]));
  const rules = loadRules(join(ROOT, 'core', 'rules', 'builtin'));
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
    const { loadRefs, refRecordPath } = await import('../../core/ref/store.ts');
    const captureNames = loadRefs(process.cwd()).map(ref => basename(refRecordPath(process.cwd(), ref), '.json'));
    const theoryDir = join(ROOT, 'core', 'theory');
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

  if (opts.json) await new Promise<void>(done => process.stdout.write(JSON.stringify(combined), () => done()));
  else for (const v of combined) console.log(`[${v.severity}] ${v.id} ${v.path}: ${v.message}`);

  if (!opts.noLog) {
    const page = opts._[0] ?? opts.ir ?? '(unknown)';
    logRun(process.cwd(), page, combined, projectWriterFromActivation(opts, 'omd check'));
  }

  process.exit(combined.length > 0 ? 1 : 0);
}

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

async function cmdFirstRender(mode: string | undefined, opts: Opts): Promise<never> {
  const nativePiInvocation = currentNativePiInvocation();
  if (mode === 'review') {
    const { runFirstRenderReview } = await import('../../core/design/first-render-review.ts');
    const reviewed = await runFirstRenderReview(process.cwd(), invocationFromActivation(opts, 'omd first-render review'));
    if (opts.json) process.stdout.write(JSON.stringify(reviewed));
    else console.log(`first render: ${reviewed.decision}; ${reviewed.next}`);
    process.exit(reviewed.decision === 'retain' ? 0 : 1);
  }
  if (mode !== 'check' || opts.input !== undefined || opts.page === undefined) {
    throw new Error('usage: omd first-render check --page <local-build.html> [--json]; remove --input (agent-authored surfaces are no longer accepted)');
  }
  const invocation = invocationFromActivation(opts, 'omd first-render check');
  const checked = await publishFirstRenderCheck(process.cwd(), opts.page, undefined, projectWriter(invocation), invocation);
  const { runFirstRenderReview } = await import('../../core/design/first-render-review.ts');
  const visualReview = nativePiInvocation === undefined ? null
    : await runFirstRenderReview(process.cwd(), nativePiInvocation);
  const report = checked.report;
  if (opts.json) process.stdout.write(JSON.stringify({ ...checked, visualReview,
    next: visualReview?.next ?? 'inspect-both-captures-with-preproduction-eye' }));
  else {
    console.log(`first render: ${report.verdict} (${report.findings.length} finding${report.findings.length === 1 ? '' : 's'})`);
    for (const finding of report.findings) console.log(`  [${finding.severity}] ${finding.id}: ${finding.message}`);
    if (visualReview) console.log(`visual review: ${visualReview.decision}; ${visualReview.next}`);
  }
  process.exit(visualReview === null || visualReview.decision === 'retain' ? 0 : 1);
}

async function cmdSlop(sub: string | undefined, opts: Opts): Promise<never> {
  if (sub === 'scan') {
    const result = scanSlopSource(opts._[0] ?? process.cwd());
    if (opts.json) await new Promise<void>(done => process.stdout.write(JSON.stringify(result), () => done()));
    else {
      console.log(`source candidates: ${result.candidates.length} (${result.filesScanned} files scanned)`);
      for (const item of result.candidates) console.log(`${item.path}:${item.line}  ${item.candidateId}  ${item.reviewQuestion}`);
    }
    process.exit(0);
  }
  if (sub !== 'score' || !opts.input || !opts.corpus) {
    throw new Error('usage: omd slop scan [root] [--json] | omd slop score --input <invariants.json> --corpus <corpus.json> [--json]');
  }
  const { scoreSlop } = await import('../../core/slop/score.ts');
  const corpusInput = inputJson(opts.corpus, 'omd slop score corpus');
  if (!Array.isArray(corpusInput)) throw new Error('omd slop score corpus must be an array of { invariants } entries');
  const score = scoreSlop({ invariants: inputJson(opts.input, 'omd slop score') as never, corpus: corpusInput as never });
  if (opts.json) process.stdout.write(JSON.stringify(score));
  else {
    console.log(`slop distance: ${Number.isFinite(score.distance) ? score.distance.toFixed(4) : 'unmeasured'} over ${score.compared.length} axes`);
    console.log(`near slop: ${score.nearSlop ? 'yes (advisory)' : 'no'}`);
    for (const finding of score.findings) console.log(`  [${finding.severity}] ${finding.message}`);
  }
  process.exit(0);
}

function unknown(command: string, sub?: string): never {
  throw new Error(`unknown command ${command}${sub ? ` ${sub}` : ''}; run omd help`);
}

export async function runInspection(args: string[]): Promise<never> {
  const command = args[0]!;
  const sub = args[1];
  if (command === 'render') return cmdRender(parseArgs(args.slice(1)));
  if (command === 'check') return cmdCheck(parseArgs(args.slice(1)));
  if (command === 'probe') return cmdProbe(parseArgs(args.slice(1)));
  if (command === 'slop') {
    if (sub !== 'scan' && sub !== 'score') return unknown(command, sub);
    return cmdSlop(sub, parseArgs(args.slice(2)));
  }
  if (command === 'lighthouse') return cmdLighthouse(parseArgs(args.slice(1)));
  if (command === 'first-render') {
    if (sub !== 'check' && sub !== 'review') return unknown(command, sub);
    return cmdFirstRender(sub, parseArgs(args.slice(2)));
  }
  if (command === 'measure') {
    const opts = parseArgs(args.slice(1));
    if (args.includes('--help')) { console.log('omd measure --entry <local.html|URL> [--scope <scope.json>] [--json]'); process.exit(0); }
    if (!opts.entry || opts.input !== undefined) throw new Error('omd measure requires --entry; --input is not an evidence import path');
    const invocation = invocationFromActivation(opts, 'omd measure');
    const { runMeasureCommand } = await import('../measure.ts');
    process.exit(await runMeasureCommand(opts, process.cwd(), projectWriter(invocation), invocation));
  }
  return unknown(command, sub);
}
