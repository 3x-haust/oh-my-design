import { readFileSync } from 'node:fs';
import type { ProjectRunInvocation } from '../core/runtime/invocation.ts';
import type { ProjectWriteAdapter } from '../core/runtime/project-write.ts';
import { measureProject } from '../core/measure/index.ts';
import { loadMeasurement } from '../core/measure/files.ts';
export async function runMeasureCommand(options: { entry?: string; scope?: string; input?: string; json?: boolean }, root: string, writer: ProjectWriteAdapter, invocation: ProjectRunInvocation): Promise<0 | 1> {
  if (!options.entry || options.input !== undefined) throw new Error('usage: omd measure --entry <local.html|URL> [--scope <scope.json>] [--json]; imported measurements are not accepted');
  const result = await measureProject({ root, entry: options.entry, ...(options.scope ? { scope: JSON.parse(readFileSync(options.scope, 'utf8')) } : {}), writer, invocation });
  if (options.json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else {
    const packet = loadMeasurement(root, result.packet, { native: false });
    console.log(`measure: ${result.summary.deterministicVerdict} (${result.coverage.captured}/${result.coverage.required} views)`);
    for (const m of packet.measurements) if (m.kind === 'type-ladder') console.log(`${m.viewIds.join(',')}: ${m.value.clusters.map(c => `${c.minSize}px/${c.weight} ${c.families.join(',')}`).join('; ')}`);
    for (const f of packet.findings) console.log(`${f.severity}: ${f.code} [${f.viewIds.join(',')}] ${f.subjectIds.join(',')}`);
    console.log(result.packet.path);
  }
  return result.summary.deterministicVerdict === 'PASS' ? 0 : 1;
}
