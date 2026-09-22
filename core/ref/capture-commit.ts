import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';

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
  let previousBytes: Buffer | undefined;
  if (existsSync(absoluteImagePath)) {
    const previous = lstatSync(absoluteImagePath);
    if (!previous.isSymbolicLink() && previous.isFile()) previousBytes = readFileSync(absoluteImagePath);
  }

  adapter.mkdir(relative(adapter.projectRoot, dirname(absoluteImagePath)));
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
    throw error;
  }
}
