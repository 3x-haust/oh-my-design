import { parse as parseToml } from 'smol-toml';
import { isDeepStrictEqual } from 'node:util';

const MARKER_BEGIN = '# ── OMD BEGIN (do not edit; managed by oh-my-design) ──';
const MARKER_END = '# ── OMD END ──';
const FEATURE_KEYS = ['hooks', 'plugins', 'plugin_hooks', 'multi_agent'] as const;
const TAG = ' # OMD';
const RESTORE_FEATURE = '# OMD RESTORE FEATURE ';

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function patchConfigToml(text: string, opts: { agents?: string[] } = {}): string {
  const agents = opts.agents ?? [];

  // Rewrite rather than bail out when already patched: an upgrade that adds an agent must
  // register it, and bailing would leave it silently missing.
  const unpatched = unpatchConfigToml(text);
  const lines = unpatched.split('\n');
  // Other configuration tools may serialize TOML and remove our marker comments.
  // Existing agent tables then belong to the preserved input: do not redeclare
  // them or overwrite a user-selected config_file when reinstalling OMD.
  const current = parseToml(unpatched);
  const currentAgents = current.agents;
  const features = current.features;
  if (features !== undefined && (features === null || typeof features !== 'object' || Array.isArray(features))) throw new Error('CODEX_CONFIG_INVALID: features must be a table');
  const missing = FEATURE_KEYS.filter(key => !features || !Object.hasOwn(features, key));
  const expected = { ...current, features: { ...features as object, ...Object.fromEntries(missing.map(key => [key, true])) } };
  const matches = (candidate: string): boolean => {
    try { return isDeepStrictEqual(parseToml(candidate), expected); } catch { return false; }
  };

  const featuresIdx = lines.findIndex((l, index) => {
    if (!/^\s*\[\s*(?:features|"features"|'features')\s*\]\s*(?:#.*)?$/.test(l)) return false;
    const candidate = [...lines];
    candidate.splice(index + 1, 0, ...missing.map(k => `${k} = true${TAG}`));
    return matches(candidate.join('\n')); // A header-looking line inside a multiline string is not a table.
  });
  let inlineFeatures = '';
  let restore = '';

  if (features === undefined) {
    inlineFeatures = `[features]\n${FEATURE_KEYS.map((k) => `${k} = true`).join('\n')}\n\n`;
  } else if (missing.length && featuresIdx >= 0) {
    lines.splice(featuresIdx + 1, 0, ...missing.map(k => `${k} = true${TAG}`));
  } else if (missing.length) {
    // Dotted tables can be extended before the first table. Inline tables cannot; find an
    // insertion whose parsed semantics EXACTLY equal the intended update (including foreign data).
    const dotted = missing.map(key => `features.${key} = true${TAG}`);
    if (matches([...dotted, ...lines].join('\n'))) lines.unshift(...dotted);
    else {
      let found = false;
      for (let i = 0; i < lines.length && !found; i++) {
        const before = lines[i]!;
        for (let at = before.indexOf('}'); at >= 0 && !found; at = before.indexOf('}', at + 1)) {
          for (const prefix of [', ', ' ']) {
            const after = before.slice(0, at) + prefix + missing.map(key => `${key} = true`).join(', ') + before.slice(at);
            const candidate = [...lines]; candidate[i] = after;
            if (!matches(candidate.join('\n'))) continue;
            lines[i] = after;
            restore = `${RESTORE_FEATURE}${Buffer.from(JSON.stringify({ before, after })).toString('base64')}\n`;
            found = true; break;
          }
        }
      }
      if (!found) throw new Error('CODEX_CONFIG_INVALID: unable to safely extend features; config was not written');
    }
  }

  const agentBlock = agents
    .filter(name => !(currentAgents && typeof currentAgents === 'object' && Object.hasOwn(currentAgents, name)))
    .map((name) => `[agents.${name}]\nconfig_file = "./agents/${name}.toml"`)
    .join('\n\n');

  const output = `${lines.join('\n')}\n${MARKER_BEGIN}\n${restore}${inlineFeatures}${agentBlock}\n${MARKER_END}\n`;
  // Never let a best-effort textual patch corrupt the host's global config.
  const expectedAgents = { ...currentAgents as object } as Record<string, unknown>;
  for (const name of agents) if (!Object.hasOwn(expectedAgents, name)) expectedAgents[name] = { config_file: `./agents/${name}.toml` };
  if (!isDeepStrictEqual(parseToml(output), { ...expected, ...(agents.length ? { agents: expectedAgents } : {}) })) {
    throw new Error('CODEX_CONFIG_INVALID: patched semantics differ from the intended update; config was not written');
  }
  return output;
}

export function unpatchConfigToml(text: string): string {
  if (!text.includes(MARKER_BEGIN)) return text;
  const block = new RegExp(`\\n${escapeRegExp(MARKER_BEGIN)}[\\s\\S]*?${escapeRegExp(MARKER_END)}\\n`);
  let restored = text.replace(block, '').split('\n').filter((l) => !l.endsWith(TAG));
  for (const line of text.match(block)?.[0].split('\n') ?? []) {
    if (!line.startsWith(RESTORE_FEATURE)) continue;
    const value = JSON.parse(Buffer.from(line.slice(RESTORE_FEATURE.length), 'base64').toString('utf8')) as { before: string; after: string };
    // A user-modified inline table is preserved, not reverted to an old snapshot.
    if (typeof value.before === 'string' && typeof value.after === 'string' && restored.filter(l => l === value.after).length === 1) restored = restored.map(l => l === value.after ? value.before : l);
  }
  return restored.join('\n');
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
