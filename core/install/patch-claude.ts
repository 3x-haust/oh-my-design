const ALLOW_PREFIX = 'Bash(omd ';
const PLUGIN_KEY = 'oh-my-design@omd';

export interface Settings {
  permissions?: { allow?: string[]; [k: string]: unknown };
  enabledPlugins?: Record<string, boolean>;
  extraKnownMarketplaces?: Record<string, unknown>;
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
