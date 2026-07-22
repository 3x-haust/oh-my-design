import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command: string, args: readonly string[], cwd: string, input?: string) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', input });
  if (result.error) throw result.error;
  return result;
}

test('packed reviewer evidence proxy starts its shipped MCP runtime', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'omd-installed-reviewer-proxy-'));
  const packs = join(temporary, 'packs');
  const consumer = join(temporary, 'consumer');
  try {
    mkdirSync(packs); mkdirSync(consumer);
    const packed = run(NPM, ['pack', '--json', '--ignore-scripts', '--pack-destination', packs], ROOT);
    assert.equal(packed.status, 0, packed.stderr);
    const archive = join(packs, (JSON.parse(packed.stdout) as readonly { filename: string }[])[0]!.filename);
    const installed = run(NPM, ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', archive], consumer);
    assert.equal(installed.status, 0, installed.stderr);
    const packageRoot = join(consumer, 'node_modules', '@3xhaust', 'oh-my-design');
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { bin: Record<string, string> };
    const entry = manifest.bin['omd-reviewer-evidence-proxy'];
    if (entry === undefined) throw new Error('packed manifest has no reviewer evidence proxy bin');
    assert.match(entry, /^\.\/bin\/.*\.mjs$/);
    assert.equal(existsSync(join(packageRoot, entry)), true);
    const executable = process.platform === 'win32' ? join(packageRoot, entry) : join(consumer, 'node_modules', '.bin', 'omd-reviewer-evidence-proxy');
    const launchId = '00000000-0000-4000-8000-000000000000';
    const proxyArgs = [
      '--launch-id', launchId,
      '--configuration-sha256', 'a'.repeat(64),
      '--socket', join(realpathSync(tmpdir()), `o-${createHash('sha256').update(launchId).digest('hex').slice(0, 16)}`),
      '--runner-id', 'packed-runtime-test-runner',
      '--session-id', 'packed-runtime-test-session',
      '--nonce', 'packed-runtime-test-nonce',
    ];
    const started = process.platform === 'win32'
      ? run(process.execPath, [executable, ...proxyArgs], temporary, '{"jsonrpc":"2.0","id":1,"method":"initialize"}\n')
      : run(executable, proxyArgs, temporary, '{"jsonrpc":"2.0","id":1,"method":"initialize"}\n');
    assert.equal(started.status, 0, started.stderr);
    assert.match(started.stdout, /"serverInfo":\{"name":"omd-reviewer-evidence-proxy","version":"1"\}/);
    assert.doesNotMatch(started.stderr, /ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING/);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
