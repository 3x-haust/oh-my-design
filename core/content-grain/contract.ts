export type GrainSourceAuthority = 'current-user' | 'project-first-party';
export type GrainFixtureRole = 'typical' | 'minimum' | 'maximum' | 'protected-outlier';
export type GrainMetricUnit = 'graphemes' | 'items' | 'ratio-milli';
export type ContentFitViewport = 'desktop' | 'mobile';

export interface GrainSource {
  readonly id: string;
  readonly authority: GrainSourceAuthority;
  readonly path: string;
  readonly sha256: string;
}

export interface GrainFixture {
  readonly id: string;
  readonly sourceId: string;
  readonly locator: string;
  readonly role: GrainFixtureRole;
}

export type GrainMetric =
  | Readonly<{
      kind: 'range';
      unit: GrainMetricUnit;
      minimum: number;
      typical: number;
      maximum: number;
    }>
  | Readonly<{
      kind: 'semantic-priority';
      fixtureId: string;
    }>;

export interface GrainTrait {
  readonly id: string;
  readonly sourceIds: readonly string[];
  readonly fixtureIds: readonly string[];
  readonly metric: GrainMetric;
  readonly semanticRole: string;
  readonly antiTemplateConsequence: string;
  readonly responsiveConsequence: string;
  readonly falsifier: string;
}

export type ContentGrain =
  | Readonly<{
      schema: 'content-grain-v1';
      status: 'active';
      sources: readonly GrainSource[];
      traits: readonly GrainTrait[];
      fixtures: readonly GrainFixture[];
    }>
  | Readonly<{
      schema: 'content-grain-v1';
      status: 'no-stable-grain';
      sources: readonly GrainSource[];
      reason: string;
    }>;

export interface ContentFitCheck {
  readonly traitId: string;
  readonly fixtureId: string;
  readonly viewport: ContentFitViewport;
  readonly observationSha256: string;
}

export interface ContentFitReceipt {
  readonly schema: 'content-fit-receipt-v1';
  readonly status: 'fit' | 'no-stable-grain';
  readonly grain: Readonly<{
    path: '.omd/content-grain.json';
    schema: 'content-grain-v1';
    sha256: string;
  }>;
  readonly decisionGraphSha256: string;
  readonly checks: readonly ContentFitCheck[];
}

export interface ContentFitObservationBinding {
  readonly sha256: string;
  readonly decisionRefs: readonly string[];
}

export interface ValidateContentFitCoverageInput {
  readonly grain: ContentGrain;
  readonly grainSha256: string;
  readonly decisionGraphSha256: string;
  readonly receipt: ContentFitReceipt;
  readonly observations: readonly ContentFitObservationBinding[];
}

export {
  contentGrainDecisionToken,
  contentGrainSha256,
  parseContentGrain,
} from './parser.ts';
export { parseContentFitReceipt } from './fit-parser.ts';
export { validateContentFitCoverage } from './coverage.ts';
