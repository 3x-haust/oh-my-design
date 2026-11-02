import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import type { GeneratedComp } from './studio-comps.ts';

export const STUDIO_DIR = '.omd/studio';
export const STUDIO_CONCEPTS_DIR = `${STUDIO_DIR}/concepts`;
export const STUDIO_CONCEPTS_RECORD = `${STUDIO_DIR}/concepts.json`;
export const STUDIO_CONCEPTS_SCHEMA = 'omd-studio-concepts-v1';
/** A choice needs real alternatives; three is the exploration floor, not a statistic about designers. */
export const STUDIO_MIN_CONCEPTS = 3;
const VIEWPORTS = [{ viewport: 'desktop', width: 1280, height: 900 }, { viewport: 'mobile', width: 390, height: 844 }] as const;

export const STUDIO_CONCEPT_GUIDANCE = 'A new page starts as three comps, not one draft. First capture whole finished sites whose craft this page '
  + 'must show with omd studio refs <url> <url> <url> --json. Then write each concept as an art direction at '
  + `${STUDIO_CONCEPTS_DIR}/<name>/prompt.md: its own composition, protagonist object, material and light, palette and type, so the pages differ in `
  + 'structure, not colour. omd studio concepts --json draws each as a full-page comp from the brief, the copy, the README logo and the references. '
  + 'Look at every comp, then run omd studio pick --json. Without a usable Codex CLI, write a full-page HTML sketch (index.html) per concept instead.';

export type StudioConcept = Readonly<{ name: string; sourceSha256: string;
  captures: readonly Readonly<{ viewport: 'desktop' | 'mobile'; path: string; sha256: string }>[];
  /** A drawn concept's full-page comp; a sketched concept has none. */
  comp?: Readonly<{ path: string; sha256: string }> }>;
export type StudioConceptsRecord = Readonly<{ schema: typeof STUDIO_CONCEPTS_SCHEMA; createdAt: string; concepts: readonly StudioConcept[] }>;

const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Each concept folder holds an HTML sketch (index.html) or an art direction to draw (prompt.md); a sketch wins when both exist. */
export function studioConceptPages(root: string): readonly Readonly<{ name: string; page: string; kind: 'sketch' | 'comp' }>[] {
  const dir = join(root, STUDIO_CONCEPTS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^[a-z0-9][a-z0-9-]{0,40}$/.test(entry.name))
    .flatMap((entry): Readonly<{ name: string; page: string; kind: 'sketch' | 'comp' }>[] => existsSync(join(dir, entry.name, 'index.html'))
      ? [{ name: entry.name, page: `${STUDIO_CONCEPTS_DIR}/${entry.name}/index.html`, kind: 'sketch' as const }]
      : existsSync(join(dir, entry.name, 'prompt.md'))
        ? [{ name: entry.name, page: `${STUDIO_CONCEPTS_DIR}/${entry.name}/prompt.md`, kind: 'comp' as const }] : [])
    .sort((left, right) => left.name.localeCompare(right.name));
}

export type CompDrawer = (concepts: readonly Readonly<{ name: string; prompt: string }>[]) => Promise<readonly GeneratedComp[]>;

export type ConceptRenderer = (page: string, viewport: Readonly<{ width: number; height: number }>, out: string) => Promise<void>;

export async function renderStudioConcepts(root: string, writer: ProjectWriteAdapter, render: ConceptRenderer,
  now: () => Date = () => new Date(), draw?: CompDrawer): Promise<StudioConceptsRecord & Readonly<{ path: string }>> {
  const pages = studioConceptPages(root);
  if (pages.length < STUDIO_MIN_CONCEPTS) {
    throw Object.assign(new Error(`STUDIO_CONCEPTS_MISSING: found ${pages.length} concept sketch${pages.length === 1 ? '' : 'es'}. ${STUDIO_CONCEPT_GUIDANCE}`),
      { code: 'STUDIO_CONCEPTS_MISSING' });
  }
  const sketches = pages.filter(page => page.kind === 'sketch'), drawn = pages.filter(page => page.kind === 'comp');
  const alike = alikeStudioConcepts(root, sketches);
  if (alike.length > 0) {
    throw Object.assign(new Error(`STUDIO_CONCEPTS_ALIKE: ${alike.map(pair => `${pair.left} and ${pair.right} ${pair.reason}`).join('; ')}. `
      + 'A concept edited from another is the same concept. Write each sketch from a blank file: its own layout and stylesheet, its own '
      + 'section order and count, its own relation between the object and the copy, its own navigation.'), { code: 'STUDIO_CONCEPTS_ALIKE' });
  }
  const prompts = drawn.map(({ name, page }) => ({ name, prompt: readFileSync(join(root, page), 'utf8') }));
  const short = prompts.filter(concept => concept.prompt.trim().length < 80);
  if (short.length > 0) {
    throw Object.assign(new Error(`STUDIO_COMP_PROMPT: ${short.map(concept => concept.name).join(', ')} ${short.length === 1 ? 'needs' : 'need'} a real art `
      + 'direction: the composition, the protagonist object, its material and light, the palette and type, what this page does that the others do not.'),
    { code: 'STUDIO_COMP_PROMPT' });
  }
  // Comps are drawn before anything is written, so a failed drawing leaves the previous record as it was.
  const comps = prompts.length === 0 ? [] : await (draw ?? (async concepts =>
    (await import('./studio-comps.ts')).generateStudioComps(root, concepts)))(prompts);
  writer.mkdir(`${STUDIO_DIR}/renders`);
  const concepts: StudioConcept[] = [];
  for (const { name, comp, firstScreen } of comps) {
    const compPath = `${STUDIO_CONCEPTS_DIR}/${name}/comp.png`, capturePath = `${STUDIO_DIR}/renders/${name}-desktop.png`;
    writer.write(compPath, comp);
    writer.write(capturePath, firstScreen);
    concepts.push({ name, sourceSha256: sha256(readFileSync(join(root, STUDIO_CONCEPTS_DIR, name, 'prompt.md'))),
      captures: [{ viewport: 'desktop', path: capturePath, sha256: sha256(firstScreen) }], comp: { path: compPath, sha256: sha256(comp) } });
  }
  for (const { name, page } of sketches) {
    const captures = [];
    for (const { viewport, width, height } of VIEWPORTS) {
      const out = `${STUDIO_DIR}/renders/${name}-${viewport}.png`;
      await render(join(root, page), { width, height }, out);
      captures.push({ viewport, path: out, sha256: sha256(readFileSync(join(root, out))) });
    }
    concepts.push({ name, sourceSha256: sha256(readFileSync(join(root, page))), captures });
  }
  concepts.sort((left, right) => left.name.localeCompare(right.name));
  const record: StudioConceptsRecord = { schema: STUDIO_CONCEPTS_SCHEMA, createdAt: now().toISOString(), concepts };
  writer.write(STUDIO_CONCEPTS_RECORD, `${JSON.stringify(record, null, 2)}\n`);
  return { ...record, path: STUDIO_CONCEPTS_RECORD };
}

// Below these sizes a sketch is too small to compare; a near-empty page says nothing about its composition.
const MIN_COMPARED_RULES = 6;
const MIN_COMPARED_ELEMENTS = 12;
/** Share of style rules two sketches may hold in common; a shared reset is fine, a shared stylesheet is one layout. */
export const STUDIO_CONCEPT_SHARED_RULES = 0.5;

function conceptStyleRules(root: string, page: string, html: string): ReadonlySet<string> {
  const sheets = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1] ?? '');
  for (const match of html.matchAll(/<link\b[^>]*rel=["']?stylesheet[^>]*>/gi)) {
    const href = /href=["']?([^"'\s>]+)/i.exec(match[0])?.[1];
    if (!href || /^[a-z]+:|^\/\//i.test(href)) continue;
    const path = resolve(dirname(join(root, page)), href.split(/[?#]/)[0] ?? '');
    if (!relative(root, path).startsWith('..') && existsSync(path)) sheets.push(readFileSync(path, 'utf8'));
  }
  const inline = [...html.matchAll(/\sstyle=["']([^"']*)["']/gi)].map(match => `[style]{${match[1] ?? ''}`);
  return new Set([...sheets.join('}').replace(/\/\*[\s\S]*?\*\//g, '').split('}'), ...inline]
    .map(rule => rule.replace(/\s+/g, ' ').trim()).filter(rule => rule.length > 0));
}

function conceptSkeleton(html: string): readonly string[] {
  const body = /<body\b[^>]*>([\s\S]*)/i.exec(html)?.[1] ?? html;
  return [...body.replace(/<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1>/gi, '').matchAll(/<([a-z][a-z0-9-]*)/gi)]
    .map(match => (match[1] ?? '').toLowerCase()).filter(tag => !['html', 'head', 'body', 'meta', 'link', 'title', 'base'].includes(tag));
}

/** Pairs of sketches that are one concept: mostly the same stylesheet, or the same markup with new words. */
export function alikeStudioConcepts(root: string, pages: readonly Readonly<{ name: string; page: string }>[]):
  readonly Readonly<{ left: string; right: string; reason: string }>[] {
  const read = pages.map(({ name, page }) => {
    const html = readFileSync(join(root, page), 'utf8');
    return { name, rules: conceptStyleRules(root, page, html), skeleton: conceptSkeleton(html) };
  });
  const alike = [];
  for (let i = 0; i < read.length; i += 1) {
    for (let j = i + 1; j < read.length; j += 1) {
      const left = read[i]!, right = read[j]!;
      if (left.rules.size >= MIN_COMPARED_RULES && right.rules.size >= MIN_COMPARED_RULES) {
        const shared = [...left.rules].filter(rule => right.rules.has(rule)).length;
        const share = shared / (left.rules.size + right.rules.size - shared);
        if (share >= STUDIO_CONCEPT_SHARED_RULES) {
          alike.push({ left: left.name, right: right.name, reason: `share ${Math.round(share * 100)}% of their style rules` });
          continue;
        }
      }
      if (left.skeleton.length >= MIN_COMPARED_ELEMENTS && left.skeleton.join() === right.skeleton.join()) {
        alike.push({ left: left.name, right: right.name, reason: 'have the same markup' });
      }
    }
  }
  return alike;
}

export function readStudioConcepts(root: string): StudioConceptsRecord | null {
  try {
    const value: unknown = JSON.parse(readFileSync(join(root, STUDIO_CONCEPTS_RECORD), 'utf8'));
    if (typeof value !== 'object' || value === null || Reflect.get(value, 'schema') !== STUDIO_CONCEPTS_SCHEMA) return null;
    const concepts = Reflect.get(value, 'concepts');
    return Array.isArray(concepts) ? value as StudioConceptsRecord : null;
  } catch { return null; }
}

/** Rendered concepts whose sketch or prompt, comp and captures are still the files on disk; an edited concept needs rendering again. */
export function currentStudioConcepts(root: string): readonly StudioConcept[] {
  return (readStudioConcepts(root)?.concepts ?? []).filter(concept => {
    try {
      return sha256(readFileSync(join(root, STUDIO_CONCEPTS_DIR, concept.name, concept.comp === undefined ? 'index.html' : 'prompt.md'))) === concept.sourceSha256
        && (concept.comp === undefined || sha256(readFileSync(join(root, concept.comp.path))) === concept.comp.sha256)
        && concept.captures.every(capture => sha256(readFileSync(join(root, capture.path))) === capture.sha256);
    } catch { return false; }
  });
}
