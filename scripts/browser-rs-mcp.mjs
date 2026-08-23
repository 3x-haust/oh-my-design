#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync, existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const version = 'v0.1.10';
const releases = {
  darwin: { arm64: { asset: 'browser-rs-macos-arm64', sha256: '9a5895fc2f07b1010226d30f081d678fa2edcc15dd6f24cdf10074cfe1573749' } },
  linux: { x64: { asset: 'browser-rs-linux-x64', sha256: '792ca76e5ce0423968763556e110900a3aa65737fc6227724914aa137e972589' } },
};

const digest = (value) => createHash('sha256').update(value).digest('hex');
function pathBrowser() {
  try { return execFileSync('which', ['browser-rs'], { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

function verifyBrowser(target, release) {
  if (!target || !release || !existsSync(target)) return false;
  try {
    const receiptBytes = readFileSync(join(dirname(target), 'receipt.json'));
    const receipt = JSON.parse(receiptBytes.toString('utf8'));
    const validRecord = typeof receipt === 'object' && receipt !== null && !Array.isArray(receipt);
    const validReceipt = validRecord && Object.keys(receipt).sort().join(',') === 'asset,schemaVersion,sha256,version'
      && receipt.schemaVersion === 'browser-rs-receipt-v1' && receipt.version === version
      && receipt.asset === release.asset && receipt.sha256 === release.sha256;
    const expected = Buffer.from(JSON.stringify({ schemaVersion: 'browser-rs-receipt-v1', version, asset: release.asset, sha256: release.sha256 }) + '\n');
    return validReceipt && digest(receiptBytes) === digest(expected) && digest(readFileSync(target)) === release.sha256;
  } catch { return false; }
}

const release = releases[process.platform]?.[process.arch];
const configured = process.env.OMD_BROWSER_RS_BIN || pathBrowser();
const fallback = join(homedir(), '.local', 'share', 'oh-my-design', 'browser-rs', version, 'browser-rs');
const browserBin = verifyBrowser(configured, release) ? configured : fallback;
if (!verifyBrowser(browserBin, release)) {
  console.error('browser-rs: OMD-owned binary is missing or unverified');
  process.exit(1);
}

const profileDir = await mkdtemp(join(tmpdir(), 'omd-browser-rs.'));
let child = null;
let finished = false;
async function finish(code) {
  if (finished) return;
  finished = true;
  if (child && !child.killed) child.kill('SIGTERM');
  await rm(profileDir, { recursive: true, force: true });
  process.exit(code);
}

process.once('SIGHUP', () => void finish(129));
process.once('SIGINT', () => void finish(130));
process.once('SIGTERM', () => void finish(143));
child = spawn(browserBin, ['--headless', '--user-data-dir=' + profileDir], { stdio: 'inherit' });
child.once('error', () => void finish(1));
child.once('exit', (code) => void finish(typeof code === 'number' ? code : 1));
