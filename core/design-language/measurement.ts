import { withBrowser } from '../render/index.ts';
import { browserCallback } from '../ref/browser-evaluation.ts';
import { withLocalView, type ViewState } from '../render/stateful.ts';
import { servedProjectTreeSha256 } from '../render/serve.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { inspectRenderedRefinementEvidence } from '../runtime/rendered-refinement.ts';
import type { Target } from './index.ts';
import type { Measurement } from './check.ts';

/** Native local observation; caller cannot supply a baseline number or substitute a remote page. */
export async function measureTargets(root: string, page: string, translationSha256: string, targets: readonly Target[], invocation?: ProjectRunInvocation, state?: ViewState): Promise<Measurement> {
  if (!targets.length || targets.some(t => t.route !== targets[0]!.route || t.state !== targets[0]!.state || t.viewport !== targets[0]!.viewport)
    || (state === undefined ? targets[0]!.state !== 'initial' || targets[0]!.route !== '/' : targets[0]!.state !== state.name || targets[0]!.route !== state.route)) throw new Error('FEEDBACK_MEASUREMENT_REQUIRED: scoped state/route must be natively reachable');
  const viewport = targets[0]!.viewport;
  const buildSha256 = servedProjectTreeSha256(root, page);
  const captured = await withBrowser(browser => withLocalView(browser, root, { page, viewport: viewport === 'desktop' ? { width: 1280, height: 900 } : { width: 390, height: 844 }, ...(state === undefined ? {} : { state }) }, async view => {
    const values = await Promise.all(targets.map(async t => {
      const result = await view.evaluate(browserCallback(({ selector, metric }: { selector: string; metric: Target['metric'] }) => {
        const nodes = document.querySelectorAll(selector);
        if (nodes.length !== 1) return null;
        const node = nodes[0]!;
        const style = getComputedStyle(node);
        const px = (v: string) => Number.parseFloat(v);
        if (metric === 'group-gap') return px(style.gap);
        if (metric === 'container-padding') return px(style.paddingTop);
        if (metric === 'corner-radius') return px(style.borderTopLeftRadius);
        if (metric === 'motion-duration') return Number.parseFloat(style.transitionDuration) * (style.transitionDuration.includes('ms') ? 1 : 1000);
        if (metric === 'body-line-height') return px(style.lineHeight) / px(style.fontSize);
        if (metric === 'heading-body-ratio') { const heading = node.querySelector('h1,h2,h3'); const body = node.querySelector('p'); return heading && body ? px(getComputedStyle(heading).fontSize) / px(getComputedStyle(body).fontSize) : null; }
        if (metric === 'weight-difference') { const heading = node.querySelector('h1,h2,h3'); const body = node.querySelector('p'); return heading && body ? px(getComputedStyle(heading).fontWeight) - px(getComputedStyle(body).fontWeight) : null; }
        return null;
      }), { selector: t.selector, metric: t.metric });
      return { targetId: t.id, value: result ?? Number.NaN, present: result !== null && Number.isFinite(result) };
    }));
    const floors = await view.evaluate(browserCallback((selectors: string[]) => {
      const nodes = selectors.map(selector => document.querySelectorAll(selector));
      const visible = nodes.every(matches => matches.length === 1 && (() => {
        const element = matches[0]!;
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
      })());
      return { task: visible, accessibility: visible && nodes.every(matches => !matches[0]?.closest('[aria-hidden="true"],[inert]')),
        safety: visible && document.querySelector('form [aria-invalid="true"]') === null };
    }), targets.map(target => target.selector));
    return { values, floors };
  }));
  if (invocation !== undefined) {
    const evidence = inspectRenderedRefinementEvidence({ root, invocation });
    if (evidence.after.productionRevisionSha256 !== buildSha256) throw new Error('FEEDBACK_BASELINE_STALE');
  }
  return { schema: 'design-language-measurement-v1', translationSha256, buildSha256, route: targets[0]!.route, state: targets[0]!.state, viewport, values: captured.values, floors: captured.floors };
}
