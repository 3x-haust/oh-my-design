#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { readFrame, approvalRefusal } from '../core/frame/index.mjs';
import { preTool } from '../core/hook/dispatch.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
    if (process.stdin.isTTY) resolve('');
  });
}

function parseArgs(args) {
  const opts = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--ir') {
      opts.ir = args[++i];
    } else if (arg === '--layer') {
      opts.layer = args[++i];
    } else {
      opts._.push(arg);
    }
  }
  return opts;
}

async function cmdCheck(opts) {
  const { normalize } = await import('../core/ir/normalize.mjs');
  const { loadRules, check } = await import('../core/rules/engine.mjs');

  const irPath = opts.ir ?? join(process.cwd(), '.design', '.cache', 'ir.json');
  const rawIr = JSON.parse(readFileSync(irPath, 'utf8'));
  const ir = normalize(rawIr);
  const rules = loadRules(join(root, 'core', 'rules', 'builtin'));
  const layers = opts.layer ? opts.layer.split(',').map((l) => Number(l.trim())) : undefined;
  const violations = check(ir, rules, { layers });

  if (opts.json) {
    process.stdout.write(JSON.stringify(violations));
  } else {
    for (const v of violations) {
      console.log(`[${v.severity}] ${v.id} ${v.path}: ${v.message}`);
    }
  }

  process.exit(violations.length > 0 ? 1 : 0);
}

function cmdFrameShow() {
  const frame = readFrame(process.cwd());
  if (frame === null) {
    console.error('No frame found. Run `omd frame` setup first.');
    process.exit(1);
  }
  console.log(JSON.stringify(frame, null, 2));
  process.exit(0);
}

function cmdFrameApprove() {
  const path = join(process.cwd(), '.design', 'frame.md');
  if (!existsSync(path)) {
    console.error('No frame found at .design/frame.md');
    process.exit(1);
  }

  const frame = readFrame(process.cwd());
  const refusal = approvalRefusal(frame, { isTTY: Boolean(process.stdin.isTTY), env: process.env });
  if (refusal) {
    console.error(refusal);
    process.exit(1);
  }

  const { body, ...frontmatter } = frame;
  frontmatter.approved = true;
  frontmatter.approvedAt = new Date().toISOString();
  const yamlText = stringify(frontmatter).trimEnd();
  const content = `---\n${yamlText}\n---\n${body}`;
  writeFileSync(path, content);
  process.exit(0);
}

async function cmdHookPreTool() {
  let input = {};
  try {
    const raw = await readStdin();
    if (raw) input = JSON.parse(raw);
  } catch {
    input = {};
  }

  // Only `cwd` is read off the wire. Spreading the payload would let a hook
  // input of {"env":{"OMD_NO_FRAME":"1"}} unlock the gate it is meant to guard.
  const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
  const result = await preTool({ cwd, env: process.env });
  if (result.decision === 'allow') {
    process.exit(0);
  } else {
    console.error(result.reason ?? 'denied');
    process.exit(2);
  }
}

function printVersion() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}

function usage() {
  console.error('usage: omd <--version | check | frame show | frame approve | hook pre-tool>');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const [cmd, sub, ...rest] = args;

  if (cmd === '--version') return printVersion();

  if (cmd === 'check') {
    const opts = parseArgs(args.slice(1));
    return cmdCheck(opts);
  }

  if (cmd === 'frame') {
    if (sub === 'show') return cmdFrameShow();
    if (sub === 'approve') return cmdFrameApprove();
    return usage();
  }

  if (cmd === 'hook') {
    if (sub === 'pre-tool') return cmdHookPreTool();
    return usage();
  }

  return usage();
}

main().catch((err) => {
  if (process.argv[2] === 'hook' && process.argv[3] === 'pre-tool') {
    console.error(`OMD internal error, blocking to stay safe: ${err.message}`);
    process.exit(2);
  }
  console.error(err.message);
  process.exit(1);
});
