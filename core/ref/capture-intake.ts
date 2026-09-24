import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readPersistedRoute } from '../route/index.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import type { RawIr } from '../types.ts';
import { designDiscoveryItemIdentity, referenceServiceHost } from './design-discovery-sources.ts';
import { observedGalleryItems } from './gallery-evidence.ts';
import { inferredKoreanReferenceMarket } from './market-reference.ts';
import { validateMarketReferenceCoverage } from './market-reference-coverage.ts';
import { readContainedRegularFile } from './reference-selection.ts';
import { readPublishedReferenceResearch } from './reference-research.ts';
import { assertReferenceLaneSeparation, loadRefs, researchLane } from './store.ts';

type CaptureIntent = Readonly<{ source: string; lane?: string; fromUser?: boolean; selector?: string; shot?: boolean; image?: boolean }>;
export class ReferenceIntakeError extends Error {
  override readonly name = 'ReferenceIntakeError';
}
function galleryItem(url: string): string | null {
  try { return designDiscoveryItemIdentity(url); } catch { return null; }
}
function host(url: string): string | null {
  try { return referenceServiceHost(url) || null; } catch { return null; }
}
export function captureFinalUrlGuard(root: string, specs: readonly CaptureIntent[], invocation?: ProjectRunInvocation) {
  if (!existsSync(join(root, '.omd/route.json'))) return (_index: number, _finalUrl: string, _raw?: RawIr): void => {};
  if (!invocation) throw new ReferenceIntakeError('REFERENCE_INTAKE_AUTHORITY_REQUIRED');
  const route = readPersistedRoute(root, invocation);
  if (route.references.decision !== 'discover') return (_index: number, _finalUrl: string, _raw?: RawIr): void => {};
  const koreanReferences = (route.sourceContract.localeDesign?.context.marketRegion ?? inferredKoreanReferenceMarket(route.request)) === 'KR';
  const localDomainResearchReady = (): boolean => {
    if (!existsSync(join(root, '.omd/reference-research.json'))) return false;
    try {
      const research = readPublishedReferenceResearch(root);
      validateMarketReferenceCoverage(root, research, route.request);
      return (research.marketCoverage?.domain.localSources.length ?? 0) >= 3;
    } catch { return false; }
  };
  const observed = new Map<number, string>();
  return (index: number, finalUrl: string, raw?: RawIr): void => {
    const spec = specs[index]!;
    const lane = researchLane(spec.lane);
    if (koreanReferences && lane === 'domain' && !spec.fromUser && !localDomainResearchReady()) {
      const visibleKorean = (raw?.nodes ?? []).reduce((count, node) => count + (node.text?.match(/[가-힣]/gu)?.length ?? 0), 0) >= 8;
      const koreanHost = new URL(finalUrl).hostname.endsWith('.kr');
      if (!visibleKorean && !koreanHost) throw new ReferenceIntakeError('REFERENCE_MARKET_LOCAL_FIRST: this Korean-language brief needs Korean-service evidence before foreign fallback. A visibly Korean-language service counts even on a .com domain; inspect local results or use another accessible Korean source.');
    }
    const service = host(finalUrl);
    const overlap = service !== null && (specs.some((other, otherIndex) => otherIndex !== index && other.lane !== lane
      && [host(other.source), host(observed.get(otherIndex) ?? '')].includes(service))
      || loadRefs(root, { includeDomain: true }).some(ref => ref.researchLane && ref.researchLane !== lane
        && [host(ref.source), host(ref.acquisition?.finalUrl ?? '')].includes(service)));
    if (overlap) throw new ReferenceIntakeError('REFERENCE_LANE_SERVICE_OVERLAP: the final captured service belongs to the other research lane');
    const requestedGalleryItem = galleryItem(spec.source);
    const finalGalleryItem = galleryItem(finalUrl);
    if (lane === 'design' && (requestedGalleryItem !== null || finalGalleryItem !== null)
      && requestedGalleryItem !== finalGalleryItem) {
      throw new ReferenceIntakeError('DESIGN_DISCOVERY_REDIRECT: the captured page must remain the exact requested gallery item; use ref navigate for discovery hops');
    }
    // Reserve synchronously before an async PNG write lets a sibling capture publish.
    observed.set(index, finalUrl);
  };
}
export function validateCaptureBatch(root: string, specs: readonly CaptureIntent[], invocation?: ProjectRunInvocation): void {
  if (!existsSync(join(root, '.omd/route.json'))) return;
  const lanes = specs.map(spec => captureLane(root, spec, invocation));
  if (!invocation || readPersistedRoute(root, invocation).references.decision !== 'discover') return;
  for (const [index, spec] of specs.entries()) {
    const service = host(spec.source);
    if (specs.slice(0, index).some((prior, priorIndex) => lanes[priorIndex] !== lanes[index]
      && (prior.source === spec.source || (service !== null && host(prior.source) === service)))) {
      throw new ReferenceIntakeError('REFERENCE_LANE_SERVICE_OVERLAP: pending batch entries must use independent domain and design sources');
    }
  }
}
export function captureLane(root: string, spec: CaptureIntent, invocation?: ProjectRunInvocation): 'domain' | 'design' {
  const selected = existsSync(join(root, '.omd/route.json'))
    ? invocation && readPersistedRoute(root, invocation).references.decision === 'discover'
    : false;
  if (selected === undefined) throw new ReferenceIntakeError('REFERENCE_INTAKE_AUTHORITY_REQUIRED');
  const lane = researchLane(selected ? spec.lane : spec.lane ?? 'design');
  if (lane === 'design' && galleryItem(spec.source) !== null) {
    if (!spec.selector || spec.shot !== true) {
      throw new ReferenceIntakeError('DESIGN_GALLERY_DISCOVERY_ONLY: visit the gallery item with omd ref navigate --lane design, then capture its actual UI image element with ref add --selector <img> and a screenshot; never retain the wrapper page');
    }
    if (!observedGalleryItems(root).some(item => item.url === spec.source)) {
      throw new ReferenceIntakeError('DESIGN_DISCOVERY_REQUIRED: visit this exact gallery item with omd ref navigate --lane design before retaining its UI image');
    }
  }
  if (!selected) return lane;
  if (lane === 'domain' && spec.image && !spec.fromUser) {
    if (invocation === undefined) throw new ReferenceIntakeError('REFERENCE_INTAKE_AUTHORITY_REQUIRED');
    const route = readPersistedRoute(root, invocation);
    if ((route.sourceContract.localeDesign?.context.marketRegion ?? inferredKoreanReferenceMarket(route.request)) === 'KR') {
      throw new ReferenceIntakeError('REFERENCE_MARKET_LOCAL_FIRST: Korean-first domain research requires a live observed service page; an unvisited image URL cannot establish its language or task.');
    }
  }
  assertReferenceLaneSeparation(root, { source: spec.source, researchLane: lane });
  const refs = loadRefs(root, { includeDomain: true });
  const service = host(spec.source);
  if (service !== null && refs.some(ref => ref.researchLane && ref.researchLane !== lane
    && [host(ref.source), host(ref.acquisition?.finalUrl ?? '')].includes(service))) {
    throw new ReferenceIntakeError('REFERENCE_LANE_SERVICE_OVERLAP: choose independent services for domain and design research');
  }
  if (lane === 'domain' || galleryItem(spec.source) !== null || spec.fromUser === true) return lane;
  if (observedGalleryItems(root).some(item => item.links.includes(spec.source))) return lane;
  const discovered = refs.some(ref => {
    const observation = ref.acquisition;
    if (ref.researchLane !== 'design' || !observation || galleryItem(ref.source) === null
      || galleryItem(ref.source) !== galleryItem(observation.finalUrl)
      || observation.httpStatus === null || observation.httpStatus < 200 || observation.httpStatus >= 300
      || !observation.links.includes(spec.source) || !ref.imagePath) return false;
    const bytes = readContainedRegularFile(root, join(root, ref.imagePath), 'design discovery capture');
    return createHash('sha256').update(bytes).digest('hex') === observation.imageSha256;
  });
  if (!discovered) throw new ReferenceIntakeError('DESIGN_DISCOVERY_REQUIRED: capture a free Pinterest/Dribbble/Behance/Siteinspire/Land-book/Godly/UI Bowl/Mobbin/Page Flows item first, then its observed original link. Task/domain service pages belong in --lane domain. Use --from-user only for a reference the user actually supplied.');
  return lane;
}
