import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// These tests lock the Phase-0..3 advisory modules into the `omd` CLI surface: text-slop,
// visual-richness, asset, interaction, and eval. Every one is advisory and MUST exit 0 on a
// real evaluation (usage errors are the only non-zero path). None of them may gate the loop.

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const run = (args: string[], cwd?: string) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...(cwd ? { cwd } : {}) });
const project = (): string => mkdtempSync(join(tmpdir(), 'omd-cli-wiring-'));

function writeFile(dir: string, rel: string, content: string): string {
  const path = join(dir, rel);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
  return path;
}

// ── text-slop ──────────────────────────────────────────────────────────────

test('text-slop flags AI-cliche phrases and stays advisory (exit 0)', () => {
  const dir = project();
  const file = writeFile(dir, 'copy.md', 'We unlock the power of a fast-paced world to revolutionize your day.');
  const result = run(['text-slop', file, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as { candidates: Array<{ candidateId: string; gating: boolean }> };
  assert.ok(parsed.candidates.length >= 2, result.stdout);
  assert.ok(parsed.candidates.every((c) => c.gating === false), 'every text-slop candidate is non-gating');
  assert.ok(parsed.candidates.some((c) => c.candidateId === 'unlock-the-power'));
});

test('text-slop on clean copy reports zero candidates and still exits 0', () => {
  const dir = project();
  const file = writeFile(dir, 'copy.md', 'The dashboard shows deploy status for each service in one view.');
  const result = run(['text-slop', file]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /candidates: 0/);
  assert.match(result.stdout, /advisory only/);
});

test('text-slop does not match phrases inside fenced code', () => {
  const dir = project();
  const file = writeFile(dir, 'copy.md', '```\nunlock the power\n```\nPlain copy without cliches.');
  const result = run(['text-slop', file, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as { candidates: unknown[] };
  assert.equal(parsed.candidates.length, 0, result.stdout);
});

// ── visual-richness ─────────────────────────────────────────────────────────

const COMPOSITION = [
  '## Focal hierarchy',
  '',
  'One dominant anchor with a value/proof/CTA relationship.',
  '',
  '## Media roles',
  '',
  'No carrier named here yet.',
].join('\n');

test('visual-richness surfaces carrier advisories for a confident register (exit 0)', () => {
  const dir = project();
  const file = writeFile(dir, 'composition.md', COMPOSITION);
  const result = run(['visual-richness', file, '--register', 'confident', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as { findings: Array<{ id: string; severity: string }> };
  assert.ok(parsed.findings.length >= 1, result.stdout);
  assert.ok(parsed.findings.every((f) => f.id === 'CARRIER-ADVISORY' && f.severity === 'advisory'));
});

test('visual-richness quiet register yields no findings (register-aware, never gates)', () => {
  const dir = project();
  const file = writeFile(dir, 'composition.md', COMPOSITION);
  const result = run(['visual-richness', file, '--register', 'quiet', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as { findings: unknown[] };
  assert.equal(parsed.findings.length, 0, result.stdout);
});

// ── art-direction alternatives-sha ──────────────────────────────────────────

// The local art-direction lane binds perspectives, the moderator receipt, and the evaluator
// result to one canonical alternatives digest. The CLI owns that digest so no coordinator has to
// reimplement canonical JSON in shell; a mismatch there costs a whole deliberation round.

const ALTERNATIVES = [
  { register: 'quiet', conceptRole: 'Calm evidence dossier' },
  { register: 'confident', conceptRole: 'Evidence signal field' },
  { register: 'showpiece', conceptRole: 'Evidence theatre' },
];

test('art-direction alternatives-sha emits the canonical digest the local check binds', async () => {
  const { canonicalJson, sha256 } = await import('../core/ref/board-artifacts.ts');
  const dir = project();
  const file = writeFile(dir, 'alternatives.json', JSON.stringify(ALTERNATIVES));
  const result = run(['art-direction', 'alternatives-sha', '--input', file, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as { alternativesSha256: string };
  assert.equal(parsed.alternativesSha256, sha256(canonicalJson(ALTERNATIVES)));
});

test('art-direction alternatives-sha accepts a decision-check payload and rejects a shapeless one', () => {
  const dir = project();
  const decisionCheck = writeFile(dir, 'decision-check.json', JSON.stringify({ route: '/', alternatives: ALTERNATIVES }));
  const bare = run(['art-direction', 'alternatives-sha', '--input', writeFile(dir, 'bare.json', JSON.stringify(ALTERNATIVES)), '--json']);
  const wrapped = run(['art-direction', 'alternatives-sha', '--input', decisionCheck, '--json']);
  assert.equal(wrapped.status, 0, wrapped.stderr);
  assert.equal(JSON.parse(wrapped.stdout).alternativesSha256, JSON.parse(bare.stdout).alternativesSha256);
  const invalid = run(['art-direction', 'alternatives-sha', '--input', writeFile(dir, 'invalid.json', '{"route":"/"}'), '--json']);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /ART_DIRECTION_ALTERNATIVES_INVALID/);
});

// ── schema / stage / check-input ────────────────────────────────────────────

// Every skeleton the CLI prints must stay the exact key set its validator enforces; a drifted
// skeleton is worse than none, because the coordinator trusts it and loses a stage to the gate.

test('printed input skeletons carry exactly the keys their validators accept', async () => {
  const { INPUT_SKELETONS, inputSkeleton } = await import('../core/schema/inputs.ts');
  const { DEPTH_INPUT_KEYS } = await import('../core/deliberation/depth.ts');
  const { ART_DIRECTION_CHECK_INPUT_KEYS } = await import('../core/art-direction/schema.ts');
  const { parseTaskFlowBenchmark } = await import('../core/ref/task-flow-benchmark.ts');

  const depth = inputSkeleton('depth-input');
  assert.deepEqual(Object.keys(depth.skeleton as object).sort(), [...DEPTH_INPUT_KEYS].sort());
  const check = inputSkeleton('art-direction-check');
  const authored = Object.keys(check.skeleton as object);
  assert.ok(authored.every((key) => (ART_DIRECTION_CHECK_INPUT_KEYS as readonly string[]).includes(key)), authored.join(','));
  assert.ok(!authored.includes('invocation'), 'the local lane never authors an invocation');
  const directionHelp = check.constraints?.join(' ') ?? '';
  assert.match(directionHelp, /complete evaluator-owned evidence/);
  assert.match(directionHelp, /source-free inputs and exact lineage before it judges/);
  assert.match(directionHelp, /exactly one assessment per unique alternative register/);
  assert.match(directionHelp, /highest numeric score, with ascending register-name tie-break/);
  assert.match(directionHelp, /do not use a raw file digest/);
  assert.match(directionHelp, /both approvedMotionRecipe and approvedMotionRecipeReceipt/);
  assert.match(directionHelp, /exact receipt-bound evaluatorAssessment and evaluatorResult payload serialization/);
  assert.match(directionHelp, /not permission to reconstruct unseen judgments/);
  assert.equal(INPUT_SKELETONS.length, 18);
  const lifecycle = inputSkeleton('trusted-lifecycle-manifest');
  assert.deepEqual(
    Object.keys(lifecycle.skeleton as object).sort(),
    ['entryPath', 'entrySurface', 'schema', 'scripts'],
  );

  const locale = inputSkeleton('locale-contract');
  const { LOCALE_CONTRACT_KEYS } = await import('../core/locale/contract.ts');
  assert.deepEqual(Object.keys(locale.skeleton as object).sort(), [...LOCALE_CONTRACT_KEYS].sort());
  const localeDesign = inputSkeleton('locale-design-context');
  const { LOCALE_DESIGN_CONTEXT_KEYS } = await import('../core/locale/design-context.ts');
  assert.deepEqual(Object.keys(localeDesign.skeleton as object), [...LOCALE_DESIGN_CONTEXT_KEYS]);
  const culturalProfile = inputSkeleton('cultural-design-profile');
  const { CULTURAL_DESIGN_PROFILE_KEYS } = await import('../core/locale/cultural-profile.ts');
  assert.deepEqual(Object.keys(culturalProfile.skeleton as object), [...CULTURAL_DESIGN_PROFILE_KEYS]);
  const functional = inputSkeleton('functional-requirements');
  assert.deepEqual(Object.keys(functional.skeleton as object).sort(), ['requirements', 'schema']);
  const reality = inputSkeleton('reality-ledger');
  assert.deepEqual(Object.keys(reality.skeleton as object).sort(), ['facts', 'mode', 'schema']);
  const board = inputSkeleton('reference-board');
  assert.deepEqual(Object.keys(board.skeleton as object), ['candidates']);
  const boardCandidates = (board.skeleton as { candidates: { pieces: { grid: object; binding: object }[] }[] }).candidates;
  assert.equal(boardCandidates.length, 2);
  assert.deepEqual(Object.keys(boardCandidates[0]!.pieces[0]!.grid), ['column', 'span', 'order']);
  assert.match(board.constraints?.join('\n') ?? '', /grid\.column is 1\.\.12[\s\S]*unique non-negative integer/);
  assert.deepEqual(Object.keys(boardCandidates[0]!.pieces[0]!.binding), ['zoneId', 'decisionId', 'axis', 'sourceState', 'sourceViewport', 'targetViewports', 'responsiveConsequence', 'conflictGroup', 'conflictResolution', 'falsifier']);
  const localeBinding = inputSkeleton('reference-locale-binding');
  assert.deepEqual(Object.keys(localeBinding.skeleton as object), ['bindings']);
  assert.deepEqual(
    Object.keys((localeBinding.skeleton as { bindings: object[] }).bindings[0]!),
    ['candidateId', 'slotId', 'localeDecisionId'],
  );
  const acquisition = inputSkeleton('acquisition-plan');
  assert.deepEqual(Object.keys(acquisition.skeleton as object), ['schema', 'owner', 'localeContextSha256', 'zones']);
  const benchmark = inputSkeleton('task-flow-benchmark');
  assert.deepEqual(Object.keys(benchmark.skeleton as object), [
    'schema', 'surface', 'domain', 'sourceContractSha256', 'sources', 'taskSteps', 'counterexamples',
  ]);
  assert.doesNotThrow(() => parseTaskFlowBenchmark(benchmark.skeleton));
  const entrySurface = inputSkeleton('entry-surface-contract');
  assert.deepEqual(Object.keys(entrySurface.skeleton as object), [
    'schema', 'entryPath', 'prerequisiteTaskId', 'dependentTaskId', 'purposeText',
    'workObjectAnchorText', 'nextActionName', 'beforeText', 'afterText', 'outcomeWitnesses',
  ]);
  assert.doesNotMatch(JSON.stringify(entrySurface.skeleton), /selector/i);

  const dir = project();
  const printed = run(['schema', 'depth-input', '--json'], dir);
  assert.equal(printed.status, 0, printed.stderr);
  assert.deepEqual(JSON.parse(printed.stdout).skeleton, depth.skeleton);
  const printedBoard = run(['schema', 'reference-board'], dir);
  assert.equal(printedBoard.status, 0, printedBoard.stderr);
  assert.match(printedBoard.stdout, /every piece grid contains exactly column, span, order/);
  assert.match(printedBoard.stdout, /"grid": \{\s+"column": 1,\s+"span": 12,\s+"order": 0/s);
  const listed = run(['schema', 'list', '--json'], dir);
  assert.deepEqual(JSON.parse(listed.stdout).map((entry: { name: string }) => entry.name), ['route-input', 'reality-ledger', 'domain-brief', 'depth-input', 'content-grain', 'acquisition-plan', 'reference-board', 'reference-capture-preparation', 'reference-locale-binding', 'task-flow-benchmark', 'art-direction-check', 'locale-contract', 'locale-design-context', 'cultural-design-profile', 'functional-requirements', 'decision-graph', 'entry-surface-contract', 'trusted-lifecycle-manifest']);
});

test('reality-ledger schema exposes its closed category vocabulary', async () => {
  const { inputSkeleton } = await import('../core/schema/inputs.ts');
  const reality = inputSkeleton('reality-ledger');
  const constraints = reality.constraints?.join('\n') ?? '';
  assert.match(
    constraints,
    /subject, brand, operation, person, metric, media, capability/,
  );
  assert.match(constraints, /supplied, verified, demo, unknown/);

  const printed = run(['schema', 'reality-ledger']);
  assert.equal(printed.status, 0, printed.stderr);
  assert.match(
    printed.stdout,
    /subject, brand, operation, person, metric, media, capability/,
  );
});

test('schema prints a source-bound Content Grain skeleton', () => {
  const dir = project();
  const printed = run(['schema', 'content-grain', '--json'], dir);
  assert.equal(printed.status, 0, printed.stderr);
  const parsed = JSON.parse(printed.stdout) as {
    name: string;
    path: string;
    skeleton: {
      schema: string;
      status: string;
      sources: Array<{ path: string; sha256: string }>;
      traits: unknown[];
      fixtures: unknown[];
    };
  };
  assert.equal(parsed.name, 'content-grain');
  assert.equal(parsed.path, '.omd/content-grain.json');
  assert.equal(parsed.skeleton.schema, 'content-grain-v1');
  assert.equal(parsed.skeleton.status, 'active');
  assert.equal(parsed.skeleton.sources[0]?.path, 'content/catalog.json');
  assert.match(parsed.skeleton.sources[0]?.sha256 ?? '', /^[a-f0-9]{64}$/);
  assert.equal(parsed.skeleton.traits.length, 1);
  assert.equal(parsed.skeleton.fixtures.length, 2);
});

test('the printed depth skeleton classifies and a shapeless input names every missing key', () => {
  const dir = project();
  const skeleton = JSON.parse(run(['schema', 'depth-input', '--json'], dir).stdout).skeleton;
  const good = writeFile(dir, 'depth.json', JSON.stringify(skeleton));
  const classified = run(['depth', 'classify', '--input', good, '--json'], dir);
  assert.equal(classified.status, 0, classified.stderr);
  assert.equal(JSON.parse(classified.stdout).level, 'L3');

  const bad = writeFile(dir, 'bad-depth.json', JSON.stringify({ schema: 'design-depth-input-v1', surface: 'marketing', costlyError: false, webgl: false }));
  const rejected = run(['depth', 'classify', '--input', bad, '--json'], dir);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /missing: scope, zoneCount/);
  assert.match(rejected.stderr, /unknown: surface/);
  assert.match(rejected.stderr, /omd schema depth-input/);
});

// Stage state itself is covered by test/stage-state.test.ts; this only locks the CLI surface.
test('stage status reports the derived run state through the CLI', () => {
  const dir = project();
  const empty = run(['stage', 'status', '--json'], dir);
  assert.equal(empty.status, 0, empty.stderr);
  assert.equal(JSON.parse(empty.stdout).current, 'domain');
  assert.deepEqual(JSON.parse(empty.stdout).completed, []);

  writeFile(dir, '.omd/domain-brief.json', '{}');
  writeFile(dir, '.omd/depth.json', '{}');
  const resumed = JSON.parse(run(['stage', 'status', '--json'], dir).stdout);
  assert.deepEqual(resumed.completed, ['domain', 'depth']);
  assert.equal(resumed.current, 'frame');
});

// The check payload's `references` array must equal this projection byte-for-byte. Settled
// disposition, rights, signal, and static/motion axes jointly decide positive lawful use.
test('canonical check references project rights and signal from the settled selection', async () => {
  const { canonicalArtDirectionReferences } = await import('../core/art-direction/decision.ts');
  const slot = (slotId: string, signal: string, rights: string) => ({
    slotId, signal, rights, staticAxis: 'available', motionAxis: 'absent',
    obligationDisposition: 'not-applicable', obligationReason: 'static-only reference',
  });
  const references = canonicalArtDirectionReferences({
    slots: [
      slot('hero', 'high-visual-system', 'lawful'),
      slot('avoid', 'anti-reference', 'lawful'),
      slot('unlicensed', 'supporting-component', 'restricted'),
    ],
  } as never);
  assert.deepEqual(references, [
    { slotId: 'hero', signal: 'high-visual-system', positive: false, lawful: true, motionObligation: 'none', staticAxis: 'available', motionAxis: 'absent', obligationDisposition: 'not-applicable' },
    { slotId: 'avoid', signal: 'anti-reference', positive: false, lawful: true, motionObligation: 'none', staticAxis: 'available', motionAxis: 'absent', obligationDisposition: 'not-applicable' },
    { slotId: 'unlicensed', signal: 'supporting-component', positive: false, lawful: false, motionObligation: 'none', staticAxis: 'available', motionAxis: 'absent', obligationDisposition: 'not-applicable' },
  ]);
});
// Role ② craft evidence is declared by the domain brief, not the acquisition plan, so a board can
// cover every zone and still have gathered only half the roles the protocol names.
test('declared craft queries with no measured craft record fail the board audit', () => {
  const dir = project();
  writeFile(dir, '.omd/domain-brief.json', JSON.stringify({
    schema: 'domain-brief-v1', request: 'r', domain: 'd', summary: 's',
    surfaces: [{ name: 'landing', purpose: 'p' }], coreObjects: ['o'], audience: 'a',
    referenceQueries: { component: ['nav'], craft: ['awwwards editorial motion'] }, researched: false,
  }));
  writeFile(dir, '.omd/refs/still.json', JSON.stringify({
    source: 'https://a.example', component: 'nav', kind: 'component', selector: '.nav',
    capturedAt: '2026-07-28T00:00:00.000Z', slot: 'nav', principles: [],
    invariants: { spacingLadder: [8], radiusLadder: [4], elevationLevels: 1, centeredRatio: 0, tokenCoverage: 1, paddingWeight: 8, typeScale: [16], fontFamilies: ['inter'], weightLadder: [400], motionDurations: [], easingVocab: [], animatedShare: 0, hoverCoverage: 0, focusCoverage: 0, animatedProperties: [], hasReducedMotion: false, scrollChoreography: [] },
  }));
  const blocked = run(['ref', 'granularity', '--json'], dir);
  assert.equal(blocked.status, 1);
  assert.ok(JSON.parse(blocked.stdout).findings.some((f: { id: string }) => f.id === 'REF-CRAFT-UNGATHERED'));
});
