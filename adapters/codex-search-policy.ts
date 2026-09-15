import { parse as parseToml } from 'smol-toml';

export type CodexDiscoverySearchPolicy = Readonly<{
  mode: 'live' | 'cached' | 'disabled' | 'inherit';
  source: 'omd-discovery-default' | 'host-argument' | 'host-config' | 'layered-host-config';
}>;

function mode(value: unknown): 'live' | 'cached' | 'disabled' {
  if (value === 'live' || value === 'cached' || value === 'disabled') return value;
  throw new Error('CODEX_SEARCH_CONFIGURATION_INVALID: web_search must be live, cached, or disabled');
}

/** Request a native tool for Scout, not a search-engine-page rendering workaround. */
export function codexDiscoverySearchPolicy(
  argv: readonly string[],
  config: Readonly<Record<string, unknown>>,
  projectHasLayeredConfig = false,
): CodexDiscoverySearchPolicy {
  const explicit: ('live' | 'cached' | 'disabled')[] = [];
  let profile = typeof config.profile === 'string';
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--') break;
    if (arg === '--search') explicit.push('live');
    if (arg === '--profile' || arg === '-p' || arg.startsWith('--profile=')) profile = true;
    const override = arg === '-c' || arg === '--config'
      ? argv[++i]
      : arg.startsWith('--config=') ? arg.slice('--config='.length)
        : arg.startsWith('-c') && arg.length > 2 ? arg.slice(2) : undefined;
    if (override !== undefined && /^web_search\s*=/.test(override)) {
      explicit.push(mode(parseToml(override).web_search));
    }
  }
  if (new Set(explicit).size > 1) throw new Error('CODEX_SEARCH_CONFIGURATION_AMBIGUOUS: conflicting web search options');
  if (explicit.length !== 0) return Object.freeze({ mode: explicit[0]!, source: 'host-argument' });
  // Do not guess Codex's trusted/project/profile layering or override it with an OMD default.
  if (profile || projectHasLayeredConfig) return Object.freeze({ mode: 'inherit', source: 'layered-host-config' });
  if (config.web_search !== undefined) return Object.freeze({ mode: mode(config.web_search), source: 'host-config' });
  return Object.freeze({ mode: 'live', source: 'omd-discovery-default' });
}

export function codexDiscoverySearchArguments(policy: CodexDiscoverySearchPolicy): readonly string[] {
  return policy.mode === 'inherit' ? [] : ['-c', `web_search=${JSON.stringify(policy.mode)}`];
}
