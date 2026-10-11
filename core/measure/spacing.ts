import type { MeasureNode, MetricValues } from './types.ts';
import { quantile } from './geometry.ts';
export function spacing(nodes: MeasureNode[]): Pick<MetricValues, 'spacing-clusters' | 'spacing-rhythm'> {
  const visible = nodes.filter(n => n.visibleBox), samples = visible.flatMap(n => n.spacing.map(s => ({ subjectId: n.id, ...s })));
  const groups: MetricValues['spacing-rhythm']['groups'] = [];
  for (const parent of visible) {
    const children = visible.filter(n => n.parent === parent.id).sort((a, b) => a.rank - b.rank);
    if (children.length < 2) continue;
    const gaps: number[] = [], overlaps: number[] = [];
    for (let i = 1; i < children.length; i++) {
      const a = children[i - 1]!, b = children[i]!;
      const sameRow = Math.abs(a.box.y - b.box.y) <= 2;
      const gap = sameRow ? b.direction === 'rtl' ? a.box.x - b.box.x - b.box.w : b.box.x - a.box.x - a.box.w : b.box.y - a.box.y - a.box.h;
      if (gap < 0) overlaps.push(gap); else gaps.push(gap);
      samples.push({ subjectId: b.id, property: sameRow ? 'sibling-inline-gap' : 'sibling-block-gap', value: gap });
    }
    const comparable = children.every(n => n.tag === children[0]!.tag && n.role === children[0]!.role);
    const enough = comparable && gaps.length >= 3, median = enough ? quantile(gaps, 0.5) : null;
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const between = parent.spacing.filter(s => /padding|margin/.test(s.property)).map(s => s.value).filter(n => n > 0);
    groups.push({ parentId: parent.id, subjectIds: children.map(n => n.id), gaps, overlaps, status: enough ? 'measured' : 'insufficient-samples', median, mad: median === null ? null : quantile(gaps.map(g => Math.abs(g - median)), 0.5), coefficientOfVariation: enough && mean > 0 ? Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length) / mean : null, offClusterCount: median === null ? null : gaps.filter(g => Math.abs(g - median) > 0.5).length, separationRatio: median !== null && median > 0 && between.length ? quantile(between, 0.5) / median : null });
  }
  const counts = new Map<number, number>();
  for (const s of samples.filter(s => s.value > 0)) { const key = Math.round(s.value * 2) / 2; counts.set(key, (counts.get(key) ?? 0) + 1); }
  return { 'spacing-clusters': { clusters: [...counts].sort((a, b) => a[0] - b[0]).map(([value, count]) => ({ value, count })), zeros: samples.filter(s => s.value === 0).length, samples }, 'spacing-rhythm': { groups } };
}
