import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import {
  parseSettledCaptureReceipt,
  type CaptureArtifact,
  type CaptureRect,
  type CaptureWitness,
  type SettledCaptureReceipt,
} from './settled-capture-schema.ts';

export {
  SETTLED_CAPTURE_SCHEMA,
  type SettledCaptureReceipt,
} from './settled-capture-schema.ts';

export type SettledCaptureFinding = Readonly<{
  id:
    | 'MALFORMED_SETTLED_CAPTURE'
    | 'CAPTURE_NOT_FIXED_VIEWPORT'
    | 'CAPTURE_PIXEL_DIMENSION_MISMATCH'
    | 'CAPTURE_SIGNAL_ORDER_INVALID'
    | 'CAPTURE_NOT_SETTLED'
    | 'CAPTURE_COMPUTED_VISIBILITY_INVALID'
    | 'CAPTURE_PIXEL_VISIBILITY_CONTRADICTION'
    | 'CAPTURE_PIXEL_GEOMETRY_CONTRADICTION';
  path: string;
  message: string;
}>;

const PNG_SIGNATURE = '89504e470d0a1a0a';

function bytes(root: string, value: CaptureArtifact): Buffer {
  if (isAbsolute(value.path)) throw new Error(`artifact path must be relative: ${value.path}`);
  const path = resolve(root, value.path);
  const rel = relative(resolve(root), path);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`artifact path escapes root: ${value.path}`);
  if (!lstatSync(path).isFile()) throw new Error(`artifact is not a regular file: ${value.path}`);
  const data = readFileSync(path);
  if (createHash('sha256').update(data).digest('hex') !== value.sha256) throw new Error(`artifact hash mismatch: ${value.path}`);
  return data;
}

function pngDimensions(data: Buffer): Readonly<{ width: number; height: number }> {
  if (data.length < 24 || data.subarray(0, 8).toString('hex') !== PNG_SIGNATURE || data.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error('artifact must be a PNG with an IHDR header');
  }
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function intersects(rect: CaptureRect, width: number, height: number): boolean {
  return rect.width > 0 && rect.height > 0 && rect.x < width && rect.y < height && rect.x + rect.width > 0 && rect.y + rect.height > 0;
}

function visible(witness: CaptureWitness, viewport: SettledCaptureReceipt['screenshot']['viewport']): boolean {
  const { computed } = witness;
  return computed.display !== 'none'
    && !['hidden', 'collapse'].includes(computed.visibility)
    && computed.opacity === 1
    && computed.textLength > 0
    && intersects(computed.rect, viewport.width, viewport.height);
}

export function validateSettledCaptureReceipt(root: string, value: unknown): SettledCaptureFinding[] {
  let receipt: SettledCaptureReceipt;
  try { receipt = parseSettledCaptureReceipt(value); } catch (error) {
    return [{ id: 'MALFORMED_SETTLED_CAPTURE', path: 'receipt', message: error instanceof Error ? error.message : String(error) }];
  }
  const findings: SettledCaptureFinding[] = [];
  const add = (id: SettledCaptureFinding['id'], path: string, message: string): void => { findings.push({ id, path, message }); };
  if (receipt.screenshot.mode !== 'fixed-viewport' || receipt.screenshot.deviceScaleFactor !== 1) {
    add('CAPTURE_NOT_FIXED_VIEWPORT', 'screenshot', 'primary evidence must use fixed-viewport mode at device scale factor 1');
  }
  try {
    const size = pngDimensions(bytes(root, receipt.screenshot));
    if (size.width !== receipt.screenshot.viewport.width || size.height !== receipt.screenshot.viewport.height) {
      add('CAPTURE_PIXEL_DIMENSION_MISMATCH', receipt.screenshot.path, `PNG is ${size.width}x${size.height}; viewport is ${receipt.screenshot.viewport.width}x${receipt.screenshot.viewport.height}`);
    }
  } catch (error) {
    add('CAPTURE_PIXEL_DIMENSION_MISMATCH', receipt.screenshot.path, error instanceof Error ? error.message : String(error));
    return findings;
  }
  const { trigger, signal } = receipt.transition;
  if (!(signal.subscribedOrder < trigger.order && trigger.order < signal.observedOrder
    && signal.observedOrder < receipt.settlement.order && receipt.settlement.order < receipt.screenshot.order)) {
    add('CAPTURE_SIGNAL_ORDER_INVALID', 'transition', 'required order is subscription < trigger < observation < settlement < capture');
  }
  const animations = receipt.settlement.finiteAnimations;
  if (receipt.settlement.rafCommitsBeforeAnimations !== 2 || receipt.settlement.rafCommitsAfterAnimations !== 2
    || animations.observed !== animations.settled || animations.pending !== 0
    || receipt.settlement.pendingAnimationFrameCallbacks !== 0) {
    add('CAPTURE_NOT_SETTLED', 'settlement', 'capture must settle a fixed point with two RAF commits on each side and no pending work');
  }
  for (const [label, item] of [['primary', receipt.primary], ['target', receipt.target]] as const) {
    if (!visible(item, receipt.screenshot.viewport)) add('CAPTURE_COMPUTED_VISIBILITY_INVALID', label, `${label} is not visibly rendered in the viewport`);
    try {
      const size = pngDimensions(bytes(root, item.maskedScreenshot));
      if (size.width !== receipt.screenshot.viewport.width || size.height !== receipt.screenshot.viewport.height) {
        add('CAPTURE_PIXEL_DIMENSION_MISMATCH', item.maskedScreenshot.path, `${label} mask dimensions do not match viewport`);
      } else if (item.maskedScreenshot.sha256 === receipt.screenshot.sha256) {
        add('CAPTURE_PIXEL_VISIBILITY_CONTRADICTION', label, `${label} claims visible but masking it changes no screenshot bytes`);
      }
    } catch (error) {
      add('CAPTURE_PIXEL_VISIBILITY_CONTRADICTION', label, error instanceof Error ? error.message : String(error));
    }
  }
  receipt.skipLinks.forEach((item, index) => {
    const label = `skipLinks[${index}]`;
    try {
      bytes(root, item.maskedScreenshot);
      const intersectsViewport = intersects(item.computed.rect, receipt.screenshot.viewport.width, receipt.screenshot.viewport.height);
      const pixelsChange = item.maskedScreenshot.sha256 !== receipt.screenshot.sha256;
      if (item.focused ? (!visible(item, receipt.screenshot.viewport) || !pixelsChange) : (intersectsViewport || pixelsChange)) {
        add('CAPTURE_PIXEL_GEOMETRY_CONTRADICTION', label, 'skip-link pixels and focus geometry disagree');
      }
    } catch (error) {
      add('CAPTURE_PIXEL_GEOMETRY_CONTRADICTION', label, error instanceof Error ? error.message : String(error));
    }
  });
  return findings;
}
