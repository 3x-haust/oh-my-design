/** Route-authoring recovery is separate from application/evidence recovery. No publication here. */
const INPUT_ERRORS = new Set([
  'MALFORMED_ADAPTIVE_ROUTE', 'UNEXPECTED_ADAPTIVE_ROUTE_FIELD', 'ADAPTIVE_SKIP_REASON_REQUIRED',
  'OPTIONAL_SKIP_REASON_REQUIRED', 'HARD_GATE_CANNOT_SKIP', 'MODEL_OWNER_REQUIRED',
  'DOMAIN_ANALYSIS_REQUIRED', 'PRODUCTION_REQUIRED', 'DESIGN_ONLY_SCOPE_REQUIRED',
  'FINAL_EVIDENCE_REQUIRED', 'INDEPENDENT_REVIEW_REQUIRED', 'SAFETY_WORK_REQUIRED',
  'REQUIRED_METHOD_MISSING', 'REFERENCE_WORK_MISMATCH', 'UNKNOWN_ADAPTIVE_STAGE',
  'UNKNOWN_ADAPTIVE_ROLE', 'ADAPTIVE_STRATEGY_DUPLICATE', 'ADAPTIVE_STAGE_ORDER_INVALID',
  'ADAPTIVE_EXECUTION_WAVE_INVALID', 'COPY_REPAIR_WORKFLOW_INVALID',
  'ATTRIBUTION_COVERAGE_INVALID', 'GREENFIELD_FRAME_REQUIRED',
  'GREENFIELD_TASK_FLOW_STAGE_REQUIRED', 'GREENFIELD_TASK_FLOW_ROLE_REQUIRED',
  'MALFORMED_POLICY', 'MALFORMED_DESIGN_AXIS_INPUT', 'INVALID_TASK_SIZE',
  'INVALID_FAILURE_RISK', 'INVALID_UX_NEED', 'INVALID_EXPRESSIVE_DESIGN_NEED',
  'CONTRADICTORY_DESIGN_AXIS_STATE', 'UNEXPECTED_DESIGN_AXIS_FIELD',
]);

export type RouteBootstrap = {
  inputPath: string;
  validationArgs: string[];
  classificationAttempted: boolean;
  classificationFailure?: string;
};

export function routeValidationArgs(args: readonly string[]): { inputPath: string; validationArgs: string[] } | undefined {
  if (args[0] !== 'route' || !['validate', 'classify'].includes(args[1] ?? '')) return;
  // Never silently drop an unknown/authority option or pick a different duplicate --input.
  const options = new Map<string, string>();
  for (let index = 2; index < args.length; index++) {
    const flag = args[index]!;
    if (!['--input', '--locale-context', '--json'].includes(flag) || options.has(flag)) return;
    if (flag === '--json') { options.set(flag, ''); continue; }
    const value = args[++index];
    if (!value || value.startsWith('--')) return;
    options.set(flag, value);
  }
  const inputPath = options.get('--input');
  if (!inputPath) return;
  const validationArgs = ['route', 'validate', '--input', inputPath, '--json'];
  const locale = options.get('--locale-context');
  if (locale !== undefined) validationArgs.push('--locale-context', locale);
  return { inputPath, validationArgs };
}

export function routeInputFailure(error: unknown): { summary: string; repairable: boolean } {
  const raw = error instanceof Error ? error.message : String(error);
  const payload = raw.replace(/^OMD_CLI_FAILED \([^)]*\):\s*/, '');
  try {
    const report = JSON.parse(payload);
    if (report.schema === 'adaptive-route-validation-v1' && report.ok === false && report.published === false
      && Array.isArray(report.diagnostics) && report.diagnostics.length > 0
      && report.diagnostics.every((d: { code?: unknown; path?: unknown; message?: unknown } | null) => d !== null
        && typeof d.code === 'string' && typeof d.path === 'string' && typeof d.message === 'string')) {
      const diagnostics = report.diagnostics as Array<{ code: string; path: string; message: string }>;
      return {
        summary: diagnostics.map(d => `- ${d.path}: ${d.message}`).join('\n').slice(0, 12000),
        repairable: diagnostics.every(d => INPUT_ERRORS.has(d.code)),
      };
    }
  } catch { /* Unknown/authority failures are preserved but never auto-retried. */ }
  return { summary: raw.slice(0, 12000), repairable: false };
}

export function isRouteValidationSuccess(text: string): boolean {
  try {
    const report = JSON.parse(text);
    return report.schema === 'adaptive-route-validation-v1' && report.ok === true
      && report.published === false && Array.isArray(report.diagnostics) && report.diagnostics.length === 0;
  } catch { return false; }
}

export function classificationAllowsInputRepair(failure: string | undefined): boolean {
  if (failure === undefined) return true;
  const code = failure.replace(/^OMD_CLI_FAILED \([^)]*\):\s*/, '').split(':')[0]!.trim();
  return INPUT_ERRORS.has(code) || routeInputFailure(failure).repairable;
}
