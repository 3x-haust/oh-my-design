import { randomUUID } from 'node:crypto';
import { linkSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export class CompositeLineageFileError extends Error {
  override readonly name = 'CompositeLineageFileError';
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

const fail = (reason: string): never => { throw new CompositeLineageFileError(reason); };
const isInside = (parent: string, child: string): boolean => {
  const path = relative(parent, child);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
};
const errorCode = (error: unknown, code: string): boolean => error instanceof Error && 'code' in error && error.code === code;

const directory = (path: string, label: string, parent?: string): string => {
  try {
    const entry = lstatSync(path);
    if (entry.isSymbolicLink() || !entry.isDirectory()) fail(`${label} must be a real directory`);
    const resolved = realpathSync(path);
    if (parent !== undefined && !isInside(parent, resolved)) fail(`${label} must remain inside its parent`);
    return resolved;
  } catch (error) {
    if (error instanceof CompositeLineageFileError) throw error;
    return fail(`${label} is missing or unreadable`);
  }
};

const regularFile = (path: string, label: string, parent: string): string => {
  try {
    const entry = lstatSync(path);
    if (entry.isSymbolicLink() || !entry.isFile()) fail(`${label} must be a regular file`);
    const resolved = realpathSync(path);
    if (!isInside(parent, resolved)) fail(`${label} must remain inside its parent`);
    return resolved;
  } catch (error) {
    if (error instanceof CompositeLineageFileError) throw error;
    return fail(`${label} is missing or unreadable`);
  }
};

type ProjectDirectories = { readonly root: string; readonly omd: string };

const projectDirectories = (root: string, createOmd: boolean): ProjectDirectories => {
  const realRoot = directory(root, 'project root');
  const omdPath = join(root, '.omd');
  if (createOmd) mkdirSync(omdPath, { recursive: true });
  return { root: realRoot, omd: directory(omdPath, 'project .omd directory', realRoot) };
};

export const lineagePath = (root: string): string => join(root, '.omd', 'reference-composite-lineage.json');
export const selectionPath = (root: string): string => join(root, '.omd', 'reference-selection.json');
export const boardPath = (root: string): string => join(root, '.omd', 'reference-board.json');

export const readTrustedLineageFile = (root: string): string => {
  const project = projectDirectories(root, false);
  return readFileSync(regularFile(lineagePath(root), 'reference composite lineage', project.omd), 'utf8');
};

export const readTrustedSelectionBytes = (root: string): Buffer => {
  const project = projectDirectories(root, false);
  return readFileSync(regularFile(selectionPath(root), 'reference selection', project.omd));
};

export const trustedBoardPath = (root: string): string => {
  const project = projectDirectories(root, false);
  return regularFile(boardPath(root), 'reference board', project.omd);
};

export const readTrustedBoardBytes = (root: string): Buffer => readFileSync(trustedBoardPath(root));

type TrustedImagegenFile = { readonly path: string; readonly bytes: Buffer };

const trustedImagegenFile = (root: string, candidate: string, label: string): TrustedImagegenFile => {
  const project = projectDirectories(root, false);
  const cachePath = resolve(root, '.omd', '.cache', 'imagegen');
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(root, candidate);
  if (!isInside(cachePath, absolute)) fail(`${label} path must be a file beneath .omd/.cache/imagegen`);
  const cache = directory(join(root, '.omd', '.cache'), 'image-generation cache directory', project.omd);
  const drafts = directory(join(cache, 'imagegen'), 'image-generation draft directory', cache);
  const parts = relative(cachePath, absolute).split(sep).filter((part) => part !== '');
  let parent = drafts;
  let current = drafts;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    parent = index === parts.length - 1
      ? regularFile(current, label, parent)
      : directory(current, `${label} directory`, parent);
  }
  return { path: relative(project.root, parent).split(sep).join('/'), bytes: readFileSync(parent) };
};

export type TrustedComposite = TrustedImagegenFile;
export type TrustedPrompt = TrustedImagegenFile;

export const trustedComposite = (root: string, candidate: string): TrustedComposite => trustedImagegenFile(root, candidate, 'composite');
export const trustedPrompt = (root: string, candidate: string): TrustedPrompt => trustedImagegenFile(root, candidate, 'prompt');

export const writeExclusiveLineage = (root: string, content: string): void => {
  const project = projectDirectories(root, true);
  const target = join(project.omd, 'reference-composite-lineage.json');
  const temporary = join(dirname(target), `.reference-composite-lineage.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, content, { flag: 'wx' });
    linkSync(temporary, target);
  } catch (error) {
    if (errorCode(error, 'EEXIST')) fail('reference composite lineage already exists');
    throw error;
  } finally {
    rmSync(temporary, { force: true });
  }
};
