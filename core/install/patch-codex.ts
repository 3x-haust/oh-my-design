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

/**
 * Codex trusts a hook file by the sha256 of its bytes rather than by a version, recording
 * `[hooks.state."<key>"] trusted_hash = "sha256:..."` in config.toml. The key format below
 * was read off a real install:
 *   "omo@sisyphuslabs:hooks/session-start-loading-project-rules.json:session_start:0:0"
 * i.e. `<plugin>@<marketplace>:<relative hook file>:<snake_case event>:<groupIndex>:<hookIndex>`.
 * This has NOT been independently confirmed against a real Codex session for this project's
 * plugin id — `doctor` must report hook trust as unverified, never as a pass.
 */
export function trustedHashKey(
  pluginId: string,
  hookFile: string,
  event: string,
  groupIndex = 0,
  hookIndex = 0,
): string {
  const snakeEvent = event.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return `${pluginId}:${hookFile}:${snakeEvent}:${groupIndex}:${hookIndex}`;
}

/** Writes (or replaces) trusted_hash entries. Caller supplies the sha256 of each hook file. */
export function patchHookTrust(text: string, entries: { key: string; sha256: string }[]): string {
  let out = text;
  for (const { key, sha256 } of entries) {
    const header = `[hooks.state."${key}"]`;
    const block = `${header}\ntrusted_hash = "sha256:${sha256}"\n`;
    const re = new RegExp(`\\[hooks\\.state\\."${escapeRegExp(key)}"\\][^\\[]*`);
    out = re.test(out) ? out.replace(re, block) : `${out.endsWith('\n') ? out : `${out}\n`}\n${block}`;
  }
  return out;
}
