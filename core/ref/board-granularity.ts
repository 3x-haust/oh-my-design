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

import type { Reference } from '../types.ts';

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
 * Captures of the SAME part from several sources are one slot studied repeatedly, not several parts.
 * When one part accounts for at least this share of a board of at least `CONCENTRATION_MIN_CAPTURES`
 * captures, the board is concentrated: it can compose that one slot well and has nothing for the rest.
 */
export const CONCENTRATION_SHARE = 0.5;
export const CONCENTRATION_MIN_CAPTURES = 4;


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
  readonly id: 'REF-WHOLE-PAGE' | 'REF-DUPLICATE-CAPTURE' | 'REF-NO-PARTS' | 'REF-PART-CONCENTRATION' | 'REF-ZONE-UNCOVERED' | 'REF-NAME-MISMATCH';
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
 * Audits a captured board for the granularity section-granular composition requires.
 *
 * Image references are excluded from the part count: they carry reasoning, not anatomy, so they
 * cannot answer "how is this component built" even though they are lawful board members.
 */
export function auditBoardGranularity(
  refs: readonly Reference[],
  opts: { readonly zones?: readonly string[] } = {},
): GranularityFinding[] {
  const findings: GranularityFinding[] = [];
  const measurable = refs.filter((ref) => ref.kind !== 'image');

  const wholePage = measurable.filter((ref) => isWholePageCapture(ref));
  if (wholePage.length > 0) {
    findings.push({
      id: 'REF-WHOLE-PAGE',
      message:
        `${wholePage.length} reference${wholePage.length === 1 ? ' was' : 's were'} captured at a page root rather than a part, so ${wholePage.length === 1 ? 'it carries' : 'they carry'} a whole-page average and no component anatomy. Recapture the specific component with \`omd ref add <url> --as <component> --selector "<css>" --blueprint --shot\`; a page-level capture can only be traced, and tracing a whole page is the derivative failure the transfer boundary forbids.`,
      refs: wholePage.map(label),
    });
  }

  const bySourceSelector = new Map<string, Reference[]>();
  for (const ref of measurable) {
    const key = `${ref.source}\u0000${captureSelector(ref)}`;
    const bucket = bySourceSelector.get(key);
    if (bucket) bucket.push(ref); else bySourceSelector.set(key, [ref]);
  }
  const duplicates = [...bySourceSelector.values()].filter((bucket) => bucket.length > 1);
  if (duplicates.length > 0) {
    findings.push({
      id: 'REF-DUPLICATE-CAPTURE',
      message:
        `${duplicates.length} source${duplicates.length === 1 ? ' was' : 's were'} captured more than once at the same selector, producing references with identical measurements under different component names. The board reads larger than it is: renaming one capture does not make it a second piece of evidence. Capture a different part of that source, or drop the duplicate.`,
      refs: duplicates.flatMap((bucket) => bucket.map(label)),
    });
  }

  const parts = measurable.filter((ref) => !isWholePageCapture(ref));
  if (parts.length < MIN_PART_CAPTURES) {
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
  const mislabelled = measurable
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
    const covered = new Set(
      parts.map((ref) => (ref.slot ?? '').trim().toLowerCase()).filter((slot) => slot !== ''),
    );
    const uncovered = opts.zones.filter((zone) => !covered.has(zone.trim().toLowerCase()));
    if (uncovered.length > 0) {
      findings.push({
        id: 'REF-ZONE-UNCOVERED',
        message: covered.size === 0
          ? `no capture is bound to a composition zone, so none of the ${opts.zones.length} required zones has evidence: ${opts.zones.join(', ')}. Bind each capture with \`omd ref add … --slot <zone>\`; an unbound board can be counted but not checked.`
          : `${uncovered.length} of ${opts.zones.length} required composition zones have no capture bound to them: ${uncovered.join(', ')}. Those zones compose from nothing. Capture the part that answers each with \`omd ref add <url> --as <component> --slot <zone> --selector "<css>" --blueprint --shot\`.`,
        refs: uncovered.map((zone) => `zone: ${zone}`),
      });
    }
  }

  return findings;
}
