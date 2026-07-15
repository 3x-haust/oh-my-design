/**
 * Shadow-only, advisory-only. Never gates: findings from this module carry no
 * exit-code weight and are not wired into the CLI or `validateCompositionContract`.
 * Scope note (doc == code): a per-section carrier-presence heuristic. It checks,
 * section by section, whether a content section names a purposeful visual carrier,
 * and references the `## Focal hierarchy` visual-mass budget only as framing in the
 * advisory message. It does NOT yet compute a cross-section visual-mass budget, so
 * it cannot exempt a deliberately quiet supporting section that spends its mass
 * elsewhere; real cross-section budget subordination is a follow-up required before
 * this advisory is promoted toward gating.
 */

export type VisualRichnessRegister = 'quiet' | 'confident' | 'showpiece';

export interface VisualRichnessFinding {
  id: 'CARRIER-ADVISORY';
  section: string;
  message: string;
  severity: 'advisory';
}

export interface VisualRichnessInputs {
  contract: string;
  register?: VisualRichnessRegister;
}

/** Copied parsing convention from `core/composition-contract/index.ts` (`## ` H2 sections). */
function sections(markdown: string): Map<string, string> {
  const result = new Map<string, string>();
  const matches = [...markdown.matchAll(/^##\s+(.+?)\s*$/gm)];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const start = match.index! + match[0].length;
    const end = matches[i + 1]?.index ?? markdown.length;
    result.set(match[1]!.trim(), markdown.slice(start, end).trim());
  }
  return result;
}

/**
 * Sections whose subject matter is where a purposeful visual carrier would be
 * declared. `Input fingerprint`, `Experience spine`, `Section dependency`,
 * `Candidate axes`, and `Transfer boundary` are structural/process sections
 * with no visual-carrier claim to make, so they are out of scope here.
 */
const CONTENT_SECTIONS = [
  'Grid and alignment',
  'Density and visual mass',
  'Focal hierarchy',
  'Domain form grammar',
  'Media roles',
  'Responsive recomposition',
] as const;

/** Broad carrier vocabulary: any purposeful non-decorative visual/alternate carrier. */
const BROAD_CARRIER = /typographic|concept-bearing|\bpattern\b|\bgradient\b|\bphoto|\bgraphic|illustration|\bchart|\bdiagram|\bicon|imagery|\bmedia\b|animation|\bmotion\b|data\s*visuali[sz]ation|infographic/i;

/**
 * Stricter carrier vocabulary used for `showpiece`: excludes the bare word
 * "media" (which trivially appears in the fixed `## Media roles` heading and
 * its boilerplate prompt) and requires a specific, named carrier.
 */
const STRICT_CARRIER = /typographic|concept-bearing|\bpattern\b|\bgradient\b|\bphoto|\bgraphic|illustration|\bchart|\bdiagram|\bicon|imagery|animation|\bmotion\b|data\s*visuali[sz]ation|infographic/i;

function inferRegister(parsed: Map<string, string>): VisualRichnessRegister {
  const text = `${parsed.get('Density and visual mass') ?? ''} ${parsed.get('Focal hierarchy') ?? ''}`;
  if (/\bshowpiece\b/i.test(text)) return 'showpiece';
  if (/\bquiet\b/i.test(text)) return 'quiet';
  return 'confident';
}

/**
 * Pure, advisory-only evaluation: for each content section present in the
 * contract, check whether it declares a purposeful visual carrier (a
 * typographic block, a concept-bearing line, a pattern/gradient, real media,
 * or an explicit alternate carrier). `quiet` registers are deliberately
 * carrier-light by design and are not advised against; `showpiece` requires a
 * specifically named carrier rather than the generic word "media".
 */
export function evaluateVisualRichness(inputs: VisualRichnessInputs): VisualRichnessFinding[] {
  const parsed = sections(inputs.contract);
  const register = inputs.register ?? inferRegister(parsed);

  if (register === 'quiet') return [];

  const carrierPattern = register === 'showpiece' ? STRICT_CARRIER : BROAD_CARRIER;
  const findings: VisualRichnessFinding[] = [];
  for (const section of CONTENT_SECTIONS) {
    const body = parsed.get(section);
    if (!body) continue;
    if (!carrierPattern.test(body)) {
      findings.push({
        id: 'CARRIER-ADVISORY',
        section,
        message: `within the visual-mass budget set by Focal hierarchy, "${section}" does not yet name a purposeful visual carrier (typographic block, concept-bearing line, pattern/gradient, media, or an explicit alternate carrier)`,
        severity: 'advisory',
      });
    }
  }
  return findings;
}
