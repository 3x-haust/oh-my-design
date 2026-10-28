import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  ROOT,
  invocationFromActivation,
  projectWriterFromActivation,
  type Opts,
} from '../cli/runtime.ts';

export async function cmdRefAddBatch(opts: Opts): Promise<never> {
  const manifestPath = opts._[0];
  if (!manifestPath) {
    console.error('usage: omd ref add-batch <manifest.json>  (JSON array of { source, as, selector?, slot?, blueprint?, shot?, fromUser?, viewport?, energy?, preparation? }); omd schema reference-capture-preparation');
    process.exit(1);
  }
  const { addRefsBatch } = await import('../../core/ref/batch.ts');
  const specs = JSON.parse(readFileSync(resolve(manifestPath), 'utf8')) as import('../../core/ref/batch.ts').RefSpec[];
  if (!Array.isArray(specs) || specs.length === 0) throw new Error('manifest must be a non-empty JSON array of reference specs');
  const { captureLane } = await import('../../core/ref/capture-intake.ts');
  const invocation = invocationFromActivation(opts, 'omd ref add-batch');
  for (const s of specs) {
    if (!s || typeof s.source !== 'string' || typeof s.as !== 'string') {
      throw new Error('each manifest entry needs a string `source` and `as`');
    }
    s.lane = captureLane(process.cwd(), s, invocation);
  }
  const result = await addRefsBatch(process.cwd(), specs, { rulesRoot: join(ROOT, 'core', 'rules', 'builtin'), invocation }, projectWriterFromActivation(opts, 'omd ref add-batch'));
  if (opts.json) process.stdout.write(JSON.stringify(result));
  else {
    const ok = result.outcomes.filter((o) => o.ok).length;
    console.log(`ref add-batch: ${ok}/${result.outcomes.length} captured (concurrency ${result.concurrency})`);
    for (const o of result.outcomes) {
      if (o.ok) console.log(`  ok   ${o.as}  <- ${o.source}${o.slopCount ? `  (${o.slopCount} slop)` : ''}`);
      else console.error(`  FAIL ${o.as}  <- ${o.source}: ${o.error}`);
    }
  }
  process.exit(result.outcomes.some((o) => !o.ok) ? 1 : 0);
}

export async function cmdRefAdd(opts: Opts): Promise<never> {
  const target = opts._[0];
  if (!target || !opts.as) {
    console.error('usage: omd ref add <url|file> --as <component> --lane domain|design [--slot <surface>] [--selector "css"] [--image] [--from-user]; selected discovery requires an explicit lane and free-gallery/original-link provenance for design');
    console.error('ref add records a reference you already chose, for example: omd ref add https://example.com --as "hero" --lane domain. To look around a site first, use omd ref browse goto <url> --reason "why".');
    process.exit(1);
  }
  const component = opts.as;
  if (opts.image && opts.selector) {
    console.error('--image and --selector cannot be used together: an image has no subtree to scope.');
    process.exit(1);
  }
  if (opts.blueprint && !opts.selector) {
    console.error('--blueprint requires --selector: a blueprint measures one component, not a whole page.');
    process.exit(1);
  }
  // Every reference keeps its image by default; --shot without --selector simply asks for the whole page's.
  if (opts.noShot && opts.noShotReason === undefined) {
    console.error('--no-shot requires --no-shot-reason: a reference without its image cannot be re-examined later, so the omission is recorded rather than silent.');
    process.exit(1);
  }
  if (opts.preparation && (opts.image || !opts.noEnergy)) throw new Error('--preparation requires a rendered reference and --no-energy');
  const { saveRef } = await import('../../core/ref/store.ts');
  const { captureLane, captureFinalUrlGuard } = await import('../../core/ref/capture-intake.ts');
  const { isKoreanLanguageServiceText } = await import('../../core/ref/market-reference.ts');
  const invocation = invocationFromActivation(opts, 'omd ref add');
  const intent = { source: target, ...(opts.lane ? { lane: opts.lane } : {}), ...(opts.fromUser ? { fromUser: true } : {}),
    ...(opts.selector ? { selector: opts.selector } : {}), shot: !opts.noShot && !opts.image, image: !!opts.image };
  const lane = captureLane(process.cwd(), intent, invocation);
  const validateFinalUrl = captureFinalUrlGuard(process.cwd(), [{ ...intent, lane }], invocation);
  const adapter = projectWriterFromActivation(opts, 'omd ref add');
  const { requiresDesignReferenceAdmission } = await import('../../core/ref/design-admission.ts');
  const stageDesign = lane === 'design' && requiresDesignReferenceAdmission(process.cwd());

  if (opts.image) {
    if (stageDesign) throw new Error('REFERENCE_CANDIDATE_IMAGE_REQUIRED: inspect and capture the complete original image before independent visual review');
    const path = saveRef(process.cwd(), {
      researchLane: lane,
      source: target,
      component,
      kind: 'image',
      capturedAt: new Date().toISOString(),
      ...(opts.slot ? { slot: opts.slot } : {}),
      invariants: null,
      principles: [],
      ...(opts.fromUser ? { origin: 'user' as const } : {}),
    }, adapter);
    console.log(path);
    process.exit(0);
  }

  const { normalize } = await import('../../core/ir/normalize.ts');
  const { extractInvariants } = await import('../../core/ref/invariants.ts');
  const { designSignal, LOW_SIGNAL } = await import('../../core/ref/signal.ts');

  const { loadRules, check } = await import('../../core/rules/engine.ts');

  const { capturePageForRef, captureUserBrowserPageForRef, withBrowser, captureEnergy, parseViewport, REFERENCE_VIEWPORT } = await import('../../core/render/index.ts');
  const { designDiscoveryProvider } = await import('../../core/ref/design-discovery-sources.ts');
  const galleryImage = lane === 'design' && target.startsWith('https://') && designDiscoveryProvider(target) !== null;
  if (galleryImage && opts.blueprint) throw new Error('DESIGN_GALLERY_IMAGE_ONLY: a gallery image has pixels, not measurable app DOM anatomy');
  const { parseCapturePreparation } = await import('../../core/ref/capture-preparation.ts');
  const preparation = opts.preparation ? parseCapturePreparation(JSON.parse(readFileSync(resolve(opts.preparation), 'utf8'))) : undefined;
  const captureViewport = parseViewport(opts.viewport ?? REFERENCE_VIEWPORT);
  const { refImagePath } = await import('../../core/ref/store.ts');
  // A reference always keeps its image. `--shot` used to be the only way to get one, so a reference
  // gathered without it could never be re-examined: the measured ladders survive, the screen that
  // produced them does not. A selector measures one component, but the retained pixels are always
  // the whole 2x screen or the selected image's complete native-resolution original.
  const absShot = opts.noShot
    ? undefined
    : refImagePath(adapter.projectRoot, { source: target, component: opts.as, researchLane: lane });
  const { withAcquisitionDeadline, REF_ADD_BUDGET_MS } = await import('../../core/ref/acquisition-deadline.ts');
  const { readReferenceBrowserConfig, selectReferenceAcquisitionEngine } = await import('../../core/ref/browser-config.ts');
  const engine = await selectReferenceAcquisitionEngine(readReferenceBrowserConfig());
  const { raw, shotBytes, shotError, capturePreparation, acquisition, visibleText, energyCurve } = await withAcquisitionDeadline(
    { budgetMs: engine === 'user-browser' ? 180_000 : REF_ADD_BUDGET_MS, phase: 'ref add' }, async scope => {
      if (engine === 'user-browser') {
        const captured = await captureUserBrowserPageForRef(target, captureViewport, {
          deadline: scope, selector: opts.selector ?? null, shot: Boolean(absShot), requireImageElement: galleryImage,
          viewportShot: lane === 'design',
          ...(preparation ? { preparation } : {}),
          validateFinalUrl: (url, visibleText) => validateFinalUrl(0, url, visibleText),
        });
        return { ...captured, shotError: undefined, energyCurve: null };
      }
      return withBrowser(async browser => {
        scope.assertLive();
        const captured = await capturePageForRef(browser, target, captureViewport, {
          deadline: scope,
          selector: opts.selector ?? null,
          requireImageElement: galleryImage,
          viewportShot: lane === 'design',
          validateFinalUrl: (url, visibleText) => validateFinalUrl(0, url, visibleText),
          ...(absShot ? { shotOut: absShot, adapter, deferShotWrite: true } : {}),
          ...(preparation ? { preparation } : {}),
          bestEffortShot: preparation === undefined && !galleryImage,
        });
        const energyCurve = opts.noEnergy || galleryImage || captured.acquisition.sourceImage || captured.acquisition.noticeDismissals?.length
          ? null : await captureEnergy(target, { viewport: captureViewport, browser });
        scope.assertLive();
        return { ...captured, energyCurve };
      }, scope, lane === 'design' ? { reference: true } : undefined);
    });
  const ir = normalize(raw);
  const invariants = extractInvariants(ir);
  const imageReference = galleryImage || acquisition.sourceImage !== undefined;
  if (imageReference && opts.blueprint) throw new Error('DESIGN_IMAGE_ONLY: original image pixels cannot supply an inner-UI DOM blueprint');

  const slopViolations = imageReference ? [] : check(ir, loadRules(join(ROOT, 'core', 'rules', 'builtin')), { categories: ['slop'] });
  const slopCount = slopViolations.length;
  const slopIds = [...new Set(slopViolations.map((v) => v.id))];

  // Blueprint: full-resolution structural snapshot with skin abstracted to color roles.
  // Only captured when --blueprint is passed together with --selector.
  let blueprint: import('../../core/types.ts').Blueprint | undefined;
  if (opts.blueprint && opts.selector) {
    const { captureBlueprint } = await import('../../core/ref/blueprint.ts');
    blueprint = captureBlueprint(raw.nodes, opts.selector);
    console.error(`blueprint: ${blueprint.nodes.length} nodes captured`);
  }

  const reference = (imagePath?: string): import('../../core/types.ts').Reference => {
    const imageOmittedReason = imagePath !== undefined
      ? undefined
      : opts.noShotReason ?? (shotError === undefined ? 'the capture produced no image' : `capture failed: ${shotError}`);
    return {
      researchLane: lane,
      acquisition,
      ...(isKoreanLanguageServiceText(visibleText) ? { visibleKoreanText: true as const } : {}),
      source: target,
      component,
      kind: imageReference ? 'image' : opts.selector ? 'component' : 'page',
      capturedAt: new Date().toISOString(),
      ...(opts.selector ? { selector: opts.selector } : {}),
      ...(opts.slot ? { slot: opts.slot } : {}),
      invariants: imageReference ? null : invariants,
      principles: [],
      slopCount,
      ...(opts.fromUser ? { origin: 'user' as const } : {}),
      ...(imageOmittedReason === undefined ? {} : { imageOmittedReason }),
      ...(energyCurve !== null ? { energyCurve } : {}),
      ...(blueprint !== undefined ? { blueprint } : {}),
      ...(imagePath !== undefined ? { imagePath } : {}),
      viewport: captureViewport,
      ...(capturePreparation ? { capturePreparation } : {}),
    };
  };
  const { commitCapturedReference } = await import('../../core/ref/capture-commit.ts');
  const { stageDesignCandidate } = await import('../../core/ref/reference-candidate.ts');
  const committed = stageDesign
    ? (() => {
      if (!absShot || !shotBytes) throw new Error('REFERENCE_CANDIDATE_IMAGE_REQUIRED');
      const candidate = stageDesignCandidate(process.cwd(), reference(relative(adapter.projectRoot, absShot)), shotBytes, adapter);
      return { value: candidate.path, imagePath: candidate.imagePath };
    })()
    : commitCapturedReference(adapter, absShot, shotBytes, imagePath =>
      saveRef(process.cwd(), reference(imagePath), adapter));
  const path = committed.value;
  if (committed.imagePath) console.error(`shot: ${committed.imagePath}`);
  if (lane === 'design' && acquisition.imageDimensions
    && Math.max(acquisition.imageDimensions.width, acquisition.imageDimensions.height) < 1200)
    console.error(`warning: ${stageDesign ? 'candidate' : 'retained'} original is ${acquisition.imageDimensions.width}x${acquisition.imageDimensions.height}; prefer another full-resolution original (long side >=1200px), never crop or enlarge the thumbnail`);
  if (shotError) console.error(`shot skipped: ${shotError}`);
  console.log(path);
  console.log(JSON.stringify(invariants, null, 2));
  console.error(`slop findings: ${slopCount}${slopCount > 0 ? `  [${slopIds.join(', ')}]` : ''}`);
  // Each capture takes minutes; several sites go faster together.
  console.error('next: capture further sites together with omd ref add-batch <manifest.json> (four at a time)');

  const signal = designSignal(invariants, blueprint);
  if (!imageReference && signal.score < LOW_SIGNAL) {
    console.error(
      `warning: low design signal (${signal.score} — missing: ${signal.missing.join(', ')}).\n`
      + 'Measured DOM evidence is insufficient; this is not a visual-quality judgment.\n'
      + 'If the design is inside an image, inspect the saved PNG and use ref import-image for visual-only evidence. Do not measure gallery chrome as the pictured app or replace image references with domain documentation.',
    );
  }
  if (slopCount >= 2) {
    if (opts.fromUser) {
      console.error(
        `note: the reference you provided shows ${slopCount} slop signals (${slopIds.join(', ')}).\n`
        + 'It is saved. Inspect the actual image and record what to transfer or avoid; warnings do not overrule the user target.',
      );
    } else {
      console.error(
        `warning: ${slopCount} slop findings (${slopIds.join(', ')}).\n`
        + 'Review the visible context before retaining or excluding this source; the warning count is not an aesthetic verdict.',
      );
    }
  }
  process.exit(0);
}

export async function cmdRefPrinciples(opts: Opts): Promise<never> {
  const source = opts._[0];
  if (!source || !opts.as || !opts.add) {
    console.error('usage: omd ref principles <source> --as <component> --add "why it is built that way"');
    process.exit(1);
  }
  const { addPrinciples } = await import('../../core/ref/store.ts');
  addPrinciples(process.cwd(), source, opts.as, [opts.add], projectWriterFromActivation(opts, 'omd ref principles'));
  console.log(`${source} (${opts.as}): principle recorded`);
  process.exit(0);
}

export async function cmdRefShow(opts: Opts): Promise<never> {
  const source = opts._[0];
  if (!source || !opts.as) {
    console.error('usage: omd ref show <source> --as <component>');
    process.exit(1);
  }
  const { loadRefs } = await import('../../core/ref/store.ts');
  const ref = loadRefs(process.cwd(), { includeDomain: true }).find((r) => r.source === source && r.component === opts.as);
  if (!ref) {
    console.error(`no reference for ${source} (${opts.as})`);
    process.exit(1);
  }

  console.log(`${ref.source}  ${ref.component}  captured ${ref.capturedAt}`);
  console.log(JSON.stringify(ref.invariants, null, 2));
  if (ref.principles.length === 0) {
    console.log('\nNo principles yet — nothing has looked at it.');
  } else {
    console.log('\nPrinciples:');
    for (const p of ref.principles) console.log(`  - ${p}`);
  }
  if (ref.blueprint) {
    printBlueprint(ref.blueprint);
  }
  process.exit(0);
}

export function printBlueprint(bp: import('../../core/types.ts').Blueprint): void {
  const childIds = new Set(bp.nodes.flatMap((n) => n.children));
  const roots = bp.nodes.filter((n) => !childIds.has(n.id));
  const byId = new Map(bp.nodes.map((n) => [n.id, n]));

  const printNode = (id: string, depth: number): void => {
    const node = byId.get(id);
    if (!node) return;
    const indent = '  '.repeat(depth);
    const parts: string[] = [node.role, `${node.box.w}×${node.box.h}`];
    if (node.fontSize != null) parts.push(`${node.fontSize}px`);
    if (node.fontWeight != null) parts.push(`fw:${node.fontWeight}`);
    if (node.lineHeight != null) parts.push(`lh:${node.lineHeight}`);
    if (node.radius != null) parts.push(`r=${node.radius}`);
    if (node.hasShadow) parts.push('shadow');
    if (node.fillRole) parts.push(`fill:${node.fillRole}`);
    if (node.textRole) parts.push(`text:${node.textRole}`);
    if (node.textLength) parts.push(`[${node.textLength}]`);
    if (node.motionDurations?.length) parts.push(`motion:${node.motionDurations.join(',')}ms`);
    if (node.direction) parts.push(node.direction === 'VERTICAL' ? 'col' : 'row');
    if (node.gap != null) parts.push(`gap:${node.gap}`);
    if (node.padding) {
      const [t, r, b, l] = node.padding;
      if ((t ?? 0) + (r ?? 0) + (b ?? 0) + (l ?? 0) > 0) parts.push(`p:${t}/${r}/${b}/${l}`);
    }
    console.log(`${indent}${parts.join('  ')}`);
    for (const childId of node.children) printNode(childId, depth + 1);
  };

  console.log(`\nBlueprint  selector: ${bp.selector}  (${bp.nodes.length} nodes)`);
  for (const root of roots) printNode(root.id, 0);
}

export async function cmdRefList(opts: Opts): Promise<never> {
  const { loadRefs, researchLane } = await import('../../core/ref/store.ts');
  const { inspectDesignReferenceAdmission } = await import('../../core/ref/design-admission.ts');
  const { designSignal, LOW_SIGNAL } = await import('../../core/ref/signal.ts');
  const { topKinshipPairs } = await import('../../core/ref/distance.ts');
  const lane = opts.lane === undefined ? undefined : researchLane(opts.lane);
  const references = loadRefs(process.cwd(), { includeDomain: true });
  const refs = references.filter(ref => lane === undefined || (ref.researchLane ?? 'design') === lane).map(ref => ({
    ...ref, admission: ref.researchLane === 'domain' ? null : inspectDesignReferenceAdmission(process.cwd(), ref, { references }),
    discoveryAdmission: ref.researchLane === 'domain' ? null
      : inspectDesignReferenceAdmission(process.cwd(), ref, { references, purpose: 'discovery' }),
  }));
  if (opts.json) { process.stdout.write(JSON.stringify(refs)); process.exit(0); }
  if (refs.length === 0) {
    console.log('No references yet.');
    process.exit(0);
  }
  for (const ref of refs) {
    const granularity = ref.selector ? `[${ref.kind} ${ref.selector}]` : `[${ref.kind}]`;
    const admissionNote = ref.admission && !ref.admission.eligible
      ? ref.discoveryAdmission?.eligible ? `  [provenance-only: ${ref.admission.code}]`
        : `  [ineligible: ${ref.admission.code}; inspect ref tidy --json]`
      : '';
    const userNote = `  [${ref.researchLane ?? 'legacy-design'}]${ref.origin === 'user' ? '  [user]' : ''}${admissionNote}`;
    if (ref.kind === 'image' || ref.invariants === null) {
      console.log(`${ref.source}  ${ref.component}  ${granularity}${userNote}`);
      continue;
    }
    const inv = ref.invariants;
    const signal = designSignal(inv, ref.blueprint);
    const lowSignalNote = signal.score < LOW_SIGNAL ? `  [low-signal ${signal.score}]` : '';
    const slopNote = (ref.slopCount ?? 0) >= 2 ? `  [slop:${ref.slopCount}]` : '';
    console.log(
      `${ref.source}  ${ref.component}  ${granularity}  radius=[${inv.radiusLadder.join(',')}] `
      + `spacing=[${inv.spacingLadder.join(',')}] elevation=${inv.elevationLevels}${lowSignalNote}${slopNote}${userNote}`,
    );
  }

  const pairs = topKinshipPairs(refs.filter(ref => ref.researchLane !== 'domain'));
  if (pairs.length > 0) {
    console.log('');
    for (const p of pairs) {
      console.log(`kinship: ${p.a}  ${p.b}  ${p.similarity.toFixed(2)}`);
    }
    console.error(
      'warning: kinship cluster — references scoring ≥0.85 against each other carry the same average.\n'
      + 'A cluster is a contamination signal; drop the duplicates or mark the weaker capture as an anti-reference.',
    );
  }

  process.exit(0);
}

export async function cmdRefImportImage(opts: Opts): Promise<never> {
  if (opts.out !== undefined) throw new Error('omd ref import-image does not accept --out');
  const input = opts._[0]; if (input === undefined || opts._[1] !== undefined) throw new Error('usage: omd ref import-image <input.json> [--json]');
  const { persistImageFragment } = await import('../../core/ref/image-fragment.ts');
  const record = persistImageFragment(process.cwd(), JSON.parse(readFileSync(resolve(input), 'utf8')), invocationFromActivation(opts, 'omd ref import-image'));
  if (opts.json) process.stdout.write(`${JSON.stringify(record)}\n`); else console.log(record.id);
  process.exit(0);
}

export async function cmdRefAudit(opts: Opts): Promise<never> {
  const { auditCaptureParallelism } = await import('../../core/ref/capture-audit.ts');
  const a = auditCaptureParallelism(process.cwd());
  if (opts.json) process.stdout.write(`${JSON.stringify(a)}\n`);
  else console.log(`capture audit: ${a.ok ? 'OK' : 'SEQUENTIAL'} (${a.refs} refs) — ${a.reason}`);
  process.exit(a.ok ? 0 : 1);
}
