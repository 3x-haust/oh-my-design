import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { fixture, input, repo, nodePath, packRoot } from './helpers/native-maker.ts';
import { getNativePiRun, stageNativePiCommand } from '../core/runtime/native-pi-run.ts';
import { prepareNativeMaker } from '../core/runtime/native-maker-packet.ts';
import { runPiMaker } from '../adapters/pi-maker-runtime.ts';
import { publishNativeMaker } from '../core/runtime/native-maker.ts';
import { MAKER_EFFORT } from '../adapters/pi-maker-contract.ts';
import { checkProductionReadiness } from '../core/runtime/production-reference-gate.ts';
import { publishAdaptiveRoute } from '../core/route/adaptive-route-persistence.ts';
import { canonicalJson, sha256 } from '../core/ref/board-artifacts.ts';
import { verifyNativeObservation } from '../core/runtime/self-signed-activation.ts';

const execute = promisify(execFile);

test('native CLI maker run consumes an authenticated command envelope and writes real source', async t => {
  // Given the same actual command transport used by the native Pi extension.
  const context = fixture(t);
  const runtimeRoot = join(repo, 'test/fixtures/native-cli');
  context.writer.write('.omd/.cache/maker-input.json', JSON.stringify(input));
  const staged = stageNativePiCommand({ run: getNativePiRun(context.invocation, context.root), runtimeRoot,
    argv: ['maker', 'run', '--input', '.omd/.cache/maker-input.json', '--json'] });
  t.after(staged.dispose);
  // When the real CLI launches the real RPC fixture and imports its result.
  const result = await execute(nodePath, [join(runtimeRoot, 'bin/omd.ts'), ...staged.argv],
    { cwd: context.root, timeout: 30_000 });
  // Then the publication reaches the routed source and records inherited host identity.
  const publication = JSON.parse(result.stdout);
  assert.equal(publication.schema, 'native-maker-publication-v2');
  assert.deepEqual(Object.keys(publication).sort(), ['execution', 'paths', 'receiptPath', 'schema']);
  assert.deepEqual(publication.paths, input.paths);
  assert.equal(publication.execution.model, 'fixture-maker-model');
  assert.equal(JSON.stringify(publication).includes('finalMessage'), false);
  const recordBytes = readFileSync(join(context.root, publication.receiptPath));
  const record = JSON.parse(recordBytes.toString('utf8'));
  assert.equal(publication.receiptPath, `.omd/makers/executions/${sha256(recordBytes)}.json`);
  assert.ok(verifyNativeObservation(context.root, record.receipt.schema,
    sha256(canonicalJson(record.receipt)), record.signature));
  assert.match(record.receipt.finalMessage, /maker-fixture/);
  assert.deepEqual(publication.execution.usage, record.receipt.usage);
  assert.equal(publication.execution.sessionId, record.receipt.sessionId);
  for (const file of record.handback.files) {
    assert.equal(readFileSync(join(context.root, file.path), 'utf8'), file.content);
  }
  assert.match(readFileSync(join(context.root, input.paths[0] ?? ''), 'utf8'), /maker-fixture/);
});

test('maker schema is inspectable but a standalone CLI cannot acquire maker authority', async t => {
  // Given an unauthenticated CLI invocation in a project.
  const context = fixture(t);
  const before = readdirSync(join(context.root, 'src/copy'));
  // When it attempts native production.
  await assert.rejects(execute(nodePath, [join(repo, 'bin/omd.ts'), 'maker', 'run', '--input', '-', '--json'],
    { cwd: context.root }), /NATIVE_PI_AUTHORITY/);
  // Then no source appears, while read-only schema discovery still works.
  assert.deepEqual(readdirSync(join(context.root, 'src/copy')), before);
  const schema = await execute(nodePath, [join(repo, 'bin/omd.ts'), 'schema', 'native-maker', '--json'],
    { cwd: context.root });
  assert.equal(JSON.parse(schema.stdout).skeleton.schema, 'native-maker-input-v1');
});

test('maker effort agrees with both source-owned role declarations', () => {
  // Given source-owned roles rather than an invocation model override.
  const roles = ['hand', 'sketch'].map(role => parse(readFileSync(join(repo, `src/agents/${role}.agent.yaml`), 'utf8')));
  // When the runtime chooses its maker effort.
  const effort = MAKER_EFFORT;
  // Then each machine-consumed role declaration selects that effort.
  for (const role of roles) assert.equal(role.reasoning, effort);
});

test('unissued packet copies and replayed results cannot authorize source import', async t => {
  // Given a genuine prepared packet and an authenticated execution.
  const context = fixture(t);
  const prepared = prepareNativeMaker(context);
  const result = await runPiMaker({ ...context, prepared });
  // When unissued copies attempt execution/publication.
  await assert.rejects(runPiMaker({ ...context, prepared: { ...prepared } }), /host-prepared-packet-required/);
  assert.throws(() => publishNativeMaker({ ...context, prepared, result: { ...result } }), /maker-result-authority/);
  publishNativeMaker({ ...context, prepared, result });
  // Then the genuine capability is one-use.
  assert.throws(() => publishNativeMaker({ ...context, prepared, result }), /replay/);
});

test('a dangling later target is rejected before the first valid file can mutate', t => {
  // Given an owned first file followed by a dangling symlink target.
  const context = fixture(t);
  const target = input.paths[1];
  assert.ok(target);
  symlinkSync(join(context.root, 'missing.ts'), join(context.root, target));
  const before = readFileSync(join(context.root, input.paths[0] ?? ''));
  // When the host prepares the bounded source mutation.
  assert.throws(() => prepareNativeMaker(context), /source-target-not-regular/);
  // Then the first source file remains unchanged.
  assert.deepEqual(readFileSync(join(context.root, input.paths[0] ?? '')), before);
});

for (const path of ['src/unrequested.ts', '.omd/frame.md', '.omd/.cache/sketches/current.json', '../escape.ts']) {
  test(`Hand refuses unauthorized output ${path} before source mutation`, t => {
    // Given a current native run with one unauthorized proposed path.
    const context = fixture(t);
    const before = readFileSync(join(context.root, input.paths[0] ?? ''));
    // When packet construction parses and checks the requested ownership.
    assert.throws(() => prepareNativeMaker({ ...context, input: { ...input, paths: [path] } }));
    // Then no valid source changes as a side effect.
    assert.deepEqual(readFileSync(join(context.root, input.paths[0] ?? '')), before);
  });
}

test('maker frame projection excludes unrecognized source-aware frontmatter from delivered context', async t => {
  // Given a frame with legitimate task fields and an unrelated private research field.
  const context = fixture(t);
  context.writer.write('.omd/frame.md', '---\nuxTask: Confirm the saved result\nprivateResearch: PRIVATE_RESEARCH_SENTINEL\n---\nPrivate reasoning.');
  const prepared = prepareNativeMaker(context);
  // When the real evidence consumer checks its delivered context.
  const result = await runPiMaker({ ...context, prepared });
  // Then only the role-safe frame task reaches the maker.
  assert.equal(result.receipt.role, 'omd-hand');
  assert.equal(JSON.parse(prepared.packet.toString('utf8')).evidence.context.frame.uxTask, 'Confirm the saved result');
});

for (const permitted of [false, true]) {
  test(`native readiness ${permitted ? 'accepts' : 'refuses'} a declared public/build entry before production`, t => {
    // Given the actual configured build entry and an explicit initial route scope.
    const context = fixture(t);
    if (permitted) publishAdaptiveRoute(context.root, {
      ...context.routeInput, allowedPaths: [...context.routeInput.allowedPaths, 'public/build/**'],
    }, context.writer, context.invocation);
    const entrySurface = { schema: 'entry-surface-contract-v1', entryPath: 'public/build/index.html',
      prerequisiteTaskId: 'inspect', dependentTaskId: 'confirm', purposeText: 'Read confirmation',
      workObjectAnchorText: 'Confirmation', nextActionName: null, beforeText: 'Pending', afterText: 'Confirmed',
      outcomeWitnesses: [
        { kind: 'mustHave', index: 0, phase: 'initial', assertion: 'visible-text', target: 'purpose' },
        { kind: 'mustNotHave', index: 0, phase: 'initial', assertion: 'absent-text', target: 'body' },
        { kind: 'completionEvidence', index: 0, phase: 'after-prerequisite', assertion: 'visible-text', target: 'consequence' },
      ] };
    context.writer.write('.omd/frame.md', `---\nentrySurface: ${JSON.stringify(entrySurface)}\n---\n`);
    const before = readFileSync(join(context.root, input.paths[0] ?? ''));
    // When the existing readiness gate checks the declared target before maker launch.
    const result = checkProductionReadiness(context.root, context.invocation, packRoot);
    // Then output scope is enforced without guessing paths or mutating source/route.
    assert.equal(result.ok, permitted, JSON.stringify(result.blockers));
    assert.equal(result.blockers.some(blocker => blocker.includes('RENDER_ENTRY_OUTSIDE_ROUTE')), !permitted);
    assert.deepEqual(readFileSync(join(context.root, input.paths[0] ?? '')), before);
  });
}
