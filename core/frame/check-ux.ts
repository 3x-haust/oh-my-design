import type { Violation } from '../types.ts';
import { readFrame } from './index.ts';

export type UxSurface = 'marketing' | 'product' | 'editorial' | 'mixed';

const UX_SURFACES = new Set<UxSurface>(['marketing', 'product', 'editorial', 'mixed']);
const TASK_COVERAGE_VIEWPORTS = new Set(['desktop', 'mobile']);
const TASK_COVERAGE_REQUIREMENTS = new Set(['invalid-submit', 'transient']);
const TASK_COVERAGE_FIELDS = ['goal', 'start', 'actions', 'success', 'recovery', 'viewports', 'requirements'] as const;
const TASK_COVERAGE_MATRIX_HEADING = /^## Task coverage matrix[ \t]*$/gm;

/** Return the normalized supported UX surface, or null for a missing or invalid value. */
export function normalizeUxSurface(value: unknown): UxSurface | null {
  if (typeof value !== 'string') return null;

  const surface = value.trim().toLowerCase();
  return UX_SURFACES.has(surface as UxSurface) ? surface as UxSurface : null;
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function validateUniqueCsvSubset(
  id: string,
  field: 'viewports' | 'requirements',
  value: string,
  allowed: ReadonlySet<string>,
  allowsNone: boolean,
): string | null {
  const values = value.split(',').map((item) => item.trim());
  if (values.some((item) => !item)) {
    return `${id} ${field} must be a comma-separated list`;
  }
  if (allowsNone && values.includes('none')) {
    return values.length === 1 ? null : `${id} requirements none cannot be combined with other values`;
  }

  const seen = new Set<string>();
  for (const item of values) {
    if (!allowed.has(item)) return `${id} ${field} contains unknown value: ${item}`;
    if (seen.has(item)) return `${id} ${field} contains duplicate value: ${item}`;
    seen.add(item);
  }
  return null;
}



/**
 * `T1 | goal: … | start: … | actions: … | success: … | recovery: … | viewports: … | requirements: …`
 *
 * IDs must be unique. Every field must be non-empty. Only recovery may use
 * `N/A: <reason>` or `N/A — <reason>`. Viewports are a unique subset of
 * `desktop,mobile`; requirements are `none` or a unique subset of
 * `invalid-submit,transient`.
 */
export function validateTaskCoverageMatrix(matrix: string): string[] {
  const rows = matrix.split('\n').map((row) => row.trim()).filter(Boolean);
  const errors: string[] = [];
  const ids = new Set<string>();

  if (rows.length === 0) return ['task coverage matrix has no rows'];

  for (const row of rows) {
    const columns = row.split('|').map((column) => column.trim());
    const id = columns.shift();
    if (!id || !/^T[1-9]\d*$/.test(id)) {
      errors.push(`malformed task coverage row: ${row}`);
      continue;
    }
    if (ids.has(id)) {
      errors.push(`duplicate task coverage id: ${id}`);
      continue;
    }
    ids.add(id);

    if (columns.length !== TASK_COVERAGE_FIELDS.length) {
      errors.push(`malformed task coverage row: ${row}`);
      continue;
    }

    for (const [index, field] of TASK_COVERAGE_FIELDS.entries()) {
      const column = columns[index] ?? '';
      const match = new RegExp(`^${field}:\\s*(.+)$`).exec(column);
      const value = match?.[1]?.trim() ?? '';
      if (!value) {
        errors.push(`${id} is missing ${field}`);
      } else if (/^N\/A\b/i.test(value)) {
        if (field !== 'recovery') {
          errors.push(`${id} ${field} must not be N/A`);
        } else if (!/^N\/A\s*(?::|—)\s*\S/.test(value)) {
          errors.push(`${id} recovery N/A requires a reason`);
        }
      } else if (field === 'viewports') {
        const error = validateUniqueCsvSubset(id, field, value, TASK_COVERAGE_VIEWPORTS, false);
        if (error) errors.push(error);
      } else if (field === 'requirements') {
        const error = validateUniqueCsvSubset(id, field, value, TASK_COVERAGE_REQUIREMENTS, true);
        if (error) errors.push(error);
      }
    }
  }

  return errors;
}

function taskCoverageMatrixSections(body: string): string[] {
  return body
    .split(TASK_COVERAGE_MATRIX_HEADING)
    .slice(1)
    .map((section) => section.split(/^## /m)[0] ?? '');
}

/**
 * Validate that the frame artifact has answered the UX anchor questions.
 *
 * `uxSurface` is one of marketing, product, editorial, or mixed. Product and mixed
 * frames require exactly one valid `## Task coverage matrix`; marketing and editorial
 * frames reject task coverage matrix contamination. Unsupported non-empty surfaces fail closed.
 */
export function checkFrameUx(cwd: string): Violation[] {
  const frame = readFrame(cwd);
  if (!frame) return [];

  const missing: string[] = [];

  if (!isNonEmptyString(frame.uxTask)) missing.push('uxTask (--task)');
  if (!isNonEmptyString(frame.uxFrequentAction)) {
    missing.push('uxFrequentAction (--frequent-action)');
  }
  if (!isNonEmptyString(frame.uxCostliestError)) {
    missing.push('uxCostliestError (--costliest-error)');
  }

  const rawSurface = frame.uxSurface;
  const surface = normalizeUxSurface(rawSurface);
  const hasSurface = typeof rawSurface === 'string' && rawSurface.trim().length > 0;
  if (rawSurface === undefined || (typeof rawSurface === 'string' && !hasSurface)) {
    missing.push('uxSurface (--surface)');
  } else if (!surface) {
    missing.push('uxSurface (--surface: marketing|product|editorial|mixed)');
  }

  const matrixSections = taskCoverageMatrixSections(frame.body);
  const requiresTaskCoverageMatrix = surface === 'product' || surface === 'mixed'
    || (hasSurface && !surface)
    || (rawSurface !== undefined && typeof rawSurface !== 'string');
  if (requiresTaskCoverageMatrix) {
    if (matrixSections.length !== 1) {
      missing.push(`taskCoverageMatrix (--task-matrix: requires exactly one section; found ${matrixSections.length})`);
    } else {
      const matrixErrors = validateTaskCoverageMatrix(matrixSections[0] ?? '');
      if (matrixErrors.length > 0) {
        missing.push(`taskCoverageMatrix (--task-matrix: ${matrixErrors.join('; ')})`);
      }
    }
  } else if ((surface === 'marketing' || surface === 'editorial') && matrixSections.length > 0) {
    missing.push('taskCoverageMatrix (--task-matrix: not allowed for marketing or editorial surfaces)');
  }

  if (missing.length === 0) return [];

  return [
    {
      id: 'FRAME-UX-INCOMPLETE',
      severity: 'warn',
      layer: 1,
      category: 'ux',
      nodeId: 'page',
      path: 'frame',
      value: missing.join(', '),
      message:
        `The frame exists but the following UX anchor question${missing.length === 1 ? ' is' : 's are'} unanswered: `
        + `${missing.join('; ')}. `
        + 'A frame that cannot name the costliest error has not been interrogated. '
        + 'Run `omd frame set --task "..." --frequent-action "..." --costliest-error "..." --surface "..."'
        + `${requiresTaskCoverageMatrix ? ' --task-matrix "T1 | goal: … | start: … | actions: … | success: … | recovery: … | viewports: … | requirements: …"' : ''}`
        + '` to complete it. See theory/ux.md §Task-first framing and §Surface types.',
    },
  ];
}
