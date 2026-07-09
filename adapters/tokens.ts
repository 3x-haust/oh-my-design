import toolMap from './tool-map.json' with { type: 'json' };
import type { Host } from '../core/types.ts';

interface ToolMap {
  fileWrite: Record<Host, string>;
  pluginRoot: Record<Host, string>;
  model: { high: Record<Host, string>; medium: Record<Host, string> };
}

const map = toolMap as unknown as ToolMap;

export function substituter(host: Host): (value: string) => string {
  const tokens: Record<string, string> = {
    '@fileWrite': map.fileWrite[host],
    '@pluginRoot': map.pluginRoot[host],
    '@high': map.model.high[host],
    '@medium': map.model.medium[host],
  };
  return (value: string): string => {
    let out = value;
    for (const [token, replacement] of Object.entries(tokens)) out = out.split(token).join(replacement);
    return out;
  };
}
