import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { readStableProjectFile, nodeStableProjectFileSystem } from '../runtime/stable-project-file.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { readPersistedRoute } from '../route/index.ts';
import { validateCurrentCompositionContract } from '../composition-contract/index.ts';

/** The same Markdown artifact can start small; no fabricated copy, type or reference fingerprints. */
export const MINIMAL_COMPOSITION_SECTIONS = [
  'Experience spine', 'Grid and alignment', 'Focal hierarchy', 'Responsive recomposition', 'Transfer boundary',
] as const;
export function compositionEntry(root: string, invocation: ProjectRunInvocation): { blockers: string[]; debt: string[] } {
  try {
    const full = validateCurrentCompositionContract(root, invocation);
    if (!full.length) return { blockers: [], debt: [] };
    const read = (path: string) => readStableProjectFile({ root, path: resolve(root, path), label: path, fs: nodeStableProjectFileSystem() });
    const markdown = read('.omd/composition.md').toString('utf8');
    const sections = new Map<string, string[]>();
    let current: string | undefined;
    for (const line of markdown.split(/\r?\n/)) {
      const match = /^## (.+?)\s*$/.exec(line);
      if (match) {
        current = match[1]!;
        if (sections.has(current)) return { blockers: [`composition: duplicate section ${current}`], debt: [] };
        sections.set(current, []);
      } else if (current) sections.get(current)!.push(line);
    }
    const blockers = MINIMAL_COMPOSITION_SECTIONS.filter(section => {
      const text = sections.get(section)?.join('\n').trim() ?? '';
      return text.length < 8 || /^(?:tbd|todo|placeholder|unknown)\b/i.test(text);
    }).map(section => `composition: minimal contract needs ${section}`);
    const fingerprint = sections.get('Input fingerprint')?.join('\n') ?? '';
    const frameSha = createHash('sha256').update(read('.omd/frame.md')).digest('hex');
    const sourceSha = readPersistedRoute(root, invocation).sourceContractSha256;
    for (const [label, digest] of [['Frame', frameSha], ['Source contract', sourceSha]]) {
      const matches = [...fingerprint.matchAll(new RegExp(`^- ${label} SHA-256: ([a-f0-9]{64})$`, 'gm'))];
      if (matches.length !== 1 || matches[0]![1] !== digest) blockers.push(`composition: minimal contract needs current ${label} SHA-256`);
    }
    return { blockers, debt: blockers.length ? [] : full.map(finding => finding.message) };
  } catch (error) {
    return { blockers: [`composition: ${error instanceof Error ? error.message : String(error)}`], debt: [] };
  }
}
