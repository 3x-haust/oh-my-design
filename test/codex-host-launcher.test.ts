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
  isExactCanonicalCliInvocation,
  parseCodexHostPayloadAuthorization,
  resolveCodexHostExecutable,
  runCodexHostExec,
  type CodexHostLaunchResult,
} from '../adapters/codex-host-launcher.ts';

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
  assert.match(
    codexPayloadAuthorizationPhaseError([process.execPath, cli, 'evidence', 'v2', 'finalize'], 'final-reviewer-lane') ?? '',
    /requires an exact trusted host-observed CLI phase/,
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
