import { DESIGN_QUALITY_AXES, DESIGN_QUALITY_CONTRACT_SCHEMA } from '../evidence/final-v2-design-quality.ts';

const text = Object.freeze({ type: 'string', minLength: 1, maxLength: 500 });
const digest = Object.freeze({ type: 'string', pattern: '^[a-f0-9]{64}$' });
const verdict = Object.freeze({ enum: ['GREEN', 'RED'] });
const closed = (properties: Readonly<Record<string, unknown>>) => ({
  type: 'object', additionalProperties: false, required: Object.keys(properties), properties,
});
const evidenceSchema = closed({
  observationSha256: digest,
  viewport: { enum: ['desktop', 'mobile'] },
  state: text, region: text, visibleCondition: text, userConsequence: text,
});
const qualitySchema = closed({
  schema: { const: DESIGN_QUALITY_CONTRACT_SCHEMA },
  axes: {
    type: 'array', minItems: 6, maxItems: 6,
    items: closed({
      axis: { enum: DESIGN_QUALITY_AXES },
      verdict, score: { type: 'integer', minimum: 0, maximum: 4 },
      crossViewport: { enum: ['preserved', 'weakened', 'contradicted'] },
      criticalFailure: { anyOf: [{ type: 'null' }, text] },
      evidence: { type: 'array', minItems: 2, maxItems: 12, items: evidenceSchema },
    }),
  },
});

/** Nulls require an authored judgment; this template never supplies an approval. */
export function finalReviewResponseContract(input: Readonly<{
  identity: Readonly<{ schema: string; lane: string }>;
  fixedBindings: Readonly<Record<string, unknown>>;
  verdictKeys: readonly string[];
  floorKeys: readonly string[];
  designQuality?: boolean;
  assessmentTemplates?: Readonly<Record<string, readonly unknown[]>>;
}>) {
  const assessmentTemplates = input.assessmentTemplates ?? {};
  return Object.freeze({
    responseTemplate: {
      ...input.identity, ...input.fixedBindings,
      verdicts: Object.fromEntries(input.verdictKeys.map(key => [key, null])),
      criticalFloors: Object.fromEntries(input.floorKeys.map(key => [key, null])),
      ...(input.designQuality ? { designQuality: {
        schema: DESIGN_QUALITY_CONTRACT_SCHEMA,
        axes: DESIGN_QUALITY_AXES.map(axis => ({
          axis, verdict: null, score: null, crossViewport: null, criticalFailure: null,
          evidence: [],
        })),
      } } : {}),
      findings: [],
      ...assessmentTemplates,
    },
    responseSchema: closed({
      schema: { const: input.identity.schema }, lane: { const: input.identity.lane },
      ...Object.fromEntries(Object.entries(input.fixedBindings).map(([key, value]) => [key, { const: value }])),
      verdicts: closed(Object.fromEntries(input.verdictKeys.map(key => [key, verdict]))),
      criticalFloors: closed(Object.fromEntries(input.floorKeys.map(key =>
        [key, { type: 'number', minimum: 0, maximum: 4 }]))),
      ...(input.designQuality ? { designQuality: qualitySchema } : {}),
      findings: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } },
      ...Object.fromEntries(Object.keys(assessmentTemplates).map(key =>
        [key, { type: 'array', items: { type: 'object' } }])),
    }),
  });
}
