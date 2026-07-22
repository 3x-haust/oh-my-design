import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse as parseToml } from 'smol-toml';
import { parse as parseYaml } from 'yaml';
import { canonicalSkillSourceBytes, createBuildIdentity } from '../adapters/build.ts';
import {
  CODEX_LOADED_SKILL_RECEIPT_SCHEMA_VERSION,
  emitCodex,
  observeCodexLoadedSkill,
  preflightCodexV2Publication,
} from '../adapters/codex.ts';
import {
  CLAUDE_LOADED_SKILL_RECEIPT_SCHEMA_VERSION,
  createClaudeLoadedSkillReceipt,
  emitClaude,
  observeClaudeLoadedSkill,
  preflightClaudeV2,
} from '../adapters/claude.ts';
import { createReviewerMcpAdapter, type ReviewerHost } from '../adapters/reviewer-mcp.ts';
import { jsonFile, must, textFile } from './helpers.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

interface AgentToml {
  name?: string;
  description?: string;
  model?: string;
  model_reasoning_effort?: string;
  developer_instructions?: string;
  [key: string]: unknown;
}

// Found in review: agent fields were interpolated into TOML and YAML unescaped.
const NASTY = {
  name: 'omd-eye',
  description: 'Critiques "rendered" output: never edits. C:\\path\\to',
  reasoning: 'high',
  deny: ['Write', 'Edit', 'apply_patch'],
  instructions: 'Quote test: """ and a backslash \\ and a colon: here.\n',
};
const V2_SKILL_BYTES = '---\nname: omd-v2\n---\nloaded bytes\n';
const V2_SOURCE_SKILLS = [{
  name: 'omd-v2',
  description: 'Activation contract.',
  source: V2_SKILL_BYTES,
}];
const V2_LOADED_SKILL_BYTES = canonicalSkillSourceBytes(V2_SOURCE_SKILLS);
const V2_BUILD = createBuildIdentity('0.18.0', [NASTY], V2_SOURCE_SKILLS);
const BRIEF_SHA256 = 'b'.repeat(64);
const reviewerAdapters = new Set<ReturnType<typeof createReviewerMcpAdapter>>();
after(() => {
  for (const adapter of reviewerAdapters) adapter.dispose();
});
const reviewerReceipt = (host: ReviewerHost, adapter = createReviewerMcpAdapter()) => {
  reviewerAdapters.add(adapter);
  return {
    adapter,
    receipt: adapter.launch({
      host,
      buildSha256: V2_BUILD.buildSha256,
      loadedSkillSha256: V2_BUILD.sourceSkillSha256,
      briefSha256: BRIEF_SHA256,
      evidence: 'review evidence',
    }),
  };
};
const reviewerBundle = (host: ReviewerHost, loadedSkillReceipt: object) => {
  const { adapter, receipt } = reviewerReceipt(host);
  return adapter.launchBundle({
    loadedSkillReceipt: adapter.observeLoadedSkill(host, loadedSkillReceipt, V2_BUILD.sourceSkillSha256),
    reviewerLaunchReceipt: receipt,
  });
};

test('Claude v2 preflight rejects caller-created loaded-skill receipts', () => {
  const receipt = createClaudeLoadedSkillReceipt('0.18.0', V2_LOADED_SKILL_BYTES);
  assert.throws(
    () => preflightClaudeV2({
      buildIdentity: V2_BUILD,
      loadedSkillReceipt: receipt,
      briefSha256: BRIEF_SHA256,
      reviewerLaunchBundle: reviewerBundle('claude', receipt),
    }),
    /host-observed loaded-skill/,
  );
  assert.throws(
    () => observeClaudeLoadedSkill(V2_BUILD, '0.17.0', V2_LOADED_SKILL_BYTES),
    /does not match the installed build/,
  );
});

test('Claude v2 preflight accepts the exact bundle-attached loaded build receipt', () => {
  const receipt = observeClaudeLoadedSkill(V2_BUILD, '0.18.0', V2_LOADED_SKILL_BYTES);
  const activation = preflightClaudeV2({
    buildIdentity: V2_BUILD,
    loadedSkillReceipt: receipt,
    briefSha256: BRIEF_SHA256,
    reviewerLaunchBundle: reviewerBundle('claude', receipt),
  });
  assert.equal(receipt.schemaVersion, CLAUDE_LOADED_SKILL_RECEIPT_SCHEMA_VERSION);
  assert.deepEqual(activation, {
    schemaVersion: 'activation-context-v2',
    buildSha256: V2_BUILD.buildSha256,
    loadedSkillSha256: V2_BUILD.sourceSkillSha256,
    briefSha256: BRIEF_SHA256,
    hostCapability: { host: 'claude' },
  });
});

test('Codex blocks raw self-attested loaded-skill receipts while legacy adapter emission remains valid', () => {
  const selfAttested = {
    schemaVersion: CODEX_LOADED_SKILL_RECEIPT_SCHEMA_VERSION,
    loadedSkillSha256: V2_BUILD.sourceSkillSha256,
  } as const;
  assert.throws(
    () => preflightCodexV2Publication({
      buildIdentity: V2_BUILD,
      loadedSkillReceipt: selfAttested,
      briefSha256: BRIEF_SHA256,
      reviewerLaunchBundle: reviewerBundle('codex', selfAttested),
    }),
    /host-observed loaded-skill/,
  );
  assert.doesNotThrow(() => emitCodex({ agents: [NASTY] }));
});

test('Codex v2 preflight accepts a host-owned launch bundle', () => {
  const receipt = observeCodexLoadedSkill(V2_BUILD, V2_LOADED_SKILL_BYTES);
  const activation = preflightCodexV2Publication({
    buildIdentity: V2_BUILD,
    loadedSkillReceipt: receipt,
    briefSha256: BRIEF_SHA256,
    reviewerLaunchBundle: reviewerBundle('codex', receipt),
  });
  assert.deepEqual(activation, {
    schemaVersion: 'activation-context-v2',
    buildSha256: V2_BUILD.buildSha256,
    loadedSkillSha256: V2_BUILD.sourceSkillSha256,
    briefSha256: BRIEF_SHA256,
    hostCapability: { host: 'codex' },
  });
});
test('adapter activations expose no caller-selectable authority fields', () => {
  const receipt = observeCodexLoadedSkill(V2_BUILD, V2_LOADED_SKILL_BYTES);
  const activation = preflightCodexV2Publication({
    buildIdentity: V2_BUILD,
    loadedSkillReceipt: receipt,
    briefSha256: BRIEF_SHA256,
    reviewerLaunchBundle: reviewerBundle('codex', receipt),
  });
  assert.deepEqual(activation, {
    schemaVersion: 'activation-context-v2',
    buildSha256: V2_BUILD.buildSha256,
    loadedSkillSha256: V2_BUILD.sourceSkillSha256,
    briefSha256: BRIEF_SHA256,
    hostCapability: { host: 'codex' },
  });
  assert.equal('reviewerIsolation' in activation.hostCapability, false);
});

test('reviewer launch bundles reject copied configuration and cross-adapter receipts', () => {
  const claudeReceipt = observeClaudeLoadedSkill(V2_BUILD, '0.18.0', V2_LOADED_SKILL_BYTES);
  const { adapter: claudeAdapter, receipt: claudeReviewerReceipt } = reviewerReceipt('claude');
  const bundle = claudeAdapter.launchBundle({
    loadedSkillReceipt: claudeAdapter.observeLoadedSkill('claude', claudeReceipt, V2_BUILD.sourceSkillSha256),
    reviewerLaunchReceipt: claudeReviewerReceipt,
  });
  assert.throws(
    () => claudeAdapter.requireConfiguration(
      { mcpServers: { ...bundle.configuration.mcpServers } },
      bundle.reviewerLaunchReceipt,
      'claude',
    ),
    /not issued by the host reviewer launcher/,
  );
  assert.throws(
    () => claudeAdapter.requireLaunchBundle({ ...bundle }, 'claude'),
    /not issued by this host reviewer launcher/,
  );
  assert.throws(
    () => claudeAdapter.launchBundle({
      loadedSkillReceipt: bundle.loadedSkillReceipt,
      reviewerLaunchReceipt: { ...bundle.reviewerLaunchReceipt },
    }),
    /not bound to this host evidence proxy/,
  );
  const codexAdapter = createReviewerMcpAdapter();
  const codexReceipt = observeCodexLoadedSkill(V2_BUILD, V2_LOADED_SKILL_BYTES);
  assert.throws(
    () => codexAdapter.launchBundle({
      loadedSkillReceipt: codexAdapter.observeLoadedSkill('codex', codexReceipt, V2_BUILD.sourceSkillSha256),
      reviewerLaunchReceipt: claudeReviewerReceipt,
    }),
    /not bound to this host evidence proxy/,
  );
});

test('reviewer emission exposes only the opaque evidence MCP server', () => {
  const receipt = observeCodexLoadedSkill(V2_BUILD, V2_LOADED_SKILL_BYTES);
  const bundle = reviewerBundle('codex', receipt);
  const emitted = emitCodex({
    reviewer: { reviewerLaunchBundle: bundle },
  });
  assert.deepEqual(jsonFile(emitted, '.mcp.json'), {
    mcpServers: {
      'omd-reviewer-evidence': {
        command: 'omd-reviewer-evidence-proxy',
        args: bundle.configuration.mcpServers['omd-reviewer-evidence'].args,
      },
    },
  });
});
test('reviewer preflight rejects generic adapter emission and omitted evidence authority', () => {
  const codexReceipt = observeCodexLoadedSkill(V2_BUILD, V2_LOADED_SKILL_BYTES);
  const claudeReceipt = observeClaudeLoadedSkill(V2_BUILD, '0.18.0', V2_LOADED_SKILL_BYTES);
  assert.throws(
    () => preflightCodexV2Publication({ buildIdentity: V2_BUILD, loadedSkillReceipt: codexReceipt, briefSha256: BRIEF_SHA256 } as never),
    /requires an evidence launch bundle/,
  );
  assert.throws(
    () => preflightClaudeV2({ buildIdentity: V2_BUILD, loadedSkillReceipt: claudeReceipt, briefSha256: BRIEF_SHA256 } as never),
    /requires an evidence launch bundle/,
  );
  assert.throws(
    () => createReviewerMcpAdapter().launch({
      host: 'codex',
      buildSha256: V2_BUILD.buildSha256,
      loadedSkillSha256: V2_BUILD.sourceSkillSha256,
      briefSha256: BRIEF_SHA256,
      evidence: '',
    }),
    /non-empty evidence bundle/,
  );
  const genericCodex = emitCodex({ agents: [NASTY] });
  const genericClaude = emitClaude({ agents: [NASTY] });
  assert.equal('omd-reviewer-evidence' in (jsonFile(genericCodex, '.mcp.json') as { mcpServers: object }).mcpServers, false);
  assert.equal('omd-reviewer-evidence' in (jsonFile(genericClaude, '.mcp.json') as { mcpServers: object }).mcpServers, false);
});

test('codex agent toml survives quotes, colons and backslashes', () => {
  const toml = textFile(emitCodex({ agents: [NASTY] }), 'agents/omd-eye.toml');
  const parsed = parseToml(toml) as unknown as AgentToml;
  assert.equal(parsed.name, 'omd-eye');
  assert.equal(parsed.description, NASTY.description);
  assert.equal(parsed.model, undefined, 'model must be absent — agents inherit session model');
  assert.ok(must(parsed.developer_instructions, 'developer_instructions').includes('Quote test:'));
});

test('claude agent frontmatter survives quotes and colons', () => {
  const md = textFile(emitClaude({ agents: [NASTY] }), 'agents/omd-eye.md');
  const fm = parseYaml(must(md.split('---')[1], 'frontmatter'));
  assert.equal(fm.name, 'omd-eye');
  assert.equal(fm.model, undefined, 'model must be absent — agents inherit session model');
  assert.ok(fm.description.includes('"rendered"'));
  assert.ok(md.includes('Quote test:'));
});

// Found in review: Codex agent TOML has no tool-restriction key at all. Claude Code
// enforces `deny` declaratively; Codex can only be told. Dropping `deny` on the floor
// would let omd-eye edit the very files it is supposed to judge from the outside.
test('claude enforces deny declaratively', () => {
  const md = textFile(emitClaude({ agents: [NASTY] }), 'agents/omd-eye.md');
  const fm = parseYaml(must(md.split('---')[1], 'frontmatter'));
  assert.equal(fm.disallowedTools, 'Write, Edit, apply_patch');
});

test('codex carries deny into the prompt, since it cannot carry it into policy', () => {
  const toml = textFile(emitCodex({ agents: [NASTY] }), 'agents/omd-eye.toml');
  const cfg = parseToml(toml) as unknown as AgentToml;
  const instructions = must(cfg.developer_instructions, 'developer_instructions');
  assert.match(instructions, /never call Write, Edit, apply_patch/);
  for (const key of ['tools', 'allowed_tools', 'disallowed_tools', 'permissions']) {
    assert.equal((parseToml(toml) as unknown as AgentToml)[key], undefined, `codex agent schema has no ${key}; do not invent one`);
  }
});

test('an agent with no deny list gets no denial prose', () => {
  const plain = { ...NASTY, deny: [] };
  const toml = textFile(emitCodex({ agents: [plain] }), 'agents/omd-eye.toml');
  const cfg = parseToml(toml) as unknown as AgentToml;
  const instructions = must(cfg.developer_instructions, 'developer_instructions');
  assert.ok(!/HARD CONSTRAINT/.test(instructions));
});

// ── CLAUDE_PLUGIN_ROOT must never appear in emitted output ──
//
// Regression gate: if any src agent or skill reintroduces ${CLAUDE_PLUGIN_ROOT},
// the emitters for both hosts will carry a path that resolves to nothing on Codex
// (and is fragile on Claude Code too). Both codex and claude emission are checked
// so a host-conditional reintroduction does not slip through.

function loadRealAgents(): import('../core/types.ts').AbstractAgent[] {
  const dir = join(root, 'src', 'agents');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.agent.yaml'))
    .map((f) => parseYaml(readFileSync(join(dir, f), 'utf8')) as import('../core/types.ts').AbstractAgent);
}

function loadRealSkillSources(): string[] {
  const dir = join(root, 'src', 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => join(dir, name, 'SKILL.md'))
    .filter((p) => existsSync(p))
    .map((p) => readFileSync(p, 'utf8'));
}

test('no CLAUDE_PLUGIN_ROOT in emitted codex agent output', () => {
  const agents = loadRealAgents();
  const dump = JSON.stringify(emitCodex({ agents }).files);
  assert.ok(
    !dump.includes('CLAUDE_PLUGIN_ROOT'),
    `CLAUDE_PLUGIN_ROOT leaked into codex emission — update src agent/skill to use omd pack dir instead`,
  );
});

test('no CLAUDE_PLUGIN_ROOT in emitted claude agent output', () => {
  const agents = loadRealAgents();
  const dump = JSON.stringify(emitClaude({ agents }).files);
  assert.ok(
    !dump.includes('CLAUDE_PLUGIN_ROOT'),
    `CLAUDE_PLUGIN_ROOT leaked into claude emission — update src agent/skill to use omd pack dir instead`,
  );
});

test('no CLAUDE_PLUGIN_ROOT in real skill sources', () => {
  for (const source of loadRealSkillSources()) {
    assert.ok(
      !source.includes('CLAUDE_PLUGIN_ROOT'),
      `CLAUDE_PLUGIN_ROOT found in skill source — update to use omd pack dir instead`,
    );
  }
});

const reviewerSocketPath = (launchId: string) => join(realpathSync(tmpdir()), `o-${createHash('sha256').update(launchId).digest('hex').slice(0, 16)}`);
async function reviewerMcpTranscript(
  receipt: {
    readonly launchId: string;
    readonly configurationSha256: string;
    readonly processBinding: { readonly runnerId: string; readonly sessionId: string; readonly nonce: string };
  },
  requests: readonly object[],
  configurationSha256 = receipt.configurationSha256,
): Promise<Record<string, unknown>[]> {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    bin: Record<string, string>;
  };
  const executable = join(root, manifest.bin['omd-reviewer-evidence-proxy']!);
  const child = spawn(process.execPath, [
    executable,
    '--launch-id', receipt.launchId,
    '--configuration-sha256', configurationSha256,
    '--socket', reviewerSocketPath(receipt.launchId),
    '--runner-id', receipt.processBinding.runnerId,
    '--session-id', receipt.processBinding.sessionId,
    '--nonce', receipt.processBinding.nonce,
  ], { cwd: root });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.end(`${requests.map((request) => JSON.stringify(request)).join('\n')}\n`);
  const status = await new Promise<number | null>((resolvePromise, reject) => {
    child.once('error', reject);
    child.once('exit', resolvePromise);
  });
  assert.equal(status, 0, stderr);
  return stdout.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}
const MCP_INITIALIZE = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };
const MCP_INITIALIZED = { jsonrpc: '2.0', method: 'notifications/initialized', params: {} };
const MCP_TOOLS_LIST = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };
const evidenceToolCall = (id: number) => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: { name: 'read_reviewer_evidence', arguments: {} },
});

test('the correctly bound host invokes the real reviewer MCP proxy once without exposing its launch capability', async () => {
  const loadedSkillReceipt = observeCodexLoadedSkill(V2_BUILD, V2_LOADED_SKILL_BYTES);
  const { adapter, receipt } = reviewerReceipt('codex');
  const bundle = adapter.launchBundle({
    loadedSkillReceipt: adapter.observeLoadedSkill('codex', loadedSkillReceipt, V2_BUILD.sourceSkillSha256),
    reviewerLaunchReceipt: receipt,
  });
  assert.deepEqual(receipt.evidence, { kind: 'brokered', sha256: createHash('sha256').update('review evidence').digest('hex'), byteLength: Buffer.byteLength('review evidence') });
  assert.equal(JSON.stringify(receipt).includes(Buffer.from('review evidence').toString('base64')), false);
  assert.equal(JSON.stringify(bundle.configuration).includes('OMD_REVIEWER_EVIDENCE_LAUNCH_CAPABILITY'), false);
  const otherAdapter = createReviewerMcpAdapter();
  await assert.rejects(
    () => otherAdapter.invokeEvidenceProxy(bundle, [MCP_INITIALIZE]),
    /not issued by this host reviewer launcher/,
  );
  const transcript = await adapter.invokeEvidenceProxy(bundle, [
    MCP_INITIALIZE,
    MCP_INITIALIZED,
    MCP_TOOLS_LIST,
    evidenceToolCall(3),
    evidenceToolCall(4),
  ]);
  assert.equal(transcript.length, 4, 'initialized notification must not receive a response');
  assert.deepEqual((transcript[0]!.result as { capabilities: unknown }).capabilities, { tools: {} });
  assert.deepEqual((transcript[1]!.result as { tools: unknown[] }).tools, [{
    name: 'read_reviewer_evidence',
    description: 'Read the opaque evidence bound to this reviewer launch exactly once.',
    inputSchema: { type: 'object', additionalProperties: false },
  }]);
  assert.deepEqual((transcript[2]!.result as { structuredContent: unknown }).structuredContent, {
    base64: Buffer.from('review evidence').toString('base64'),
    byteLength: Buffer.byteLength('review evidence'),
    sha256: createHash('sha256').update('review evidence').digest('hex'),
  });
  assert.match((transcript[3]!.error as { message: string }).message, /private host launch capability|unknown, reused, or unreadable/);
  otherAdapter.dispose();
  adapter.dispose();
});

test('the reviewer MCP proxy rejects expired bindings and never persists recoverable evidence', async () => {
  const expiredAdapter = createReviewerMcpAdapter(() => 0);
  const byteLimit = (8 * 1024 * 1024) + 1;
  const expired = expiredAdapter.launch({
    host: 'claude',
    buildSha256: V2_BUILD.buildSha256,
    loadedSkillSha256: V2_BUILD.sourceSkillSha256,
    briefSha256: BRIEF_SHA256,
    evidence: new Uint8Array(byteLimit),
    alias: { scope: 'review', expiresAt: new Date(1).toISOString(), byteLimit },
    processBinding: { expiresAt: new Date(1).toISOString() },
  });
  const expiredResponse = await reviewerMcpTranscript(expired, [MCP_INITIALIZE, MCP_INITIALIZED, evidenceToolCall(3)]);
  assert.match(((expiredResponse[1]!.error as { message: string }).message), /private host launch capability|unknown, reused/);
  assert.equal(existsSync(reviewerSocketPath(expired.launchId)), false);
  expiredAdapter.dispose();
});
test('the reviewer proxy rejects a mismatched emitted configuration identity', async () => {
  const { receipt } = reviewerReceipt('codex');
  const transcript = await reviewerMcpTranscript(
    receipt,
    [MCP_INITIALIZE, MCP_INITIALIZED, evidenceToolCall(3)],
    'a'.repeat(64),
  );
  assert.match(((transcript[1]!.error as { message: string }).message), /private host launch capability|binding failed/);
});
