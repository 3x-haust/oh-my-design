import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { type ProjectWriteAdapter, validateProjectWritePath } from '../runtime/project-write.ts';

export type CaptureCommit<T> = Readonly<{ value: T; imagePath?: string }>;

export function commitCapturedReference<T>(
  adapter: ProjectWriteAdapter,
  absoluteImagePath: string | undefined,
  imageBytes: Buffer | undefined,
  commitRecord: (imagePath: string | undefined) => T,
): CaptureCommit<T> {
  if (absoluteImagePath === undefined || imageBytes === undefined) {
    return { value: commitRecord(undefined) };
  }

  const imagePath = relative(adapter.projectRoot, absoluteImagePath).split('\\').join('/');
  const validatedImagePath = validateProjectWritePath(adapter.projectRoot, imagePath);
  const missingDirectories: string[] = [];
  let candidateDirectory = dirname(validatedImagePath);
  while (candidateDirectory !== adapter.projectRoot) {
    const candidatePath = relative(adapter.projectRoot, candidateDirectory).split('\\').join('/');
    if (candidatePath === '.omd' || existsSync(candidateDirectory)) break;
    missingDirectories.push(candidatePath);
    candidateDirectory = dirname(candidateDirectory);
  }
  let previousBytes: Buffer | undefined;
  if (existsSync(validatedImagePath)) {
    const previous = lstatSync(validatedImagePath);
    if (!previous.isSymbolicLink() && previous.isFile()) previousBytes = readFileSync(validatedImagePath);
  }

  adapter.mkdir(relative(adapter.projectRoot, dirname(validatedImagePath)));
  let imageWritten = false;
  try {
    adapter.write(imagePath, imageBytes);
    imageWritten = true;
    return { value: commitRecord(imagePath), imagePath };
  } catch (error) {
    if (imageWritten) {
      if (previousBytes === undefined) adapter.remove(imagePath);
      else adapter.write(imagePath, previousBytes);
    }
    for (const directory of missingDirectories) adapter.removeEmptyDirectory(directory);
    throw error;
  }
}
