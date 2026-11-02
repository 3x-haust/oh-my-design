import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson } from '../ref/canonical-json.ts';
import type { readPersistedRoute } from '../route/index.ts';
import { adaptiveRouteRecordSha256 } from '../route/index.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { listProductionSourceFiles } from '../source-seal/index.ts';
import { readFirstRenderIterationHistory } from './first-render-iteration-history.ts';
import { STUDIO_DIR } from './studio.ts';

type Route = ReturnType<typeof readPersistedRoute>;

/**
 * A new page is delivered the way a studio delivers on a deadline: the picked concept is built, its first render is
 * reviewed and recomposed for a few rounds, and the best render ships with the findings still open named to the
 * person. The long evidence chain of existing-product work (browser plans, final reviewer lanes, publication
 * graphs) is not asked of it; the build, the floors and the review rounds are.
 */
export const STUDIO_REVIEW_ROUNDS = 3;
export const STUDIO_DELIVERY_RECORD = `${STUDIO_DIR}/delivery.json`;
export const STUDIO_DELIVERY_SCHEMA = 'omd-studio-delivery-v1';
export const STUDIO_DELIVER_MESSAGE = `${STUDIO_REVIEW_ROUNDS} review rounds are spent. If a later round is worse, restore the best `
  + 'iteration (omd first-render restore --json); then run omd lifecycle finish --json to deliver the best render and report the '
  + 'findings still open to the user, without another round.';

const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** The built page a new surface is delivered from. */
export const studioEntry = (root: string): string => existsSync(join(root, 'dist/index.html')) ? 'dist/index.html' : 'index.html';

/** Reviews already spent on this route's first render. */
export function studioReviewRounds(root: string, route: Route): number {
  return readFirstRenderIterationHistory(root, route).iterations.filter(iteration => iteration.reviewSha256 !== null).length;
}

/** The page source and route the delivery was made from; any later edit makes the delivery stale. */
export function studioSourceFingerprint(root: string): string {
  const fs = nodeStableProjectFileSystem();
  const files = [...listProductionSourceFiles(root), '.omd/route.json']
    .map(path => [path, sha256(readStableProjectFile({ root, path: join(root, path), label: path, fs }))]);
  return sha256(canonicalJson(files));
}

export type StudioDeliveryBody = Readonly<{
  schema: typeof STUDIO_DELIVERY_SCHEMA;
  createdAt: string;
  routeSha256: string;
  sourceSha256: string;
  entryPath: string;
  picked: string;
  verification: readonly string[];
  review: Readonly<{ sha256: string; decision: string; rounds: number; openFindings: readonly string[] }>;
}>;

export function writeStudioDelivery(root: string, writer: ProjectWriteAdapter,
  body: Omit<StudioDeliveryBody, 'schema' | 'createdAt' | 'sourceSha256'>): StudioDeliveryBody {
  const full: StudioDeliveryBody = { schema: STUDIO_DELIVERY_SCHEMA, createdAt: new Date().toISOString(),
    sourceSha256: studioSourceFingerprint(root), ...body };
  writer.write(STUDIO_DELIVERY_RECORD,
    `${canonicalJson({ ...full, signature: signNativeObservation(root, STUDIO_DELIVERY_SCHEMA, sha256(canonicalJson(full))) })}\n`);
  return full;
}

/** The signed delivery of this route whose page source is still the current source; anything else is stale. */
export function currentStudioDelivery(root: string, route: Route): StudioDeliveryBody | null {
  try {
    const { signature, ...body } = JSON.parse(readFileSync(join(root, STUDIO_DELIVERY_RECORD), 'utf8')) as StudioDeliveryBody & { signature?: unknown };
    if (body.schema !== STUDIO_DELIVERY_SCHEMA || typeof signature !== 'string'
      || !verifyNativeObservation(root, STUDIO_DELIVERY_SCHEMA, sha256(canonicalJson(body)), signature)) return null;
    return body.routeSha256 === adaptiveRouteRecordSha256(route) && body.sourceSha256 === studioSourceFingerprint(root) ? body : null;
  } catch { return null; }
}

/** Terminal acceptance of a new surface: a current, signed delivery. */
export function requireStudioDelivery(root: string, route: Route): StudioDeliveryBody {
  const delivery = currentStudioDelivery(root, route);
  if (delivery === null) {
    throw Object.assign(new Error(existsSync(join(root, STUDIO_DELIVERY_RECORD))
      ? 'STUDIO_DELIVERY_STALE: the page changed after its delivery; run omd lifecycle finish --json again.'
      : 'STUDIO_DELIVERY_REQUIRED: run omd lifecycle finish --json to build, check and deliver the page.'),
    { code: existsSync(join(root, STUDIO_DELIVERY_RECORD)) ? 'STUDIO_DELIVERY_STALE' : 'STUDIO_DELIVERY_REQUIRED' });
  }
  return delivery;
}
