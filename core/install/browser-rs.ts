import { randomUUID } from 'node:crypto';
import { homedir, platform as systemPlatform, arch as systemArch } from 'node:os';
import { dirname, join } from 'node:path';
import { downloadBrowserRsRelease, BrowserRsDownloadError, type BrowserRsDownloadFailure, type BrowserRsDownloadRequest, type BrowserRsDownloadResult } from './browser-rs-download.ts';
import { browserRsDigest, nodeBrowserRsFileSystem, type BrowserRsFileSystem } from './browser-rs-filesystem.ts';
import { browserRsPathLookup, type BrowserRsEnvironment } from './browser-rs-path.ts';
import {
  BROWSER_RS_COMPATIBLE_VERSION,
  doctorBrowserRsHelp,
  type BrowserRsHealth,
  type BrowserRsProcessRunner,
  type BrowserRsProviderSource,
} from './browser-rs-health.ts';
import {
  browserRsReceiptDigest,
  readBrowserRsReceipt,
  receiptMatchesRelease,
  receiptPathFor,
  writeBrowserRsReceipt,
  type BrowserRsRelease,
} from './browser-rs-receipt.ts';

export const BROWSER_RS_VERSION = 'v0.1.10';
export const BROWSER_RS_DOCTOR_TIMEOUT_MS = 5_000;

export const BROWSER_RS_RELEASES = [
  {
    platform: 'darwin',
    arch: 'arm64',
    asset: 'browser-rs-macos-arm64',
    url: 'https://github.com/maestrojeong/browser-rs-mcp/releases/download/v0.1.10/browser-rs-macos-arm64',
    sha256: '9a5895fc2f07b1010226d30f081d678fa2edcc15dd6f24cdf10074cfe1573749',
  },
  {
    platform: 'linux',
    arch: 'x64',
    asset: 'browser-rs-linux-x64',
    url: 'https://github.com/maestrojeong/browser-rs-mcp/releases/download/v0.1.10/browser-rs-linux-x64',
    sha256: '792ca76e5ce0423968763556e110900a3aa65737fc6227724914aa137e972589',
  },
] as const satisfies readonly BrowserRsRelease[];

export type { BrowserRsFileSystem } from './browser-rs-filesystem.ts';
export type { BrowserRsRelease } from './browser-rs-receipt.ts';
export type { BrowserRsHealth, BrowserRsProcessResult, BrowserRsProcessRunner } from './browser-rs-health.ts';
export type BrowserRsDownloader = (request: BrowserRsDownloadRequest) => Promise<BrowserRsDownloadResult | void>;
export type BrowserRsWhich = (environment: BrowserRsEnvironment) => string | undefined;

export type BrowserRsDependencies = {
  readonly home?: string;
  readonly platform?: string;
  readonly arch?: string;
  readonly env?: BrowserRsEnvironment;
  readonly which?: BrowserRsWhich;
  readonly fs?: BrowserRsFileSystem;
  readonly releases?: readonly BrowserRsRelease[];
};

export type BrowserRsInstallDependencies = BrowserRsDependencies & { readonly downloader?: BrowserRsDownloader };

export type BrowserRsResolution =
  | { readonly kind: 'env'; readonly path: string }
  | { readonly kind: 'path'; readonly path: string }
  | { readonly kind: 'owned'; readonly path: string }
  | { readonly kind: 'missing' };

export type BrowserRsInstallResult =
  | { readonly kind: 'present'; readonly source: 'env' | 'path' | 'owned' | 'target'; readonly path: string }
  | { readonly kind: 'installed'; readonly path: string; readonly sha256: string }
  | { readonly kind: 'unsupported'; readonly platform: string; readonly arch: string }
  | { readonly kind: 'failed'; readonly reason: BrowserRsDownloadFailure | 'checksum' | 'receipt-conflict' | 'download' };

export type BrowserRsUninstallResult =
  | { readonly kind: 'removed'; readonly path: string }
  | { readonly kind: 'preserved'; readonly reason: 'missing' | 'unreceipted' | 'receipt-mismatch' | 'digest-mismatch'; readonly path: string };

function configured<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

function releaseFor(platform: string, arch: string, releases: readonly BrowserRsRelease[]): BrowserRsRelease | undefined {
  return releases.find((release) => release.platform === platform && release.arch === arch);
}

function owned(target: string, releases: readonly BrowserRsRelease[], fs: BrowserRsFileSystem): boolean {
  if (!fs.exists(target)) return false;
  const receipt = readBrowserRsReceipt(target, fs);
  if (receipt === undefined) return false;
  const release = releases.find((item) => receiptMatchesRelease(receipt, item));
  return release !== undefined
    && browserRsDigest(receiptPathFor(target), fs) === browserRsReceiptDigest(release)
    && browserRsDigest(target, fs) === release.sha256;
}

function runtime(deps: BrowserRsDependencies): Required<Pick<BrowserRsDependencies, 'home' | 'platform' | 'arch' | 'fs' | 'releases'>> {
  return {
    home: configured(deps.home, homedir()),
    platform: configured(deps.platform, systemPlatform()),
    arch: configured(deps.arch, systemArch()),
    fs: configured(deps.fs, nodeBrowserRsFileSystem),
    releases: configured(deps.releases, BROWSER_RS_RELEASES),
  };
}

function source(result: Exclude<BrowserRsResolution, { readonly kind: 'missing' }>): BrowserRsProviderSource {
  return result.kind;
}

export function browserRsTarget(home: string): string {
  return join(home, '.local', 'share', 'oh-my-design', 'browser-rs', BROWSER_RS_VERSION, 'browser-rs');
}

export function resolveBrowserRs(deps: BrowserRsDependencies = {}): BrowserRsResolution {
  const value = runtime(deps);
  const environment = deps.env === undefined ? process.env : deps.env;
  const override = environment['OMD_BROWSER_RS_BIN'];
  if (override !== undefined && override.length > 0) return { kind: 'env', path: override };
  const onPath = configured(deps.which, browserRsPathLookup)(environment);
  if (onPath !== undefined) return { kind: 'path', path: onPath };
  const target = browserRsTarget(value.home);
  return owned(target, value.releases, value.fs) ? { kind: 'owned', path: target } : { kind: 'missing' };
}

export async function installBrowserRs(deps: BrowserRsInstallDependencies = {}): Promise<BrowserRsInstallResult> {
  const value = runtime(deps);
  const resolution = resolveBrowserRs(deps);
  if (resolution.kind !== 'missing') return { kind: 'present', source: source(resolution), path: resolution.path };
  const target = browserRsTarget(value.home);
  if (value.fs.exists(target)) return { kind: 'present', source: 'target', path: target };
  const release = releaseFor(value.platform, value.arch, value.releases);
  if (release === undefined) return { kind: 'unsupported', platform: value.platform, arch: value.arch };
  const receiptPath = receiptPathFor(target);
  const receipt = readBrowserRsReceipt(target, value.fs);
  if (value.fs.exists(receiptPath) && (
    receipt === undefined
    || !receiptMatchesRelease(receipt, release)
    || !value.fs.removeIfDigest(receiptPath, browserRsReceiptDigest(release))
  )) return { kind: 'failed', reason: 'receipt-conflict' };
  const downloader = configured(deps.downloader, downloadBrowserRsRelease);
  const temporary = join(dirname(target), `.browser-rs.tmp-${randomUUID()}`);
  value.fs.mkdir(dirname(target));
  let published = false;
  let ownsTemporary = false;
  try {
    const downloaded = await downloader({ url: release.url, destination: temporary });
    if (downloaded?.destinationOwned !== true) return { kind: 'failed', reason: 'download' };
    ownsTemporary = true;
    if (!value.fs.exists(temporary)) throw new BrowserRsDownloadError('transport', 'browser-rs downloader did not write a file');
    if (browserRsDigest(temporary, value.fs) !== release.sha256) throw new BrowserRsDownloadError('checksum', 'browser-rs checksum mismatch');
    value.fs.chmod(temporary, 0o755);
    if (!value.fs.publishNoReplace(temporary, target)) return { kind: 'present', source: 'target', path: target };
    published = true;
    if (!writeBrowserRsReceipt(target, release, value.fs)) {
      value.fs.removeIfDigest(target, release.sha256);
      return { kind: 'failed', reason: 'receipt-conflict' };
    }
    return { kind: 'installed', path: target, sha256: release.sha256 };
  } catch (error) {
    if (!ownsTemporary && error instanceof BrowserRsDownloadError) ownsTemporary = error.destinationOwned;
    if (published) value.fs.removeIfDigest(target, release.sha256);
    if (error instanceof BrowserRsDownloadError) {
      return { kind: 'failed', reason: error.reason === 'checksum' ? 'checksum' : error.reason };
    }
    if (error instanceof Error) return { kind: 'failed', reason: 'download' };
    throw error;
  } finally {
    if (ownsTemporary) value.fs.remove(temporary);
  }
}

export function uninstallBrowserRs(deps: BrowserRsDependencies = {}): BrowserRsUninstallResult {
  const value = runtime(deps);
  const target = browserRsTarget(value.home);
  if (!value.fs.exists(target)) return { kind: 'preserved', reason: 'missing', path: target };
  const receipt = readBrowserRsReceipt(target, value.fs);
  if (receipt === undefined) return { kind: 'preserved', reason: 'unreceipted', path: target };
  const release = value.releases.find((item) => receiptMatchesRelease(receipt, item));
  if (release === undefined) return { kind: 'preserved', reason: 'receipt-mismatch', path: target };
  const receiptPath = receiptPathFor(target);
  const removed = value.fs.removeOwnedPairIfDigests(
    target,
    release.sha256,
    receiptPath,
    browserRsReceiptDigest(release),
  );
  if (removed === 'receipt-mismatch') return { kind: 'preserved', reason: 'receipt-mismatch', path: target };
  if (removed === 'target-mismatch') return { kind: 'preserved', reason: 'digest-mismatch', path: target };
  return { kind: 'removed', path: target };
}

export type BrowserRsDoctorDependencies = BrowserRsDependencies & {
  readonly run?: BrowserRsProcessRunner;
  readonly timeoutMs?: number;
};

export async function doctorBrowserRs(deps: BrowserRsDoctorDependencies = {}): Promise<BrowserRsHealth> {
  const value = runtime(deps);
  if (releaseFor(value.platform, value.arch, value.releases) === undefined) {
    return { kind: 'unsupported', platform: value.platform, arch: value.arch };
  }
  const resolution = resolveBrowserRs(deps);
  if (resolution.kind === 'missing') {
    const target = browserRsTarget(value.home);
    return value.fs.exists(target) ? { kind: 'unhealthy', reason: 'unowned-target' } : { kind: 'unhealthy', reason: 'missing' };
  }
  const probe = {
    path: resolution.path,
    source: source(resolution),
    version: resolution.kind === 'owned' ? BROWSER_RS_VERSION : BROWSER_RS_COMPATIBLE_VERSION,
    timeoutMs: deps.timeoutMs ?? BROWSER_RS_DOCTOR_TIMEOUT_MS,
  };
  return deps.run === undefined
    ? doctorBrowserRsHelp(probe)
    : doctorBrowserRsHelp({ ...probe, run: deps.run });
}
