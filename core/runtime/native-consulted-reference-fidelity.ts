import type { ConsultedReferenceState } from '../design/consulted-references.ts';

const fail = (reason: string): never => {
  throw new Error(`NATIVE_CONSULTED_REFERENCE_FIDELITY_INVALID:${reason}`);
};
const object = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail('comparison object required');
  return Object.fromEntries(Object.entries(value));
};
const text = (value: unknown, label: string): string =>
  typeof value === 'string' && value.trim() !== '' ? value : fail(label);
const digest = (value: unknown, label: string): string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : fail(label);
const viewport = (value: unknown): 'desktop' | 'mobile' =>
  value === 'desktop' || value === 'mobile' ? value : fail('viewport');
const state = (value: unknown): ConsultedReferenceState =>
  value === 'default' || value === 'hover' || value === 'focus'
    || value === 'pressed' || value === 'open' ? value : fail('state');

export type ConsultedReferenceComparisonExpectation = Readonly<{
  component: string;
  state: ConsultedReferenceState;
  viewport: 'desktop' | 'mobile';
  referenceSha256: string;
  targetCaptureSha256: string;
}>;
export type ConsultedReferenceComparison = ConsultedReferenceComparisonExpectation & Readonly<{
  verdict: 'pass' | 'fail' | 'insufficient';
  sourceIdentity: string;
  preservedTraits: readonly string[];
  departures: readonly string[];
  findings: readonly string[];
}>;
export type ConsultedReferenceTarget = Readonly<{
  component: string;
  state: ConsultedReferenceState;
  viewport: 'desktop' | 'mobile';
  captureSha256: string;
}>;

const key = (row: ConsultedReferenceComparisonExpectation): string =>
  JSON.stringify([row.component, row.state, row.viewport, row.referenceSha256, row.targetCaptureSha256]);

export function parseConsultedReferenceComparisonExpectations(
  value: unknown,
): readonly ConsultedReferenceComparisonExpectation[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) return fail('expectations');
  const expectations = value.map(candidate => {
    const row = object(candidate);
    const fields = ['component', 'state', 'viewport', 'referenceSha256', 'targetCaptureSha256'];
    if (Object.keys(row).sort().join(',') !== fields.sort().join(',')) return fail('expectation fields');
    return Object.freeze({
      component: text(row.component, 'component'),
      state: state(row.state),
      viewport: viewport(row.viewport),
      referenceSha256: digest(row.referenceSha256, 'reference digest'),
      targetCaptureSha256: digest(row.targetCaptureSha256, 'target digest'),
    });
  });
  if (new Set(expectations.map(key)).size !== expectations.length) return fail('duplicate expectations');
  return Object.freeze(expectations);
}

export function consultedReferenceComparisonExpectations(
  references: readonly Readonly<{
    referenceRole: 'primary' | 'supplemental';
    component: string;
    state: ConsultedReferenceState;
    captureSha256: string;
  }>[],
  targets: readonly ConsultedReferenceTarget[],
): readonly ConsultedReferenceComparisonExpectation[] {
  const primaries = references.filter(reference => reference.referenceRole === 'primary');
  if (primaries.length === 0) return Object.freeze([]);
  if (primaries.length !== 1) return fail('exactly one primary required');
  const expectations = primaries.flatMap(reference => {
    const matches = [...new Map(targets.filter(target =>
      target.component === reference.component && target.state === reference.state)
      .map(target => [JSON.stringify([
        target.component, target.state, target.viewport, target.captureSha256,
      ]), target])).values()];
    for (const required of ['desktop', 'mobile'] as const) {
      if (!matches.some(target => target.viewport === required)) {
        fail(`missing product state coverage:${reference.component}:${reference.state}:${required}`);
      }
    }
    return matches.map(target => Object.freeze({
      component: text(reference.component, 'component'),
      state: state(reference.state),
      viewport: target.viewport,
      referenceSha256: digest(reference.captureSha256, 'reference digest'),
      targetCaptureSha256: digest(target.captureSha256, 'target digest'),
    }));
  });
  if (new Set(expectations.map(key)).size !== expectations.length) return fail('duplicate comparison coverage');
  return Object.freeze(expectations);
}

export function parseConsultedReferenceComparisons(
  value: unknown,
  expectations: readonly ConsultedReferenceComparisonExpectation[],
  laneFindings: readonly string[],
  referenceFidelityVerdict: unknown,
): readonly ConsultedReferenceComparison[] {
  if (expectations.length === 0 && value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length !== expectations.length) return fail('comparison coverage');
  const expected = new Map(expectations.map(row => [key(row), row]));
  const seen = new Set<string>();
  const comparisons = value.map(candidate => {
    const row = object(candidate);
    const fields = ['component', 'state', 'viewport', 'referenceSha256', 'targetCaptureSha256',
      'verdict', 'sourceIdentity', 'preservedTraits', 'departures', 'findings'];
    if (Object.keys(row).sort().join(',') !== fields.sort().join(',')) return fail('comparison fields');
    const binding = {
      component: text(row.component, 'component'),
      state: state(row.state),
      viewport: viewport(row.viewport),
      referenceSha256: digest(row.referenceSha256, 'reference digest'),
      targetCaptureSha256: digest(row.targetCaptureSha256, 'target digest'),
    };
    const identity = key(binding);
    const exact = expected.get(identity);
    if (exact === undefined || seen.has(identity)) return fail('comparison binding');
    seen.add(identity);
    if (row.verdict !== 'pass' && row.verdict !== 'fail' && row.verdict !== 'insufficient') {
      return fail('comparison verdict');
    }
    const texts = (input: unknown, label: string): readonly string[] => {
      if (!Array.isArray(input)) return fail(label);
      const items = input.map(item => text(item, label));
      if (new Set(items).size !== items.length) return fail(label);
      return Object.freeze(items);
    };
    const findings = texts(row.findings, 'comparison findings');
    if ((row.verdict === 'pass') !== (findings.length === 0)
      || findings.some(finding => !laneFindings.includes(finding))) {
      return fail('comparison unresolved findings');
    }
    return Object.freeze({
      ...exact,
      verdict: row.verdict,
      sourceIdentity: text(row.sourceIdentity, 'source identity'),
      preservedTraits: texts(row.preservedTraits, 'preserved traits'),
      departures: texts(row.departures, 'departures'),
      findings,
    });
  });
  if (referenceFidelityVerdict === 'GREEN'
    && comparisons.some(comparison => comparison.verdict !== 'pass')) {
    return fail('GREEN fidelity with non-pass consulted comparison');
  }
  return Object.freeze(comparisons);
}
