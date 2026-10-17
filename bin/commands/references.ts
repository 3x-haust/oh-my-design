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

async function cmdRefDirectionReview(opts: Opts): Promise<never> {
  const command = 'omd ref direction-review';
  if (opts._.length) throw new Error(`usage: ${command} [--input <reference-zone-review-input.json>] [--json]`);
  const invocation = invocationFromActivation(opts, command);
  const { readPersistedRoute } = await import('../../core/route/index.ts');
  const route = readPersistedRoute(process.cwd(), invocation);
  if (route.references.decision !== 'discover') throw new Error('REFERENCE_DIRECTION_REVIEW_NOT_SELECTED');
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
  if (references.length === 0) throw new Error('REFERENCE_DIRECTION_CAPTURE_REQUIRED');
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
  if (packet === null) {
    process.stdout.write(`${JSON.stringify({
      path: '.omd/reference-direction-admission.json',
      reviewed: 0,
      carried: plan.carried,
      pending: 0,
      complete: true,
      packetBytes: 0,
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
    console.log(JSON.stringify(publishConsultedReferences(process.cwd(), input, projectWriter(invocation))));
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
