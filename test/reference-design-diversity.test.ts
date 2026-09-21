import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { type TestContext } from 'node:test';
import { refIdentity } from '../core/ref/identity.ts';
import {
  parseReferenceResearch,
  validateReferenceResearch,
  REFERENCE_RESEARCH_SCHEMA,
} from '../core/ref/reference-research.ts';
import { ADMISSION_SOURCE_SHA, designAdmissionFixture } from './helpers/design-admission.ts';
import { testSearchReceipt } from './helpers/search-execution.ts';

const options = { expectedSourceContractSha256: ADMISSION_SOURCE_SHA, benchmarkRequired: false } as const;

function currentResearch(t: TestContext, secondChannel = 7) {
  const fixture = designAdmissionFixture(t);
  const source = fixture.capture('https://second-visual.example/task', 'workspace', 'design', secondChannel);
  const gallery = fixture.capture(
    'https://dribbble.com/shots/12345678-Task-workspace',
    'gallery-two',
    'design',
    8,
    [source.source],
  );
  fixture.research.designReference.sources.push({
    id: 'visual-two',
    url: source.source,
    observedAt: new Date().toISOString().slice(0, 10),
    decision: 'Workspace proportion',
    finding: 'A broad task region stays distinct from supporting evidence.',
    evidence: source.evidence,
    capture: source.capture,
    visualRole: 'visual-direction',
    visualAssessment: {
      composition: 'Broad work region with a narrow support rail',
      typography: 'Task title leads compact supporting labels',
      density: 'Spacious primary task with dense evidence rows',
      imagery: 'No decorative imagery competes with the task',
      transfer: 'Adapt the task-to-evidence proportion',
      avoid: 'Do not copy source branding or content',
    },
    discovery: {
      url: gallery.source,
      kind: 'app-gallery',
      access: 'free',
      qualityReason: 'The inspected task layout has useful desktop proportion and readable hierarchy.',
      evidence: gallery.evidence,
      capture: gallery.capture,
    },
  });
  const designQuery = fixture.research.designReference.queries[0];
  assert.ok(designQuery);
  fixture.research.designReference.searches = [testSearchReceipt(
    fixture.root,
    'design',
    designQuery,
    [fixture.gallery.source, gallery.source],
  )];
  const candidate = fixture.board.candidates[0];
  assert.ok(candidate);
  candidate.pieces.push({
    slotId: 'workspace',
    sourceKind: 'component-capture',
    referenceId: refIdentity(source.source, 'workspace'),
    targetComponent: 'Workspace',
    targetSelector: '#workspace',
    taskIds: ['T1'],
    reason: 'Use task-to-evidence proportion.',
    take: ['proportion'],
    avoid: 'Do not copy branding.',
    adaptation: 'Use local content and tokens.',
    evidenceAxes: {
      rights: 'lawful',
      signal: 'high-visual-system',
      staticAxis: 'available',
      motionAxis: 'absent',
    },
    grid: { column: 1, span: 12, order: 1 },
  });
  fixture.refreshBoard();
  const research = { ...fixture.research, schema: REFERENCE_RESEARCH_SCHEMA, marketCoverage: null };
  return { ...fixture, research, secondSource: source };
}

test('current research requires two independent visual-direction source families', t => {
  const fixture = currentResearch(t);
  const one = structuredClone(fixture.research);
  one.designReference.sources.splice(1);
  assert.throws(() => parseReferenceResearch(one), /DESIGN_SOURCE_COVERAGE/);

  const repeatedFamily = structuredClone(fixture.research);
  const repeatedSource = repeatedFamily.designReference.sources[1];
  assert.ok(repeatedSource);
  repeatedSource.url = 'https://visual.example/another-task';
  assert.throws(() => parseReferenceResearch(repeatedFamily), /DESIGN_SOURCE_DIVERSITY/);
});

test('current research refuses duplicate design pixels under different source records', t => {
  const fixture = currentResearch(t, 1);
  assert.throws(
    () => validateReferenceResearch(fixture.root, parseReferenceResearch(fixture.research), options),
    /DESIGN_EVIDENCE_DIVERSITY/,
  );
});

test('current research requires both visual directions to participate in the board', t => {
  const fixture = currentResearch(t);
  const candidate = fixture.board.candidates[0];
  assert.ok(candidate);
  candidate.pieces.splice(1);
  fixture.refreshBoard();
  assert.throws(
    () => validateReferenceResearch(fixture.root, parseReferenceResearch(fixture.research), options),
    /BOARD_DESIGN_DIVERSITY/,
  );
});

test('two independent visual directions with distinct pixels and board use pass', t => {
  const fixture = currentResearch(t);
  const parsed = parseReferenceResearch(fixture.research);
  assert.doesNotThrow(() => validateReferenceResearch(fixture.root, parsed, options));
  const firstSource = fixture.research.designReference.sources[0];
  assert.ok(firstSource);
  assert.notEqual(
    firstSource.evidence.sha256,
    fixture.secondSource.evidence.sha256,
  );
  assert.ok(readFileSync(fixture.boardPath).length > 0);
});
