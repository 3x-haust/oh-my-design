import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { capturePageForRef } from '../render/index.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { readContainedRegularFile } from './reference-selection.ts';
import { researchLane } from './store.ts';

export class ReferenceNavigationError extends Error {
  override readonly name = 'ReferenceNavigationError';
}
const digest = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export async function captureReferenceNavigation(browser: Browser, source: string, requestedLane: unknown, writer: ProjectWriteAdapter) {
  const lane = researchLane(requestedLane);
  const url = new URL(source);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.href !== source) {
    throw new ReferenceNavigationError('REFERENCE_NAVIGATION_URL: use a canonical HTTP(S) URL without credentials or fragment');
  }
  const directory = `.omd/discovery/${lane}/navigation`;
  const imagePath = `${directory}/${randomUUID()}.png`;
  writer.mkdir(directory);
  try {
    const capture = await capturePageForRef(browser, source, { width: 1280, height: 900 }, {
      shotOut: join(writer.projectRoot, imagePath), adapter: writer,
    });
    const status = capture.acquisition.httpStatus;
    if (!capture.shotSaved || status === null || status < 200 || status >= 300) {
      throw new ReferenceNavigationError('REFERENCE_NAVIGATION_FAILED: a visible successful native capture is required');
    }
    const image = readContainedRegularFile(writer.projectRoot, join(writer.projectRoot, imagePath), 'navigation image');
    const record = { schema: 'reference-navigation-capture-v1', source, researchLane: lane, kind: 'page',
      capturedAt: new Date().toISOString(), imagePath, acquisition: capture.acquisition };
    const bytes = `${JSON.stringify(record, null, 2)}\n`;
    const sha256 = digest(bytes);
    const path = `${directory}/${sha256}.json`;
    writer.writeContentAddressed(path, bytes);
    return { url: source, evidence: { path: imagePath, sha256: digest(image) }, capture: { path, sha256 } };
  } catch (error) {
    if (existsSync(join(writer.projectRoot, imagePath))) writer.remove(imagePath);
    throw error;
  }
}
