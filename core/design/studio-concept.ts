import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STUDIO_DIR } from './studio-paths.ts';

/**
 * A marketing page is carried by one visual idea of its own, decided before any reference or layout. The pages made without one
 * came out as well-set documents: the OMD landing built on Tailwind's skeleton had type and terminal windows and nothing only
 * OMD could have made, while the sites it was measured against each rest on one authored object (wonand's glass ampersand locked
 * into its wordmark, leviosa's cast acting out each feature). The idea is reached by divergence, so the record holds the rough
 * ideas that were dropped as well as the one kept, and they must differ in what the object is.
 */
export const STUDIO_CONCEPT_RECORD = `${STUDIO_DIR}/concept.json`;
/** Rough ideas considered, the kept one included: fewer than this is a first thought, not a choice. */
export const STUDIO_ROUGH_IDEAS = 6;
export const CONCEPT_SOURCES = ['name', 'mark', 'mechanism', 'material'] as const;
export type ConceptSource = (typeof CONCEPT_SOURCES)[number];

export type StudioConcept = Readonly<{
  /** The visual idea in one sentence. */
  idea: string;
  /** What the key visual IS: the object a visitor would describe. */
  object: string;
  /** Where the idea comes from in the project's own material. */
  from: ConceptSource;
  /** The one claim about the product the object argues. */
  claim: string;
  /** How the object returns down the page (at least two places beyond the first screen). */
  devices: readonly string[];
  /** The rough ideas that were dropped, each a different object, with why. */
  dropped: readonly Readonly<{ object: string; because: string }>[];
}>;

export const STUDIO_IDEA_GUIDANCE = `Before any reference or layout, decide the page's one visual idea and write ${STUDIO_CONCEPT_RECORD}. Read the `
  + 'project first (its name, its mark, what it actually does, what its output looks like) and sketch many rough ideas in words or quick renders '
  + `(omd imagegen is ideation only): at least ${STUDIO_ROUGH_IDEAS}, each a different OBJECT, not the same object from another angle or in another `
  + 'colour. An idea comes from the name (a letter or word made into a thing), the mark (its shape built as an object and put to work), the mechanism '
  + '(the thing the product does, acted out by objects) or the material (the product\'s own output used as the picture). Keep the one that still reads '
  + 'with the logo removed and that argues one claim about the product without words. Record {"idea": "<one sentence>", "object": "<what the key '
  + 'visual is>", "from": "name|mark|mechanism|material", "claim": "<what it argues>", "devices": ["<where the object returns down the page>", '
  + '"<a second place>"], "dropped": [{"object": "<another object>", "because": "<why it lost>"}, ...]}. The references that follow are chosen to '
  + 'make this idea well, not to supply one.';

const key = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** The concept a marketing page committed to, or the reason it cannot be used; null when none is written yet. */
export function readStudioConcept(root: string): StudioConcept | null {
  const path = join(root, STUDIO_CONCEPT_RECORD);
  if (!existsSync(path)) return null;
  const invalid = (reason: string): never => {
    throw Object.assign(new Error(`STUDIO_IDEA_INVALID: ${STUDIO_CONCEPT_RECORD} ${reason}. ${STUDIO_IDEA_GUIDANCE}`), { code: 'STUDIO_IDEA_INVALID' });
  };
  let value: unknown;
  try { value = JSON.parse(readFileSync(path, 'utf8')); } catch { return invalid('is not JSON'); }
  if (typeof value !== 'object' || value === null) return invalid('is not an object');
  const text = (name: string, least: number): string => {
    const field: unknown = Reflect.get(value as object, name);
    return typeof field === 'string' && field.trim().length >= least ? field.trim() : invalid(`needs "${name}" (at least ${least} characters)`);
  };
  const idea = text('idea', 24), object = text('object', 4), claim = text('claim', 16);
  const from: unknown = Reflect.get(value, 'from');
  if (typeof from !== 'string' || !CONCEPT_SOURCES.includes(from as ConceptSource)) return invalid(`needs "from": one of ${CONCEPT_SOURCES.join(', ')}`);
  const devices: unknown = Reflect.get(value, 'devices');
  if (!Array.isArray(devices) || devices.filter(item => typeof item === 'string' && item.trim().length >= 8).length < 2) {
    return invalid('needs "devices": at least two places the object returns down the page');
  }
  const dropped: unknown = Reflect.get(value, 'dropped');
  if (!Array.isArray(dropped)) return invalid('needs "dropped": the rough ideas that lost');
  const ideas = dropped.map(item => {
    const other: unknown = typeof item === 'object' && item !== null ? Reflect.get(item, 'object') : undefined;
    const because: unknown = typeof item === 'object' && item !== null ? Reflect.get(item, 'because') : undefined;
    if (typeof other !== 'string' || other.trim().length < 4 || typeof because !== 'string' || because.trim().length < 12) {
      return invalid('needs every dropped idea as {"object", "because"}');
    }
    return { object: other.trim(), because: because.trim() };
  });
  const objects = new Set([key(object), ...ideas.map(item => key(item.object))]);
  if (objects.size < STUDIO_ROUGH_IDEAS) {
    return invalid(`holds ${objects.size} different objects; a choice is made among at least ${STUDIO_ROUGH_IDEAS} (the kept one and ${STUDIO_ROUGH_IDEAS - 1} dropped), `
      + 'each a different object rather than another view of the same one');
  }
  return { idea, object, from: from as ConceptSource, claim, devices: devices.filter((item): item is string => typeof item === 'string').map(item => item.trim()), dropped: ideas };
}
