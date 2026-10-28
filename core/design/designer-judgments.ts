import { readFileSync } from 'node:fs';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';

/**
 * Critique judgments distilled from professional designers reviewing real submitted work. They are
 * written in OMD's own words with no quotations, names or source media, so they ship with the package.
 * The first-render reviewer must answer each selected judgment against the current pixels.
 */
export const DESIGNER_JUDGMENTS_SCHEMA = 'designer-judgments-v1';
export const JUDGMENT_SURFACES = ['marketing', 'product'] as const;
export type JudgmentSurface = (typeof JUDGMENT_SURFACES)[number];
export type DesignerJudgment = Readonly<{
  id: string;
  surfaces: readonly ('any' | JudgmentSurface)[];
  look: string;
  ask: string;
  move: string;
  why: string;
  notWhen: string;
}>;
export type DesignerJudgmentProjection = Readonly<{
  schema: typeof DESIGNER_JUDGMENTS_SCHEMA;
  use: 'diagnostic-questions-not-style-rules';
  sha256: string;
  judgments: readonly DesignerJudgment[];
}>;

const KEYS = ['id', 'surfaces', 'look', 'ask', 'move', 'why', 'notWhen'];
const fail = (reason: string): never => { throw new Error(`DESIGNER_JUDGMENTS: ${reason}`); };
const text = (value: unknown, label: string): string =>
  typeof value === 'string' && value.trim() ? value : fail(`${label} must be non-empty text`);

export function parseDesignerJudgments(value: unknown): readonly DesignerJudgment[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('catalog');
  const catalog = value as Record<string, unknown>;
  if (catalog.schema !== DESIGNER_JUDGMENTS_SCHEMA || !Array.isArray(catalog.judgments)) return fail('catalog');
  const judgments = catalog.judgments.map((row: unknown): DesignerJudgment => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) return fail('judgment');
    const item = row as Record<string, unknown>;
    if (Object.keys(item).sort().join() !== [...KEYS].sort().join()) return fail('judgment fields');
    const id = text(item.id, 'id');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return fail(`${id}: id must be kebab-case`);
    const surfaces = Array.isArray(item.surfaces) && item.surfaces.length > 0
      && item.surfaces.every(surface => surface === 'any' || JUDGMENT_SURFACES.includes(surface))
      ? item.surfaces as DesignerJudgment['surfaces'] : fail(`${id}: surfaces`);
    return { id, surfaces, look: text(item.look, 'look'), ask: text(item.ask, 'ask'),
      move: text(item.move, 'move'), why: text(item.why, 'why'), notWhen: text(item.notWhen, 'notWhen') };
  });
  if (new Set(judgments.map(row => row.id)).size !== judgments.length) return fail('duplicate id');
  return judgments;
}

let catalog: readonly DesignerJudgment[] | undefined;
export function designerJudgments(): readonly DesignerJudgment[] {
  catalog ??= parseDesignerJudgments(JSON.parse(readFileSync(new URL('./designer-judgments.json', import.meta.url), 'utf8')));
  return catalog;
}

export function selectDesignerJudgments(surface: JudgmentSurface | 'unspecified',
  judgments = designerJudgments()): readonly DesignerJudgment[] {
  return judgments.filter(row => surface === 'unspecified' || row.surfaces.includes('any') || row.surfaces.includes(surface));
}

/**
 * The reviewer receives every judgment and answers not-applicable where the situation is absent.
 * Filtering by the route's surface silently dropped landing judgments when a product's landing page
 * was classified as new-product, so the surface only narrows what the maker chooses to read.
 */
export function designerJudgmentProjection(): DesignerJudgmentProjection {
  const body: Omit<DesignerJudgmentProjection, 'sha256'> = {
    schema: DESIGNER_JUDGMENTS_SCHEMA, use: 'diagnostic-questions-not-style-rules', judgments: designerJudgments(),
  };
  return { ...body, sha256: sha256(canonicalJson(body)) };
}

export function designerJudgmentsMarkdown(surface: JudgmentSurface | 'unspecified' = 'unspecified'): string {
  const rows = selectDesignerJudgments(surface);
  return [
    `# Designer judgments (${surface === 'unspecified' ? 'all surfaces' : surface})`,
    '',
    'Questions professional designers ask of a rendered screen. Each one applies only when its situation is visible;',
    '"Not when" names the cases where the opposite move is right. They diagnose a content relationship — they are',
    'not style rules, quotas or a checklist to decorate against. The first-render reviewer answers every one.',
    '',
    ...rows.flatMap(row => [
      `## ${row.id}`,
      '',
      `- Look: ${row.look}`,
      `- Ask: ${row.ask}`,
      `- Move: ${row.move}`,
      `- Why: ${row.why}`,
      `- Not when: ${row.notWhen}`,
      '',
    ]),
  ].join('\n');
}
