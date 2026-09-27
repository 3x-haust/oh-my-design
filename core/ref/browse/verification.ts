import { canonicalJson, sha256 } from './json.ts';
import { validateReferencePng } from '../board-security.ts';
import { decodePng } from '../../motion/energy.ts';
import { cropBrowsePng, sameBrowsePixels } from './pixels.ts';
import { parseCanonical, readBrowseBytes, replayBrowseKeeps, traceBytes, tracePath, verifySigned } from './trace.ts';
import { browseUrl } from './safety.ts';
import { validateRecordedBrowseAction, validateBrowseObservationShape } from './validation.ts';
import { browseFail, type BrowseEvent, type BrowseObservation, type BrowseSeal, type Checkpoint, type Receipt } from './contract.ts';

export type VerifiedBrowseSession = Readonly<{ seal: BrowseSeal; events: readonly BrowseEvent[]; observations: ReadonlyMap<string, BrowseObservation>; assets: ReadonlyMap<string, Buffer> }>;
const EVENT_KEYS = ['schema', 'sessionId', 'lane', 'seq', 'prevHash', 'hash', 'requestId', 'actor', 'time', 'elapsedMs', 'action', 'url', 'finalUrl', 'documentId', 'predecessorObservation', 'target', 'outcome', 'screenshot', 'observation', 'error'];
const SEAL_KEYS = ['schema', 'sessionId', 'lane', 'sourceContractSha256', 'buildSha256', 'mode', 'consent', 'startedAt', 'endedAt', 'eventCount', 'terminalHash', 'trace', 'assets', 'keeps', 'budget', 'stopReason', 'confidenceDebt', 'limitations', 'recovery', 'signature'];
function keys(value: object, expected: readonly string[]) { if (Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) browseFail('BROWSE_SCHEMA', 'unknown or missing fields', 2); }
export function verifyBrowseSession(root: string, receipt: Receipt, options: { sourceContractSha256?: string; current?: boolean; now?: number } = {}): VerifiedBrowseSession {
  const match = /^\.omd\/discovery\/browse\/([a-f0-9]{32})\/seals\/([a-f0-9]{64})\.json$/.exec(receipt.path);
  if (!match || match[2] !== receipt.sha256) browseFail('BROWSE_SEAL_PATH', 'exact native seal receipt required', 2);
  const seal = parseCanonical<BrowseSeal>(readBrowseBytes(root, receipt)); keys(seal, SEAL_KEYS);
  if (seal.schema !== 'reference-browse-session-v1' || seal.sessionId !== match[1] || !['domain', 'design'].includes(seal.lane)
    || !['headless', 'profile', 'cdp'].includes(seal.mode) || seal.trace.path !== tracePath(seal.sessionId)
    || !Number.isInteger(seal.eventCount) || seal.eventCount < 2 || seal.eventCount > 500 || !Array.isArray(seal.assets)
    || seal.assets.length > 2000) browseFail('BROWSE_SEAL_SCHEMA', 'invalid native seal', 2);
  verifySigned(root, seal);
  if (options.sourceContractSha256 !== undefined && seal.sourceContractSha256 !== options.sourceContractSha256) browseFail('BROWSE_CONTRACT_STALE', 'source contract changed', 2);
  if (seal.mode !== 'headless' && (!seal.consent || seal.consent.mode !== seal.mode || seal.consent.sourceContractSha256 !== seal.sourceContractSha256)) browseFail('BROWSE_CONSENT', 'mode is not consent-bound', 2);
  const trace = readBrowseBytes(root, seal.trace).toString('utf8');
  if (!trace.endsWith('\n') || trace.length > 8 * 1024 * 1024) browseFail('BROWSE_TRACE_ENCODING', 'invalid trace length/encoding', 2);
  const lines = trace.slice(0, -1).split('\n'); if (lines.length !== seal.eventCount) browseFail('BROWSE_TRACE_COUNT', 'trace truncated or extended', 2);
  const assets = new Map<string, Buffer>(); let total = 0;
  for (const item of seal.assets) {
    if (item.path !== `.omd/discovery/browse/${seal.sessionId}/${item.path.split('/').at(-2)}/${item.sha256}.${item.path.endsWith('.png') ? 'png' : 'json'}`
      || !['assets', 'observations', 'sheets'].includes(item.path.split('/').at(-2) ?? '') || assets.has(item.sha256)) browseFail('BROWSE_ASSET_PATH', 'noncanonical or duplicate native asset', 2);
    const bytes = readBrowseBytes(root, item); total += bytes.length; if (total > 256 * 1024 * 1024) browseFail('BROWSE_ASSET_LIMIT', 'asset budget exceeded', 2);
    if (item.path.endsWith('.png')) validateReferencePng(bytes); else parseCanonical(bytes);
    assets.set(item.sha256, bytes);
  }
  const events: BrowseEvent[] = [], observations = new Map<string, BrowseObservation>();
  let priorObservation: string | null = null, previousTime = 0;
  for (const [index, line] of lines.entries()) {
    const event = parseCanonical<BrowseEvent>(Buffer.from(`${line}\n`)); keys(event, EVENT_KEYS);
    validateRecordedBrowseAction(event.action);
    const { hash, ...unsigned } = event;
    if (event.schema !== 'reference-browse-event-v1' || event.sessionId !== seal.sessionId || event.lane !== seal.lane || event.seq !== index
      || event.prevHash !== (events.at(-1)?.hash ?? null) || sha256(canonicalJson(unsigned)) !== hash
      || event.predecessorObservation !== priorObservation || !Number.isFinite(Date.parse(event.time))
      || Date.parse(event.time) < previousTime || !Number.isFinite(event.elapsedMs) || event.elapsedMs < 0
      || (index === 0 ? event.action.verb !== 'start' : event.action.verb === 'start')
      || (index < lines.length - 1 && event.action.verb === 'end')) browseFail('BROWSE_CHAIN', 'event sequence, identity, time or digest differs', 2);
    previousTime = Date.parse(event.time);
    readBrowseBytes(root, { path: `.omd/discovery/browse/${seal.sessionId}/events/${hash}.json`, sha256: sha256(`${line}\n`) });
    for (const value of [event.url, event.finalUrl]) if (value !== null && browseUrl(value) !== value) browseFail('BROWSE_URL', 'noncanonical recorded URL', 2);
    if (event.screenshot && !seal.assets.some(item => canonicalJson(item) === canonicalJson(event.screenshot) && item.path.endsWith('.png'))) browseFail('BROWSE_SCREENSHOT_RECEIPT', 'screenshot not in signed asset manifest', 2);
    if (event.error !== null && (event.screenshot !== null || event.observation !== null || event.finalUrl !== null)) browseFail('BROWSE_FAILURE_PIXELS', 'failed transitions cannot claim destination evidence', 2);
    if (event.target !== null) {
      const prior = priorObservation ? observations.get(priorObservation) : undefined;
      if (!prior || !prior.controls.some(control => canonicalJson(control) === canonicalJson(event.target))) browseFail('BROWSE_TARGET_CHAIN', 'target was not immediately witnessed', 2);
    }
    if (event.observation) {
      const bytes = assets.get(event.observation.sha256);
      if (!bytes || !seal.assets.some(item => canonicalJson(item) === canonicalJson(event.observation))) browseFail('BROWSE_OBSERVATION', 'observation missing from signed manifest', 2);
      const observed = parseCanonical<BrowseObservation>(bytes);
      validateBrowseObservationShape(observed);
      if (observed.schema !== 'reference-browse-observation-v1' || observed.url !== event.finalUrl || observed.documentId !== event.documentId
        || observed.controls.length > 200 || observed.text.length > 24_000 || observed.dpr !== 1 || !event.screenshot) browseFail('BROWSE_OBSERVATION_BINDING', 'document/capture mismatch', 2);
      if (!['scoped-dom', 'image-only', 'not-measured'].includes(observed.measurement)
        || (observed.kind === 'component' && (observed.measurement !== 'scoped-dom' || !observed.invariants || !observed.blueprint || !observed.vector))
        || (observed.kind === 'image' && (observed.measurement !== 'image-only' || observed.invariants !== null || observed.blueprint !== null || observed.vector !== null))) browseFail('BROWSE_MEASUREMENT_SCOPE', 'image-only must be explicit; missing component measurements are not visual-only', 2);
      if (!seal.assets.some(item => canonicalJson(item) === canonicalJson(observed.screenshot))) browseFail('BROWSE_VIEWPORT_RECEIPT', 'parent screenshot not in signed manifest', 2);
      const parent = assets.get(observed.screenshot.sha256), capture = assets.get(event.screenshot.sha256);
      if (!parent || !capture) browseFail('BROWSE_PIXELS', 'native capture pixels missing', 2);
      const png = decodePng(parent);
      if (png.width !== observed.viewport.width * observed.dpr || png.height !== observed.viewport.height * observed.dpr) browseFail('BROWSE_VIEWPORT', 'actual pixel dimensions differ', 2);
      if (observed.wholeImage) {
        const full = decodePng(capture);
        if (observed.crop || observed.kind !== 'image' || event.action.verb !== 'shot' || !event.action.selector
          || full.width !== observed.wholeImage.width || full.height !== observed.wholeImage.height
          || !/^[a-f0-9]{64}$/.test(observed.wholeImage.originalSha256) || !observed.mediaUrl) browseFail('BROWSE_WHOLE_IMAGE', 'whole original image identity/dimensions differ', 2);
      } else if (observed.crop ? !sameBrowsePixels(cropBrowsePng(parent, observed.crop), capture) : !parent.equals(capture)) browseFail('BROWSE_CROP_PIXELS', 'crop is not the exact viewport region', 2);
      observations.set(event.observation.sha256, observed); priorObservation = event.observation.sha256;
    }
    events.push(event);
  }
  if (events.at(-1)?.action.verb !== 'end' || events.at(-1)?.hash !== seal.terminalHash) browseFail('BROWSE_TERMINAL', 'missing terminal event', 2);
  if (seal.recovery) {
    const prefix = parseCanonical<Checkpoint>(readBrowseBytes(root, seal.recovery)); verifySigned(root, prefix);
    if (prefix.schema !== 'reference-browse-checkpoint-v1' || prefix.sessionId !== seal.sessionId || prefix.sourceContractSha256 !== seal.sourceContractSha256
      || prefix.eventCount !== events.length - 1 || prefix.terminalHash !== events.at(-2)?.hash || prefix.traceSha256 !== sha256(traceBytes(events.slice(0, -1)))
      || canonicalJson(prefix.assets) !== canonicalJson(seal.assets) || seal.stopReason !== 'interrupted') browseFail('BROWSE_RECOVERY_PREFIX', 'recovery must bind exactly the native prefix', 2);
  }
  const replayed = replayBrowseKeeps(events, observations, seal.mode);
  if (canonicalJson(replayed) !== canonicalJson(seal.keeps)) browseFail('BROWSE_TRAY', 'signed tray differs from replayed keeps/drops', 2);
  if (options.current !== false) {
    const now = options.now ?? Date.now();
    for (const keep of replayed) {
      const event = events[keep.capture.seq]!; const time = Date.parse(event.time);
      if (time < now - 7 * 86400_000 || time > now + 300_000) browseFail('BROWSE_CAPTURE_STALE', 'capture is not within seven days/current clock', 2);
    }
  }
  return { seal, events, observations, assets };
}
