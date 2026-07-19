import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { runBrowserRsSmoke, type BrowserRsSmokeOptions } from '../core/install/browser-rs-smoke.ts';

const PROBE_FIXTURE = fileURLToPath(new URL('./fixtures/probe.html', import.meta.url));
const FAKE_SERVER = fileURLToPath(new URL('./fixtures/browser-rs-stdio-fake.mjs', import.meta.url));
const NORMAL_TIMEOUTS = { responseTimeoutMs: 2_000, processTimeoutMs: 3_000 } as const;
const STALLED_RESPONSE_TIMEOUTS = { responseTimeoutMs: 30, processTimeoutMs: 500 } as const;
const STALLED_PROCESS_TIMEOUTS = { responseTimeoutMs: 2_000, processTimeoutMs: 500 } as const;

type Fixture = {
  readonly root: string;
  readonly outputPath: string;
};
type Timeouts = { readonly responseTimeoutMs: number; readonly processTimeoutMs: number };

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-rs-smoke-'));
  return { root, outputPath: join(root, 'browser-rs.png') };
}

function options(item: Fixture, mode: string, timeouts: Timeouts = NORMAL_TIMEOUTS, extraEnvironment: NodeJS.ProcessEnv = {}): BrowserRsSmokeOptions {
  return {
    binary: process.execPath,
    fixturePath: PROBE_FIXTURE,
    outputPath: item.outputPath,
    temporaryDirectory: item.root,
    responseTimeoutMs: timeouts.responseTimeoutMs,
    processTimeoutMs: timeouts.processTimeoutMs,
    spawn: (_binary, _args, environment) => spawn(process.execPath, [FAKE_SERVER, mode], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...environment, OMD_FAKE_TEMPORARY_DIRECTORY: item.root, ...extraEnvironment } }),
  };
}

function cleaned(item: Fixture, profilePath: string | undefined): void {
  assert.equal(profilePath === undefined ? false : existsSync(profilePath), false, 'unique browser profile must be removed');
  assert.deepEqual(readdirSync(item.root).sort(), existsSync(item.outputPath) ? ['browser-rs.png'] : [], 'temporary smoke artifacts must be removed');
}

function foreignScreenshot(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-rs-foreign-'));
  const outputPath = join(root, 'ab-foreign.png');
  writeFileSync(outputPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64'));
  return { root, outputPath };
}

test('Given a conforming local stdio server When smoke runs Then it proves the fixture flow and cleans resources', async () => {
  const item = fixture();
  try {
    // Given: a local-only fixture and a fake server that enforces each MCP action.

    // When: the exported CLI-independent smoke API runs its bounded protocol.
    const result = await runBrowserRsSmoke(options(item, 'success'));

    // Then: it writes a decoded PNG, retains stderr evidence, and releases its loopback server/profile.
    assert.equal(result.typedName, 'OMD Smoke User');
    assert.match(result.snapshot, /Ready: OMD Smoke User/);
    assert.match(result.stderr, /fake browser-rs stderr/);
    assert.ok(statSync(item.outputPath).size > 0, 'screenshot PNG must be non-empty');
    await assert.rejects(fetch(result.fixtureUrl, { signal: AbortSignal.timeout(250) }));
    cleaned(item, result.profilePath);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('Given a server missing a required tool When smoke runs Then it fails after browser/profile cleanup', async () => {
  const item = fixture();
  try {
    // Given: tools/list omits browser_click.

    // When: smoke validates the provider capability set.
    await assert.rejects(runBrowserRsSmoke(options(item, 'missing-tool')), /browser_click/);

    // Then: neither a profile nor an output screenshot remains.
    cleaned(item, undefined);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('Given missing, null, scalar, or array tools capabilities When smoke initializes Then it rejects before browser actions', async () => {
  for (const mode of ['missing-tools-capability', 'null-tools-capability', 'scalar-tools-capability', 'array-tools-capability']) {
    const item = fixture();
    const trace = fixture();
    writeFileSync(trace.outputPath, '');
    try {
      // Given: initialize returns a malformed MCP tools capability shape.

      // When: smoke validates the initialize result before notifying or listing tools.
      await assert.rejects(runBrowserRsSmoke(options(item, mode, NORMAL_TIMEOUTS, { OMD_FAKE_METHOD_LOG: trace.outputPath })), /tools capability/);

      // Then: only initialize reached the fake and no profile or published screenshot remains.
      assert.deepEqual(readFileSync(trace.outputPath, 'utf8').trim().split('\n'), ['initialize']);
      cleaned(item, undefined);
    } finally {
      rmSync(item.root, { recursive: true, force: true });
      rmSync(trace.root, { recursive: true, force: true });
    }
  }
});

test('Given malformed JSON-RPC output When smoke runs Then it rejects and tears down', async () => {
  const item = fixture();
  try {
    // Given: the provider writes invalid JSON for initialize.

    // When: smoke reads the response line.
    await assert.rejects(runBrowserRsSmoke(options(item, 'malformed-json')), /malformed JSON/);

    // Then: local resources are removed.
    cleaned(item, undefined);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('Given a stalled response When smoke runs Then it enforces the configured timeout and tears down', async () => {
  const item = fixture();
  try {
    // Given: tools/list intentionally has no response.

    // When: smoke awaits the bounded protocol reply.
    await assert.rejects(runBrowserRsSmoke(options(item, 'timeout', STALLED_RESPONSE_TIMEOUTS)), /timed out/);

    // Then: its temporary profile and loopback fixture are gone.
    cleaned(item, undefined);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('Given an early provider exit When smoke runs Then it reports the process failure and cleans resources', async () => {
  const item = fixture();
  try {
    // Given: the provider exits during tools/list.

    // When: smoke awaits that request.
    await assert.rejects(runBrowserRsSmoke(options(item, 'early-exit')), /exited/);

    // Then: no profile or screenshot survives.
    cleaned(item, undefined);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('Given a non-2.0 provider response When smoke runs Then it rejects the protocol message and cleans resources', async () => {
  const item = fixture();
  try {
    // Given: initialize replies with a JSON-RPC version other than 2.0.

    // When: smoke reads the protocol response.
    await assert.rejects(runBrowserRsSmoke(options(item, 'wrong-jsonrpc')), /JSON-RPC version/);

    // Then: no profile or output remains.
    cleaned(item, undefined);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('Given an MCP tool error result When smoke runs Then it fails before treating the tool content as success', async () => {
  const item = fixture();
  try {
    // Given: browser_click returns a result with isError true and an actionable text payload.

    // When: smoke processes the tool result.
    await assert.rejects(runBrowserRsSmoke(options(item, 'tool-is-error')), /reported an error: click rejected by provider/);

    // Then: no output, profile, server, or provider screenshot remains.
    cleaned(item, undefined);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('Given an unterminated oversized stdout line When smoke runs Then it bounds memory and kills the provider', async () => {
  const item = fixture();
  try {
    // Given: initialize writes more than the allowed line length without a newline or response.

    // When: smoke receives provider stdout.
    await assert.rejects(runBrowserRsSmoke(options(item, 'oversized-line')), /stdout line exceeded/);

    // Then: the bounded shutdown removes the profile, server, staged output, and provider process.
    cleaned(item, undefined);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('Given an oversized JSON-RPC response When smoke runs Then it rejects the message and kills the provider', async () => {
  const item = fixture();
  try {
    // Given: initialize returns a newline-delimited JSON response over the allowed size.

    // When: smoke reads that provider response.
    await assert.rejects(runBrowserRsSmoke(options(item, 'oversized-json')), /JSON-RPC response exceeded/);

    // Then: the bounded shutdown removes the profile, server, staged output, and provider process.
    cleaned(item, undefined);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('Given excessive provider stderr When smoke succeeds Then it returns a bounded diagnostic capture', async () => {
  const item = fixture();
  try {
    // Given: provider stderr exceeds the diagnostic capture bound.

    // When: the otherwise conforming smoke scenario completes.
    const result = await runBrowserRsSmoke(options(item, 'oversized-stderr'));

    // Then: stderr remains bounded and normal output/cleanup still succeeds.
    assert.equal(result.stderr.length, 64 * 1024);
    cleaned(item, result.profilePath);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('Given an incomplete snapshot result When smoke runs Then it rejects the missing visible-panel proof', async () => {
  const item = fixture();
  try {
    // Given: the post-click snapshot omits the ready panel.

    // When: smoke checks the user-visible outcome.
    await assert.rejects(runBrowserRsSmoke(options(item, 'wrong-result')), /visible Ready panel/);

    // Then: local resources are removed.
    cleaned(item, undefined);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('Given a stale snapshot When smoke runs Then it rejects an unproven typed name after the click', async () => {
  const item = fixture();
  try {
    // Given: type and click report success but the fresh snapshot omits the resulting name.

    // When: smoke validates the visible interaction outcome.
    await assert.rejects(runBrowserRsSmoke(options(item, 'stale-snapshot')), /typed name/);

    // Then: the staged output, profile, server, and temporary screenshot are removed.
    cleaned(item, undefined);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('Given a non-PNG screenshot result When smoke runs Then it rejects the bytes before publishing output', async () => {
  const item = fixture();
  try {
    // Given: browser_take_screenshot reports a path containing invalid image bytes.

    // When: smoke validates the provider screenshot.
    await assert.rejects(runBrowserRsSmoke(options(item, 'invalid-png')), /valid PNG/);

    // Then: no output or profile remains.
    cleaned(item, undefined);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('Given a malformed screenshot result When smoke runs Then it removes every staged artifact', async () => {
  const item = fixture();
  try {
    // Given: browser_take_screenshot returns no parseable temporary path.

    // When: smoke parses the screenshot result.
    await assert.rejects(runBrowserRsSmoke(options(item, 'malformed-screenshot')), /temporary PNG path/);

    // Then: no final output, profile, server, or provider screenshot remains.
    cleaned(item, undefined);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('Given a base64 screenshot result When smoke runs Then it rejects the unowned payload and cleans up', async () => {
  const item = fixture();
  try {
    // Given: browser_take_screenshot returns an inline base64 data URL.

    // When: smoke enforces the pinned provider's temporary-file contract.
    await assert.rejects(runBrowserRsSmoke(options(item, 'base64-screenshot')), /temporary PNG path/);

    // Then: no final output, profile, server, or provider screenshot remains.
    cleaned(item, undefined);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('Given an unowned screenshot path When smoke runs Then it rejects the path without publishing output', async () => {
  const item = fixture();
  try {
    // Given: browser_take_screenshot names a temporary file outside the v0.1.10 ab-<page>.png contract.

    // When: smoke validates the provider result path.
    await assert.rejects(runBrowserRsSmoke(options(item, 'external-screenshot')), /temporary PNG path/);

    // Then: no final output, profile, server, or provider screenshot remains.
    cleaned(item, undefined);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('Given another temporary ab-foreign.png When smoke runs Then it preserves that unowned path', async () => {
  const item = fixture();
  const foreign = foreignScreenshot();
  try {
    // Given: the provider returns a valid contract-shaped PNG path in another temporary directory.

    // When: smoke validates the exact screenshot path it requested.
    await assert.rejects(runBrowserRsSmoke(options(item, 'foreign-contract-screenshot', NORMAL_TIMEOUTS, { OMD_FAKE_FOREIGN_SCREENSHOT: foreign.outputPath })), /owned screenshot path/);

    // Then: it neither publishes the file nor deletes the foreign PNG.
    assert.equal(existsSync(foreign.outputPath), true, 'unowned screenshot must be preserved');
    cleaned(item, undefined);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
    rmSync(foreign.root, { recursive: true, force: true });
  }
});

test('Given a provider that does not exit When smoke runs Then it kills the process without publishing staged output', async () => {
  const item = fixture();
  try {
    // Given: every tool succeeds but the provider ignores stdin closure.

    // When: smoke reaches its bounded process-exit wait.
    await assert.rejects(runBrowserRsSmoke(options(item, 'process-timeout', STALLED_PROCESS_TIMEOUTS)), /did not exit/);

    // Then: the temporary profile, upstream screenshot, and unpublished output are gone.
    cleaned(item, undefined);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});
