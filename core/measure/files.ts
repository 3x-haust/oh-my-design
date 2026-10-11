import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { acquireProjectMutationLock, replaceProjectFileAtomically, requireProjectWriteAdapterForInvocation, type ProjectWriteAdapter } from '../runtime/project-write.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { servedProjectTreeSha256 } from '../render/serve.ts';
import { decodePng } from '../motion/energy.ts';
import { canonicalBytes, digest, packetPayload, sha256 } from './identity.ts';
import { inputBinding, loadContracts, methodIdentity, readArtifact, sourceDigest } from './inputs.ts';
import { assertNativeCapture } from './capture.ts';
import { measureCaptures, type RetainedCapture } from './engine.ts';
import { parseVisualMeasurement } from './schema.ts';
import type { Receipt, VisualMeasurement } from './types.ts';
import * as v from './validation.ts';
const verified = new WeakMap<VisualMeasurement, string>();
const immutable = new WeakSet<VisualMeasurement>();
// Cache only deterministic replay. Every read still checks authority, current inputs and all
// retained bytes; a cache hit never establishes currentness or authorizes caller-owned values.
const replayed = new Set<string>();
function freezeNativeJson(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freezeNativeJson(child);
  Object.freeze(value);
}
function assertRequiredScope(packet: VisualMeasurement, contracts: ReturnType<typeof loadContracts>['contracts']): void {
  for (const [width, height] of [[1280, 900], [390, 844]]) if (!packet.scope.some(s => s.state === 'initial' && s.browserZoom === 1 && s.viewport.width === width && s.viewport.height === height)) v.fail('native packet omitted initial desktop/mobile scope');
  for (const required of [...contracts.type?.requiredViews ?? [], ...contracts.composition?.requiredViews ?? []]) {
    const view = packet.scope.find(s => s.id === required.id);
    if (!view || digest(view.viewport) !== digest(required.viewport) || view.browserZoom !== required.browserZoom || view.state !== (required.state?.name ?? 'initial')
      || view.stateRecipeSha256 !== digest(required.state ?? { state: 'initial' }) || (required.state && view.route !== required.state.route)) v.fail('native packet omitted or replaced owner-required view/state/zoom');
  }
}
/** Seal only native capture transactions. Storage/host authorization remains with the caller. */
export function sealNativeMeasurement(root: string, packet: VisualMeasurement, captures: RetainedCapture[]): { receipt: Receipt; bytes: Buffer } {
  captures.forEach(assertNativeCapture);
  if (digest(packet.captures) !== digest(captures.map(c => c.binding))) v.fail('packet capture inventory differs from the native transaction');
  const { contracts, inputs } = loadContracts(root);
  checkPacketCurrent(root, packet, inputs);
  assertRequiredScope(packet, contracts);
  const expected = measureCaptures(captures, packet.scope, contracts, packet.method);
  for (const key of ['subjects', 'measurements', 'findings', 'summary'] as const) if (digest(packet[key]) !== digest(expected[key])) v.fail('caller-authored measurement values refused');
  const payloadSha256 = digest(packetPayload(packet));
  packet.attestation = packet.binding.authority === 'native-local' ? { kind: 'native-observation-v1', payloadSha256, signature: signNativeObservation(realpathSync(root), 'visual-measurement-v1', payloadSha256) } : { kind: 'diagnostic-only', payloadSha256, signature: null };
  parseVisualMeasurement(packet);
  const bytes = canonicalBytes(packet), hash = sha256(bytes);
  return { receipt: { path: `.omd/visual-measurements/sha256-${hash}.json`, sha256: hash }, bytes };
}
export function assertVerifiedPacket(packet: VisualMeasurement): void { if (!verified.has(packet) || !immutable.has(packet)) v.fail('packet must be loaded, immutable and natively verified'); }
export function assertPacketCurrent(root: string, packet: VisualMeasurement): void {
  checkPacketCurrent(root, packet, loadContracts(root).inputs);
}
function checkPacketCurrent(root: string, packet: VisualMeasurement, inputs: ReturnType<typeof loadContracts>['inputs']): void {
  const b = packet.binding;
  if (b.projectIdentitySha256 !== digest(realpathSync(root)) || b.sourceSha256 !== sourceDigest(root)) v.fail('project/source changed');
  if (b.routeSha256 !== (existsSync(resolve(root, '.omd/route.json')) ? JSON.parse(readArtifact(root, '.omd/route.json').toString('utf8')).sha256 : null)) v.fail('route changed');
  if (digest(b.inputs) !== digest(inputs)) v.fail('selected contract inputs changed');
  for (const p of b.production) if (p.servedTreeSha256 !== servedProjectTreeSha256(root, p.entry)) v.fail('production build changed');
  if (digest(packet.method) !== digest(methodIdentity(packet.method.browser.version))) v.fail('measurement implementation/policy/browser changed');
}
/** No imported numeric evidence: every input capture must come from this process's native transaction. */
export function publishMeasurement(root: string, packet: VisualMeasurement, captures: RetainedCapture[], writer: ProjectWriteAdapter, invocation: ProjectRunInvocation): Receipt {
  requireProjectWriteAdapterForInvocation(root, writer, invocation);
  captures.forEach(assertNativeCapture);
  if (digest(packet.captures) !== digest(captures.map(c => c.binding))) v.fail('packet capture inventory differs from the native transaction');
  if (packet.binding.activationBuildSha256 !== invocation.current.buildSha256) v.fail('invocation build mismatch');
  const { bytes, receipt } = sealNativeMeasurement(root, packet, captures);
  const unlock = acquireProjectMutationLock(root, invocation);
  try {
    assertPacketCurrent(root, packet);
    const current = inputBinding(root, packet.binding.production[0]?.entry ?? null, packet.binding.scopeSha256, invocation);
    if (digest(current) !== digest(packet.binding)) v.fail('inputs changed before publication');
    for (const c of captures) { writer.writeContentAddressed(c.binding.capture.path, c.png); writer.writeContentAddressed(c.binding.ir.path, canonicalBytes(c.raw)); }
    writer.writeContentAddressed(receipt.path, bytes);
    replaceProjectFileAtomically({ projectRoot: root, relativePath: '.omd/visual-measurement.json', content: canonicalBytes({ schema: 'visual-measurement-pointer-v1', packet: receipt }), invocation });
  } finally { unlock(); }
  return receipt;
}
export function loadMeasurement(root: string, receipt: Receipt, options: { native?: boolean; current?: boolean } = {}): VisualMeasurement {
  v.receipt(receipt);
  if (receipt.path !== `.omd/visual-measurements/sha256-${receipt.sha256}.json`) v.fail('packet must use immutable content-addressed storage');
  const bytes = readArtifact(root, receipt.path);
  if (sha256(bytes) !== receipt.sha256) v.fail('packet bytes changed');
  const packet = parseVisualMeasurement(JSON.parse(bytes.toString('utf8')));
  if (!bytes.equals(canonicalBytes(packet)) || packet.attestation.payloadSha256 !== digest(packetPayload(packet))) v.fail('packet canonical payload mismatch');
  const native = packet.binding.authority === 'native-local' && packet.attestation.kind === 'native-observation-v1' && packet.attestation.signature !== null;
  if (options.native !== false && !native) v.fail('external diagnostic cannot authorize completion');
  if (native && !verifyNativeObservation(realpathSync(root), 'visual-measurement-v1', packet.attestation.payloadSha256, packet.attestation.signature!)) v.fail('native measurement signature invalid');
  const { contracts, inputs } = loadContracts(root);
  if (options.current !== false) { checkPacketCurrent(root, packet, inputs); assertRequiredScope(packet, contracts); }
  const replayKey = `${receipt.sha256}:${digest(contracts)}`, cached = replayed.has(replayKey), captures: RetainedCapture[] = [];
  for (const binding of packet.captures) {
    const png = readArtifact(root, binding.capture.path), rawBytes = readArtifact(root, binding.ir.path);
    if (sha256(png) !== binding.capture.sha256 || sha256(rawBytes) !== binding.ir.sha256) v.fail('retained capture/IR changed');
    if (cached) continue;
    const image = decodePng(png);
    if (image.width !== binding.image.width || image.height !== binding.image.height || sha256(image.pixels) !== binding.stability.beforePixelSha256) v.fail('capture dimensions/pixels mismatch');
    const raw = JSON.parse(rawBytes.toString('utf8'));
    if (digest(raw.measurement) !== binding.stability.beforeProjectionSha256) v.fail('IR projection mismatch');
    captures.push({ view: packet.scope.find(s => s.id === binding.viewId)!, binding, raw, png });
  }
  if (!cached) {
    const replay = measureCaptures(captures, packet.scope, contracts, packet.method);
    for (const key of ['subjects', 'measurements', 'findings', 'summary'] as const) if (digest(packet[key]) !== digest(replay[key])) v.fail('measurement replay mismatch');
    replayed.add(replayKey);
    if (replayed.size > 128) replayed.delete(replayed.values().next().value!);
  }
  if (native) { verified.set(packet, digest(packet)); freezeNativeJson(packet); immutable.add(packet); }
  return packet;
}
export function currentMeasurementReceipt(root: string): Receipt {
  const value = JSON.parse(readArtifact(root, '.omd/visual-measurement.json').toString('utf8'));
  v.object({ schema: v.enumeration('visual-measurement-pointer-v1'), packet: v.receipt })(value); return value.packet;
}
