import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectedTerminalFixture } from './helpers/selected-terminal.ts';
import { loadTerminalProcess } from '../core/evidence/final-v2-process.ts';
import { loadContracts } from '../core/measure/inputs.ts';
import { sha256, canonicalBytes } from '../core/measure/identity.ts';
import { createTestNativePiInvocation, authorizeNativePiPayload } from '../core/runtime/native-pi-run.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { buildNativeMeasuredFinalDraft } from '../core/runtime/native-final-manifest.ts';
import { validateFinalProductionEvidence } from '../core/evidence/final-v2-graph.ts';
import { nodeStableProjectFileSystem } from '../core/runtime/stable-project-file.ts';
import { createProjectWriteAdapter } from '../core/runtime/project-write.ts';
import { loadMeasurement } from '../core/measure/files.ts';
import { extendSelectedTokens } from '../core/tokens/resolve.ts';
import { measureProject } from '../core/measure/index.ts';
import { captureNativeSelectedDirection, validateSelectedDirectionCapture } from '../core/runtime/trusted-selected-direction-capture.ts';

test('a signed additive alias invalidates old packets and cannot disguise a selected role remap behind identical pixels', { timeout: 180_000 }, async t => {
  const f = await selectedTerminalFixture(t);
  loadMeasurement(f.root, f.measurements[0]!); // Warm replay must not weaken current-input checks.
  const extended = extendSelectedTokens(f.root, { schema: 'token-extensions-v1', primitives: {}, semantic: {},
    textStyles: { detailBody: f.tokens.effective.textStyles.body }, neededBy: [{ tokenId: 'textStyles.detailBody', surfaceId: 'main', stateId: 'initial', componentId: 'details' }] }, f.writer, f.invocation);
  assert.equal(loadContracts(f.root).inputs.find(i => i.kind === 'tokens')!.consumedContractSha256, extended.effectiveTokensSha256);
  assert.throws(() => loadMeasurement(f.root, f.measurements[0]!), /selected contract inputs changed/);
  const before = await measureProject({ root: f.root, entry: f.entry, writer: f.writer, invocation: f.invocation });
  const beforePacket = loadMeasurement(f.root, before.packet);
  assert.equal(beforePacket.summary.deterministicVerdict, 'PASS');
  const sourcePath = join(f.root, f.entry), source = readFileSync(sourcePath, 'utf8');
  writeFileSync(sourcePath, source.replace('data-omd-text-style="body"', 'data-omd-text-style="detailBody"'));
  const after = await measureProject({ root: f.root, entry: f.entry, writer: f.writer, invocation: f.invocation });
  const afterPacket = loadMeasurement(f.root, after.packet);
  assert.deepEqual(afterPacket.captures.map(c => c.capture.sha256), beforePacket.captures.map(c => c.capture.sha256));
  assert.equal(afterPacket.summary.deterministicVerdict, 'RED');
  assert.ok(afterPacket.findings.some(f => f.code === 'TYPE_ROLE_UNASSIGNED' && f.severity === 'blocking' && f.expected?.field.startsWith('selected-system.assignments.')));
});

test('selected Beats are collected on owned production bytes and delivered to review; generic URL receipts cannot replace that binding', { timeout: 180_000 }, async t => {
  const f = await selectedTerminalFixture(t, { beats: true });
  const nodePath = realpathSync(globalThis.process.execPath), cliPath = fileURLToPath(new URL('fixtures/measured-pi-reviewer-rpc.mjs', import.meta.url));
  const invocation = createTestNativePiInvocation({ root: f.root, current: f.invocation.current, host: { nodePath, nodeSha256: sha256(readFileSync(nodePath)), cliPath, cliSha256: sha256(readFileSync(cliPath)),
    provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'high', parentSessionId: 'selected-beat-parent' } });
  authorizeNativePiPayload(invocation, f.root, 'product-probe-result', Buffer.from(`${canonicalJson(f.evaluation.receipt)}\n`));
  const writer = createProjectWriteAdapter(f.root, invocation);
  const result = await captureNativeSelectedDirection({ root: f.root, invocation, writer, taskId: 'receipt-reading' });
  assert.equal(result.motion, null); assert.ok(result.beats);
  const bound = validateSelectedDirectionCapture(f.root, invocation, result.capture, { direction: f.art.record, beats: result.beats });
  assert.equal(bound.entry, f.entry);
  const process = loadTerminalProcess(f.root, invocation, f.observationSha256s)!;
  assert.equal(process.binding.directionCapture!.sha256, result.capture.sha256);
  assert.equal(process.supplementalRenders.filter(r => r.kind === 'native-selected-beats').length, 2);
  const activation = Buffer.from(canonicalJson(invocation.activation)), activationPath = `.omd/activation/sha256-${sha256(activation)}.json`;
  writer.writeContentAddressed(activationPath, activation);
  const draft = buildNativeMeasuredFinalDraft(f.root, invocation, activationPath);
  assert.equal(validateFinalProductionEvidence(f.root, draft.graph, nodeStableProjectFileSystem(), invocation).bindings.branch, 'selected-direction');
  const unbound = structuredClone(draft.graph); Reflect.deleteProperty(unbound, 'directionCapture');
  assert.throws(() => validateFinalProductionEvidence(f.root, unbound, nodeStableProjectFileSystem(), invocation), /owned current production capture/);
  writeFileSync(join(f.root, f.entry), `${readFileSync(join(f.root, f.entry), 'utf8')}\n<!-- source changed -->`);
  assert.throws(() => validateSelectedDirectionCapture(f.root, invocation, result.capture, { direction: f.art.record, beats: result.beats! }), /STALE_FINAL_OUTCOME_BINDING/);
});
