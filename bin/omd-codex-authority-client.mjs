#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { chmodSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const requestDirectory = process.argv[2];
if (typeof requestDirectory !== 'string' || requestDirectory.length === 0 || requestDirectory.includes('\0')) process.exit(2);

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
  if (input.length > 1024 * 1024) process.exit(2);
});
process.stdin.on('end', () => {
  let request;
  try { request = JSON.parse(input); } catch { process.exit(2); }
  const requestId = randomBytes(18).toString('base64url');
  const responsePath = join(requestDirectory, `response-${requestId}`);
  const requestPath = join(requestDirectory, `request-${requestId}.json`);
  const temporaryRequest = `${requestPath}.tmp`;
  try {
    execFileSync('/usr/bin/mkfifo', [responsePath], { env: { PATH: '' }, stdio: 'ignore' });
    chmodSync(responsePath, 0o600);
    writeFileSync(temporaryRequest, JSON.stringify({ ...request, requestId, clientPid: process.pid }));
    renameSync(temporaryRequest, requestPath);
    process.stdout.write(readFileSync(responsePath, 'utf8'));
  } catch {
    process.exitCode = 2;
  } finally {
    try { unlinkSync(responsePath); } catch { /* host may have removed the consumed FIFO */ }
    try { unlinkSync(temporaryRequest); } catch { /* request was already published */ }
  }
});
