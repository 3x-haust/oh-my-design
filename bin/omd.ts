#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { readFrame, approvalRefusal } from '../core/frame/index.ts';
import { proposeFrame, setGenerator, logDecision, logChoice, tasteProfile } from '../core/frame/write.ts';
import { preTool } from '../core/hook/dispatch.ts';
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
  const irPath = opts.ir ?? join(process.cwd(), '.design', '.cache', 'ir.json');
  return JSON.parse(readFileSync(irPath, 'utf8')) as RawIr;
}

async function cmdIr(opts: Opts): Promise<never> {
  const raw = await rawIrFor(opts, opts._[0]);
  const out = opts.out ?? join(process.cwd(), '.design', '.cache', 'ir.json');
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
    console.error('No frame found. Run `omd init` first.');
    process.exit(1);
  }
  console.log(JSON.stringify(frame, null, 2));
  process.exit(0);
}

function cmdFrameApprove(): never {
  const path = join(process.cwd(), '.design', 'frame.md');
  const frame = readFrame(process.cwd());
  if (!frame) {
    console.error('No frame found at .design/frame.md');
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

async function cmdHookPreTool(): Promise<never> {
  let cwd = process.cwd();
  try {
    const raw = await readStdin();
    // Only `cwd` is read off the wire. Spreading the payload would let a hook input of
    // {"env":{"OMD_NO_FRAME":"1"}} unlock the gate it is meant to guard.
    const parsed = raw ? (JSON.parse(raw) as { cwd?: unknown }) : {};
    if (typeof parsed.cwd === 'string') cwd = parsed.cwd;
  } catch {
    // Garbage on stdin is not a reason to fail open.
  }

  const result = await preTool({ cwd, env: process.env });
  if (result.decision === 'allow') process.exit(0);
  console.error(result.reason);
  process.exit(2);
}

const FRAME_TEMPLATE = `---
approved: false
why: ""
---

## 주어진 문제

<의뢰받은 그대로 적는다>

## 재프레이밍

<이 문제가 정말 그 문제인가. 가설로 적는다.>

## 근거

<리뷰 인용, 티켓, 데이터. 이게 없으면 승인이 거부된다.>

## 버려지는 것 / 얻어지는 것
`;

// The hook is spawned by the host, which does not necessarily hand it our PATH.
// Resolve the interpreter and the script absolutely, once, at install time.
const hookCommand = (): string =>
  `${JSON.stringify(process.execPath)} ${JSON.stringify(join(root, 'bin', 'omd.ts'))} hook pre-tool`;

interface Settings {
  hooks?: { PreToolUse?: unknown[] };
}

function cmdInit(): never {
  const cwd = process.cwd();
  const settingsPath = join(cwd, '.claude', 'settings.json');
  const framePath = join(cwd, '.design', 'frame.md');

  const settings: Settings = existsSync(settingsPath)
    ? (JSON.parse(readFileSync(settingsPath, 'utf8')) as Settings)
    : {};
  settings.hooks ??= {};
  const others = (settings.hooks.PreToolUse ?? []).filter((e) => !JSON.stringify(e).includes('omd.ts'));
  settings.hooks.PreToolUse = [
    ...others,
    { matcher: 'Write|Edit', hooks: [{ type: 'command', command: hookCommand(), timeout: 5 }] },
  ];

  mkdirSync(join(cwd, '.claude'), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);

  mkdirSync(join(cwd, '.design'), { recursive: true });
  if (existsSync(framePath)) console.log(`kept    ${framePath}`);
  else {
    writeFileSync(framePath, FRAME_TEMPLATE);
    console.log(`created ${framePath}`);
  }
  console.log(`wrote   ${settingsPath}`);
  console.log('\nThe gate is live in the NEXT Claude Code session started here.');
  console.log('Fill in .design/frame.md, then run `omd frame approve` in your terminal.');
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
    + '  init                          scaffold the gate into this project\n'
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

  if (cmd === 'init') return cmdInit();
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
