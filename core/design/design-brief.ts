import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';

/**
 * The designer's brief for a new surface, written after reading the request and the material and before
 * references or source: who visits, what they ask, the one thing the page must leave them with, a section per
 * question, what is deliberately left out, and the idea taken from the product's own material. Without it a
 * page explains everything at equal weight and borrows its look from the nearest reference.
 */
export const DESIGN_BRIEF_SCHEMA = 'design-brief-v1';
export const DESIGN_BRIEF_PATH = '.omd/brief.json';

export type DesignBrief = Readonly<{
  schema: typeof DESIGN_BRIEF_SCHEMA;
  audience: string;
  personas: readonly Readonly<{ name: string; context: string; job: string; mustBelieveIn5s: string; dealBreaker: string }>[];
  visitorQuestions: readonly string[];
  message: string;
  sections: readonly Readonly<{ name: string; question: string; says: string; shows: string }>[];
  cut: readonly Readonly<{ what: string; why: string }>[];
  concept: Readonly<{ source: string; idea: string; typeAndGraphic: string }>;
  directions: Readonly<{ options: readonly string[]; chosen: string; why: string }>;
  onlyThisProduct: string;
  heroProof: Readonly<{ mode: typeof HERO_PROOF_MODES[number]; shows: string; because: string }>;
  decisions: Readonly<Record<typeof DECISION_KEYS[number], Readonly<{ choice: string; because: string }>>>;
  motion: string;
  voice: string;
}>;

/** Each visual decision names what in the brand or content it comes from; "modern" chooses nothing. */
export const DECISION_KEYS = ['ground', 'accent', 'type', 'layout'] as const;
// Each word is followed only by separators, so no two parts of the pattern compete for the same characters.
const VAGUE = /^[\s,.·/&+-]*(?:(?:모던|깔끔|세련|미니멀|심플|트렌디|감각적|고급|프리미엄|clean|modern|minimalist|minimal|sleek|simple|elegant|premium|professional|bold|fresh|and|하고|하게|한|와|과|및)[\s,.·/&+-]*)+$/i;

/**
 * What the hero puts in front of the visitor as proof: the product's own interface working on a realistic input
 * with its consequence visible, the real thing it produces, or a built graphic acting out the claim when there is
 * nothing to operate or show. Only a mechanism the product really has may be shown working.
 */
export const HERO_PROOF_MODES = ['working-product', 'real-output', 'concept-graphic'] as const;
const PERSONA_KEYS = ['name', 'context', 'job', 'mustBelieveIn5s', 'dealBreaker'] as const;

export const DESIGN_BRIEF_KEYS = ['schema', 'audience', 'personas', 'visitorQuestions', 'message', 'sections', 'cut', 'concept', 'directions', 'onlyThisProduct', 'heroProof', 'decisions', 'motion', 'voice'] as const;

export const DESIGN_BRIEF_SKELETON = {
  schema: DESIGN_BRIEF_SCHEMA,
  audience: '<who arrives on this page and what they already know>',
  personas: [{ name: '<a named visitor and role>', context: '<where, on which device, how often>', job: '<what they came to get done>',
    mustBelieveIn5s: '<what they must believe within five seconds of the hero>', dealBreaker: '<what makes them leave>' }],
  visitorQuestions: ['<what is it?>', '<what do I get?>', '<why believe it?>', '<how do I start?>'],
  message: '<the one sentence the page must leave the visitor with>',
  sections: [{ name: '<short section name, e.g. hero>', question: '<one of visitorQuestions>', says: '<its one point, in the page\'s words>', shows: '<the graphic, product moment or proof that carries it>' }],
  cut: [{ what: '<material you leave off the page>', why: '<why the visitor does not need it>' }],
  concept: { source: '<the product\'s own material: its name, mark, artifact or output>', idea: '<the signature move built from it>', typeAndGraphic: '<how type and graphic interlock>' },
  directions: { options: ['<direction 1: a whole page idea>', '<direction 2, far from 1>', '<direction 3, far from both>'], chosen: '<one of options, verbatim>', why: '<why it is the strongest, not the safest>' },
  onlyThisProduct: '<what on this page only this product could say or show; put the nearest competitor\'s name on it and it must stop working>',
  heroProof: { mode: `<one of ${HERO_PROOF_MODES.join(' | ')}>`, shows: '<the input and its visible consequence, the real output, or the graphic\'s action>',
    because: '<why this proof answers the primary persona\'s five-second belief>' },
  decisions: {
    ground: { choice: '<page ground colour>', because: '<what in the brand or content it comes from>' },
    accent: { choice: '<accent colour>', because: '<what in the brand or content it comes from>' },
    type: { choice: '<families and the display role>', because: '<what in the brand or content it comes from>' },
    layout: { choice: '<page shape and hero posture>', because: '<why this content wants this shape>' },
  },
  motion: '<what moves, when, and which idea it acts out>',
  voice: '<tone and speech level>',
};

const fail = (reason: string): never => {
  const error = new Error(`DESIGN_BRIEF_INVALID: ${reason}`);
  Object.defineProperty(error, 'code', { value: 'DESIGN_BRIEF_INVALID', enumerable: true });
  throw error;
};

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) return fail(`${field} must be filled in`);
  if (/^<.*>$/.test(value.trim())) return fail(`${field} still holds the skeleton placeholder`);
  return value.trim();
}

function record(value: unknown, field: string, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail(`${field} must be an object`);
  const extra = Object.keys(value).filter(key => !keys.includes(key));
  if (extra.length) return fail(`${field} has unknown keys: ${extra.join(', ')}`);
  return value as Record<string, unknown>;
}

function list<T>(value: unknown, field: string, item: (entry: unknown, index: number) => T): T[] {
  if (!Array.isArray(value) || value.length === 0) return fail(`${field} must list at least one entry`);
  return value.map(item);
}

export function parseDesignBrief(value: unknown): DesignBrief {
  const input = record(value, 'brief', DESIGN_BRIEF_KEYS);
  if (input.schema !== DESIGN_BRIEF_SCHEMA) return fail(`schema must be ${DESIGN_BRIEF_SCHEMA}`);
  const visitorQuestions = list(input.visitorQuestions, 'visitorQuestions', (entry, index) => text(entry, `visitorQuestions[${index}]`));
  const sections = list(input.sections, 'sections', (entry, index) => {
    const row = record(entry, `sections[${index}]`, ['name', 'question', 'says', 'shows']);
    const question = text(row.question, `sections[${index}].question`);
    const name = text(row.name, `sections[${index}].name`);
    // A section that answers no visitor question is the maker's explanation, not the visitor's need.
    if (!visitorQuestions.includes(question)) return fail(`sections[${index}].question must repeat one of visitorQuestions exactly`);
    return { name, question, says: text(row.says, `sections[${index}].says`), shows: text(row.shows, `sections[${index}].shows`) };
  });
  if (new Set(sections.map(section => section.name.toLowerCase())).size !== sections.length) return fail('sections[].name must be distinct');
  // A few named visitors with a job and a reason to leave, not a demographic: more than three is a survey.
  const personas = list(input.personas, 'personas', (entry, index) => {
    const row = record(entry, `personas[${index}]`, PERSONA_KEYS);
    return Object.fromEntries(PERSONA_KEYS.map(key => [key, text(row[key], `personas[${index}].${key}`)])) as DesignBrief['personas'][number];
  });
  if (personas.length > 3) return fail('personas holds one to three visitors; keep the ones whose job the page must serve');
  const heroProofInput = record(input.heroProof, 'heroProof', ['mode', 'shows', 'because']);
  const mode = HERO_PROOF_MODES.find(mode => mode === heroProofInput.mode);
  if (mode === undefined) return fail(`heroProof.mode must be one of ${HERO_PROOF_MODES.join(', ')}`);
  const concept = record(input.concept, 'concept', ['source', 'idea', 'typeAndGraphic']);
  // Go wide, then choose: directions far apart, and the strongest chosen rather than the safest.
  const directionsInput = record(input.directions, 'directions', ['options', 'chosen', 'why']);
  const options = list(directionsInput.options, 'directions.options', (entry, index) => text(entry, `directions.options[${index}]`));
  if (options.length < 3 || new Set(options.map(option => option.toLowerCase())).size !== options.length) {
    return fail('directions.options must hold three or more distinct whole-page directions, far apart from each other');
  }
  const chosen = text(directionsInput.chosen, 'directions.chosen');
  if (!options.includes(chosen)) return fail('directions.chosen must repeat one of directions.options exactly');
  const decisionsInput = record(input.decisions, 'decisions', DECISION_KEYS);
  const decisions = Object.fromEntries(DECISION_KEYS.map(key => {
    const row = record(decisionsInput[key], `decisions.${key}`, ['choice', 'because']);
    const because = text(row.because, `decisions.${key}.because`);
    if (VAGUE.test(because)) return fail(`decisions.${key}.because "${because}" chooses nothing; name what in the brand or content this comes from`);
    return [key, { choice: text(row.choice, `decisions.${key}.choice`), because }];
  })) as DesignBrief['decisions'];
  return {
    schema: DESIGN_BRIEF_SCHEMA,
    audience: text(input.audience, 'audience'),
    personas,
    visitorQuestions,
    message: text(input.message, 'message'),
    sections,
    cut: list(input.cut, 'cut', (entry, index) => {
      const row = record(entry, `cut[${index}]`, ['what', 'why']);
      return { what: text(row.what, `cut[${index}].what`), why: text(row.why, `cut[${index}].why`) };
    }),
    concept: { source: text(concept.source, 'concept.source'), idea: text(concept.idea, 'concept.idea'),
      typeAndGraphic: text(concept.typeAndGraphic, 'concept.typeAndGraphic') },
    directions: { options, chosen, why: text(directionsInput.why, 'directions.why') },
    onlyThisProduct: text(input.onlyThisProduct, 'onlyThisProduct'),
    heroProof: { mode, shows: text(heroProofInput.shows, 'heroProof.shows'), because: text(heroProofInput.because, 'heroProof.because') },
    decisions,
    motion: text(input.motion, 'motion'),
    voice: text(input.voice, 'voice'),
  };
}

export function publishDesignBrief(value: unknown, writer: ProjectWriteAdapter, root?: string): DesignBrief {
  const brief = parseDesignBrief(value);
  // A section leaves the page on its own merits, written down in cut, never because it was hard to find references for.
  const previous = root === undefined ? null : readDesignBrief(root);
  const dropped = (previous?.sections ?? []).map(section => section.name)
    .filter(name => !brief.sections.some(section => section.name.toLowerCase() === name.toLowerCase())
      && !brief.cut.some(item => item.what.toLowerCase().includes(name.toLowerCase())));
  if (dropped.length) {
    return fail(`sections ${dropped.map(name => `"${name}"`).join(', ')} left the brief without a cut entry. A section is cut only when the `
      + 'visitor does not need it: name it in cut with why. A section still lacking references needs references, not removal.');
  }
  writer.mkdir('.omd');
  writer.write(DESIGN_BRIEF_PATH, `${JSON.stringify(brief, null, 2)}\n`);
  return brief;
}

export function readDesignBrief(root: string): DesignBrief | null {
  const path = join(root, DESIGN_BRIEF_PATH);
  if (!existsSync(path)) return null;
  try { return parseDesignBrief(JSON.parse(readFileSync(path, 'utf8'))); } catch { return null; }
}

export const DESIGN_BRIEF_GUIDANCE = 'Before references and source, write the design brief: omd schema design-brief, fill it from the request and '
  + 'the material, then omd brief --input .omd/.cache/design-brief.json. Name who visits — one to three personas with their context, job, '
  + 'what they must believe within five seconds and what makes them leave — and the questions they arrive with, the one '
  + 'message, one section per question (what it says and what shows it), what you leave out and why (the product\'s internals, '
  + 'caveats, everything the visitor does not need), and a concept built from the product\'s own material (omd pack theory/web-copy.md, '
  + '"Start with the reader\'s decision", for the questions and the message). Go wide, then choose: three whole-page directions far '
  + 'apart, keeping the strongest rather than the safest; what only this product can say (the nearest competitor\'s name on the page '
  + 'must break it); what the hero shows as proof — the product working on a realistic input with its consequence and a state '
  + 'beyond the happy path, its real output, or a built graphic when there is nothing to operate (only a mechanism the product '
  + 'really has may be shown working; invented stats are not proof); and for the ground, accent, type and layout, what in the brand or content each comes from — "clean and modern" '
  + 'is not a reason, and a palette nobody can explain is the model\'s average. Then look for references section by section, in the '
  + 'brief\'s words: designers open dozens and keep ten to twenty across finished sites and UI/graphic galleries, and each section\'s '
  + 'references are cited in omd ref context with component set to that section\'s name.';
