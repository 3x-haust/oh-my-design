#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';

type Counts = Map<string, number>;
type Source = { lines: Counts; branches: Counts; functions: Counts };
const thresholds = { Lines: 59, Branches: 72, Functions: 65 } as const;

export function mergeCoverage(reports: readonly string[]): { lcov: string; summary: string } {
  if (!reports.length) throw new Error('at least one LCOV report is required');
  const sources = new Map<string, Source>();
  for (const report of reports) {
    const text = readFileSync(report, 'utf8');
    if (!text.startsWith('TN:\n') || !text.includes('\nend_of_record\n')) throw new Error(`invalid or empty LCOV: ${report}`);
    let source: Source | undefined;
    let declarations = new Map<string, string[]>();
    let records = 0;
    for (const line of text.trimEnd().split('\n')) {
      if (line === 'TN:') continue;
      if (line.startsWith('SF:')) {
        const file = line.slice(3);
        if (!file) throw new Error(`empty SF in ${report}`);
        source = sources.get(file);
        if (!source) {
          source = { lines: new Map(), branches: new Map(), functions: new Map() };
          sources.set(file, source);
        }
        declarations = new Map();
        records++;
      } else if (line === 'end_of_record') {
        if (!source) throw new Error(`orphan end_of_record in ${report}`);
        source = undefined;
      } else if (source && line.startsWith('FN:')) {
        const declaration = line.slice(3);
        const separator = declaration.indexOf(',');
        if (separator < 1) throw new Error(`invalid function declaration in ${report}: ${line}`);
        const name = declaration.slice(separator + 1);
        declarations.set(name, [...(declarations.get(name) ?? []), declaration]);
      } else if (source && /^(DA|BRDA|FNDA):/.test(line)) {
        const separator = line.indexOf(':');
        const values = line.slice(separator + 1).split(',');
        const hits = Number(line.startsWith('FNDA:') ? values.shift() : values.pop());
        if (!Number.isFinite(hits) || hits < 0) throw new Error(`invalid hit count in ${report}: ${line}`);
        const key = line.startsWith('FNDA:') ? declarations.get(values.join(','))?.shift() : values.join(',');
        if (!key) throw new Error(`missing FN declaration in ${report}: ${line}`);
        const map = line.startsWith('DA:') ? source.lines : line.startsWith('BRDA:') ? source.branches : source.functions;
        map.set(key, (map.get(key) ?? 0) + hits);
      } else if (source && /^(LF|LH|BRF|BRH|FNF|FNH):/.test(line)) {
        // Aggregate totals from merged identities instead of summing shard totals.
      } else {
        throw new Error(`unexpected LCOV entry in ${report}: ${line}`);
      }
    }
    if (source || !records) throw new Error(`incomplete LCOV: ${report}`);
  }
  const counts = { Lines: [0, 0], Branches: [0, 0], Functions: [0, 0] } as Record<keyof typeof thresholds, [number, number]>;
  const chunks = ['TN:'];
  const sort = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
  for (const [file, source] of [...sources].sort(([a], [b]) => sort(a, b))) {
    chunks.push(`SF:${file}`);
    for (const [declaration] of [...source.functions].sort(([a], [b]) => sort(a, b))) chunks.push(`FN:${declaration}`);
    for (const [label, map, row, total, hit] of [
      ['FNDA', source.functions, 'Functions', 'FNF', 'FNH'],
      ['BRDA', source.branches, 'Branches', 'BRF', 'BRH'],
      ['DA', source.lines, 'Lines', 'LF', 'LH'],
    ] as const) {
      for (const [key, value] of [...map].sort(([a], [b]) => sort(a, b))) chunks.push(label === 'FNDA' ? `FNDA:${value},${key.slice(key.indexOf(',') + 1)}` : `${label}:${key},${value}`);
      chunks.push(`${hit}:${[...map.values()].filter((value) => value > 0).length}`, `${total}:${map.size}`);
      counts[row][0] += [...map.values()].filter((value) => value > 0).length;
      counts[row][1] += map.size;
    }
    chunks.push('end_of_record');
  }
  const rows = Object.entries(counts).map(([metric, [covered, found]]) => {
    if (!found) throw new Error(`coverage has no ${metric.toLowerCase()}`);
    return { metric: metric as keyof typeof thresholds, covered, found, percent: 100 * covered / found };
  });
  const summary = ['## Coverage', '', '| Metric | Covered | Total | Percent | Threshold |', '|---|---:|---:|---:|---:|',
    ...rows.map(({ metric, covered, found, percent }) => `| ${metric} | ${covered} | ${found} | ${percent.toFixed(2)}% | ${thresholds[metric]}% |`), ''].join('\n');
  for (const { metric, percent } of rows) {
    if (percent < thresholds[metric]) throw new Error(`${metric} coverage ${percent.toFixed(2)}% is below ${thresholds[metric]}%`);
  }
  return { lcov: chunks.join('\n') + '\n', summary };
}

if (process.argv[1]?.endsWith('/merge-coverage.ts')) {
  try {
    const { lcov, summary } = mergeCoverage(process.argv.slice(2));
    mkdirSync('coverage', { recursive: true });
    writeFileSync('coverage/lcov.info', lcov);
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
