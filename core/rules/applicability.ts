import { relative, resolve, sep } from 'node:path';
import type { Violation } from '../types.ts';

const STRUCTURAL_SKETCH_SEGMENTS = ['.omd', '.cache', 'sketches'];

export function isStructuralSketchTarget(projectRoot: string, target: string | undefined): boolean {
  if (target === undefined || /^https?:\/\//.test(target)) return false;
  const parts = relative(resolve(projectRoot), resolve(projectRoot, target))
    .split(sep)
    .filter(Boolean);
  return parts.some((_part, start) =>
    STRUCTURAL_SKETCH_SEGMENTS.every((segment, index) => parts[start + index] === segment));
}

export function contextualCheckViolations(
  projectRoot: string,
  target: string | undefined,
  violations: readonly Violation[],
): readonly Violation[] {
  if (!isStructuralSketchTarget(projectRoot, target)) return violations;
  return violations.filter((violation) => violation.id !== 'SLOP-COLORLESS');
}
