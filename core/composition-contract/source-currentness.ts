import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { servedProjectTreeSha256 } from '../render/serve.ts';

const HEX = /^[0-9a-f]{64}$/;
const PROOFS = ['.omd/type-proof.md', '.omd/composition.md'] as const;
export type SourceBoundProofPath = typeof PROOFS[number];

export type SourceBoundProofFinding = Readonly<{
  id:
    | 'SOURCE_BOUND_PROOF_MISSING'
    | 'SOURCE_BOUND_PROOF_INVALID'
    | 'SOURCE_BOUND_PROOF_MISMATCH'
    | 'SOURCE_BOUND_PROOF_STALE';
  path: string;
  message: string;
}>;

type Binding = Readonly<{ path: SourceBoundProofPath; entry: string; revisionSha256: string }>;

function parseBinding(path: SourceBoundProofPath, source: string): Binding {
  const lines = source.split(/\r?\n/);
  const headings = lines.reduce<number[]>((found, line, index) => {
    if (line === '## Production revision binding') found.push(index);
    return found;
  }, []);
  if (headings.length !== 1) throw new Error('requires exactly one `## Production revision binding` section');
  const start = headings[0]! + 1;
  const end = lines.findIndex((line, index) => index >= start && /^## /.test(line));
  const section = lines.slice(start, end === -1 ? lines.length : end);
  const entries = section.flatMap((line) => {
    const match = /^- Production entry: `([^`]+)`$/.exec(line);
    return match === null ? [] : [match[1]!];
  });
  const revisions = section.flatMap((line) => {
    const match = /^- Production revision SHA-256: `([^`]+)`$/.exec(line);
    return match === null ? [] : [match[1]!];
  });
  if (entries.length !== 1 || revisions.length !== 1) {
    throw new Error('binding requires exactly one production entry and one production revision SHA-256');
  }
  if (!HEX.test(revisions[0]!)) throw new Error('production revision must be lowercase SHA-256');
  return { path, entry: entries[0]!, revisionSha256: revisions[0]! };
}

export function validateSourceBoundProofCurrentness(
  root: string,
  paths: readonly SourceBoundProofPath[] = PROOFS,
): SourceBoundProofFinding[] {
  const findings: SourceBoundProofFinding[] = [];
  const bindings: Binding[] = [];
  for (const path of paths) {
    let source: string;
    try { source = readFileSync(join(root, path), 'utf8'); } catch (error) {
      findings.push({
        id: 'SOURCE_BOUND_PROOF_MISSING',
        path,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    try { bindings.push(parseBinding(path, source)); } catch (error) {
      findings.push({
        id: source.includes('## Production revision binding')
          ? 'SOURCE_BOUND_PROOF_INVALID'
          : 'SOURCE_BOUND_PROOF_MISSING',
        path,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (bindings.length !== paths.length) return findings;
  const firstBinding = bindings[0];
  if (firstBinding === undefined) return findings;
  if (bindings.some(({ entry, revisionSha256 }) =>
    entry !== firstBinding.entry || revisionSha256 !== firstBinding.revisionSha256)) {
    findings.push({
      id: 'SOURCE_BOUND_PROOF_MISMATCH',
      path: '.omd/composition.md',
      message: 'type proof and composition must bind the same production entry and revision',
    });
  }
  let current: string;
  try { current = servedProjectTreeSha256(root, firstBinding.entry); } catch (error) {
    findings.push({
      id: 'SOURCE_BOUND_PROOF_INVALID',
      path: firstBinding.path,
      message: error instanceof Error ? error.message : String(error),
    });
    return findings;
  }
  for (const binding of bindings) {
    if (binding.revisionSha256 !== current) {
      findings.push({
        id: 'SOURCE_BOUND_PROOF_STALE',
        path: binding.path,
        message: `production revision is ${binding.revisionSha256}; current ${binding.entry} revision is ${current}`,
      });
    }
  }
  return findings;
}
