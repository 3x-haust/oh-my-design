import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { PUBLIC_SCHEMA_NAMES } from '../cli/public-surface.ts';
import {
  ROOT,
  currentNativePiInvocation,
  inputJson,
  invocationFromActivation,
  isRecord,
  parseArgs,
  projectWriter,
  type Opts,
} from '../cli/runtime.ts';
import { validateActivationContext } from '../../core/runtime/activation.ts';
import {
  requireCurrentIntentLedgerAuthorization,
  requireFinalEvidenceManifestAuthorization,
  requireFinalReviewerLaneAuthorization,
  requireStaticEvidenceResultAuthorization,
} from '../../core/runtime/invocation.ts';
import { validateIntentCurrentPointer } from '../../core/runtime/intent.ts';
import { canonicalJson } from '../../core/ref/board-artifacts.ts';
import { checkProductionReadiness } from '../../core/brief/production-readiness.ts';

async function contextualSchema(entry: import('../../core/schema/inputs.ts').InputSkeleton, opts: Opts): Promise<import('../../core/schema/inputs.ts').InputSkeleton> {
  if (!['reference-research', 'reference-search-leads', 'trusted-lifecycle-manifest'].includes(entry.name)
    || !existsSync(join(process.cwd(), '.omd/route.json'))) return entry;
  try {
    const { readPersistedRoute } = await import('../../core/route/index.ts');
    const route = readPersistedRoute(process.cwd(), invocationFromActivation(opts, `omd schema ${entry.name}`));
    const skeleton = structuredClone(entry.skeleton) as Record<string, unknown>;
    if (entry.name === 'trusted-lifecycle-manifest' && route.sourceContract.processPolicy !== undefined) {
      delete skeleton.entrySurface;
      return { ...entry, skeleton, command: 'omd lifecycle finish --json' };
    }
    if ('request' in skeleton) skeleton.request = route.request;
    if ('sourceContractSha256' in skeleton) skeleton.sourceContractSha256 = route.sourceContractSha256;
    if ('projectMode' in skeleton) skeleton.projectMode = route.projectMode;
    return { ...entry, skeleton };
  } catch { return entry; } // No validated route: preserve the static starter without inventing authority.
}

async function cmdSchema(name: string | undefined, opts: Opts): Promise<never> {
  const { INPUT_SKELETONS, inputSkeleton } = await import('../../core/schema/inputs.ts');
  const publicEntries = INPUT_SKELETONS.filter((entry) => PUBLIC_SCHEMA_NAMES.has(entry.name));
  if (name === undefined || name === 'list') {
    if (opts.json) process.stdout.write(JSON.stringify(publicEntries.map((entry) => ({ name: entry.name, path: entry.path, command: entry.command }))));
    else for (const entry of publicEntries) console.log(`  ${entry.name.padEnd(22)} ${entry.path.padEnd(38)} ${entry.command}`);
    process.exit(0);
  }
  if (name === 'ai-judgment') {
    if (typeof opts.purpose !== 'string' || opts._.length
      || (opts.purpose === 'design-language-reading' && !opts.input)) throw new Error('usage: omd schema ai-judgment --purpose <workflow-intent|workflow-continuation|target-market|design-language-reading> [--input <design-language-input.json>] [--json]');
    const { judgmentStarter } = await import('../judgment-command.ts');
    const entry = judgmentStarter(process.cwd(), opts.purpose, invocationFromActivation(opts, 'omd schema ai-judgment'), opts.input);
    if (opts.json) process.stdout.write(JSON.stringify(entry));
    else console.log(`${entry.name} -> ${entry.path}\nvalidated by: ${entry.command}\nallowed decisions: ${entry.decisions.join(', ')}\n${JSON.stringify(entry.skeleton, null, 2)}`);
    process.exit(0);
  }
  if (!PUBLIC_SCHEMA_NAMES.has(name)) {
    const { closestNames } = await import('../../core/schema/suggestions.ts');
    const suggestions = closestNames(name, [...PUBLIC_SCHEMA_NAMES]);
    throw new Error(`unknown schema ${name}${suggestions.length ? `; did you mean: ${suggestions.join(', ')}?` : '; run omd schema list'}`);
  }
  const staticEntry = inputSkeleton(name);
  const entry = await contextualSchema(staticEntry, opts);
  if (opts.json) process.stdout.write(JSON.stringify(entry));
  else {
    console.log(`${entry.name} -> ${entry.path}`);
    console.log(`validated by: ${entry.command}`);
    if (entry.constraints !== undefined) {
      console.log('constraints:');
      for (const constraint of entry.constraints) console.log(`- ${constraint}`);
    }
    console.log(JSON.stringify(entry.skeleton, null, 2));
  }
  process.exit(0);
}

async function cmdStage(mode: string | undefined, opts: Opts): Promise<never> {
  if (mode !== 'next' || opts._.length) throw new Error('usage: omd stage next --json');
  const { nextStageWork } = await import('../../core/stage/next.ts');
  const work = nextStageWork(
    process.cwd(),
    join(ROOT, 'core'),
    invocationFromActivation(opts, 'omd stage next'),
  );
  console.log(JSON.stringify(work));
  process.exit(0);
}

async function cmdCompletion(mode: string | undefined, opts: Opts): Promise<never> {
  const { formatCompletionHostCapabilities } = await import('../../core/completion/host-capabilities.ts');
  if (mode !== 'preflight' || opts._.length > 0) throw new Error('usage: omd completion preflight [--activation <host-issued-invocation.json>] [--json]');
  // Local transport may read the gate; it still cannot mint reviewer/manifest authorization.
  const invocation = invocationFromActivation(opts, 'omd completion preflight');
  const pointerPath = join(process.cwd(), '.omd', 'final-evidence-v2.json');
  if (!existsSync(pointerPath)) throw new Error('FINAL_EVIDENCE_REQUIRED: .omd/final-evidence-v2.json is missing; build/captures are not terminal completion evidence');
  if (invocation.activation.hostCapability.host === 'pi') {
    const { checkNativeFinalReview } = await import('../../core/runtime/native-final-review-state.ts');
    checkNativeFinalReview({ root: process.cwd(), invocation });
  }
  const pointerBytes = readFileSync(pointerPath);
  requireFinalReviewerLaneAuthorization(invocation, process.cwd(), pointerBytes);
  const pointer = JSON.parse(pointerBytes.toString('utf8')) as unknown;
  if (!isRecord(pointer) || typeof pointer.record !== 'string') throw new Error('FINAL_EVIDENCE_MANIFEST_AUTHORIZATION_REQUIRED: final v2 evidence pointer is invalid');
  const recordPath = resolve(process.cwd(), '.omd', 'final-evidence-v2-runs', pointer.record);
  if (relative(join(process.cwd(), '.omd', 'final-evidence-v2-runs'), recordPath).startsWith('..')) throw new Error('FINAL_EVIDENCE_MANIFEST_AUTHORIZATION_REQUIRED: final v2 evidence record escapes the project');
  const recordBytes = readFileSync(recordPath);
  requireFinalEvidenceManifestAuthorization(invocation, process.cwd(), recordBytes);
  const record = JSON.parse(recordBytes.toString('utf8')) as unknown;
  if (!isRecord(record) || !isRecord(record.graph)) throw new Error('FINAL_REVIEWER_LANE_AUTHORIZATION_REQUIRED: final graph is required');
  for (const lane of ['blindLane', 'fidelityLane', 'protocolLane']) {
    const descriptor = record.graph[lane];
    if (!isRecord(descriptor) || typeof descriptor.path !== 'string') throw new Error(`FINAL_REVIEWER_LANE_AUTHORIZATION_REQUIRED: ${lane} receipt is required`);
    requireFinalReviewerLaneAuthorization(invocation, process.cwd(), readFileSync(resolve(process.cwd(), descriptor.path)));
  }
  if (record.graph.schema !== 'final-evidence-v2-adaptive-omission-graph'
    && !(record.graph.schema === 'final-evidence-v2-workflow-graph-v1' && record.graph.productionSchema === 'final-evidence-v2-adaptive-omission-graph')) {
    const intentPointer = validateIntentCurrentPointer(inputJson(join(process.cwd(), '.omd', 'intent-current.json'), 'completion current intent pointer'));
    requireCurrentIntentLedgerAuthorization(invocation, process.cwd(), readFileSync(join(process.cwd(), '.omd', intentPointer.record)));
  }
  if (isRecord(record.staticEvidence) && typeof record.staticEvidence.path === 'string') requireStaticEvidenceResultAuthorization(invocation, process.cwd(), readFileSync(resolve(process.cwd(), record.staticEvidence.path)));
  const { checkTerminalCompletion } = await import('../../core/completion/preflight.ts');
  const result = checkTerminalCompletion(process.cwd(), invocation);
  if (opts.json) process.stdout.write(JSON.stringify(result)); else console.log(`ok — terminal completion evidence is current\n${result.limitations.map(item => `limitation (${item.stage}): ${item.reason}`).join('\n')}\n${formatCompletionHostCapabilities(result.hostCapabilities)}`);
  process.exit(0);
}

async function cmdGuard(mode: string | undefined, opts: Opts): Promise<never> {
  if (!['production', 'completion'].includes(mode ?? '') || opts._.length > 0) {
    throw new Error('usage: omd guard production [--path <project-relative-file>] [--json] | omd guard completion [--json]');
  }
  const invocation = invocationFromActivation(opts, `omd guard ${mode}`);
  const result = checkProductionReadiness(process.cwd(), invocation, join(ROOT, 'core'), opts.path);
  if (!result.ok || mode === 'production') {
    if (opts.json) process.stdout.write(JSON.stringify(result));
    else console.log(result.ok ? 'ok — selected pre-production inputs are current; this is not completion' : result.blockers.join('\n'));
    process.exit(result.ok ? 0 : 1);
  }
  // Process reviews are advisory; terminal evidence and independent outcome review remain authoritative.
  return cmdCompletion('preflight', opts);
}

async function cmdRoute(mode: string | undefined, opts: Opts): Promise<never> {
  const { adaptiveRouteRecordSha256, changedPathsForAdaptiveRoute, classifyRoute, pathsOutsideScope, publishAdaptiveRoute, readPersistedRoute, validateRouteInput } = await import('../../core/route/index.ts');
  const recordPath = join(process.cwd(), '.omd', 'route.json');

  if (mode === 'starter') {
    if (opts._.length || opts.input) throw new Error('usage: omd route starter [--json]');
    const { inputSkeleton } = await import('../../core/schema/inputs.ts');
    const { readPiRequest } = await import('../../extensions/omd-request-source.ts');
    const request = readPiRequest(process.cwd())?.request;
    let starter = 'route-input';
    let routeRequest: string | undefined;
    try {
      if (!existsSync(recordPath)) throw new Error('no published route');
      const { readPersistedRoute } = await import('../../core/route/index.ts');
      const route = readPersistedRoute(process.cwd(), invocationFromActivation(opts, 'omd route starter'));
      routeRequest = route.request;
      starter = route.deliveryMode === 'design-only' ? 'design-route-input'
        : route.projectMode === 'greenfield' ? 'product-route-input' : 'route-input';
    } catch { /* An unclassified request has no authorized route to infer a delivery mode from. */ }
    const staticEntry = inputSkeleton(starter);
    const skeleton = structuredClone(staticEntry.skeleton) as Record<string, unknown>;
    if (request ?? routeRequest) skeleton.request = request ?? routeRequest;
    const entry = { ...staticEntry, skeleton };
    if (opts.json) process.stdout.write(JSON.stringify(entry)); else console.log(JSON.stringify(entry, null, 2));
    process.exit(0);
  }

  if (mode === 'validate') {
    if (!opts.input || opts._.length > 0) throw new Error('usage: omd route validate --input <route-input.json> [--json]');
    const { diagnoseAdaptiveRouteInput, routeAdaptiveFlow } = await import('../../core/route/adaptive-flow.ts');
    const rawInput = inputJson(opts.input, 'omd route validate');
    const { bindNativeDesignRouteInput } = await import('../../core/route/native-design-policy.ts');
    const input = currentNativePiInvocation() === undefined ? rawInput
      : bindNativeDesignRouteInput(process.cwd(), currentNativePiInvocation()!, rawInput);
    let localeDesign: import('../../core/locale/design-context.ts').LocaleDesignRoute | undefined;
    if (opts.localeContext !== undefined) {
      if (resolve(opts.localeContext) !== resolve(process.cwd(), '.omd/locale-design-context.json')) {
        throw new Error('LOCALE_DESIGN_CONTEXT_PATH: --locale-context must name .omd/locale-design-context.json');
      }
      const { routeLocaleDesignContext } = await import('../../core/locale/design-context.ts');
      localeDesign = routeLocaleDesignContext(inputJson(opts.localeContext, 'omd route validate --locale-context'));
    }
    const diagnostics = diagnoseAdaptiveRouteInput(input, localeDesign);
    const { adaptiveRouteUnknownFieldWarnings } = await import('../../core/route/adaptive-flow-boundary.ts');
    const { uxPolicyWarnings } = await import('../../core/ux/policy.ts');
    const warnings = [...adaptiveRouteUnknownFieldWarnings(input), ...uxPolicyWarnings(isRecord(input) ? input.uxPolicy : undefined)];
    const report = { schema: 'adaptive-route-validation-v1', ok: diagnostics.length === 0, published: false, diagnostics, warnings };
    if (diagnostics.length) {
      const next = 'Repair the named fields together, preserving user facts, risk, scope and selected work; rerun route validate with the same input and locale context. Do not run completion or guess unrelated stages. Classification is available only after validation passes.';
      if (opts.json) process.stdout.write(JSON.stringify({ ...report, next }));
      else console.error(`${diagnostics.map(d => `${d.path}: ${d.message}`).join('\n')}\n${next}`);
      process.exit(1);
    }
    // A clean diagnostic report still goes through the canonical fail-closed validator.
    const record = routeAdaptiveFlow(input, undefined, localeDesign);
    if (opts.json) process.stdout.write(JSON.stringify({ ...report, deliveryMode: record.deliveryMode ?? 'implementation', stages: record.strategy.stages,
      next: 'Run route classify with this input and the same locale context; then stage resume. Validation alone did not publish or complete any stage.' }));
    else console.log('ok — route input is valid; no project state was written');
    process.exit(0);
  }

  if (mode === 'classify') {
    if (!opts.input) throw new Error('usage: omd route classify --input <route-input.json> [--activation <host-issued-invocation.json>] [--json]');
    const rawInput = inputJson(opts.input, 'omd route classify');
    const { bindNativeDesignRouteInput } = await import('../../core/route/native-design-policy.ts');
    const input = validateRouteInput(currentNativePiInvocation() === undefined ? rawInput
      : bindNativeDesignRouteInput(process.cwd(), currentNativePiInvocation()!, rawInput));
    if (input.processPolicy && (input.reviewPurpose === undefined || input.reviewPurposeAuthority == null)) {
      throw new Error('ROUTE_AUTHORITY_REQUIRED: current-process routes require a genuine host review-purpose-origin-v1 receipt, including ordinary review; starter null is not publication authority');
    }
    let localeDesign: import('../../core/locale/design-context.ts').LocaleDesignRoute | undefined;
    if (opts.localeContext !== undefined) {
      const canonicalLocalePath = resolve(process.cwd(), '.omd', 'locale-design-context.json');
      if (resolve(opts.localeContext) !== canonicalLocalePath) {
        throw new Error('LOCALE_DESIGN_CONTEXT_PATH: --locale-context must name .omd/locale-design-context.json');
      }
      const { routeLocaleDesignContext } = await import('../../core/locale/design-context.ts');
      localeDesign = routeLocaleDesignContext(inputJson(opts.localeContext, 'omd route classify --locale-context'));
    }
    const invocation = invocationFromActivation(opts, 'omd route classify');
    const writer = projectWriter(invocation);
    const marketJudgment = typeof opts.judgment === 'string'
      ? await (await import('../judgment-command.ts')).readVerifiedCliJudgment(process.cwd(), invocation, opts.judgment) : undefined;
    if (marketJudgment !== undefined && marketJudgment.judgment.purpose !== 'target-market')
      throw new Error('AI_JUDGMENT_INVALID: route classification expects target-market');
    const published = publishAdaptiveRoute(
      process.cwd(),
      input,
      writer,
      invocation,
      localeDesign,
      marketJudgment,
    );
    const activationEvidencePath = process.env.OMD_ACTIVATION_EVIDENCE_PATH;
    if (activationEvidencePath !== undefined && validateActivationContext(inputJson(activationEvidencePath, 'Codex activation evidence')).briefSha256 === invocation.activation.briefSha256) {
      writer.mkdir('.omd/receipts');
      writer.write('.omd/receipts/activation.json', `${canonicalJson(invocation.activation)}\n`);
    }
    const record = published.record;
    const path = published.pointerPath;
    if (opts.json) await new Promise<void>((done, reject) => {
      process.stdout.write(JSON.stringify(record), error => error ? reject(error) : done());
    });
    else {
      console.log(`route: ${record.route} -> ${path}`);
      console.log(`  rationale: ${record.strategy.rationale}`);
      console.log(`  roles: ${record.strategy.roles.join(', ')}`);
      console.log(`  stages: ${record.strategy.stages.join(' -> ')}`);
      console.log(`  methods: ${record.strategy.methods.join(', ')}`);
      console.log(`  references: ${record.references.decision} — ${record.references.intended}`);
    }
    process.exit(0);
  }

  if (mode === 'show' || mode === undefined) {
    if (opts._.length > 0) throw new Error('usage: omd route show [--activation <host-issued-invocation.json>] [--json]');
    if (!existsSync(recordPath)) throw new Error('ROUTE_UNCLASSIFIED: run `omd route classify --input <route-input.json>` first');
    const record = readPersistedRoute(process.cwd(), invocationFromActivation(opts, 'omd route show'));
    if (opts.json) await new Promise<void>((done, reject) => {
      process.stdout.write(JSON.stringify(record), error => error ? reject(error) : done());
    });
    else {
      console.log(`route: ${record.route}`);
      console.log(`  request: ${record.request}`);
      console.log(`  roles: ${record.strategy.roles.join(', ')}`);
      console.log(`  stages: ${record.strategy.stages.join(' -> ')}`);
      console.log(`  methods: ${record.strategy.methods.join(', ')}`);
      console.log(`  allowed: ${record.allowedPaths.join(', ')}`);
      for (const skipped of record.strategy.skips) console.log(`  skip ${skipped.id}: ${skipped.reason}`);
    }
    process.exit(0);
  }

  if (mode === 'check') {
    if (opts._.length > 0) throw new Error('usage: omd route check [--activation <host-issued-invocation.json>] [--json]');
    if (!existsSync(recordPath)) throw new Error('ROUTE_UNCLASSIFIED: run `omd route classify --input <route-input.json>` first');
    const invocation = invocationFromActivation(opts, 'omd route check');
    const record = readPersistedRoute(process.cwd(), invocation);
    let changed: readonly string[];
    try {
      changed = changedPathsForAdaptiveRoute(
        process.cwd(), record, adaptiveRouteRecordSha256(record), invocation,
      );
    } catch (error) {
      throw new Error(`ROUTE_SCOPE_UNVERIFIABLE: ${error instanceof Error ? error.message : String(error)}`);
    }
    const outside = pathsOutsideScope(record, changed);
    if (opts.json) process.stdout.write(JSON.stringify({ route: record.route, changed: changed.length, outside }));
    else if (outside.length === 0) console.log(`ok — ${changed.length} changed paths, all inside the ${record.route} route scope`);
    else {
      console.error(`ROUTE_SCOPE_EXCEEDED: ${outside.length} path(s) outside the declared scope`);
      for (const path of outside) console.error(`  - ${path}`);
      console.error(`  allowed: ${record.allowedPaths.join(', ')}`);
    }
    process.exit(outside.length === 0 ? 0 : 1);
  }

  throw new Error(`unknown command route${mode ? ` ${mode}` : ''}; run omd help`);
}

function unknown(command: string, sub: string | undefined): never {
  throw new Error(`unknown command ${command}${sub ? ` ${sub}` : ''}; run omd help`);
}

export async function runRouteGroup(args: string[]): Promise<never> {
  const command = args[0]!;
  const sub = args[1];
  const opts = parseArgs(args.slice(2));
  if (command === 'route') {
    if (!['starter', 'validate', 'classify', 'show', 'check'].includes(sub ?? '')) return unknown(command, sub);
    return cmdRoute(sub, opts);
  }
  if (command === 'schema') return cmdSchema(sub, opts);
  if (command === 'stage') {
    if (sub !== 'next') return unknown(command, sub);
    return cmdStage(sub, opts);
  }
  if (command === 'guard') {
    if (sub !== 'production' && sub !== 'completion') return unknown(command, sub);
    return cmdGuard(sub, opts);
  }
  return unknown(command, sub);
}
