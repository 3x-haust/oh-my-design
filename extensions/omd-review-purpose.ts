import { existsSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { verifyReviewPurposeAuthority, type ReviewPurpose, type ReviewPurposeOrigin } from '../core/route/review-purpose-authority.ts';
import * as v from '../core/brief/candidate-data.ts';
import { readPiRequest } from './omd-request-source.ts';

/** An explicit first-line invocation directive, not a semantic guess from product benchmark text. */
export function requestedReviewPurpose(request: string): ReviewPurpose {
  return /^Review purpose: (ordinary|benchmark|release)(?:\r?\n|$)/.exec(request)?.[1] as ReviewPurpose | undefined ?? 'ordinary';
}

/** Called only when an actual interactive/RPC full-build input is activated. No CLI signer exists. */
export function observePiReviewPurpose(root: string, request: string, source: 'pi-interactive' | 'pi-rpc') {
  const captured = readPiRequest(root);
  if (!captured || captured.request !== request) throw new Error('REVIEW_PURPOSE_ORIGIN: genuine activated original request required');
  const projectRoot = realpathSync(root), purpose = requestedReviewPurpose(request);
  const payload = { schema: 'review-purpose-origin-v1' as const, projectRoot, purpose, requestSha256: v.hash(request), source, observedAt: new Date().toISOString() };
  const origin: ReviewPurposeOrigin = { ...payload, signature: signNativeObservation(projectRoot, payload.schema, v.digest(payload)) };
  const bytes = v.jsonBytes(origin), sha256 = v.hash(bytes), path = `.omd/review-purpose-authorities/sha256-${sha256}.json`;
  // Genuine host input precedes a route/project writer, like the existing signed Pi request family.
  const directory = join(projectRoot, '.omd/review-purpose-authorities');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (realpathSync(directory) !== directory) throw new Error('REVIEW_PURPOSE_ORIGIN: authority directory must not be a symlink');
  writeFileSync(join(projectRoot, path), bytes, { flag: 'wx', mode: 0o600 });
  return { reviewPurpose: purpose, reviewPurposeAuthority: { path, sha256 } };
}
export function readPiReviewPurpose(root: string, request: string) {
  const directory = join(root, '.omd/review-purpose-authorities'), purpose = requestedReviewPurpose(request);
  if (existsSync(directory)) for (const name of readdirSync(directory).sort()) {
    const match = /^sha256-([a-f0-9]{64})\.json$/.exec(name); if (!match) continue;
    const receipt = { path: `.omd/review-purpose-authorities/${name}`, sha256: match[1]! };
    const origin = JSON.parse(v.readReceipt(root, receipt).toString('utf8')) as ReviewPurposeOrigin;
    if (origin.requestSha256 !== v.hash(request) || origin.purpose !== purpose) continue;
    verifyReviewPurposeAuthority(root, receipt, purpose, request);
    if (origin.source !== 'pi-interactive' && origin.source !== 'pi-rpc') continue;
    return { reviewPurpose: purpose, reviewPurposeAuthority: receipt };
  }
  throw new Error('REVIEW_PURPOSE_ORIGIN_REQUIRED: start the current workflow from genuine interactive/RPC input; historical routes are not silently migrated');
}
