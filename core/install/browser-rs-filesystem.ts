import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type BrowserRsOwnedRemoval = 'removed' | 'receipt-mismatch' | 'target-mismatch';

export type BrowserRsFileSystem = {
  readonly exists: (path: string) => boolean;
  readonly mkdir: (path: string) => void;
  readonly read: (path: string) => Buffer;
  readonly write: (path: string, bytes: Buffer | string) => void;
  readonly chmod: (path: string, mode: number) => void;
  readonly publishNoReplace: (from: string, to: string) => boolean;
  readonly removeIfDigest: (path: string, expectedDigest: string) => boolean;
  readonly removeOwnedPairIfDigests: (
    target: string,
    targetDigest: string,
    receipt: string,
    receiptDigest: string,
  ) => BrowserRsOwnedRemoval;
  readonly remove: (path: string) => void;
};

function errorCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function publishNoReplace(from: string, to: string): boolean {
  try {
    linkSync(from, to);
    return true;
  } catch (error) {
    if (errorCode(error) === 'EEXIST') return false;
    throw error;
  }
}

function sameFile(left: string, right: string): boolean {
  const a = lstatSync(left);
  const b = lstatSync(right);
  return a.dev === b.dev && a.ino === b.ino;
}

type CapturedFile = { readonly path: string; readonly guard: string; readonly preserved: string };

function captureIfDigest(path: string, expectedDigest: string): CapturedFile | undefined {
  const guard = join(dirname(path), `.browser-rs.guard-${randomUUID()}`);
  const preserved = join(dirname(path), `.browser-rs.preserved-${randomUUID()}`);
  let captured = false;
  try {
    try {
      linkSync(path, guard);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return undefined;
      throw error;
    }
    if (browserRsDigest(guard) !== expectedDigest) return undefined;
    try {
      renameSync(path, preserved);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return undefined;
      throw error;
    }
    if (!sameFile(guard, preserved)) {
      if (publishNoReplace(preserved, path)) unlinkSync(preserved);
      return undefined;
    }
    captured = true;
    return { path, guard, preserved };
  } finally {
    if (!captured) rmSync(guard, { force: true });
  }
}

function restoreCaptured(file: CapturedFile): void {
  publishNoReplace(file.preserved, file.path);
  unlinkSync(file.preserved);
}

function removeIfDigest(target: string, expectedDigest: string): boolean {
  const captured = captureIfDigest(target, expectedDigest);
  if (captured === undefined) return false;
  try {
    unlinkSync(captured.preserved);
    return true;
  } finally {
    rmSync(captured.guard, { force: true });
  }
}

function removeOwnedPairIfDigests(
  target: string,
  targetDigest: string,
  receipt: string,
  receiptDigest: string,
): BrowserRsOwnedRemoval {
  const capturedReceipt = captureIfDigest(receipt, receiptDigest);
  if (capturedReceipt === undefined) return 'receipt-mismatch';
  const capturedTarget = captureIfDigest(target, targetDigest);
  if (capturedTarget === undefined) {
    try {
      restoreCaptured(capturedReceipt);
      return 'target-mismatch';
    } finally {
      rmSync(capturedReceipt.guard, { force: true });
    }
  }
  try {
    if (existsSync(receipt)) {
      restoreCaptured(capturedTarget);
      restoreCaptured(capturedReceipt);
      return 'receipt-mismatch';
    }
    if (existsSync(target)) {
      restoreCaptured(capturedTarget);
      restoreCaptured(capturedReceipt);
      return 'target-mismatch';
    }
    unlinkSync(capturedTarget.preserved);
    unlinkSync(capturedReceipt.preserved);
    return 'removed';
  } finally {
    rmSync(capturedTarget.guard, { force: true });
    rmSync(capturedReceipt.guard, { force: true });
  }
}

export const nodeBrowserRsFileSystem: BrowserRsFileSystem = {
  exists: existsSync,
  mkdir: (path) => mkdirSync(path, { recursive: true }),
  read: readFileSync,
  write: (path, bytes) => writeFileSync(path, bytes, { mode: 0o600 }),
  chmod: (path, mode) => chmodSync(path, mode),
  publishNoReplace,
  removeIfDigest,
  removeOwnedPairIfDigests,
  remove: (path) => rmSync(path, { force: true }),
};

export function browserRsDigest(target: string, fs: BrowserRsFileSystem = nodeBrowserRsFileSystem): string {
  return createHash('sha256').update(fs.read(target)).digest('hex');
}
