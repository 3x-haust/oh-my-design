export const CODEX_BROWSER_ROLES = [
  'omd-scout',
  'omd-typesetter',
  'omd-eye',
  'omd-glance',
  'omd-hand',
] as const;

export type CodexBrowserRole = (typeof CODEX_BROWSER_ROLES)[number];

const SCOUT_OPERATIONS = [
  ['ir'],
  ['render'],
  ['ref', 'add'],
  ['ref', 'add-batch'],
  ['craft-capture'],
  ['ref', 'search'],
  ['ref', 'navigate'],
] as const;

// Typesetter needs the same brokered Chromium path as Scout for isolated typography specimens,
// but must not inherit Scout's reference-capture operations or the broader review surface.
const TYPESETTER_OPERATIONS = [
  ['ir'],
  ['render'],
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

function operationPrefixes(role: string): readonly (readonly string[])[] {
  if (!CODEX_BROWSER_ROLES.includes(role as CodexBrowserRole)) return [];
  return role === 'omd-scout' ? SCOUT_OPERATIONS
    : role === 'omd-typesetter' ? TYPESETTER_OPERATIONS
      : role === 'omd-hand' ? [...REVIEW_OPERATIONS, ['slop', 'checkpoint']] : REVIEW_OPERATIONS;
}

/** Public capability prose is derived from the same allowlist as the broker, not a second grant. */
export function brokeredBrowserOperationNames(role: string): readonly string[] {
  return Object.freeze(operationPrefixes(role).map((prefix) => prefix.join(' ')));
}

export function isBrokeredBrowserCliOperation(
  role: string,
  operation: readonly string[],
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
