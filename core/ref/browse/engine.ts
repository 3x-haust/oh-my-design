import { canonicalJson, sha256 } from './json.ts';
import { asset, captureBrowseObservation, inspectVisible } from './observation.ts';
import { executeBrowseAction } from './actions.ts';
import { openBrowseBrowser, type BrowseBrowser, type BrowseBrowserDependencies } from './browser.ts';
import { browseConfidenceDebt, browseSaturation, BrowseRateLimit, evaluateBrowseStop } from './budget.ts';
import { renderBrowseContactSheet } from './contact-sheet.ts';
import { checkpoint, nativeEvent, replayBrowseKeeps, signed, traceBytes, tracePath } from './trace.ts';
import { searchUrl } from './safety.ts';
import { loadRefs } from '../store.ts';
import { referenceServiceFamily } from '../design-discovery-sources.ts';
import { ACQUISITION, AFTER_STOP, BrowseError, browseFail, type Binding, type BrowseAction, type BrowseEvent, type BrowseObservation,
  type BrowseBudget, type BrowseResult, type BrowseSeal, type BrowseKeep, type DriverReply, type PublishedAsset, type StopReason } from './contract.ts';

/** Browser state lives here, never in a command process. This owner has no project writer. */
export class BrowseEngine {
  readonly events: BrowseEvent[] = [];
  readonly assets = new Map<string, PublishedAsset>();
  readonly observations = new Map<string, BrowseObservation>();
  private browser: BrowseBrowser | null = null;
  private observation: BrowseObservation | null = null;
  private keeps: BrowseKeep[] = [];
  private budget: BrowseBudget;
  private stop: StopReason = null;
  private seal: BrowseSeal | null = null;
  private deadline: NodeJS.Timeout | null = null;
  private rate: BrowseRateLimit;
  private searchPage = false;
  private readonly failedRequests = new Set<string>();
  readonly binding: Binding;
  private readonly dependencies: BrowseBrowserDependencies & { clock?: () => number; monotonic?: () => number };
  constructor(binding: Binding, dependencies: BrowseBrowserDependencies & { clock?: () => number; monotonic?: () => number } = {}) {
    this.binding = binding; this.dependencies = dependencies;
    this.budget = binding.budget; this.rate = new BrowseRateLimit(dependencies.monotonic);
  }
  private now() { return this.dependencies.clock?.() ?? Date.now(); }
  private head() { return this.events.at(-1)?.hash ?? null; }
  private addAssets(assets: readonly PublishedAsset[]) {
    const prospective = new Map(this.assets); for (const item of assets) prospective.set(item.receipt.sha256, item);
    if ([...prospective.values()].reduce((sum, item) => sum + Buffer.byteLength(item.base64, 'base64'), 0) > 256 * 1024 * 1024) browseFail('BROWSE_ASSET_BUDGET', 'session asset limit reached');
    for (const item of assets) this.assets.set(item.receipt.sha256, item);
  }
  private record(action: BrowseAction, requestId: string, fields: Partial<Pick<BrowseEvent, 'outcome' | 'target' | 'screenshot' | 'observation' | 'error' | 'url' | 'finalUrl'>> = {}) {
    const event = nativeEvent({ schema: 'reference-browse-event-v1', sessionId: this.binding.sessionId, lane: this.binding.start.lane,
      seq: this.events.length, prevHash: this.head(), requestId, actor: action.verb === 'external-intervention' ? 'runtime' : 'model-command',
      time: new Date(this.now()).toISOString(), elapsedMs: Math.max(0, this.now() - Date.parse(this.budget.startedAt)), action,
      url: this.observation?.url ?? null, finalUrl: this.observation?.url ?? null, documentId: this.observation?.documentId ?? null,
      predecessorObservation: [...this.events].reverse().find(event => event.observation)?.observation?.sha256 ?? null,
      outcome: 'observed', target: null, screenshot: null, observation: null, error: null, ...fields });
    this.events.push(event); return event;
  }
  private result(ok = true, outcome = 'observed', error?: { code: string; message: string }): BrowseResult {
    const capture = this.events.findLast(event => ['shot', 'crop'].includes(event.action.verb) && event.outcome === 'observed' && event.screenshot);
    return { ok, outcome, sessionId: this.binding.sessionId, head: this.head(), observation: this.observation,
      budget: this.budget, stopReason: this.stop, nextAllowed: this.seal || this.budget.metadataEvents >= 128 || this.events.length >= 498 ? ['status', 'end'] : this.stop ? AFTER_STOP : [...ACQUISITION, ...AFTER_STOP],
      tray: this.keeps, snapshotStale: false, ...(error ? { error } : {}),
      ...(capture ? { capture: { id: capture.hash, image: capture.screenshot!, scope: capture.action.verb === 'shot' ? 'whole-screen' as const : 'zoom-detail' as const } } : {}),
      ...(this.binding.start.mode === 'headless' ? {} : { privacyWarning: 'Authenticated pixels can contain private data. Keep them local; do not automatically commit, export or ship these study-only images.' }) };
  }
  private saturated(): boolean {
    // Visual similarity cannot measure task-flow progress. Domain walkthroughs stop by budget or explicit end.
    return this.binding.start.lane === 'design' && browseSaturation(this.keeps) === 'yes';
  }
  async status(): Promise<BrowseResult> {
    this.stop ??= evaluateBrowseStop(this.budget, this.now(), this.saturated());
    let stale = false;
    if (this.browser && this.observation) {
      const current = await inspectVisible(this.browser.page);
      stale = this.browser.page.url() !== this.observation.url || canonicalJson(current.controls) !== canonicalJson(this.observation.controls)
        || canonicalJson(current.scroll) !== canonicalJson(this.observation.scroll) || current.text !== this.observation.text
        || current.taskText !== this.observation.taskText || canonicalJson(current.linkClaims) !== canonicalJson(this.observation.linkClaims)
        || current.renderSha256 !== this.observation.renderSha256;
    }
    return { ...this.result(true, 'status'), snapshotStale: stale };
  }
  async close() { if (this.deadline) clearTimeout(this.deadline); if (this.browser) { const browser = this.browser; this.browser = null; await browser.close(); } }
  async execute(input: BrowseAction, requestId: string, expectHead: string | null): Promise<DriverReply> {
    if (expectHead !== null && expectHead !== this.head()) browseFail('BROWSE_STALE_HEAD', 'head changed; no action executed', 2);
    if (input.verb === 'status') return { result: await this.status(), events: [], assets: [], checkpoint: null, seal: this.seal };
    if (this.seal) {
      if (input.verb !== 'end') browseFail('BROWSE_ENDED', 'session already finalized', 2);
      return { result: this.result(true, 'sealed'), events: [], assets: [], checkpoint: null, seal: this.seal };
    }
    this.stop ??= evaluateBrowseStop(this.budget, this.now(), this.saturated());
    if (input.verb !== 'end' && (this.budget.metadataEvents >= 128 || this.events.length >= 498)) this.stop = 'budget';
    if ((this.stop && ACQUISITION.has(input.verb)) || (input.verb !== 'end' && (this.budget.metadataEvents >= 128 || this.events.length >= 498))) return { result: this.result(false, 'budget-exhausted'), events: [], assets: [], checkpoint: null, seal: null };
    if (ACQUISITION.has(input.verb) && !['shot', 'crop'].includes(input.verb)) {
      const url = input.verb === 'goto' ? input.url : input.verb === 'search' ? searchUrl(input.provider, input.query, input.queryParam) : this.observation?.url;
      const origin = url ? new URL(url).origin : 'none';
      const retryAfterMs = Math.max(this.rate.check(origin), (this.browser?.retryAfter.get(origin) ?? 0) - this.now());
      if (retryAfterMs) return { result: { ...this.result(false, 'rate-limited'), retryAfterMs }, events: [], assets: [], checkpoint: null, seal: null };
      this.rate.consume(origin, input.verb !== 'scroll');
    }
    const first = this.events.length, knownAssets = new Set(this.assets.keys());
    let action = input;
    let contactSheet: BrowseResult['contactSheet'];
    const attemptKey = canonicalJson([input, this.observation?.documentId ?? null, this.observation?.screenshot.sha256 ?? null, this.keeps.map(keep => keep.id)]);
    this.budget = { ...this.budget, actions: this.budget.actions + Number(ACQUISITION.has(action.verb)), metadataEvents: this.budget.metadataEvents + Number(!ACQUISITION.has(action.verb)) };
    try {
      if (action.verb === 'start') {
        if (this.events.length) browseFail('BROWSE_ALREADY_STARTED', 'one start per session', 2);
        this.browser = await openBrowseBrowser(this.binding, this.dependencies);
        this.deadline = setTimeout(() => { this.stop = 'budget'; void this.close().catch(error => { process.stderr.write(`BROWSE_CLOSE: ${String(error)}\n`); }); }, Math.max(1, Date.parse(this.budget.deadline) - this.now())); this.deadline.unref();
        // Endpoints are private connection details, never signed research artifacts.
        this.record({ ...action, cdpUrl: null }, requestId);
      } else if (ACQUISITION.has(action.verb)) {
        if (!this.browser) browseFail('BROWSE_DRIVER_LOST', 'browser continuity unavailable');
        if (this.failedRequests.has(attemptKey)) browseFail('BROWSE_REPEATED_FAILURE', 'identical failed request is not retried in this session');
        if (this.observation && (await this.status()).snapshotStale) {
          this.record({ verb: 'external-intervention', reason: 'Page changed outside a recorded command; prior flow continuity is broken.' }, requestId);
          this.observation = null;
          if (['click', 'similar', 'back'].includes(action.verb)) browseFail('BROWSE_EXTERNAL_INTERVENTION', 'take a fresh shot or choose an explicit root before continuing');
        }
        if (action.verb === 'crop') {
          const parent = action.reference ?? this.keeps.at(-1)?.id ?? null;
          const keep = this.keeps.find(keep => keep.id === parent);
          if (!keep || keep.source !== this.browser.page.url()) browseFail('BROWSE_DETAIL_PARENT', 'keep a whole-screen shot from this source before attaching a zoom detail');
          action = { ...action, reference: parent };
        }
        const beforeUrl = this.observation?.url ?? null;
        const timeout = Math.max(1, Math.min(15_000, Date.parse(this.budget.deadline) - this.now()));
        const target = await executeBrowseAction(this.browser.page, action, this.binding.start, this.observation, timeout);
        if (action.verb === 'search') this.searchPage = true;
        if (['goto', 'click', 'similar', 'back'].includes(action.verb)) this.searchPage = false;
        const captured = await captureBrowseObservation(this.browser.page, this.browser.document, this.binding.sessionId, {
          ...(action.verb === 'crop' ? { selector: action.selector } : {}),
          ...(action.verb === 'shot' && action.selector ? { wholeImageSelector: action.selector, media: this.browser.media } : {}), search: this.searchPage,
          ...('readySelector' in action ? { readySelector: action.readySelector } : {}), timeout });
        if (action.verb === 'crop') {
          const parentId = action.reference, parent = this.keeps.find(keep => keep.id === parentId)!;
          if (captured.observation.screenshot.sha256 !== parent.image.sha256) browseFail('BROWSE_DETAIL_STATE', 'zoom detail must be an exact region of the kept whole viewport; keep the changed screen first. Gallery DOM cannot crop an original item image.');
        }
        this.addAssets(captured.assets); this.observations.set(captured.receipt.sha256, captured.observation);
        this.observation = captured.observation;
        this.record(action, requestId, { url: beforeUrl, finalUrl: captured.observation.url, target,
          screenshot: captured.assets.find(item => item.receipt.path.endsWith('.png') && item.receipt.sha256 !== captured.observation.screenshot.sha256)?.receipt ?? captured.observation.screenshot,
          observation: captured.receipt });
      } else if (action.verb === 'keep') {
        const capture = action.capture ?? this.events.findLast(event => event.action.verb === 'shot' && event.outcome === 'observed')?.hash ?? null;
        action = { ...action, capture, lane: action.lane ?? this.binding.start.lane, role: action.role ?? (this.binding.start.lane === 'domain' ? 'task-flow' : 'visual-direction') };
        const { hash: _hash, ...previous } = this.events.at(-1) ?? browseFail('BROWSE_KEEP_BINDING', 'no capture exists');
        const event = nativeEvent({ ...previous, action, seq: this.events.length, outcome: 'observed', prevHash: this.head() });
        // Check the exact transition before recording it as successful.
        const nextKeeps = replayBrowseKeeps([...this.events, event], this.observations, this.binding.start.mode), candidate = nextKeeps.at(-1)!;
        if (loadRefs(this.binding.root, { includeDomain: true }).some(reference => reference.researchLane && reference.researchLane !== this.binding.start.lane
          && (referenceServiceFamily(reference.source) === referenceServiceFamily(candidate.source) || reference.acquisition?.imageSha256 === candidate.image.sha256))) {
          browseFail('BROWSE_LANE_OVERLAP', 'the other lane already uses this service family or these pixels');
        }
        this.record(action, requestId);
      } else if (action.verb === 'drop') {
        const keepId = action.keep;
        if (keepId && !this.keeps.some(keep => keep.id === keepId)) browseFail('BROWSE_DROP_BINDING', 'keep is not live');
        if (!action.keep && !this.observation) browseFail('BROWSE_DROP_BINDING', 'no observed candidate to reject');
        this.record(action, requestId);
      } else if (action.verb === 'contact-sheet') {
        const images = new Map([...this.assets].map(([hash, item]) => [hash, Buffer.from(item.base64, 'base64')]));
        const sheet = await renderBrowseContactSheet(this.binding.sessionId, this.keeps, images, action); this.addAssets(sheet);
        contactSheet = { image: sheet[0]!.receipt, metadata: sheet[1]!.receipt };
        this.record(action, requestId, { screenshot: sheet[0]!.receipt });
      } else if (action.verb === 'end') {
        this.stop ??= action.reason;
        await this.close(); this.record(action, requestId);
      } else browseFail('BROWSE_ACTION', 'runtime-only event', 2);
    } catch (error) {
      const code = action.verb === 'start' ? 'BROWSE_BROWSER_CAPABILITY_GAP' : error instanceof BrowseError ? error.code : 'BROWSE_ACTION_FAILED';
      if (action.verb === 'start') this.stop = 'interrupted';
      // Playwright diagnostics can contain credentials/HTML. Persist bounded native codes, not raw browser traffic.
      const message = error instanceof BrowseError ? error.message : 'Browser action could not produce a coherent read-only observation.';
      this.record(action.verb === 'start' ? { ...action, cdpUrl: null } : action, requestId, { outcome: error instanceof BrowseError ? 'blocked' : 'failed', finalUrl: null, error: { code, message } });
      if (ACQUISITION.has(action.verb)) this.failedRequests.add(attemptKey);
    }
    this.keeps = replayBrowseKeeps(this.events, this.observations, this.binding.start.mode);
    this.stop ??= this.events.length >= 498 ? 'budget' : evaluateBrowseStop(this.budget, this.now(), this.saturated());
    if (this.stop) {
      try { await this.close(); }
      catch { this.record({ verb: 'external-intervention', reason: 'Owned browser cleanup failed; continuity ended.' }, requestId,
        { outcome: 'failed', finalUrl: null, error: { code: 'BROWSE_RESOURCE_CLOSE', message: 'Owned browser resources could not be cleanly released.' } }); }
    }
    const receiptList = [...this.assets.values()].map(item => item.receipt);
    const prefix = checkpoint({ ...this.binding, budget: this.budget }, this.events, receiptList);
    if (action.verb === 'end') {
      const evidence = this.events.filter(event => event.error).map(event => ({ path: `.omd/discovery/browse/${this.binding.sessionId}/events/${event.hash}.json`, sha256: sha256(`${canonicalJson(event)}\n`) }));
      this.seal = signed(this.binding.root, { schema: 'reference-browse-session-v1' as const, sessionId: this.binding.sessionId, lane: this.binding.start.lane,
        sourceContractSha256: this.binding.sourceContractSha256, buildSha256: this.binding.buildSha256, mode: this.binding.start.mode, consent: this.binding.consent,
        startedAt: this.budget.startedAt, endedAt: new Date(this.now()).toISOString(), eventCount: this.events.length, terminalHash: this.head()!,
        trace: { path: tracePath(this.binding.sessionId), sha256: sha256(traceBytes(this.events)) }, assets: receiptList, keeps: this.keeps,
        budget: this.budget, stopReason: this.stop ?? 'complete', confidenceDebt: browseConfidenceDebt({ sourceContractSha256: this.binding.sourceContractSha256,
          lane: this.binding.start.lane, keeps: this.keeps, stopReason: this.stop, evidence, failures: evidence.length, browserUnavailable: this.events[0]?.error !== null }),
        recovery: null, limitations: ['Native acquisition proves observation, not visual quality or research sufficiency.', 'Only GET/HEAD navigation; no form credentials, purchase, trial, checkout, uploads or bulk scraping.',
          'Popups are excluded; authenticated material is private study-only. Dynamic visual probes are not measured.'] });
    }
    const last = this.events.at(-1)!;
    return { result: { ...this.result(last.error === null, this.seal ? 'sealed' : last.outcome, last.error ?? undefined), ...(contactSheet ? { contactSheet } : {}) },
      events: this.events.slice(first), assets: [...this.assets.values()].filter(item => !knownAssets.has(item.receipt.sha256)), checkpoint: prefix, seal: this.seal };
  }
}
