import { canonicalJson } from '../ref/canonical-json.ts';
import { PiReviewerError, piDigest, piHash, piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';

export const TASTE_COMPARISON_REVIEW_TRANSPORT = 'taste-comparison-reviewer-transport-v1';
export const TASTE_COMPARISON_REVIEW_HANDBACK = 'taste-comparison-reviewer-handback-v1';
// The reviewer sees two pages and nothing else: no label, key or text may say which one is the build under test.
export const TASTE_COMPARISON_REVIEW_TASK = [
  'Two first-screen captures of web pages, labelled A and B, are shown at the same viewport.',
  'Exactly one was designed by a human designer; the other was produced by an AI coding agent or an AI site builder.',
  'Decide which one the human designer made.',
  'Ignore subject matter, language, company, product and content claims.',
  'Judge only the design: composition, typography, imagery and graphics, colour and light, copy rhythm,',
  'and whether the choices look specific and intentional or assembled from defaults.',
  // Calibrated on blind pairs (2026-10): with this paragraph, human-made pages stay near chance while
  // annotation-kit pages that the uncalibrated judge accepted as human are identified.
  'Human work reads as one system: a key visual that comes from the brand or the product itself (its name, mark, real interface, photography)',
  'and is treated with light; gradients behave like light, not like fills; type, image and controls interlock under one rule;',
  'proportions and crops are precise; restraint leaves contrast to what matters.',
  'AI work is excessive and assembled from defaults: so many elements and accents that there is no clear point and the screen tires the eye,',
  'template hero formulas, stacks of tilted cards or screens, connector-line workflow diagrams,',
  'component-kit boxes with the same pale border, radius and soft shadow everywhere, equal emphasis, and "friendly" decoration kits',
  '(highlighter swipes on headline words, hand-drawn arrows and circles, sticky-note callouts, pastel section blocks, cute avatar pills,',
  'speech bubbles, example badges), and captions or disclaimers stamped under graphics ("reconstructed", "example screen", "concept diagram").',
  'A page full of such annotations is AI-made even when it looks lively.',
  'List the AI tells you see in the capture you judge AI-made and the human signals you see in the capture you judge human-made;',
  'each item names where on the screen it appears.',
  'Return exactly the closed output contract.',
].join(' ');

// The same blind pairing for one graphic against a kept human-made graphic, both fitted to one neutral canvas.
export const TASTE_GRAPHIC_REVIEW_TASK = [
  'Two graphics, labelled A and B, are shown fitted to the same canvas on the same neutral ground.',
  'Exactly one was made by a human designer (feature art, a product illustration or a key visual from shipped work or a portfolio);',
  'the other was produced by an AI coding agent. Decide which one the human designer made.',
  'Ignore subject matter, language, brand and content claims. Judge only the craft: what the protagonist is and how it leads,',
  'light and material, depth and layering, crop and scale contrast, colour, any type set inside the graphic,',
  'and whether the choices look specific and intentional or assembled from defaults.',
  'Human graphics have one protagonist at a size where it reads, light that models form (gradients act as light, a glow has a source),',
  'crops that let the subject break the frame, real material handled with care, and restraint around it.',
  'AI graphics shrink whole pages or screens into frames until their text cannot be read, stack tilted cards or windows',
  'with the same pale border and soft shadow, use flat fills with no light, give every element the same size,',
  'connect boxes with arrows, and put labels, badges, captions or disclaimers inside the art instead of showing one idea.',
  'List the AI tells you see in the graphic you judge AI-made and the human signals you see in the one you judge human-made;',
  'each item names where in the graphic it appears.',
  'Return exactly the closed output contract.',
].join(' ');
export type TasteSubject = 'page' | 'graphic';
export const tasteReviewTask = (subject: TasteSubject): string => subject === 'graphic' ? TASTE_GRAPHIC_REVIEW_TASK : TASTE_COMPARISON_REVIEW_TASK;

export const TASTE_LABELS = Object.freeze(['A', 'B'] as const);
export type TasteLabel = typeof TASTE_LABELS[number];
export const TASTE_VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ width: 1280, height: 900 }),
  mobile: Object.freeze({ width: 390, height: 844 }),
});
export type TasteViewport = keyof typeof TASTE_VIEWPORTS;
const MAX_ITEMS = 6;
const MAX_ITEM_CHARS = 600;

export type TasteComparisonReviewBindings = Readonly<{
  buildSha256: string;
  briefSha256: string;
  evidenceSha256: string;
  browserSha256: string;
  trialSha256: string;
}>;
export const TASTE_COMPARISON_BINDING_KEYS = Object.freeze(['briefSha256', 'browserSha256', 'buildSha256', 'evidenceSha256', 'trialSha256']);

export type TasteComparisonRender = Readonly<{ label: TasteLabel; width: number; height: number; captureSha256: string; pngBase64: string }>;

export type TasteComparisonReview = Readonly<{
  human: TasteLabel;
  confidence: number;
  aiTells: readonly string[];
  humanSignals: readonly string[];
}>;

export class TasteComparisonReviewError extends Error {
  override readonly name = 'TasteComparisonReviewError';
  constructor(reason: string) { super(`TASTE_COMPARISON_REVIEW_INVALID: ${reason}`); }
}
const fail = (reason: string): never => { throw new TasteComparisonReviewError(reason); };
const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');

export const tasteRenderBinding = (renders: readonly TasteComparisonRender[]): string =>
  piHash(canonicalJson(renders.map(({ pngBase64: _bytes, ...row }) => row)));

/** Graphic trials say only that they are graphics; page trials carry nothing but the two captures. */
export function tasteEvidenceSubject(evidence: Record<string, unknown>): TasteSubject {
  if (exact(evidence, ['renders'])) return 'page';
  if (exact(evidence, ['renders', 'subject']) && evidence.subject === 'graphic') return 'graphic';
  throw new PiReviewerError('taste-comparison-evidence');
}

/** Refuses any evidence other than two same-size neutral A/B captures whose bytes match their digests. */
export function assertNeutralTasteComparisonEvidence(evidence: Record<string, unknown>, fixed: Record<string, unknown>): void {
  const rows = evidence.renders;
  tasteEvidenceSubject(evidence);
  if (!exact(fixed, TASTE_COMPARISON_BINDING_KEYS)
    || !Array.isArray(rows) || rows.length !== 2) throw new PiReviewerError('taste-comparison-evidence');
  const renders = rows.map((raw, index): TasteComparisonRender => {
    const row = piRecord(raw, 'taste-comparison-render');
    const png = piText(row.pngBase64, 'taste-comparison-png');
    if (!exact(row, ['label', 'width', 'height', 'captureSha256', 'pngBase64']) || row.label !== TASTE_LABELS[index]
      || piHash(Buffer.from(png, 'base64')) !== piDigest(row.captureSha256, 'taste-comparison-capture')
      || !Object.values(TASTE_VIEWPORTS).some(size => size.width === row.width && size.height === row.height)) {
      throw new PiReviewerError('taste-comparison-evidence');
    }
    return { label: TASTE_LABELS[index]!, width: Number(row.width), height: Number(row.height), captureSha256: String(row.captureSha256), pngBase64: png };
  });
  if (renders[0]!.width !== renders[1]!.width || renders[0]!.height !== renders[1]!.height
    || piDigest(fixed.trialSha256, 'taste-comparison-trial') !== fixed.trialSha256
    || fixed.browserSha256 !== tasteRenderBinding(renders)) throw new PiReviewerError('taste-comparison-evidence');
}

function items(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ITEMS) return fail(label);
  return value.map(item => typeof item !== 'string' || item.trim() === '' ? fail(`${label} item must be text`)
    : item.length > MAX_ITEM_CHARS ? fail(`${label} item too long`) : item);
}

export function parseTasteComparisonReview(value: unknown, bindings: TasteComparisonReviewBindings): TasteComparisonReview {
  const input = piRecord(value, 'taste-comparison-review');
  if (!exact(input, ['schema', 'fixedBindings', 'human', 'confidence', 'aiTells', 'humanSignals'])) return fail('unexpected or missing fields');
  if (input.schema !== TASTE_COMPARISON_REVIEW_HANDBACK
    || canonicalJson(input.fixedBindings) !== canonicalJson(bindings)) return fail('evidence bindings changed');
  for (const digest of Object.values(bindings)) piDigest(digest, 'taste-comparison-binding');
  if (input.human !== 'A' && input.human !== 'B') return fail('human must be A or B');
  if (typeof input.confidence !== 'number' || !Number.isFinite(input.confidence)
    || input.confidence < 0.5 || input.confidence > 1) return fail('confidence must be a number from 0.5 to 1');
  return { human: input.human, confidence: input.confidence,
    aiTells: items(input.aiTells, 'aiTells'), humanSignals: items(input.humanSignals, 'humanSignals') };
}
