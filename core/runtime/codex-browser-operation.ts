export const CODEX_BROWSER_ROLES = [
  'omd-scout',
  'omd-eye',
  'omd-glance',
  'omd-hand',
] as const;

export type CodexBrowserRole = (typeof CODEX_BROWSER_ROLES)[number];

const SCOUT_OPERATIONS = [
  ['ref', 'add'],
  ['ref', 'add-batch'],
  ['craft-capture'],
] as const;

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

export function isBrokeredBrowserCliOperation(
  role: string,
  operation: readonly string[],
): role is CodexBrowserRole {
  if (!CODEX_BROWSER_ROLES.includes(role as CodexBrowserRole)) return false;
  const prefixes = role === 'omd-scout' ? SCOUT_OPERATIONS : REVIEW_OPERATIONS;
  return prefixes.some((prefix) => beginsWith(operation, prefix));
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
