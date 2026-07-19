import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { browserRsTarget, uninstallBrowserRs, type BrowserRsRelease } from '../core/install/browser-rs.ts';
import { nodeBrowserRsFileSystem } from '../core/install/browser-rs-filesystem.ts';
import { receiptPathFor, writeBrowserRsReceipt } from '../core/install/browser-rs-receipt.ts';

const FOREIGN_BYTES = Buffer.from('foreign browser bytes');
const LARGE_BYTES = Buffer.alloc(64 * 1024 * 1024, 0x42);

function fixture(): { readonly root: string; readonly home: string; readonly target: string } {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-rs-race-'));
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  return { root, home, target: browserRsTarget(home) };
}

function release(bytes: Buffer): BrowserRsRelease {
  return {
    platform: 'darwin',
    arch: 'arm64',
    asset: 'browser-rs-race',
    url: 'https://github.com/maestrojeong/browser-rs-mcp/releases/download/v0.1.10/browser-rs-race',
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function waitFor(path: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (existsSync(path)) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`racer did not become ready: ${path}`);
}

async function stop(process: ChildProcess): Promise<void> {
  if (process.exitCode !== null || process.signalCode !== null) return;
  process.kill();
  await once(process, 'exit');
}

function racer(script: string, ...args: readonly string[]): ChildProcess {
  return spawn(process.execPath, ['-e', script, ...args], { stdio: 'ignore' });
}

function hiddenFiles(target: string): readonly string[] {
  return readdirSync(dirname(target)).filter((name) => name.includes('.guard-') || name.includes('.preserved-'));
}

test('browser-rs real digest removal restores a target replaced during its hash window', async () => {
  const item = fixture();
  const ready = join(item.root, 'target-racer.ready');
  const source = release(LARGE_BYTES);
  const script = "const fs=require('node:fs');const [ready,folder,target]=process.argv.slice(1);fs.writeFileSync(ready,'ready');const timer=setInterval(()=>{if(fs.readdirSync(folder).some((name)=>name.startsWith('.browser-rs.guard-'))){const temporary=target+'.foreign-race';fs.writeFileSync(temporary,'foreign browser bytes');fs.renameSync(temporary,target);clearInterval(timer);process.exit(0);}},1);";
  let process: ChildProcess | undefined;
  try {
    mkdirSync(dirname(item.target), { recursive: true });
    writeFileSync(item.target, LARGE_BYTES);
    process = racer(script, ready, dirname(item.target), item.target);
    await waitFor(ready);
    assert.equal(nodeBrowserRsFileSystem.removeIfDigest(item.target, source.sha256), false);
    await stop(process);
    assert.equal(readFileSync(item.target).equals(FOREIGN_BYTES), true);
    assert.deepEqual(hiddenFiles(item.target), []);
  } finally {
    if (process !== undefined) await stop(process);
    rmSync(item.root, { recursive: true, force: true });
  }
});

test('browser-rs real paired removal preserves a receipt recreated during target validation', async () => {
  const item = fixture();
  const ready = join(item.root, 'receipt-racer.ready');
  const source = release(LARGE_BYTES);
  const receipt = receiptPathFor(item.target);
  const script = "const fs=require('node:fs');const [ready,receipt]=process.argv.slice(1);fs.writeFileSync(ready,'ready');const timer=setInterval(()=>{if(!fs.existsSync(receipt)){fs.writeFileSync(receipt,'foreign receipt');clearInterval(timer);process.exit(0);}},1);";
  let process: ChildProcess | undefined;
  try {
    mkdirSync(dirname(item.target), { recursive: true });
    writeFileSync(item.target, LARGE_BYTES);
    writeBrowserRsReceipt(item.target, source);
    process = racer(script, ready, receipt);
    await waitFor(ready);
    const result = uninstallBrowserRs({ home: item.home, releases: [source] });
    await stop(process);
    assert.deepEqual(result, { kind: 'preserved', reason: 'receipt-mismatch', path: item.target });
    assert.equal(readFileSync(item.target).equals(LARGE_BYTES), true);
    assert.equal(readFileSync(receipt).equals(Buffer.from('foreign receipt')), true);
    assert.deepEqual(hiddenFiles(item.target), []);
  } finally {
    if (process !== undefined) await stop(process);
    rmSync(item.root, { recursive: true, force: true });
  }
});
