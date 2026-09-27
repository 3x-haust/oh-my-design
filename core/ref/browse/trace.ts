import { resolve } from 'node:path';
import { canonicalJson, sha256 } from './json.ts';
import { referenceServiceFamily } from '../design-discovery-sources.ts';
import { signNativeObservation, verifyNativeObservation } from '../../runtime/self-signed-activation.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../../runtime/stable-project-file.ts';
import { browseFail, type BrowseEvent, type BrowseObservation, type BrowseKeep, type Checkpoint, type Binding, type Receipt } from './contract.ts';

export const tracePath = (id: string) => `.omd/discovery/browse/${id}/trace.jsonl`;
export const traceBytes = (events: readonly BrowseEvent[]) => events.map(event => `${canonicalJson(event)}\n`).join('');
export const eventRef = (event: BrowseEvent) => ({ seq: event.seq, hash: event.hash });
export function signed<T extends { schema: string }>(root: string, value: T): T & { signature: string } {
  return { ...value, signature: signNativeObservation(root, value.schema, sha256(canonicalJson(value))) };
}
export function verifySigned(root: string, value: { schema: string; signature: string }): void {
  const { signature, ...payload } = value;
  if (typeof signature !== 'string' || !verifyNativeObservation(root, value.schema, sha256(canonicalJson(payload)), signature)) browseFail('BROWSE_SIGNATURE', 'native project signature invalid', 2);
}
export function nativeEvent(value: Omit<BrowseEvent, 'hash'>): BrowseEvent { return { ...value, hash: sha256(canonicalJson(value)) }; }
export function checkpoint(binding: Binding, events: readonly BrowseEvent[], assets: readonly Receipt[]): Checkpoint {
  return signed(binding.root, { schema: 'reference-browse-checkpoint-v1' as const, sessionId: binding.sessionId,
    sourceContractSha256: binding.sourceContractSha256, eventCount: events.length, terminalHash: events.at(-1)!.hash,
    traceSha256: sha256(traceBytes(events)), assets, budget: binding.budget, buildSha256: binding.buildSha256, mode: binding.start.mode, consent: binding.consent });
}
export function readBrowseBytes(root: string, receipt: Receipt): Buffer {
  if (!/^[a-f0-9]{64}$/.test(receipt.sha256) || !/^\.omd\/(?:discovery\/browse\/|refs\/)/.test(receipt.path)
    || receipt.path.includes('\\') || receipt.path.split('/').includes('..')) browseFail('BROWSE_RECEIPT', 'invalid evidence receipt', 2);
  const bytes = readStableProjectFile({ root: resolve(root), path: resolve(root, receipt.path), label: receipt.path, fs: nodeStableProjectFileSystem() });
  if (bytes.length > 50 * 1024 * 1024 || sha256(bytes) !== receipt.sha256) browseFail('BROWSE_DIGEST', 'evidence bytes differ', 2);
  return bytes;
}
export function parseCanonical<T>(bytes: Buffer): T {
  let value: T;
  try { value = JSON.parse(bytes.toString('utf8')) as T; } catch { return browseFail('BROWSE_ENCODING', 'invalid JSON', 2); }
  if (`${canonicalJson(value)}\n` !== bytes.toString('utf8')) browseFail('BROWSE_ENCODING', 'canonical JSON required; duplicate keys and alternate encodings refused', 2);
  return value;
}
export function replayBrowseKeeps(events: readonly BrowseEvent[], observations: ReadonlyMap<string, BrowseObservation>, mode: Binding['start']['mode']): BrowseKeep[] {
  const keeps = new Map<string, BrowseKeep>();
  for (const event of events) {
    if (event.outcome !== 'observed') continue;
    if (event.action.verb === 'keep') {
      const action = event.action;
      const capture = events.find(item => item.hash === action.capture && item.seq < event.seq);
      const observation = capture?.observation ? observations.get(capture.observation.sha256) : undefined;
      if (!capture || capture.action.verb !== 'shot' || !capture.screenshot || !observation?.retainable || observation.crop !== null
        || capture.outcome !== 'observed' || (action.lane && action.lane !== event.lane)
        || action.reason.length < 20 || action.reason.length > 500
        || (event.lane === 'design' ? action.role === 'task-flow' : action.role !== 'task-flow')) browseFail('BROWSE_KEEP_BINDING', 'keep is not bound to a successful same-lane capture', 2);
      keeps.set(event.hash, { id: event.hash, capture: eventRef(capture), keep: eventRef(event), reason: action.reason,
        role: action.role ?? (event.lane === 'domain' ? 'task-flow' : 'visual-direction'), direction: action.direction,
        rights: action.rights, rightsNotes: action.rightsNotes, source: observation.url, image: capture.screenshot,
        sourceApp: action.sourceApp ?? referenceServiceFamily(observation.url), sourceUrl: observation.url, details: [],
        vector: observation.vector, visibility: mode === 'headless' ? 'public' : 'user-session' });
    } else if (event.action.verb === 'crop') {
      const parent = event.action.reference ? keeps.get(event.action.reference) : undefined;
      const capture = event.observation ? observations.get(event.observation.sha256) : undefined;
      if (!parent || !capture?.crop || capture.url !== parent.source || capture.screenshot.sha256 !== parent.image.sha256 || !event.screenshot) browseFail('BROWSE_DETAIL_PARENT', 'zoom detail must attach to an existing whole-screen keep from this source', 2);
      keeps.set(parent.id, { ...parent, details: [...parent.details, eventRef(event)] });
    } else if (event.action.verb === 'drop' && event.action.keep !== null) {
      if (!keeps.delete(event.action.keep)) browseFail('BROWSE_DROP_BINDING', 'drop does not name a live keep', 2);
    }
  }
  return [...keeps.values()];
}
