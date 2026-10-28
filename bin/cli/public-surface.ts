export const PUBLIC_COMMANDS = [
  '--version', 'help', 'lifecycle', 'route', 'schema', 'stage', 'guard', 'ref',
  'feedback', 'language', 'ai-judgment', 'locale', 'first-render', 'render', 'record', 'check',
  'probe', 'slop', 'lighthouse', 'measure', 'figma', 'target', 'taste', 'scaffold', 'brief', 'imagegen', 'pack', 'doctor',
  'browser', 'coach', 'learn', 'usage', 'hash',
] as const;

export type PublicCommand = typeof PUBLIC_COMMANDS[number];

export const PUBLIC_SCHEMA_NAMES = new Set([
  'trusted-lifecycle-manifest',
  'route-input',
  'product-route-input',
  'reference-research',
  'reference-capture-preparation',
  'reference-search-leads',
  'reference-search',
  'reference-discovery-batch',
  'design-language-input',
  'design-feedback-input',
  'locale-contract',
  'locale-design-context',
  'cultural-design-profile',
  'design-brief',
]);

export const PUBLIC_REF_COMMANDS = [
  'browse', 'tidy', 'context', 'navigate', 'control-observe', 'cookie-control',
  'discover-plan', 'discover-batch', 'work-next', 'advance', 'exclude',
  'direction-review', 'research-set', 'research-check', 'search', 'leads', 'add',
  'add-batch', 'list', 'show', 'principles', 'audit', 'import-image',
] as const;
