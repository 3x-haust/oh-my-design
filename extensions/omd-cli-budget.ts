// Finishing runs a first-render review, browser evaluation and the final review (one long turn plus a possible
// correction turn) back to back. Commands that wait on an isolated reviewer get twice the ordinary budget: a slow
// model turn otherwise reruns the whole review.
const REVIEWED = new Set(['first-render check', 'first-render review', 'taste graphic', 'taste compare', 'ref direction-review']);
export const omdCliBudgetMs = (args: readonly string[]): number =>
  args[0] === 'browser' && ['setup', 'login'].includes(args[1] ?? '') ? 660_000
    : args[0] === 'lifecycle' && args[1] === 'finish' ? 2_700_000
    : REVIEWED.has(`${args[0] ?? ''} ${args[1] ?? ''}`) ? 1_200_000
    : args[0] === 'ref' && ['advance', 'navigate', 'add', 'add-batch', 'discover-batch', 'search', 'leads'].includes(args[1] ?? '')
    ? 300_000 : 600_000;
