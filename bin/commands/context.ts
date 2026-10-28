import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { canonicalJson } from '../../core/ref/board-artifacts.ts';
import {
  inputJson,
  invocationFromActivation,
  parseArgs,
  projectWriter,
  type Opts,
} from '../cli/runtime.ts';

async function cmdLocale(mode: string | undefined, opts: Opts): Promise<never> {
  if (mode === 'plan' && opts._.length === 0) {
    const { localeDesignRouteFindings, routeLocaleDesignContext } = await import('../../core/locale/design-context.ts');
    const contextPath = opts.input ?? join(process.cwd(), '.omd', 'locale-design-context.json');
    const route = routeLocaleDesignContext(inputJson(contextPath, 'omd locale plan'));
    const findings = localeDesignRouteFindings(route);
    if (opts.json) process.stdout.write(JSON.stringify({ route, findings }));
    else {
      for (const finding of findings) console.error(`[error] ${finding.id}: ${finding.message}`);
      if (findings.length === 0) console.log(`ok — locale design route: ${route.decision} for ${route.context.surfaceLocale}`);
    }
    process.exit(findings.length > 0 ? 1 : 0);
  }
  if (mode === 'profile' && opts._.length === 0) {
    if (!opts.input) throw new Error('usage: omd locale profile --input <profile.json> --locale-context .omd/locale-design-context.json [--json] | --publish --input <profile.json> --activation <host-issued-invocation.json>');
    if (opts.publish) {
      const { publishCulturalDesignProfile } = await import('../../core/locale/cultural-profile-files.ts');
      const result = publishCulturalDesignProfile(
        process.cwd(),
        inputJson(opts.input, 'omd locale profile --publish'),
        invocationFromActivation(opts, 'omd locale profile --publish'),
      );
      const output = {
        profileSha256: result.profileSha256,
        profilePointerPath: result.profilePointerPath,
        projectionSha256: result.projectionSha256,
        projectionPointerPath: result.projectionPointerPath,
      };
      if (opts.json) process.stdout.write(JSON.stringify(output));
      else console.log(`ok — cultural profile ${output.profileSha256}; projection ${output.projectionSha256}`);
      process.exit(0);
    }
    if (!opts.localeContext) throw new Error('usage: omd locale profile --input <profile.json> --locale-context .omd/locale-design-context.json [--json]');
    const { routeLocaleDesignContext } = await import('../../core/locale/design-context.ts');
    const {
      culturalDesignProfileSha256,
      culturalDesignProjectionSha256,
      projectCulturalDesignProfile,
      validateCulturalDesignProfile,
    } = await import('../../core/locale/cultural-profile.ts');
    const route = routeLocaleDesignContext(inputJson(opts.localeContext, 'omd locale profile --locale-context'));
    const profile = validateCulturalDesignProfile(inputJson(opts.input, 'omd locale profile'), route);
    const projection = projectCulturalDesignProfile(profile, route);
    const result = {
      profileSha256: culturalDesignProfileSha256(profile),
      projection,
      projectionSha256: culturalDesignProjectionSha256(projection),
    };
    if (opts.json) process.stdout.write(JSON.stringify(result));
    else console.log(`ok — cultural profile ${result.profileSha256}; projection ${result.projectionSha256}`);
    process.exit(0);
  }
  if (mode === 'profile-check' && opts._.length === 0) {
    const { readCurrentCulturalDesignProfile } = await import('../../core/locale/cultural-profile-files.ts');
    const { verifyRemoteCulturalDesignSources } = await import('../../core/locale/source-capture-files.ts');
    const result = readCurrentCulturalDesignProfile(
      process.cwd(),
      invocationFromActivation(opts, 'omd locale profile-check'),
    );
    const remote = await verifyRemoteCulturalDesignSources(
      process.cwd(), result.profile.sources, result.profile.contextSha256,
    );
    const output = {
      profileSha256: result.profileSha256,
      profilePointerPath: result.profilePointerPath,
      projectionSha256: result.projectionSha256,
      projectionPointerPath: result.projectionPointerPath,
      remote,
    };
    if (opts.json) process.stdout.write(JSON.stringify(output));
    else console.log(`ok — cultural profile ${output.profileSha256}; projection ${output.projectionSha256}`);
    process.exit(0);
  }
  if (mode === 'source-capture' && opts._.length === 0) {
    if (!opts.url) throw new Error('usage: omd locale source-capture --url <https-url> --activation <host-issued-invocation.json> [--json]');
    const { captureCulturalDesignSource } = await import('../../core/locale/source-capture-files.ts');
    const result = await captureCulturalDesignSource(
      process.cwd(), opts.url, invocationFromActivation(opts, 'omd locale source-capture'),
    );
    const output = {
      status: result.receipt.status,
      url: result.receipt.url,
      attemptedUrl: result.receipt.attemptedUrl,
      capturedAt: result.receipt.capturedAt,
      captureSha256: result.receiptSha256,
      receiptPath: result.receiptPath,
      contentPath: result.contentPath,
      reason: result.receipt.reason,
    };
    if (opts.json) process.stdout.write(JSON.stringify(output));
    else console.log(`ok — locale source ${output.status}: ${output.captureSha256}`);
    process.exit(0);
  }
  if (mode === 'source-stability' && opts._.length === 0) {
    if (!opts.url) throw new Error('usage: omd locale source-stability --url <https-url> --activation <host-issued-invocation.json> [--json]');
    const { captureStableCulturalDesignSource } = await import('../../core/locale/source-capture-files.ts');
    const result = await captureStableCulturalDesignSource(
      process.cwd(), opts.url, invocationFromActivation(opts, 'omd locale source-stability'),
    );
    const output = {
      status: result.receipt.status,
      url: result.receipt.url,
      attemptedUrl: result.receipt.attemptedUrl,
      capturedAt: result.receipt.capturedAt,
      captureSha256: result.receiptSha256,
      receiptPath: result.receiptPath,
      contentPath: result.contentPath,
      reason: result.receipt.reason,
    };
    if (opts.json) process.stdout.write(JSON.stringify(output));
    else console.log(`ok — locale source stability ${output.status}: ${output.captureSha256}`);
    process.exit(0);
  }
  if (mode !== 'check' || opts._.length > 0) throw new Error('usage: omd locale plan [--input .omd/locale-design-context.json] [--json] | omd locale source-capture --url <https-url> --activation <host-issued-invocation.json> [--json] | omd locale source-stability --url <https-url> --activation <host-issued-invocation.json> [--json] | omd locale profile --input <profile.json> --locale-context .omd/locale-design-context.json [--json] | omd locale check [--input .omd/locale.json] [--deck .omd/copy-deck.md] [--json]');
  const { checkLocaleCopyBinding, validateLocaleContract } = await import('../../core/locale/contract.ts');
  const contractPath = opts.input ?? join(process.cwd(), '.omd', 'locale.json');
  const contract = validateLocaleContract(inputJson(contractPath, 'omd locale check'));
  const deckPath = opts.deck ?? join(process.cwd(), '.omd', 'copy-deck.md');
  const findings = existsSync(deckPath)
    ? checkLocaleCopyBinding(contract, readFileSync(deckPath, 'utf8'))
    : [{ id: 'LOCALE-DECK-MISSING', message: `No copy deck at ${relative(process.cwd(), deckPath)} to bind locales against.` }];
  if (opts.json) process.stdout.write(JSON.stringify({ contract, findings }));
  else {
    for (const finding of findings) console.error(`[error] ${finding.id}: ${finding.message}`);
    if (findings.length === 0) console.log(`ok — ${contract.mode} contract covers ${contract.locales.join(', ')} with primary ${contract.primary}`);
  }
  process.exit(findings.length > 0 ? 1 : 0);
}

function unknown(command: string, sub: string | undefined): never {
  throw new Error(`unknown command ${command}${sub ? ` ${sub}` : ''}; run omd help`);
}

export async function runContext(args: string[]): Promise<never> {
  const [cmd, sub] = args;
  if (cmd === 'locale') {
    if (!['plan', 'profile', 'profile-check', 'source-capture', 'source-stability', 'check'].includes(sub ?? '')) {
      return unknown(cmd, sub);
    }
    return cmdLocale(sub, parseArgs(args.slice(2)));
  }
if (cmd === 'language' || cmd === 'feedback') {
    if (sub !== 'translate' && sub !== 'check' && !(cmd === 'feedback' && sub === 'report')) {
      return unknown(cmd, sub);
    }
    const opts = parseArgs(args.slice(2));
    if (cmd === 'feedback' && sub === 'report') {
      if (!opts.input || opts._.length) throw new Error('usage: omd feedback report --input <json> --json');
      const invocation = invocationFromActivation(opts, 'omd feedback report');
      const { publishQualitativeFeedback } = await import('../../core/design/qualitative-feedback.ts');
      const { readPersistedRoute } = await import('../../core/route/index.ts');
      const { sha256 } = await import('../../core/ref/board-artifacts.ts');
      const input = inputJson(opts.input, 'omd feedback report');
      if (typeof input !== 'object' || input === null
        || Reflect.get(input, 'requestSha256') !== sha256(readPersistedRoute(process.cwd(), invocation).request))
        throw new Error('QUALITATIVE_FEEDBACK: request scope');
      const result = publishQualitativeFeedback(process.cwd(), input, projectWriter(invocation));
      console.log(JSON.stringify(result));
      process.exit(0);
    }
    const kind = cmd === 'language' ? 'intake' : 'feedback';
    const { publishTranslation, readTranslation, parseInput, chosenCopyTone, requireCopyToneReview } = await import('../../core/design-language/index.ts');
    const { readPersistedRoute } = await import('../../core/route/index.ts');
    const invocation = invocationFromActivation(opts, `omd ${cmd} ${sub}`);
    if (sub === 'translate') {
      if (!opts.input || opts._.length) throw new Error(`usage: omd ${cmd} translate --input <json> --json`);
      const authored = inputJson(opts.input, `omd ${cmd} translate`);
      const routeForJudgment = readPersistedRoute(process.cwd(), invocation);
      const parsedTranslation = parseInput(authored, kind, routeForJudgment.request, routeForJudgment.sourceContractSha256);
      if (parsedTranslation.status === 'resolved') {
        if (!opts.judgment) throw new Error('AI_JUDGMENT_REQUIRED: supply --judgment <signed reading receipt>');
        const { readVerifiedCliJudgment } = await import('../judgment-command.ts');
        if (typeof opts.judgment !== 'string') throw new Error('AI_JUDGMENT_INVALID: supply one reading receipt');
        const verified = await readVerifiedCliJudgment(process.cwd(), invocation, opts.judgment);
        const payload = verified.judgment.payload as { kind?: string; textSha256?: string; chosenId?: string | null };
        if (verified.judgment.purpose !== 'design-language-reading' || verified.judgment.decision !== 'resolved'
          || payload.kind !== kind || payload.textSha256 !== parsedTranslation.textSha256 || payload.chosenId !== parsedTranslation.chosenId)
          throw new Error('AI_JUDGMENT_CONTEXT_MISMATCH: translation reading does not match the signed request judgment');
      }
      const writer = projectWriter(invocation);
      if (kind === 'feedback') {
        const route = readPersistedRoute(process.cwd(), invocation);
        const proposed = parseInput(authored, kind, route.request, route.sourceContractSha256);
        if (proposed.status === 'resolved' && !chosenCopyTone(proposed)) {
          if (!opts.page) throw new Error('FEEDBACK_MEASUREMENT_REQUIRED: supply --page <local-entry-path> for native baseline capture');
          const chosen = proposed.readings.find(r => r.id === proposed.chosenId)!;
          const { measureTargets } = await import('../../core/design-language/measurement.ts');
          const translationSha256 = createHash('sha256').update(`${canonicalJson(proposed)}\n`).digest('hex');
          const state = opts.state === undefined ? undefined : (await import('../../core/render/stateful.ts')).parseViewState(inputJson(opts.state, 'omd feedback state'));
          const baseline = await measureTargets(process.cwd(), opts.page, translationSha256, chosen.targets, undefined, state);
          if (baseline.values.some(v => !v.present || chosen.targets.some(t => t.id === v.targetId && v.value >= t.range[0] && v.value <= t.range[1]))) throw new Error('FEEDBACK_MEASUREMENT_REQUIRED: missing target or baseline already within its chosen range');
          writer.write('.omd/design-language/baseline.json', `${canonicalJson(baseline)}\n`);
        }
      }
      const result = publishTranslation(process.cwd(), invocation, writer, kind, authored);
      console.log(opts.json ? JSON.stringify(result) : result.record);
    } else {
      const route = readPersistedRoute(process.cwd(), invocation);
      const result = readTranslation(process.cwd(), kind, route);
      if (!result) throw new Error('DESIGN_LANGUAGE_REQUIRED');
      if (result.translation.status === 'needs-clarification') throw new Error('DESIGN_LANGUAGE_AMBIGUOUS');
      if (kind === 'feedback' && result.translation.status === 'resolved' && chosenCopyTone(result.translation)) {
        requireCopyToneReview(process.cwd(), route);
      } else if (kind === 'feedback' && result.translation.status === 'resolved') {
        if (!opts.page) throw new Error('FEEDBACK_MEASUREMENT_REQUIRED: supply --page <local-entry-path> for native after capture');
        const { publishMovement } = await import('../../core/design-language/check.ts');
        const { measureTargets } = await import('../../core/design-language/measurement.ts');
        const baseline = JSON.parse(readFileSync(join(process.cwd(), '.omd/design-language/baseline.json'), 'utf8'));
        const chosen = result.translation.readings.find(r => r.id === result.translation.chosenId);
        if (chosen) {
          const state = opts.state === undefined ? undefined : (await import('../../core/render/stateful.ts')).parseViewState(inputJson(opts.state, 'omd feedback state'));
          const after = await measureTargets(process.cwd(), opts.page, result.sha256, chosen.targets, undefined, state);
          publishMovement(process.cwd(), projectWriter(invocation), baseline, after, invocation);
        }
      }
      console.log(opts.json ? JSON.stringify({ ok: true, ...result }) : `ok — ${kind} translation current`);
    }
    process.exit(0);
  }
if (cmd === 'ai-judgment') {
    const opts = parseArgs(args.slice(2));
    if (sub !== 'publish' && sub !== 'check') return unknown(cmd, sub);
    if (opts._.length || (sub === 'publish' && !opts.input) || (sub === 'check' && !opts.judgment))
      throw new Error('usage: omd ai-judgment publish --input <judgment.json> | omd ai-judgment check --judgment <.omd/judgments/records/sha256-*.json>');
    const invocation = invocationFromActivation(opts, `omd ai-judgment ${sub}`);
    const { runJudgmentCommand } = await import('../judgment-command.ts');
    if (sub === 'check' && typeof opts.judgment !== 'string') throw new Error('AI_JUDGMENT_INVALID: supply one receipt');
    const result = await runJudgmentCommand(process.cwd(), invocation, sub, sub === 'publish' ? opts.input! : opts.judgment as string,
      sub === 'publish' ? projectWriter(invocation) : undefined);
    console.log(JSON.stringify(result));
    process.exit(0);
  }
  return unknown(cmd ?? '', sub);
}
