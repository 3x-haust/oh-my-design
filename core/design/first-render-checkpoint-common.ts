import type { FirstRenderCaptureBinding } from './first-render-review-contract.ts';

const SHA256 = /^[a-f0-9]{64}$/;

export class FirstRenderCheckpointError extends Error {
  override readonly name = 'FirstRenderCheckpointError';
  constructor(reason: string) {
    super(`FIRST_RENDER_CHECKPOINT_REFUSED: ${reason}`);
  }
}

export const failCheckpoint = (reason: string): never => {
  throw new FirstRenderCheckpointError(reason);
};

export function exactCheckpointFields(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  if (Object.keys(value).sort().join() !== [...keys].sort().join()) {
    failCheckpoint(`${label} fields changed`);
  }
}

export function checkpointRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    return failCheckpoint(`${label} is not an object`);
  }
  return value as Record<string, unknown>;
}

export function checkpointDigest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    return failCheckpoint(`${label} digest is invalid`);
  }
  return value;
}

export function checkpointText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) return failCheckpoint(`${label} is invalid`);
  return value;
}

export function parseCheckpointCaptures(value: unknown): readonly FirstRenderCaptureBinding[] {
  if (!Array.isArray(value) || value.length !== 2) {
    return failCheckpoint('checkpoint capture coverage is invalid');
  }
  const captures = value.map((item): FirstRenderCaptureBinding => {
    const row = checkpointRecord(item, 'checkpoint capture');
    exactCheckpointFields(row, ['viewport', 'captureSha256'], 'checkpoint capture');
    if (row.viewport !== 'desktop' && row.viewport !== 'mobile') {
      return failCheckpoint('checkpoint viewport is invalid');
    }
    return {
      viewport: row.viewport,
      captureSha256: checkpointDigest(row.captureSha256, 'checkpoint capture'),
    };
  });
  if (new Set(captures.map(capture => capture.viewport)).size !== 2) {
    failCheckpoint('checkpoint capture coverage is invalid');
  }
  return captures;
}
