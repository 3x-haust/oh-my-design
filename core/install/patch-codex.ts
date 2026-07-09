const MARKER_BEGIN = '# ── OMD BEGIN (do not edit; managed by oh-my-design) ──';
const MARKER_END = '# ── OMD END ──';
const FEATURE_KEYS = ['hooks', 'plugins', 'plugin_hooks', 'multi_agent'] as const;
const TAG = ' # OMD';

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function patchConfigToml(text: string, opts: { agents?: string[] } = {}): string {
  const agents = opts.agents ?? [];

  // Rewrite rather than bail out when already patched: an upgrade that adds an agent must
  // register it, and bailing would leave it silently missing.
  const lines = unpatchConfigToml(text).split('\n');

  const featuresIdx = lines.findIndex((l) => l.trim() === '[features]');
  let inlineFeatures = '';

  if (featuresIdx === -1) {
    inlineFeatures = `[features]\n${FEATURE_KEYS.map((k) => `${k} = true`).join('\n')}\n\n`;
  } else {
    // TOML forbids redeclaring [features], so missing keys go into the existing table and
    // each added line is tagged so unpatch can strip exactly those.
    let end = lines.length;
    for (let i = featuresIdx + 1; i < lines.length; i++) {
      if (lines[i]!.startsWith('[')) {
        end = i;
        break;
      }
    }
    const existing = new Set<string>();
    for (let i = featuresIdx + 1; i < end; i++) {
      const m = /^(\w+)\s*=/.exec(lines[i]!);
      if (m?.[1]) existing.add(m[1]);
    }
    const missing = FEATURE_KEYS.filter((k) => !existing.has(k));
    if (missing.length) lines.splice(featuresIdx + 1, 0, ...missing.map((k) => `${k} = true${TAG}`));
  }

  const agentBlock = agents
    .map((name) => `[agents.${name}]\nconfig_file = "./agents/${name}.toml"`)
    .join('\n\n');

  return `${lines.join('\n')}\n${MARKER_BEGIN}\n${inlineFeatures}${agentBlock}\n${MARKER_END}\n`;
}

export function unpatchConfigToml(text: string): string {
  if (!text.includes(MARKER_BEGIN)) return text;
  const block = new RegExp(`\\n${escapeRegExp(MARKER_BEGIN)}[\\s\\S]*?${escapeRegExp(MARKER_END)}\\n`);
  return text.replace(block, '').split('\n').filter((l) => !l.endsWith(TAG)).join('\n');
}
