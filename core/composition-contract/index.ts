import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { loadRefs } from '../ref/store.ts';

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
  id: 'COMPOSITION-MISSING' | 'COMPOSITION-SECTION' | 'COMPOSITION-HASH' | 'COMPOSITION-STALE' | 'COMPOSITION-SCOUT' | 'COMPOSITION-SYNTHESIS';
  path: string;
  message: string;
}

/**
 * The conditional section for user-supplied references. It is not in
 * COMPOSITION_SECTIONS because it is required exactly when the project has
 * user-origin references (`omd ref add --from-user`): references the user handed
 * over must be synthesized as an explicit plan — per reference, the concrete
 * trait taken (information architecture, navigation model, density, search/filter
 * interaction, form pattern, feedback/state vocabulary, type or spacing system…),
 * where it lands, how it is adapted, and how conflicts between references are
 * resolved — not imitated as a mood.
 */
export const SYNTHESIS_SECTION = 'Reference synthesis';

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
  /**
   * Short labels (hostname or file basename) of user-origin references
   * (`origin: 'user'` records under `.omd/refs/`). When non-empty, the contract
   * must carry a non-empty `## Reference synthesis` section and every label must
   * be mentioned in it: each user-supplied reference is either mapped to a
   * concrete adopted trait or explicitly declined with a reason — silence is the
   * mood-board failure this gate exists to catch.
   */
  userRefLabels?: string[];
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

  const userRefLabels = inputs.userRefLabels ?? [];
  if (userRefLabels.length > 0) {
    const synthesis = parsed.get(SYNTHESIS_SECTION)?.trim() ?? '';
    if (synthesis === '') {
      findings.push({
        id: 'COMPOSITION-SYNTHESIS',
        path: `.omd/composition.md#${SYNTHESIS_SECTION}`,
        message: `user-provided references exist but the ${SYNTHESIS_SECTION} section is missing or empty: name, per reference, the concrete trait adopted (IA, navigation, density, search/filter interaction, form pattern, state feedback, type/spacing), where it lands, the adaptation, and conflict resolution — or decline the reference with a reason`,
      });
    } else {
      const lower = synthesis.toLowerCase();
      for (const label of userRefLabels) {
        if (!lower.includes(label.toLowerCase())) {
          findings.push({
            id: 'COMPOSITION-SYNTHESIS',
            path: `.omd/composition.md#${SYNTHESIS_SECTION}`,
            message: `user reference "${label}" is not mentioned in ${SYNTHESIS_SECTION}: map a concrete trait from it or decline it with a reason`,
          });
        }
      }
    }
  }

  return findings.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Hostname of a URL, or the basename (without extension) of a file path. */
function refLabel(source: string): string {
  try {
    const url = new URL(source);
    if (url.protocol === 'file:') return basename(url.pathname).replace(/\.[^.]+$/, '');
    return url.hostname.replace(/^www\./, '');
  } catch {
    return basename(source).replace(/\.[^.]+$/, '');
  }
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
  const userRefLabels = [...new Set(
    loadRefs(root).filter((ref) => ref.origin === 'user').map((ref) => refLabel(ref.source)),
  )].sort();
  return validateCompositionContractSource({
    ...(existsSync(contractPath) ? { contract: readFileSync(contractPath, 'utf8') } : {}),
    ...(frame ? { frame } : {}),
    ...(copyDeck ? { copyDeck } : {}),
    ...(typeProof ? { typeProof } : {}),
    ...(scout ? { scout } : {}),
    ...(userRefLabels.length > 0 ? { userRefLabels } : {}),
  });
}
