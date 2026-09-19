export function productionOwnerUsage(): string {
  return [
    'owner run — removed.',
    '',
    'The production owner used to be launched through `omd-codex owner run`, which spawned the child',
    'and signed its result. OMD now attaches to the Codex, Claude Code, or Pi session you are already',
    'in: run the production stage from there and OMD verifies the result against the route and gates.',
  ].join('\n');
}
