import { randomUUID } from 'node:crypto';
import { relative } from 'node:path';
import { capturePageForRef, captureEnergy, withBrowser, parseViewport, REFERENCE_VIEWPORT } from '../render/index.ts';
import { normalize } from '../ir/normalize.ts';
import { extractInvariants } from './invariants.ts';
import { captureBlueprint } from './blueprint.ts';
import { saveRef, refImagePath, researchLane } from './store.ts';
import { loadRules, check } from '../rules/engine.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { captureFinalUrlGuard, validateCaptureBatch } from './capture-intake.ts';
import { parseCapturePreparation, type CapturePreparation } from './capture-preparation.ts';
import { commitCapturedReference } from './capture-commit.ts';
import { designDiscoveryProvider } from './design-discovery-sources.ts';
import { isKoreanLanguageServiceText } from './market-reference.ts';

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
  opts: { rulesRoot: string; concurrency?: number; invocation?: ProjectRunInvocation },
  adapter: ProjectWriteAdapter,
): Promise<BatchResult> {
  validateCaptureBatch(cwd, specs, opts.invocation);
  const validateFinalUrl = captureFinalUrlGuard(cwd, specs, opts.invocation);
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const rules = loadRules(opts.rulesRoot);
  const outcomes: BatchOutcome[] = new Array<BatchOutcome>(specs.length);
  const captureBatchId = `batch-${randomUUID()}`;

  await withBrowser(async (browser) => {
    let next = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
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
          const { raw, shotBytes, capturePreparation, acquisition, visibleText } = await capturePageForRef(browser, spec.source, viewport, {
            selector: spec.selector ?? null,
            requireImageElement: galleryImage,
            validateFinalUrl: (url, visibleText) => validateFinalUrl(i, url, visibleText),
            ...(preparation ? { preparation } : {}),
            ...(shotOut ? { shotOut, adapter, deferShotWrite: true } : {}),
          });
          // Motion is evidence, not decoration: a board captured without it cannot answer what a
          // reference does on scroll, and every craft query in the brief goes unanswered while the
          // record still looks complete. One extra pass per capture, skipped only on request.
          const energyCurve = spec.energy === false || galleryImage || acquisition.noticeDismissals?.length ? null : await captureEnergy(spec.source, { viewport, browser });
          const ir = normalize(raw);
          const invariants = extractInvariants(ir);
          const slopCount = check(ir, rules, { categories: ['slop'] }).length;
          const blueprint = !galleryImage && spec.blueprint && spec.selector ? captureBlueprint(raw.nodes, spec.selector) : undefined;
          commitCapturedReference(adapter, shotOut, shotBytes, imagePath => saveRef(cwd, {
            ...(lane ? { researchLane: lane } : {}),
            acquisition,
            ...(isKoreanLanguageServiceText(visibleText) ? { visibleKoreanText: true as const } : {}),
            source: spec.source,
            component: spec.as,
            kind: galleryImage ? 'image' : spec.selector ? 'component' : 'page',
            capturedAt: new Date().toISOString(),
            captureBatchId,
            ...(spec.selector ? { selector: spec.selector } : {}),
            ...(spec.slot ? { slot: spec.slot } : {}),
            invariants: galleryImage ? null : invariants,
            principles: [],
            slopCount,
            ...(spec.fromUser ? { origin: 'user' as const } : {}),
            ...(blueprint !== undefined ? { blueprint } : {}),
            ...(imagePath ? { imagePath } : {}),
            ...(energyCurve !== null ? { energyCurve } : {}),
            viewport,
            ...(capturePreparation ? { capturePreparation } : {}),
          }, adapter));
          outcomes[i] = { source: spec.source, as: spec.as, ok: true, slopCount };
        } catch (err) {
          outcomes[i] = { source: spec.source, as: spec.as, ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, specs.length) }, () => worker()));
  });

  return { concurrency, outcomes };
}
