import { BROWSER_RS_RELEASES, BROWSER_RS_VERSION } from '../core/install/browser-rs.ts';
import { BROWSER_RS_RECEIPT_SCHEMA } from '../core/install/browser-rs-receipt.ts';

export type BrowserRsMcpServer = {
  readonly command: 'sh';
  readonly args: readonly ['-c', string];
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

const BROWSER_RS_OWNED_VALIDATOR = [
  'const { createHash } = require("node:crypto")',
  'const { readFileSync } = require("node:fs")',
  'const { dirname, join } = require("node:path")',
  `const schemaVersion = ${JSON.stringify(BROWSER_RS_RECEIPT_SCHEMA)}`,
  `const version = ${JSON.stringify(BROWSER_RS_VERSION)}`,
  `const releases = ${JSON.stringify(BROWSER_RS_OWNED_RELEASES)}`,
  'const target = process.argv[1]',
  'const release = releases.find((candidate) => candidate.platform === process.platform && candidate.arch === process.arch)',
  'const digest = (value) => createHash("sha256").update(value).digest("hex")',
  'if (target === undefined || release === undefined) process.exit(1)',
  'try {',
  '  const receiptBytes = readFileSync(join(dirname(target), "receipt.json"))',
  '  const receipt = JSON.parse(receiptBytes.toString("utf8"))',
  '  const validRecord = typeof receipt === "object" && receipt !== null && !Array.isArray(receipt)',
  '  const validReceipt = validRecord && Object.keys(receipt).sort().join(",") === "asset,schemaVersion,sha256,version" && receipt.schemaVersion === schemaVersion && receipt.version === version && receipt.asset === release.asset && receipt.sha256 === release.sha256',
  '  const expectedReceipt = Buffer.from(JSON.stringify({ schemaVersion, version, asset: release.asset, sha256: release.sha256 }) + "\\n")',
  '  if (!validReceipt || digest(receiptBytes) !== digest(expectedReceipt) || digest(readFileSync(target)) !== release.sha256) process.exit(1)',
  '} catch { process.exit(1) }',
].join(';');

export const BROWSER_RS_MCP_LAUNCHER = [
  // Claude spawns MCP servers with a minimal PATH (often just /usr/bin:/bin) that has neither
  // ~/.local/bin (where the OMD installer symlinks browser-rs) nor a mise/nvm-managed `node`.
  // Put the OMD bin dir on PATH first so `command -v browser-rs` resolves the installed symlink
  // and we never fall to the node-dependent integrity fallback in a nodeless environment.
  'export PATH="$HOME/.local/bin:$PATH"',
  'if ! profile_dir="$(mktemp -d "${TMPDIR:-/tmp}/omd-browser-rs.XXXXXX")"; then',
  "  printf '%s\\n' 'browser-rs: unable to create temporary profile' >&2",
  '  exit 1',
  'fi',
  'child_pid=""',
  'cleanup() {',
  '  if [ -n "$child_pid" ]; then',
  '    kill "$child_pid" 2>/dev/null || true',
  '    wait "$child_pid" 2>/dev/null || true',
  '    child_pid=""',
  '  fi',
  '  rm -rf -- "$profile_dir"',
  '}',
  'trap cleanup EXIT',
  "trap 'exit 129' HUP",
  "trap 'exit 130' INT",
  "trap 'exit 143' TERM",
  'if [ -n "${OMD_BROWSER_RS_BIN:-}" ]; then',
  '  browser_bin=$OMD_BROWSER_RS_BIN',
  'elif browser_on_path="$(command -v browser-rs 2>/dev/null)"; then',
  '  browser_bin=$browser_on_path',
  'else',
  `  browser_bin="\${HOME:?HOME must be set}/.local/share/oh-my-design/browser-rs/${BROWSER_RS_VERSION}/browser-rs"`,
  `  if ! node -e ${JSON.stringify(BROWSER_RS_OWNED_VALIDATOR)} "$browser_bin"; then`,
  "    printf '%s\\n' 'browser-rs: OMD-owned binary is missing or unverified' >&2",
  '    exit 1',
  '  fi',
  'fi',
  // Reconnect stdin with `<&0`: a POSIX background job (`&`) gets /dev/null on stdin by default,
  // which silently cuts an stdio MCP server off from the client's JSON-RPC — the browser starts but
  // never receives `initialize`, so the host reports the server as failed. `<&0` keeps the client
  // pipe on stdin while preserving the background + trap-cleanup structure.
  '"$browser_bin" --headless "--user-data-dir=$profile_dir" <&0 &',
  'child_pid=$!',
  'if wait "$child_pid"; then',
  '  status=0',
  'else',
  '  status=$?',
  'fi',
  'child_pid=""',
  'exit "$status"',
].join('\n');

export function browserRsMcpConfig(): BrowserRsMcpConfig {
  return {
    mcpServers: {
      'browser-rs': {
        command: 'sh',
        args: ['-c', BROWSER_RS_MCP_LAUNCHER],
      },
    },
  };
}
