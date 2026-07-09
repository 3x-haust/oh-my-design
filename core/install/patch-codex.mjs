const MARKER_BEGIN = '# ── OMD BEGIN (do not edit; managed by oh-my-design) ──';
const MARKER_END = '# ── OMD END ──';
const FEATURE_KEYS = ['hooks', 'plugins', 'plugin_hooks', 'multi_agent'];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function patchConfigToml(text, { agents = [] } = {}) {
  // Rewrite rather than bail out when already patched: an upgrade that adds an
  // agent must register it, and bailing would leave it silently missing.
  const lines = unpatchConfigToml(text).split('\n');
  const featuresIdx = lines.findIndex((l) => l.trim() === '[features]');
  let inlineFeatures = '';

  if (featuresIdx === -1) {
    inlineFeatures = `[features]\n${FEATURE_KEYS.map((k) => `${k} = true`).join('\n')}\n\n`;
  } else {
    let end = lines.length;
    for (let i = featuresIdx + 1; i < lines.length; i++) {
      if (/^\[/.test(lines[i])) {
        end = i;
        break;
      }
    }
    const existingKeys = new Set();
    for (let i = featuresIdx + 1; i < end; i++) {
      const m = lines[i].match(/^(\w+)\s*=/);
      if (m) existingKeys.add(m[1]);
    }
    const missing = FEATURE_KEYS.filter((k) => !existingKeys.has(k));
    if (missing.length) {
      const insertLines = missing.map((k) => `${k} = true # OMD`);
      lines.splice(featuresIdx + 1, 0, ...insertLines);
    }
  }

  const agentBlock = agents
    .map((name) => `[agents.${name}]\nconfig_file = "./agents/${name}.toml"`)
    .join('\n\n');

  const markerBody = `${inlineFeatures}${agentBlock}`;
  const out = `${lines.join('\n')}\n${MARKER_BEGIN}\n${markerBody}\n${MARKER_END}\n`;
  return out;
}

export function unpatchConfigToml(text) {
  if (!text.includes(MARKER_BEGIN)) return text;

  const blockRe = new RegExp(`\\n${escapeRegExp(MARKER_BEGIN)}[\\s\\S]*?${escapeRegExp(MARKER_END)}\\n`);
  let out = text.replace(blockRe, '');
  out = out
    .split('\n')
    .filter((l) => !l.endsWith(' # OMD'))
    .join('\n');
  return out;
}
