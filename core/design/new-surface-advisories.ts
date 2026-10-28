import type { readPersistedRoute } from '../route/index.ts';
import { consultedReferenceSources, requestSuppliesFigmaTarget } from './consulted-references.ts';
import { COMPONENT_REFERENCE_GUIDANCE, componentGallerySearched, galleryFamily, isComponentGallerySource } from '../ref/component-references.ts';
import { sha256 } from '../ref/board-artifacts.ts';
import { loadRefs } from '../ref/store.ts';
import { hasReferenceDirectionAdmission, readAuthenticatedAdmissionHistory, requireReferenceDirectionAdmission } from '../ref/reference-direction-admission.ts';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { GRAPHIC_RENDER_DIRECTORY, WEBGL_GRAPHIC_SHARE, type GraphicRenderRecord } from '../render/graphic-render-record.ts';
import { join } from 'node:path';
import { DESIGN_BRIEF_GUIDANCE, readDesignBrief } from './design-brief.ts';
import { ideationRecorded } from './idea-image.ts';
import { graphicDecision, latestPageComparison, TASTE_REPAIR_ROUNDS, type PageVerdict } from './taste-graphic-decision.ts';

type Route = ReturnType<typeof readPersistedRoute>;

export const GRAPHIC_COMPARISON_GUIDANCE = 'A new landing explains its product with graphics, not text alone, and its graphics are designed before the page '
  + 'around them. Read omd pack theory/imagegen.md (with theory/art-direction.md for one visual brief across the image family and '
  + 'graphics/placeholder-policy.md). For each section the brief says a graphic shows, keep graphic references from the galleries '
  + '(omd ref browse search cosmos, dribbble, behance or pinterest "3D <the object the section shows>"), generate a few idea images and keep the '
  + 'strongest (omd imagegen --name <section> --prompt "<claim, protagonist object, material, light>" --reference <kept image path>; ideation only), '
  + 'build the graphic as a three.js scene on its '
  + 'own small page (for example public/graphics/<section>.html: one protagonist object acting the section\'s claim — the thing the product '
  + 'works on or turns out, caught mid-change, not the logo standing alone, which is identity rather than a claim — with physical material, '
  + 'RoomEnvironment light, a key light and a contact shadow, readable without the section\'s words; HTML cards and labels are a diagram, and a screenshot mapped onto a 3D card is still a screenshot), '
  + 'render it with omd render --graphic, and compare it '
  + 'with omd taste graphic <rendered.png> --against <kept image.path>; a graphic still told apart is reworked and compared again (up to three rounds). A skip (omd taste graphic --skip "<reason>") is accepted only after omd taste compare finds the page indistinguishable from human-made work.';

const newSurface = (route: Route): boolean => {
  const need = route.sourceContract.referenceDiscovery.taskNeed;
  return (need === 'new-product' || need === 'new-marketing') && !requestSuppliesFigmaTarget(route.request);
};

/**
 * Pending until a component gallery was searched (an unreachable gallery never stalls the work) and at least
 * one reference was kept: a new surface is not built on references that were looked at and let go.
 */
export function componentReferencesPending(root: string, route: Route): boolean {
  if (!newSurface(route)) return false;
  const searched = componentGallerySearched(root) || consultedReferenceSources(root, sha256(route.request))
    .some(source => source.role === 'supplemental' && isComponentGallerySource(source.sourceUrl));
  return !searched || loadRefs(root, { includeDomain: true }).length === 0;
}

/**
 * Refusal boundary at omd ref context: a new surface cites both kinds of reference designers use, finished sites
 * for the page and UI or graphic shots from the galleries for its parts. Kinds, not a count.
 */
export function requireReferenceKinds(route: Route, images: readonly Readonly<{ sourceUrl: string }>[]): void {
  if (!newSurface(route)) return;
  const gallery = (url: string): boolean => isComponentGallerySource(url) || galleryFamily(url) !== null;
  const missing = [
    ...(images.some(image => gallery(image.sourceUrl)) ? [] : ['a UI or graphic shot kept from a gallery (pinterest, dribbble, behance, cosmos, notefolio, refero)']),
    ...(images.some(image => !gallery(image.sourceUrl)) ? [] : ['a finished site kept from a whole-site gallery (landbook, onepagelove, awwwards, nook, lapaninja)']),
  ];
  if (!missing.length) return;
  const error = new Error(`COMPONENT_REFERENCES_MISSING: the cited references lack ${missing.join(' and ')}. ${COMPONENT_REFERENCE_GUIDANCE}`);
  Object.defineProperty(error, 'code', { value: 'COMPONENT_REFERENCES_MISSING', enumerable: true });
  throw error;
}

/**
 * Refusal boundary at omd ref context: a new surface's primary is a page the isolated reference reviewer judged
 * excellent and fitting (direction), not the first acceptable page the maker found. When two reviewed rounds
 * found no direction at all, the best supporting page may lead, and the report says so.
 */
export function requireReviewedPrimary(root: string, route: Route, images: readonly Readonly<{ sha256: string; role?: string }>[]): void {
  if (!newSurface(route)) return;
  const primary = images.find(image => image.role === 'primary');
  if (primary === undefined) return;
  const reference = loadRefs(root, { includeDomain: true }).find(item => item.researchLane === 'design' && item.imagePath !== undefined
    && existsSync(join(root, item.imagePath)) && sha256(readFileSync(join(root, item.imagePath))) === primary.sha256);
  if (reference === undefined) return;
  const refuse = (message: string): never => {
    const error = new Error(`PRIMARY_NOT_REVIEWED: ${message}`);
    Object.defineProperty(error, 'code', { value: 'PRIMARY_NOT_REVIEWED', enumerable: true });
    throw error;
  };
  try {
    requireReferenceDirectionAdmission(root, reference, route.sourceContractSha256, 'direction');
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    if (/MISSING|STALE/.test(code)) {
      refuse('run omd ref direction-review --json over everything you kept; an isolated reviewer judges each page\'s craft and fit, and the primary must be one it marks direction.');
    }
    const history = readAuthenticatedAdmissionHistory(root, route.sourceContractSha256);
    const anyDirection = history.some(item => item.admissions.some(admission => admission.verdict === 'direction'));
    if (/SUPPORT_ONLY/.test(code) && !anyDirection && history.length >= 2) return;
    refuse(`the reviewer did not mark this page direction (${code}). Choose a primary it marked direction, or keep better finished sites `
      + 'from the whole-site galleries and run omd ref direction-review again; a supporting page can still serve one named part.');
  }
}

/** Kept finished sites wait for the isolated reviewer's direction / support / reject before one becomes the primary. */
export const directionReviewPending = (root: string, route: Route): boolean => newSurface(route)
  && loadRefs(root, { includeDomain: true }).some(reference => reference.researchLane === 'design')
  && !hasReferenceDirectionAdmission(root);

/**
 * Refusal boundary at the first render: a new surface is reviewed against the references it was built from, so
 * they are published with omd ref context first; a refused ref context is a reason to look further, not to skip it.
 */
export function requireConsultedReferences(root: string, route: Route): void {
  if (!newSurface(route) || consultedReferenceSources(root, sha256(route.request)).length > 0) return;
  const error = new Error('CONSULTED_REFERENCES_MISSING: publish the references this page is built from with omd ref context --input <json> '
    + 'before the first render; when it refuses, keep what it names and run it again. ' + COMPONENT_REFERENCE_GUIDANCE);
  Object.defineProperty(error, 'code', { value: 'CONSULTED_REFERENCES_MISSING', enumerable: true });
  throw error;
}

/** The page's own source: index.html and src/, except a graphics folder where section graphics are built. */
export function pageSourcePath(path: string): boolean {
  const normalized = path.replace(/^\.\//, '').replace(/\\/g, '/');
  if (/(?:^|\/)graphics\//.test(normalized)) return false;
  return normalized === 'index.html' || (normalized.startsWith('src/') && /\.(?:tsx?|jsx?|css|html)$/.test(normalized));
}

/**
 * Refusal boundary at the first render: a new landing's section graphics are designed before the page around
 * them, so at least one was built in code and rendered with omd render --graphic before the page is captured.
 */
export function requireGraphicsStarted(root: string, route: Route): void {
  if (!motionRequired(route) || graphicDecision(root) !== null) return;
  const renders = join(root, GRAPHIC_RENDER_DIRECTORY);
  const records = existsSync(renders) ? readdirSync(renders).filter(name => name.endsWith('.json')).flatMap(name => {
    try { return [JSON.parse(readFileSync(join(renders, name), 'utf8')) as GraphicRenderRecord]; } catch { return []; }
  }) : [];
  // Only a built scene counts: a page holding an image (or a broken one) rendered through omd render --graphic is not a graphic.
  const built = records.filter(record => (record.webglShare ?? 0) >= WEBGL_GRAPHIC_SHARE && !(record.loadedRasters ?? []).length);
  if (built.length) return;
  const rendered = records.length ? ` The graphics rendered so far (${records.map(record => record.path).join(', ')}) hold no built scene: `
    + 'an image placed in a page, or one that failed to load, is not a graphic.' : '';
  const error = new Error(`GRAPHICS_NOT_STARTED: design the section graphics before the page around them.${rendered} ${GRAPHIC_COMPARISON_GUIDANCE}`);
  Object.defineProperty(error, 'code', { value: 'GRAPHICS_NOT_STARTED', enumerable: true });
  throw error;
}

/**
 * Before the page's own source: the section graphic is settled, no longer told apart from the kept human graphics or
 * reworked for the full rounds. A graphic that lost its first comparison is still being designed, and a page built
 * around it is built around a placeholder.
 */
export function requireGraphicSettled(root: string, route: Route): void {
  requireGraphicsStarted(root, route);
  if (!motionRequired(route) || graphicDecision(root) === 'compared') return;
  const error = new Error('GRAPHIC_NOT_SETTLED: the section graphic is still told apart from the kept human graphics. Rework it before '
    + 'building the page around it: read the recurring tells from the last omd taste graphic, change the protagonist, material, light or crop, '
    + `render it again with omd render --graphic and compare again (up to ${TASTE_REPAIR_ROUNDS} rounds; after them the page may proceed and the tells are reported).`);
  Object.defineProperty(error, 'code', { value: 'GRAPHIC_NOT_SETTLED', enumerable: true });
  throw error;
}

export const PAGE_IDEA_GUIDANCE = 'A new landing\'s composition is the open decision, so it is drafted as images before it is built: for the hero, '
  + 'and for any other section whose layout is not obvious, generate page ideas with omd imagegen --kind page --name <section> --prompt "<the '
  + 'section\'s exact copy, what sits where and how large, the type, the graphic or product proof and its place, the palette>". For the hero try '
  + 'genuinely different compositions, one per idea image (a different arrangement of copy, proof and action, not a colour variant), choose the one that reads best '
  + 'and note what must survive into the HTML. Describe what the kept references show in words; their pixels are not attached. The drafts never '
  + 'ship: the page is built in HTML on the design system and may improve on them (theory/imagegen.md).';

/**
 * Before the page's own source: a new landing's sections were drafted as page ideas (or generation was tried and is
 * unavailable here). Graphic ideas do not count; they settle one object, not the page around it.
 */
export function requirePageIdeas(root: string, route: Route): void {
  if (!motionRequired(route) || ideationRecorded(root, 'page')) return;
  const error = new Error(`PAGE_IDEAS_MISSING: ${PAGE_IDEA_GUIDANCE}`);
  Object.defineProperty(error, 'code', { value: 'PAGE_IDEAS_MISSING', enumerable: true });
  throw error;
}

export const designBriefPending = (root: string, route: Route): boolean => newSurface(route) && readDesignBrief(root) === null;

/** Refusal boundary at the first render: a new surface is built from a written brief, not straight from the request. */
export function requireDesignBrief(root: string, route: Route): void {
  if (!designBriefPending(root, route)) return;
  const error = new Error(`DESIGN_BRIEF_MISSING: ${DESIGN_BRIEF_GUIDANCE}`);
  Object.defineProperty(error, 'code', { value: 'DESIGN_BRIEF_MISSING', enumerable: true });
  throw error;
}

/**
 * Refusal boundary at omd ref context: every section the brief plans has references looked up for it, cited with
 * component set to the section's name. Coverage follows the page's own plan, not a fixed number.
 */
export function requireSectionReferences(root: string, route: Route,
  images: readonly Readonly<{ component?: string; role?: string; sourceUrl?: string; sha256?: string }>[]): void {
  if (!newSurface(route)) return;
  const brief = readDesignBrief(root);
  if (brief === null) return;
  // Another screen of the primary site is the same look again; a section's references come from elsewhere. Each
  // section also looks for its own best example: one site stands for one section, while a gallery counts per work.
  const host = (url: string | undefined): string => { try { return new URL(String(url)).hostname.replace(/^www\./, ''); } catch { return ''; } };
  // A gallery counts per work: several works kept from one results page share its address but not their pixels.
  const source = (url: string | undefined, sha: string | undefined): string => {
    try {
      const parsed = new URL(String(url));
      return galleryFamily(parsed.href) ? `${host(url)}${sha ? `#${sha}` : parsed.pathname}` : host(url);
    } catch { return ''; }
  };
  const primaryHost = host(images.find(image => image.role === 'primary')?.sourceUrl);
  const options = new Map(brief.sections.map(section => [section.name, new Set(images
    .filter(image => image.role === 'supplemental' && (primaryHost === '' || host(image.sourceUrl) !== primaryHost)
      && String(image.component ?? '').trim().toLowerCase() === section.name.trim().toLowerCase())
    .map(image => source(image.sourceUrl, image.sha256)).filter(Boolean))]));
  // Match sections to distinct sources (augmenting paths; a brief has a handful of sections).
  const owner = new Map<string, string>();
  const assign = (section: string, seen: Set<string>): boolean => [...options.get(section)!].some(key => {
    if (seen.has(key)) return false;
    seen.add(key);
    const current = owner.get(key);
    if (current === undefined || assign(current, seen)) { owner.set(key, section); return true; }
    return false;
  });
  const missing = brief.sections.filter(section => !assign(section.name, new Set())).map(section => section.name);
  if (!missing.length) return;
  const error = new Error(`SECTION_REFERENCES_MISSING: no reference is cited for the brief's section${missing.length === 1 ? '' : 's'} `
    + `${missing.map(name => JSON.stringify(name)).join(', ')}. For each, search the galleries for what that section shows, keep the best few, and cite `
    + 'them as supplemental images whose component is exactly the section name, from sites other than the primary (another screen of the '
    + 'primary is the same look again), and from a site no other section already cites (one site\'s pages are one look; a gallery '
    + 'counts per work). Designers open dozens and keep ten to twenty.');
  Object.defineProperty(error, 'code', { value: 'SECTION_REFERENCES_MISSING', enumerable: true });
  throw error;
}

export function graphicDecisionPending(root: string, route: Route, briefSha256: string): boolean {
  return newSurface(route) && route.sourceContract.referenceDiscovery.taskNeed === 'new-marketing'
    && graphicDecision(root, briefSha256) === null;
}

/** Terminal boundary: a new landing finishes only after it compared a graphic or wrote down why it carries none. */
export function requireGraphicDecision(root: string, route: Route, briefSha256: string): void {
  if (!graphicDecisionPending(root, route, briefSha256)) return;
  const error = new Error(`GRAPHIC_DECISION_MISSING: ${GRAPHIC_COMPARISON_GUIDANCE}`);
  Object.defineProperty(error, 'code', { value: 'GRAPHIC_DECISION_MISSING', enumerable: true });
  throw error;
}

/** Advisory only: new surfaces that skipped gallery references or graphic comparison hear it at production entry. */
export function newSurfaceAdvisories(root: string, route: Route): string[] {
  if (!newSurface(route)) return [];
  return [
    ...(componentReferencesPending(root, route) ? [`COMPONENT_REFERENCES_MISSING; ${COMPONENT_REFERENCE_GUIDANCE}`] : []),
    ...(route.sourceContract.referenceDiscovery.taskNeed === 'new-marketing' && graphicDecision(root) === null
      ? [`GRAPHIC_COMPARISON_MISSING; ${GRAPHIC_COMPARISON_GUIDANCE}`] : []),
  ];
}

export const MOTION_GUIDANCE = 'A new landing moves in ways a visitor notices: an entry sequence and section reveals or scroll-tied movement '
  + 'that act out what each section explains: build the entry from omd pack motion/recipes/hero-intro-sequence.md and the scroll staging from '
  + 'omd pack motion/recipes/scroll-scene-timeline.md (scroll-reveal.md, sticky-scene-transition.md and stagger-orchestrator.md beside it; theory in '
  + 'omd pack theory/motion.md; watch real ones with omd ref browse search 60fps <pattern such as 3d or onboarding>), with everything shown at once under reduced motion.';

type ObservedMotion = Readonly<{ load: Readonly<{ tracks: readonly unknown[] }>; cssAnimations?: Readonly<{ scrollTimelines: number }>;
  scroll: Readonly<{ triggered: readonly unknown[]; scrubbed: readonly unknown[]; pinned: readonly unknown[] }> }>;

/**
 * Finished landings stage their content as the visitor scrolls: eight of nine measured with omd render --motion
 * (leviosa.ai.kr, kaleoyouth.com, wonand.com, rig.ai, coding.bio, linear.app, stripe.com, toss.im; not vercel.com)
 * showed seven or more scroll-triggered or scroll-linked moves. An entry fade alone reads as a still page.
 */
export const SCROLL_STAGED_MOVES = 3;

export function motionShortfall(timeline: ObservedMotion): string | null {
  const scroll = timeline.scroll.triggered.length + timeline.scroll.scrubbed.length;
  if (scroll >= SCROLL_STAGED_MOVES) return null;
  // Scroll-driven CSS whose whole move fits inside one wheel step is a jump, not motion a visitor watches.
  const shortTimelines = (timeline.cssAnimations?.scrollTimelines ?? 0) > 0 && timeline.scroll.scrubbed.length === 0
    ? ' The page declares CSS scroll timelines, but none of their moves lasted longer than one scroll step: a short animation-range on a '
      + 'small element finishes within a single wheel tick. Drive each move over a longer stretch of scroll (for example animation-range: '
      + 'entry 10% cover 45% on the section rather than on a 40px row) so the visitor sees it travel.' : '';
  return timeline.load.tracks.length + scroll + timeline.scroll.pinned.length === 0
    ? `the rendered page showed no load or scroll motion.${shortTimelines}`
    : `the rendered page moves ${scroll === 0 ? 'only on load' : `in ${scroll} place${scroll === 1 ? '' : 's'} on scroll`}; `
      + `finished landings stage what each section explains as the visitor scrolls (at least ${SCROLL_STAGED_MOVES} triggered or scroll-linked moves).${shortTimelines}`;
}

/** A new landing is expected to move; the first-render restore and the finish both read this. */
export const motionRequired = (route: Route): boolean =>
  newSurface(route) && route.sourceContract.referenceDiscovery.taskNeed === 'new-marketing';

/**
 * Terminal boundary: a new landing whose rendered page shows no load or scroll motion finishes only once the
 * blind page comparison already finds it indistinguishable from human-made work.
 */
export async function requireNoticeableMotion(root: string, route: Route, timeline: ObservedMotion, briefSha256: string,
  readLatest: (projectRoot: string, briefSha256: string) => Promise<PageVerdict | undefined> = latestPageComparison): Promise<void> {
  if (!motionRequired(route)) return;
  const shortfall = motionShortfall(timeline);
  if (shortfall === null) return;
  const latest = await readLatest(root, briefSha256);
  if (latest?.summary.verdict === 'not-distinguishable') return;
  const error = new Error(`MOTION_ABSENT: ${shortfall} ${MOTION_GUIDANCE}`);
  Object.defineProperty(error, 'code', { value: 'MOTION_ABSENT', enumerable: true });
  throw error;
}
