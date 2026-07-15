import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const COMPOSITION_SECTIONS = [
  'Input fingerprint',
  'Experience spine',
  'Section dependency',
  'Grid and alignment',
  'Density and visual mass',
  'Focal hierarchy',
  'Domain form grammar',
  'Media roles',
  'Responsive recomposition',
  'Candidate axes',
  'Transfer boundary',
] as const;

export interface CompositionContractFinding {
  id: 'COMPOSITION-MISSING' | 'COMPOSITION-SECTION' | 'COMPOSITION-HASH' | 'COMPOSITION-STALE' | 'COMPOSITION-SCOUT';
  path: string;
  message: string;
}

function sections(markdown: string): Map<string, string> {
  const result = new Map<string, string>();
  const matches = [...markdown.matchAll(/^##\s+(.+?)\s*$/gm)];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const start = match.index! + match[0].length;
    const end = matches[i + 1]?.index ?? markdown.length;
    result.set(match[1]!.trim(), markdown.slice(start, end).trim());
  }
  return result;
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export interface CompositionContractInputs {
  contract?: string;
  frame?: string;
  copyDeck?: string;
  typeProof?: string;
  scout?: string;
}

/** Pure validation core: callers provide contents/digests and receive findings, with no I/O. */
export function validateCompositionContractSource(inputs: CompositionContractInputs): CompositionContractFinding[] {
  if (inputs.contract === undefined) {
    return [{ id: 'COMPOSITION-MISSING', path: '.omd/composition.md', message: 'composition contract is missing' }];
  }

  const markdown = inputs.contract;
  const parsed = sections(markdown);
  const findings: CompositionContractFinding[] = [];
  for (const section of COMPOSITION_SECTIONS) {
    if (!parsed.get(section)?.trim()) {
      findings.push({ id: 'COMPOSITION-SECTION', path: `.omd/composition.md#${section}`, message: `required section is missing or empty: ${section}` });
    }
  }

  const fingerprint = parsed.get('Input fingerprint') ?? '';
  const requiredInputs = [
    ['Frame', 'frame.md', inputs.frame],
    ['Copy deck', 'copy-deck.md', inputs.copyDeck],
    ['Type proof', 'type-proof.md', inputs.typeProof],
  ] as const;
  for (const [label, filename, actualHash] of requiredInputs) {
    const match = new RegExp(`^- ${label} SHA-256: ([0-9a-f]{64})$`, 'm').exec(fingerprint);
    if (!match) {
      findings.push({ id: 'COMPOSITION-HASH', path: `.omd/composition.md#Input fingerprint`, message: `${label} SHA-256 must be exactly 64 lowercase hex characters` });
      continue;
    }
    if (actualHash === undefined) {
      findings.push({ id: 'COMPOSITION-STALE', path: `.omd/${filename}`, message: `${filename} is missing; composition cannot be current` });
    } else if (match[1] !== actualHash) {
      findings.push({ id: 'COMPOSITION-STALE', path: `.omd/${filename}`, message: `${filename} changed after composition was written` });
    }
  }

  const scoutHash = /^- Scout SHA-256: ([0-9a-f]{64})$/m.exec(fingerprint)?.[1];
  const scoutNA = /^- Scout SHA-256: N\/A — (\S.*)$/m.exec(fingerprint)?.[1];
  if (inputs.scout !== undefined) {
    if (!scoutHash) {
      findings.push({ id: 'COMPOSITION-SCOUT', path: '.omd/composition.md#Input fingerprint', message: 'Scout SHA-256 must be a 64-hex hash while .omd/scout.md exists' });
    } else if (scoutHash !== inputs.scout) {
      findings.push({ id: 'COMPOSITION-STALE', path: '.omd/scout.md', message: 'scout.md changed after composition was written' });
    }
  } else if (!scoutNA) {
    findings.push({ id: 'COMPOSITION-SCOUT', path: '.omd/composition.md#Input fingerprint', message: 'absent scout.md requires `N/A — <reason>` instead of a hash or empty value' });
  }

  return findings.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Filesystem adapter used by the CLI; validation itself remains pure above. */
export function validateCompositionContract(root: string): CompositionContractFinding[] {
  const omd = join(root, '.omd');
  const readHash = (filename: string): string | undefined => {
    const path = join(omd, filename);
    return existsSync(path) ? sha256(path) : undefined;
  };
  const contractPath = join(omd, 'composition.md');
  const frame = readHash('frame.md');
  const copyDeck = readHash('copy-deck.md');
  const typeProof = readHash('type-proof.md');
  const scout = readHash('scout.md');
  return validateCompositionContractSource({
    ...(existsSync(contractPath) ? { contract: readFileSync(contractPath, 'utf8') } : {}),
    ...(frame ? { frame } : {}),
    ...(copyDeck ? { copyDeck } : {}),
    ...(typeProof ? { typeProof } : {}),
    ...(scout ? { scout } : {}),
  });
}
