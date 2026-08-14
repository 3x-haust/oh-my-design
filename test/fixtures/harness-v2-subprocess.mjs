#!/usr/bin/env node
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const observerPrivateKey = () => {
  const pem = process.env.OMD_OBSERVER_PRIVATE_KEY;
  if (!pem) throw new Error('OMD_OBSERVER_PRIVATE_KEY is required for observer attestations');
  return createPrivateKey(pem);
};
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
const read = async () => JSON.parse(Buffer.concat(await awaitChunks()).toString('utf8'));
function awaitChunks() {
  const chunks = [];
  return new Promise((resolve, reject) => {
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () => resolve(chunks));
    process.stdin.on('error', reject);
  });
}

const mode = process.argv[2];
const postAttest = mode === 'observer' && process.argv[3] === 'post-attest';
const input = mode === 'observer' && process.argv[3] && !postAttest ? JSON.parse(process.argv[3]) : postAttest ? JSON.parse(process.argv[4]) : await read();
if (mode === 'host') {
  const artifact = JSON.stringify({ brief: input.brief, evidence: input.evidence.map(({ alias, bytes, sha256, receipt }) => ({ alias, bytes, sha256, receipt })) });
  process.stdout.write(JSON.stringify({ laneId: 'portable-host', artifactBytes: Buffer.from(artifact).toString('base64') }));
} else if (mode === 'browser') {
  const observation = JSON.stringify({ brief: input.brief, build: input.build, observer: 'portable-browser' });
  process.stdout.write(JSON.stringify({ observationBytes: Buffer.from(observation).toString('base64') }));
} else if (mode === 'reviewer') {
  const server = input.reviewerEvidenceConfiguration?.mcpServers?.['omd-reviewer-evidence'];
  if (!server || Object.keys(input.reviewerEvidenceConfiguration.mcpServers).length !== 1 || typeof server.command !== 'string' || !input.browser?.observationBytes) throw new Error('reviewer requires exact build, browser, and its sole issued staged evidence MCP configuration');
  const transcript = [
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'read_reviewer_evidence', arguments: {} } }),
  ].join('\n') + '\n';
  const capability = spawnSync(server.command, server.args, { input: transcript, encoding: 'utf8', env: { PATH: '' } });
  if (capability.status !== 0) throw new Error(capability.stderr || 'reviewer evidence MCP failed');
  const messages = capability.stdout.trim().split('\n').map(JSON.parse);
  const response = messages.find(message => message.id === 2);
  const consumedEvidenceHash = response?.result?.structuredContent?.sha256;
  const base64 = response?.result?.structuredContent?.base64;
  if (typeof base64 !== 'string' || typeof consumedEvidenceHash !== 'string') throw new Error('reviewer evidence MCP did not return observed opaque evidence');
  const consumed = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  const artifactBytes = Buffer.from(input.build.artifactBytes, 'base64');
  const observationBytes = Buffer.from(input.browser.observationBytes, 'base64');
  if (consumed.brief?.briefHash !== input.brief.briefHash || consumed.build?.receiptHash !== input.build.receiptHash || consumed.browser?.receiptHash !== input.browser.receiptHash || !artifactBytes.equals(Buffer.from(consumed.build.artifactBytes, 'base64')) || !observationBytes.equals(Buffer.from(consumed.browser.observationBytes, 'base64'))) throw new Error('reviewer MCP evidence was not the exact brief, build artifact, and browser observation supplied by the runner');
  const args = server.args;
  const sessionId = args[args.indexOf('--session-id') + 1];
  const configurationSha256 = args[args.indexOf('--configuration-sha256') + 1];
  const vote = input.brief.kind === 'silent-evidence' || input.brief.kind === 'showpiece' ? 'one' : 'none';
  process.stdout.write(JSON.stringify({ vote, workReceipt: { schemaVersion:'runner-benchmark-reviewer-work-receipt-v1', vote, briefHash:input.brief.briefHash, buildReceiptHash:input.build.receiptHash, artifactHash:input.build.artifactHash, browserReceiptHash:input.browser.receiptHash, observationHash:input.browser.observationHash, consumedEvidenceHash, evidenceTranscriptHash:digest(messages), childPid:capability.pid, sessionId, configurationSha256, rationale:`projected ${input.brief.kind} semantics with exact runner-observed build and browser evidence` } }));
} else if (mode === 'observer') {
  if (postAttest) {
    process.stdout.write(JSON.stringify({ fields: input, signature: sign(null, Buffer.from(canonical(input)), observerPrivateKey()).toString('base64') }));
  } else {
    const { source, child } = input;
    const networkDenial = { denied: true, receipt: digest({ source, child, denied: true }) };
    const accounting = { tokens: 0, usd: 0, receipt: digest({ source, child, tokens: 0, usd: 0 }) };
    const unsigned = { identity: 'fixture-parent-observer', source, child, networkDenial, accounting };
    process.stdout.write(JSON.stringify({ ...unsigned, signature: sign(null, Buffer.from(canonical(unsigned)), observerPrivateKey()).toString('base64') }));
  }
} else {
  process.stderr.write('usage: harness-v2-subprocess.mjs <host|browser|reviewer|observer>');
  process.exitCode = 64;
}
