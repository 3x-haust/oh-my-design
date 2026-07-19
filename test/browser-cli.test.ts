import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const CLI = fileURLToPath(new URL('../bin/omd-install.ts', import.meta.url));
const PROBE = fileURLToPath(new URL('./fixtures/probe.html', import.meta.url));
const FAKE = fileURLToPath(new URL('./fixtures/browser-rs-stdio-fake.mjs', import.meta.url));

function run(args: readonly string[], environment: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: environment });
}

test('Given an isolated provider When browser CLI commands run Then stdout, JSON, exits, and bounded smoke are correct', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-cli-'));
  const provider = join(root, 'browser-rs');
  const broken = join(root, 'broken-browser-rs');
  const output = join(root, 'smoke.png');
  const claude = join(root, '.claude');
  const environment = {
    ...process.env,
    HOME: root,
    CLAUDE_CONFIG_DIR: claude,
    CODEX_HOME: join(root, '.missing-codex'),
    PATH: join(root, 'empty'),
    OMD_BROWSER_RS_BIN: provider,
    OMD_TEST_NODE: process.execPath,
    OMD_TEST_FAKE: FAKE,
  };
  try {
    writeFileSync(provider, '#!/bin/sh\nif [ "$1" = "--version" ]; then printf "Error: connection closed: initialize request\\n" >&2; exit 1; fi\nif [ "$1" = "--help" ]; then printf "%s\\n" "browser-rs — stealth MCP browser (stdio or HTTP)" "" "Usage: browser-rs [OPTIONS]" "" "Options:" "      --headless" "      --user-data-dir <USER_DATA_DIR>"; exit 0; fi\nexec "$OMD_TEST_NODE" "$OMD_TEST_FAKE" "${OMD_FAKE_MODE:-success}"\n');
    writeFileSync(broken, '#!/bin/sh\necho "broken provider" >&2\nexit 9\n');
    chmodSync(provider, 0o755);
    chmodSync(broken, 0o755);
    mkdirSync(claude, { recursive: true });

    const browserInstall = run(['browser', 'install', '--json'], environment);
    const browserDoctor = run(['browser', 'doctor', '--json'], environment);
    const smoke = run(['browser', 'smoke', '--fixture', PROBE, '--out', output, '--json'], environment);
    const smokeFailure = run(['browser', 'smoke', '--fixture', PROBE, '--out', join(root, 'failed.png'), '--json'], { ...environment, OMD_FAKE_MODE: 'tool-is-error' });
    const smokeTimeout = run(['browser', 'smoke', '--fixture', PROBE, '--out', join(root, 'timed-out.png'), '--json'], { ...environment, OMD_FAKE_MODE: 'timeout' });
    const hostInstall = run(['install', '--host=claude'], environment);
    const hostDoctor = run(['doctor', '--host=claude'], environment);
    const missingEnvironment: NodeJS.ProcessEnv = {
      HOME: root,
      CLAUDE_CONFIG_DIR: claude,
      CODEX_HOME: join(root, '.missing-codex'),
      PATH: join(root, 'empty'),
      OMD_TEST_NODE: process.execPath,
      OMD_TEST_FAKE: FAKE,
    };
    const missingDoctor = run(['doctor', '--host=claude'], missingEnvironment);
    const missingBrowserDoctor = run(['browser', 'doctor', '--json'], missingEnvironment);
    const badDoctor = run(['doctor', '--host=claude'], { ...environment, OMD_BROWSER_RS_BIN: broken });
    const missingSmoke = run(['browser', 'smoke', '--fixture', PROBE], environment);

    assert.equal(browserInstall.status, 0, browserInstall.stderr);
    assert.equal(JSON.parse(browserInstall.stdout).kind, 'present');
    assert.equal(browserDoctor.status, 0, browserDoctor.stderr);
    assert.equal(JSON.parse(browserDoctor.stdout).browser.kind, 'healthy');
    assert.equal(JSON.parse(browserDoctor.stdout).browser.version, 'compatible (version unknown)');
    assert.equal(smoke.status, 0, smoke.stderr);
    assert.equal(JSON.parse(smoke.stdout).typedName, 'OMD Smoke User');
    assert.equal(existsSync(output), true);
    assert.equal(smokeFailure.status, 1);
    assert.equal(JSON.parse(smokeFailure.stdout).kind, 'failed');
    assert.match(JSON.parse(smokeFailure.stdout).error, /click rejected by provider/);
    assert.equal(smokeFailure.stderr, '');
    assert.equal(smokeTimeout.status, 1);
    assert.equal(JSON.parse(smokeTimeout.stdout).kind, 'failed');
    assert.match(JSON.parse(smokeTimeout.stdout).error, /timed out/);
    assert.equal(smokeTimeout.stderr, '');
    assert.equal(hostInstall.status, 0, hostInstall.stderr);
    assert.match(hostInstall.stdout, /browser-rs: present/);
    assert.equal(hostDoctor.status, 0, hostDoctor.stderr);
    assert.match(hostDoctor.stdout, /browser-rs provider/);
    assert.equal(missingDoctor.status, 1);
    assert.match(missingDoctor.stdout, /\[FAIL\] browser-rs provider/);
    assert.equal(missingBrowserDoctor.status, 1);
    assert.equal(JSON.parse(missingBrowserDoctor.stdout).browser.kind, 'unhealthy');
    assert.equal(badDoctor.status, 1);
    assert.match(badDoctor.stdout, /broken provider/);
    assert.equal(missingSmoke.status, 1);
    assert.match(missingSmoke.stderr, /usage: oh-my-design/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
