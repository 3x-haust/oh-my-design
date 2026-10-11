import type { Blueprint, Invariants, Reference } from '../../types.ts';
import type { VisualVector } from '../../visual-vector.ts';

export type Receipt = Readonly<{ path: string; sha256: string }>;
export type EventRef = Readonly<{ seq: number; hash: string }>;
export type Lane = 'domain' | 'design';
export type Mode = 'headless' | 'profile' | 'cdp';
export type Box = Readonly<{ x: number; y: number; width: number; height: number }>;
export type Start = Readonly<{ verb: 'start'; lane: Lane; mode: Mode; cdpUrl: string | null;
  userOptIn: boolean; headed: boolean; allowAuthOrigins: readonly string[]; allowPricing: boolean;
  budgetActions: number; budgetMinutes: number; viewport: { width: number; height: number } }>;
type Ready = Readonly<{ readySelector: string | null }>;
type Target = Readonly<{ selector: string | null; text: string | null }>;
export type BrowseAction = Start
  | (Readonly<{ verb: 'goto'; url: string; reason: string; scope: 'target-market' | 'global' | 'unscoped'; sourceId: string | null; flowId: string | null }> & Ready)
  | (Readonly<{ verb: 'search'; provider: string; query: string; queryParam: string; querySelector: string | null; submitSelector: string | null; scope: 'target-market' | 'global' | 'unscoped' }> & Ready)
  | (Readonly<{ verb: 'scroll'; direction: 'up' | 'down' | 'left' | 'right'; amount: number | null; selector: string | null }> & Ready)
  | (Readonly<{ verb: 'click' | 'similar' }> & Target & Ready)
  | (Readonly<{ verb: 'back' }> & Ready)
  | Readonly<{ verb: 'shot'; selector: string | null; screenId: string | null; state: string | null; assertVisible: readonly string[]; assertHidden: readonly string[] }>
  | Readonly<{ verb: 'crop'; selector: string; reference: string | null; as: string | null; slot: string | null }>
  | Readonly<{ verb: 'keep'; sourceApp: string | null; capture: string | null; lane: Lane | null; reason: string; role: 'visual-direction' | 'component-support' | 'task-flow' | null; direction: string | null; rights: 'allowed' | 'restricted' | 'unknown'; rightsNotes: string | null }>
  | Readonly<{ verb: 'drop'; keep: string | null; reason: string }>
  | Readonly<{ verb: 'contact-sheet'; page: number; columns: 2 | 3 | 4 }>
  | Readonly<{ verb: 'status' }>
  | Readonly<{ verb: 'end'; reason: 'complete' | 'budget' | 'saturated' | 'interrupted' }>
  | Readonly<{ verb: 'external-intervention'; reason: string }>;
export type BrowseCommand = Readonly<{ action: BrowseAction; session: string | null; expectHead: string | null; activation: string | null; json: boolean }>;
export type BrowseControl = Readonly<{ selector: string; tag: string; role: string | null; label: string;
  href: string | null; type: string | null; expanded: string | null; controls: string | null; download: boolean; box: Box }>;
export type BrowseObservation = Readonly<{ schema: 'reference-browse-observation-v1'; url: string; documentId: string;
  httpStatus: number; renderSha256: string; title: string; text: string; taskText: string; linkClaims: readonly Readonly<{ url: string; text: string }>[]; controls: readonly BrowseControl[]; viewport: { width: number; height: number };
  dpr: number; scroll: { x: number; y: number }; screenshot: Receipt; masks: readonly string[]; obstructions: readonly string[];
  retainable: boolean; limitation: string | null; crop: Box | null; selector: string | null; mediaUrl: string | null;
  wholeImage: Readonly<{ width: number; height: number; originalSha256: string }> | null;
  measurement: 'scoped-dom' | 'image-only' | 'not-measured';
  kind: 'page' | 'component' | 'image'; invariants: Invariants | null; blueprint: Blueprint | null; vector: VisualVector | null }>;
export type BrowseEvent = Readonly<{ schema: 'reference-browse-event-v1'; sessionId: string; lane: Lane;
  seq: number; prevHash: string | null; hash: string; requestId: string; actor: 'model-command' | 'runtime';
  time: string; elapsedMs: number; action: BrowseAction; url: string | null; finalUrl: string | null;
  documentId: string | null; predecessorObservation: string | null; target: BrowseControl | null;
  outcome: 'observed' | 'no-change' | 'blocked' | 'failed' | 'rejected'; screenshot: Receipt | null;
  observation: Receipt | null; error: { code: string; message: string } | null }>;
export type BrowseBudget = Readonly<{ startedAt: string; deadline: string; maxActions: number; actions: number; metadataEvents: number }>;
export type StopReason = 'budget' | 'saturated' | 'complete' | 'interrupted' | null;
export type BrowseKeep = Readonly<{ id: string; capture: EventRef; keep: EventRef; reason: string;
  role: 'visual-direction' | 'component-support' | 'task-flow'; direction: string | null;
  rights: 'allowed' | 'restricted' | 'unknown'; rightsNotes: string | null;
  source: string; sourceApp: string; sourceUrl: string; details: readonly EventRef[]; image: Receipt; vector: VisualVector | null; visibility: 'public' | 'user-session' }>;
export type ReferenceConfidenceDebt = Readonly<{ id: string; sourceContractSha256: string; lane: Lane; decisionId: null;
  code: 'access-gap' | 'source-diversity-gap' | 'visual-direction-gap' | 'flow-gap' | 'unmeasured' | 'budget-exhausted' | 'browser-capability-gap';
  severity: 'low' | 'material'; evidence: readonly Receipt[]; limitation: string; consequence: string;
  owner: 'scout'; entryDisposition: 'non-blocking'; completionDisposition: 'must-resolve-or-explicitly-disclose' }>;
export type Consent = Readonly<{ mode: Mode; requestSha256: string; sourceContractSha256: string; cdpEndpointSha256: string | null;
  allowAuthOrigins: readonly string[]; allowPricing: boolean; headed: boolean; expiresAt: string }>;
export type Binding = Readonly<{ root: string; sessionId: string; sourceContractSha256: string; buildSha256: string; consent: Consent | null; start: Start; budget: BrowseBudget }>;
export type Checkpoint = Readonly<{ schema: 'reference-browse-checkpoint-v1'; sessionId: string; sourceContractSha256: string;
  eventCount: number; terminalHash: string; traceSha256: string; assets: readonly Receipt[]; signature: string;
  budget: BrowseBudget; buildSha256: string; mode: Mode; consent: Consent | null }>;
export type BrowseSeal = Readonly<{ schema: 'reference-browse-session-v1'; sessionId: string; lane: Lane;
  sourceContractSha256: string; buildSha256: string; mode: Mode; consent: Consent | null;
  startedAt: string; endedAt: string; eventCount: number; terminalHash: string; trace: Receipt;
  assets: readonly Receipt[]; keeps: readonly BrowseKeep[]; budget: BrowseBudget; stopReason: Exclude<StopReason, null>;
  confidenceDebt: readonly ReferenceConfidenceDebt[]; limitations: readonly string[]; recovery: Receipt | null; signature: string }>;
export type BrowseRetention = Readonly<{ schema: 'reference-browse-retention-v1'; session: Receipt; capture: EventRef; keep: EventRef }>;
export type BrowseReference = Reference & { browse?: BrowseRetention; referenceUnit?: 'whole-screen'; sourceApp?: string; sourceUrl?: string;
  zoomDetails?: readonly Readonly<{ event: EventRef; image: Receipt }>[] };
export type BrowseSummary = Readonly<{ schema: 'reference-browse-summary-v1'; session: Receipt; sessionId: string; lane: Lane;
  sourceContractSha256: string; stopReason: StopReason; counts: { actions: number; keeps: number; families: number };
  retained: readonly Readonly<{ image: Receipt; capture: Receipt }>[]; flows: readonly Receipt[];
  confidenceDebt: readonly ReferenceConfidenceDebt[]; researchStatus: 'partial' | 'unavailable'; productionEntryBlocking: false }>;
export type PublishedAsset = Readonly<{ receipt: Receipt; base64: string }>;
export type BrowseResult = Readonly<{ ok: boolean; outcome: string; sessionId: string; head: string | null;
  observation: BrowseObservation | null; budget: BrowseBudget; stopReason: StopReason; nextAllowed: readonly string[];
  tray: readonly BrowseKeep[]; snapshotStale: boolean; privacyWarning?: string; error?: { code: string; message: string }; retryAfterMs?: number;
  capture?: Readonly<{ id: string; image: Receipt; scope: 'whole-screen' | 'zoom-detail' }>;
  contactSheet?: Readonly<{ image: Receipt; metadata: Receipt }>;
  seal?: Receipt; retained?: BrowseSummary['retained']; confidenceDebt?: readonly ReferenceConfidenceDebt[] }>;
export type DriverReply = Readonly<{ result: BrowseResult; events: readonly BrowseEvent[]; assets: readonly PublishedAsset[];
  checkpoint: Checkpoint | null; seal: BrowseSeal | null }>;
export const ACQUISITION = new Set(['goto', 'search', 'scroll', 'click', 'similar', 'back', 'shot', 'crop']);
export const AFTER_STOP = ['keep', 'drop', 'contact-sheet', 'status', 'end'] as const;
export class BrowseError extends Error {
  override readonly name = 'BrowseError';
  readonly code: string;
  readonly exitCode: number;
  constructor(code: string, message: string, exitCode = 1) { super(`${code}: ${message}`); this.code = code; this.exitCode = exitCode; }
}
export function browseFail(code: string, message: string, exitCode = 1): never { throw new BrowseError(code, message, exitCode); }
