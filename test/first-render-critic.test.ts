import { test } from 'node:test';
import assert from 'node:assert/strict';
import { critiqueFirstRender, FIRST_RENDER_CRITIC_SCHEMA, parseFirstRenderSurface } from '../core/design/first-render-critic.ts';
import type { DesignHypothesis } from '../core/design/judgment.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';

test('the documented first-render schema exists and is accepted by the actual parser', () => {
  const input = inputSkeleton('first-render-surface');
  assert.doesNotThrow(() => parseFirstRenderSurface(input.skeleton));
  assert.match(input.constraints!.join('\n'), /actual rendered viewport/);
});

const hypothesis: DesignHypothesis = {
  schema: 'design-judgment-v1',
  feelsLike: 'a personal administrative workspace, not a government portal',
  dominantObject: 'benefit cards',
  subordinate: ['sidebar navigation', 'search', 'filters', 'AI assistant'],
  densityIntent: 'show several benefits in one viewport so a person can compare them without feeling like a spreadsheet',
  comparisonRequired: true,
  trustSource: 'explicit eligibility, match, provider, deadline, and next action metadata',
  twoSecondRead: 'find benefits that fit me',
};

const goodSurface = {
  heading: 'Find benefits that fit me',
  landmarks: ['sidebar-navigation', 'search', 'filters', 'benefit-card-grid', 'ai-assistant'],
  repeatedObjects: ['benefit-card', 'benefit-card', 'benefit-card', 'benefit-card'],
  trustSignals: ['eligible', '92% match', 'deadline', 'provider', 'apply now'],
  visibleText: ['find benefits that fit me', 'benefit cards', 'apply now'],
  dominantAreaShare: 0.34,
};

test('the reference-like first viewport retains the task gestalt', () => {
  const report = critiqueFirstRender(hypothesis, goodSurface);
  assert.equal(report.schema, FIRST_RENDER_CRITIC_SCHEMA);
  assert.equal(report.verdict, 'retain');
  assert.deepEqual(report.findings, []);
});

test('missing purpose is critical even when the page has plausible chrome', () => {
  const report = critiqueFirstRender(hypothesis, {
    ...goodSurface,
    heading: 'Dashboard',
    visibleText: ['Welcome', 'Overview', 'Settings'],
  });
  assert.equal(report.verdict, 'revise');
  assert.equal(report.findings.some((finding) => finding.id === 'PURPOSE_UNCLEAR'), true);
  assert.equal(report.findings.find((finding) => finding.id === 'PURPOSE_UNCLEAR')?.severity, 'critical');
});

test('missing dominant objects identifies a structure-first page', () => {
  const report = critiqueFirstRender(hypothesis, {
    ...goodSurface,
    repeatedObjects: [],
    visibleText: ['find benefits that fit me'],
  });
  assert.equal(report.findings.some((finding) => finding.id === 'DOMINANT_OBJECT_MISSING'), true);
});

test('utility chrome overriding the task is a critical contradiction', () => {
  const report = critiqueFirstRender(hypothesis, {
    ...goodSurface,
    landmarks: ['sidebar-navigation', 'search', 'filters', 'ai-assistant'],
    repeatedObjects: ['benefit-card', 'benefit-card'],
    dominantAreaShare: 0.10,
  });
  const finding = report.findings.find((item) => item.id === 'UTILITY_OVERRIDES_TASK');
  assert.ok(finding);
  assert.equal(finding.severity, 'critical');
  assert.match(finding.message, /subordinate/);
});

test('one visible object is an advisory comparison failure, not a forbidden beauty verdict', () => {
  const report = critiqueFirstRender(hypothesis, {
    ...goodSurface,
    repeatedObjects: ['benefit-card'],
  });
  const finding = report.findings.find((item) => item.id === 'COMPARISON_TOO_THIN');
  assert.ok(finding);
  assert.equal(finding.severity, 'advisory');
  assert.equal(report.verdict, 'retain');
});

test('a deliberate single editor does not inherit the benefits comparison requirement', () => {
  const report = critiqueFirstRender({ ...hypothesis, dominantObject: 'code editor', twoSecondRead: 'Edit the current project source', densityIntent: 'one focused document', comparisonRequired: false },
    { heading: 'Edit project source', landmarks: ['code editor'], repeatedObjects: ['code editor'], trustSignals: ['Saved locally'], visibleText: ['Edit project source'], dominantAreaShare: 0.8 });
  assert.equal(report.verdict, 'retain');
  assert.deepEqual(report.findings, []);
});

test('missing trust metadata is named without prescribing a visual style', () => {
  const report = critiqueFirstRender(hypothesis, {
    ...goodSurface,
    trustSignals: [],
  });
  const finding = report.findings.find((item) => item.id === 'TRUST_SIGNAL_MISSING');
  assert.ok(finding);
  assert.equal(finding.severity, 'advisory');
  assert.match(finding.message, /status|evidence|provider|date|action/);
});

test('the critic rejects malformed surface projections instead of guessing from a screenshot', () => {
  assert.throws(() => parseFirstRenderSurface({ ...goodSurface, extra: true }), /unknown or missing keys/);
  assert.throws(() => parseFirstRenderSurface({ ...goodSurface, dominantAreaShare: 2 }), /0..1/);
  assert.throws(() => parseFirstRenderSurface({ ...goodSurface, repeatedObjects: [''] }), /non-empty string/);
});

test('the critic keeps the hypothesis identity stable', () => {
  const first = critiqueFirstRender(hypothesis, goodSurface);
  const second = critiqueFirstRender(hypothesis, { ...goodSurface });
  assert.equal(first.hypothesisSha256, second.hypothesisSha256);
});
