export {
  DESIGN_REFERENCES_PATH,
  DOMAIN_REFERENCES_PATH,
  REFERENCE_RESEARCH_DESIGN_KEYS,
  REFERENCE_RESEARCH_DOMAIN_KEYS,
  REFERENCE_RESEARCH_EVIDENCE_KEYS,
  REFERENCE_RESEARCH_KEYS,
  REFERENCE_RESEARCH_LANE_KEYS,
  REFERENCE_RESEARCH_PATH,
  REFERENCE_RESEARCH_SCHEMA,
  REFERENCE_RESEARCH_SOURCE_KEYS,
} from './reference-research-types.ts';
export type {
  ReferenceResearch,
  ResearchDiscoveryRoot,
  ResearchEvidence,
  ValidationOptions,
} from './reference-research-types.ts';
export { fail, httpsUrl, parseReferenceResearch, record } from './reference-research-parser.ts';
