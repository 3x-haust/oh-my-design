import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  codexPayloadAuthorizationPhaseError,
  isCodexFinalEvidenceContinuationPayload,
  isCodexOwnerAuthorityRequest,
  isBrokeredBrowserCliOperation,
  isExactCanonicalCliInvocation,
  parseCodexHostPayloadAuthorization,
  parseCodexHostRoleOptions,
  resolveCodexHostExecutable,
  runCodexHostExec,
  workflowProductionSliceAuthorityError,
  type CodexHostLaunchResult,
} from '../adapters/codex-host-launcher.ts';
import { resolveCodexAuthorityCliPath } from '../core/runtime/activation.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = join(ROOT, 'bin', 'omd.mjs');
const INSTALLER = join(ROOT, 'bin', 'omd-install.ts');
const ROUTE_FIXTURE = join(ROOT, 'test', 'fixtures', 'adaptive-flow', 'copy-only.json');

function executable(path: string, source: string): string {
  writeFileSync(path, `#!/usr/bin/env node\n${source}`);
  chmodSync(path, 0o755);
  return path;
}

function project(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const git = spawnSync('git', ['init', '-q'], { cwd: root, encoding: 'utf8' });
  assert.equal(git.status, 0, git.stderr);
  mkdirSync(join(root, '.omd', '.cache'), { recursive: true });
  writeFileSync(join(root, '.omd', '.cache', 'route-input.json'), readFileSync(ROUTE_FIXTURE));
  return root;
}

function routeStub(path: string, reportPath: string, extra = ''): string {
  return executable(path, `
import { spawnSync } from 'node:child_process';
import { statSync, writeFileSync } from 'node:fs';
const root = process.env.OMD_TEST_PROJECT;
const cli = process.env.OMD_TEST_CLI;
const activation = process.env.OMD_ACTIVATION_PATH;
const loaded = process.env.OMD_CODEX_LOADED_SKILL_RECEIPT_PATH;
${extra}
const child = spawnSync(process.execPath, [cli, 'route', 'classify', '--input', '.omd/.cache/route-input.json', '--json'], {
  cwd: root, encoding: 'utf8', env: process.env,
});
writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify({
  argv: process.argv.slice(2), status: child.status, stdout: child.stdout, stderr: child.stderr,
  activation, loaded, activationMode: activation ? statSync(activation).mode & 0o777 : null,
  loadedMode: loaded ? statSync(loaded).mode & 0o777 : null,
}));
process.exit(child.status ?? 1);
`);
}

function typographyStub(path: string, reportPath: string): string {
  return executable(path, `
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const child = spawnSync(process.execPath, [
  process.env.OMD_TEST_CLI,
  'completion',
  'typography-applicability',
  '--ir',
  '.omd/.cache/rendered-ir.json',
  '--activation',
  process.env.OMD_ACTIVATION_PATH,
  '--json',
], {
  cwd: process.env.OMD_TEST_PROJECT,
  encoding: 'utf8',
  env: process.env,
});
writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify({
  status: child.status,
  stdout: child.stdout,
  stderr: child.stderr,
}));
process.exit(child.status ?? 1);
`);
}

async function launch(root: string, codex: string, report: string, extraArgs: readonly string[] = []): Promise<CodexHostLaunchResult> {
  return await runCodexHostExec(['exec', '-C', root, '--skip-git-repo-check', ...extraArgs, '$omd-ultradesign build the requested interface'], {
    codexBin: codex,
    packageRoot: ROOT,
    codexHome: join(root, '..', `codex-home-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    installedSkillRoot: join(ROOT, 'dist', 'codex', 'skills'),
    env: { ...process.env, OMD_TEST_PROJECT: root, OMD_TEST_CLI: CLI, OMD_TEST_REPORT: report },
    receiptRetentionMs: 60_000,
  });
}

test('RED hypothesis 1: the public CLI exposes a real Codex exec host surface without selecting a model', () => {
  const result = spawnSync(process.execPath, [INSTALLER, 'codex', '--help'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /oh-my-design codex exec/);
  assert.doesNotMatch(result.stdout, /--model <| -m,/);
});

test('host-owned role model and effort options are stripped, frozen, and reject ambiguous input', () => {
  const parsed = parseCodexHostRoleOptions([
    'exec', '-C', '/tmp/project',
    '--omd-role-model', 'omd-hand=gpt-5.6-sol',
    '--omd-role-effort', 'omd-hand=medium',
    '--omd-role-model', 'omd-eye=gpt-5.6-sol',
    '--omd-role-effort', 'omd-eye=high',
    '--model', 'gpt-6-astra', 'coordinate',
  ]);
  assert.deepEqual(parsed.coordinatorArgs, [
    'exec', '-C', '/tmp/project', '--model', 'gpt-6-astra', 'coordinate',
  ]);
  assert.deepEqual(parsed.roleOverrides, {
    'omd-eye': { model: 'gpt-5.6-sol', reasoningEffort: 'high' },
    'omd-hand': { model: 'gpt-5.6-sol', reasoningEffort: 'medium' },
  });
  assert.equal(Object.isFrozen(parsed.roleOverrides), true);
  assert.equal(Object.isFrozen(parsed.roleOverrides['omd-hand']), true);
  assert.throws(() => parseCodexHostRoleOptions(['exec', '--omd-role-model']), /requires <role>=<value>/);
  assert.throws(() => parseCodexHostRoleOptions(['exec', '--omd-role-model', 'omd-ghost=gpt-5.6-sol']), /unknown official OMD role/);
  assert.throws(() => parseCodexHostRoleOptions(['exec', '--omd-role-model', 'omd-hand=--evil']), /invalid model/);
  assert.throws(() => parseCodexHostRoleOptions(['exec', '--omd-role-effort', 'omd-hand=xhigh']), /low, medium, or high/);
  assert.throws(() => parseCodexHostRoleOptions([
    'exec', '--omd-role-model', 'omd-hand=gpt-5.6-sol', '--omd-role-model', 'omd-hand=gpt-5.6-luna',
  ]), /duplicate --omd-role-model/);
  assert.throws(() => parseCodexHostRoleOptions([
    'exec', '--omd-role-effort', 'omd-hand=low', '--omd-role-effort', 'omd-hand=high',
  ]), /duplicate --omd-role-effort/);
  assert.deepEqual(parseCodexHostRoleOptions([
    'exec', '--', '--omd-role-model', 'omd-hand=gpt-5.6-sol',
  ]), {
    coordinatorArgs: ['exec', '--', '--omd-role-model', 'omd-hand=gpt-5.6-sol'],
    roleOverrides: {},
  });
});

test('delegated Writer uses the issuing CLI and its explicitly owned direct-file publication path', async () => {
  const root = project('omd-role-cli-binding-');
  const runtime = realpathSync(mkdtempSync(join(tmpdir(), 'omd-role-cli-runtime-')));
  const codexHome = join(root, 'codex-home');
  const report = join(root, 'report.json');
  mkdirSync(join(codexHome, 'agents'), { recursive: true });
  writeFileSync(join(codexHome, 'agents', 'omd-writer.toml'), readFileSync(join(ROOT, 'dist/codex/agents/omd-writer.toml')));
  writeFileSync(join(root, '.omd/task.md'), 'Read the current route and write the test copy deck using your declared ownership contract.');
  executable(join(root, 'omd'), 'process.exit(93);');
  const codex = executable(join(runtime, 'codex-stub'), `
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (process.env.OMD_NON_PRODUCTION_ROLE) {
  const task = readFileSync(0, 'utf8');
  const prefix = task.split('exact command prefix:\\n')[1]?.split('\\n')[0];
  const result = spawnSync('/bin/sh', ['-c', prefix + ' route show --json'], { cwd: ${JSON.stringify(root)}, env: process.env, encoding: 'utf8' });
  // This is a transport/ownership test stub, not a model or a design-quality evaluation.
  if (!task.includes('publication method declared in your role instructions')
    || !task.includes('Direct file writes are permitted only to paths your role explicitly owns')) process.exit(94);
  writeFileSync(${JSON.stringify(join(root, '.omd/copy-deck.md'))}, '# Copy\\n\\nTest-owned Writer deck.\\n');
  writeFileSync(${JSON.stringify(report)}, JSON.stringify({ task, status: result.status, stderr: result.stderr, roleArgs: process.argv.slice(2) }));
  console.log(JSON.stringify({type:'thread.started',thread_id:'isolated-role-cli-binding'}));
  console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Current route read through issuing CLI.'}}));
  console.log(JSON.stringify({type:'turn.completed'}));
  process.exit(result.status ?? 1);
}
const run = (cli, args) => spawnSync(process.execPath, [cli, ...args], {cwd:${JSON.stringify(root)}, env:process.env, encoding:'utf8'});
const classified = run(${JSON.stringify(CLI)}, ['route','classify','--input','.omd/.cache/route-input.json','--json']);
if (classified.status !== 0) { console.error(classified.stderr); process.exit(1); }
const delegated = run(${JSON.stringify(join(ROOT, 'bin/omd-codex.mjs'))}, ['role','run','--agent','omd-writer','--input','.omd/task.md','--json']);
const roleReport = JSON.parse(readFileSync(${JSON.stringify(report)}, 'utf8'));
writeFileSync(${JSON.stringify(report)}, JSON.stringify({
  ...roleReport,
  coordinatorArgs: process.argv.slice(2),
  delegatedStdout: delegated.stdout,
  delegatedStderr: delegated.stderr,
}));
console.error(delegated.stderr);
process.exit(delegated.status ?? 1);
`);
  let result: CodexHostLaunchResult | undefined;
  try {
    result = await runCodexHostExec([
      'exec', '-C', root,
      '--omd-role-model', 'omd-writer=gpt-5.6-luna',
      '--omd-role-effort', 'omd-writer=low',
      '--model', 'gpt-6-astra', '-c', 'model_reasoning_effort="medium"',
      'Read route using writer role',
    ], {
      codexBin: codex, packageRoot: ROOT, codexHome,
      installedSkillRoot: join(ROOT, 'dist/codex/skills'),
      env: { ...process.env, PATH: `${root}:${process.env.PATH ?? ''}` },
    });
    assert.equal(result.status, 0, result.stderr);
    const observed = JSON.parse(readFileSync(report, 'utf8'));
    assert.equal(observed.status, 0, observed.stderr);
    assert.deepEqual(observed.coordinatorArgs.slice(-5), [
      '--model', 'gpt-6-astra', '-c', 'model_reasoning_effort="medium"', 'Read route using writer role',
    ]);
    assert.equal(observed.coordinatorArgs.includes('--omd-role-model'), false);
    assert.equal(observed.coordinatorArgs.includes('--omd-role-effort'), false);
    assert.equal(observed.roleArgs[observed.roleArgs.indexOf('--model') + 1], 'gpt-5.6-luna');
    assert.equal(observed.roleArgs.filter((arg: string) => arg.startsWith('model_reasoning_effort=')).length, 1);
    assert.ok(observed.roleArgs.includes('model_reasoning_effort="low"'));
    const delegatedResult = JSON.parse(observed.delegatedStdout);
    assert.equal(delegatedResult.modelArgumentOmitted, false);
    assert.equal(delegatedResult.model, 'gpt-5.6-luna');
    assert.equal(delegatedResult.modelReasoningEffort, 'low');
    assert.equal(delegatedResult.authority.receipt.model, 'gpt-5.6-luna');
    assert.equal(delegatedResult.authority.receipt.modelReasoningEffort, 'low');
    assert.match(delegatedResult.authority.receipt.configurationSha256, /^[a-f0-9]{64}$/);
    assert.ok(observed.task.includes(realpathSync(join(ROOT, 'bin/omd.ts'))));
    assert.match(observed.task, /Do not use bare `omd`/);
    assert.equal(readFileSync(join(root, '.omd/copy-deck.md'), 'utf8'), '# Copy\n\nTest-owned Writer deck.\n');
    assert.match(observed.task, /Use named OMD CLI commands where your role requires them/);
    assert.match(observed.task, /not a fallback for a CLI-required record/);
    assert.match(observed.task, /Do not invent publication commands or write another role's artifacts/);
    assert.match(observed.task, /Do not write production source and do not delegate your owned work/);
    assert.doesNotMatch(observed.task, /Persist only artifacts owned by your role through their named OMD CLI commands/);
  } finally {
    if (result) rmSync(result.authoritySocketPath, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
    rmSync(runtime, { recursive: true, force: true });
  }
});

test('authority requests cannot turn a caller-selected digest into a signed payload authorization', () => {
  const payload = Buffer.from('{"trusted":true}\n');
  const payloadSha256 = createHash('sha256').update(payload).digest('hex');
  assert.equal(parseCodexHostPayloadAuthorization({ purpose: 'product-probe-result', payloadSha256 }), undefined);
  assert.equal(parseCodexHostPayloadAuthorization({
    purpose: 'product-probe-result', payloadSha256,
    payloadBase64: Buffer.from('different bytes').toString('base64'),
  }), undefined);
  assert.equal(parseCodexHostPayloadAuthorization({
    purpose: 'not-a-host-purpose', payloadSha256, payloadBase64: payload.toString('base64'),
  }), undefined);
  assert.deepEqual(parseCodexHostPayloadAuthorization({
    purpose: 'product-probe-result', payloadSha256, payloadBase64: payload.toString('base64'),
  }), { purpose: 'product-probe-result', payloadSha256, payloadBase64: payload.toString('base64'), payload });
});

test('a descendant cannot impersonate the CLI by placing its path later in the process command', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  const validArgv = [process.execPath, cli, 'route', 'classify', '--json'];
  assert.equal(isExactCanonicalCliInvocation(`${process.execPath} ${cli} route classify --json`, validArgv, cli), true);
  const loader = realpathSync(join(ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs'));
  assert.equal(isExactCanonicalCliInvocation(`${process.execPath} --import ${loader} ${cli} route classify --json`, validArgv, cli), true);
  assert.equal(isExactCanonicalCliInvocation(`${process.execPath} --import /untrusted/hook.mjs ${cli} route classify --json`, validArgv, cli), false);
  assert.equal(isExactCanonicalCliInvocation(`${process.execPath} -e exploit ${cli} route classify --json`, validArgv, cli), false);
  assert.equal(isExactCanonicalCliInvocation(`${process.execPath} /tmp/descendant.js --note ${cli} route classify --json`, validArgv, cli), false);
});

test('canonical long CLI argv survives a truncated process-command observation', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  const loader = realpathSync(
    join(ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs'),
  );
  const longFrame = '가'.repeat(12_000);
  const argv = [
    process.execPath,
    cli,
    'frame',
    'set',
    '--reframe',
    longFrame,
  ];
  const full = [
    process.execPath,
    '--import',
    loader,
    cli,
    ...argv.slice(2),
  ].join(' ');
  const observed = full.slice(0, 4_096);

  assert.equal(
    isExactCanonicalCliInvocation(observed, argv, cli),
    true,
  );
  assert.equal(
    isExactCanonicalCliInvocation(
      observed,
      [process.execPath, cli, 'route', 'classify', '--json'],
      cli,
    ),
    false,
  );
});

test('canonical CLI identity tolerates process-display whitespace normalization', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  const loader = realpathSync(
    join(ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs'),
  );
  const argv = [
    process.execPath,
    cli,
    'frame',
    'set',
    '--reframe',
    'line one\nline two',
  ];
  const observed = [
    process.execPath,
    '--import',
    loader,
    cli,
    'frame set --reframe line one line two',
  ].join(' ');

  assert.equal(
    isExactCanonicalCliInvocation(observed, argv, cli),
    true,
  );
  assert.equal(
    isExactCanonicalCliInvocation(
      observed,
      [process.execPath, cli, 'route', 'classify', '--json'],
      cli,
    ),
    false,
  );
});

test('the owner CLI may broker only its exact run and repair phases', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  const ownerCli = realpathSync(join(ROOT, 'bin', 'omd-codex.ts'));
  assert.equal(
    resolveCodexAuthorityCliPath(ownerCli, [process.execPath, ownerCli, 'owner', 'run'], cli, ownerCli),
    ownerCli,
  );
  assert.equal(
    resolveCodexAuthorityCliPath(ownerCli, [process.execPath, ownerCli, 'owner', 'repair'], cli, ownerCli),
    ownerCli,
  );
  assert.equal(
    resolveCodexAuthorityCliPath(ownerCli, [process.execPath, ownerCli, 'route', 'show'], cli, ownerCli),
    undefined,
  );
  assert.equal(
    resolveCodexAuthorityCliPath('/tmp/foreign.ts', [process.execPath, '/tmp/foreign.ts', 'owner', 'run'], cli, ownerCli),
    undefined,
  );
  assert.equal(
    isCodexOwnerAuthorityRequest({
      schema: 'omd-codex-authority-request-v1',
      cliPath: ownerCli,
      argv: [process.execPath, ownerCli, 'owner', 'run'],
    }, ownerCli),
    true,
  );
  assert.equal(
    isCodexOwnerAuthorityRequest({
      schema: 'omd-codex-authority-request-v1',
      cliPath: ownerCli,
      argv: [process.execPath, ownerCli, 'route', 'show'],
    }, ownerCli),
    false,
  );
});

test('workflow slice authority transfers only after a persisted completed owner result', () => {
  assert.equal(
    workflowProductionSliceAuthorityError(true, false, ['owner', 'run']),
    undefined,
  );
  assert.equal(
    workflowProductionSliceAuthorityError(false, true, ['workflow', 'slice']),
    undefined,
  );
  assert.match(
    workflowProductionSliceAuthorityError(false, false, ['workflow', 'slice']) ?? '',
    /persisted completed result/,
  );
  assert.match(
    workflowProductionSliceAuthorityError(false, true, ['workflow', 'check-slice']) ?? '',
    /persisted completed result/,
  );
  assert.match(
    workflowProductionSliceAuthorityError(false, true, ['route', 'classify']) ?? '',
    /persisted completed result/,
  );
});

test('browser-owning roles broker only canonical browser CLI operations', () => {
  assert.equal(isBrokeredBrowserCliOperation('omd-scout', ['ref', 'add-batch', '.omd/.cache/refs.json']), true);
  assert.equal(isBrokeredBrowserCliOperation('omd-scout', ['craft-capture', 'https://example.com']), true);
  assert.equal(isBrokeredBrowserCliOperation('omd-eye', ['render', 'http://127.0.0.1:4173']), true);
  assert.equal(isBrokeredBrowserCliOperation('omd-hand', ['probe', 'http://127.0.0.1:4173']), true);
  assert.equal(isBrokeredBrowserCliOperation('omd-writer', ['render', 'http://127.0.0.1:4173']), false);
  assert.equal(isBrokeredBrowserCliOperation('omd-scout', ['route', 'show']), false);
  assert.equal(isBrokeredBrowserCliOperation('omd-hand', ['ref', 'board']), false);
});

test('completeness publication may revalidate exact adaptive route authority', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  assert.equal(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'complete', 'publish', '--input', '.omd/completeness-input.json'],
      'adaptive-route-authority',
    ),
    undefined,
  );
  assert.equal(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'evidence', 'v2', 'finalize'],
      'adaptive-route-authority',
    ),
    undefined,
  );
});

test('only locale commands that consume the current adaptive route may revalidate its authority', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  for (const operation of [
    ['locale', 'profile', '--publish'],
    ['locale', 'profile-check'],
    ['locale', 'source-capture'],
    ['locale', 'source-stability'],
  ] as const) {
    assert.equal(
      codexPayloadAuthorizationPhaseError(
        [process.execPath, cli, ...operation],
        'adaptive-route-authority',
      ),
      undefined,
      `${operation.join(' ')} consumes the current adaptive route`,
    );
  }
  for (const operation of [
    ['locale', 'plan'],
    ['locale', 'check'],
    ['locale', 'profile'],
  ] as const) {
    assert.match(
      codexPayloadAuthorizationPhaseError(
        [process.execPath, cli, ...operation],
        'adaptive-route-authority',
      ) ?? '',
      /requires an exact trusted host-observed CLI phase/,
      `${operation.join(' ')} must not become an adaptive-route signing oracle`,
    );
  }
});

test('only intent-consuming publication phases may authorize the current intent ledger', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  for (const operation of [
    ['intent', 'append'],
    ['art-direction', 'check'],
    ['evidence', 'v2', 'finalize'],
    ['evidence', 'v2', 'check'],
    ['completion', 'preflight'],
    ['lifecycle', 'finalize'],
  ] as const) {
    assert.equal(
      codexPayloadAuthorizationPhaseError(
        [process.execPath, cli, ...operation],
        'current-intent-ledger',
      ),
      undefined,
      `${operation.join(' ')} consumes the current intent ledger`,
    );
  }
  for (const operation of [
    ['route', 'classify'],
    ['art-direction', 'check-input'],
    ['review', 'publish'],
  ] as const) {
    assert.match(
      codexPayloadAuthorizationPhaseError(
        [process.execPath, cli, ...operation],
        'current-intent-ledger',
      ) ?? '',
      /requires an exact trusted host-observed CLI phase/,
      `${operation.join(' ')} must not act as a payload-signing oracle`,
    );
  }
});

test('only the canonical art-direction check may authorize its closed evaluator payloads', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  for (const purpose of [
    'evaluator-assessment',
    'evaluator-result',
    'approved-motion-recipe',
  ] as const) {
    assert.equal(
      codexPayloadAuthorizationPhaseError(
        [process.execPath, cli, 'art-direction', 'check', '--input', '/tmp/direction.json'],
        purpose,
      ),
      undefined,
      `art-direction check consumes ${purpose}`,
    );
    for (const operation of [
      ['art-direction', 'check-input'],
      ['deliberate', 'preserve'],
      ['route', 'classify'],
    ] as const) {
      assert.match(
        codexPayloadAuthorizationPhaseError(
          [process.execPath, cli, ...operation],
          purpose,
        ) ?? '',
        /requires an exact trusted host-observed CLI phase/,
        `${operation.join(' ')} must not authorize ${purpose}`,
      );
    }
  }
});

test('the exact typography applicability phase authorizes its canonical DOM probe payload', async () => {
  const root = project('omd-codex-typography-probe-');
  const report = join(root, '..', `codex-typography-report-${Date.now()}.json`);
  const codex = typographyStub(join(root, '..', `codex-typography-stub-${Date.now()}.mjs`), report);
  writeFileSync(join(root, '.omd', 'functional-requirements.json'), JSON.stringify({
    schema: 'functional-requirements-v1',
    requirements: [{ id: 'R-1', kind: 'content', statement: 'Show the measured heading', label: 'Measured heading' }],
  }));
  writeFileSync(join(root, '.omd', '.cache', 'rendered-ir.json'), JSON.stringify({
    meta: { source: 'dom', url: 'file://fixture/' },
    nodes: [{
      id: 'heading',
      name: 'h1',
      type: 'TEXT',
      path: 'body > h1',
      parent: null,
      box: { x: 0, y: 0, w: 320, h: 48 },
      children: [],
      text: '측정된 제목',
    }],
  }));
  try {
    const launched = await launch(root, codex, report);
    assert.equal(launched.status, 0, existsSync(report) ? readFileSync(report, 'utf8') : launched.stderr);
    const result = JSON.parse(readFileSync(report, 'utf8')) as { status: number; stdout: string; stderr: string };
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /typography-applicability-v2/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(report, { force: true });
    rmSync(codex, { force: true });
  }
});

test('a forged all-pass payload cannot be relabeled into authority from another CLI phase', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  const forged = Buffer.from('{"hardFloors":{"behavior":"pass","access":"pass","safety":"pass"}}\n');
  const payloadSha256 = createHash('sha256').update(forged).digest('hex');
  assert.ok(parseCodexHostPayloadAuthorization({
    purpose: 'final-reviewer-lane', payloadSha256, payloadBase64: forged.toString('base64'),
  }), 'exact bytes parse before operation authority is considered');
  assert.match(
    codexPayloadAuthorizationPhaseError([process.execPath, cli, 'route', 'classify'], 'final-reviewer-lane') ?? '',
    /requires an exact trusted host-observed CLI phase/,
  );
  assert.equal(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'evidence', 'v2', 'finalize'],
      'final-reviewer-lane',
    ),
    undefined,
  );
  assert.equal(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'evidence', 'v2', 'check'],
      'final-reviewer-lane',
    ),
    undefined,
  );
  assert.equal(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'completion', 'preflight'],
      'final-reviewer-lane',
    ),
    undefined,
  );
  assert.equal(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'evidence', 'v2', 'finalize'],
      'final-evidence-manifest',
    ),
    undefined,
  );
  assert.equal(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'evidence', 'v2', 'check'],
      'final-evidence-manifest',
    ),
    undefined,
  );
  assert.equal(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'completion', 'preflight'],
      'final-evidence-manifest',
    ),
    undefined,
  );
  assert.equal(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'evidence', 'v2', 'finalize'],
      'final-evidence-manifest',
    ),
    undefined,
  );
  assert.match(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'review', 'check'],
      'final-evidence-manifest',
    ) ?? '',
    /requires an exact trusted host-observed CLI phase/,
  );
  assert.equal(
    codexPayloadAuthorizationPhaseError([process.execPath, cli, 'review', 'publish'], 'final-reviewer-lane'),
    undefined,
  );
  assert.match(
    codexPayloadAuthorizationPhaseError([process.execPath, cli, 'review', 'check'], 'final-reviewer-lane') ?? '',
    /requires an exact trusted host-observed CLI phase/,
  );
  for (const phase of [['status'], ['resume'], ['require', 'frame']] as const) {
    assert.equal(
      codexPayloadAuthorizationPhaseError(
        [process.execPath, cli, 'stage', ...phase],
        'adaptive-route-authority',
      ),
      undefined,
    );
  }
  for (const operation of [
    ['brief', 'frame'],
    ['composition', '--check'],
    ['deliberate', 'check'],
    ['completion', 'preflight'],
    ['workflow', 'show'],
    ['evidence', 'v2', 'finalize'],
    ['repair', 'publish'],
    ['source', '--seal'],
    ['lifecycle', 'run'],
    ['owner', 'run'],
  ] as const) {
    assert.equal(
      codexPayloadAuthorizationPhaseError(
        [process.execPath, cli, ...operation],
        'adaptive-route-authority',
      ),
      undefined,
    );
  }
});

test('final evidence verification may reauthorize only a typed trusted browser receipt', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  const finalize = [process.execPath, cli, 'evidence', 'v2', 'finalize'];
  const check = [process.execPath, cli, 'evidence', 'v2', 'check'];
  const preflight = [process.execPath, cli, 'completion', 'preflight'];
  assert.equal(
    isCodexFinalEvidenceContinuationPayload(
      finalize,
      'product-probe-result',
      { schema: 'trusted-browser-receipt-v1' },
    ),
    true,
  );
  assert.equal(
    isCodexFinalEvidenceContinuationPayload(
      check,
      'product-probe-result',
      { schema: 'trusted-browser-receipt-v1' },
    ),
    true,
  );
  assert.equal(
    isCodexFinalEvidenceContinuationPayload(
      preflight,
      'product-probe-result',
      { schema: 'trusted-browser-receipt-v1' },
    ),
    true,
  );
  assert.equal(
    isCodexFinalEvidenceContinuationPayload(
      finalize,
      'product-probe-result',
      { schema: 'trusted-lifecycle-manifest-v1' },
    ),
    false,
  );
});

test('Codex resolution ignores project-controlled PATH and returns a canonical regular executable', () => {
  const root = project('omd-codex-path-substitution-');
  const projectBin = join(root, 'bin');
  const trustedBin = mkdtempSync(join(tmpdir(), 'omd-trusted-codex-bin-'));
  mkdirSync(projectBin);
  executable(join(projectBin, 'codex'), 'process.exit(91);');
  const trustedTarget = executable(join(trustedBin, 'codex-target'), 'process.exit(0);');
  symlinkSync(trustedTarget, join(trustedBin, 'codex'));
  try {
    const resolved = resolveCodexHostExecutable('codex', { ...process.env, PATH: `${projectBin}:${trustedBin}` }, root);
    assert.equal(resolved.path, realpathSync(trustedTarget));
    assert.equal(statSync(resolved.path).isFile(), true);
    assert.equal(resolved.sha256, createHash('sha256').update(readFileSync(trustedTarget)).digest('hex'));
    assert.throws(() => resolveCodexHostExecutable('codex', { ...process.env, PATH: projectBin }, root), /trusted Codex executable/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(trustedBin, { recursive: true, force: true });
  }
});

test('RED hypothesis 2: a greenfield Codex exec receives host-owned receipts and reaches route publication', async () => {
  const root = project('omd-codex-greenfield-');
  const report = join(root, '..', `codex-report-${Date.now()}.json`);
  const codex = routeStub(join(root, '..', `codex-stub-${Date.now()}`), report);
  try {
    const result = await launch(root, codex, report, ['--ephemeral']);
    const audit = join(dirname(result.activationPath), 'authority-audit.jsonl');
    assert.equal(result.status, 0, [
      existsSync(report) ? readFileSync(report, 'utf8') : result.stderr,
      existsSync(audit) ? readFileSync(audit, 'utf8') : '',
    ].join('\n'));
    const observed = JSON.parse(readFileSync(report, 'utf8')) as {
      argv: string[]; status: number; stderr: string; activation: string; loaded: string;
      activationMode: number; loadedMode: number;
    };
    assert.equal(observed.status, 0, observed.stderr);
    assert.equal(observed.argv[0], 'exec');
    assert.equal(observed.argv[1], '--add-dir');
    assert.ok(observed.argv[2]?.startsWith(tmpdir()), 'launcher adds only its private exact-authority channel');
    assert.deepEqual(observed.argv.slice(3), ['-C', root, '--skip-git-repo-check', '--ephemeral', '$omd-ultradesign build the requested interface']);
    assert.equal(observed.argv.includes('--model'), false, 'launcher must preserve user/model config rather than select a model');
    assert.equal(observed.activationMode, 0o400);
    assert.equal(observed.loadedMode, 0o400);
    assert.equal(realpathSync(observed.activation).startsWith(`${realpathSync(root)}${process.platform === 'win32' ? '\\' : '/'}`), false);
    assert.equal(realpathSync(observed.loaded).startsWith(`${realpathSync(root)}${process.platform === 'win32' ? '\\' : '/'}`), false);
    assert.equal(existsSync(join(root, '.omd', 'route.json')), true);
    assert.equal(existsSync(join(root, '.omd', 'receipts', 'activation.json')), true, 'finalization activation evidence is retained');
    assert.equal(existsSync(result.authoritySocketPath), false, 'live authority socket is removed after Codex exits');
    assert.equal(existsSync(result.activationPath), true, 'non-secret finalization evidence is retained');
    assert.equal(existsSync(result.loadedSkillReceiptPath), true, 'loaded-skill evidence is retained');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(report, { force: true });
    rmSync(codex, { force: true });
  }
});

test('RED hypothesis 3: copied and forged project-owned activation files cannot obtain authority', async () => {
  const root = project('omd-codex-copy-reject-');
  const report = join(root, '..', `codex-copy-report-${Date.now()}.json`);
  const codex = routeStub(join(root, '..', `codex-copy-stub-${Date.now()}`), report, `
import { copyFileSync, readFileSync } from 'node:fs';
const copied = root + '/copied-activation.json';
copyFileSync(process.env.OMD_ACTIVATION_PATH, copied);
const value = JSON.parse(readFileSync(copied, 'utf8'));
value.current.briefSha256 = 'f'.repeat(64);
writeFileSync(root + '/forged-activation.json', JSON.stringify(value));
for (const candidate of [copied, root + '/forged-activation.json']) {
  const rejected = spawnSync(process.execPath, [cli, 'config', 'set', 'checkpoint', 'both', '--activation', candidate], { cwd: root, encoding: 'utf8', env: process.env });
  if (rejected.status === 0) process.exit(80);
}
`);
  try {
    const result = await launch(root, codex, report);
    assert.equal(result.status, 0, existsSync(report) ? readFileSync(report, 'utf8') : result.stderr);
    assert.equal(existsSync(join(root, '.omd', 'config.json')), false);
    assert.equal(existsSync(join(root, '.omd', 'route.json')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(report, { force: true });
    rmSync(codex, { force: true });
  }
});

test('Codex activation rejects cross-project use and becomes stale when its host launcher exits', async () => {
  const first = project('omd-codex-first-');
  const second = project('omd-codex-second-');
  const report = join(first, '..', `codex-cross-report-${Date.now()}.json`);
  const staleEnvPath = join(first, '..', `codex-stale-env-${Date.now()}.json`);
  const codex = executable(join(first, '..', `codex-cross-stub-${Date.now()}`), `
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const cli = process.env.OMD_TEST_CLI;
const first = process.env.OMD_TEST_PROJECT;
const second = process.env.OMD_TEST_SECOND;
const cross = spawnSync(process.execPath, [cli, 'config', 'set', 'checkpoint', 'both'], { cwd: second, encoding: 'utf8', env: process.env });
writeFileSync(${JSON.stringify(staleEnvPath)}, JSON.stringify({ activation: process.env.OMD_ACTIVATION_PATH, loaded: process.env.OMD_CODEX_LOADED_SKILL_RECEIPT_PATH, socket: process.env.OMD_CODEX_AUTHORITY_SOCKET, response: process.env.OMD_CODEX_AUTHORITY_RESPONSE_DIR, publicKey: process.env.OMD_CODEX_AUTHORITY_PUBLIC_KEY_PATH, grant: process.env.OMD_CODEX_AUTHORITY_GRANT_PATH }));
writeFileSync(${JSON.stringify(report)}, JSON.stringify({ crossStatus: cross.status, crossStderr: cross.stderr }));
process.exit(cross.status === 0 ? 81 : 0);
`);
  try {
    const result = await runCodexHostExec(['exec', '-C', first, 'cross-project check'], {
      codexBin: codex, packageRoot: ROOT, codexHome: join(first, '..', `codex-home-${Date.now()}`),
      installedSkillRoot: join(ROOT, 'dist', 'codex', 'skills'),
      env: { ...process.env, OMD_TEST_PROJECT: first, OMD_TEST_SECOND: second, OMD_TEST_CLI: CLI },
      receiptRetentionMs: 60_000,
    });
    assert.equal(result.status, 0, result.stderr);
    const cross = JSON.parse(readFileSync(report, 'utf8')) as { crossStatus: number; crossStderr: string };
    assert.notEqual(cross.crossStatus, 0, cross.crossStderr);
    assert.equal(existsSync(join(second, '.omd', 'config.json')), false);

    const stale = JSON.parse(readFileSync(staleEnvPath, 'utf8')) as Record<string, string>;
    const staleRun = spawnSync(process.execPath, [CLI, 'config', 'set', 'checkpoint', 'both'], {
      cwd: first, encoding: 'utf8', env: {
        ...process.env,
        OMD_ACTIVATION_PATH: stale.activation,
        OMD_CODEX_LOADED_SKILL_RECEIPT_PATH: stale.loaded,
        OMD_CODEX_AUTHORITY_SOCKET: stale.socket,
        OMD_CODEX_AUTHORITY_RESPONSE_DIR: stale.response,
        OMD_CODEX_AUTHORITY_PUBLIC_KEY_PATH: stale.publicKey,
        OMD_CODEX_AUTHORITY_GRANT_PATH: stale.grant,
      },
    });
    assert.notEqual(staleRun.status, 0, 'retained receipts must not remain live authority after launcher exit');
    assert.equal(existsSync(join(first, '.omd', 'config.json')), false);
  } finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
    rmSync(report, { force: true });
    rmSync(staleEnvPath, { force: true });
    rmSync(codex, { force: true });
  }
});

test('the package and installer expose the host launcher while preserving the historical bins', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { bin: Record<string, string> };
  assert.equal(manifest.bin.omd, './bin/omd.mjs');
  assert.equal(manifest.bin['oh-my-design'], './bin/omd-install.mjs');
  assert.equal(manifest.bin['omd-codex'], './bin/omd-codex.mjs');
  assert.equal(existsSync(join(ROOT, 'bin', 'omd-codex.mjs')), true);
  assert.ok((statSync(join(ROOT, 'bin', 'omd-codex.mjs')).mode & 0o111) !== 0);
});
