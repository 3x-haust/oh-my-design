import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { browserRsMcpConfig } from '../adapters/browser-mcp.ts';
import { install, type InstallOptions } from '../core/install/install.ts';
import { prebuiltRelativePath } from '../core/install/prebuilt-payload.ts';
import { browserRsTestInstallDependencies, unavailableBrowserRsDownload } from './browser-rs-test-support.ts';

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));

function claudeHost(root: string): { readonly host: 'claude'; readonly home: string } {
  return { host: 'claude', home: join(root, '.claude') };
}

function unsupportedBrowser(home: string) {
  return browserRsTestInstallDependencies({
    home,
    platform: 'win32',
    arch: 'x64',
    releases: [],
    downloader: unavailableBrowserRsDownload,
  });
}

test('Given Win32 path semantics and an unavailable browser provider When a valid prebuilt tree installs Then expected keys remain portable', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-prebuilt-win32-path-'));
  const prebuiltRoot = join(root, 'prebuilt');
  const home = join(root, 'codex-home');
  try {
    assert.equal(prebuiltRelativePath('core\\theory\\ux.md', '\\'), 'core/theory/ux.md');
    cpSync(join(PACKAGE_ROOT, 'dist'), join(prebuiltRoot, 'dist'), { recursive: true });

    await install(
      [{ host: 'codex', home }],
      { prebuiltRoot, browser: unsupportedBrowser(join(root, 'browser')) } satisfies InstallOptions,
    );

    assert.equal(existsSync(join(home, 'agents', 'omd-eye.toml')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Given missing or stale prebuilt output When install starts Then it fails before changing the host', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-prebuilt-dist-'));
  const detected = claudeHost(root);
  try {
    await assert.rejects(
      install([detected], { prebuiltRoot: root, browser: unsupportedBrowser(join(root, 'browser')) } satisfies InstallOptions),
      /prebuilt distribution is missing or stale/,
    );
    assert.equal(existsSync(join(detected.home, 'settings.json')), false);

    const stale = join(root, 'stale');
    mkdirSync(join(stale, 'dist', 'codex', 'agents'), { recursive: true });
    mkdirSync(join(stale, 'dist', 'claude'), { recursive: true });
    const staleHost = claudeHost(join(root, 'stale-home'));
    await assert.rejects(
      install([staleHost], { prebuiltRoot: stale, browser: unsupportedBrowser(join(root, 'stale-browser')) } satisfies InstallOptions),
      /prebuilt distribution is missing or stale/,
    );
    assert.equal(existsSync(join(staleHost.home, 'settings.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Given empty, truncated, malformed, or linked generated payloads When install starts Then it rejects each before host mutation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-prebuilt-invalid-'));
  const cases = [
    { name: 'empty agent', mutate: (path: string) => writeFileSync(join(path, 'dist', 'codex', 'agents', 'omd-eye.toml'), '') },
    { name: 'parseable truncated agent', mutate: (path: string) => writeFileSync(join(path, 'dist', 'codex', 'agents', 'omd-eye.toml'), 'name = "omd-eye"\n') },
    { name: 'truncated skill directory', mutate: (path: string) => rmSync(join(path, 'dist', 'codex', 'skills', 'omd-coach'), { recursive: true }) },
    { name: 'parseable truncated skill', mutate: (path: string) => writeFileSync(join(path, 'dist', 'codex', 'skills', 'omd-coach', 'SKILL.md'), '# cropped\n') },
    { name: 'malformed plugin manifest', mutate: (path: string) => writeFileSync(join(path, 'dist', 'codex', '.codex-plugin', 'plugin.json'), '{') },
    { name: 'truncated plugin manifest', mutate: (path: string) => writeFileSync(join(path, 'dist', 'codex', '.codex-plugin', 'plugin.json'), '{"name":"oh-my-design"}\n') },
    { name: 'foreign agent', mutate: (path: string) => writeFileSync(join(path, 'dist', 'codex', 'agents', 'foreign.toml'), 'name = "foreign"\n') },
    { name: 'truncated core pack', mutate: (path: string) => writeFileSync(join(path, 'dist', 'codex', 'core', 'theory', 'ux.md'), '# cropped\n') },
    { name: 'foreign core pack', mutate: (path: string) => writeFileSync(join(path, 'dist', 'codex', 'core', 'theory', 'foreign.md'), '# foreign\n') },
    {
      name: 'foreign skill',
      mutate: (path: string) => {
        const skill = join(path, 'dist', 'codex', 'skills', 'foreign');
        mkdirSync(skill, { recursive: true });
        writeFileSync(join(skill, 'SKILL.md'), '# foreign\n');
      },
    },
    { name: 'empty MCP manifest', mutate: (path: string) => writeFileSync(join(path, 'dist', 'codex', '.mcp.json'), '{}') },
    { name: 'empty MCP servers', mutate: (path: string) => writeFileSync(join(path, 'dist', 'codex', '.mcp.json'), JSON.stringify({ mcpServers: {} })) },
    { name: 'extra top level MCP key', mutate: (path: string) => writeFileSync(join(path, 'dist', 'codex', '.mcp.json'), JSON.stringify({ ...browserRsMcpConfig(), env: {} })) },
    {
      name: 'extra browser MCP key',
      mutate: (path: string) => writeFileSync(
        join(path, 'dist', 'codex', '.mcp.json'),
        JSON.stringify({ mcpServers: { 'browser-rs': { ...browserRsMcpConfig().mcpServers['browser-rs'], env: {} } } }),
      ),
    },
    {
      name: 'foreign MCP server',
      mutate: (path: string) => {
        const expected = browserRsMcpConfig().mcpServers['browser-rs'];
        writeFileSync(join(path, 'dist', 'codex', '.mcp.json'), JSON.stringify({ mcpServers: { 'browser-rs': expected, 'chrome-devtools': expected } }));
      },
    },
    {
      name: 'stale MCP launcher',
      mutate: (path: string) => writeFileSync(
        join(path, 'dist', 'codex', '.mcp.json'),
        JSON.stringify({ mcpServers: { 'browser-rs': { command: 'sh', args: ['-c', 'stale launcher'] } } }),
      ),
    },
    {
      name: 'linked MCP manifest',
      mutate: (path: string) => {
        const manifest = join(path, 'dist', 'codex', '.mcp.json');
        const target = join(path, 'valid-mcp.json');
        cpSync(manifest, target);
        rmSync(manifest);
        symlinkSync(target, manifest);
      },
    },
    {
      name: 'linked plugin directory',
      mutate: (path: string) => {
        const plugin = join(path, 'dist', 'codex', '.codex-plugin');
        const target = join(path, 'valid-plugin');
        cpSync(plugin, target, { recursive: true });
        rmSync(plugin, { recursive: true });
        symlinkSync(target, plugin, 'dir');
      },
    },
  ] as const;
  try {
    for (const item of cases) {
      const prebuiltRoot = join(root, item.name.replaceAll(' ', '-'));
      const detected = { host: 'codex' as const, home: join(root, `${item.name}-host`) };
      cpSync(join(PACKAGE_ROOT, 'dist'), join(prebuiltRoot, 'dist'), { recursive: true });
      item.mutate(prebuiltRoot);

      await assert.rejects(
        install([detected], { prebuiltRoot, browser: unsupportedBrowser(join(root, `${item.name}-browser`)) } satisfies InstallOptions),
        /prebuilt distribution is missing or stale/,
        item.name,
      );
      assert.equal(existsSync(join(detected.home, 'settings.json')), false, `${item.name} must fail before host mutation`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Given a foreign prebuilt agent When Codex install starts Then it is neither copied nor registered', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-prebuilt-foreign-agent-'));
  const prebuiltRoot = join(root, 'prebuilt');
  const home = join(root, 'codex-home');
  try {
    cpSync(join(PACKAGE_ROOT, 'dist'), join(prebuiltRoot, 'dist'), { recursive: true });
    writeFileSync(join(prebuiltRoot, 'dist', 'codex', 'agents', 'foreign.toml'), 'name = "foreign"\n');

    await assert.rejects(
      install([{ host: 'codex', home }], { prebuiltRoot, browser: unsupportedBrowser(join(root, 'browser')) } satisfies InstallOptions),
      /prebuilt distribution is missing or stale/,
    );

    assert.equal(existsSync(join(home, 'agents', 'foreign.toml')), false);
    assert.equal(existsSync(join(home, 'config.toml')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Given malformed or truncated Claude payloads When Claude install starts Then it rejects before settings mutation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-prebuilt-claude-invalid-'));
  const cases = [
    { name: 'malformed', contents: '{' },
    { name: 'truncated', contents: '{"name":"oh-my-design"}\n' },
  ] as const;
  try {
    for (const item of cases) {
      const prebuiltRoot = join(root, item.name);
      const detected = claudeHost(join(root, `${item.name}-host`));
      cpSync(join(PACKAGE_ROOT, 'dist'), join(prebuiltRoot, 'dist'), { recursive: true });
      writeFileSync(join(prebuiltRoot, 'dist', 'claude', '.claude-plugin', 'plugin.json'), item.contents);

      await assert.rejects(
        install([detected], { prebuiltRoot, browser: unsupportedBrowser(join(root, `${item.name}-browser`)) } satisfies InstallOptions),
        /prebuilt distribution is missing or stale/,
      );
      assert.equal(existsSync(join(detected.home, 'settings.json')), false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
