import { isDeepStrictEqual } from 'node:util';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import {
  DESIGN_REFERENCES_PATH, DOMAIN_REFERENCES_PATH, REFERENCE_RESEARCH_PATH,
  fail, parseReferenceResearch, type ReferenceResearch, type ValidationOptions,
} from './reference-research-contract.ts';
import { readReferenceResearchFileBytes, validateReferenceResearch } from './reference-research-validation.ts';

export {
  REFERENCE_RESEARCH_SCHEMA, DOMAIN_REFERENCES_PATH, DESIGN_REFERENCES_PATH, REFERENCE_RESEARCH_PATH,
  REFERENCE_RESEARCH_KEYS, REFERENCE_RESEARCH_LANE_KEYS, REFERENCE_RESEARCH_DOMAIN_KEYS,
  REFERENCE_RESEARCH_DESIGN_KEYS, REFERENCE_RESEARCH_SOURCE_KEYS, REFERENCE_RESEARCH_EVIDENCE_KEYS,
  parseReferenceResearch,
} from './reference-research-contract.ts';
export type { ReferenceResearch } from './reference-research-contract.ts';
export { validateReferenceResearch } from './reference-research-validation.ts';

export function referenceResearchArtifacts(research: ReferenceResearch) {
  const envelope = { sourceContractSha256: research.sourceContractSha256 };
  const market = research.schema === 'reference-research-v7'
    ? { marketRegion: research.marketCoverage?.marketRegion ?? null }
    : {};
  return {
    [DOMAIN_REFERENCES_PATH]: { schema: research.schema === 'reference-research-v7' ? 'domain-references-v2' : 'domain-references-v1', ...envelope, ...market,
      ...(research.schema === 'reference-research-v7' ? { marketCoverage: research.marketCoverage?.domain ?? null } : {}), ...research.domainReference },
    [DESIGN_REFERENCES_PATH]: { schema: research.schema === 'reference-research-v7' ? 'design-references-v2' : 'design-references-v1', ...envelope, ...market,
      ...(research.schema === 'reference-research-v7' ? { marketCoverage: research.marketCoverage?.design ?? null } : {}), ...research.designReference },
    [REFERENCE_RESEARCH_PATH]: research,
  };
}

export function publishReferenceResearch(root: string, input: unknown, options: ValidationOptions, writer: ProjectWriteAdapter): void {
  const research = parseReferenceResearch(input);
  validateReferenceResearch(root, research, options);
  writer.write('.omd/refs/design/README.md', designResearchSummary(research));
  for (const [path, value] of Object.entries(referenceResearchArtifacts(research))) {
    writer.write(path, `${JSON.stringify(value, null, 2)}\n`);
  }
}

export function designResearchSummary(research: ReferenceResearch): string {
  const escape = (value: string): string => value.replace(/[<>]/g, '').replace(/\n/g, ' ');
  return ['# Design research', '', 'Visual-direction judgments need human review. Captured ≠ selected quality; component-support alone does not complete this lane.', '',
    ...research.designReference.sources.flatMap(item => [
      `## ${escape(item.id)} — ${item.visualRole}`, '',
      `Source: ${item.url}`, `Discovery: ${item.discovery!.url}`, '',
      `![Captured reference](../../../${item.evidence.path})`, '',
      ...Object.entries(item.visualAssessment!).map(([axis, finding]) => `- ${axis}: ${escape(finding)}`), '',
    ]),
  ].join('\n');
}

export function readPublishedReferenceResearch(root: string): ReferenceResearch {
  const research = parseReferenceResearch(JSON.parse(readReferenceResearchFileBytes(root, REFERENCE_RESEARCH_PATH, 'REFERENCE_RESEARCH_MISSING').toString('utf8')));
  for (const [path, expected] of Object.entries(referenceResearchArtifacts(research))) {
    if (path === REFERENCE_RESEARCH_PATH) continue;
    const actual = JSON.parse(readReferenceResearchFileBytes(root, path, `REFERENCE_RESEARCH_LANE_MISSING: ${path}`).toString('utf8'));
    if (!isDeepStrictEqual(actual, expected)) fail(`REFERENCE_RESEARCH_LANE_STALE: ${path}`);
  }
  return research;
}
