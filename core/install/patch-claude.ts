const ALLOW_PREFIX = 'Bash(omd ';
const PLUGIN_KEY = 'oh-my-design@omd';
// Identifies our hook among any others in PreToolUse: anything invoking omd.ts is ours.
const HOOK_MARKER = 'omd.ts';

export interface HookCommandEntry {
  type: 'command';
  command: string;
  timeout: number;
}

export interface HookMatcherEntry {
  matcher: string;
  hooks: HookCommandEntry[];
}

/** What Claude Code's settings.json actually loads: event -> ordered matcher entries. */
export interface HooksBlock {
  PreToolUse?: HookMatcherEntry[];
  [event: string]: HookMatcherEntry[] | undefined;
}

export interface Settings {
  permissions?: { allow?: string[]; [k: string]: unknown };
  enabledPlugins?: Record<string, boolean>;
  extraKnownMarketplaces?: Record<string, unknown>;
  hooks?: HooksBlock;
  [k: string]: unknown;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function patchSettings(settings: Settings, opts: { marketplaceUrl: string; allow?: string[] }): Settings {
  const out = clone(settings ?? {});

  out.extraKnownMarketplaces = {
    ...out.extraKnownMarketplaces,
    omd: { source: { source: 'git', url: opts.marketplaceUrl } },
  };
  out.enabledPlugins = { ...out.enabledPlugins, [PLUGIN_KEY]: true };

  const existing = out.permissions?.allow ?? [];
  const merged = [...existing];
  for (const entry of opts.allow ?? []) if (!merged.includes(entry)) merged.push(entry);
  out.permissions = { ...out.permissions, allow: merged };

  return out;
}

export function unpatchSettings(settings: Settings): Settings {
  const out = clone(settings ?? {});

  if (out.extraKnownMarketplaces) {
    delete out.extraKnownMarketplaces['omd'];
    if (Object.keys(out.extraKnownMarketplaces).length === 0) delete out.extraKnownMarketplaces;
  }
  if (out.enabledPlugins) {
    delete out.enabledPlugins[PLUGIN_KEY];
    if (Object.keys(out.enabledPlugins).length === 0) delete out.enabledPlugins;
  }
  if (out.permissions) {
    if (Array.isArray(out.permissions.allow)) {
      out.permissions.allow = out.permissions.allow.filter((a) => !a.startsWith(ALLOW_PREFIX));
      if (out.permissions.allow.length === 0) delete out.permissions.allow;
    }
    if (Object.keys(out.permissions).length === 0) delete out.permissions;
  }
  return out;
}

/**
 * Adds (or replaces) the PreToolUse hook that gates writes on frame approval. Idempotent —
 * patching twice yields the same single entry — and it never touches hooks another plugin
 * registered, on PreToolUse or any other event.
 */
export function patchHooks(settings: Settings, opts: { command: string; matcher?: string; timeout?: number }): Settings {
  const out = clone(settings ?? {});
  const hooks: HooksBlock = { ...(out.hooks ?? {}) };
  const existing = hooks.PreToolUse ?? [];
  const foreign = existing.filter((entry) => !entry.hooks.some((h) => h.command.includes(HOOK_MARKER)));
  const ours: HookMatcherEntry = {
    matcher: opts.matcher ?? 'Write|Edit',
    hooks: [{ type: 'command', command: opts.command, timeout: opts.timeout ?? 5 }],
  };
  hooks.PreToolUse = [...foreign, ours];
  out.hooks = hooks;
  return out;
}

/** Removes only the hook entries we identify as ours; restores byte-for-byte otherwise. */
export function unpatchHooks(settings: Settings): Settings {
  const out = clone(settings ?? {});
  if (!out.hooks) return out;
  const hooks: HooksBlock = { ...out.hooks };
  const existing = hooks.PreToolUse;
  if (existing) {
    const filtered = existing.filter((entry) => !entry.hooks.some((h) => h.command.includes(HOOK_MARKER)));
    if (filtered.length) hooks.PreToolUse = filtered;
    else delete hooks.PreToolUse;
  }
  if (Object.keys(hooks).length === 0) delete out.hooks;
  else out.hooks = hooks;
  return out;
}
