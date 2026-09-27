import { canonicalJson } from './board-artifacts.ts';
import { loadRefs } from './store.ts';
import { parseImageFragmentRecord } from './image-fragment-parser.ts';
import { requireDesignImageAdmission } from './design-image-admission.ts';
import { browseFail, type EventRef, type BrowseReference } from './browse/contract.ts';
import { verifyBrowseRetention } from './browse/retention.ts';
import { verifyBrowseSession } from './browse/verification.ts';
import { readBrowseBytes } from './browse/trace.ts';
import { browseUrl } from './browse/safety.ts';
import type { BrowseDesignDiscovery, BrowseSourceProvenance, ResearchEvidence, ResearchLane, ResearchSource } from './reference-research-types.ts';
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) browseFail('REFERENCE_RESEARCH_BROWSE_KEYS', 'closed browse provenance required', 2);
  return value as Record<string, unknown>;
}
function ref(value: unknown): EventRef {
  const input = object(value, ['seq', 'hash']);
  if (!Number.isInteger(input.seq) || Number(input.seq) < 0 || typeof input.hash !== 'string' || !/^[a-f0-9]{64}$/.test(input.hash)) browseFail('REFERENCE_RESEARCH_BROWSE_EVENT', 'exact event ref required', 2);
  return { seq: Number(input.seq), hash: input.hash };
}
export function parseBrowseSessionReceipt(value: unknown): ResearchEvidence {
  const input = object(value, ['path', 'sha256']);
  if (typeof input.path !== 'string' || typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.sha256)
    || !new RegExp(`^\\.omd/discovery/browse/[a-f0-9]{32}/seals/${input.sha256}\\.json$`).test(input.path)) browseFail('REFERENCE_RESEARCH_BROWSE_RECEIPT', 'native session seal receipt required', 2);
  return { path: input.path, sha256: input.sha256 };
}
export function parseBrowseSourceProvenance(value: unknown): BrowseSourceProvenance {
  const input = object(value, ['kind', 'session', 'capture', 'keep']);
  if (input.kind !== 'recorded-browse') browseFail('REFERENCE_RESEARCH_BROWSE_KIND', 'recorded-browse required', 2);
  return { kind: 'recorded-browse', session: parseBrowseSessionReceipt(input.session), capture: ref(input.capture), keep: ref(input.keep) };
}
export function parseBrowseDesignDiscovery(value: unknown): BrowseDesignDiscovery {
  const input = object(value, ['kind', 'url', 'access', 'qualityReason', 'session', 'entry']);
  if (input.kind !== 'recorded-browse' || !['public', 'user-session'].includes(String(input.access))
    || typeof input.url !== 'string' || typeof input.qualityReason !== 'string' || input.qualityReason.trim().length < 20) browseFail('REFERENCE_RESEARCH_BROWSE_DISCOVERY', 'native entry and concrete quality judgment required', 2);
  return { kind: 'recorded-browse', url: browseUrl(input.url), access: input.access as 'public' | 'user-session', qualityReason: input.qualityReason,
    session: parseBrowseSessionReceipt(input.session), entry: ref(input.entry) };
}
export function validateBrowseLane(root: string, lane: ResearchLane, name: 'domain' | 'design', contract: string): void {
  const sessions = lane.browseSessions ?? [];
  if (new Set(sessions.map(item => item.sha256)).size !== sessions.length) browseFail('REFERENCE_RESEARCH_BROWSE_DUPLICATE', 'one seal per lane', 2);
  for (const receipt of sessions) if (verifyBrowseSession(root, receipt, { sourceContractSha256: contract }).seal.lane !== name) browseFail('REFERENCE_RESEARCH_BROWSE_LANE', 'session belongs to other lane', 2);
  for (const source of lane.sources) if (source.provenance) {
    if (!sessions.some(session => canonicalJson(session) === canonicalJson(source.provenance!.session))) browseFail('REFERENCE_RESEARCH_BROWSE_SESSION_REQUIRED', 'source session missing from lane list', 2);
    validateBrowseSourceCoverage(root, source, name, contract);
  }
}
export function validateBrowseSourceCoverage(root: string, source: ResearchSource, lane: 'domain' | 'design', contract: string) {
  const provenance = source.provenance ?? browseFail('REFERENCE_RESEARCH_BROWSE_PROVENANCE', 'source provenance required', 2);
  const record = JSON.parse(readBrowseBytes(root, source.capture).toString('utf8'));
  let native: BrowseReference = record, fragmentPath: string | null = null;
  if (record.schemaVersion === 'image-fragment-v1') {
    const fragment = parseImageFragmentRecord(record);
    if (lane !== 'design' || fragment.provenance.cropBox !== undefined || fragment.provenance.sourcePage !== source.url) browseFail('REFERENCE_RESEARCH_WHOLE_SCREEN_REQUIRED', 'browse board images preserve the entire screen; zoom fragments cannot replace references', 2);
    requireDesignImageAdmission(root, fragment);
    native = loadRefs(root).find(ref => ref.browse && canonicalJson(ref.browse.session) === canonicalJson(provenance.session)
      && canonicalJson(ref.browse.capture) === canonicalJson(provenance.capture) && canonicalJson(ref.browse.keep) === canonicalJson(provenance.keep))
      ?? browseFail('REFERENCE_RESEARCH_BROWSE_PARENT', 'whole-screen parent not found', 2);
    fragmentPath = fragment.imagePath;
  }
  const verified = verifyBrowseRetention(root, native, { sourceContractSha256: contract });
  if (lane === 'domain' && verified.observation.kind === 'image') browseFail('REFERENCE_RESEARCH_DOMAIN_LIVE_UI_REQUIRED', 'a pictured app is visual-only, not an inspected live service', 2);
  if (verified.seal.lane !== lane || source.url !== verified.reference.source || source.evidence.path !== (fragmentPath ?? verified.reference.imagePath)
    || source.evidence.sha256 !== verified.keep.image.sha256 || source.observedAt !== verified.reference.capturedAt.slice(0, 10)
    || canonicalJson(provenance) !== canonicalJson({ kind: 'recorded-browse', session: native.browse!.session, capture: native.browse!.capture, keep: native.browse!.keep })) browseFail('REFERENCE_RESEARCH_BROWSE_SOURCE', 'source does not bind exact retained native keep', 2);
  if (lane === 'design') {
    const discovery = source.discovery;
    if (!discovery || discovery.kind !== 'recorded-browse' || canonicalJson(discovery.session) !== canonicalJson(provenance.session)) browseFail('REFERENCE_RESEARCH_BROWSE_DISCOVERY', 'design discovery must bind same session', 2);
    const entry = verified.events[discovery.entry.seq];
    if (!entry || entry.hash !== discovery.entry.hash || entry.outcome !== 'observed' || entry.finalUrl !== discovery.url
      || entry.seq > provenance.capture.seq || !entry.observation
      || verified.events.slice(entry.seq + 1, provenance.capture.seq).some(event => ['goto', 'external-intervention'].includes(event.action.verb))
      || discovery.access !== (verified.seal.mode === 'headless' ? 'public' : 'user-session')) browseFail('REFERENCE_RESEARCH_BROWSE_PATH', 'entry/capture path is disconnected or fabricated', 2);
  }
  return verified;
}
