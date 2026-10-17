import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, input } from './helpers/native-maker.ts';
import { makerContext } from '../core/runtime/native-maker-context.ts';
import { readPersistedRoute } from '../core/route/adaptive-route-persistence.ts';
import { parseMakerInput } from '../adapters/pi-maker-contract.ts';
import { prepareNativeMaker } from '../core/runtime/native-maker-packet.ts';
import { runPiMaker } from '../adapters/pi-maker-runtime.ts';
import { makeNativeSource } from '../core/runtime/native-maker.ts';
import { frameInput } from './helpers/phase6-process.ts';
import { parseFrameInput } from '../core/frame/input.ts';
import { writeFrameRecord } from '../core/frame/write.ts';
import { readFrame } from '../core/frame/index.ts';
import { piRecord } from '../adapters/pi-reviewer-contract.ts';

test('sealed maker packet preserves scoped surface, validation and accessibility plans', t => {
  const context = fixture(t);
  writeFrameRecord(context.root, parseFrameInput(frameInput()), context.writer);
  const frameBytes = readFileSync(join(context.root, '.omd/frame.md'));
  const frame = readFrame(context.root);
  assert.ok(frame);
  const prepared = prepareNativeMaker(context);
  const packet = piRecord(JSON.parse(prepared.packet.toString('utf8')), 'maker packet');
  const evidence = piRecord(packet.evidence, 'maker evidence');
  const delivered = piRecord(piRecord(evidence.context, 'maker context').frame, 'maker frame');
  assert.deepEqual(delivered.surfacePlan, frame.surfacePlan);
  assert.deepEqual(delivered.validationPlan, frame.validationPlan);
  assert.deepEqual(delivered.accessibilityPlan, frame.accessibilityPlan);
  assert.deepEqual(readFileSync(join(context.root, '.omd/frame.md')), frameBytes);
});

test('malformed current frame plans refuse maker preparation without source mutation', t => {
  const context = fixture(t);
  context.writer.write('.omd/frame.md', '---\nsurfacePlan: {schema: surface-plan-v1}\n---\n');
  const sourcePath = input.paths[0];
  assert.ok(sourcePath);
  const sourceBytes = readFileSync(join(context.root, sourcePath));
  assert.throws(() => prepareNativeMaker(context), /DIRECTION_CONTRACT/);
  assert.deepEqual(readFileSync(join(context.root, sourcePath)), sourceBytes);
});

test('approved typography projection excludes source-aware alternatives', t => {
  // Given a selected typography proof with separate approved and private sections.
  const context = fixture(t);
  const route = readPersistedRoute(context.root, context.invocation);
  const selected = { ...route, strategy: { ...route.strategy, stages: [...route.strategy.stages, 'type-proof' as const] } };
  const approved = '## Approved type contract\n- body: 16px/1.5 system-ui\n';
  context.writer.write('.omd/type-proof.md', `${approved}## Rejected alternatives\nPRIVATE_RESEARCH_SENTINEL`);
  // When the host builds the role-safe projection.
  const projected = makerContext(context.root, selected, { input: parseMakerInput(input), invocation: context.invocation });
  // Then the complete approved field is preserved without the private alternative.
  assert.equal(projected.documents.find(row => row.path === 'approved-type-contract')?.content, approved);
});

test('selected typography without an approved contract refuses instead of sending the raw proof', t => {
  // Given a source-aware proof with no role-safe approved section.
  const context = fixture(t);
  const route = readPersistedRoute(context.root, context.invocation);
  const selected = { ...route, strategy: { ...route.strategy, stages: [...route.strategy.stages, 'type-proof' as const] } };
  context.writer.write('.omd/type-proof.md', '## Rejected alternatives\nPRIVATE_RESEARCH_SENTINEL');
  // When the host projects selected typography.
  assert.throws(() => makerContext(context.root, selected, { input: parseMakerInput(input),
    invocation: context.invocation }), /approved-type-contract-required/);
});

test('typography extraction admits only the exact approved section', t => {
  const context = fixture(t);
  const route = readPersistedRoute(context.root, context.invocation);
  const selected = { ...route, strategy: { ...route.strategy, stages: [...route.strategy.stages, 'type-proof' as const] } };
  const approved = '## Approved type contract\n- body: 16px/1.5 system-ui\n';
  context.writer.write('.omd/type-proof.md', `${approved}## Font alternatives\nPRIVATE_FONT_SENTINEL\n## Specimen source rationale\nPRIVATE_SOURCE_SENTINEL`);
  const projected = makerContext(context.root, selected, { input: parseMakerInput(input), invocation: context.invocation });
  assert.equal(projected.documents.find(row => row.path === 'approved-type-contract')?.content, approved);
});

test('a font alternatives section cannot authorize a typography contract', t => {
  const context = fixture(t);
  const route = readPersistedRoute(context.root, context.invocation);
  const selected = { ...route, strategy: { ...route.strategy, stages: [...route.strategy.stages, 'type-proof' as const] } };
  context.writer.write('.omd/type-proof.md', '## Font alternatives\nPRIVATE_FONT_SENTINEL');
  assert.throws(() => makerContext(context.root, selected, { input: parseMakerInput(input),
    invocation: context.invocation }), /approved-type-contract-required/);
});

test('skipped visual stages never deliver old proofs as new maker constraints', t => {
  // Given an explicitly skipped stage with stale material still on disk.
  const context = fixture(t);
  context.writer.write('.omd/type-proof.md', '## Approved type contract\nOLD_TYPE_SENTINEL');
  context.writer.write('.omd/composition.md', 'OLD_COMPOSITION_SENTINEL');
  // When the packet is built for the current route.
  const packet = JSON.parse(prepareNativeMaker(context).packet.toString('utf8'));
  // Then the skipped proof is absent.
  assert.equal(packet.evidence.documents.some((row: { path: string }) => row.path === 'approved-type-contract'), false);
  assert.equal(packet.evidence.documents.some((row: { path: string }) => row.path === '.omd/composition.md'), false);
  assert.equal(JSON.stringify(packet).includes('OLD_COMPOSITION_SENTINEL'), false);
  assert.equal(packet.outputContract.fixedBindings.compositionSha256, null);
});

test('selected composition remains in the maker projection and its fingerprint', t => {
  const context = fixture(t);
  const route = readPersistedRoute(context.root, context.invocation);
  const selected = { ...route, strategy: { ...route.strategy,
    stages: [...route.strategy.stages, 'composition' as const] } };
  const content = 'SELECTED_COMPOSITION_SENTINEL';
  context.writer.write('.omd/composition.md', content);
  const projected = makerContext(context.root, selected,
    { input: parseMakerInput(input), invocation: context.invocation });
  assert.equal(projected.documents.find(row => row.path === '.omd/composition.md')?.content, content);
  assert.ok(projected.digests.some(row => row.path === '.omd/composition.md'));
});

test('maker receives the complete functional task matrix without other frame research', t => {
  const context = fixture(t);
  const matrix = 'T1 | goal: Save a note | start: Open draft | actions: Submit empty then correct text | success: Saved note visible | recovery: Preserve the draft on failure | viewports: desktop,mobile | requirements: invalid-submit,transient';
  context.writer.write('.omd/frame.md', `---\nuxSurface: product\n---\n## Task coverage matrix\n${matrix}\n## Research\nPRIVATE_FRAME_RESEARCH`);
  const projected = makerContext(context.root, readPersistedRoute(context.root, context.invocation),
    { input: parseMakerInput(input), invocation: context.invocation });
  const delivered = JSON.stringify(projected.context);
  assert.ok(delivered.includes(matrix));
  assert.equal(delivered.includes('PRIVATE_FRAME_RESEARCH'), false);
});

test('typed destination requirements preserve literal endpoint labels in delivered maker context', async t => {
  // Given an exact first-party endpoint label, not a design-reference locator.
  const context = fixture(t);
  const requirements = { schema: 'functional-requirements-v1', requirements: [
    { id: 'R-001', kind: 'content', statement: 'Display the configured endpoint', label: 'https://api.destination.invalid/v1' },
  ] };
  context.writer.write('.omd/functional-requirements.json', JSON.stringify(requirements));
  const prepared = prepareNativeMaker(context);
  // When the native consumer receives the host projection.
  await runPiMaker({ ...context, prepared });
  // Then exact machine-consumed copy survives the reference exclusion boundary.
  const documents = JSON.parse(prepared.packet.toString('utf8')).evidence.documents;
  const projected = documents.find((row: { path: string }) => row.path === '.omd/functional-requirements.json');
  assert.deepEqual(JSON.parse(projected.content), requirements);
});

test('declared read context outside write scope is delivered without granting mutation', async t => {
  const context = fixture(t);
  const manifest = '{"type":"module","dependencies":{"example":"1.2.3"}}';
  writeFileSync(join(context.root, 'package.json'), manifest);
  writeFileSync(join(context.root, 'src/shared.ts'), 'export const shared = 7;');
  const request = { ...context, input: { ...input, readPaths: ['package.json', 'src/shared.ts'] } };
  const prepared = prepareNativeMaker(request);
  const packet = JSON.parse(prepared.packet.toString('utf8'));
  assert.ok(packet.evidence.source.some((file: { path: string }) => file.path === 'package.json'));
  assert.ok(packet.evidence.source.some((file: { path: string }) => file.path === 'src/shared.ts'));
  assert.deepEqual(packet.evidence.allowedPaths, input.paths);
  await makeNativeSource(request);
  assert.equal(readFileSync(join(context.root, 'package.json'), 'utf8'), manifest);
  assert.equal(readFileSync(join(context.root, 'src/shared.ts'), 'utf8'), 'export const shared = 7;');
});

test('maker receives destination contracts rather than reference-bearing requests and research claims', t => {
  const context = fixture(t);
  const route = readPersistedRoute(context.root, context.invocation);
  const description = 'PRIVATE_SOURCE_NAME has charcoal navigation and violet controls.';
  const sourceContract = { ...route.sourceContract, evidenceClaims: {
    ...route.sourceContract.evidenceClaims,
    claims: route.sourceContract.evidenceClaims.claims.map(claim => ({ ...claim, text: description })),
  } };
  const projected = makerContext(context.root, { ...route, request: description, sourceContract },
    { input: parseMakerInput(input), invocation: context.invocation });
  assert.equal(JSON.stringify(projected.context).includes(description), false);
  assert.ok(JSON.stringify(projected.context).includes(route.sourceContract.taskOutcome.goal));
});

test('unregistered visual locators in task prose do not cross the maker boundary', t => {
  const context = fixture(t);
  const route = readPersistedRoute(context.root, context.invocation);
  const sourceContract = { ...route.sourceContract, taskOutcome: {
    ...route.sourceContract.taskOutcome,
    mustHave: [...route.sourceContract.taskOutcome.mustHave, 'Follow https://unregistered-reference.invalid/original'],
  } };
  const projected = makerContext(context.root, { ...route, sourceContract },
    { input: parseMakerInput(input), invocation: context.invocation });
  const forbiddenUrl = new URL('https://unregistered-reference.invalid/original');
  assert.doesNotThrow(() => JSON.stringify(projected.context, (_key, value) => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(/https?:\/\/[^\s]+/g)) {
        assert.notEqual(new URL(match[0]).href, forbiddenUrl.href);
      }
    }
    return value;
  }));
});

test('read context refuses private records and cannot expand the write grant', t => {
  const context = fixture(t);
  assert.throws(() => prepareNativeMaker({ ...context,
    input: { ...input, readPaths: ['.omd/briefs/production.json'] } }), /read-path-scope/);
  assert.throws(() => prepareNativeMaker({ ...context,
    input: { ...input, paths: [...input.paths, 'package.json'], readPaths: [] } }), /route-path-scope/);
});

test('Sketch cannot use readPaths to recover production context', () => {
  assert.throws(() => parseMakerInput({ schema: 'native-maker-input-v1', role: 'omd-sketch',
    candidateId: 'alpha', axis: 'Task first', paths: ['.omd/.cache/sketches/alpha/index.html'],
    readPaths: ['src/main.ts'] }), /sketch-read-context/);
});

test('native maker does not require an art-direction handoff for a skipped stage', async t => {
  const context = fixture(t);
  context.writer.write('.omd/reference-selection-v2.json', '{"previousRoute":true}');
  const result = await makeNativeSource(context);
  assert.equal(result.receipt.role, 'omd-hand');
  assert.equal(existsSync(join(context.root, '.omd/reference-handoffs/hand.json')), false);
});

test('selected art direction still refuses a missing handoff', t => {
  const context = fixture(t);
  const route = readPersistedRoute(context.root, context.invocation);
  const selected = { ...route, strategy: { ...route.strategy,
    stages: [...route.strategy.stages, 'art-direction' as const] } };
  assert.throws(() => makerContext(context.root, selected, {
    input: parseMakerInput(input), invocation: context.invocation,
  }), /current reference handoff/);
});
