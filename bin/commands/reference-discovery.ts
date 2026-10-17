import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { acquireProjectMutationLock } from '../../core/runtime/project-write.ts';
import { readPersistedRoute } from '../../core/route/index.ts';
import {
  inputJson,
  invocationFromActivation,
  projectWriter,
  projectWriterFromActivation,
  type Opts,
} from '../cli/runtime.ts';

export async function cmdRefBrowse(argv: readonly string[]): Promise<never> {
  const { runBrowseCli } = await import('../../core/ref/browse/cli.ts');
  const { result, exitCode } = await runBrowseCli(argv, process.cwd(), (activation, command) =>
    invocationFromActivation({ _: [], ...(activation === null ? {} : { activation }) }, command));
  await new Promise<void>((done, reject) => {
    process.stdout.write(`${JSON.stringify(result)}\n`, error => error ? reject(error) : done());
  });
  process.exit(exitCode);
}

export async function cmdRefDiscoveryPlan(opts: Opts): Promise<never> {
  if (opts._.length !== 0) throw new Error('usage: omd ref discover-plan [--json] [--activation <host-issued-invocation.json>]');
  const { readPersistedRoute } = await import('../../core/route/index.ts');
  const { buildReferenceDiscoveryPlan } = await import('../../core/ref/discovery-plan.ts');
  const route = readPersistedRoute(process.cwd(), invocationFromActivation(opts, 'omd ref discover-plan'));
  const plan = buildReferenceDiscoveryPlan(process.cwd(), route);
  process.stdout.write(`${JSON.stringify(plan, null, opts.json ? undefined : 2)}\n`);
  process.exit(0);
}

export async function cmdRefDiscoveryWork(mode: 'next' | 'advance', opts: Opts): Promise<never> {
  const command = mode === 'next' ? 'omd ref work-next' : 'omd ref advance';
  if (opts._.length !== 0 || opts.input !== undefined) throw new Error(`usage: ${command} [--json] [--activation <host-issued-invocation.json>]`);
  const route = readPersistedRoute(process.cwd(), invocationFromActivation(opts, command));
  if (route.references.decision !== 'discover') throw new Error('REFERENCE_DISCOVERY_NOT_SELECTED');
  const result = mode === 'next'
    ? (await import('../../core/ref/discovery-work.ts')).referenceDiscoveryWork(process.cwd(), route)
    : await (await import('../../core/ref/discovery-advance.ts')).advanceReferenceDiscoveryWork(
      process.cwd(), route, projectWriterFromActivation(opts, command));
  process.stdout.write(`${JSON.stringify(result, null, opts.json ? undefined : 2)}\n`);
  process.exit(0);
}

export async function cmdRefDiscoveryExclude(opts: Opts): Promise<never> {
  const source = opts._[0];
  const allowed = new Set(['_', 'lane', 'reason', 'json', 'activation']);
  if (opts._.length !== 1 || !source || !opts.reason || (opts.lane !== 'domain' && opts.lane !== 'design')
    || Object.keys(opts).some(key => !allowed.has(key))) {
    throw new Error('usage: omd ref exclude <observed-url> --lane domain|design --reason <specific-quality-judgment> [--json]');
  }
  const command = 'omd ref exclude';
  const route = readPersistedRoute(process.cwd(), invocationFromActivation(opts, command));
  if (route.references.decision !== 'discover') throw new Error('REFERENCE_DISCOVERY_NOT_SELECTED');
  const { publishReferenceDiscoveryExclusion } = await import('../../core/ref/discovery-exclusion.ts');
  const receipt = publishReferenceDiscoveryExclusion(process.cwd(), route.sourceContractSha256,
    opts.lane, source, opts.reason, projectWriterFromActivation(opts, command));
  const { referenceDiscoveryWork } = await import('../../core/ref/discovery-work.ts');
  const result = { schema: 'reference-discovery-exclusion-publication-v1', receipt,
    work: referenceDiscoveryWork(process.cwd(), route) };
  process.stdout.write(`${JSON.stringify(result, null, opts.json ? undefined : 2)}\n`);
  process.exit(0);
}

export async function cmdRefResearch(mode: 'set' | 'check', opts: Opts): Promise<never> {
  const usage = mode === 'set'
    ? 'usage: omd ref research-set --input <reference-research.json> [--activation <host-issued-invocation.json>] [--json]'
    : 'usage: omd ref research-check [--activation <host-issued-invocation.json>] [--json]';
  if (opts._.length !== 0 || (mode === 'set' && !opts.input) || (mode === 'check' && opts.input)) {
    throw new Error(usage);
  }
  const { readPersistedRoute } = await import('../../core/route/index.ts');
  const { parseReferenceResearch, validateReferenceResearch, publishReferenceResearch, readPublishedReferenceResearch, DOMAIN_REFERENCES_PATH, DESIGN_REFERENCES_PATH } = await import('../../core/ref/reference-research.ts');
  const command = `omd ref research-${mode}`;
  const invocation = invocationFromActivation(opts, command);
  const route = readPersistedRoute(process.cwd(), invocation);
  const strategyWarning = route.references.decision !== 'discover' ? 'REFERENCE_RESEARCH_NOT_SELECTED: research was not selected in the route; explicit publication proceeds with this limitation' : null;
  const researchInput = mode === 'set' ? inputJson(opts.input!, command) : undefined;
  const research = mode === 'set'
    ? parseReferenceResearch(researchInput)
    : readPublishedReferenceResearch(process.cwd());
  if (mode === 'set' && research.schema !== 'reference-research-v8')
    throw new Error('REFERENCE_RESEARCH_UPGRADE_REQUIRED: publish functional domain observations and feature evidence as reference-research-v8');
  const researchWarnings = new Set<string>();
  const validation = {
    expectedSourceContractSha256: route.sourceContractSha256,
    benchmarkRequired: route.gates.includes('greenfield-task-flow-benchmark'),
    expectedRequest: route.request,
    onAdvisory: (code: string, detail: string) => { researchWarnings.add(`${code}: ${detail}`); },
  };
  validateReferenceResearch(process.cwd(), research, validation);
  const judgmentPaths = opts.judgment === undefined ? [] : Array.isArray(opts.judgment) ? opts.judgment : [opts.judgment];
  const verifiedJudgments: { path: string; sha256: string; purpose: string; subjectId: string }[] = [];
  if (judgmentPaths.length) {
    const { readVerifiedCliJudgment } = await import('../judgment-command.ts');
    for (const judgmentPath of judgmentPaths) {
      const verified = await readVerifiedCliJudgment(process.cwd(), invocation, judgmentPath);
      if (!['market-scope', 'task-capability', 'search-result-role', 'link-role', 'discovery-target',
        'page-access', 'reference-action', 'overlay-action', 'surface-content', 'discovery-query', 'source-language'].includes(verified.judgment.purpose))
        throw new Error('AI_JUDGMENT_INVALID: unrelated reference policy');
      const match = /^\.omd\/judgments\/records\/sha256-([a-f0-9]{64})\.json$/.exec(judgmentPath);
      if (!match) throw new Error('AI_JUDGMENT_INVALID: immutable receipt path required');
      verifiedJudgments.push({ path: judgmentPath, sha256: match[1]!, purpose: verified.judgment.purpose, subjectId: verified.judgment.subjectId });
    }
  }
  if (research.judgments?.length) {
    const { readVerifiedCliJudgment } = await import('../judgment-command.ts');
    for (const receipt of research.judgments) {
      const verified = await readVerifiedCliJudgment(process.cwd(), invocation, receipt.path);
      if (verified.judgment.purpose !== receipt.purpose || verified.judgment.subjectId !== receipt.subjectId
        || !receipt.path.endsWith(`sha256-${receipt.sha256}.json`))
        throw new Error('AI_JUDGMENT_CONTEXT_MISMATCH: research judgment changed');
    }
  }
  const path = '.omd/reference-research.json';
  if (mode === 'set') {
    const retained = [...research.judgments ?? [], ...verifiedJudgments];
    publishReferenceResearch(process.cwd(), retained.length ? { ...research, judgments: retained } : research,
      { ...validation, verifiedJudgments: retained }, projectWriterFromActivation(opts, command));
  }
  const { referenceResearchUnknownFieldWarnings } = await import('../../core/ref/reference-research-parser.ts');
  const result = {
    path,
    domainPath: DOMAIN_REFERENCES_PATH,
    designPath: DESIGN_REFERENCES_PATH,
    domainSources: research.domainReference.sources.length,
    designSources: research.designReference.sources.length,
    benchmarkBound: research.domainReference.benchmarkSha256 !== null,
    warnings: [...(strategyWarning === null ? [] : [strategyWarning]),
      ...researchWarnings,
      ...(researchInput === undefined ? [] : referenceResearchUnknownFieldWarnings(researchInput))],
    verifiedJudgments,
  };
  if (opts.json) process.stdout.write(JSON.stringify(result));
  else console.log(`ok — separate domain and design reference lanes are current (${result.domainSources} domain sources, ${result.designSources} design sources${result.benchmarkBound ? ', deep task-flow benchmark bound' : ''})`);
  process.exit(0);
}

export async function cmdRefTidy(opts: Opts): Promise<never> {
  const allowed = new Set(['_', 'apply', 'json', 'activation']);
  if (opts._.length || Object.keys(opts).some(key => !allowed.has(key))
    || (opts.apply !== undefined && opts.apply !== true) || (opts.json !== undefined && opts.json !== true)) {
    throw new Error('usage: omd ref tidy [--apply] [--json]; preview by default, --apply archives exact bytes before removing reference clutter');
  }
  const { tidyReferences } = await import('../../core/ref/tidy.ts');
  const apply = opts.apply === true;
  const invocation = apply ? invocationFromActivation(opts, 'omd ref tidy') : undefined;
  const release = invocation ? acquireProjectMutationLock(process.cwd(), invocation) : undefined;
  let result: ReturnType<typeof tidyReferences>;
  try { result = tidyReferences(process.cwd(), invocation ? projectWriter(invocation) : undefined); }
  finally { release?.(); }
  if (opts.json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else {
    console.log(`${apply ? 'archived' : 'would archive'} ${result.files.length} file(s)`);
    for (const entry of result.files) console.log(`  ${entry.path} -> ${entry.archivePath}\n    ${entry.reason}`);
    if (!apply && result.files.length) console.log('Re-run with --apply to archive these exact bytes and remove the originals.');
    if (result.manifestPath) console.log(`Recovery manifest: ${result.manifestPath}`);
    console.log(result.guidance);
  }
  process.exit(0);
}

export async function cmdRefLeads(mode: string | undefined, opts: Opts): Promise<never> {
  if ((mode !== 'add' && mode !== 'search') || !opts.input || opts._.length) throw new Error('usage: omd ref leads add|search --input <json> [--json]');
  const command = `omd ref leads ${mode}`;
  if (!existsSync(join(process.cwd(), '.omd/route.json'))) throw new Error('ROUTE_UNCLASSIFIED: publish a validated route before registering search leads');
  const { readPersistedRoute } = await import('../../core/route/index.ts');
  const route = readPersistedRoute(process.cwd(), invocationFromActivation(opts, command));
  const writer = projectWriterFromActivation(opts, command);
  const input = inputJson(opts.input, command);
  const { publishSearchLeads } = await import('../../core/ref/search-leads.ts');
  const leads = mode === 'add' ? input : await (await import('../../core/ref/search-leads-fetch.ts')).searchLeads(input);
  const receipt = publishSearchLeads(writer, route.sourceContractSha256, leads);
  process.stdout.write(`${JSON.stringify({ receipt, leads }, null, opts.json ? undefined : 2)}\n`);
  process.exit(0);
}

export async function cmdRefSearch(opts: Opts): Promise<never> {
  const command = 'omd ref search';
  if (opts._.length || !opts.input) throw new Error('usage: omd ref search --input <lane-query-url-queryParam.json> [--json]; get the exact input with omd schema reference-search');
  const { parseSearchInput, executeReferenceSearch, readSearchExecution, searchObserved } = await import('../../core/ref/search-execution.ts');
  const { withBrowser } = await import('../../core/render/index.ts');
  const input = parseSearchInput(inputJson(opts.input, command));
  const writer = projectWriterFromActivation(opts, command);
  const { withAcquisitionDeadline, SEARCH_BUDGET_MS, AcquisitionTimeoutError } = await import('../../core/ref/acquisition-deadline.ts');
  const { publishSearchLaunchTimeout } = await import('../../core/ref/search-launch-timeout.ts');
  let receipt;
  try { receipt = await withAcquisitionDeadline({ budgetMs: SEARCH_BUDGET_MS, phase: 'ref search' },
    scope => withBrowser(browser => { scope.own(browser); return executeReferenceSearch(browser, input, writer); })); }
  catch (error) {
    if (!(error instanceof AcquisitionTimeoutError)) throw error;
    receipt = publishSearchLaunchTimeout(input, writer);
  }
  const execution = readSearchExecution(process.cwd(), receipt, input.lane);
  process.stdout.write(`${JSON.stringify({ receipt, execution, ...(searchObserved(execution) ? {} : {
    recovery: 'Run omd ref work-next --json: Google in a consented browser first, then available host search, omd ref leads search (DuckDuckGo HTML), and Bing last.'
  }) }, null, opts.json ? undefined : 2)}\n`);
  // A failed attempt is durable evidence of a gap, never an automatically successful search.
  process.exit(searchObserved(execution) ? 0 : 1);
}

export async function cmdRefNavigate(opts: Opts): Promise<never> {
  const source = opts._[0];
  const allowed = new Set(['_', 'lane', 'entry', 'activation', 'json']);
  if (!source || opts._.length !== 1 || !opts.lane || Object.keys(opts).some(key => !allowed.has(key))) {
    throw new Error('usage: omd ref navigate <url> --lane domain|design [--entry public-directory|free-gallery] [--json]; direct entries and navigation receipts are not board references');
  }
  if (Object.hasOwn(opts, 'entry') && (typeof opts.entry !== 'string' || !['public-directory', 'free-gallery'].includes(opts.entry))) {
    throw new Error('REFERENCE_DISCOVERY_ENTRY_KIND: --entry requires public-directory or free-gallery');
  }
  const { createReferenceAcquisitionSession } = await import('../../core/ref/acquisition-session.ts');
  const { discoveryLane, directDiscoveryEntry } = await import('../../core/ref/discovery-record.ts');
  const { ReferenceNavigationError } = await import('../../core/ref/navigation-capture.ts');
  const writer = projectWriterFromActivation(opts, 'omd ref navigate');
  const session = createReferenceAcquisitionSession(writer);
  let receipt: Awaited<ReturnType<typeof session.navigate>> | undefined;
  let failure: InstanceType<typeof ReferenceNavigationError> | undefined;
  const lane = discoveryLane(opts.lane);
  const entry = opts.entry === undefined ? undefined : directDiscoveryEntry(opts.entry, lane);
  try { receipt = await session.navigate(source, lane, entry); }
  catch (error) {
    if (opts.json && error instanceof ReferenceNavigationError && error.attempt) failure = error;
    else throw error;
  } finally { await session.close(); }
  if (failure) {
    process.stdout.write(`${JSON.stringify({ attempt: failure.attempt, error: failure.message })}\n`);
    process.exit(1);
  }
  console.log(JSON.stringify(receipt));
  process.exit(0);
}

export async function cmdRefDiscoveryBatch(opts: Opts): Promise<never> {
  if (opts._.length || !opts.input) throw new Error('usage: omd ref discover-batch --input <operations.json> [--recovery] [--json]');
  const { parseDiscoveryBatchInput, runDiscoveryBatch } = await import('../../core/ref/discovery-batch.ts');
  const items = parseDiscoveryBatchInput(inputJson(opts.input, 'omd ref discover-batch'));
  if (opts.recovery) {
    const { requireNovelRecoveryBatch } = await import('../../core/ref/discovery-recovery.ts');
    requireNovelRecoveryBatch(process.cwd(), items);
  }
  const writer = projectWriterFromActivation(opts, 'omd ref discover-batch');
  const { withAcquisitionDeadline, BATCH_BUDGET_MS } = await import('../../core/ref/acquisition-deadline.ts');
  const result = await withAcquisitionDeadline({ budgetMs: BATCH_BUDGET_MS, phase: 'ref discover-batch' },
    scope => runDiscoveryBatch(null, process.cwd(), items, writer, scope));
  process.stdout.write(`${JSON.stringify({ ok: result.outcomes.every(outcome => outcome.ok), ...result }, null, opts.json ? undefined : 2)}\n`);
  process.exit(result.outcomes.every(outcome => outcome.ok) ? 0 : 1);
}

export async function cmdRefControlObserve(opts: Opts): Promise<never> {
  if (!opts.url || !opts.selector || opts._.length) throw new Error('usage: omd ref control-observe --url <public-https-url> --selector <control> --json');
  const { captureReferenceControlObservation } = await import('../../core/ref/control-observation.ts');
  const { withBrowser } = await import('../../core/render/index.ts');
  const writer = projectWriterFromActivation(opts, 'omd ref control-observe');
  const result = await withBrowser(browser => captureReferenceControlObservation(browser, process.cwd(),
    { url: opts.url!, selector: opts.selector! }, writer));
  console.log(JSON.stringify(result));
  process.exit(0);
}

export async function cmdRefCookieControl(opts: Opts): Promise<never> {
  if (!opts.url || !opts.selector || !opts.text || opts._.length
    || Object.keys(opts).some(key => !['_', 'url', 'selector', 'text', 'contentSelector', 'json'].includes(key)))
    throw new Error('usage: omd ref cookie-control --url <public-https-url> --selector <button> --text <exact-visible-text> [--content-selector <reference-content>] --json');
  const { readReferenceBrowserConfig } = await import('../../core/ref/browser-config.ts');
  const config = readReferenceBrowserConfig();
  if (config.mode !== 'profile') throw new Error('REFERENCE_COOKIE_CONTROL_CONSENT_REQUIRED: consented OMD profile required (no CDP or user browser)');
  const { runReferenceCookieControl } = await import('../../core/ref/cookie-control.ts');
  const { withBrowser } = await import('../../core/render/index.ts');
  const result = await withBrowser(browser => runReferenceCookieControl(browser, {
    url: opts.url!, selector: opts.selector!, text: opts.text!,
    ...(opts.contentSelector === undefined ? {} : { contentSelector: opts.contentSelector }),
  }),
    undefined, { reference: true, config });
  console.log(JSON.stringify(result));
  process.exit(0);
}

