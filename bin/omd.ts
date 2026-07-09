#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { readFrame, approvalRefusal, isApproved } from '../core/frame/index.ts';
import { proposeFrame, setGenerator, logDecision, logChoice, tasteProfile } from '../core/frame/write.ts';
import { preTool } from '../core/hook/dispatch.ts';
import { readSession, startSession, endSession, DEFAULT_SCOPE } from '../core/session/index.ts';
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
  brief?: string;
  scope?: string;
}

const FLAGS = new Set(['json']);
const ALIASES: Record<string, keyof Opts> = { o: 'out' };

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

function readStdin(): Promise<string> {
  return new Promise((done) => {
    let data = '';
    if (process.stdin.isTTY) return done('');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => { data += chunk; });
    process.stdin.on('end', () => done(data));
    process.stdin.on('error', () => done(data));
  });
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

  process.exit(violations.length > 0 ? 1 : 0);
}

function cmdFrameShow(): never {
  const frame = readFrame(process.cwd());
  if (!frame) {
    console.error('No frame found. Run `omd session start --brief "..."` first.');
    process.exit(1);
  }
  console.log(JSON.stringify(frame, null, 2));
  process.exit(0);
}

function cmdFrameApprove(): never {
  const path = join(process.cwd(), '.omd', 'frame.md');
  const frame = readFrame(process.cwd());
  if (!frame) {
    console.error('No frame found at .omd/frame.md');
    process.exit(1);
  }

  const refusal = approvalRefusal(frame, { isTTY: Boolean(process.stdin.isTTY), env: process.env });
  if (refusal) {
    console.error(refusal);
    process.exit(1);
  }

  const { body, ...frontmatter } = frame;
  const stamped = { ...frontmatter, approved: true, approvedAt: new Date().toISOString() };
  writeFileSync(path, `---\n${stringify(stamped).trimEnd()}\n---\n${body}`);
  process.exit(0);
}

/**
 * Only `cwd` and the tool's target path are read off the wire. Spreading the payload
 * would let a hook input of {"env":{"OMD_NO_FRAME":"1"}} unlock the gate it is meant to
 * guard, so every other field is ignored.
 */
function extractFilePath(parsed: unknown): string | undefined {
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const p = parsed as {
    filePath?: unknown;
    tool_input?: { file_path?: unknown; path?: unknown };
    params?: { file_path?: unknown };
  };
  if (typeof p.filePath === 'string') return p.filePath;
  if (typeof p.tool_input?.file_path === 'string') return p.tool_input.file_path;
  if (typeof p.tool_input?.path === 'string') return p.tool_input.path;
  if (typeof p.params?.file_path === 'string') return p.params.file_path;
  return undefined;
}

async function cmdHookPreTool(): Promise<never> {
  let cwd = process.cwd();
  let filePath: string | undefined;
  try {
    const raw = await readStdin();
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed === 'object' && parsed !== null && typeof (parsed as { cwd?: unknown }).cwd === 'string') {
      cwd = (parsed as { cwd: string }).cwd;
    }
    filePath = extractFilePath(parsed);
  } catch {
    // Garbage on stdin is not a reason to fail open.
  }

  const result = await preTool(filePath !== undefined ? { cwd, env: process.env, filePath } : { cwd, env: process.env });
  if (result.decision === 'allow') process.exit(0);
  console.error(result.reason);
  process.exit(2);
}

function cmdSessionStart(opts: Opts): never {
  const cwd = process.cwd();
  const brief = opts.brief ?? '';
  const scope = opts.scope ? opts.scope.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_SCOPE;
  startSession(cwd, brief, scope);
  console.log(join(cwd, '.omd', 'session.json'));
  process.exit(0);
}

function cmdSessionEnd(): never {
  endSession(process.cwd());
  process.exit(0);
}

function cmdSessionStatus(): never {
  const cwd = process.cwd();
  const session = readSession(cwd);
  if (!session) {
    console.log('no session open');
    process.exit(1);
  }
  console.log(`session started ${session.startedAt}`);
  console.log(`brief: ${session.brief}`);
  console.log(`scope: ${session.scope.join(', ')}`);
  console.log(`frame approved: ${isApproved(cwd)}`);
  process.exit(0);
}

function cmdChoose(opts: Opts): never {
  const among = opts._;
  if (!opts.chose) {
    console.error(`Present these to the user and re-run with --chose:\n  ${among.join('  ')}\n`
      + 'The choice is the training signal for Layer 3. Do not pick for them.');
    process.exit(1);
  }
  const path = logChoice(process.cwd(), opts.why
    ? { among, chose: opts.chose, why: opts.why }
    : { among, chose: opts.chose });
  console.log(`${path}  (${tasteProfile(process.cwd()).n} choices recorded)`);
  process.exit(0);
}

function usage(): never {
  console.error(
    'usage: omd <command>\n\n'
    + '  session start --brief "..." [--scope "a,b"]   open the gate for this project\n'
    + '  session end                                    close the gate\n'
    + '  session status                                  print session + approval state\n'
    + '  ir <page> [-o f]              rendered DOM -> Design IR\n'
    + '  render <page> -o shot.png     headless screenshot\n'
    + '  check [<page>|--ir f] [--json]\n'
    + '  frame show | approve\n'
    + '  frame propose --problem P --reframe R --why EVIDENCE\n'
    + '  frame generator --set "은유"\n'
    + '  choose c1 c2 c3 --chose c3 [--why W]\n'
    + '  decision "what" --why "why"\n'
    + '  taste profile\n'
    + '  hook pre-tool',
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

  if (cmd === 'session') {
    const opts = parseArgs(args.slice(2));
    if (sub === 'start') return cmdSessionStart(opts);
    if (sub === 'end') return cmdSessionEnd();
    if (sub === 'status') return cmdSessionStatus();
    return usage();
  }

  if (cmd === 'ir') return cmdIr(parseArgs(args.slice(1)));
  if (cmd === 'render') return cmdRender(parseArgs(args.slice(1)));
  if (cmd === 'check') return cmdCheck(parseArgs(args.slice(1)));

  if (cmd === 'frame') {
    const opts = parseArgs(args.slice(2));
    if (sub === 'show') return cmdFrameShow();
    if (sub === 'approve') return cmdFrameApprove();
    if (sub === 'propose') {
      const path = proposeFrame(process.cwd(), {
        problem: opts.problem ?? '',
        reframe: opts.reframe ?? '',
        ...(opts.why ? { why: opts.why } : {}),
      });
      console.log(`${path}\n\nNot approved. Show it to the user; they approve it in their own terminal.`);
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
        return `  ${r.chose} over ${over}${r.why ? ` — ${r.why}` : ''}`;
      });
      console.log(`${n} choices\n${lines.join('\n')}`);
    }
    process.exit(0);
  }

  if (cmd === 'hook' && sub === 'pre-tool') return cmdHookPreTool();

  return usage();
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  // `hook pre-tool` may only ever exit 0 or 2; anything else and Codex continues the call.
  if (process.argv[2] === 'hook' && process.argv[3] === 'pre-tool') {
    console.error(`OMD internal error, blocking to stay safe: ${message}`);
    process.exit(2);
  }
  console.error(message);
  process.exit(1);
});
