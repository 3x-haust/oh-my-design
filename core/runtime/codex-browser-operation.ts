export const CODEX_BROWSER_ROLES = ['omd-eye', 'omd-hand'] as const;

export type CodexBrowserRole = (typeof CODEX_BROWSER_ROLES)[number];

const REVIEW_OPERATIONS = [
  ['ir'],
  ['render'],
  ['probe'],
  ['flow-probe'],
  ['check'],
  ['craft-capture'],
  ['craft-usage'],
  ['no-js'],
  ['award', 'score'],
  ['complete', 'check'],
  ['tokens', 'check'],
  ['target', 'diff'],
  ['figma', 'diff'],
  ['evidence', 'static-capture'],
  ['evidence', 'motion-capture'],
] as const;

function beginsWith(operation: readonly string[], prefix: readonly string[]): boolean {
  return prefix.every((part, index) => operation[index] === part);
}

function operationPrefixes(role: string): readonly (readonly string[])[] {
  if (!CODEX_BROWSER_ROLES.includes(role as CodexBrowserRole)) return [];
  return role === 'omd-hand'
    ? [...REVIEW_OPERATIONS, ['measure'], ['first-render', 'check'], ['slop', 'checkpoint']]
    : REVIEW_OPERATIONS;
}

/** Public capability prose is derived from the same allowlist as the broker, not a second grant. */
export function brokeredBrowserOperationNames(role: string, _roleMode?: string): readonly string[] {
  return Object.freeze(operationPrefixes(role).map((prefix) => prefix.join(' ')));
}

export function isBrokeredBrowserCliOperation(
  role: string,
  operation: readonly string[],
  _roleMode?: string,
): role is CodexBrowserRole {
  if (!CODEX_BROWSER_ROLES.includes(role as CodexBrowserRole)) return false;
  return operationPrefixes(role).some((prefix) => beginsWith(operation, prefix));
}

export function codexBrowserRoleFromEnvironment(
  env: NodeJS.ProcessEnv,
): CodexBrowserRole | undefined {
  const role = env.OMD_PRODUCTION_OWNER_ROLE === 'omd-hand'
    ? 'omd-hand'
    : env.OMD_NON_PRODUCTION_ROLE;
  return role !== undefined && CODEX_BROWSER_ROLES.includes(role as CodexBrowserRole)
    ? role as CodexBrowserRole
    : undefined;
}
