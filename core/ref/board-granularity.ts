// Audits whether the captured board actually contains PARTS.
//
// Section-granular composition — composing each section from the reference that solves that section
// best — presupposes that the board holds parts. The capability exists (`omd ref add --selector
// … --blueprint --shot` measures one subtree) and is tested, but nothing checked that the scout
// used it. Audited on a real board, it had not: references were captured at `main`, the whole-page
// root, and several sources appeared twice under different component names with byte-identical
// invariants — the same page photographed twice, not two parts.
//
// A board of whole-page captures cannot be assembled from. It can only be traced, which is the
// derivative failure the transfer boundary forbids. This module names that condition.

import type { Invariants, Reference } from '../types.ts';
import type { ReferenceGrade } from './reference-scope.ts';
import { referenceMeasuredInvariants } from './measurement-coverage.ts';
import type { ReferenceBoardManifest } from './board-contract.ts';
import { designSignal, LOW_SIGNAL } from './signal.ts';
import { hasComparableDesignVocabulary, referenceCaptureFamilyKey, similarity, uncomparedComponents } from './distance.ts';
import { refIdentity } from './identity.ts';

/** Host of a capture source; a local fixture path is its own bucket. */
function sourceHost(source: string): string {
  try { return new URL(source).host; } catch { return source; }
}

type MeasuredReference = Reference & { readonly invariants: Invariants };

const measured = (refs: readonly Reference[]): readonly MeasuredReference[] =>
  refs.map(ref => ({ ...ref, invariants: referenceMeasuredInvariants(ref) })).filter((ref): ref is MeasuredReference => ref.invariants !== null && ref.kind !== 'image');

// CSS identifiers and attribute values can be case-sensitive; heuristic slot normalization is
// deliberately separate from identity.
const familyKey = referenceCaptureFamilyKey;
function families<T extends Reference>(refs: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const ref of refs) {
    const key = familyKey(ref);
    const group = groups.get(key);
    if (group) group.push(ref); else groups.set(key, [ref]);
  }
  return [...groups.values()];
}
function viewportKey(ref: Reference): string | null {
  const v = ref.viewport;
  return v && Number.isFinite(v.width) && Number.isFinite(v.height) && v.width > 0 && v.height > 0
    ? `${v.width}x${v.height}` : null;
}

/** Pairs with similar measured vocabularies that need a redundancy decision. */
function kinshipPairs(refs: readonly MeasuredReference[]): readonly { a: string; b: string; similarity: number; partial: boolean }[] {
  const pairs: { a: string; b: string; similarity: number; partial: boolean }[] = [];
  const groups = families(refs);
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      // All variants participate: one representative could hide cross-source kinship.
      let witness: typeof pairs[number] | undefined;
      for (const a of groups[i]!) for (const b of groups[j]!) {
        if (!hasComparableDesignVocabulary(a.invariants, b.invariants)) continue;
        const score = similarity(a.invariants, b.invariants);
        if (score >= KINSHIP_THRESHOLD && (!witness || score > witness.similarity)) {
          witness = { a: label(a), b: label(b), similarity: score, partial: uncomparedComponents(a.invariants, b.invariants).length > 0 };
        }
      }
      if (witness) pairs.push(witness);
    }
  }
  return pairs;
}

/**
 * Selectors that address the page rather than a part. A capture scoped to one of these measures the
 * whole document, so it carries a page average and no component anatomy.
 */
export const PAGE_ROOT_SELECTORS: ReadonlySet<string> = new Set([
  'main', 'body', 'html', ':root', '#root', '#app', '#__next', '#__nuxt', '.app', '*',
]);

/** A board needs at least this many component-scoped captures before it can be assembled from. */
export const MIN_PART_CAPTURES = 3;

/**
 * A landing-page board has to have seen the layout it is asked to produce. Captured at the mobile
 * default, a board holds column fragments — an observed run carried a 49px title strip and a
 * collapsed menu button — and the build composes a desktop page from evidence that never showed one.
 */
export const DESKTOP_EVIDENCE_WIDTH = 1024;

/**
 * Captures of the SAME part from several sources are one slot studied repeatedly, not several parts.
 * When one part accounts for at least this share of a board of at least `CONCENTRATION_MIN_CAPTURES`
 * captures, the board is concentrated: it can compose that one slot well and has nothing for the rest.
 */
export const CONCENTRATION_SHARE = 0.5;
export const CONCENTRATION_MIN_CAPTURES = 4;

/**
 * A board drawn mostly from one source carries that source's average, whatever the component names
 * say. Observed on a real run: five of six captures came from one design system, so every zone
 * inherited the same restraint and the build had no second opinion to compose against.
 */
export const SOURCE_CONCENTRATION_SHARE = 0.5;
export const SOURCE_CONCENTRATION_MIN_CAPTURES = 4;

/** At or above this threshold the pair is close enough to be one reference. */
export const KINSHIP_THRESHOLD = 0.85;

/**
 * A capture whose page makes almost no visual decisions teaches nothing. One is a content or
 * anti-reference; a board where they are the majority has no visual evidence to compose from.
 */
export const LOW_SIGNAL_MAJORITY_SHARE = 0.5;

/**
 * Slots a capture selector unambiguously identifies. Deliberately small: only selectors whose role
 * is beyond argument are mapped, so a disagreement reported here is a real one rather than a guess.
 */
const SELECTOR_SLOTS: readonly (readonly [RegExp, string])[] = [
  [/^(header|nav|header\s+nav|\[role=["']?banner["']?\])$/, 'nav'],
  [/^(footer|\[role=["']?contentinfo["']?\])$/, 'footer'],
  [/^(pre|code|\.language-[\w-]+|pre\s+code)$/, 'code block'],
];

/** Slot words a component name claims. Matched as whole words so `header-nav` does not read as hero. */
const NAME_SLOTS: readonly (readonly [RegExp, string])[] = [
  [/(^|[-_.])hero([-_.]|$)/, 'hero'],
  [/(^|[-_.])(nav|header|navbar)([-_.]|$)/, 'nav'],
  [/(^|[-_.])footer([-_.]|$)/, 'footer'],
  [/(^|[-_.])(pricing|price)([-_.]|$)/, 'pricing'],
  [/(^|[-_.])(testimonial|quote)([-_.]|$)/, 'testimonial'],
  [/(^|[-_.])(gallery|carousel)([-_.]|$)/, 'gallery'],
  [/(^|[-_.])(codeblock|snippet|terminal)([-_.]|$)/, 'code block'],
];

const slotOf = (value: string, table: readonly (readonly [RegExp, string])[]): string | null => {
  for (const [pattern, slot] of table) if (pattern.test(value)) return slot;
  return null;
};

/**
 * The slot a reference's own name claims, and the slot its capture selector proves — when both are
 * unambiguous. Returns null for either when the vocabulary does not confidently cover it.
 */
export function slotClaimAndCapture(ref: Pick<Reference, 'component' | 'selector'> & { blueprint?: { selector?: string } }): {
  readonly claimed: string | null;
  readonly captured: string | null;
} {
  return {
    claimed: slotOf((ref.component ?? '').toLowerCase(), NAME_SLOTS),
    captured: slotOf(captureSelector(ref), SELECTOR_SLOTS),
  };
}

export type GranularityFinding = {
  readonly id: 'REF-WHOLE-PAGE' | 'REF-VISUAL-ONLY' | 'REF-NO-IMAGE' | 'REF-MISSING-ANATOMY' | 'REF-DUPLICATE-CAPTURE' | 'REF-NO-PARTS' | 'REF-PART-CONCENTRATION' | 'REF-ZONE-UNCOVERED' | 'REF-NAME-MISMATCH' | 'REF-SOURCE-CONCENTRATION' | 'REF-KINSHIP-UNRESOLVED' | 'REF-LOW-SIGNAL-BOARD' | 'REF-CRAFT-UNGATHERED' | 'REF-NO-DESKTOP-EVIDENCE';
  readonly message: string;
  /** Reference identifiers the finding is about, as `source (component)`. */
  readonly refs: readonly string[];
};

const label = (ref: Pick<Reference, 'source' | 'component'>): string => `${ref.source} (${ref.component})`;

/** The selector a reference was measured at, normalised; empty when it was never scoped. */
export function captureSelector(ref: Pick<Reference, 'selector'> & { blueprint?: { selector?: string } }): string {
  const selector = ref.blueprint?.selector ?? ref.selector ?? '';
  return selector.trim().toLowerCase();
}

/** True when the reference measures a page root rather than a part. */
export function isWholePageCapture(ref: Pick<Reference, 'selector'> & { blueprint?: { selector?: string } }): boolean {
  const selector = captureSelector(ref);
  return selector === '' || PAGE_ROOT_SELECTORS.has(selector);
}

/**
 * The two axes as a reference actually carries them.
 *
 * Scope follows the selector. Evidence is `visual-only` only when the record affirmatively says the
 * capture was not measured: an imported image (`kind: 'image'`), or a record whose
 * `measurementCoverage` reports both extraction probes as not-measured. A selector-scoped capture
 * with no blueprint is legacy-unknown, not visual-only — treating absence of a blueprint as proof
 * of absence of measurement would silently disqualify every pre-blueprint record.
 */
export function referenceGrade(
  ref: Pick<Reference, 'selector' | 'kind' | 'invariants' | 'capturePreparation'> & { blueprint?: { selector?: string; nodes?: readonly unknown[] } },
): ReferenceGrade {
  const coverage = ref.invariants ? referenceMeasuredInvariants(ref)?.measurementCoverage : undefined;
  const knownUnmeasured = ref.kind === 'image' || coverage?.interactionProbe === 'not-measured' && coverage.motionProbe === 'not-measured';
  return Object.freeze({
    scope: isWholePageCapture(ref) ? 'whole' as const : 'part' as const,
    evidence: knownUnmeasured ? 'visual-only' as const : 'measured' as const,
  });
}

/**
 * Historical captures could select an iframe and save its painted screenshot while the
 * top-document extractor recorded only the replaced element's box. Keep this deliberately
 * narrow: a one-node leaf component is legitimate unless its own selector explicitly targets
 * an iframe. Fresh captures reject this at the render boundary before a record is written.
 */
export function isOpaqueFrameCapture(
  ref: Pick<Reference, 'selector'> & { blueprint?: Reference['blueprint'] },
): boolean {
  const selector = (ref.blueprint?.selector ?? ref.selector ?? '').trim().toLowerCase();
  const explicitlyTargetsIframe = /(^|[\s>+~,(])iframe(?=$|[#.:[\s>+~,)])/i.test(selector);
  const nodes = ref.blueprint?.nodes;
  return explicitlyTargetsIframe && nodes?.length === 1
    && nodes[0]!.role === 'container' && nodes[0]!.children.length === 0;
}

/**
 * Audits a captured board for the granularity section-granular composition requires.
 *
 * Image references are excluded from the part count: they carry reasoning, not anatomy, so they
 * cannot answer "how is this component built" even though they are lawful board members.
 * Required-zone auditing needs opts.zones; the native ref check caller supplies the current
 * acquisition plan after resolving the board's evidence. A standalone call without it is partial.
 */
export function auditBoardGranularity(
  refs: readonly Reference[],
  opts: { readonly zones?: readonly string[]; readonly appearanceZones?: readonly string[]; readonly board?: ReferenceBoardManifest } = {},
): GranularityFinding[] {
  const findings: GranularityFinding[] = [];
  const boardPieces = opts.board?.candidates.flatMap((candidate) => candidate.pieces);
  const componentClaims = boardPieces === undefined ? undefined : new Set(boardPieces
    .filter((piece) => piece.sourceKind === 'component-capture').map((piece) => piece.referenceId));
  const visuallyClaimed = boardPieces === undefined ? undefined : new Set(boardPieces
    // Native board resolution validates image-fragment PNGs and provenance separately. They are
    // still visual claims for required-zone coverage, but do not live in the component registry.
    // Only classified references waive visual claims; legacy signal strings cannot do so.
    .filter((piece) => piece.sourceKind !== 'classified-reference')
    .map((piece) => piece.referenceId));
  // A reference used for any visual claim remains visual: a simultaneous content-only use cannot
  // waive its capture. References used only for supporting content or rejection constraints do not
  // enter visual quality, kinship, geometry, viewport, or part-count calculations.
  const audited = visuallyClaimed === undefined
    ? refs
    : refs.filter((ref) => visuallyClaimed.has(refIdentity(ref.source, ref.component)));
  const boardVisualPieces = boardPieces?.filter((piece) => visuallyClaimed?.has(piece.referenceId));
  const visualSlots = new Set(boardVisualPieces?.map((piece) => (piece.binding?.zoneId ?? piece.slotId).trim().toLowerCase()) ?? []);
  const visualReferences = new Set(boardVisualPieces?.map((piece) => piece.referenceId) ?? []);
  const measurable = audited.filter((ref) => ref.kind !== 'image');
  const missingAnatomy = measurable.filter(isOpaqueFrameCapture);
  // Opaque frame boxes are preserved as historical records, but are not measurements of the
  // component shown in their screenshots. They cannot establish parts, coverage, or kinship.
  //
  // A visual-only capture is excluded for the same reason one level stronger: it carries
  // appearance, not anatomy, so it cannot establish parts, zone coverage, or kinship either. It
  // remains usable as mood/detail evidence through `reference-scope.ts` role permissions.
  const visualOnly = measurable.filter((ref) => referenceGrade(ref).evidence === 'visual-only');
  const anatomical = measurable.filter((ref) => !isOpaqueFrameCapture(ref) && referenceGrade(ref).evidence === 'measured');

  const missingVisualReferences = componentClaims === undefined ? [] : [...componentClaims].filter((referenceId) => !audited.some((ref) => refIdentity(ref.source, ref.component) === referenceId));
  if (missingVisualReferences.length > 0) {
    findings.push({
      id: 'REF-NO-PARTS',
      message: `${missingVisualReferences.length} visual reference claim${missingVisualReferences.length === 1 ? '' : 's'} cannot resolve a current capture. Visual, geometry, motion, and interaction transfer always require current captured evidence.`,
      refs: missingVisualReferences,
    });
  }
  if (missingAnatomy.length > 0) {
    findings.push({
      id: 'REF-MISSING-ANATOMY',
      message:
        `${missingAnatomy.length} reference${missingAnatomy.length === 1 ? '' : 's'} selected an iframe whose screenshot contains an embedded page, but whose blueprint measures only the opaque frame box. `
        + 'Inspect the intended iframe and state, open its resolved embedded document URL, and recapture a selector inside that document. These records are preserved, but cannot count as component anatomy, required-zone coverage, or kinship evidence.',
      refs: missingAnatomy.map(label),
    });
  }

  const wholePage = anatomical.filter((ref) => isWholePageCapture(ref));
  if (wholePage.length > 0) {
    findings.push({
      id: 'REF-WHOLE-PAGE',
      message:
        `${wholePage.length} reference${wholePage.length === 1 ? ' was' : 's were'} captured at a page root rather than a part, so ${wholePage.length === 1 ? 'it carries' : 'they carry'} a whole-page average and no component anatomy. Recapture the specific component with \`omd ref add <url> --as <component> --selector "<css>" --blueprint --shot\`; a page-level capture can only be traced, and tracing a whole page is the derivative failure the transfer boundary forbids.`,
      refs: wholePage.map(label),
    });
  }

  if (visualOnly.length > 0) {
    findings.push({
      id: 'REF-VISUAL-ONLY',
      message:
        `${visualOnly.length} reference${visualOnly.length === 1 ? '' : 's'} carr${visualOnly.length === 1 ? 'ies' : 'y'} no measured blueprint, so ${visualOnly.length === 1 ? 'it is' : 'they are'} visual-only evidence: appearance without anatomy. Visual-only captures cannot establish parts, zone coverage, spacing, or kinship — a screenshot does not measure that a padding is 16px. Use ${visualOnly.length === 1 ? 'it' : 'them'} for direction and detail, or recapture with \`--selector "<css>" --blueprint\` to make the anatomy measured.`,
      refs: visualOnly.map(label),
    });
  }

  // A reference without its image cannot be re-examined: the measured ladders survive and the screen
  // that produced them does not. Reported so an omission that was already recorded is still visible.
  const imageless = audited.filter((ref) => (ref.imagePath ?? '').trim() === '');
  if (imageless.length > 0) {
    findings.push({
      id: 'REF-NO-IMAGE',
      message:
        `${imageless.length} reference${imageless.length === 1 ? '' : 's'} hold${imageless.length === 1 ? 's' : ''} no image${imageless.length === 1 ? '' : 's'}. A reference keeps its screen so the decision behind the numbers can be re-examined later; without it, a reader can see the ladders but not the design they came from. Recapture with \`omd ref add <url> --as <component>\` (the image is captured by default), or record why with \`--no-shot --no-shot-reason "<why>"\`.`,
      refs: imageless.map(label),
    });
  }

  const duplicates = families(anatomical).filter(bucket => bucket.length > 1 && (
    bucket.some(ref => viewportKey(ref) === null) || new Set(bucket.map(viewportKey)).size !== bucket.length
  ));
  if (duplicates.length > 0) {
    findings.push({
      id: 'REF-DUPLICATE-CAPTURE',
      message:
        `${duplicates.length} source-selector families contain repeated or unknown viewports. Distinct explicit viewports are complementary observations of one family; renaming one capture does not make it a second piece of evidence. Keep responsive variants, but resolve same-viewport aliases or missing viewport evidence.`,
      refs: duplicates.flatMap((bucket) => bucket.map(label)),
    });
  }

  const partRecords = anatomical.filter((ref) => !isWholePageCapture(ref));
  // Counts/diversity use families; geometry, names and zone coverage retain every record.
  const parts = families(partRecords).map(group => group[0]!);
  const legacyCountGate = opts.board?.schemaVersion !== 'reference-board-v3';
  if (legacyCountGate && ((visuallyClaimed === undefined && parts.length < MIN_PART_CAPTURES)
    || (visuallyClaimed !== undefined && visualReferences.size > 0 && parts.length < MIN_PART_CAPTURES))) {
    findings.push({
      id: 'REF-NO-PARTS',
      message:
        `the board holds ${parts.length} component-scoped capture${parts.length === 1 ? '' : 's'}, below the ${MIN_PART_CAPTURES} needed to compose section by section. Section-granular composition takes each section's best-fit part from possibly different references; with no parts there is nothing to assemble and the build falls back to imitating one page.`,
      refs: parts.map(label),
    });
  }

  // Name truth: a reference whose name claims one slot while its capture proves another hides the
  // board's real shape. Read as a list of component names the board looks varied; measured by
  // selector it is the same part repeatedly, and only the mismatch explains the gap.
  const mislabelled = anatomical
    .map((ref) => ({ ref, ...slotClaimAndCapture(ref) }))
    .filter((entry) => entry.claimed !== null && entry.captured !== null && entry.claimed !== entry.captured);
  if (mislabelled.length > 0) {
    findings.push({
      id: 'REF-NAME-MISMATCH',
      message:
        `${mislabelled.length} reference${mislabelled.length === 1 ? '' : 's'} name a slot the capture contradicts: ${mislabelled.map((e) => `\`${e.ref.component}\` claims ${e.claimed} but was captured at ${e.captured}`).join('; ')}. The name is what every downstream reader sees — the composer choosing a part for a section, and the human scanning the board — so a board of three navs reads as varied coverage while measuring as one slot three times. Rename the capture to what it holds, or recapture the slot the name claims.`,
      refs: mislabelled.map((e) => label(e.ref)),
    });
  }

  // Part diversity: three navs from three sites are one slot studied three times, not three parts.
  if (parts.length >= CONCENTRATION_MIN_CAPTURES) {
    const bySelector = new Map<string, Reference[]>();
    for (const ref of parts) {
      const key = captureSelector(ref);
      const bucket = bySelector.get(key);
      if (bucket) bucket.push(ref); else bySelector.set(key, [ref]);
    }
    const [topSelector, topRefs] = [...bySelector.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
    if (topRefs.length / parts.length >= CONCENTRATION_SHARE) {
      findings.push({
        id: 'REF-PART-CONCENTRATION',
        message:
          `${topRefs.length} of ${parts.length} component captures measure the same part (\`${topSelector}\`), so the board studies one slot repeatedly instead of covering the page. Capturing the same element from several sources answers "how do others build this one part" — useful once — but it leaves every other section with no evidence to compose from. Capture the sections that still have none.`,
        refs: topRefs.map(label),
      });
    }

  }

  // Coverage is per composition zone, by name. Domain surfaces are pages/screens and cannot tell a
  // board that studied the nav five times from one that covered every section/region/state inside it.
  if (opts.zones !== undefined && opts.zones.length > 0) {
    const anatomicalReferenceIds = new Set(partRecords.map((ref) => refIdentity(ref.source, ref.component)));
    // A v3 board has already resolved and hashed each image fragment. Only the current
    // Framer plan may select static appearance coverage; images never earn anatomy credit.
    const appearanceZones = new Set(opts.board?.schemaVersion === 'reference-board-v3'
      ? opts.appearanceZones?.map(zone => zone.trim().toLowerCase()) ?? [] : []);
    const covered = opts.board === undefined
      ? new Set(partRecords.map((ref) => (ref.slot ?? '').trim().toLowerCase()).filter((slot) => slot !== ''))
      : new Set(opts.zones.map((zone) => zone.trim().toLowerCase()).filter((zone) => opts.board!.candidates.every((candidate) => candidate.pieces.some((piece) => (
        (piece.binding?.zoneId ?? piece.slotId).trim().toLowerCase() === zone && piece.evidenceAxes.signal !== 'anti-reference'
        && ((piece.sourceKind === 'component-capture' && anatomicalReferenceIds.has(piece.referenceId))
          || (appearanceZones.has(zone) && piece.sourceKind === 'image-fragment'))
      )))));
    const uncovered = opts.zones.filter((zone) => !covered.has(zone.trim().toLowerCase()));
    const uncoveredVisual = opts.board === undefined ? uncovered : uncovered.filter((zone) => visualSlots.has(zone.trim().toLowerCase()));
    if (uncoveredVisual.length > 0) {
      findings.push({
        id: 'REF-ZONE-UNCOVERED',
        message: covered.size === 0
          ? `no capture is bound to a composition zone, so none of the ${opts.zones.length} required zones has evidence: ${opts.zones.join(', ')}. Bind each capture with \`omd ref add … --slot <zone>\`; an unbound board can be counted but not checked.`
          : `${uncoveredVisual.length} of ${opts.zones.length} required composition zones lack their declared evidence kind: ${uncoveredVisual.join(', ')}. Measured zones need scoped component anatomy; only a Framer-declared visible-appearance zone may use a current provenance-bound image. Preserve the required state and acquire its actual evidence.`,
        refs: uncoveredVisual.map((zone) => `zone: ${zone}`),
      });
    }
  }

  // Source diversity: component names vary, sources may not. A board drawn mostly from one site
  // inherits that site's average for every zone, and the build has no second opinion to compose
  // against — the failure is invisible in a zone-coverage count, which this board passes.
  if (parts.length >= SOURCE_CONCENTRATION_MIN_CAPTURES) {
    const bySource = new Map<string, Reference[]>();
    for (const ref of parts) {
      const key = sourceHost(ref.source);
      const bucket = bySource.get(key);
      if (bucket) bucket.push(ref); else bySource.set(key, [ref]);
    }
    const [topSource, topRefs] = [...bySource.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
    if (topRefs.length / parts.length > SOURCE_CONCENTRATION_SHARE) {
      findings.push({
        id: 'REF-SOURCE-CONCENTRATION',
        message:
          `${topRefs.length} of ${parts.length} component captures come from one source (\`${topSource}\`), so most zones inherit the same site's average however different the component names read. Zone coverage cannot see this: every zone has evidence, and all of it agrees with itself. Capture the remaining zones from sources that solve them differently.`,
        refs: topRefs.map(label),
      });
    }
  }

  // Kinship is a measured-vocabulary convergence signal, never a provenance verdict.
  // The same family semantics and comparability floor also govern `omd ref list`.
  const kin = kinshipPairs(measured(anatomical));
  if (kin.length > 0) {
    findings.push({
      id: 'REF-KINSHIP-UNRESOLVED',
      message:
        `${kin.length} reference pair${kin.length === 1 ? '' : 's'} have similar measured design vocabularies (${kin.map((pair) => `${pair.a} ≈ ${pair.b} at ${pair.similarity.toFixed(2)}${pair.partial ? ' on comparable axes only; omitted axes remain unknown' : ''}`).join('; ')}). This is a convergence signal, not proof of shared provenance or identical task anatomy. Resolve redundant visual influences by retaining the stronger observation, finding complementary evidence, or recording an actual anti-reference.`,
      refs: kin.flatMap((pair) => [pair.a, pair.b]),
    });
  }

  // Signal: a page that makes almost no visual decisions cannot teach one. `omd ref add` warns per
  // capture; nothing checked the board as a whole, and a board that is mostly low-signal has no
  // visual evidence left to compose from once the content is stripped.
  // One conservative vote per family: a strong sibling cannot erase a low-signal observation.
  const anatomicalMeasurements = families(measured(anatomical));
  const lowSignal = anatomicalMeasurements.flatMap(group => {
    const weak = group.filter(ref => designSignal(ref.invariants, ref.blueprint).score < LOW_SIGNAL)
      .sort((a, b) => label(a).localeCompare(label(b)));
    return weak.length ? [weak[0]!] : [];
  });
  if (anatomicalMeasurements.length > 0 && lowSignal.length / anatomicalMeasurements.length > LOW_SIGNAL_MAJORITY_SHARE) {
    findings.push({
      id: 'REF-LOW-SIGNAL-BOARD',
      message:
        `${lowSignal.length} of ${anatomicalMeasurements.length} measured source-selector families have observations that score below ${LOW_SIGNAL} design signal. Each family votes once and any low-signal variant retains that vote; strong siblings cannot erase weak observations. Capture high-signal evidence for the needed visual zones or use weak captures only for nonvisual claims.`,
      refs: lowSignal.map(label),
    });
  }
  // Desktop evidence: a board captured only at phone width has never seen the composition it is
  // being asked to produce. The measurements are real, but they describe a column.
  const sized = partRecords.filter((ref) => ref.viewport !== undefined);
  if (sized.length > 0 && !sized.some((ref) => viewportKey(ref) !== null && (ref.viewport?.width ?? 0) >= DESKTOP_EVIDENCE_WIDTH)) {
    findings.push({
      id: 'REF-NO-DESKTOP-EVIDENCE',
      message:
        `no capture has a valid viewport at least ${DESKTOP_EVIDENCE_WIDTH}px wide, so the board has no desktop composition evidence. A malformed viewport cannot establish desktop coverage. Recapture at 1440x900, which is now the reference default.`,
      refs: sized.map(label),
    });
  }

  return findings;
}
