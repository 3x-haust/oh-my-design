import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validateAssemblyCoverage,
  validateAcquisitionPlan,
  validateDecisionGraph,
  validateDeliberation,
  validateObservation,
  type DecisionGraph,
} from '../core/deliberation/contracts.ts';
import { classifyDepth, type DepthInput } from '../core/deliberation/depth.ts';
import { scoreComparison, type Comparison } from '../core/deliberation/comparison.ts';
import { checkDeliberationRun } from '../core/deliberation/check.ts';

const hash = 'a'.repeat(64);
const graph: DecisionGraph = {
  schema: 'decision-graph-v1',
  decisions: [{
    id: 'hero-strategy', stage: 'composition', risk: 'high', owner: 'omd-composer', question: 'What earns the first viewport?',
    alternatives: [{ id: 'copy-first', label: 'Copy-first hero' }, { id: 'demo-first', label: 'Working demo first' }],
    selected: 'demo-first', evidence: ['ref:demo-hero', 'frame:primary-task'], constraints: ['CTA remains visible at 390x844'],
    rejected: [{ id: 'copy-first', reason: 'It explains the claim without demonstrating the product mechanism.' }],
    affects: ['zone:hero', 'selector:[data-zone="hero"]'], dependsOn: [], reversible: true,
    tradeoffs: [{ goal: 'Show a rich product mechanism', constraint: 'No-JS content survival', attempt: 'Canvas-only demo', failureEvidence: ['round-1-no-js.png'], compromise: 'HTML demo with decorative canvas', resultEvidence: ['round-2-no-js.png'] }],
  }],
};
const fullGraph: DecisionGraph = {
  schema: 'decision-graph-v1',
  decisions: [
    { ...graph.decisions[0]!, id: 'frame-focus', stage: 'frame', risk: 'medium', owner: 'omd-framer', tradeoffs: [] },
    { ...graph.decisions[0]!, id: 'copy-register', stage: 'copy', risk: 'medium', owner: 'omd-writer', tradeoffs: [] },
    { ...graph.decisions[0]!, id: 'type-roles', stage: 'type', risk: 'medium', owner: 'omd-typesetter', tradeoffs: [] },
    graph.decisions[0]!,
    { ...graph.decisions[0]!, id: 'structure-choice', stage: 'structure', risk: 'medium', owner: 'omd-eye', tradeoffs: [] },
    { ...graph.decisions[0]!, id: 'production-carrier', stage: 'production', risk: 'medium', owner: 'omd-hand', tradeoffs: [] },
  ],
};

const deliberation = {
  schema: 'design-deliberation-v1', id: 'hero-debate', decisionId: 'hero-strategy', trigger: 'high-risk first viewport', moderator: 'omd-eye',
  perspectives: {
    ux: { inputSha256: hash, position: 'Keep the CTA visible.', evidence: ['frame:task'], objections: [], conditions: ['CTA in first viewport'] },
    artDirection: { inputSha256: hash, position: 'Use the demo as the anchor.', evidence: ['ref:hero'], objections: ['Copy-first is generic.'], conditions: ['One signature departure'] },
    production: { inputSha256: hash, position: 'Use HTML as the content baseline.', evidence: ['no-js:round-1'], objections: [], conditions: ['Reduced motion and no-JS'] },
  },
  resolution: { selected: 'demo-first', rationale: 'It demonstrates the mechanism while the HTML baseline satisfies reachability.', conditions: ['CTA in first viewport', 'HTML content baseline'] },
};

const observation = {
  schema: 'visual-observation-v1', owner: 'omd-hand', round: 1, viewport: '390x844', beforeRender: '.omd/.cache/round-1-before.png', metric: 'position',
  observed: 'CTA top is at 912 CSS px.', judgment: 'The primary action is outside the first viewport.', change: 'Reduce hero body gap from 48px to 24px.',
  afterRender: '.omd/.cache/round-1-after.png', result: 'CTA top is at 776 CSS px.', status: 'GREEN',
};
const coverage = {
  schema: 'assembly-coverage-v1', owner: 'omd-hand', expectedZones: ['hero'], zones: [{ id: 'hero', job: 'Demonstrate the design loop.', referenceRef: 'ref-demo', principle: 'Demo dominates copy.', compositionDecisionId: 'hero-strategy', productionSelector: '[data-zone="hero"]', fidelityEvidence: ['craft-fidelity:hero'] }],
};
const acquisition = {
  schema: 'reference-acquisition-plan-v1', owner: 'omd-framer',
  zones: [{ id: 'hero', kind: 'section', job: 'Demonstrate the design loop before asking for installation.', required: true }],
};

test('a bounded decision chain, deliberation, observation, and assembly chain pass', () => {
  assert.deepEqual(validateDecisionGraph(graph).findings, []);
  assert.deepEqual(validateDeliberation(deliberation, graph).findings, []);
  assert.deepEqual(validateObservation(observation).findings, []);
  assert.deepEqual(validateAssemblyCoverage(coverage, graph).findings, []);
  assert.deepEqual(validateAcquisitionPlan(acquisition).findings, []);
});

test('a consequential decision cannot collapse to one option or hide its trade-off', () => {
  const bad = structuredClone(graph) as unknown as { decisions: { alternatives: unknown[]; tradeoffs: unknown[] }[] };
  bad.decisions[0]!.alternatives = [{ id: 'only', label: 'First idea' }]; bad.decisions[0]!.tradeoffs = [];
  const ids = validateDecisionGraph(bad).findings.map((f) => f.id);
  assert.ok(ids.includes('DECISION-NO-DIVERGENCE'));
  assert.ok(ids.includes('DECISION-HIGH-RISK-NO-TRADEOFF'));
});

test('independent perspectives must judge identical sanitized bytes', () => {
  const bad = structuredClone(deliberation); bad.perspectives.production.inputSha256 = 'b'.repeat(64);
  assert.ok(validateDeliberation(bad, graph).findings.some((f) => f.id === 'DELIBERATION-INPUT-MISMATCH'));
});

test('visual judgment needs distinct before and after render evidence', () => {
  const bad = { ...observation, afterRender: observation.beforeRender };
  assert.ok(validateObservation(bad).findings.some((f) => f.id === 'OBSERVATION-NO-RENDER-DELTA'));
});

test('assembly coverage names output zones with no complete evidence chain', () => {
  const bad = { ...coverage, expectedZones: ['hero', 'proof'] };
  const finding = validateAssemblyCoverage(bad, graph).findings.find((f) => f.id === 'ASSEMBLY-ZONE-UNCOVERED');
  assert.match(finding?.message ?? '', /proof/);
});

test('adaptive depth raises only on design risk and never changes ownership', () => {
  const base: DepthInput = { schema: 'design-depth-input-v1', scope: 'component-change', zoneCount: 1, newPrimaryCta: false, newInformationArchitecture: false, multiScreenState: false, costlyError: false, brandDirectionChange: false, showpieceMotion: false, webgl: false, referenceZones: 0 };
  assert.equal(classifyDepth(base).level, 'L1');
  assert.equal(classifyDepth({ ...base, scope: 'single-surface', zoneCount: 5, newPrimaryCta: true }).level, 'L3');
  const high = classifyDepth({ ...base, showpieceMotion: true });
  assert.equal(high.level, 'L4'); assert.equal(high.requiresDeliberation, true);
});

test('comparison rejects model changes and reports quality per cost', () => {
  const variant = (id: Comparison['variants'][number]['id']) => ({ id, model: 'gpt-5.6-terra', promptSha256: hash, budget: { tokens: 100000, seconds: 600 }, blind: true as const, scores: { hierarchy: 8, originality: 8, composition: 8, typography: 8, interaction: 8, production: 8 }, taskSuccess: 0.9, accessibilityErrors: 0, mobileOverflow: false, noJsContentLoss: 0, revisions: 2 });
  const input: Comparison = { schema: 'design-comparison-v1', variants: [variant('baseline'), variant('design-prompt'), variant('omd-adaptive'), variant('omd-deliberation')] };
  assert.equal(scoreComparison(input).length, 4);
  const bad = structuredClone(input); (bad.variants[1] as { model: string }).model = 'other';
  assert.throws(() => scoreComparison(bad), /same model/);
});

test('run gate joins all L4 artifacts instead of letting each pass in isolation', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-delib-')); const omd = join(cwd, '.omd');
  mkdirSync(join(omd, 'deliberations'), { recursive: true }); mkdirSync(join(omd, 'observations'));
  const depth: DepthInput = { schema: 'design-depth-input-v1', scope: 'single-surface', zoneCount: 4, newPrimaryCta: true, newInformationArchitecture: false, multiScreenState: false, costlyError: false, brandDirectionChange: true, showpieceMotion: false, webgl: false, referenceZones: 4 };
  for (const [path, value] of [['depth.json', depth], ['acquisition-plan.json', acquisition], ['decision-graph.json', fullGraph], ['assembly-coverage.json', coverage]] as const) writeFileSync(join(omd, path), JSON.stringify(value));
  writeFileSync(join(omd, 'deliberations', 'hero.json'), JSON.stringify(deliberation));
  writeFileSync(join(omd, 'observations', 'round-1.json'), JSON.stringify(observation));
  const report = checkDeliberationRun(cwd); assert.equal(report.ok, true); assert.equal(report.depth?.level, 'L4');
});

test('prebuild gate blocks production until upstream owner decisions and L4 moderation are complete', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-prebuild-')); const omd = join(cwd, '.omd');
  mkdirSync(join(omd, 'deliberations'), { recursive: true });
  const depth: DepthInput = { schema: 'design-depth-input-v1', scope: 'single-surface', zoneCount: 4, newPrimaryCta: true, newInformationArchitecture: false, multiScreenState: false, costlyError: false, brandDirectionChange: true, showpieceMotion: false, webgl: false, referenceZones: 4 };
  const upstreamGraph = { ...fullGraph, decisions: fullGraph.decisions.filter((decision) => decision.stage !== 'production') };
  for (const [path, value] of [['depth.json', depth], ['acquisition-plan.json', acquisition], ['decision-graph.json', upstreamGraph]] as const) writeFileSync(join(omd, path), JSON.stringify(value));
  writeFileSync(join(omd, 'deliberations', 'hero.json'), JSON.stringify(deliberation));

  const prebuild = checkDeliberationRun(cwd, 'prebuild');
  assert.equal(prebuild.ok, true);
  assert.equal(prebuild.phase, 'prebuild');
  assert.equal(prebuild.counts.observations, 0);
  assert.equal(checkDeliberationRun(cwd, 'final').ok, false);

  writeFileSync(join(omd, 'decision-graph.json'), JSON.stringify({
    ...upstreamGraph,
    decisions: upstreamGraph.decisions.filter((decision) => decision.stage !== 'structure'),
  }));
  assert.ok(checkDeliberationRun(cwd, 'prebuild').findings.some((finding) => finding.id === 'DECISION-STAGE-UNCOVERED'));
});
