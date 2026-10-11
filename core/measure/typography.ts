import type { MeasureNode, MetricValues } from './types.ts';
import { area, intersect, quantile, unionArea } from './geometry.ts';
export function typography(nodes: MeasureNode[], viewportArea: number): Pick<MetricValues, 'type-ladder' | 'text-minimum' | 'line-lengths'> {
  const text = nodes.filter(n => n.visibleBox && n.text.trim() && n.lines.some(l => intersect(l.box, n.visibleBox!)));
  const clusters: MetricValues['type-ladder']['clusters'] = [];
  for (const n of [...text].sort((a, b) => a.size - b.size || a.weight - b.weight || (a.families.join() < b.families.join() ? -1 : 1))) {
    let cluster = clusters.find(c => n.size - c.minSize <= 0.25 && c.weight === n.weight && c.families.join('\0') === n.families.join('\0'));
    if (!cluster) { cluster = { minSize: n.size, maxSize: n.size, weight: n.weight, families: n.families, leading: [], nodeCount: 0, graphemes: 0, textArea: 0, viewportShare: 0, roles: [], subjectIds: [] }; clusters.push(cluster); }
    cluster.maxSize = Math.max(cluster.maxSize, n.size); cluster.nodeCount++; cluster.graphemes += n.graphemes;
    cluster.subjectIds.push(n.id); if (!cluster.roles.includes(n.role)) cluster.roles.push(n.role); if (!cluster.leading.includes(n.leading)) cluster.leading.push(n.leading);
  }
  for (const c of clusters) { c.textArea = unionArea(text.filter(n => c.subjectIds.includes(n.id)).flatMap(n => n.lines.map(l => intersect(l.box, n.visibleBox!)))); c.viewportShare = c.textArea / viewportArea; c.roles.sort(); }
  const small = text.filter(n => n.size < 12);
  return {
    'type-ladder': { clusters },
    'text-minimum': { minimumByRole: [...new Set(text.map(n => n.role))].sort().map(role => ({ role, size: Math.min(...text.filter(n => n.role === role).map(n => n.size)) })), total: text.length, under12: small.length, from12To14: text.filter(n => n.size >= 12 && n.size <= 14).length, under12Area: unionArea(small.flatMap(n => n.lines.map(l => intersect(l.box, n.visibleBox!)))), small: small.map(n => ({ subjectId: n.id, size: n.size, role: n.role, control: n.control, excerpt: n.text.slice(0, 200), box: n.box })) },
    'line-lengths': { subjects: text.map(n => {
      const lines = n.lines.filter(l => area(intersect(l.box, n.visibleBox!)) > 0), lengths = lines.map(l => l.graphemes), widths = lines.map(l => l.box.w), hangul = /[가-힣]/.test(n.text), latin = /[A-Za-z]/.test(n.text);
      return { subjectId: n.id, role: n.role, script: hangul ? latin ? 'mixed' : 'hangul' : 'latin', lineCount: lines.length, graphemes: lengths, widths, em: widths.map(w => w / n.size), p50: quantile(lengths, 0.5), p95: quantile(lengths, 0.95), max: Math.max(0, ...lengths), lastLineShare: Math.max(...widths) > 0 ? widths.at(-1)! / Math.max(...widths) : null };
    }) },
  };
}
