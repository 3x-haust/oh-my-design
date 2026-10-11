import { randomUUID } from 'node:crypto';
import { relative } from 'node:path';
import { capturePageForRef, captureUserBrowserPageForRef, captureEnergy, withBrowser, parseViewport, REFERENCE_VIEWPORT } from '../render/index.ts';
import type { Browser } from 'playwright';
import { normalize } from '../ir/normalize.ts';
import { extractInvariants } from './invariants.ts';
import { captureBlueprint } from './blueprint.ts';
import { saveRef, refImagePath, researchLane } from './store.ts';
import { requiresDesignReferenceAdmission } from './design-admission.ts';
import { stageDesignCandidate } from './reference-candidate.ts';
import { loadRules, check } from '../rules/engine.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { captureFinalUrlGuard, validateCaptureBatch } from './capture-intake.ts';
import { parseCapturePreparation, type CapturePreparation } from './capture-preparation.ts';
import { commitCapturedReference } from './capture-commit.ts';
import { designDiscoveryProvider } from './design-discovery-sources.ts';
import { readReferenceBrowserConfig, selectReferenceAcquisitionEngine, type BrowserConnector, type ReferenceBrowserConfig } from './browser-config.ts';
import type { UserBrowserDriver } from '../browser/contracts.ts';
import type { PublicHostLookup } from './public-network.ts';
import { isKoreanLanguageServiceText } from './market-reference.ts';
import { withAcquisitionDeadline, BATCH_BUDGET_MS, REF_ADD_BUDGET_MS, AcquisitionTimeoutError } from './acquisition-deadline.ts';
import type { Reference } from '../types.ts';

export interface RefSpec {
  lane?: 'domain' | 'design';
  source: string;
  as: string;
  selector?: string;
  slot?: string;
  blueprint?: boolean;
  shot?: boolean;
  fromUser?: boolean;
  viewport?: string;
  /** Motion capture is on by default; pass false only when the source cannot be animated. */
  energy?: boolean;
  /** Caller-authored disclosure preparation; requires energy:false. */
  preparation?: CapturePreparation;
}

export interface BatchOutcome {
  source: string;
  as: string;
  ok: boolean;
  error?: string;
  slopCount?: number;
  candidatePath?: string;
  candidateImagePath?: string;
}

export interface BatchResult {
  concurrency: number;
  outcomes: BatchOutcome[];
}

/**
 * Capture many references concurrently over ONE shared browser. A single reference failing never fails the batch.
 */
export async function addRefsBatch(
  cwd: string,
  specs: RefSpec[],
  opts: { rulesRoot: string; concurrency?: number; invocation?: ProjectRunInvocation;
    browserConnector?: BrowserConnector; browserConfig?: ReferenceBrowserConfig;
    userBrowserDriver?: UserBrowserDriver; userBrowserLookup?: PublicHostLookup; consentHome?: string;
    explicitUserBrowser?: boolean },
  adapter: ProjectWriteAdapter,
): Promise<BatchResult> {
  validateCaptureBatch(cwd, specs, opts.invocation);
  const validateFinalUrl = captureFinalUrlGuard(cwd, specs, opts.invocation);
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const rules = loadRules(opts.rulesRoot);
  const outcomes: BatchOutcome[] = new Array<BatchOutcome>(specs.length);
  const captureBatchId = `batch-${randomUUID()}`;

  try { await withAcquisitionDeadline({ budgetMs: BATCH_BUDGET_MS, phase: 'ref add-batch' }, async batchScope => {
    const engine = specs.some(spec => spec.lane === 'design')
      ? await selectReferenceAcquisitionEngine(opts.browserConfig ?? readReferenceBrowserConfig(),
        { ...(opts.consentHome ? { home: opts.consentHome } : {}), ...(opts.userBrowserDriver ? { driver: opts.userBrowserDriver } : {}),
          ...(opts.explicitUserBrowser === undefined ? {} : { explicitUserBrowser: opts.explicitUserBrowser }) })
      : 'headless';
    const userBrowser = engine === 'user-browser';
    const run = async (browser: Browser | null) => {
    let next = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        if (batchScope.signal.aborted) return;
        const i = next++;
        if (i >= specs.length) return;
        const spec = specs[i]!;
        try {
          const lane = spec.lane === undefined ? undefined : researchLane(spec.lane);
          const galleryImage = lane === 'design' && spec.source.startsWith('https://') && designDiscoveryProvider(spec.source) !== null;
          if (galleryImage && spec.blueprint) throw new Error('DESIGN_GALLERY_IMAGE_ONLY: a gallery image has pixels, not measurable app DOM anatomy');
          if (spec.preparation !== undefined && spec.energy !== false) throw new Error('reference capture preparation requires energy:false');
          const preparation = spec.preparation === undefined ? undefined : parseCapturePreparation(spec.preparation);
          const shotOut = spec.shot
            ? refImagePath(adapter.projectRoot, { source: spec.source, component: spec.as, ...(lane ? { researchLane: lane } : {}) })
            : undefined;
          const viewport = parseViewport(spec.viewport ?? REFERENCE_VIEWPORT);
          const { raw, shotBytes, capturePreparation, acquisition, visibleText, energyCurve } = await withAcquisitionDeadline(
            { budgetMs: userBrowser ? 180_000 : REF_ADD_BUDGET_MS, phase: 'ref add-batch item' }, async itemScope => {
              const captured = userBrowser
                ? await captureUserBrowserPageForRef(spec.source, viewport, {
                  selector: spec.selector ?? null, shot: Boolean(shotOut), deadline: itemScope,
                  requireImageElement: galleryImage,
                  viewportShot: lane === 'design',
                  ...(preparation ? { preparation } : {}),
                  validateFinalUrl: (url, visibleText) => validateFinalUrl(i, url, visibleText),
                  ...(opts.userBrowserDriver ? { driver: opts.userBrowserDriver } : {}),
                  ...(opts.userBrowserLookup ? { lookup: opts.userBrowserLookup } : {}),
                })
                : await capturePageForRef(browser!, spec.source, viewport, {
                  selector: spec.selector ?? null, deadline: itemScope,
                  viewportShot: lane === 'design',
                  requireImageElement: galleryImage,
                  validateFinalUrl: (url, visibleText) => validateFinalUrl(i, url, visibleText),
                  ...(preparation ? { preparation } : {}),
                  ...(shotOut ? { shotOut, adapter, deferShotWrite: true } : {}),
                });
              const energyCurve = userBrowser || spec.energy === false || galleryImage || captured.acquisition.sourceImage
                || ('noticeDismissals' in captured.acquisition && captured.acquisition.noticeDismissals?.length)
                ? null : await captureEnergy(spec.source, { viewport, browser: browser! });
              itemScope.assertLive(); batchScope.assertLive();
              return { ...captured, capturePreparation: 'capturePreparation' in captured ? captured.capturePreparation : undefined, energyCurve };
            });
          // Motion is evidence, not decoration: a board captured without it cannot answer what a
          // reference does on scroll, and every craft query in the brief goes unanswered while the
          // record still looks complete. One extra pass per capture, skipped only on request.
          const ir = normalize(raw);
          const invariants = extractInvariants(ir);
          const imageReference = galleryImage || acquisition.sourceImage !== undefined;
          if (imageReference && spec.blueprint) throw new Error('DESIGN_IMAGE_ONLY: original image pixels cannot supply an inner-UI DOM blueprint');
          const slopCount = imageReference ? 0 : check(ir, rules, { categories: ['slop'] }).length;
          const blueprint = !imageReference && spec.blueprint && spec.selector ? captureBlueprint(raw.nodes, spec.selector) : undefined;
          batchScope.assertLive();
          const reference = (imagePath?: string): Reference => ({
            ...(lane ? { researchLane: lane } : {}),
            acquisition,
            ...(isKoreanLanguageServiceText(visibleText) ? { visibleKoreanText: true as const } : {}),
            source: spec.source,
            component: spec.as,
            kind: imageReference ? 'image' : spec.selector ? 'component' : 'page',
            capturedAt: new Date().toISOString(),
            captureBatchId,
            ...(spec.selector ? { selector: spec.selector } : {}),
            ...(spec.slot ? { slot: spec.slot } : {}),
            invariants: imageReference ? null : invariants,
            principles: [],
            slopCount,
            ...(spec.fromUser ? { origin: 'user' as const } : {}),
            ...(blueprint !== undefined ? { blueprint } : {}),
            ...(imagePath ? { imagePath } : {}),
            ...(energyCurve !== null ? { energyCurve } : {}),
            viewport,
            ...(capturePreparation ? { capturePreparation } : {}),
          });
          if (lane === 'design' && requiresDesignReferenceAdmission(cwd)) {
            if (!shotOut || !shotBytes) throw new Error('REFERENCE_CANDIDATE_IMAGE_REQUIRED');
            const candidate = stageDesignCandidate(cwd, reference(relative(adapter.projectRoot, shotOut)), shotBytes, adapter);
            outcomes[i] = { source: spec.source, as: spec.as, ok: true, slopCount,
              candidatePath: candidate.path, candidateImagePath: candidate.imagePath };
          } else {
            commitCapturedReference(adapter, shotOut, shotBytes, imagePath => saveRef(cwd, reference(imagePath), adapter));
            outcomes[i] = { source: spec.source, as: spec.as, ok: true, slopCount };
          }
        } catch (err) {
          outcomes[i] = { source: spec.source, as: spec.as, ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, specs.length) }, () => worker()));
    };
    if (userBrowser) await run(null);
    else await withBrowser(browser => run(browser), batchScope, specs.some(spec => spec.lane === 'design') ? { reference: true,
      ...(opts.browserConfig ? { config: opts.browserConfig } : {}),
      ...(opts.browserConnector ? { connector: opts.browserConnector } : {}),
    } : undefined);
  }); } catch (error) { if (!(error instanceof AcquisitionTimeoutError)) throw error; }
  for (let index = 0; index < specs.length; index++) {
    outcomes[index] ??= { source: specs[index]!.source, as: specs[index]!.as, ok: false,
      error: 'REFERENCE_ACQUISITION_TIMEOUT: batch item was not started or completed before the aggregate deadline' };
  }
  return { concurrency, outcomes };
}
