/**
 * Responsive frame matching — F4 implementation.
 *
 * Groups frames that are viewport variants of the same screen using three
 * heuristics applied in priority order:
 *
 *   1. Name-suffix matching (highest confidence)
 *      Frames that share a base name after stripping recognized device/width
 *      suffixes are grouped. Suffixes detected (case-insensitive, separated by
 *      space · / - _):
 *        English   Desktop · Mobile · Tablet
 *        Korean    데스크톱 · 모바일 · 태블릿
 *        Numeric   3-4 digit widths (e.g. 375, 1440)
 *      Examples: "Home / Desktop" + "Home-Mobile" → screen "Home"
 *                "홈 1440" + "홈 375"             → screen "홈"
 *      A frame whose full name matches a base name extracted from another frame
 *      (e.g. "Homepage" + "Homepage / Mobile") is also grouped here.
 *
 *   2. Structure-similarity within width bands (fallback)
 *      Frames that were not matched by name but fall in standard width bands and
 *      share near-identical node structure (Jaccard ≥ 0.75 on node-type counts)
 *      are paired across bands. Mobile (320–480 px) is the anchor; matching
 *      desktop (1200–1600 px) and optionally tablet (600–900 px) are added.
 *
 *   3. Unmatched leftovers
 *      Any frame that could not be placed into a set is returned in `unmatched`,
 *      labeled honestly rather than forced into a group.
 *
 * All functions are pure (no I/O), operating on FigmaSnapshot data produced by
 * core/figma/client.ts.
 */
import type { FigmaSnapshot, Band, FigmaResponsiveVariant, FigmaBreakpointSet } from './types.ts';
import type { SnapshotFrame } from './types.ts';

export type { Band, FigmaResponsiveVariant, FigmaBreakpointSet };

// ── Public result type ─────────────────────────────────────────────────────────

export interface ResponsiveResult {
  breakpointSets: FigmaBreakpointSet[];
  /** Frames that did not match any viewport-variant group. */
  unmatched: FigmaResponsiveVariant[];
}

// ── Band classification ────────────────────────────────────────────────────────

/** Inclusive width ranges for the three standard bands. */
const BAND_RANGES: ReadonlyArray<readonly [Band, number, number]> = [
  ['mobile',  320,  480],
  ['tablet',  600,  900],
  ['desktop', 1200, 1600],
] as const;

/**
 * Classify a pixel width into a named viewport band.
 *
 * Widths outside all three ranges (e.g. 0, 500, 1920) return 'unknown'.
 * Pure and deterministic.
 */
export function classifyBand(width: number): Band {
  for (const [band, min, max] of BAND_RANGES) {
    if (width >= min && width <= max) return band;
  }
  return 'unknown';
}

// ── Name-suffix stripping ──────────────────────────────────────────────────────

/**
 * Device/width suffix pattern.
 *
 * Matches a separator (one or more of ` / - _`) followed by a recognized device
 * keyword or a 3–4 digit number at the end of the string. Case-insensitive.
 *
 * Examples matched:
 *   " / Desktop"   "- Mobile"   "_Tablet"   " 1440"   " 375"
 *   " / 데스크톱"  "- 모바일"   " 태블릿"
 */
const SUFFIX_RE = /[\s/\-_]+(?:desktop|mobile|tablet|데스크톱|모바일|태블릿|\d{3,4})\s*$/i;

/**
 * Strip a recognized device/width suffix from a frame name and return the base.
 *
 * Returns the original name unchanged when no suffix is recognized.
 * Pure and deterministic.
 *
 * Examples:
 *   "Home / Desktop" → "Home"
 *   "Home-Mobile"    → "Home"
 *   "홈 1440"        → "홈"
 *   "홈 375"         → "홈"
 *   "Dashboard"      → "Dashboard"   (no suffix)
 *   "Mobile"         → "Mobile"      (no separator before the keyword)
 */
export function extractBaseName(name: string): string {
  return name.replace(SUFFIX_RE, '').trim();
}

// ── Frame width helpers ────────────────────────────────────────────────────────

/** Extract the pixel width of a frame from its root node's bounding box. */
function frameWidth(frame: SnapshotFrame): number {
  return frame.nodes[0]?.absoluteBoundingBox?.width ?? 0;
}

// ── Structure fingerprint ──────────────────────────────────────────────────────

/**
 * Build a compact structure fingerprint for a frame.
 *
 * The fingerprint is a stable string encoding the count of each node type
 * present in the frame (all depths combined):
 *   "FRAME:4,RECTANGLE:2,TEXT:6"  (sorted alphabetically for stability)
 *
 * Purpose: two frames implementing the same screen at different viewports will
 * share roughly the same node-type distribution, even if element counts shift
 * slightly due to layout reflow or conditional visibility.
 */
function structureFingerprint(frame: SnapshotFrame): string {
  const counts = new Map<string, number>();
  for (const node of frame.nodes) {
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([t, n]) => `${t}:${n}`)
    .join(',');
}

/**
 * Compute a Jaccard-like similarity between two structure fingerprints.
 *
 * Treats each type:count entry as a multiset and returns:
 *   intersection / union  where intersection = Σ min(ca, cb)
 *                                    union     = Σ max(ca, cb)
 *
 * Returns 1.0 for identical fingerprints, 0.0 for completely disjoint ones.
 */
export function fingerprintSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a === '' || b === '') return a === b ? 1 : 0;

  const parse = (fp: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (const part of fp.split(',')) {
      const idx = part.lastIndexOf(':');
      if (idx === -1) continue;
      m.set(part.slice(0, idx), parseInt(part.slice(idx + 1), 10));
    }
    return m;
  };

  const ma = parse(a);
  const mb = parse(b);

  let intersection = 0;
  let union = 0;
  const allKeys = new Set([...ma.keys(), ...mb.keys()]);
  for (const k of allKeys) {
    const ca = ma.get(k) ?? 0;
    const cb = mb.get(k) ?? 0;
    intersection += Math.min(ca, cb);
    union += Math.max(ca, cb);
  }

  return union === 0 ? 1 : intersection / union;
}

// ── Threshold ─────────────────────────────────────────────────────────────────

/**
 * Minimum Jaccard similarity for the structure-similarity fallback to consider
 * two frames variants of the same screen.
 */
export const STRUCTURE_SIMILARITY_THRESHOLD = 0.75;

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Group frames in a snapshot into responsive breakpoint sets.
 *
 * See module-level doc-comment for full heuristic description.
 * Pure — no I/O.
 */
export function matchResponsiveFrames(snapshot: FigmaSnapshot): ResponsiveResult {
  // Flatten all frames from all pages, annotated with width + band.
  type AnnotatedFrame = { frame: SnapshotFrame; width: number; band: Band };
  const all: AnnotatedFrame[] = snapshot.pages.flatMap((page) =>
    page.frames.map((frame) => {
      const width = frameWidth(frame);
      return { frame, width, band: classifyBand(width) };
    }),
  );

  const assigned = new Set<string>(); // frameIds that have been placed in a set
  const breakpointSets: FigmaBreakpointSet[] = [];

  // ── Heuristic 1: name-suffix matching ────────────────────────────────────────

  // Phase A: frames that carry a recognized suffix → byBaseName[base].
  const byBaseName = new Map<string, AnnotatedFrame[]>();
  const knownBases = new Set<string>(); // base names produced by stripping a suffix

  for (const f of all) {
    const base = extractBaseName(f.frame.name);
    if (base !== f.frame.name && base.length > 0) {
      const arr = byBaseName.get(base) ?? [];
      arr.push(f);
      byBaseName.set(base, arr);
      knownBases.add(base);
    }
  }

  // Phase B: frames WITHOUT a suffix whose full name equals a known base
  //   e.g. "Homepage" pairs with "Homepage / Mobile".
  for (const f of all) {
    const base = extractBaseName(f.frame.name);
    if (base === f.frame.name && knownBases.has(f.frame.name)) {
      const arr = byBaseName.get(f.frame.name) ?? [];
      arr.push(f);
      byBaseName.set(f.frame.name, arr);
    }
  }

  // Emit a breakpoint set for every base that has ≥ 2 frames.
  for (const [screen, group] of byBaseName) {
    if (group.length < 2) continue;
    const variants: FigmaResponsiveVariant[] = group.map(({ frame, width, band }) => ({
      frameId: frame.id,
      name: frame.name,
      width,
      band,
    }));
    breakpointSets.push({ screen, variants });
    for (const { frame } of group) assigned.add(frame.id);
  }

  // ── Heuristic 2: structure-similarity across width bands ──────────────────────

  const unassigned = all.filter((f) => !assigned.has(f.frame.id));

  const byBand: Record<Band, AnnotatedFrame[]> = {
    mobile:  [],
    tablet:  [],
    desktop: [],
    unknown: [],
  };
  for (const f of unassigned) {
    byBand[f.band].push(f);
  }

  const bandAssigned = new Set<string>();

  // Anchor on each mobile frame; find the best-matching desktop, then tablet.
  for (const mobile of byBand.mobile) {
    if (bandAssigned.has(mobile.frame.id)) continue;
    const mFp = structureFingerprint(mobile.frame);

    // Best-matching desktop
    let bestDesktop: AnnotatedFrame | undefined;
    let bestDesktopSim = STRUCTURE_SIMILARITY_THRESHOLD - Number.EPSILON;
    for (const desktop of byBand.desktop) {
      if (bandAssigned.has(desktop.frame.id)) continue;
      const sim = fingerprintSimilarity(mFp, structureFingerprint(desktop.frame));
      if (sim > bestDesktopSim) {
        bestDesktopSim = sim;
        bestDesktop = desktop;
      }
    }

    if (bestDesktop === undefined) continue;

    const variants: FigmaResponsiveVariant[] = [
      { frameId: mobile.frame.id,  name: mobile.frame.name,  width: mobile.width,  band: mobile.band },
      { frameId: bestDesktop.frame.id, name: bestDesktop.frame.name, width: bestDesktop.width, band: bestDesktop.band },
    ];
    bandAssigned.add(mobile.frame.id);
    bandAssigned.add(bestDesktop.frame.id);

    // Optionally include the best tablet if it also clears the threshold.
    let bestTablet: AnnotatedFrame | undefined;
    let bestTabletSim = STRUCTURE_SIMILARITY_THRESHOLD - Number.EPSILON;
    for (const tablet of byBand.tablet) {
      if (bandAssigned.has(tablet.frame.id)) continue;
      const sim = fingerprintSimilarity(mFp, structureFingerprint(tablet.frame));
      if (sim > bestTabletSim) {
        bestTabletSim = sim;
        bestTablet = tablet;
      }
    }
    if (bestTablet !== undefined) {
      variants.push({ frameId: bestTablet.frame.id, name: bestTablet.frame.name, width: bestTablet.width, band: bestTablet.band });
      bandAssigned.add(bestTablet.frame.id);
    }

    // Use the mobile frame's base name (suffix-stripped) as the screen identifier.
    const screen = extractBaseName(mobile.frame.name) || mobile.frame.name;
    breakpointSets.push({ screen, variants });
  }

  for (const id of bandAssigned) assigned.add(id);

  // ── Unmatched ─────────────────────────────────────────────────────────────────

  const unmatched: FigmaResponsiveVariant[] = all
    .filter((f) => !assigned.has(f.frame.id))
    .map(({ frame, width, band }) => ({ frameId: frame.id, name: frame.name, width, band }));

  return { breakpointSets, unmatched };
}
