import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { routeAdaptiveFlow, parseRouteRecord, publishAdaptiveRoute, readPersistedRoute } from '../core/route/index.ts';
import { ADAPTIVE_STAGE_IDS, OPTIONAL_METHOD_IDS } from '../core/route/adaptive-flow-domain.ts';
import { ADAPTIVE_STAGE_GRAPH, ADAPTIVE_STAGE_OWNERS, validateAdaptiveStageGraph } from '../core/route/adaptive-stage-graph.ts';
import { STAGES, contractSha256, deliveryReceipt, adaptivePrerequisiteStages } from '../core/stage/contract.ts';
import { MINIMAL_COMPOSITION_SECTIONS } from '../core/brief/minimal-composition.ts';
import { checkProductionReadiness } from '../core/brief/production-readiness.ts';
import { checkBriefEntry } from '../core/brief/entry.ts';
import { candidateCopyProjection } from '../core/brief/candidate-plan.ts';
import { publishCandidatePacket, publishCandidateSelection } from '../core/brief/candidate-choice.ts';
import { publishSelectedArtDirection, readSelectedArtDirection, selectedArtCopyProjection, selectedArtDirectionInput } from '../core/art-direction/selected.ts';
import { selectedDirectionCopyClosureProblems } from '../core/art-direction/copy-closure.ts';
import { nextStageWork } from '../core/stage/next.ts';
import { stageArtifactProblems } from '../core/stage/output.ts';
import { withBrowser } from '../core/render/index.ts';
import { withLocalView } from '../core/render/stateful.ts';
import { hash } from '../core/brief/candidate-data.ts';
import { fixture, routeInput, renderedSet, snapshot, userChoice, write, repo, pack, type Fixture } from './helpers/phase6-process.ts';
import { measuredTerminalCopy } from './helpers/measured-terminal.ts';
function ready(f: Fixture) {
  const evidence = [{ status: 'user-provided', reference: 'request' }], statement = (text: string) => ({ text, userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'request', excerpt: f.route.request }] });
  write(f.root, '.omd/domain-brief.json', JSON.stringify({ schema: 'domain-brief-v1', request: f.route.request, domain: 'Instrument launch', summary: 'Explain patching without invented terms.', surfaces: [{ name: 'Main', purpose: 'Explain patching', evidence }, { name: 'Details', purpose: 'Disclose known terms', evidence }], coreObjects: [{ name: 'Patch', evidence }], audience: { description: 'Instrument players', evidence }, referenceQueries: { component: ['patch panel'], craft: ['readable type'], mood: ['workspace'] }, planning: { businessGoal: statement('Explain patching'), successSignal: statement('Reach details'), nonGoals: [statement('No invented commercial terms')] } }));
  write(f.root, '.omd/composition.md', `## Input fingerprint\n- Frame SHA-256: ${hash(readFileSync(join(f.root, '.omd/frame.md')))}\n- Source contract SHA-256: ${f.route.sourceContractSha256}\n\n${MINIMAL_COMPOSITION_SECTIONS.map(s => `## ${s}\nKeep the supplied relationship and disclose unknown terms.\n`).join('\n')}`);
  write(f.root, '.omd/delivery.jsonl', STAGES.filter(s => f.route.strategy.stages.includes(s.id)).flatMap(s => s.requiredContracts.map(c => JSON.stringify(deliveryReceipt(s.id, c, contractSha256(pack, c, s.id), '2026-09-26T00:00:00Z')))).join('\n') + '\n');
}
function withoutCopy(input: ReturnType<typeof routeInput>) {
  const strategy = input.strategyDecision;
  const omittedRoles = new Set(['omd-writer', 'omd-typesetter', 'omd-composer']);
  const omittedStages = new Set(['copy', 'type-proof', 'composition']);
  strategy.roles = strategy.roles.filter((role: string) => !omittedRoles.has(role));
  strategy.stages = strategy.stages.filter((stage: string) => !omittedStages.has(stage));
  strategy.methods = strategy.methods.filter((method: string) => method !== 'copy-repair-workflow' && method !== 'parallel-reference-acquisition');
  strategy.executionWaves = strategy.executionWaves
    .map((wave: { id: string; mode: 'concurrent'; roles: string[] }) => ({ ...wave, roles: wave.roles.filter(role => !omittedRoles.has(role)) }))
    .filter((wave: { roles: string[] }) => wave.roles.length > 0);
  strategy.skips.push(
    { id: 'copy', reason: 'Representative native content remains provisional because Writer copy was not selected.' },
    { id: 'type-proof', reason: 'The focused native route does not select a separate type owner.' },
    { id: 'composition', reason: 'The focused native route proceeds from its selected integrated candidate.' },
  );
  return input;
}
async function publishSelectedDirection(f: Fixture) {
  const set = await renderedSet(f);
  const packet = publishCandidatePacket(f.root, set, f.writer, f.invocation);
  publishCandidateSelection(f.root, userChoice(f, packet), f.writer, f.invocation);
  const chosen = selectedArtDirectionInput(f.root);
  return publishSelectedArtDirection(f.root, {
    schema: 'art-direction-input-v3',
    candidateSelection: chosen.candidateSelection,
    selectedId: chosen.selectedId,
    register: 'content-led',
    relationship: chosen.hypothesis.relationship,
    staticContract: {
      hierarchy: 'Explain the patch relationship before the truthful details path.',
      density: 'Keep every representative content unit visible.',
      typography: 'Use the selected readable treatment.',
      preserve: ['Preserve the provisional representative strings.'],
      falsifiers: ['The patch relationship is not legible.'],
    },
    metaphorQualities: [],
    literalPropsToReject: [],
    motion: { decision: 'none', settlement: null, evaluatorAssessment: null, evaluatorResult: null },
    implementationLane: 'CSS',
    fallbackPath: 'Keep the selected static relationship.',
    performanceAccessibilityBudget: 'No motion or external assets.',
    beatIds: [],
  }, f.writer, f.invocation);
}
test('process version moves concepts before type/composition with Art Director/Sketch team; legacy replay stays exact', t => {
  const f = fixture(t), invalid = routeInput();
  invalid.strategyDecision.stages = [...invalid.strategyDecision.stages].filter((s: string) => s !== 'candidate-generation');
  invalid.strategyDecision.stages.splice(invalid.strategyDecision.stages.indexOf('production'), 0, 'candidate-generation');
  const before = snapshot(f.root);
  assert.throws(() => publishAdaptiveRoute(f.root, invalid, f.writer, f.invocation), /ORDER_INVALID/);
  assert.deepEqual(snapshot(f.root), before);
  publishAdaptiveRoute(f.root, routeInput(), f.writer, f.invocation);
  validateAdaptiveStageGraph(ADAPTIVE_STAGE_GRAPH);
  assert.equal(ADAPTIVE_STAGE_OWNERS['candidate-generation'], 'omd-art-director');
  assert.ok(OPTIONAL_METHOD_IDS.includes('concept-exploration'));
  assert.ok(!(ADAPTIVE_STAGE_IDS as readonly string[]).includes('concept-exploration'));
  const prerequisites = adaptivePrerequisiteStages(f.root, f.invocation, 'candidate-generation')!;
  assert.ok(!prerequisites.includes('composition') && !prerequisites.includes('type-proof'));
  assert.ok(adaptivePrerequisiteStages(f.root, f.invocation, 'type-proof')!.includes('candidate-generation'));
  const legacy = routeAdaptiveFlow(JSON.parse(readFileSync(join(repo, 'test/fixtures/adaptive-flow/synth-marketing.json'), 'utf8')));
  assert.deepEqual(parseRouteRecord(legacy), legacy);
  assert.equal(legacy.sourceContract.processPolicy, undefined);
  const md = '## Surface copy\nActual text.\n## Sources and fact ledger\nSupplied fact.\n## Truth contract\nDemo only.\n';
  assert.equal(candidateCopyProjection(md), candidateCopyProjection(md + '## Art direction contract\nDirection metadata closure.\n'));
  assert.notEqual(candidateCopyProjection(md), candidateCopyProjection(md.replace('Actual text.', 'Revised text.')));
});

test('missing concepts remain debt and permit first render; ready user choice blocks commitment but not representative work', async t => {
  const f = fixture(t); ready(f);
  assert.equal(checkProductionReadiness(f.root, f.invocation, pack, 'index.html').ok, true);
  f.writer.write('index.html', '<!doctype html><title>Provisional render</title><main>Patch the instrument</main>');
  const png = await withBrowser(b => withLocalView(b, f.root, { page: 'index.html', viewport: { width: 390, height: 844 } }, page => page.screenshot()));
  assert.equal(png[0], 137);
  const set = await renderedSet(f), packet = publishCandidatePacket(f.root, set, f.writer, f.invocation);
  const before = snapshot(f.root), work = nextStageWork(f.root, pack, f.invocation);
  assert.equal(work.schema, 'stage-next-v2'); assert.equal(work.action, 'await-user');
  assert.equal(checkProductionReadiness(f.root, f.invocation, pack, 'index.html').ok, false);
  assert.ok(checkBriefEntry(f.root, 'type-proof', pack, f.invocation).blockers.some(b => b.includes('NEEDS_USER_DIRECTION')));
  assert.deepEqual(snapshot(f.root), before);
  assert.ok(!checkBriefEntry(f.root, 'candidate-generation', pack, f.invocation).blockers.some(b => b.includes('NEEDS_USER_DIRECTION')));
  publishCandidateSelection(f.root, userChoice(f, packet), f.writer, f.invocation);
  assert.equal(checkProductionReadiness(f.root, f.invocation, pack, 'index.html').ok, true);
});

test('selected direction copy closure permits omitted Writer copy but refuses missing selected copy and present invalid metadata without mutation', async t => {
  const base = fixture(t), input = withoutCopy(routeInput());
  publishAdaptiveRoute(base.root, input, base.writer, base.invocation);
  const route = readPersistedRoute(base.root, base.invocation);
  const noCopy: Fixture = {
    ...base,
    input,
    route,
    plan: { ...base.plan, sourceContractSha256: route.sourceContractSha256 },
  };
  await publishSelectedDirection(noCopy);
  assert.equal(existsSync(join(noCopy.root, '.omd/copy-deck.md')), false);
  let before = snapshot(noCopy.root);
  assert.deepEqual(selectedDirectionCopyClosureProblems(noCopy.root), []);
  assert.deepEqual(stageArtifactProblems(noCopy.root, 'art-direction', noCopy.invocation), []);
  assert.deepEqual(snapshot(noCopy.root), before);

  write(noCopy.root, '.omd/copy-deck.md', '# Not a valid copy deck\n');
  before = snapshot(noCopy.root);
  assert.ok(selectedDirectionCopyClosureProblems(noCopy.root).length > 0);
  assert.ok(stageArtifactProblems(noCopy.root, 'art-direction', noCopy.invocation).length > 0);
  assert.deepEqual(snapshot(noCopy.root), before);

  const selected = readSelectedArtDirection(noCopy.root, route.sourceContractSha256);
  write(noCopy.root, '.omd/copy-deck.md', `${measuredTerminalCopy}\n## Selected direction\n\n\`\`\`json\n${JSON.stringify({
    ...selectedArtCopyProjection(selected),
    selectedId: 'stale-direction',
  })}\n\`\`\`\n`);
  before = snapshot(noCopy.root);
  assert.match(selectedDirectionCopyClosureProblems(noCopy.root).join('\n'), /must match the current art-direction-v3 projection exactly/);
  assert.match(stageArtifactProblems(noCopy.root, 'art-direction', noCopy.invocation).join('\n'), /must match the current art-direction-v3 projection exactly/);
  assert.deepEqual(snapshot(noCopy.root), before);

  const selectedCopy = fixture(t);
  await publishSelectedDirection(selectedCopy);
  assert.equal(existsSync(join(selectedCopy.root, '.omd/copy-deck.md')), false);
  before = snapshot(selectedCopy.root);
  assert.match(selectedDirectionCopyClosureProblems(selectedCopy.root).join('\n'), /copy-deck\.md/);
  assert.match(stageArtifactProblems(selectedCopy.root, 'art-direction', selectedCopy.invocation).join('\n'), /copy-deck\.md/);
  assert.deepEqual(snapshot(selectedCopy.root), before);
});
