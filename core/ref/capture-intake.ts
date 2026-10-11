import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readPersistedRoute } from '../route/index.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { designDiscoveryItemIdentity } from './design-discovery-sources.ts';
import { researchLane } from './store.ts';

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
  if (!selected) return lane;
  // Direct valid sources are allowed; a claimed gallery/user traversal is checked only when made.
  return lane;
}
