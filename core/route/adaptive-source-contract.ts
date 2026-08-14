import { createHash } from 'node:crypto';
import { parseEvidenceClaimPublication } from '../brief/evidence-claims.ts';
import { parseTaskOutcomeContract } from '../brief/task-outcome.ts';
import {
  parseModelCapabilityRoutingSource,
  type ModelCapabilityRoutingSource,
} from '../runtime/model-capability-profile.ts';
import { parseUxPolicy } from '../ux/policy.ts';
import { parseDesignAxisInput } from './design-axis-routing.ts';
import {
  ADAPTIVE_ROUTE_INPUT_SCHEMA,
  ADAPTIVE_SOURCE_CONTRACT_SCHEMA,
  type AdaptiveRouteInput,
  type AdaptiveSourceContract,
} from './adaptive-flow-domain.ts';
import { routeReferenceDiscovery, type ReferenceDiscoveryInput } from '../ref/reference-discovery-routing.ts';

function canonicalObject(value: object): string {
  const entries: string[] = [];
  for (const key of Object.keys(value).sort()) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError('canonical route source contains non-data fields');
    }
    entries.push(`${JSON.stringify(key)}:${canonicalRouteJson(descriptor.value)}`);
  }
  return `{${entries.join(',')}}`;
}

export function canonicalRouteJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalRouteJson).join(',')}]`;
  if (typeof value === 'object' && Reflect.getPrototypeOf(value) === Object.prototype) return canonicalObject(value);
  throw new TypeError('canonical route source must be plain JSON data');
}

export function adaptiveSourceContractSha256(source: AdaptiveSourceContract): string {
  return createHash('sha256').update(`${canonicalRouteJson(source)}\n`).digest('hex');
}

function referenceSource(input: unknown): ReferenceDiscoveryInput {
  const routed = routeReferenceDiscovery(input);
  return Object.freeze({
    schema: 'reference-discovery-input-v1',
    taskNeed: routed.taskNeed,
    uncertainty: routed.uncertainty,
    existingEvidence: routed.evidence.availability,
    intendedUse: routed.references.intended,
    existingEvidenceUse: routed.decision === 'skip' ? routed.references.actual.description : null,
    skipReason: routed.decision === 'skip' ? routed.recommendation.reason : null,
  });
}

function modelSource(input: AdaptiveRouteInput): Readonly<{ now: number; routingInput: ModelCapabilityRoutingSource }> {
  return Object.freeze({
    now: input.modelCapability.now,
    routingInput: parseModelCapabilityRoutingSource(
      input.modelCapability.routingInput,
      input.modelCapability.now,
    ),
  });
}

export function adaptiveSourceContract(input: AdaptiveRouteInput): AdaptiveSourceContract {
  return Object.freeze({
    schema: ADAPTIVE_SOURCE_CONTRACT_SCHEMA,
    request: input.request,
    namedDependencies: input.namedDependencies,
    allowedPaths: input.allowedPaths,
    taskOutcome: parseTaskOutcomeContract(input.taskOutcome),
    uxPolicy: parseUxPolicy(input.uxPolicy),
    evidenceClaims: parseEvidenceClaimPublication(input.evidenceClaims),
    referenceDiscovery: referenceSource(input.referenceDiscovery),
    designAxes: parseDesignAxisInput(input.designAxes),
    modelCapability: modelSource(input),
    browserDecisionContext: input.browserDecisionContext,
    validatedLearningContext: input.validatedLearningContext,
    strategyDecision: input.strategyDecision,
  });
}

export function sourceContractRouteInput(source: AdaptiveSourceContract): AdaptiveRouteInput {
  return Object.freeze({
    schema: ADAPTIVE_ROUTE_INPUT_SCHEMA,
    request: source.request,
    namedDependencies: source.namedDependencies,
    allowedPaths: source.allowedPaths,
    taskOutcome: source.taskOutcome,
    uxPolicy: source.uxPolicy,
    evidenceClaims: source.evidenceClaims,
    referenceDiscovery: source.referenceDiscovery,
    designAxes: source.designAxes,
    modelCapability: source.modelCapability,
    browserDecisionContext: source.browserDecisionContext,
    validatedLearningContext: source.validatedLearningContext,
    strategyDecision: source.strategyDecision,
  });
}
