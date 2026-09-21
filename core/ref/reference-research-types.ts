import type { MarketReferenceCoverage } from './market-reference-coverage-contract.ts';

export const REFERENCE_RESEARCH_SCHEMA = 'reference-research-v7' as const;
export const DOMAIN_REFERENCES_PATH = '.omd/refs/domain/research.json';
export const DESIGN_REFERENCES_PATH = '.omd/refs/design/research.json';
export const REFERENCE_RESEARCH_PATH = '.omd/reference-research.json';
export const REFERENCE_RESEARCH_KEYS = [
  'schema', 'sourceContractSha256', 'marketCoverage', 'domainReference', 'designReference',
] as const;
export const REFERENCE_RESEARCH_LANE_KEYS = ['queries', 'searches', 'sources'] as const;
export const REFERENCE_RESEARCH_DOMAIN_KEYS = [...REFERENCE_RESEARCH_LANE_KEYS, 'benchmarkSha256'] as const;
export const REFERENCE_RESEARCH_DESIGN_KEYS = [...REFERENCE_RESEARCH_LANE_KEYS, 'boardSha256'] as const;
export const REFERENCE_RESEARCH_SOURCE_KEYS = [
  'id', 'url', 'observedAt', 'decision', 'finding', 'evidence', 'capture',
] as const;
export const REFERENCE_RESEARCH_EVIDENCE_KEYS = ['path', 'sha256'] as const;

export type ResearchEvidence = Readonly<{ path: string; sha256: string }>;
export type ResearchDiscoveryRoot = Readonly<{
  method: 'direct-public'; entry: 'public-directory' | 'free-gallery'; url: string; reason: string;
  evidence: ResearchEvidence; capture: ResearchEvidence;
}>;
export type ResearchSource = Readonly<{
  id: string;
  url: string;
  observedAt: string;
  decision: string;
  finding: string;
  evidence: ResearchEvidence;
  capture: ResearchEvidence;
  visualRole?: 'visual-direction' | 'component-support';
  visualAssessment?: Readonly<Record<'composition' | 'typography' | 'density' | 'imagery' | 'transfer' | 'avoid', string>>;
  discovery?: Readonly<{
    url: string;
    kind: 'app-gallery' | 'web-gallery' | 'visual-bookmark' | 'user-provided';
    access: 'free';
    qualityReason: string;
    evidence: ResearchEvidence;
    capture: ResearchEvidence;
  }>;
}>;
export type ResearchLane = Readonly<{
  queries: readonly string[];
  searches: readonly ResearchEvidence[];
  sources: readonly ResearchSource[];
  navigation?: readonly Readonly<{ url: string; evidence: ResearchEvidence; capture: ResearchEvidence }>[];
  discoveryRoots?: readonly ResearchDiscoveryRoot[];
}>;
export type ReferenceResearch = Readonly<{
  schema: typeof REFERENCE_RESEARCH_SCHEMA | 'reference-research-v6' | 'reference-research-v5';
  sourceContractSha256: string;
  marketCoverage?: MarketReferenceCoverage | null;
  domainReference: ResearchLane & Readonly<{ benchmarkSha256: string | null }>;
  designReference: ResearchLane & Readonly<{ boardSha256: string }>;
}>;
export type ValidationOptions = Readonly<{
  expectedSourceContractSha256: string;
  benchmarkRequired: boolean;
  expectedRequest?: string;
}>;
