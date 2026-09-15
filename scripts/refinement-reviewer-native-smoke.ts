#!/usr/bin/env node
/**
 * Opt-in transport diagnostic only. This proves that a real Codex reviewer can consume the
 * authenticated one-use MCP image blocks; it is never design-quality or final-evidence proof.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Writable } from 'node:stream';
import { chromium } from 'playwright';
import { parse as parseToml } from 'smol-toml';

import { createReviewerMcpAdapter } from '../adapters/reviewer-mcp.ts';

const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function codexExecutable(): string {
  const requested = option('--codex') ?? process.env.CODEX_CLI_PATH;
  if (requested !== undefined) return realpathSync(requested);
  const found = spawnSync('/usr/bin/which', ['codex'], { encoding: 'utf8', env: process.env });
  if (found.status !== 0 || found.stdout.trim() === '') throw new Error('Codex executable not found');
  return realpathSync(found.stdout.trim());
}

async function diagnosticPng(token: string, kind: 'triangle' | 'circle'): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    const shape = kind === 'triangle'
      ? 'clip-path:polygon(50% 0,100% 100%,0 100%);background:#eb2fb3;'
      : 'border-radius:50%;background:#19bfe8;';
    await page.setContent(`<main style="width:640px;height:360px;display:grid;place-items:center;background:#f4f0e8"><div style="width:250px;height:220px;display:grid;place-items:center;${shape}"><strong style="font:700 46px/1 monospace;color:#111;background:#fff;padding:8px">${token}</strong></div></main>`);
    return await page.screenshot({ type: 'png' });
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const codexBin = codexExecutable();
  const model = option('--model');
  const effort = option('--effort') ?? 'low';
  if (!/^(?:low|medium|high|xhigh|max|ultra)$/.test(effort)) throw new Error('invalid --effort');
  const directory = mkdtempSync(join(tmpdir(), 'omd-refinement-native-smoke-'));
  const adapter = createReviewerMcpAdapter();
  try {
    const tokenA = randomBytes(2).toString('hex').toUpperCase();
    const tokenB = randomBytes(2).toString('hex').toUpperCase();
    const targetFirst = (randomBytes(1)[0]! & 1) === 0;
    const aliases = ['variant-1111111111111111', 'variant-2222222222222222'] as const;
    const targetAlias = targetFirst ? aliases[0] : aliases[1];
    const first = await diagnosticPng(targetFirst ? tokenA : tokenB, targetFirst ? 'triangle' : 'circle');
    const second = await diagnosticPng(targetFirst ? tokenB : tokenA, targetFirst ? 'circle' : 'triangle');
    const targetToken = tokenA;
    const variants = [first, second].map((png, index) => ({
      alias: aliases[index]!,
      renders: [{
        viewport: 'desktop', width: 640, height: 360, outcomeRef: 'diagnostic:pixel-only',
        sha256: sha256(png), pngBase64: png.toString('base64'),
      }],
    }));
    const inner = { schema: 'adaptive-rendered-refinement-reviewer-packet-v1', variants };
    const evidence = Buffer.from(`${JSON.stringify({
      schema: 'adaptive-rendered-refinement-reviewer-transport-v1',
      evidenceSha256: sha256(JSON.stringify(inner)),
      evidence: inner,
      outputContract: { allowedWinnerAliases: [...aliases], reviewerFields: ['winnerAlias'] },
    })}\n`);
    const buildSha256 = sha256('native-smoke-build');
    const loadedSkillSha256 = sha256('native-smoke-skill');
    const briefSha256 = sha256('native-smoke-brief');
    const browserSha256 = sha256(evidence);
    const argsPath = join(directory, 'reviewer-argv');
    const reviewerCommand = readFileSync(codexBin).subarray(0, 2).toString() === '#!'
      ? [process.execPath, codexBin] : [codexBin];
    const reviewerRestrictions = [
      '--disable', 'shell_tool', '--disable', 'unified_exec', '--disable', 'view_image',
      '--disable', 'image_generation', '--disable', 'skill_search',
      '--disable', 'apps', '--disable', 'plugins',
      '--disable', 'standalone_web_search', '--disable', 'multi_agent',
      '-c', 'web_search="disabled"',
    ];
    const baseArgs = [
      'exec', '--json', '--ephemeral', '--sandbox', 'read-only', '-C', directory,
      '--skip-git-repo-check',
      ...reviewerRestrictions,
      ...(model === undefined ? [] : ['--model', model]),
      '-c', `model_reasoning_effort=${JSON.stringify(effort)}`,
      '-c', `developer_instructions=${JSON.stringify('This is a transport-only visual diagnostic. Call read_reviewer_evidence exactly once, inspect both image blocks, and answer only with the matching anonymous alias. Do not use any other tool.')}`,
    ];
    const gate = 'IFS= read -r gate <&3 || exit 125; exec 3<&-; test -n "$gate" || exit 126; while IFS= read -r arg; do set -- "$@" "$arg"; done < "$OMD_REVIEWER_ARGS_PATH"; exec "$@" -';
    const child = spawn('/bin/sh', ['-c', gate, 'omd-native-reviewer-smoke', ...reviewerCommand, ...baseArgs], {
      cwd: directory,
      env: { ...process.env, OMD_REVIEWER_ARGS_PATH: argsPath },
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    });
    if (child.pid === undefined) throw new Error('reviewer child PID unavailable');
    const reviewerExecutableSha256 = sha256(readFileSync(reviewerCommand[0]!));
    const reviewerLaunchReceipt = adapter.launchDelegated({
      host: 'codex', buildSha256, loadedSkillSha256, briefSha256, browserSha256, evidence,
      processBinding: {
        parentPid: process.pid,
        parentExecutableSha256: sha256(readFileSync(process.execPath)),
        reviewerPid: child.pid,
        reviewerExecutableSha256,
        laneId: `native-smoke-${child.pid}`,
        runnerId: `native-smoke-runner-${child.pid}`,
        sessionId: `native-smoke-session-${randomBytes(12).toString('hex')}`,
        nonce: randomBytes(24).toString('base64url'),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    const loadedSkillReceipt = adapter.observeDelegatedReviewer(
      'codex', { loadedSkillSha256 }, loadedSkillSha256, child.pid, reviewerExecutableSha256,
    );
    const bundle = adapter.launchBundle({ loadedSkillReceipt, reviewerLaunchReceipt });
    const server = bundle.configuration.mcpServers['omd-reviewer-evidence'];
    const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
    const configured = parseToml(readFileSync(join(codexHome, 'config.toml'), 'utf8')) as unknown;
    const inherited = typeof configured === 'object' && configured !== null && !Array.isArray(configured)
      && typeof (configured as Record<string, unknown>).mcp_servers === 'object'
      && (configured as Record<string, unknown>).mcp_servers !== null
      && !Array.isArray((configured as Record<string, unknown>).mcp_servers)
      ? (configured as Record<string, unknown>).mcp_servers as Record<string, unknown> : {};
    const names: unknown[] = Object.keys(inherited);
    if (names.some((name) => typeof name !== 'string' || !/^[A-Za-z0-9_-]+$/.test(name))) {
      throw new Error('unsafe inherited MCP server inventory');
    }
    const dynamicArgs = [
      ...names.flatMap((name) => name === 'omd-reviewer-evidence'
        ? [] : ['-c', `mcp_servers.${name as string}.enabled=false`]),
      '-c', `mcp_servers.omd-reviewer-evidence.command=${JSON.stringify(server.command)}`,
      '-c', `mcp_servers.omd-reviewer-evidence.args=${JSON.stringify(server.args)}`,
      '-c', 'mcp_servers.omd-reviewer-evidence.tools.read_reviewer_evidence.approval_mode="approve"',
    ];
    const featureInventory = spawnSync(codexBin, ['features', 'list', ...reviewerRestrictions], {
      cwd: directory, encoding: 'utf8', env: { ...process.env, CODEX_HOME: codexHome }, timeout: 10_000,
    });
    const restrictedFeatures = ['shell_tool', 'unified_exec', 'view_image', 'image_generation', 'skill_search', 'apps', 'plugins'];
    const featureInventoryRestricted = featureInventory.status === 0 && restrictedFeatures.every((feature) =>
      new RegExp(`^${feature}\\s+\\S+(?:\\s+\\S+)*\\s+false$`, 'm').test(featureInventory.stdout));
    const mcpInventory = spawnSync(codexBin, ['mcp', 'list', '--json', ...dynamicArgs], {
      cwd: directory, encoding: 'utf8', env: { ...process.env, CODEX_HOME: codexHome }, timeout: 10_000,
    });
    const mcpInventoryValue = mcpInventory.status === 0
      ? JSON.parse(mcpInventory.stdout) as Array<{ name?: unknown; enabled?: unknown }> : [];
    const mcpInventoryRestricted = mcpInventory.status === 0
      && mcpInventoryValue.some(({ name, enabled }) => name === 'omd-reviewer-evidence' && enabled === true)
      && names.every((name) => mcpInventoryValue.some((entry) => entry.name === name && entry.enabled === false));
    writeFileSync(argsPath, `${dynamicArgs.join('\n')}\n`, { mode: 0o400, flag: 'wx' });
    (child.stdio[3] as Writable).end('release\n');
    const prompt = `Use the image pixels to identify which anonymous variant contains the token ${targetToken} inside a magenta triangle. Return only that variant alias.`;
    child.stdin.end(prompt);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    const status = await new Promise<number | null>((resolveStatus, reject) => {
      const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('native reviewer timed out')); }, 180_000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); resolveStatus(code); });
    });
    const events = stdout.split('\n').filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line) as Record<string, unknown>]; } catch { return []; }
    });
    const finalMessage = events.flatMap((event) => {
      const item = event.item;
      return typeof item === 'object' && item !== null && !Array.isArray(item)
        && (item as Record<string, unknown>).type === 'agent_message'
        && typeof (item as Record<string, unknown>).text === 'string'
        ? [(item as Record<string, unknown>).text as string] : [];
    }).at(-1) ?? '';
    let consumedEvidence = false;
    let consumptionFailure: string | undefined;
    try {
      const consumed = adapter.consumeCompletedLaunchBundle(bundle, 'codex', {
        buildSha256, briefSha256, browserSha256,
      });
      consumedEvidence = consumed.evidenceSha256 === sha256(evidence);
    } catch (error) {
      consumptionFailure = error instanceof Error ? error.message : String(error);
    }
    const toolCallObserved = stdout.includes('read_reviewer_evidence');
    const passed = status === 0 && toolCallObserved && finalMessage.trim() === targetAlias
      && featureInventoryRestricted && mcpInventoryRestricted
      && consumedEvidence;
    process.stdout.write(`${JSON.stringify({
      schema: 'omd-refinement-reviewer-native-smoke-v1',
      status: passed ? 'pass' : 'fail',
      diagnosticOnly: true,
      modelArgumentOmitted: model === undefined,
      effort,
      expectedAlias: targetAlias,
      finalMessage,
      toolCallObserved,
      featureInventoryRestricted,
      mcpInventoryRestricted,
      evidenceConsumed: consumedEvidence,
      consumptionFailure,
      childExitCode: status,
      stdoutTail: passed ? undefined : stdout.slice(-4000),
      stderr: passed ? undefined : stderr.slice(-4000),
    })}\n`);
    if (!passed) process.exitCode = 1;
  } finally {
    adapter.dispose();
    rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
