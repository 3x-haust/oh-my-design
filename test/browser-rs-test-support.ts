import { isAbsolute, relative, sep } from 'node:path';
import {
  nodeBrowserRsFileSystem,
  type BrowserRsFileSystem,
  type BrowserRsOwnedRemoval,
} from '../core/install/browser-rs-filesystem.ts';
import type {
  BrowserRsDependencies,
  BrowserRsDownloader,
  BrowserRsInstallDependencies,
  BrowserRsRelease,
} from '../core/install/browser-rs.ts';
import type { BrowserRsEnvironment } from '../core/install/browser-rs-path.ts';

export const TEST_BROWSER_ENV: BrowserRsEnvironment = { PATH: '' };

export type BrowserRsTestRuntime = {
  readonly home: string;
  readonly platform: string;
  readonly arch: string;
  readonly releases: readonly BrowserRsRelease[];
  readonly env?: BrowserRsEnvironment;
};

export const unavailableBrowserRsDownload: BrowserRsDownloader = async () => {
  throw new Error('test browser-rs downloader must not run');
};

export function browserRsTestDependencies(runtime: BrowserRsTestRuntime): BrowserRsDependencies {
  return {
    ...runtime,
    env: runtime.env ?? TEST_BROWSER_ENV,
    which: () => undefined,
    fs: browserRsTestFileSystem(runtime.home),
  };
}

export function browserRsTestInstallDependencies(
  runtime: BrowserRsTestRuntime & { readonly downloader: BrowserRsDownloader },
): BrowserRsInstallDependencies {
  return { ...browserRsTestDependencies(runtime), downloader: runtime.downloader };
}

function browserRsTestFileSystem(home: string): BrowserRsFileSystem {
  const withinHome = (path: string): void => {
    const relation = relative(home, path);
    if (relation === '' || (!isAbsolute(relation) && relation !== '..' && !relation.startsWith(`..${sep}`))) return;
    throw new Error(`browser-rs test filesystem escaped its fake home: ${path}`);
  };
  const exists = (path: string): boolean => {
    withinHome(path);
    return nodeBrowserRsFileSystem.exists(path);
  };
  const mkdir = (path: string): void => {
    withinHome(path);
    nodeBrowserRsFileSystem.mkdir(path);
  };
  const read = (path: string): Buffer => {
    withinHome(path);
    return nodeBrowserRsFileSystem.read(path);
  };
  const write = (path: string, bytes: Buffer | string): void => {
    withinHome(path);
    nodeBrowserRsFileSystem.write(path, bytes);
  };
  const chmod = (path: string, mode: number): void => {
    withinHome(path);
    nodeBrowserRsFileSystem.chmod(path, mode);
  };
  const publishNoReplace = (from: string, to: string): boolean => {
    withinHome(from);
    withinHome(to);
    return nodeBrowserRsFileSystem.publishNoReplace(from, to);
  };
  const removeIfDigest = (path: string, expectedDigest: string): boolean => {
    withinHome(path);
    return nodeBrowserRsFileSystem.removeIfDigest(path, expectedDigest);
  };
  const removeOwnedPairIfDigests = (
    target: string,
    targetDigest: string,
    receipt: string,
    receiptDigest: string,
  ): BrowserRsOwnedRemoval => {
    withinHome(target);
    withinHome(receipt);
    return nodeBrowserRsFileSystem.removeOwnedPairIfDigests(target, targetDigest, receipt, receiptDigest);
  };
  const remove = (path: string): void => {
    withinHome(path);
    nodeBrowserRsFileSystem.remove(path);
  };
  return { exists, mkdir, read, write, chmod, publishNoReplace, removeIfDigest, removeOwnedPairIfDigests, remove };
}
