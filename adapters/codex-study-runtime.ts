import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

export const CODEX_STUDY_ROLE = 'omd-study' as const;
const STUDY_DIRECTORY = /^\.omd\/\.cache\/studies\/study-[A-Za-z0-9]{6}$/;

export function isCodexStudyDirectory(projectRoot: string, value: unknown): value is string {
  if (typeof value !== 'string' || !STUDY_DIRECTORY.test(value)) return false;
  try {
    let path = realpathSync(projectRoot);
    for (const part of value.split('/')) {
      path = join(path, part);
      const stat = lstatSync(path);
      if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path) return false;
    }
    return true;
  } catch { return false; }
}

/** Process completion alone does not establish that the promised study entry was produced. */
export function codexStudyEntryError(projectRoot: string, directory: unknown): string | undefined {
  if (!isCodexStudyDirectory(projectRoot, directory)) return 'STUDY_ENTRY_INVALID: invalid host study directory';
  const entry = join(realpathSync(projectRoot), directory, 'index.html');
  try {
    const before = lstatSync(entry);
    if (!before.isFile() || before.isSymbolicLink() || realpathSync(entry) !== entry) {
      return 'STUDY_ENTRY_INVALID: index.html must be a regular file inside the host study directory';
    }
    const content = readFileSync(entry, 'utf8');
    const after = lstatSync(entry);
    if (!after.isFile() || after.isSymbolicLink() || before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      return 'STUDY_ENTRY_INVALID: index.html changed during output validation';
    }
    if (content.trim() === '') return 'STUDY_ENTRY_INVALID: index.html is empty';
    return undefined;
  } catch {
    return 'STUDY_ENTRY_MISSING: readable index.html was not produced';
  }
}

/** No inherited broad roots, temporary roots, remote tools, or delegated work for a source-only study. */
export function codexStudyRestrictions(mcpServerNames: readonly string[]): readonly string[] {
  if (mcpServerNames.some((name) => !/^[A-Za-z0-9_-]+$/.test(name))) {
    throw new Error('STUDY_CONFIGURATION_REJECTED: unsafe inherited MCP server name');
  }
  return [
    '-c', 'approval_policy="never"',
    '-c', 'sandbox_workspace_write.writable_roots=[]',
    '-c', 'sandbox_workspace_write.exclude_slash_tmp=true',
    '-c', 'sandbox_workspace_write.exclude_tmpdir_env_var=true',
    '-c', 'sandbox_workspace_write.network_access=false',
    '--disable', 'apps', '--disable', 'plugins', '--disable', 'multi_agent',
    '--disable', 'image_generation', '--disable', 'standalone_web_search',
    '--disable', 'skill_search', '-c', 'web_search="disabled"',
    ...mcpServerNames.flatMap((name) => ['-c', `mcp_servers.${name}.enabled=false`]),
  ];
}
