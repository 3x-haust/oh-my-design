import type { MeasurementDom, MetricValues, ViewSpec } from './types.ts';
export function responsive(views: { view: ViewSpec; dom: MeasurementDom }[]): MetricValues['cross-viewport-order'] {
  const pairs: MetricValues['cross-viewport-order']['pairs'] = [];
  const relevant = (dom: MeasurementDom) => dom.nodes.filter(n => n.visibleBox && (n.interactive || n.assignments.length || ['main', 'section', 'aside', 'header', 'nav'].includes(n.tag)));
  const visual = (dom: MeasurementDom) => relevant(dom).sort((a, b) => a.writingMode.startsWith('vertical') ? (a.writingMode === 'vertical-rl' ? b.box.x - a.box.x : a.box.x - b.box.x) || a.box.y - b.box.y : Math.abs(a.box.y - b.box.y) > 2 ? a.box.y - b.box.y : (a.direction === 'rtl' ? b.box.x - a.box.x : a.box.x - b.box.x) || a.rank - b.rank);
  for (let i = 0; i < views.length; i++) for (let j = i + 1; j < views.length; j++) {
    const a = views[i]!, b = views[j]!;
    if (a.view.route !== b.view.route || a.view.state !== b.view.state || a.view.stateRecipeSha256 !== b.view.stateRecipeSha256) continue;
    const left = visual(a.dom), right = visual(b.dom);
    // Positional locators alone cannot identify repeated sibling objects across reflows.
    // Keep these ambiguous rather than treating matching labels or nth positions as identity.
    const unique = (list: typeof left) => list.filter(n => list.filter(m => m.parent === n.parent && m.tag === n.tag && m.role === n.role && m.assignments.join() === n.assignments.join()).length === 1);
    const l = unique(left), r = unique(right), matched = l.filter(n => r.some(m => m.locator === n.locator && m.tag === n.tag));
    const inversions: [string, string][] = [];
    for (let x = 0; x < matched.length; x++) for (let y = x + 1; y < matched.length; y++) if (r.findIndex(n => n.locator === matched[x]!.locator) > r.findIndex(n => n.locator === matched[y]!.locator)) inversions.push([matched[x]!.locator, matched[y]!.locator]);
    pairs.push({ fromView: a.view.id, toView: b.view.id, matched: matched.length, inversions, normalizedInversions: matched.length > 1 ? inversions.length / (matched.length * (matched.length - 1) / 2) : 0, hidden: l.filter(n => !r.some(m => m.locator === n.locator)).map(n => n.locator), introduced: r.filter(n => !l.some(m => m.locator === n.locator)).map(n => n.locator), ambiguous: [...left.filter(n => !l.includes(n)), ...right.filter(n => !r.includes(n))].map(n => n.locator), domOrder: relevant(b.dom).sort((a, b) => a.rank - b.rank).map(n => n.locator), visualOrder: right.map(n => n.locator), tabOrder: relevant(b.dom).filter(n => n.tabIndex >= 0).sort((a, b) => (a.tabIndex || Infinity) - (b.tabIndex || Infinity) || a.rank - b.rank).map(n => n.locator) });
  }
  return { pairs };
}
