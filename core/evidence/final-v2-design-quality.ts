export const DESIGN_QUALITY_CONTRACT_SCHEMA =
  'design-quality-contract-v1' as const;

export const DESIGN_QUALITY_AXES = Object.freeze([
  'beautyDesirability',
  'hierarchyComposition',
  'domainSpecificity',
  'humanAuthorship',
  'usability',
  'responsiveCraft',
] as const);

export type DesignQualityAxis = (typeof DESIGN_QUALITY_AXES)[number];
export type DesignQualityVerdict = 'GREEN' | 'RED';
export type DesignQualityViewport = 'desktop' | 'mobile';
export type DesignQualityCrossViewport =
  | 'preserved'
  | 'weakened'
  | 'contradicted';

export const DESIGN_QUALITY_AXIS_FLOORS = Object.freeze({
  beautyDesirability: 4,
  hierarchyComposition: 4,
  domainSpecificity: 3,
  humanAuthorship: 3,
  usability: 3,
  responsiveCraft: 3,
} satisfies Readonly<Record<DesignQualityAxis, 3 | 4>>);

export type DesignQualityEvidence = Readonly<{
  observationSha256: string;
  viewport: DesignQualityViewport;
  state: string;
  region: string;
  visibleCondition: string;
  userConsequence: string;
}>;

export type DesignQualityAssessment = Readonly<{
  axis: DesignQualityAxis;
  verdict: DesignQualityVerdict;
  score: 0 | 1 | 2 | 3 | 4;
  crossViewport: DesignQualityCrossViewport;
  criticalFailure: string | null;
  evidence: readonly DesignQualityEvidence[];
}>;

export type DesignQualityContract = Readonly<{
  schema: typeof DESIGN_QUALITY_CONTRACT_SCHEMA;
  axes: readonly DesignQualityAssessment[];
}>;

export type DesignQualityParseOptions = Readonly<{
  expectedObservationSha256s?: readonly string[];
  expectedObservationBindings?: readonly DesignQualityObservationBinding[];
}>;

/**
 * Trusted projection of one screenshot inside an immutable observation-v2 record.
 * `observationSha256` remains the aggregate record digest used by final-v2 lanes;
 * the remaining fields come from the validated browser observation nested inside it.
 */
export type DesignQualityObservationBinding = Readonly<{
  observationSha256: string;
  browserObservationSha256: string;
  captureSha256: string;
  viewport: DesignQualityViewport;
  state: string;
}>;

const SHA256 = /^[a-f0-9]{64}$/;

function fail(code: string): never {
  throw new Error(code);
}

function record(
  value: unknown,
  keys: readonly string[],
  code = 'DESIGN_QUALITY_MALFORMED',
): ReadonlyMap<string, unknown> {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    return fail(code);
  }
  const own = Reflect.ownKeys(value);
  if (
    own.length !== keys.length
    || own.some((key) => typeof key !== 'string' || !keys.includes(key))
  ) {
    return fail(code);
  }
  const fields = new Map<string, unknown>();
  for (const key of keys) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !('value' in descriptor)
    ) {
      return fail(code);
    }
    fields.set(key, descriptor.value);
  }
  return fields;
}

function text(value: unknown, code = 'DESIGN_QUALITY_MALFORMED'): string {
  if (
    typeof value !== 'string'
    || value.trim() === ''
    || value.length > 500
  ) {
    return fail(code);
  }
  return value.trim();
}

function parseEvidence(
  value: unknown,
  expected: ReadonlySet<string> | undefined,
  bindings: readonly DesignQualityObservationBinding[] | undefined,
  axis: DesignQualityAxis,
): DesignQualityEvidence {
  const item = record(value, [
    'observationSha256',
    'viewport',
    'state',
    'region',
    'visibleCondition',
    'userConsequence',
  ]);
  const observationSha256 = text(item.get('observationSha256'));
  const viewport = item.get('viewport');
  if (
    !SHA256.test(observationSha256)
    || (expected !== undefined && !expected.has(observationSha256))
    || (viewport !== 'desktop' && viewport !== 'mobile')
  ) {
    return fail(`DESIGN_QUALITY_EVIDENCE_INVALID:${axis}`);
  }
  const state = text(item.get('state'));
  if (bindings !== undefined) {
    const matching = bindings.filter((binding) =>
      binding.observationSha256 === observationSha256
      && binding.viewport === viewport
      && binding.state === state);
    const captureSha256s = new Set(matching.map(({ captureSha256 }) => captureSha256));
    if (captureSha256s.size !== 1) {
      return fail(`DESIGN_QUALITY_EVIDENCE_INVALID:${axis}`);
    }
  }
  return Object.freeze({
    observationSha256,
    viewport,
    state,
    region: text(item.get('region')),
    visibleCondition: text(item.get('visibleCondition')),
    userConsequence: text(item.get('userConsequence')),
  });
}

function parseAssessment(
  value: unknown,
  expected: ReadonlySet<string> | undefined,
  bindings: readonly DesignQualityObservationBinding[] | undefined,
): DesignQualityAssessment {
  const item = record(value, [
    'axis',
    'verdict',
    'score',
    'crossViewport',
    'criticalFailure',
    'evidence',
  ]);
  const axis = item.get('axis');
  if (
    typeof axis !== 'string'
    || !DESIGN_QUALITY_AXES.includes(axis as DesignQualityAxis)
  ) {
    return fail('DESIGN_QUALITY_MALFORMED');
  }
  const verdict = item.get('verdict');
  const score = item.get('score');
  const crossViewport = item.get('crossViewport');
  const criticalFailure = item.get('criticalFailure');
  const evidenceInput = item.get('evidence');
  if (
    (verdict !== 'GREEN' && verdict !== 'RED')
    || typeof score !== 'number'
    || !Number.isSafeInteger(score)
    || score < 0
    || score > 4
    || (
      crossViewport !== 'preserved'
      && crossViewport !== 'weakened'
      && crossViewport !== 'contradicted'
    )
    || (
      criticalFailure !== null
      && (typeof criticalFailure !== 'string' || criticalFailure.trim() === '')
    )
  ) {
    return fail('DESIGN_QUALITY_MALFORMED');
  }
  const typedAxis = axis as DesignQualityAxis;
  if (
    !Array.isArray(evidenceInput)
    || evidenceInput.length < 2
    || evidenceInput.length > 12
  ) {
    return fail(`DESIGN_QUALITY_EVIDENCE_INVALID:${typedAxis}`);
  }
  const evidence = Object.freeze(
    evidenceInput.map((entry) =>
      parseEvidence(entry, expected, bindings, typedAxis)),
  );
  if (
    new Set(evidence.map(({ observationSha256, viewport, state }) =>
      `${observationSha256}:${viewport}:${state}`)).size !== evidence.length
  ) {
    return fail(`DESIGN_QUALITY_EVIDENCE_INVALID:${typedAxis}`);
  }
  const viewports = new Set(evidence.map(({ viewport }) => viewport));
  if (!viewports.has('desktop') || !viewports.has('mobile')) {
    return fail(`DESIGN_QUALITY_EVIDENCE_INVALID:${typedAxis}`);
  }
  const passesFloor =
    score >= DESIGN_QUALITY_AXIS_FLOORS[typedAxis]
    && crossViewport !== 'contradicted'
    && criticalFailure === null;
  if (
    (verdict === 'GREEN' && !passesFloor)
    || (verdict === 'RED' && passesFloor)
  ) {
    return fail(`DESIGN_QUALITY_VERDICT_MISMATCH:${typedAxis}`);
  }
  return Object.freeze({
    axis: typedAxis,
    verdict,
    score: score as DesignQualityAssessment['score'],
    crossViewport,
    criticalFailure:
      criticalFailure === null ? null : criticalFailure.trim(),
    evidence,
  });
}

export function parseDesignQualityContract(
  input: unknown,
  options: DesignQualityParseOptions = {},
): DesignQualityContract {
  if (input === undefined) fail('DESIGN_QUALITY_MISSING');
  const root = record(input, ['schema', 'axes']);
  if (root.get('schema') !== DESIGN_QUALITY_CONTRACT_SCHEMA) {
    fail('DESIGN_QUALITY_MALFORMED');
  }
  const axesInput = root.get('axes');
  if (!Array.isArray(axesInput) || axesInput.length !== DESIGN_QUALITY_AXES.length) {
    fail('DESIGN_QUALITY_MALFORMED');
  }
  const expected =
    options.expectedObservationSha256s === undefined
      ? undefined
      : new Set(options.expectedObservationSha256s);
  const bindings = options.expectedObservationBindings;
  if (bindings !== undefined) {
    for (const binding of bindings) {
      if (
        !SHA256.test(binding.observationSha256)
        || !SHA256.test(binding.browserObservationSha256)
        || !SHA256.test(binding.captureSha256)
        || (binding.viewport !== 'desktop' && binding.viewport !== 'mobile')
        || binding.state.trim() === ''
        || (expected !== undefined && !expected.has(binding.observationSha256))
      ) {
        fail('DESIGN_QUALITY_EVIDENCE_INVALID:observation-binding');
      }
    }
  }
  const axes = Object.freeze(
    axesInput.map((entry) => parseAssessment(entry, expected, bindings)),
  );
  if (
    axes.some(({ axis }, index) => axis !== DESIGN_QUALITY_AXES[index])
  ) {
    fail('DESIGN_QUALITY_MALFORMED');
  }
  return Object.freeze({
    schema: DESIGN_QUALITY_CONTRACT_SCHEMA,
    axes,
  });
}

export function assertDesignQualityGreen(
  input: unknown,
  options: DesignQualityParseOptions = {},
): DesignQualityContract {
  const contract = parseDesignQualityContract(input, options);
  const failed = contract.axes.find(({ verdict }) => verdict === 'RED');
  if (failed !== undefined) {
    fail(`DESIGN_QUALITY_AXIS_RED:${failed.axis}`);
  }
  return contract;
}

const CROSS_VIEWPORT_SEVERITY: Readonly<Record<DesignQualityCrossViewport, number>> =
  Object.freeze({ preserved: 0, weakened: 1, contradicted: 2 });

/**
 * Produces the conservative public projection of independently validated Eye assessments.
 * Scores never average upward: each axis keeps the minimum score, the worst viewport result,
 * and evidence from one minimum-scoring reviewer selected by a stable lexical tie-break.
 */
export function aggregateDesignQualityContracts(
  contracts: readonly DesignQualityContract[],
): DesignQualityContract {
  if (contracts.length === 0) fail('DESIGN_QUALITY_MISSING');
  const axes = DESIGN_QUALITY_AXES.map((axis, axisIndex): DesignQualityAssessment => {
    const assessments = contracts.map((contract) => {
      const assessment = contract.axes[axisIndex];
      if (assessment === undefined || assessment.axis !== axis) {
        return fail('DESIGN_QUALITY_MALFORMED');
      }
      if (assessment.verdict !== 'GREEN') {
        return fail(`DESIGN_QUALITY_AXIS_RED:${axis}`);
      }
      return assessment;
    });
    const minimumScore = Math.min(...assessments.map(({ score }) => score)) as
      DesignQualityAssessment['score'];
    const worstCrossViewport = assessments.reduce<DesignQualityCrossViewport>(
      (worst, assessment) =>
        CROSS_VIEWPORT_SEVERITY[assessment.crossViewport]
          > CROSS_VIEWPORT_SEVERITY[worst]
          ? assessment.crossViewport
          : worst,
      'preserved',
    );
    const evidenceSource = assessments
      .filter(({ score }) => score === minimumScore)
      .map((assessment) => ({
        assessment,
        tieBreak: JSON.stringify(assessment.evidence),
      }))
      .sort((left, right) => left.tieBreak.localeCompare(right.tieBreak))[0]
      ?.assessment ?? fail('DESIGN_QUALITY_MALFORMED');
    return Object.freeze({
      axis,
      verdict: 'GREEN',
      score: minimumScore,
      crossViewport: worstCrossViewport,
      criticalFailure: null,
      evidence: evidenceSource.evidence,
    });
  });
  return Object.freeze({
    schema: DESIGN_QUALITY_CONTRACT_SCHEMA,
    axes: Object.freeze(axes),
  });
}
