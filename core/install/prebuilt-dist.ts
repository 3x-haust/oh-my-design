import { lstatSync, readFileSync, readdirSync, type Stats } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  expectedPrebuiltFiles,
  PrebuiltPayloadSourceError,
  type ExpectedPrebuiltFile,
} from './prebuilt-payload.ts';
import type { Host } from '../types.ts';

export type PrebuiltDistRequest = {
  readonly distributionRoot: string;
  readonly sourceRoot: string;
  readonly hosts: readonly { readonly host: Host }[];
};

export class PrebuiltDistError extends Error {
  override readonly name = 'PrebuiltDistError';
}

type PrebuiltTree = {
  readonly directories: ReadonlySet<string>;
  readonly files: ReadonlyMap<string, string>;
};

export function requirePrebuiltDist(request: PrebuiltDistRequest): void {
  const distRoot = join(request.distributionRoot, 'dist');
  requiredDirectory(distRoot);
  for (const host of new Set(request.hosts.map((item) => item.host))) {
    validateHost(join(distRoot, host), request.sourceRoot, host);
  }
}

function validateHost(generated: string, sourceRoot: string, host: Host): void {
  const expected = expectedFiles(sourceRoot, host);
  const actual = generatedTree(generated);
  const expectedDirectories = parentDirectories(expected);
  validateDirectories(generated, actual.directories, expectedDirectories);
  validateFiles(generated, actual.files, expected);
}

function expectedFiles(sourceRoot: string, host: Host): ReadonlyMap<string, ExpectedPrebuiltFile> {
  try {
    return expectedPrebuiltFiles(sourceRoot, host);
  } catch (error) {
    if (error instanceof PrebuiltPayloadSourceError) stale(error.path, error.reason);
    throw error;
  }
}

function generatedTree(root: string): PrebuiltTree {
  requiredDirectory(root);
  const directories = new Set<string>();
  const files = new Map<string, string>();
  const visit = (path: string, relative: string): void => {
    for (const name of readdirSync(path)) {
      const child = join(path, name);
      const childRelative = relative.length === 0 ? name : `${relative}/${name}`;
      const metadata = metadataFor(child);
      if (metadata.isSymbolicLink()) stale(child, 'must not be a symbolic link');
      if (metadata.isDirectory()) {
        directories.add(childRelative);
        visit(child, childRelative);
      } else if (metadata.isFile()) {
        files.set(childRelative, readFileSync(child, 'utf8'));
      } else {
        stale(child, 'must be a regular file or directory');
      }
    }
  };
  visit(root, '');
  return { directories, files };
}

function parentDirectories(files: ReadonlyMap<string, ExpectedPrebuiltFile>): ReadonlySet<string> {
  const directories = new Set<string>();
  for (const path of files.keys()) {
    const parts = path.split('/');
    parts.pop();
    for (let index = 1; index <= parts.length; index += 1) directories.add(parts.slice(0, index).join('/'));
  }
  return directories;
}

function validateDirectories(root: string, actual: ReadonlySet<string>, expected: ReadonlySet<string>): void {
  for (const path of expected) {
    if (!actual.has(path)) stale(join(root, path), 'required directory is missing');
  }
  for (const path of actual) {
    if (!expected.has(path)) stale(join(root, path), 'contains an unexpected directory');
  }
}

function validateFiles(root: string, actual: ReadonlyMap<string, string>, expected: ReadonlyMap<string, ExpectedPrebuiltFile>): void {
  for (const [path, value] of expected) {
    const text = actual.get(path);
    if (text === undefined) stale(join(root, path), 'required file is missing');
    if (value.kind === 'text' && text !== value.value) stale(join(root, path), 'does not match current source output');
    if (value.kind === 'json' && !matchesJson(join(root, path), text, value.value)) {
      stale(join(root, path), 'does not match the current emitter contract');
    }
  }
  for (const path of actual.keys()) {
    if (!expected.has(path)) stale(join(root, path), 'contains an unexpected file');
  }
}

function matchesJson(path: string, text: string, expected: unknown): boolean {
  try {
    return isDeepStrictEqual(JSON.parse(text), expected);
  } catch (error) {
    if (error instanceof SyntaxError) stale(path, 'contains malformed JSON');
    throw error;
  }
}

function requiredDirectory(path: string): void {
  const metadata = metadataFor(path);
  if (metadata.isSymbolicLink()) stale(path, 'must not be a symbolic link');
  if (!metadata.isDirectory()) stale(path, 'must be a directory');
}

function metadataFor(path: string): Stats {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error instanceof Error) stale(path, 'is missing');
    throw error;
  }
}

function stale(path: string, reason: string): never {
  throw new PrebuiltDistError(`prebuilt distribution is missing or stale (${path}: ${reason}); run npm run build before install`);
}
