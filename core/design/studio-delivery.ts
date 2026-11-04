import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson } from '../ref/canonical-json.ts';
import type { readPersistedRoute } from '../route/index.ts';
import { adaptiveRouteRecordSha256 } from '../route/index.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { listProductionSourceFiles } from '../source-seal/index.ts';
import { readFirstRenderIterationHistory } from './first-render-iteration-history.ts';
import { STUDIO_DIR } from './studio-paths.ts';

type Route = ReturnType<typeof readPersistedRoute>;

/**
 * A new page is delivered the way a designer delivers: built on the system taken from a studied site, held to it by
 * measurement, and compared once with that site by an independent reviewer; the page ships with whatever that look
 * still names. Designers compare and cut while they build; an outside loop of rounds only sands a page toward average.
 * The long evidence chain of existing-product work (browser plans, final reviewer lanes, publication graphs) is not
 * asked of it.
 */
export const STUDIO_REVIEW_ROUNDS = 1;
export const STUDIO_DELIVERY_RECORD = `${STUDIO_DIR}/delivery.json`;
export const STUDIO_DELIVERY_SCHEMA = 'omd-studio-delivery-v2';
export const STUDIO_DELIVER_MESSAGE = 'The page has had its comparison with the reference. Run omd lifecycle finish --json to deliver it and '
  + 'report the findings still open to the user, without another round.';

const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const builtPage = (root: string, dir: string): string | null => {
  for (const page of ['dist/index.html', 'index.html']) if (existsSync(join(root, dir, page))) return dir === '' ? page : `${dir}/${page}`;
  return null;
};

/**
 * The package and built page a new surface is delivered from. A page at the project root wins; otherwise a site kept in its own
 * package one folder down (website/, docs/, site/: test-320 built oh-my-design's site in website/ while the root package is the
 * plugin), the most recently built when there are several.
 */
export function studioSite(root: string): Readonly<{ dir: string; entry: string }> {
  const atRoot = builtPage(root, '');
  if (atRoot !== null) return { dir: '', entry: atRoot };
  const sites = readdirSync(root, { withFileTypes: true })
    .filter(item => item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules' && existsSync(join(root, item.name, 'package.json')))
    .flatMap(item => { const entry = builtPage(root, item.name); return entry === null ? [] : [{ dir: item.name, entry }]; })
    .sort((a, b) => statSync(join(root, b.entry)).mtimeMs - statSync(join(root, a.entry)).mtimeMs);
  return sites[0] ?? { dir: '', entry: 'index.html' };
}

/** The built page a new surface is delivered from. */
export const studioEntry = (root: string): string => studioSite(root).entry;

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
  /** The studied site whose system the page was built on. */
  reference: string;
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
