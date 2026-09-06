import { browserRsMcpLauncher } from '../core/install/browser-rs-mcp-main.ts';
import { BROWSER_RS_RELEASES, BROWSER_RS_VERSION } from '../core/install/browser-rs.ts';
import { BROWSER_RS_RECEIPT_SCHEMA } from '../core/install/browser-rs-receipt.ts';

export type BrowserRsMcpServer = {
  readonly command: string;
  readonly args: readonly string[];
};

export type BrowserRsMcpConfig = {
  readonly mcpServers: {
    readonly 'browser-rs': BrowserRsMcpServer;
  };
};

const BROWSER_RS_OWNED_RELEASES = BROWSER_RS_RELEASES.map(({ platform, arch, asset, sha256 }) => ({
  platform,
  arch,
  asset,
  sha256,
}));

export const BROWSER_RS_MCP_LAUNCHER = browserRsMcpLauncher(
  BROWSER_RS_OWNED_RELEASES,
  BROWSER_RS_VERSION,
  BROWSER_RS_RECEIPT_SCHEMA,
);

const NODE_DISCOVERY_LAUNCHER = [
  'node_path="$(command -v node 2>/dev/null || true)"',
  'if [ -z "$node_path" ]; then',
  '  for candidate in "$HOME"/.local/share/mise/installs/node/*/bin/node "$HOME"/.nvm/versions/node/*/bin/node "$HOME"/.volta/bin/node; do',
  '    if [ -x "$candidate" ]; then node_path="$candidate"; break; fi',
  '  done',
  'fi',
  '[ -n "$node_path" ] || { echo "OhMyDesign requires Node.js" >&2; exit 127; }',
  'exec "$node_path" -e "$1"',
].join('\n');

export function browserRsMcpConfig(): BrowserRsMcpConfig {
  return {
    mcpServers: {
      'browser-rs': {
        command: '/bin/sh',
        args: ['-c', NODE_DISCOVERY_LAUNCHER, 'omd-browser-rs', BROWSER_RS_MCP_LAUNCHER],
      },
    },
  };
}
