import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPersistedRoute } from '../route/index.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { designDiscoveryItemIdentity } from './design-discovery-sources.ts';
import { loadRefs, researchLane } from './store.ts';
import { MEMORY_PICK_NOTE, projectMaterialNames, projectSearchFound } from './browse/provenance.ts';

function userNamed(root: string, invocation: ProjectRunInvocation, source: string): boolean {
  const host = new URL(source).hostname.replace(/^www\./, '');
  if (readPersistedRoute(root, invocation).request.includes(host) || projectMaterialNames(root, host)) return true;
  const turns = join(root, '.omd/user-turns');
  return existsSync(turns) && readdirSync(turns).some(name => readFileSync(join(turns, name), 'utf8').includes(host));
}

function publicPage(source: string): boolean {
  try {
    const url = new URL(source);
    return /^https?:$/.test(url.protocol) && !/^(?:localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(url.hostname);
  } catch { return false; }
}

type CaptureIntent = Readonly<{ source: string; lane?: string; fromUser?: boolean; selector?: string; shot?: boolean; image?: boolean }>;
export class ReferenceIntakeError extends Error {
  override readonly name = 'ReferenceIntakeError';
}
function galleryItem(url: string): string | null {
  try { return designDiscoveryItemIdentity(url); } catch { return null; }
}
export function captureFinalUrlGuard(root: string, specs: readonly CaptureIntent[], invocation?: ProjectRunInvocation) {
  if (!existsSync(join(root, '.omd/route.json'))) return (_index: number, _finalUrl: string, _visibleText?: string): void => {};
  if (!invocation) throw new ReferenceIntakeError('REFERENCE_INTAKE_AUTHORITY_REQUIRED');
  const route = readPersistedRoute(root, invocation);
  if (route.references.decision !== 'discover') return (_index: number, _finalUrl: string, _visibleText?: string): void => {};
  return (index: number, finalUrl: string, visibleText?: string): void => {
    const spec = specs[index]!;
    const lane = researchLane(spec.lane);
    void visibleText; // Script counts are evidence, never market authority.
    const requestedGalleryItem = galleryItem(spec.source);
    const finalGalleryItem = galleryItem(finalUrl);
    if (lane === 'design' && (requestedGalleryItem !== null || finalGalleryItem !== null)
      && requestedGalleryItem !== finalGalleryItem) {
      throw new ReferenceIntakeError('DESIGN_DISCOVERY_REDIRECT: the captured page must remain the exact requested gallery item; use ref navigate for discovery hops');
    }
    // The captured URL itself remains bound to the retained observation.
  };
}
export function validateCaptureBatch(root: string, specs: readonly CaptureIntent[], invocation?: ProjectRunInvocation): void {
  if (!existsSync(join(root, '.omd/route.json'))) return;
  for (const spec of specs) captureLane(root, spec, invocation);
}
export function captureLane(root: string, spec: CaptureIntent, invocation?: ProjectRunInvocation): 'domain' | 'design' {
  const selected = existsSync(join(root, '.omd/route.json'))
    ? invocation && readPersistedRoute(root, invocation).references.decision === 'discover'
    : false;
  if (selected === undefined) throw new ReferenceIntakeError('REFERENCE_INTAKE_AUTHORITY_REQUIRED');
  const lane = researchLane(selected ? spec.lane : spec.lane ?? 'design');
  // A gallery wrapper cannot be relabelled as an actual UI image. Direct originals remain valid.
  if (lane === 'design' && galleryItem(spec.source) !== null && (!spec.selector || spec.shot !== true))
    throw new ReferenceIntakeError('DESIGN_GALLERY_DISCOVERY_ONLY: select a visible UI image element, not the gallery wrapper');
  // A design reference comes from this project's searches or from the user; a site picked from memory repeats everywhere.
  // Model-led routes record discovery as skipped yet still research, so any routed capture is checked.
  if (lane === 'design' && invocation !== undefined && existsSync(join(root, '.omd/route.json')) && publicPage(spec.source)) {
    if (spec.fromUser && !userNamed(root, invocation, spec.source)) {
      throw new ReferenceIntakeError('DESIGN_REFERENCE_NOT_FROM_USER: --from-user needs a site the user named in the request or a later message.');
    }
    if (!spec.fromUser && !projectSearchFound(root, spec.source)) {
      throw new ReferenceIntakeError(`DESIGN_REFERENCE_UNSEARCHED: ${MEMORY_PICK_NOTE} Use --from-user only for a site the user supplied.`);
    }
  }
  // Direct valid sources are allowed; a claimed gallery/user traversal is checked only when made.
  return lane;
}

/** Image digests of every reference the project kept: filed refs and sealed browse keeps. */
function keptImageShas(root: string): Set<string> {
  const shas = new Set<string>();
  for (const reference of loadRefs(root, { includeDomain: true })) {
    const path = reference.imagePath === undefined ? null : join(root, reference.imagePath);
    if (path !== null && existsSync(path)) shas.add(createHash('sha256').update(readFileSync(path)).digest('hex'));
  }
  // ref import-image files its originals as content-addressed fragments beside the lane's refs.
  for (const lane of ['design', 'domain']) {
    const fragments = join(root, '.omd/refs', lane, 'fragments');
    for (const name of existsSync(fragments) ? readdirSync(fragments).filter(name => name.endsWith('.png')) : []) {
      shas.add(createHash('sha256').update(readFileSync(join(fragments, name))).digest('hex'));
    }
  }
  const browse = join(root, '.omd/discovery/browse');
  for (const session of existsSync(browse) ? readdirSync(browse) : []) {
    const seals = join(browse, session, 'seals');
    for (const name of existsSync(seals) ? readdirSync(seals) : []) {
      try {
        for (const keep of (JSON.parse(readFileSync(join(seals, name), 'utf8')) as { keeps?: { image?: { sha256?: string } }[] }).keeps ?? []) {
          if (keep.image?.sha256) shas.add(keep.image.sha256);
        }
      } catch { /* unreadable seal: contributes nothing */ }
    }
  }
  return shas;
}

/**
 * The references a page was built from are ones the project kept (browse keep, ref add, ref import-image), from
 * a site its searches surfaced or the user named; a page merely opened in the browser is not a reference.
 */
export function requireKeptConsultedImages(root: string, invocation: ProjectRunInvocation,
  images: readonly Readonly<{ sha256: string; sourceUrl: string }>[]): void {
  const kept = keptImageShas(root);
  for (const image of images) {
    if (!kept.has(image.sha256)) {
      throw new ReferenceIntakeError(`CONSULTED_REFERENCE_NOT_KEPT: ${image.sourceUrl} image ${image.sha256.slice(0, 12)} was never kept; `
        + 'keep it with omd ref browse keep --reason "..." and end the session (or ref add / ref import-image), then cite the kept image');
    }
    if (publicPage(image.sourceUrl) && !projectSearchFound(root, image.sourceUrl) && !userNamed(root, invocation, image.sourceUrl)) {
      throw new ReferenceIntakeError(`DESIGN_REFERENCE_UNSEARCHED: ${image.sourceUrl}: ${MEMORY_PICK_NOTE}`);
    }
  }
}
