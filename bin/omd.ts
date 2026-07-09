#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { readFrame } from '../core/frame/index.ts';
import { writeFrameRecord, reframe, setGenerator, logDecision, logChoice, tasteProfile } from '../core/frame/write.ts';
import { logRun, readHistory } from '../core/history/index.ts';
import { analyse } from '../core/coach/index.ts';
import type { Layer, RawIr } from '../core/types.ts';

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
  set?: string;
  chose?: string;
  to?: string;
  because?: string;
  as?: string;
  add?: string;
  noLog?: boolean;
}

const FLAGS = new Set(['json', 'no-log']);
const ALIASES: Record<string, keyof Opts> = { o: 'out', 'no-log': 'noLog' };

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

async function rawIrFor(opts: Opts, target: string | undefined): Promise<RawIr> {
  if (target) {
    const { extractIr, parseViewport } = await import('../core/render/index.ts');
    return extractIr(target, { viewport: parseViewport(opts.viewport) });
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
  const { renderPage, parseViewport } = await import('../core/render/index.ts');
  const target = opts._[0];
  if (!target) usage();
  const out = opts.out ?? 'shot.png';
  mkdirSync(dirname(resolve(out)), { recursive: true });
  await renderPage(target, { viewport: parseViewport(opts.viewport), out });
  console.log(out);
  process.exit(0);
}

async function cmdCheck(opts: Opts): Promise<never> {
  const { normalize } = await import('../core/ir/normalize.ts');
  const { loadRules, check } = await import('../core/rules/engine.ts');

  const ir = normalize(await rawIrFor(opts, opts._[0]));
  const rules = loadRules(join(root, 'core', 'rules', 'builtin'));
  const layers = opts.layer?.split(',').map((l) => Number(l.trim()) as Layer);
  const violations = check(ir, rules, layers ? { layers } : {});

  if (opts.json) process.stdout.write(JSON.stringify(violations));
  else for (const v of violations) console.log(`[${v.severity}] ${v.id} ${v.path}: ${v.message}`);

  if (!opts.noLog) {
    const page = opts._[0] ?? opts.ir ?? '(unknown)';
    logRun(process.cwd(), page, violations);
  }

  process.exit(violations.length > 0 ? 1 : 0);
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
    console.error('usage: omd ref add <url|file> --as <component>');
    process.exit(1);
  }
  const { normalize } = await import('../core/ir/normalize.ts');
  const { extractInvariants } = await import('../core/ref/invariants.ts');
  const { saveRef } = await import('../core/ref/store.ts');

  const raw = await rawIrFor(opts, target);
  const ir = normalize(raw);
  const invariants = extractInvariants(ir);
  const path = saveRef(process.cwd(), {
    source: target,
    component: opts.as,
    capturedAt: new Date().toISOString(),
    invariants,
    principles: [],
  });
  console.log(path);
  console.log(JSON.stringify(invariants, null, 2));
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
  const refs = loadRefs(process.cwd());
  if (refs.length === 0) {
    console.log('No references yet.');
    process.exit(0);
  }
  for (const ref of refs) {
    const inv = ref.invariants;
    console.log(
      `${ref.source}  ${ref.component}  radius=[${inv.radiusLadder.join(',')}] `
      + `spacing=[${inv.spacingLadder.join(',')}] elevation=${inv.elevationLevels}`,
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

  const { normalize } = await import('../core/ir/normalize.ts');
  const { extractInvariants } = await import('../core/ref/invariants.ts');
  const { distances } = await import('../core/ref/distance.ts');

  const raw = await rawIrFor(opts, target);
  const ir = normalize(raw);
  const invariants = extractInvariants(ir);
  const results = distances(invariants, refs);

  for (const r of results) {
    console.log(`  ${r.similarity.toFixed(2)}  ${r.reference}   (${r.drivers.join(', ')})`);
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

function usage(): never {
  console.error(
    'usage: omd <command>\n\n'
    + '  ir <page> [-o f]                            rendered DOM -> Design IR\n'
    + '  render <page> -o shot.png [--viewport WxH]  headless screenshot\n'
    + '  check [<page>|--ir f] [--json] [--category slop] [--no-log]\n'
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
    + '  ref add <url|file> --as <component>         render, extract invariants, save\n'
    + '  ref list                                    one line per saved reference\n'
    + '  ref distance <page>                         compare a page to every saved reference\n'
    + '  ref principles <source> --as C --add "..."   record why a reference works\n'
    + '  ref show <source> --as C                    invariants + principles',
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
