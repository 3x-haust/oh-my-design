import type { Blueprint, BlueprintNode, Invariants, Reference } from '../types.ts';
import { ReferenceBoardResolutionError, type ComponentCaptureTransfer, type SanitizedBlueprintNode } from './board-contract.ts';
import { hasAssemblyPayload } from './board-sanitization.ts';

const fail = (reason: string): never => { throw new ReferenceBoardResolutionError(reason); };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown, minimum = 0, maximum = Number.POSITIVE_INFINITY): value is number => typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
const finiteNumbers = (value: unknown): value is number[] => Array.isArray(value) && value.every((entry) => finite(entry));
const text = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && !hasAssemblyPayload(value);
const texts = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);
const tuple = (value: unknown): value is [number, number, number, number] => Array.isArray(value) && value.length === 4 && value.every((entry) => finite(entry));
const role = (value: unknown): value is BlueprintNode['role'] => value === 'container' || value === 'heading' || value === 'text' || value === 'interactive' || value === 'image';
const direction = (value: unknown): value is BlueprintNode['direction'] => value === 'VERTICAL' || value === 'HORIZONTAL';
const colorRole = (value: unknown): value is NonNullable<BlueprintNode['fillRole']> => value === 'bg' || value === 'surface' || value === 'fg' || value === 'muted' || value === 'accent';
const textLength = (value: unknown): value is NonNullable<BlueprintNode['textLength']> => value === 'label' || value === 'phrase' || value === 'paragraph';
const optional = (value: Record<string, unknown>, key: string, validate: (input: unknown) => boolean): boolean => value[key] === undefined || validate(value[key]);
const scrollMeasurement = (value: unknown): boolean => isRecord(value) && finite(value['step']) && finite(value['fired']) && finite(value['entered']);
const measuredInvariants = (value: unknown): value is Invariants => isRecord(value)
  && finiteNumbers(value['spacingLadder']) && finiteNumbers(value['radiusLadder']) && finite(value['elevationLevels']) && finite(value['centeredRatio'], 0, 1) && finite(value['tokenCoverage'], 0, 1) && finite(value['paddingWeight'])
  && finiteNumbers(value['typeScale']) && texts(value['fontFamilies']) && finiteNumbers(value['weightLadder']) && finiteNumbers(value['motionDurations']) && texts(value['easingVocab']) && finite(value['animatedShare'], 0, 1)
  && finite(value['hoverCoverage'], 0, 1) && finite(value['focusCoverage'], 0, 1) && texts(value['animatedProperties']) && typeof value['hasReducedMotion'] === 'boolean' && Array.isArray(value['scrollChoreography']) && value['scrollChoreography'].every(scrollMeasurement);
const blueprintNode = (value: unknown): value is BlueprintNode => isRecord(value)
  && typeof value['id'] === 'string' && value['id'].trim() !== '' && Array.isArray(value['children']) && value['children'].every((child) => typeof child === 'string' && child.trim() !== '')
  && isRecord(value['box']) && finite(value['box']['w']) && finite(value['box']['h']) && role(value['role'])
  && optional(value, 'padding', tuple) && optional(value, 'gap', finite) && optional(value, 'direction', direction) && optional(value, 'fontSize', finite) && optional(value, 'fontWeight', finite) && optional(value, 'lineHeight', finite) && optional(value, 'radius', finite)
  && optional(value, 'hasShadow', (input) => typeof input === 'boolean') && optional(value, 'fillRole', colorRole) && optional(value, 'textRole', colorRole) && optional(value, 'motionDurations', finiteNumbers) && optional(value, 'motionEasings', texts) && optional(value, 'textLength', textLength);
const measuredBlueprint = (value: unknown): value is Blueprint => isRecord(value) && Array.isArray(value['nodes']) && value['nodes'].every(blueprintNode);
const copyInvariants = (value: Invariants): Invariants => ({
  spacingLadder: [...value.spacingLadder], radiusLadder: [...value.radiusLadder], elevationLevels: value.elevationLevels, centeredRatio: value.centeredRatio,
  tokenCoverage: value.tokenCoverage, paddingWeight: value.paddingWeight, typeScale: [...value.typeScale], fontFamilies: [...value.fontFamilies],
  weightLadder: [...value.weightLadder], motionDurations: [...value.motionDurations], easingVocab: [...value.easingVocab], animatedShare: value.animatedShare,
  hoverCoverage: value.hoverCoverage, focusCoverage: value.focusCoverage, animatedProperties: [...value.animatedProperties], hasReducedMotion: value.hasReducedMotion,
  scrollChoreography: value.scrollChoreography.map((entry) => ({ step: entry.step, fired: entry.fired, entered: entry.entered })),
});

const sanitizedBlueprint = (reference: Reference, referenceId: string): { readonly nodes: readonly SanitizedBlueprintNode[] } => {
  const blueprint = reference.blueprint;
  if (!measuredBlueprint(blueprint)) return fail(`reference ${referenceId} is missing a valid matching blueprint`);
  const indexes = new Map<string, number>();
  for (const [index, node] of blueprint.nodes.entries()) {
    if (indexes.has(node.id)) fail(`reference ${referenceId} blueprint has duplicate node IDs`);
    indexes.set(node.id, index);
  }
  const nodes = blueprint.nodes.map((node): SanitizedBlueprintNode => {
    const children = node.children.map((child) => {
      const index = indexes.get(child);
      if (index === undefined) return fail(`reference ${referenceId} blueprint has an unknown child ID`);
      return index;
    });
    return {
      role: node.role, children, box: { w: node.box.w, h: node.box.h },
      ...(node.padding === undefined ? {} : { padding: [...node.padding] }), ...(node.gap === undefined ? {} : { gap: node.gap }),
      ...(node.direction === undefined ? {} : { direction: node.direction }), ...(node.fontSize === undefined ? {} : { fontSize: node.fontSize }),
      ...(node.fontWeight === undefined ? {} : { fontWeight: node.fontWeight }), ...(node.lineHeight === undefined ? {} : { lineHeight: node.lineHeight }),
      ...(node.radius === undefined ? {} : { radius: node.radius }), ...(node.hasShadow === undefined ? {} : { hasShadow: node.hasShadow }),
      ...(node.fillRole === undefined ? {} : { fillRole: node.fillRole }), ...(node.textRole === undefined ? {} : { textRole: node.textRole }),
      ...(node.motionDurations === undefined ? {} : { motionDurations: [...node.motionDurations] }), ...(node.motionEasings === undefined ? {} : { motionEasings: [...node.motionEasings] }),
      ...(node.textLength === undefined ? {} : { textLength: node.textLength }),
    };
  });
  return { nodes };
};

export function componentCaptureTransfer(reference: Reference, referenceId: string): ComponentCaptureTransfer {
  const invariants = reference.invariants;
  if (!measuredInvariants(invariants)) return fail(`reference ${referenceId} is missing measured invariants`);
  if (!texts(reference.principles) || reference.principles.length === 0) fail(`reference ${referenceId} has an empty or invalid principle`);
  return { invariants: copyInvariants(invariants), principles: [...reference.principles], blueprint: sanitizedBlueprint(reference, referenceId) };
}

export function copyComponentCaptureTransfer(transfer: ComponentCaptureTransfer): ComponentCaptureTransfer {
  return {
    invariants: copyInvariants(transfer.invariants), principles: [...transfer.principles],
    blueprint: { nodes: transfer.blueprint.nodes.map((node): SanitizedBlueprintNode => ({
      role: node.role, children: [...node.children], box: { w: node.box.w, h: node.box.h },
      ...(node.padding === undefined ? {} : { padding: [...node.padding] }), ...(node.gap === undefined ? {} : { gap: node.gap }),
      ...(node.direction === undefined ? {} : { direction: node.direction }), ...(node.fontSize === undefined ? {} : { fontSize: node.fontSize }),
      ...(node.fontWeight === undefined ? {} : { fontWeight: node.fontWeight }), ...(node.lineHeight === undefined ? {} : { lineHeight: node.lineHeight }),
      ...(node.radius === undefined ? {} : { radius: node.radius }), ...(node.hasShadow === undefined ? {} : { hasShadow: node.hasShadow }),
      ...(node.fillRole === undefined ? {} : { fillRole: node.fillRole }), ...(node.textRole === undefined ? {} : { textRole: node.textRole }),
      ...(node.motionDurations === undefined ? {} : { motionDurations: [...node.motionDurations] }), ...(node.motionEasings === undefined ? {} : { motionEasings: [...node.motionEasings] }),
      ...(node.textLength === undefined ? {} : { textLength: node.textLength }),
    })) },
  };
}
