import { dirname, relative } from 'node:path';
import { capturePageForRef, withBrowser, parseViewport } from '../render/index.ts';
import { normalize } from '../ir/normalize.ts';
import { extractInvariants } from './invariants.ts';
import { captureBlueprint } from './blueprint.ts';
import { saveRef, refImagePath } from './store.ts';
import { loadRules, check } from '../rules/engine.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';

/**
 * One reference to capture in a batch. Same shape as an `omd ref add --selector … --blueprint --shot`
 * call, minus the energy (motion) pass: batch capture is optimised for the common non-motion board,
 * so a motion reference that needs an energy study goes through the single-ref `omd ref add` path.
 */
export interface RefSpec {
  source: string;
  as: string;
  selector?: string;
  blueprint?: boolean;
  shot?: boolean;
  fromUser?: boolean;
  viewport?: string;
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
 * Capture many references concurrently over ONE shared browser. Each reference is one page and one
 * navigation (IR plus an optional scoped screenshot), so the board is built in a fraction of the
 * wall time of one-browser-launch-per-reference — and with byte-identical per-reference results,
 * so the output the board feeds is unchanged. A single reference failing never fails the batch.
 */
export async function addRefsBatch(
  cwd: string,
  specs: RefSpec[],
  opts: { rulesRoot: string; concurrency?: number },
  adapter: ProjectWriteAdapter,
): Promise<BatchResult> {
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const rules = loadRules(opts.rulesRoot);
  const outcomes: BatchOutcome[] = new Array<BatchOutcome>(specs.length);

  await withBrowser(async (browser) => {
    let next = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const i = next++;
        if (i >= specs.length) return;
        const spec = specs[i]!;
        try {
          const shotOut = spec.shot && spec.selector
            ? refImagePath(adapter.projectRoot, { source: spec.source, component: spec.as })
            : undefined;
          if (shotOut) adapter.mkdir(relative(adapter.projectRoot, dirname(shotOut)));
          const { raw, shotSaved } = await capturePageForRef(browser, spec.source, parseViewport(spec.viewport), {
            selector: spec.selector ?? null,
            ...(shotOut ? { shotOut, adapter } : {}),
          });
          const ir = normalize(raw);
          const invariants = extractInvariants(ir);
          const slopCount = check(ir, rules, { categories: ['slop'] }).length;
          const blueprint = spec.blueprint && spec.selector ? captureBlueprint(raw.nodes, spec.selector) : undefined;
          saveRef(cwd, {
            source: spec.source,
            component: spec.as,
            kind: spec.selector ? 'component' : 'page',
            capturedAt: new Date().toISOString(),
            ...(spec.selector ? { selector: spec.selector } : {}),
            invariants,
            principles: [],
            slopCount,
            ...(spec.fromUser ? { origin: 'user' as const } : {}),
            ...(blueprint !== undefined ? { blueprint } : {}),
            ...(shotSaved && shotOut ? { imagePath: relative(adapter.projectRoot, shotOut) } : {}),
          }, adapter);
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
