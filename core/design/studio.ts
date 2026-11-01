import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { readPersistedRoute } from '../route/index.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { newSurface } from './new-surface-advisories.ts';

type Route = ReturnType<typeof readPersistedRoute>;

export const STUDIO_DIR = '.omd/studio';
export const STUDIO_CONCEPTS_DIR = `${STUDIO_DIR}/concepts`;
export const STUDIO_CONCEPTS_RECORD = `${STUDIO_DIR}/concepts.json`;
export const STUDIO_CONCEPTS_SCHEMA = 'omd-studio-concepts-v1';
/** A choice needs real alternatives; three is the exploration floor, not a statistic about designers. */
export const STUDIO_MIN_CONCEPTS = 3;
const VIEWPORTS = [{ viewport: 'desktop', width: 1280, height: 900 }, { viewport: 'mobile', width: 390, height: 844 }] as const;

export const STUDIO_CONCEPT_GUIDANCE = 'A new page starts as three concepts, not one draft. Write each as a quick full-page HTML sketch at '
  + `${STUDIO_CONCEPTS_DIR}/<name>/index.html with the real copy: a different navigation noun (what the visitor moves through), a different `
  + 'protagonist object and a different verb, so the section order differs, not the colours. If two sketches survive swapping their sections, they '
  + 'are one concept. Then run omd studio concepts --json and look at every render before choosing.';

export type StudioConcept = Readonly<{ name: string; sourceSha256: string;
  captures: readonly Readonly<{ viewport: 'desktop' | 'mobile'; path: string; sha256: string }>[] }>;
export type StudioConceptsRecord = Readonly<{ schema: typeof STUDIO_CONCEPTS_SCHEMA; createdAt: string; concepts: readonly StudioConcept[] }>;

const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export function studioConceptPages(root: string): readonly Readonly<{ name: string; page: string }>[] {
  const dir = join(root, STUDIO_CONCEPTS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^[a-z0-9][a-z0-9-]{0,40}$/.test(entry.name) && existsSync(join(dir, entry.name, 'index.html')))
    .map(entry => ({ name: entry.name, page: `${STUDIO_CONCEPTS_DIR}/${entry.name}/index.html` }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export type ConceptRenderer = (page: string, viewport: Readonly<{ width: number; height: number }>, out: string) => Promise<void>;

export async function renderStudioConcepts(root: string, writer: ProjectWriteAdapter, render: ConceptRenderer,
  now: () => Date = () => new Date()): Promise<StudioConceptsRecord & Readonly<{ path: string }>> {
  const pages = studioConceptPages(root);
  if (pages.length < STUDIO_MIN_CONCEPTS) {
    throw Object.assign(new Error(`STUDIO_CONCEPTS_MISSING: found ${pages.length} concept sketch${pages.length === 1 ? '' : 'es'}. ${STUDIO_CONCEPT_GUIDANCE}`),
      { code: 'STUDIO_CONCEPTS_MISSING' });
  }
  writer.mkdir(`${STUDIO_DIR}/renders`);
  const concepts: StudioConcept[] = [];
  for (const { name, page } of pages) {
    const captures = [];
    for (const { viewport, width, height } of VIEWPORTS) {
      const out = `${STUDIO_DIR}/renders/${name}-${viewport}.png`;
      await render(join(root, page), { width, height }, out);
      captures.push({ viewport, path: out, sha256: sha256(readFileSync(join(root, out))) });
    }
    concepts.push({ name, sourceSha256: sha256(readFileSync(join(root, page))), captures });
  }
  const record: StudioConceptsRecord = { schema: STUDIO_CONCEPTS_SCHEMA, createdAt: now().toISOString(), concepts };
  writer.write(STUDIO_CONCEPTS_RECORD, `${JSON.stringify(record, null, 2)}\n`);
  return { ...record, path: STUDIO_CONCEPTS_RECORD };
}

export function readStudioConcepts(root: string): StudioConceptsRecord | null {
  try {
    const value: unknown = JSON.parse(readFileSync(join(root, STUDIO_CONCEPTS_RECORD), 'utf8'));
    if (typeof value !== 'object' || value === null || Reflect.get(value, 'schema') !== STUDIO_CONCEPTS_SCHEMA) return null;
    const concepts = Reflect.get(value, 'concepts');
    return Array.isArray(concepts) ? value as StudioConceptsRecord : null;
  } catch { return null; }
}

/** Rendered concepts whose sketch and captures are still the files on disk; an edited sketch needs rendering again. */
export function currentStudioConcepts(root: string): readonly StudioConcept[] {
  return (readStudioConcepts(root)?.concepts ?? []).filter(concept => {
    try {
      return sha256(readFileSync(join(root, STUDIO_CONCEPTS_DIR, concept.name, 'index.html'))) === concept.sourceSha256
        && concept.captures.every(capture => sha256(readFileSync(join(root, capture.path))) === capture.sha256);
    } catch { return false; }
  });
}

export const studioConceptsPending = (root: string, route: Route): boolean =>
  newSurface(route) && currentStudioConcepts(root).length < STUDIO_MIN_CONCEPTS;

/** Refusal boundary at the first render: a new surface is built from a concept chosen among rendered alternatives. */
export function requireStudioConcepts(root: string, route: Route): void {
  if (!studioConceptsPending(root, route)) return;
  throw Object.assign(new Error(`STUDIO_CONCEPTS_MISSING: render three concept sketches before the page. ${STUDIO_CONCEPT_GUIDANCE}`),
    { code: 'STUDIO_CONCEPTS_MISSING' });
}
