import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Host } from '../types.ts';

export interface Detected {
  host: Host;
  home: string;
  version?: string;
}

export interface DetectOpts {
  /** Override for `os.homedir()`, so detection is testable without touching the real home. */
  homedir?: string;
}

/**
 * Global, not per-project: a host is "present" when its config directory exists on disk,
 * honouring the env vars each host itself uses to relocate that directory.
 */
export function detectHosts(env: NodeJS.ProcessEnv = process.env, opts: DetectOpts = {}): Detected[] {
  const home = opts.homedir ?? homedir();
  const detected: Detected[] = [];

  const claudeHome = env['CLAUDE_CONFIG_DIR'] || join(home, '.claude');
  if (existsSync(claudeHome)) detected.push({ host: 'claude', home: claudeHome });

  const codexHome = env['CODEX_HOME'] || join(home, '.codex');
  if (existsSync(codexHome)) detected.push({ host: 'codex', home: codexHome });

  return detected;
}
