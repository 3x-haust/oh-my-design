import { resolve } from 'node:path';
import { sha256 } from '../measure/identity.ts';
import { parseTrustedOutcomeProjection } from '../evidence/final-v2-outcome-gate.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import { nativeOutcomeExecutionEvidence } from './native-outcome-review.ts';
import { validateObservationV2 } from './observation.ts';
import { parseTrustedBrowserReceipt, trustedBrowserReceiptSha256 } from './trusted-browser-receipt.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from './stable-project-file.ts';

class NativeTemporalEvidenceError extends Error {
  override readonly name = 'NativeTemporalEvidenceError';
}

export function sourceFreeTemporalRenders(root: string, invocation: ProjectRunInvocation, observationSha256: string) {
  const read = (path: string) => readStableProjectFile({
    root, path: resolve(root, path), label: 'temporal observation', fs: nodeStableProjectFileSystem(),
  });
  if (!/^[a-f0-9]{64}$/.test(observationSha256)) throw new NativeTemporalEvidenceError('observation digest');
  const bytes = read(`.omd/observation-v2/sha256-${observationSha256}.json`);
  if (sha256(bytes) !== observationSha256) throw new NativeTemporalEvidenceError('observation changed');
  const observation = validateObservationV2(JSON.parse(bytes.toString('utf8')));
  if (typeof observation.evidence !== 'object' || observation.evidence === null
    || !Object.hasOwn(observation.evidence, 'trustedOutcome')) return [];
  const projection = parseTrustedOutcomeProjection(Reflect.get(observation.evidence, 'trustedOutcome'));
  const receipt = parseTrustedBrowserReceipt(JSON.parse(
    read(`.omd/trusted-browser-receipt-sha256-${projection.receiptSha256}.json`).toString('utf8')));
  if (trustedBrowserReceiptSha256(receipt) !== projection.receiptSha256) {
    throw new NativeTemporalEvidenceError('receipt changed');
  }
  if (receipt.temporalCaptures === undefined) return [];
  return (nativeOutcomeExecutionEvidence(root, invocation, observationSha256).temporalCaptures ?? [])
    .map((capture, index) => ({
      sequence: Math.floor(index / 3),
      viewport: capture.viewport,
      phase: capture.phase,
      captureMoment: capture.captureMoment,
      playbackSampling: capture.playbackSampling,
      captureSha256: capture.captureSha256,
      width: capture.width,
      height: capture.height,
      pngBase64: capture.pngBase64,
    }));
}
