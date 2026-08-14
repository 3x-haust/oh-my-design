import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import {
  checkAdaptiveWorkflowProductionSlice,
  checkAdaptiveWorkflowProductionReadiness,
  publishAdaptiveWorkflowPlan,
  publishAdaptiveWorkflowProductionReadiness,
  publishAdaptiveWorkflowProductionSlice,
} from '../core/design-development/workflow-persistence.ts';
import {
  ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_INPUT_SCHEMA,
  createWorkflowProductionSlice,
  workflowProductionSliceBytes,
} from '../core/design-development/production-slice.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { adaptiveRouteRecordSha256, readPersistedRoute } from '../core/route/index.ts';
import {
  ProductionRepairError,
  applyProductionRepair,
  productionRepairReviewBytes,
  recoverProductionRepair,
  stageProductionRepair,
  type ProductionRepairReview,
} from '../core/runtime/production-repair.ts';
import {
  authorizeTestProjectRunPayloads,
  createTestProjectWriteAdapter,
  publishTestAdaptiveRoute,
} from './helpers/project-write.ts';

const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const fixture = (): unknown => JSON.parse(readFileSync(new URL('./fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8'));
const productionPath = 'src/copy/index.html';
const contextPath = 'src/copy/context.html';

function publishObservation(root: string, observedAt = '2026-01-01T00:00:00.000Z'): Buffer {
  const observation = {
    schema: 'observation-v2', observedAt, buildSha256: 'b'.repeat(64),
    currentArtifact: { path: '.omd/build.json', sha256: 'c'.repeat(64) }, predecessorSha256: null, evidence: {},
  };
  const bytes = Buffer.from(`${canonicalJson(observation)}\n`);
  const sha256 = hash(bytes);
  const record = `.omd/observation-v2/sha256-${sha256}.json`;
  mkdirSync(join(root, dirname(record)), { recursive: true });
  writeFileSync(join(root, record), bytes);
  const pointer = Buffer.from(`${canonicalJson({ schema: 'observation-v2-pointer', record, sha256 })}\n`);
  writeFileSync(join(root, '.omd', 'observation-v2.json'), pointer);
  writeFileSync(join(root, '.omd', 'observation-v2-retention.json'), `${canonicalJson({
    schema: 'observation-v2-retention', currentArtifactSha256: 'c'.repeat(64), retained: [sha256],
  })}\n`);
  return pointer;
}

function publishSlice(value: ReturnType<typeof project>): void {
  const evidencePath = '.omd/workflow-evidence.json';
  writeFileSync(join(value.root, evidencePath), '{"risk":"component context"}\n');
  const evidenceSha256 = hash(readFileSync(join(value.root, evidencePath)));
  publishAdaptiveWorkflowPlan(value.root, {
    development: {
      schema: 'design-development-contract-v1', owner: 'user-selected-model', mode: 'investigate',
      risks: [{ id: 'risk:component', question: 'Does repair preserve context?', consequence: 'high', uncertainty: 'high', lateReversalCost: 'high' }],
      investigations: [{ id: 'probe:component', kind: 'component-in-context', riskIds: ['risk:component'], question: 'Does the repaired source work in context?', fidelity: { content: 'representative', visual: 'representative', interaction: 'interactive', behavior: 'representative', environment: 'responsive-browser' }, stopWhen: 'The source and context are explicit.' }],
      referencePrinciples: [], rationale: 'The repair is restricted to the authenticated production slice.',
    },
    evidence: [{ id: 'evidence:component', kind: 'component-impact', value: 'context-risk', source: { path: evidencePath, schema: 'workflow-evidence-v1', sha256: evidenceSha256, locator: '/risk' } }],
    investigations: [{ id: 'probe:component', evidenceIds: ['evidence:component'] }],
    rationale: 'Bind repair to the exact component and representative context sources.',
  }, value.writer, value.invocation);
  publishAdaptiveWorkflowProductionReadiness(value.root, {
    schema: 'adaptive-workflow-production-readiness-input-v1', artifacts: [], reviews: [],
  }, value.writer, value.invocation);
  const input = {
    schema: ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_INPUT_SCHEMA,
    slices: [{ investigationId: 'probe:component', component: { sourcePath: productionPath, selector: 'main', contractSha256: hash('contract') }, representativeContext: { sourcePath: contextPath, route: '/', selector: 'body' } }],
  };
  const current = checkAdaptiveWorkflowProductionReadiness(value.root, value.invocation);
  const slice = createWorkflowProductionSlice({
    route: current.plan.route,
    plan: current.planReceipt as { path: string; schema: 'adaptive-workflow-plan-v1'; sha256: string },
    readiness: current.readinessReceipt as { path: string; schema: 'adaptive-workflow-production-readiness-v1'; sha256: string },
    owner: { role: 'omd-hand', ...value.invocation.current }, slices: input.slices,
    readSource: (path) => readFileSync(join(value.root, path)),
  });
  authorizeTestProjectRunPayloads(value.root, value.invocation, [{ purpose: 'workflow-production-slice', payload: workflowProductionSliceBytes(slice) }]);
  publishAdaptiveWorkflowProductionSlice(value.root, input, value.writer, value.invocation);
}

function project(withSlice = true) {
  const root = mkdtempSync(join(tmpdir(), 'omd-trusted-repair-'));
  mkdirSync(join(root, 'src', 'copy'), { recursive: true });
  writeFileSync(join(root, productionPath), 'before');
  writeFileSync(join(root, contextPath), 'context');
  writeFileSync(join(root, 'foreign.html'), 'foreign');
  const invocation = publishTestAdaptiveRoute(root, fixture());
  const writer = createTestProjectWriteAdapter(root, invocation);
  const value = { root, invocation, writer };
  if (withSlice) publishSlice(value);
  publishObservation(root);
  return value;
}

function review(
  value: ReturnType<typeof project>,
  paths: readonly string[],
  mirrorRoot: string,
): ProductionRepairReview {
  const changedPath = [productionPath, contextPath].find((path) =>
    !readFileSync(join(value.root, path)).equals(readFileSync(join(mirrorRoot, path))))
    ?? productionPath;
  return authorizeReview(
    value,
    hash(readFileSync(join(value.root, changedPath))),
    hash(readFileSync(join(mirrorRoot, changedPath))),
    paths,
  );
}

function authorizeReview(
  value: ReturnType<typeof project>,
  beforeSha256: string,
  afterSha256: string,
  paths: readonly string[],
): ProductionRepairReview {
  const result: ProductionRepairReview = {
    schema: 'production-repair-review-v1',
    observationPointerSha256: hash(readFileSync(join(value.root, '.omd', 'observation-v2.json'))),
    retentionPointerSha256: existsSync(join(value.root, '.omd', 'observation-v2-retention.json'))
      ? hash(readFileSync(join(value.root, '.omd', 'observation-v2-retention.json')))
      : null,
    beforeSha256,
    afterSha256,
    suggestedPaths: paths,
    findingIds: ['review:finding-1'],
  };
  authorizeTestProjectRunPayloads(value.root, value.invocation, [{ purpose: 'final-reviewer-lane', payload: productionRepairReviewBytes(result) }]);
  return result;
}

function mirror(value: ReturnType<typeof project>, changes: Readonly<Record<string, string>> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'omd-repair-mirror-'));
  for (const path of [productionPath, contextPath]) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), changes[path] ?? readFileSync(join(value.root, path)));
    chmodSync(join(root, path), lstatSync(join(value.root, path)).mode & 0o777);
  }
  return root;
}

function staged(value: ReturnType<typeof project>, changes: Readonly<Record<string, string>>, paths = Object.keys(changes)) {
  const mirrorRoot = mirror(value, changes);
  const result = stageProductionRepair({
    root: value.root,
    invocation: value.invocation,
    review: review(value, paths, mirrorRoot),
    mirrorRoot,
  });
  return { result, mirrorRoot };
}

function interruptedJournal(
  value: ReturnType<typeof project>,
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  const observationPointer = readFileSync(join(value.root, '.omd', 'observation-v2.json'));
  const retentionPointer = readFileSync(join(value.root, '.omd', 'observation-v2-retention.json'));
  const predecessorSha256 = (JSON.parse(observationPointer.toString('utf8')) as { sha256: string }).sha256;
  const routeSha256 = adaptiveRouteRecordSha256(readPersistedRoute(value.root, value.invocation));
  const sliceSha256 = checkAdaptiveWorkflowProductionSlice(value.root, value.invocation).productionSliceReceipt?.sha256;
  assert.ok(sliceSha256);
  const approvedReview = authorizeReview(value, hash('before'), hash('after'), [productionPath]);
  const approvedReviewBytes = productionRepairReviewBytes(approvedReview);
  const outcome = Buffer.from(`${canonicalJson({
    schema: 'omd-production-repair-outcome-v2', outcome: 'committed', path: productionPath,
    beforeTreeSha256: hash('before'), afterTreeSha256: hash('after'), routeSha256, sliceSha256,
    reviewSha256: hash(approvedReviewBytes), predecessorSha256,
  })}
`);
  const outcomePath = `.omd/production-repairs/sha256-${hash(outcome)}.json`;
  mkdirSync(join(value.root, '.omd', 'production-repair-blobs'), { recursive: true });
  writeFileSync(join(value.root, `.omd/production-repair-blobs/sha256-${hash('before')}.bin`), 'before');
  writeFileSync(join(value.root, `.omd/production-repair-blobs/sha256-${hash('after')}.bin`), 'after');
  return {
    schema: 'omd-production-repair-journal-v2', state: 'applied', path: productionPath, mode: 0o644,
    outcomePath, outcomeBase64: outcome.toString('base64'),
    beforeTreeSha256: hash('before'), afterTreeSha256: hash('after'), beforeBase64: Buffer.from('before').toString('base64'),
    routeSha256, sliceSha256, reviewSha256: hash(approvedReviewBytes), reviewBase64: approvedReviewBytes.toString('base64'),
    observationPointer: observationPointer.toString('base64'), retentionPointer: retentionPointer.toString('base64'),
    handoffPointer: null, predecessorSha256, ...overrides,
  };
}

function arrangeAppliedInterruption(value: ReturnType<typeof project>, journal: Readonly<Record<string, unknown>>): void {
  writeFileSync(join(value.root, productionPath), 'after');
  rmSync(join(value.root, '.omd', 'observation-v2.json'));
  rmSync(join(value.root, '.omd', 'observation-v2-retention.json'));
  writeFileSync(join(value.root, '.omd', 'observation-v2-repair-predecessor.json'), `${canonicalJson({
    schema: 'observation-v2-repair-predecessor-v1', predecessorSha256: journal.predecessorSha256,
  })}
`);
  writeFileSync(join(value.root, '.omd', '.production-repair.journal'), `${canonicalJson(journal)}
`);
}

test('review intake rejects hostile objects and snapshots accepted descriptor data once', () => {
  const value = project();
  const mirrors: string[] = [];
  try {
    const changed = mirror(value, { [productionPath]: 'after' }); mirrors.push(changed);
    const accepted = review(value, [productionPath], changed) as {
      schema: 'production-repair-review-v1'; observationPointerSha256: string;
      retentionPointerSha256: string | null;
      beforeSha256: string; afterSha256: string; suggestedPaths: string[]; findingIds: string[];
    };
    const stage = stageProductionRepair({ root: value.root, invocation: value.invocation, review: accepted, mirrorRoot: changed });
    accepted.beforeSha256 = hash('forged');
    accepted.suggestedPaths[0] = contextPath;
    accepted.findingIds[0] = 'review:forged';
    assert.equal(applyProductionRepair({ root: value.root, invocation: value.invocation, writer: value.writer, staged: stage }).status, 'committed');

    const fresh = project();
    try {
      const freshMirror = mirror(fresh, { [productionPath]: 'after' }); mirrors.push(freshMirror);
      const ordinary = review(fresh, [productionPath], freshMirror);
      let traps = 0;
      const hostile = new Proxy(ordinary, {
        ownKeys(target) { traps += 1; return Reflect.ownKeys(target); },
        getOwnPropertyDescriptor(target, key) { traps += 1; return Reflect.getOwnPropertyDescriptor(target, key); },
        get(target, key, receiver) { traps += 1; return Reflect.get(target, key, receiver); },
      });
      assert.throws(() => stageProductionRepair({
        root: fresh.root, invocation: fresh.invocation, review: hostile, mirrorRoot: freshMirror,
      }), (error: unknown) => error instanceof ProductionRepairError && error.code === 'MALFORMED_REPAIR_REVIEW');
      assert.equal(traps, 0);

      let accessorReads = 0;
      const accessor = { ...ordinary } as Record<string, unknown>;
      Object.defineProperty(accessor, 'suggestedPaths', { enumerable: true, get() { accessorReads += 1; return [productionPath]; } });
      assert.throws(() => productionRepairReviewBytes(accessor as ProductionRepairReview),
        (error: unknown) => error instanceof ProductionRepairError && error.code === 'MALFORMED_REPAIR_REVIEW');
      assert.equal(accessorReads, 0);

      class ExoticPaths extends Array<string> {}
      assert.throws(() => productionRepairReviewBytes({ ...ordinary, suggestedPaths: new ExoticPaths(productionPath) }),
        (error: unknown) => error instanceof ProductionRepairError && error.code === 'MALFORMED_REPAIR_REVIEW');
      assert.throws(() => productionRepairReviewBytes({ ...ordinary, suggestedPaths: new Proxy([productionPath], {}) }),
        (error: unknown) => error instanceof ProductionRepairError && error.code === 'MALFORMED_REPAIR_REVIEW');
    } finally { rmSync(fresh.root, { recursive: true, force: true }); }
  } finally {
    mirrors.forEach((path) => rmSync(path, { recursive: true, force: true }));
    rmSync(value.root, { recursive: true, force: true });
  }
});

test('repair scope is route, authenticated slice, and nonempty host-authorized reviewer intersection', () => {
  const value = project();
  let mirrorRoot: string | undefined;
  try {
    const privateMirror = mirror(value, { [contextPath]: 'changed context' });
    mirrorRoot = privateMirror;
    assert.throws(() => stageProductionRepair({
      root: value.root, invocation: value.invocation,
      review: review(value, ['foreign.html'], privateMirror), mirrorRoot: privateMirror,
    }), (error: unknown) => error instanceof ProductionRepairError && error.code === 'REPAIR_PATH_OUTSIDE_ROUTE');
    const withoutSlice = project(false);
    try {
      const otherMirror = mirror(withoutSlice, { [productionPath]: 'after' });
      try {
        assert.throws(() => stageProductionRepair({ root: withoutSlice.root, invocation: withoutSlice.invocation, review: review(withoutSlice, [productionPath], otherMirror), mirrorRoot: otherMirror }),
          (error: unknown) => error instanceof ProductionRepairError && error.code === 'REPAIR_SLICE_REQUIRED');
      } finally { rmSync(otherMirror, { recursive: true, force: true }); }
    } finally { rmSync(withoutSlice.root, { recursive: true, force: true }); }
  } finally {
    if (mirrorRoot) rmSync(mirrorRoot, { recursive: true, force: true });
    rmSync(value.root, { recursive: true, force: true });
  }
});

test('opaque one-file stage rejects no-op, multi-file, mode, and symlink results', () => {
  const value = project();
  const mirrors: string[] = [];
  try {
    const noOp = mirror(value); mirrors.push(noOp);
    assert.throws(() => stageProductionRepair({ root: value.root, invocation: value.invocation, review: review(value, [productionPath], noOp), mirrorRoot: noOp }),
      (error: unknown) => error instanceof ProductionRepairError && error.code === 'NO_OP_REPAIR');
    const multi = mirror(value, { [productionPath]: 'after', [contextPath]: 'changed' }); mirrors.push(multi);
    assert.throws(() => stageProductionRepair({ root: value.root, invocation: value.invocation, review: review(value, [productionPath, contextPath], multi), mirrorRoot: multi }),
      (error: unknown) => error instanceof ProductionRepairError && error.code === 'MULTI_FILE_REPAIR');
    const mode = mirror(value); mirrors.push(mode); chmodSync(join(mode, productionPath), 0o600);
    assert.throws(() => stageProductionRepair({ root: value.root, invocation: value.invocation, review: review(value, [productionPath], mode), mirrorRoot: mode }),
      (error: unknown) => error instanceof ProductionRepairError && error.code === 'MALFORMED_STAGED_REPAIR');
    const linked = mirror(value); mirrors.push(linked); rmSync(join(linked, productionPath)); symlinkSync(join(value.root, productionPath), join(linked, productionPath));
    assert.throws(() => stageProductionRepair({ root: value.root, invocation: value.invocation, review: review(value, [productionPath], linked), mirrorRoot: linked }),
      (error: unknown) => error instanceof ProductionRepairError && error.code === 'MALFORMED_STAGED_REPAIR');
  } finally {
    mirrors.forEach((path) => rmSync(path, { recursive: true, force: true }));
    rmSync(value.root, { recursive: true, force: true });
  }
});

test('authorized opaque repair commits one file, invalidates observation, and preserves mode', () => {
  const value = project();
  let mirrorRoot: string | undefined;
  try {
    const beforeMode = lstatSync(join(value.root, productionPath)).mode & 0o777;
    const stage = staged(value, { [productionPath]: 'after' }); mirrorRoot = stage.mirrorRoot;
    const outcome = applyProductionRepair({ root: value.root, invocation: value.invocation, writer: value.writer, staged: stage.result });
    assert.equal(readFileSync(join(value.root, productionPath), 'utf8'), 'after');
    assert.equal(readFileSync(join(value.root, contextPath), 'utf8'), 'context');
    assert.equal(lstatSync(join(value.root, productionPath)).mode & 0o777, beforeMode);
    assert.equal(existsSync(join(value.root, '.omd', 'observation-v2.json')), false);
    assert.equal(existsSync(join(value.root, '.omd', 'observation-v2-retention.json')), false);
    assert.equal(outcome.beforeTreeSha256, hash('before'));
    assert.equal(outcome.afterTreeSha256, hash('after'));
    assert.match(readFileSync(join(value.root, outcome.outcomePath), 'utf8'), /"outcome":"committed"/);
    assert.equal(existsSync(join(value.root, '.omd', '.production-repair.journal')), false);
    assert.deepEqual(recoverProductionRepair({ root: value.root, invocation: value.invocation, writer: value.writer }), { status: 'clean' });
    assert.throws(() => applyProductionRepair({ root: value.root, invocation: value.invocation, writer: value.writer, staged: stage.result }),
      (error: unknown) => error instanceof ProductionRepairError && error.code === 'MALFORMED_STAGED_REPAIR');
  } finally {
    if (mirrorRoot) rmSync(mirrorRoot, { recursive: true, force: true });
    rmSync(value.root, { recursive: true, force: true });
  }
});

test('stale target and stale observation reject before transaction mutation', () => {
  const value = project();
  const mirrors: string[] = [];
  try {
    const first = staged(value, { [productionPath]: 'after' }); mirrors.push(first.mirrorRoot);
    writeFileSync(join(value.root, productionPath), 'third-party');
    assert.throws(() => applyProductionRepair({ root: value.root, invocation: value.invocation, writer: value.writer, staged: first.result }),
      (error: unknown) => error instanceof ProductionRepairError && error.code === 'STALE_REPAIR_BASE');
    assert.equal(existsSync(join(value.root, '.omd', '.production-repair.journal')), false);

    writeFileSync(join(value.root, productionPath), 'before');
    const second = staged(value, { [productionPath]: 'after' }); mirrors.push(second.mirrorRoot);
    publishObservation(value.root, '2026-01-01T00:01:00.000Z');
    assert.throws(() => applyProductionRepair({ root: value.root, invocation: value.invocation, writer: value.writer, staged: second.result }),
      (error: unknown) => error instanceof ProductionRepairError && error.code === 'STALE_REPAIR_BASE');
    assert.equal(readFileSync(join(value.root, productionPath), 'utf8'), 'before');
  } finally {
    mirrors.forEach((path) => rmSync(path, { recursive: true, force: true }));
    rmSync(value.root, { recursive: true, force: true });
  }
});

test('prepared and applied recovery rolls back without retaining a contradictory outcome', () => {
  const value = project();
  try {
    const observationPointer = readFileSync(join(value.root, '.omd', 'observation-v2.json'));
    const retentionPointer = readFileSync(join(value.root, '.omd', 'observation-v2-retention.json'));
    const journal = interruptedJournal(value);
    const outcomePath = journal.outcomePath as string;
    const outcome = Buffer.from(journal.outcomeBase64 as string, 'base64');
    arrangeAppliedInterruption(value, journal);
    mkdirSync(join(value.root, dirname(outcomePath)), { recursive: true });
    writeFileSync(join(value.root, outcomePath), outcome);
    assert.deepEqual(recoverProductionRepair({ root: value.root, invocation: value.invocation, writer: value.writer }), { status: 'rolled-back' });
    assert.equal(readFileSync(join(value.root, productionPath), 'utf8'), 'before');
    assert.equal(readFileSync(join(value.root, '.omd', 'observation-v2.json')).equals(observationPointer), true);
    assert.equal(readFileSync(join(value.root, '.omd', 'observation-v2-retention.json')).equals(retentionPointer), true);
    assert.equal(existsSync(join(value.root, outcomePath)), false);
    assert.equal(existsSync(join(value.root, '.omd', 'observation-v2-repair-predecessor.json')), false);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('recovery fails closed when production matches neither transaction revision', () => {
  const value = project();
  try {
    const routeSha256 = adaptiveRouteRecordSha256(readPersistedRoute(value.root, value.invocation));
    const approvedReview = authorizeReview(value, hash('before'), hash('after'), [productionPath]);
    const approvedReviewBytes = productionRepairReviewBytes(approvedReview);
    writeFileSync(join(value.root, productionPath), 'third-party');
    writeFileSync(join(value.root, '.omd', '.production-repair.journal'), `${canonicalJson({
      schema: 'omd-production-repair-journal-v2', state: 'prepared', path: productionPath, mode: 0o644,
      outcomePath: `.omd/production-repairs/sha256-${hash('third-party')}.json`, outcomeBase64: Buffer.from('{}').toString('base64'),
      beforeTreeSha256: hash('before'), afterTreeSha256: hash('after'), beforeBase64: Buffer.from('before').toString('base64'),
      routeSha256, sliceSha256: hash('slice'), reviewSha256: hash(approvedReviewBytes),
      reviewBase64: approvedReviewBytes.toString('base64'),
      observationPointer: Buffer.from('{}').toString('base64'),
      retentionPointer: null, handoffPointer: null, predecessorSha256: 'a'.repeat(64),
    })}\n`);
    assert.throws(() => recoverProductionRepair({ root: value.root, invocation: value.invocation, writer: value.writer }),
      (error: unknown) => error instanceof ProductionRepairError && error.code === 'UNRESOLVED_REPAIR_JOURNAL');
    assert.equal(readFileSync(join(value.root, productionPath), 'utf8'), 'third-party');
    assert.equal(existsSync(join(value.root, '.omd', '.production-repair.journal')), true);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('recovery rejects caller-forged rollback bytes not authorized by the review', () => {
  const value = project();
  try {
    const routeSha256 = adaptiveRouteRecordSha256(readPersistedRoute(value.root, value.invocation));
    const approvedReview = authorizeReview(value, hash('before'), hash('after'), [productionPath]);
    const approvedReviewBytes = productionRepairReviewBytes(approvedReview);
    writeFileSync(join(value.root, productionPath), 'after');
    writeFileSync(join(value.root, '.omd', '.production-repair.journal'), `${canonicalJson({
      schema: 'omd-production-repair-journal-v2', state: 'applied', path: productionPath, mode: 0o644,
      outcomePath: `.omd/production-repairs/sha256-${hash('forged')}.json`, outcomeBase64: Buffer.from('{}').toString('base64'),
      beforeTreeSha256: hash('forged'), afterTreeSha256: hash('after'), beforeBase64: Buffer.from('forged').toString('base64'),
      routeSha256, sliceSha256: hash('slice'), reviewSha256: hash(approvedReviewBytes),
      reviewBase64: approvedReviewBytes.toString('base64'),
      observationPointer: Buffer.from('{}').toString('base64'),
      retentionPointer: null, handoffPointer: null, predecessorSha256: 'a'.repeat(64),
    })}\n`);
    assert.throws(
      () => recoverProductionRepair({ root: value.root, invocation: value.invocation, writer: value.writer }),
      (error: unknown) => error instanceof ProductionRepairError && error.code === 'UNRESOLVED_REPAIR_JOURNAL',
    );
    assert.equal(readFileSync(join(value.root, productionPath), 'utf8'), 'after');
    assert.equal(existsSync(join(value.root, '.omd', '.production-repair.journal')), true);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});


test('recovery rejects forged observation retention and outcome bytes before mutation', () => {
  for (const forge of ['pointer', 'retention', 'outcome'] as const) {
    const value = project();
    try {
      const valid = interruptedJournal(value);
      const journal = forge === 'pointer'
        ? { ...valid, observationPointer: Buffer.from('{}').toString('base64') }
        : forge === 'retention'
          ? {
            ...valid,
            retentionPointer: Buffer.from(`${canonicalJson({
              schema: 'observation-v2-retention',
              currentArtifactSha256: 'd'.repeat(64),
              retained: [valid.predecessorSha256],
            })}\n`).toString('base64'),
          }
          : { ...valid, outcomeBase64: Buffer.from('{}').toString('base64') };
      arrangeAppliedInterruption(value, journal);
      const handoffBefore = readFileSync(join(value.root, '.omd', 'observation-v2-repair-predecessor.json'));
      const journalBefore = readFileSync(join(value.root, '.omd', '.production-repair.journal'));
      assert.throws(
        () => recoverProductionRepair({ root: value.root, invocation: value.invocation, writer: value.writer }),
        (error: unknown) => error instanceof ProductionRepairError && error.code === 'UNRESOLVED_REPAIR_JOURNAL',
      );
      assert.equal(readFileSync(join(value.root, productionPath), 'utf8'), 'after');
      assert.equal(readFileSync(join(value.root, '.omd', 'observation-v2-repair-predecessor.json')).equals(handoffBefore), true);
      assert.equal(readFileSync(join(value.root, '.omd', '.production-repair.journal')).equals(journalBefore), true);
      assert.equal(existsSync(join(value.root, '.omd', 'observation-v2.json')), false);
    } finally { rmSync(value.root, { recursive: true, force: true }); }
  }
});
