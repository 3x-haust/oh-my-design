import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  FUNCTIONAL_REQUIREMENTS_V2_SCHEMA,
  parseFunctionalRequirements,
} from '../core/completeness/index.ts';
import {
  checkCompletenessRun,
  publishCompletenessRun,
  publishTypographyApplicability,
  renderedIrEvidenceBytes,
  WORKFLOW_COMPLETENESS_RUN_INPUT_SCHEMA,
  WORKFLOW_COMPLETENESS_RUN_SCHEMA,
  type CompletenessRunInput,
} from '../core/completion/evidence.ts';
import {
  checkCompletionPublicationPrerequisites,
  checkTerminalCompletion,
} from '../core/completion/preflight.ts';
import { observationV2Sha256, writeObservationV2 } from '../core/runtime/observation.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { servedProjectTreeSha256 } from '../core/render/serve.ts';
import { writeSourceSeal } from '../core/source-seal/index.ts';
import { checkAdaptiveWorkflow, publishAdaptiveWorkflowPlan } from '../core/design-development/workflow-persistence.ts';
import {
  authorizeTestProjectRunPayloads,
  createTestProjectWriteAdapter,
  publishTestAdaptiveRoute,
} from './helpers/project-write.ts';
import {
  browserFixturePng,
  writeBrowserDecisionFixture,
} from './helpers/browser-observation-decision-links.ts';

const CLI = new URL('../bin/omd.ts', import.meta.url);
const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
function measuredApplicability(
  root: string,
  invocation: Parameters<typeof publishTypographyApplicability>[2],
  renderedIr: unknown,
) {
  authorizeTestProjectRunPayloads(root, invocation, [{
    purpose: 'product-probe-result',
    payload: renderedIrEvidenceBytes(renderedIr),
  }]);
  return publishTypographyApplicability(root, renderedIr, invocation);
}
const routeFixture = (selectedTypography = false): unknown => {
  const value = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  if (!selectedTypography) return value;
  const strategy = value.strategyDecision as { roles: string[]; stages: string[]; executionWaves: object[]; skips: Array<{ id: string }> };
  strategy.roles.splice(1, 0, 'omd-typesetter');
  strategy.stages.splice(1, 0, 'type-proof');
  strategy.executionWaves.splice(1, 0, { id: 'type', mode: 'concurrent', roles: ['omd-typesetter'] });
  strategy.skips = strategy.skips.filter((item) => item.id !== 'type-proof');
  return value;
};
const receipt = (root: string, path: string, schema: string) => ({ path, schema, sha256: sha256(readFileSync(join(root, path))) });
const requirementsV1 = {
  schema: 'functional-requirements-v1',
  requirements: [{ id: 'R-1', kind: 'action', statement: 'Open the repository', label: 'Open' }],
} as const;
const requirementsV2 = {
  schema: FUNCTIONAL_REQUIREMENTS_V2_SCHEMA,
  requirements: [{ id: 'R-1', kind: 'action', statement: 'Open the repository', label: 'Open' }],
  evidence: {
    states: ['ready'],
    viewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }],
  },
} as const;

test('legacy functional-requirements-v1 stays readable while v2 has a distinct strict shape', () => {
  assert.equal(parseFunctionalRequirements(requirementsV1).schema, 'functional-requirements-v1');
  assert.equal(parseFunctionalRequirements(requirementsV2).schema, 'functional-requirements-v2');
  assert.throws(
    () => parseFunctionalRequirements({ ...requirementsV2, evidence: { states: [], viewports: requirementsV2.evidence.viewports } }),
    /at least one evidence state/,
  );
  assert.throws(
    () => parseFunctionalRequirements({ ...requirementsV2, extra: true }),
    /exactly evidence, requirements, schema/,
  );
  const inherited = Object.create(requirementsV2) as object;
  assert.throws(() => parseFunctionalRequirements(inherited), /must not inherit input properties/);
  const accessor = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(accessor, 'schema', { enumerable: true, get: () => FUNCTIONAL_REQUIREMENTS_V2_SCHEMA });
  Object.defineProperty(accessor, 'requirements', { enumerable: true, value: requirementsV2.requirements });
  Object.defineProperty(accessor, 'evidence', { enumerable: true, value: requirementsV2.evidence });
  assert.throws(() => parseFunctionalRequirements(accessor), /own data properties/);
  const sparseStates = Array(2); sparseStates[0] = 'ready';
  assert.throws(
    () => parseFunctionalRequirements({ ...requirementsV2, evidence: { ...requirementsV2.evidence, states: sparseStates } }),
    /dense and undecorated/,
  );
});

test('CLI persists v2 under its distinct schema and exposes the terminal preflight command', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-completion-cli-'));
  try {
    const input = join(root, 'requirements.json');
    writeFileSync(input, JSON.stringify(requirementsV2));
    const set = spawnSync(process.execPath, [CLI.pathname, 'complete', 'set', '--input', input, '--json'], { cwd: root, encoding: 'utf8' });
    assert.equal(set.status, 0, set.stderr);
    assert.equal(JSON.parse(readFileSync(join(root, '.omd', 'functional-requirements.json'), 'utf8')).schema, FUNCTIONAL_REQUIREMENTS_V2_SCHEMA);
    const preflight = spawnSync(process.execPath, [CLI.pathname, 'completion', 'preflight'], { cwd: root, encoding: 'utf8' });
    assert.equal(preflight.status, 1);
    assert.match(preflight.stderr, /usage: omd completion preflight/);
    const applicability = spawnSync(process.execPath, [CLI.pathname, 'completion', 'typography-applicability'], { cwd: root, encoding: 'utf8' });
    assert.equal(applicability.status, 1);
    assert.match(applicability.stderr, /usage: omd completion typography-applicability/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

type Prepared = Readonly<{
  root: string;
  invocation: ReturnType<typeof publishTestAdaptiveRoute>;
  input: CompletenessRunInput;
  graph: Readonly<Record<string, unknown>>;
}>;

function prepare(selectedTypography = false, koreanText: 'body' | 'display' = 'body', includeAffordance = true): Prepared {
  const root = mkdtempSync(join(tmpdir(), 'omd-completion-regression-'));
  mkdirSync(join(root, '.omd', 'receipts'), { recursive: true });
  mkdirSync(join(root, 'src', 'copy'), { recursive: true });
  writeFileSync(join(root, 'src', 'copy', 'index.html'), '<a href="/repo">Open</a>\n');
  writeFileSync(join(root, '.omd', 'copy-deck.md'), '# Copy\n');
  if (selectedTypography) {
    const revisionSha256 = servedProjectTreeSha256(root, 'src/copy/index.html');
    writeFileSync(
      join(root, '.omd', 'type-proof.md'),
      `# Approved typography proof\n\n## Production revision binding\n- Production entry: \`src/copy/index.html\`\n- Production revision SHA-256: \`${revisionSha256}\`\n`,
    );
  }
  const invocation = publishTestAdaptiveRoute(root, routeFixture(selectedTypography), 'completion-regression');
  writeFileSync(join(root, '.omd', 'functional-requirements.json'), `${JSON.stringify(requirementsV2, null, 2)}\n`);
  const buildPath = '.omd/receipts/build.json';
  writeFileSync(join(root, buildPath), `${canonicalJson({
    schemaVersion: 'omd-build-identity-v1',
    packageVersion: '1.0.0',
    buildSha256: invocation.current.buildSha256,
    sourceSkillSha256: invocation.current.loadedSkillSha256,
  })}\n`);
  writeSourceSeal(root, invocation);
  const typographyApplicability = measuredApplicability(root, invocation, {
    meta: { source: 'dom', url: 'file://fixture/', viewportHeight: 844 },
    nodes: [{
      id: 'copy',
      name: 'p',
      type: 'TEXT',
      path: 'body > p',
      parent: null,
      box: { x: 0, y: 0, w: 320, h: 48 },
      children: [],
      text: koreanText === 'display' ? '완성된 제목' : '완성된 본문',
      ...(koreanText === 'display' ? { displayText: true } : {}),
    }, ...(includeAffordance ? [{
      id: 'open',
      name: 'a',
      type: 'TEXT' as const,
      path: 'body > a',
      parent: null,
      box: { x: 0, y: 48, w: 100, h: 24 },
      children: [],
      text: 'Open',
      interactive: true,
      focusable: true,
    }] : [])],
  });

  const browser = writeBrowserDecisionFixture(root);
  const observations = [
    { state: 'ready', width: 1280, height: 900, name: 'desktop' },
    { state: 'ready', width: 390, height: 844, name: 'mobile' },
  ].map(({ state, width, height, name }) => {
    const capturePath = `.omd/${name}.png`;
    const capture = browserFixturePng(width, height);
    writeFileSync(join(root, capturePath), capture);
    const build = receipt(root, buildPath, 'omd-build-identity-v1');
    const value = writeObservationV2(root, {
      currentArtifact: { path: build.path, sha256: build.sha256 },
      buildSha256: invocation.current.buildSha256,
      observedAt: `2026-08-12T01:0${name === 'desktop' ? '0' : '1'}:00.000Z`,
      evidence: browser.evidence([{
        path: capturePath,
        sha256: sha256(capture),
        viewport: { width, height },
        testedState: state,
      }]),
    }, createTestProjectWriteAdapter(root, invocation));
    const digest = observationV2Sha256(value);
    return receipt(root, `.omd/observation-v2/sha256-${digest}.json`, 'observation-v2');
  });
  const input: CompletenessRunInput = {
    schema: 'functional-completeness-run-input-v2',
    requirements: receipt(root, '.omd/functional-requirements.json', FUNCTIONAL_REQUIREMENTS_V2_SCHEMA),
    buildIdentity: receipt(root, buildPath, 'omd-build-identity-v1'),
    sourceSeal: receipt(root, '.omd/source-seal.json', 'source-seal-v1'),
    typographyApplicability,
    testedUrl: 'file://fixture/',
    testedState: 'ready',
    viewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }],
    observations,
    findings: [],
  };
  return {
    root,
    invocation,
    input,
    graph: { buildIdentity: input.buildIdentity, sourceSeal: input.sourceSeal, observations },
  };
}

test('a persisted v1 requirements document publishes evidence without migration or byte changes', () => {
  const value = prepare();
  try {
    const path = join(value.root, '.omd', 'functional-requirements.json');
    writeFileSync(path, `${JSON.stringify(requirementsV1, null, 2)}\n`);
    const before = readFileSync(path);
    const typographyApplicability = measuredApplicability(value.root, value.invocation, {
      meta: { source: 'dom', url: 'file://fixture/' },
      nodes: [{ id: 'open', name: 'a', type: 'TEXT', path: 'body > a', parent: null, box: { x: 0, y: 0, w: 100, h: 24 }, children: [], text: 'Open', interactive: true, focusable: true }],
    });
    const input = { ...value.input, requirements: receipt(value.root, '.omd/functional-requirements.json', 'functional-requirements-v1'), typographyApplicability };
    publishCompletenessRun(value.root, input, value.invocation);
    assert.equal(checkCompletenessRun(value.root, value.invocation).requirements.schema, 'functional-requirements-v1');
    assert.deepEqual(readFileSync(path), before);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('computed completeness rejects rendered IR without exact host authorization', () => {
  const value = prepare();
  try {
    assert.throws(
      () => publishTypographyApplicability(value.root, {
        meta: { source: 'dom', url: 'file://fixture/' },
        nodes: [{
          id: 'copy',
          name: 'p',
          type: 'TEXT',
          path: 'body > p',
          parent: null,
          box: { x: 0, y: 0, w: 320, h: 48 },
          children: [],
          text: 'Approved copy',
        }],
      }, value.invocation),
      /does not authorize the exact product-probe-result payload/,
    );
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('publishes an immutable content-addressed zero-finding run and guarded current pointer', () => {
  const value = prepare();
  try {
    const before = readFileSync(join(value.root, '.omd', 'functional-requirements.json'));
    const path = publishCompletenessRun(value.root, value.input, value.invocation);
    const checked = checkCompletenessRun(value.root, value.invocation);
    assert.equal(checked.findings.length, 0);
    assert.equal(checked.build.buildSha256, value.invocation.current.buildSha256);
    assert.deepEqual(checked.viewports, value.input.viewports);
    assert.match(path, /completeness-runs\/sha256-[a-f0-9]{64}\.json$/);
    assert.deepEqual(readFileSync(join(value.root, '.omd', 'functional-requirements.json')), before, 'publication never migrates legacy/current requirement bytes');
    assert.equal(readdirSync(join(value.root, '.omd', 'completeness-runs')).length, 1);

    publishCompletenessRun(value.root, value.input, value.invocation);
    assert.equal(readdirSync(join(value.root, '.omd', 'completeness-runs')).length, 1, 'identical publication is idempotent');

    writeFileSync(join(value.root, '.omd', 'functional-requirements.json'), `${JSON.stringify(requirementsV1)}\n`);
    assert.throws(() => checkCompletenessRun(value.root, value.invocation), /requirements bytes changed/);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('computed IR findings reject a caller-supplied empty findings array for a missing affordance', () => {
  const value = prepare(false, 'body', false);
  try {
    assert.deepEqual(value.input.findings, []);
    assert.throws(
      () => publishCompletenessRun(value.root, value.input, value.invocation),
      /measured functional completeness has findings: FUNC-MISSING R-1/,
    );
    assert.equal(existsSync(join(value.root, '.omd', 'completeness-current.json')), false);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('rejects findings, incomplete viewport evidence, and a forged current pointer before acceptance', () => {
  const value = prepare();
  try {
    assert.throws(
      () => publishCompletenessRun(value.root, { ...value.input, findings: [{ id: 'FUNC-MISSING', requirement: 'R-1', message: 'missing' }] }, value.invocation),
      /zero findings/,
    );
    const accessorInput = { ...value.input } as Record<string, unknown>;
    Object.defineProperty(accessorInput, 'findings', { enumerable: true, get: () => [] });
    assert.throws(
      () => publishCompletenessRun(value.root, accessorInput, value.invocation),
      /own data properties/,
    );
    assert.equal(existsSync(join(value.root, '.omd', 'completeness-current.json')), false);
    assert.throws(
      () => publishCompletenessRun(value.root, { ...value.input, observations: value.input.observations.slice(0, 1) }, value.invocation),
      /viewports do not match/,
    );

    publishCompletenessRun(value.root, value.input, value.invocation);
    writeFileSync(join(value.root, '.omd', 'completeness-current.json'), JSON.stringify({
      schema: 'functional-completeness-current-v1',
      record: `completeness-runs/sha256-${'0'.repeat(64)}.json`,
      sha256: '0'.repeat(64),
    }));
    assert.throws(() => checkCompletenessRun(value.root, value.invocation), /current pointer|could not be read/);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('historical completeness-run-v1 records remain readable without typography migration', () => {
  const value = prepare();
  try {
    publishCompletenessRun(value.root, value.input, value.invocation);
    const currentPath = join(value.root, '.omd', 'completeness-current.json');
    const current = JSON.parse(readFileSync(currentPath, 'utf8')) as { record: string };
    const published = JSON.parse(readFileSync(join(value.root, '.omd', current.record), 'utf8')) as Record<string, unknown>;
    delete published.typographyApplicability;
    published.schema = 'functional-completeness-run-v1';
    const bytes = `${canonicalJson(published)}\n`;
    const digest = sha256(bytes);
    const record = `completeness-runs/sha256-${digest}.json`;
    writeFileSync(join(value.root, '.omd', record), bytes);
    writeFileSync(currentPath, `${canonicalJson({ schema: 'functional-completeness-current-v1', record, sha256: digest })}\n`);

    const checked = checkCompletenessRun(value.root, value.invocation);
    assert.equal(checked.schema, 'functional-completeness-run-v1');
    assert.equal(checked.typographyApplicability, undefined);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('historical v2 runs retain read compatibility with v1 typography applicability', () => {
  const value = prepare();
  try {
    publishCompletenessRun(value.root, value.input, value.invocation);
    const currentPath = join(value.root, '.omd', 'completeness-current.json');
    const current = JSON.parse(readFileSync(currentPath, 'utf8')) as { record: string };
    const runPath = join(value.root, '.omd', current.record);
    const run = JSON.parse(readFileSync(runPath, 'utf8')) as Record<string, unknown>;
    const measuredReceipt = run.typographyApplicability as { path: string };
    const historical = JSON.parse(readFileSync(join(value.root, measuredReceipt.path), 'utf8')) as Record<string, unknown>;
    historical.schema = 'typography-applicability-v1';
    delete historical.requirementsSha256;
    delete historical.functionalFindings;
    const applicabilityBytes = `${canonicalJson(historical)}\n`;
    const applicabilitySha256 = sha256(applicabilityBytes);
    const applicabilityPath = `.omd/typography-applicability/sha256-${applicabilitySha256}.json`;
    writeFileSync(join(value.root, applicabilityPath), applicabilityBytes);
    run.typographyApplicability = { path: applicabilityPath, schema: 'typography-applicability-v1', sha256: applicabilitySha256 };
    const runBytes = `${canonicalJson(run)}\n`;
    const runSha256 = sha256(runBytes);
    const record = `completeness-runs/sha256-${runSha256}.json`;
    writeFileSync(join(value.root, '.omd', record), runBytes);
    writeFileSync(currentPath, `${canonicalJson({ schema: 'functional-completeness-current-v1', record, sha256: runSha256 })}\n`);

    const checked = checkCompletenessRun(value.root, value.invocation);
    assert.equal(checked.schema, 'functional-completeness-run-v2');
    assert.equal(checked.typographyApplicability?.schema, 'typography-applicability-v1');
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('current completeness and final review may use distinct observation sets', () => {
  const value = prepare();
  try {
    publishCompletenessRun(value.root, value.input, value.invocation);
    const checked = checkCompletionPublicationPrerequisites(value.root, { graph: value.graph }, value.invocation);
    assert.equal(checked.typography.status, 'skipped');
    assert.equal(checked.typography.id, 'type-proof');
    assert.equal(checked.typography.applicability.koreanDisplayText, false);

    const observations = value.input.observations.slice(0, 1);
    const distinct = checkCompletionPublicationPrerequisites(
      value.root,
      { graph: { ...value.graph, observations } },
      value.invocation,
    );
    assert.ok(distinct.completeness);
    assert.equal(distinct.completeness.observations.length, value.input.observations.length);
    rmSync(join(value.root, '.omd', 'route-authorities'), { recursive: true, force: true });
    assert.throws(
      () => checkCompletionPublicationPrerequisites(value.root, { graph: value.graph }, value.invocation),
      /ROUTE_AUTHORITY_REQUIRED|source seal is stale/,
    );
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('typography applicability is immutable and exact-byte checked', () => {
  const value = prepare();
  try {
    publishCompletenessRun(value.root, value.input, value.invocation);
    writeFileSync(join(value.root, value.input.typographyApplicability.path), '{}\n');
    assert.throws(
      () => checkCompletionPublicationPrerequisites(value.root, { graph: value.graph }, value.invocation),
      /typography applicability bytes changed/,
    );
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('rendered Korean display text rejects a route-authorized type-proof omission', () => {
  const value = prepare(false, 'display');
  try {
    publishCompletenessRun(value.root, value.input, value.invocation);
    assert.throws(
      () => checkCompletionPublicationPrerequisites(value.root, { graph: value.graph }, value.invocation),
      /Korean display text.*type proof/i,
    );
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('selected typography must retain the exact source-sealed proof for rendered Korean display text', () => {
  const value = prepare(true, 'display');
  try {
    publishCompletenessRun(value.root, value.input, value.invocation);
    const selected = checkCompletionPublicationPrerequisites(value.root, { graph: value.graph }, value.invocation);
    assert.equal(selected.typography.status, 'selected');
    assert.deepEqual(selected.typography, {
      id: 'type-proof',
      status: 'selected',
      path: '.omd/type-proof.md',
      sha256: sha256(readFileSync(join(value.root, '.omd', 'type-proof.md'))),
      applicability: {
        schema: 'typography-applicability-v2',
        renderedIrSha256: selected.typography.applicability.renderedIrSha256,
        buildSha256: value.invocation.current.buildSha256,
        sourceSkillSha256: value.invocation.current.loadedSkillSha256,
        testedUrl: 'file://fixture/',
        koreanDisplayText: true,
        requirementsSha256: value.input.requirements.sha256,
        functionalFindings: [],
      },
    });
    rmSync(join(value.root, '.omd', 'type-proof.md'));
    assert.throws(() => checkCompletionPublicationPrerequisites(value.root, { graph: value.graph }, value.invocation), /type-proof|typography|approved input|source seal is stale/);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('workflow completion uses additive v3 receipts while v1 and v2 persisted runs remain unchanged', () => {
  const value = prepare();
  try {
    publishAdaptiveWorkflowPlan(value.root, {
      development: { schema: 'design-development-contract-v1', owner: 'user-selected-model', mode: 'direct', risks: [], investigations: [], referencePrinciples: [], rationale: 'No material uncertainty remains.' },
      evidence: [], investigations: [], rationale: 'Proceed directly.',
    }, createTestProjectWriteAdapter(value.root, value.invocation), value.invocation);
    writeSourceSeal(value.root, value.invocation);
    const sourceSeal = receipt(value.root, '.omd/source-seal.json', 'source-seal-v2');
    const input = { ...value.input, schema: WORKFLOW_COMPLETENESS_RUN_INPUT_SCHEMA, sourceSeal };
    publishCompletenessRun(value.root, input, value.invocation);
    assert.equal(checkCompletenessRun(value.root, value.invocation).schema, WORKFLOW_COMPLETENESS_RUN_SCHEMA);
    const graph = {
      schema: 'final-evidence-v2-workflow-graph-v1', productionSchema: 'final-evidence-v2-adaptive-omission-graph',
      buildIdentity: input.buildIdentity, sourceSeal, observations: input.observations,
      workflow: checkAdaptiveWorkflow(value.root, value.invocation).binding,
    };
    assert.equal(checkCompletionPublicationPrerequisites(value.root, { graph }, value.invocation).typography.status, 'skipped');
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('terminal preflight is read-only and rejects a missing final pointer', () => {
  const value = prepare();
  try {
    publishCompletenessRun(value.root, value.input, value.invocation);
    const before = readdirSync(join(value.root, '.omd'), { recursive: true }).map(String).sort();
    assert.throws(() => checkTerminalCompletion(value.root, value.invocation), /final-evidence-v2/);
    const after = readdirSync(join(value.root, '.omd'), { recursive: true }).map(String).sort();
    assert.deepEqual(after, before);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});
