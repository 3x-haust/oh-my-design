#!/usr/bin/env node
import { createHash, createPrivateKey, sign } from 'node:crypto';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const observerPrivateKey = createPrivateKey(`-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIHfRmu9+fWIcgoC3HTDCcaQTw/Ib9UN7ZS8crQzXm73/
-----END PRIVATE KEY-----
`);
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
const input = mode === 'observer' && process.argv[3] ? JSON.parse(process.argv[3]) : await read();
if (mode === 'host') {
  const artifact = JSON.stringify({ brief: input.brief, evidence: input.evidence.map(({ alias, bytes, sha256, receipt }) => ({ alias, bytes, sha256, receipt })) });
  process.stdout.write(JSON.stringify({ laneId: 'portable-host', artifactBytes: Buffer.from(artifact).toString('base64') }));
} else if (mode === 'browser') {
  const observation = JSON.stringify({ brief: input.brief, build: input.build, observer: 'portable-browser' });
  process.stdout.write(JSON.stringify({ observationBytes: Buffer.from(observation).toString('base64') }));
} else if (mode === 'reviewer') {
  const artifact = JSON.parse(Buffer.from(input.build.artifactBytes, 'base64').toString('utf8'));
  const evidence = artifact.evidence.map(item => Buffer.from(item.bytes, 'base64').toString('utf8')).join('\n');
  process.stdout.write(JSON.stringify({ vote: /-one\.json(?:\n|$)/.test(evidence) ? 'one' : 'none' }));
} else if (mode === 'observer') {
  const { source, child } = input;
  const networkDenial = { denied: true, receipt: digest({ source, child, denied: true }) };
  const accounting = { tokens: 0, usd: 0, receipt: digest({ source, child, tokens: 0, usd: 0 }) };
  const unsigned = { identity: 'fixture-parent-observer', source, child, networkDenial, accounting };
  process.stdout.write(JSON.stringify({ ...unsigned, signature: sign(null, Buffer.from(canonical(unsigned)), observerPrivateKey).toString('base64') }));
} else {
  process.stderr.write('usage: harness-v2-subprocess.mjs <host|browser|reviewer|observer>');
  process.exitCode = 64;
}
