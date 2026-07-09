const ALLOW_PREFIX = 'Bash(omd ';

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

export function patchSettings(settings, { marketplaceUrl, allow = [] } = {}) {
  const out = clone(settings ?? {});

  out.extraKnownMarketplaces = { ...(out.extraKnownMarketplaces ?? {}) };
  out.extraKnownMarketplaces.omd = { source: { source: 'git', url: marketplaceUrl } };

  out.enabledPlugins = { ...(out.enabledPlugins ?? {}) };
  out.enabledPlugins['oh-my-design@omd'] = true;

  out.permissions = { ...(out.permissions ?? {}) };
  const existingAllow = out.permissions.allow ?? [];
  const merged = [...existingAllow];
  for (const entry of allow) {
    if (!merged.includes(entry)) merged.push(entry);
  }
  out.permissions.allow = merged;

  return out;
}

export function unpatchSettings(settings) {
  const out = clone(settings ?? {});

  if (out.extraKnownMarketplaces) {
    delete out.extraKnownMarketplaces.omd;
    if (Object.keys(out.extraKnownMarketplaces).length === 0) delete out.extraKnownMarketplaces;
  }

  if (out.enabledPlugins) {
    delete out.enabledPlugins['oh-my-design@omd'];
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
