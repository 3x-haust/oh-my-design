import { readdirSync, readFileSync, existsSync, lstatSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { Invariants, Reference } from '../types.ts';
import { type ProjectWriteAdapter, requireProjectWriteAdapter } from '../runtime/project-write.ts';
import { hasAssemblyPayload } from './board-sanitization.ts';
import { referenceMeasuredInvariants } from './measurement-coverage.ts';

/** Backfills invariants written before typography/motion/interaction measurement existed. */
function withInvariantDefaults(invariants: Invariants | null | undefined): Invariants | null {
  if (invariants == null) return null;
  return {
    ...invariants,
    typeScale: invariants.typeScale ?? [],
    fontFamilies: invariants.fontFamilies ?? [],
    weightLadder: invariants.weightLadder ?? [],
    motionDurations: invariants.motionDurations ?? [],
    easingVocab: invariants.easingVocab ?? [],
    animatedShare: invariants.animatedShare ?? 0,
    hoverCoverage: invariants.hoverCoverage ?? 0,
    focusCoverage: invariants.focusCoverage ?? 0,
    // Motion probe fields — absent on references captured before the live probe was added.
    animatedProperties: invariants.animatedProperties ?? [],
    hasReducedMotion: invariants.hasReducedMotion ?? false,
    scrollChoreography: invariants.scrollChoreography ?? [],
  };
}

const refsDir = (cwd: string): string => join(cwd, '.omd', 'refs');

export function researchLane(value: unknown): 'domain' | 'design' {
  if (value !== 'domain' && value !== 'design') throw new Error('REFERENCE_LANE_REQUIRED: use domain or design');
  return value;
}
function lanePrefix(ref: Pick<Reference, 'researchLane'>): string {
  return ref.researchLane === undefined ? '.omd/refs' : `.omd/refs/${researchLane(ref.researchLane)}`;
}

/** Hostname of a URL, or the basename (without extension) of a file path. */
function hostPart(source: string): string {
  try {
    const url = new URL(source);
    if (url.protocol === 'file:') return basename(url.pathname).replace(/\.[^.]+$/, '');
    return url.hostname.replace(/^www\./, '');
  } catch {
    return basename(source).replace(/\.[^.]+$/, '');
  }
}

function slugFor(ref: Pick<Reference, 'source' | 'component'>): string {
  return `${hostPart(ref.source)}.${ref.component}`;
}

export function saveRef(cwd: string, ref: Reference, adapter: ProjectWriteAdapter): string {
  assertReferenceLaneSeparation(cwd, ref);
  return requireProjectWriteAdapter(cwd, adapter)
    .write(`${lanePrefix(ref)}/${slugFor(ref)}.json`, `${JSON.stringify(ref, null, 2)}\n`);
}

export function refRecordPath(cwd: string, ref: Pick<Reference, 'source' | 'component' | 'researchLane'>): string {
  return join(cwd, lanePrefix(ref), `${slugFor(ref)}.json`);
}

/** Path of the scoped component screenshot for a reference (`omd ref add … --shot`). */
export function refImagePath(cwd: string, ref: Pick<Reference, 'source' | 'component' | 'researchLane'>): string {
  assertReferenceLaneSeparation(cwd, ref);
  return join(cwd, lanePrefix(ref), `${slugFor(ref)}.png`);
}

/** Stop the reported same-page relabeling before another PNG is written. Legacy unlabelled records
 * remain readable; publication performs the stricter service-host and redirect checks. */
export function assertReferenceLaneSeparation(cwd: string, ref: Pick<Reference, 'source' | 'researchLane'>): void {
  if (!ref.researchLane) return;
  const page = (source: string): string => {
    try { const url = new URL(source); url.search = ''; url.hash = ''; url.hostname = url.hostname.replace(/^www\./, ''); url.pathname = url.pathname.replace(/\/+$/, '') || '/'; return url.href; }
    catch { return source; }
  };
  if (loadRefs(cwd, { includeDomain: true }).some(item => item.researchLane && item.researchLane !== ref.researchLane && page(item.source) === page(ref.source))) {
    throw new Error('REFERENCE_LANE_SOURCE_OVERLAP: this page already belongs to the other research lane; a renamed crop is not independent research');
  }
}

function isReference(value: unknown): value is Partial<Reference> & Pick<Reference, 'source' | 'component'> {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as Record<string, unknown>)['source'] === 'string'
    && typeof (value as Record<string, unknown>)['component'] === 'string'
  );
}

export function loadRefs(cwd: string, options: { includeDomain?: boolean } = {}): Reference[] {
  const dir = refsDir(cwd);
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const lane of options.includeDomain ? ['design', 'domain'] : ['design']) {
      const directory = join(dir, lane);
      if (existsSync(directory) && lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink()) {
        files.push(...readdirSync(directory).filter(f => f.endsWith('.json')).map(f => `${lane}/${f}`));
      }
    }
  } catch {
    return [];
  }

  const refs: Reference[] = [];
  for (const file of files) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      if (isReference(parsed)) {
        if (!options.includeDomain && parsed.researchLane === 'domain') continue;
        refs.push({
          ...(parsed.researchLane !== undefined ? { researchLane: researchLane(parsed.researchLane) } : {}),
          ...(parsed.acquisition !== undefined ? { acquisition: parsed.acquisition } : {}),
          source: parsed.source,
          component: parsed.component,
          kind: parsed.kind ?? 'page',
          capturedAt: parsed.capturedAt ?? '',
          ...(parsed.selector !== undefined ? { selector: parsed.selector } : {}),
          ...(parsed.slot !== undefined ? { slot: parsed.slot } : {}),
          ...(parsed.captureBatchId !== undefined ? { captureBatchId: parsed.captureBatchId } : {}),
          invariants: referenceMeasuredInvariants({ invariants: withInvariantDefaults(parsed.invariants), ...(parsed.capturePreparation === undefined ? {} : { capturePreparation: parsed.capturePreparation }) }),
          principles: parsed.principles ?? [],
          ...(parsed.slopCount !== undefined ? { slopCount: parsed.slopCount } : {}),
          ...(parsed.origin !== undefined ? { origin: parsed.origin } : {}),
          // energyCurve is absent on references captured before energy measurement was
          // added — omit the key so downstream code can use `?? null` to detect absence.
          ...(parsed.energyCurve !== undefined ? { energyCurve: parsed.energyCurve } : {}),
          // blueprint is absent on references captured before --blueprint was introduced.
          // Omit the key so downstream code can check `ref.blueprint !== undefined`.
          ...(parsed.blueprint !== undefined ? { blueprint: parsed.blueprint } : {}),
          // imagePath is absent on references captured before --shot was introduced.
          ...(parsed.imagePath !== undefined ? { imagePath: parsed.imagePath } : {}),
          // Recorded only when a capture was explicitly skipped or failed; without it, an imageless
          // reference would be indistinguishable from one whose record predates image capture.
          ...(parsed.imageOmittedReason !== undefined ? { imageOmittedReason: parsed.imageOmittedReason } : {}),
          // viewport is absent on references captured before capture width was recorded; a board
          // with no recorded viewport cannot prove it is desktop evidence rather than a phone crop.
          ...(parsed.viewport !== undefined ? { viewport: parsed.viewport } : {}),
          ...(parsed.capturePreparation !== undefined ? { capturePreparation: parsed.capturePreparation } : {}),
        });
      }
    } catch {
      // corrupt file: skip it, don't fail the run
    }
  }

  // A fresh lane capture supersedes its unlabelled legacy identity, without deleting history.
  const unique = new Map(refs.map(ref => [JSON.stringify([ref.researchLane ?? 'design', ref.source, ref.component]), ref]));
  return [...unique.values()].sort((a, b) => a.source.localeCompare(b.source) || a.component.localeCompare(b.component));
}

/**
 * Appends principles to an existing reference. Throws if none exists: a principle without
 * measurements is an opinion, not a record.
 */
export function addPrinciples(
  cwd: string,
  source: string,
  component: string,
  principles: string[],
  adapter: ProjectWriteAdapter,
): void {
  const candidates = loadRefs(cwd, { includeDomain: true }).filter(ref => ref.source === source && ref.component === component);
  if (candidates.length > 1) throw new Error('REFERENCE_ID_AMBIGUOUS: use distinct component names for the two research lanes');
  const path = join(cwd, lanePrefix(candidates[0] ?? {}), `${slugFor({ source, component })}.json`);
  if (!existsSync(path)) {
    throw new Error(`no reference found for ${source} (${component})`);
  }

  for (const principle of principles) {
    if (principle.trim() === '' || hasAssemblyPayload(principle)) {
      throw new Error(
        'REF-PRINCIPLE-UNSAFE: principles must be non-empty sanitized design rules without URLs, '
        + 'filesystem paths, source IDs, or slash-separated labels; write choice pairs with words such as "and"',
      );
    }
  }

  const ref = JSON.parse(readFileSync(path, 'utf8')) as Reference;
  for (const principle of principles) {
    if (!ref.principles.includes(principle)) ref.principles.push(principle);
  }

  requireProjectWriteAdapter(cwd, adapter)
    .write(`${lanePrefix(ref)}/${slugFor({ source, component })}.json`, `${JSON.stringify(ref, null, 2)}\n`);
}
