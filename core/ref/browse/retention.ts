import { relative } from 'node:path';
import { canonicalJson, sha256 } from './json.ts';
import { refImagePath, refRecordPath, saveRef } from '../store.ts';
import { requireProjectWriteAdapter, type ProjectWriteAdapter } from '../../runtime/project-write.ts';
import { verifyBrowseSession, type VerifiedBrowseSession } from './verification.ts';
import { readBrowseBytes } from './trace.ts';
import { browseFail, type BrowseKeep, type BrowseReference, type BrowseRetention, type Receipt } from './contract.ts';

function projection(root: string, session: Receipt, verified: VerifiedBrowseSession, keep: BrowseKeep): BrowseReference {
  const event = verified.events[keep.capture.seq]!;
  const observation = verified.observations.get(event.observation!.sha256)!;
  const component = `browse-${verified.seal.sessionId.slice(0, 8)}-${keep.id.slice(0, 16)}`;
  const base = { source: observation.url, component, researchLane: verified.seal.lane };
  return { ...base, kind: observation.kind, capturedAt: event.time, imagePath: relative(root, refImagePath(root, base)),
    referenceUnit: 'whole-screen', sourceApp: keep.sourceApp, sourceUrl: keep.sourceUrl,
    zoomDetails: keep.details.map(detail => { const capture = verified.events[detail.seq]!.screenshot!; return { event: detail, image: { path: `.omd/refs/${verified.seal.lane}/details/${capture.sha256}.png`, sha256: capture.sha256 } }; }),
    // An item image's native pixel size does not establish the pictured app's CSS viewport/DPR.
    ...(observation.kind === 'image' ? {} : { viewport: observation.viewport }),
    ...(observation.selector ? { selector: observation.selector } : {}),
    invariants: observation.invariants, ...(observation.blueprint ? { blueprint: observation.blueprint } : {}), principles: [],
    acquisition: { requestedUrl: observation.url, finalUrl: observation.url, httpStatus: observation.httpStatus,
      links: observation.controls.flatMap(control => control.href ? [control.href] : []), imageSha256: keep.image.sha256 },
    browse: { schema: 'reference-browse-retention-v1', session, capture: keep.capture, keep: keep.keep } };
}
export function verifyBrowseRetention(root: string, retained: unknown, options: { sourceContractSha256?: string; current?: boolean } = {}) {
  const provenance = browseRetentionOf(retained);
  if (!provenance || provenance.schema !== 'reference-browse-retention-v1') browseFail('BROWSE_RETENTION', 'native retained browse provenance required', 2);
  const verified = verifyBrowseSession(root, provenance.session, options);
  const keep = verified.seal.keeps.find(keep => canonicalJson(keep.keep) === canonicalJson(provenance.keep)
    && canonicalJson(keep.capture) === canonicalJson(provenance.capture));
  if (!keep) browseFail('BROWSE_RETENTION_KEEP', 'capture is not a final surviving keep', 2);
  const expected = projection(root, provenance.session, verified, keep);
  if (canonicalJson(retained) !== canonicalJson(expected)) browseFail('BROWSE_RETENTION_PROJECTION', 'retained source, state, measurements or provenance differ from sealed capture', 2);
  const bytes = readBrowseBytes(root, { path: expected.imagePath!, sha256: keep.image.sha256 });
  if (!bytes.equals(verified.assets.get(keep.image.sha256)!)) browseFail('BROWSE_RETENTION_PIXELS', 'retained pixels differ', 2);
  return { ...verified, keep, reference: expected, observation: verified.observations.get(verified.events[keep.capture.seq]!.observation!.sha256)! };
}
export function publishBrowseRetentions(root: string, session: Receipt, writer: ProjectWriteAdapter) {
  requireProjectWriteAdapter(root, writer);
  const verified = verifyBrowseSession(root, session);
  return verified.seal.keeps.map(keep => {
    const reference = projection(root, session, verified, keep);
    writer.writeContentAddressed(reference.imagePath!, verified.assets.get(keep.image.sha256)!);
    for (const detail of reference.zoomDetails ?? []) writer.writeContentAddressed(detail.image.path, verified.assets.get(detail.image.sha256)!);
    // Native browse metadata is a deterministic projection, not a caller-authored Reference.
    saveRef(root, reference, writer);
    const captureBytes = `${JSON.stringify(reference, null, 2)}\n`;
    return { image: { path: reference.imagePath!, sha256: keep.image.sha256 },
      capture: { path: relative(root, refRecordPath(root, reference)), sha256: sha256(captureBytes) } };
  });
}
export function browseRetentionOf(value: unknown): BrowseRetention | undefined {
  return typeof value === 'object' && value !== null && 'browse' in value ? (value as BrowseReference).browse : undefined;
}
