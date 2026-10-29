import { PUBLIC_REF_COMMANDS } from '../cli/public-surface.ts';
import {
  inputJson,
  invocationFromActivation,
  parseArgs,
  projectWriter,
  type Opts,
} from '../cli/runtime.ts';

function unknown(sub: string | undefined): never {
  throw new Error(`unknown command ref${sub ? ` ${sub}` : ''}; run omd help`);
}

/** Ends a browse session still open, so its keeps are filed before references are reviewed or published. */
async function endLiveBrowseSession(opts: Opts): Promise<void> {
  const { readBrowsePointer } = await import('../../core/ref/browse/client.ts');
  const live = readBrowsePointer(process.cwd());
  if (live === null) return;
  const { runBrowseCli } = await import('../../core/ref/browse/cli.ts');
  await runBrowseCli(['end', '--session', live.sessionId, '--json'], process.cwd(), (activation, command) =>
    invocationFromActivation({ ...opts, _: [], ...(activation === null ? {} : { activation }) }, command)).catch(() => undefined);
}

async function cmdRefDirectionReview(opts: Opts): Promise<never> {
  const command = 'omd ref direction-review';
  if (opts._.length) throw new Error(`usage: ${command} [--input <reference-zone-review-input.json>] [--json]`);
  const invocation = invocationFromActivation(opts, command);
  const { readPersistedRoute } = await import('../../core/route/index.ts');
  const route = readPersistedRoute(process.cwd(), invocation);
  const { isModelLedProcess } = await import('../../core/route/process-policy.ts');
  if (route.references.decision !== 'discover' && !isModelLedProcess(route.sourceContract)) throw new Error('REFERENCE_DIRECTION_REVIEW_NOT_SELECTED');
  // The review reads filed keeps; a session still open is ended first rather than refused.
  await endLiveBrowseSession(opts);
  if (opts.input) {
    const { reviewReferenceZone } = await import('../reference-zone-command.ts');
    const record = await reviewReferenceZone(process.cwd(), inputJson(opts.input, command), {
      invocation,
      writer: projectWriter(invocation),
      sourceContractSha256: route.sourceContractSha256,
      task: route.request,
    });
    process.stdout.write(`${JSON.stringify({
      path: '.omd/reference-zone-admission.json',
      admission: record.admission,
    }, null, opts.json ? undefined : 2)}\n`);
    process.exit(0);
  }
  const { loadRefs } = await import('../../core/ref/store.ts');
  const { inspectDesignReferenceAdmission } = await import('../../core/ref/design-admission.ts');
  const { loadDesignCandidates } = await import('../../core/ref/reference-candidate.ts');
  const { readReferenceDiscoveryExclusions } = await import('../../core/ref/discovery-exclusion.ts');
  const excludedSources = new Set(readReferenceDiscoveryExclusions(process.cwd(), route.sourceContractSha256)
    .filter(item => item.decision.researchLane === 'design')
    .map(item => item.decision.source));
  const candidates = loadDesignCandidates(process.cwd())
    .filter(item => !excludedSources.has(item.reference.source));
  const referencesById = new Map(loadRefs(process.cwd(), { includeDomain: true })
    .filter(reference => reference.researchLane === 'design')
    .map(reference => [JSON.stringify([reference.source, reference.component]), reference]));
  for (const candidate of candidates) {
    const reference = candidate.reference;
    const id = JSON.stringify([reference.source, reference.component]);
    const current = referencesById.get(id);
    if (!current || reference.capturedAt >= current.capturedAt) referencesById.set(id, reference);
  }
  const references = [...referencesById.values()].filter(reference => {
    const candidate = candidates.find(item => item.reference.source === reference.source
      && item.reference.component === reference.component
      && item.reference.capturedAt === reference.capturedAt);
    return reference.imagePath !== undefined && inspectDesignReferenceAdmission(process.cwd(), reference, {
      ...(candidate ? { candidate } : {}),
      purpose: 'visual-direction',
    }).eligible;
  });
  if (references.length === 0) {
    throw new Error('REFERENCE_DIRECTION_CAPTURE_REQUIRED: no kept whole-page design capture is filed yet. Keeps are filed when the browse '
      + 'session ends: run omd ref browse end --session <id>, then omd ref direction-review --json again.');
  }
  const {
    planReferenceDirectionReview,
    publishReferenceDirectionAdmission,
  } = await import('../../core/ref/reference-direction-admission.ts');
  const plan = planReferenceDirectionReview(process.cwd(), {
    sourceContractSha256: route.sourceContractSha256,
    task: route.request,
    references,
  });
  const packet = plan.packet;
  const setAside = plan.oversized.length === 0 ? {} : {
    setAside: plan.oversized,
    setAsideReason: `too large to review (one review holds 8 MB), so never admitted as a direction: cite other `
      + 'captures, or keep a viewport-size shot of the same page instead of its full-length image',
  };
  if (packet === null) {
    process.stdout.write(`${JSON.stringify({
      path: '.omd/reference-direction-admission.json',
      reviewed: 0,
      carried: plan.carried,
      pending: 0,
      complete: true,
      packetBytes: 0,
      ...setAside,
    }, null, opts.json ? undefined : 2)}\n`);
    process.exit(0);
  }
  const { runPiReferenceAdmissionReviewer } = await import('../../adapters/pi-reviewer-runtime.ts');
  const { withNativeCommandSignal } = await import('../native-command-signal.ts');
  const reviewer = await withNativeCommandSignal(signal => runPiReferenceAdmissionReviewer({
    root: process.cwd(),
    invocation,
    packet,
    signal,
  }));
  const record = publishReferenceDirectionAdmission(
    process.cwd(),
    packet,
    reviewer,
    invocation,
    projectWriter(invocation),
  );
  process.stdout.write(`${JSON.stringify({
    path: '.omd/reference-direction-admission.json',
    captureSetSha256: record.captureSetSha256,
    reviewed: plan.selected,
    carried: plan.carried,
    pending: plan.pending,
    complete: plan.pending === 0,
    packetBytes: packet.byteLength,
    directions: record.admissions.filter(item => item.verdict === 'direction').length,
    supports: record.admissions.filter(item => item.verdict === 'support').length,
    rejected: record.admissions.filter(item => item.verdict === 'reject').length,
    ...setAside,
    // One packet holds only so many captures; the rest wait for the next run.
    ...(plan.pending > 0 ? { next: `${plan.pending} kept reference(s) still wait for review: run omd ref direction-review --json again` } : {}),
  }, null, opts.json ? undefined : 2)}\n`);
  process.exit(0);
}

export async function runReferences(args: string[]): Promise<never> {
  const sub = args[1];
  if (sub === undefined
    || !PUBLIC_REF_COMMANDS.includes(sub as typeof PUBLIC_REF_COMMANDS[number])) return unknown(sub);

  if (sub === 'browse') {
    const { cmdRefBrowse } = await import('./reference-discovery.ts');
    return cmdRefBrowse(args.slice(2));
  }
  if (sub === 'tidy' && args.slice(2).some(arg => arg === '--help' || arg === '-h')) {
    console.log(
      'omd ref tidy [--apply] [--json]\n'
      + '  Preview recognized legacy search/navigation files and unqualified design records.\n'
      + '  --apply archives exact bytes and a recovery manifest in .omd/archive/references before guarded removal.\n'
      + '  Eligible design references, domain references and unknown files remain. Revalidate dependent research and boards afterward.',
    );
    process.exit(0);
  }

  const opts = parseArgs(args.slice(2));
  if (sub === 'direction-review') return cmdRefDirectionReview(opts);
  if (sub === 'context') {
    if (!opts.input || opts._.length) throw new Error('usage: omd ref context --input <json> --json');
    const invocation = invocationFromActivation(opts, 'omd ref context');
    const { publishConsultedReferences } = await import('../../core/design/consulted-references.ts');
    const { readPersistedRoute } = await import('../../core/route/index.ts');
    const { sha256 } = await import('../../core/ref/board-artifacts.ts');
    const input = inputJson(opts.input, 'omd ref context');
    if (typeof input !== 'object' || input === null
      || Reflect.get(input, 'requestSha256') !== sha256(readPersistedRoute(process.cwd(), invocation).request)) {
      throw new Error('CONSULTED_REFERENCES: request scope');
    }
    // Publishing references settles them: a browse session still open is ended first so its keeps are filed and citable.
    await endLiveBrowseSession(opts);
    const { requireKeptConsultedImages } = await import('../../core/ref/capture-intake.ts');
    const { requireReferenceKinds, requireReviewedPrimary, requireSectionReferences } = await import('../../core/design/new-surface-advisories.ts');
    const cited: unknown = Reflect.get(input, 'images');
    const images = Array.isArray(cited) ? cited.map(image => ({
      sha256: String(Reflect.get(Object(image), 'sha256')), sourceUrl: String(Reflect.get(Object(image), 'sourceUrl')) })) : [];
    requireKeptConsultedImages(process.cwd(), invocation, images);
    requireReferenceKinds(readPersistedRoute(process.cwd(), invocation), images);
    requireSectionReferences(process.cwd(), readPersistedRoute(process.cwd(), invocation), Array.isArray(cited) ? cited.map(image => ({
      component: String(Reflect.get(Object(image), 'component') ?? ''), role: String(Reflect.get(Object(image), 'role')),
      sourceUrl: String(Reflect.get(Object(image), 'sourceUrl')), sha256: String(Reflect.get(Object(image), 'sha256')) })) : []);
    requireReviewedPrimary(process.cwd(), readPersistedRoute(process.cwd(), invocation), Array.isArray(cited) ? cited.map(image => ({
      sha256: String(Reflect.get(Object(image), 'sha256')), role: String(Reflect.get(Object(image), 'role')) })) : []);
    const published = publishConsultedReferences(process.cwd(), input, projectWriter(invocation));
    const { referenceBreadth } = await import('../../core/ref/component-references.ts');
    console.log(JSON.stringify({ ...published, references: referenceBreadth(process.cwd()) }));
    process.exit(0);
  }

  if (['add', 'add-batch', 'list', 'show', 'principles', 'audit', 'import-image'].includes(sub)) {
    const capture = await import('./reference-capture.ts');
    if (sub === 'add') return capture.cmdRefAdd(opts);
    if (sub === 'add-batch') return capture.cmdRefAddBatch(opts);
    if (sub === 'list') return capture.cmdRefList(opts);
    if (sub === 'show') return capture.cmdRefShow(opts);
    if (sub === 'principles') return capture.cmdRefPrinciples(opts);
    if (sub === 'audit') return capture.cmdRefAudit(opts);
    return capture.cmdRefImportImage(opts);
  }

  const discovery = await import('./reference-discovery.ts');
  if (sub === 'tidy') return discovery.cmdRefTidy(opts);
  if (sub === 'navigate') return discovery.cmdRefNavigate(opts);
  if (sub === 'control-observe') return discovery.cmdRefControlObserve(opts);
  if (sub === 'cookie-control') return discovery.cmdRefCookieControl(opts);
  if (sub === 'discover-batch') return discovery.cmdRefDiscoveryBatch(opts);
  if (sub === 'discover-plan') return discovery.cmdRefDiscoveryPlan(opts);
  if (sub === 'work-next') return discovery.cmdRefDiscoveryWork('next', opts);
  if (sub === 'advance') return discovery.cmdRefDiscoveryWork('advance', opts);
  if (sub === 'exclude') return discovery.cmdRefDiscoveryExclude(opts);
  if (sub === 'research-set') return discovery.cmdRefResearch('set', opts);
  if (sub === 'research-check') return discovery.cmdRefResearch('check', opts);
  if (sub === 'search') return discovery.cmdRefSearch(opts);
  if (sub === 'leads') return discovery.cmdRefLeads(args[2], parseArgs(args.slice(3)));
  return unknown(sub);
}
