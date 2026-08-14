import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** Senpi's `--thinking` levels, mapped from the role's declared reasoning tier. */
const THINKING: Readonly<Record<string, string>> = {
  high: 'high',
  medium: 'medium',
  low: 'low',
};

export function senpiThinking(reasoning: string | undefined): string {
  return THINKING[reasoning ?? 'medium'] ?? 'medium';
}

/**
 * Build a child launch without ever selecting a concrete model. `--no-model-fallback` keeps the
 * user's active Senpi model immutable; only the role's effort tier changes.
 */
export function senpiSpawnArgs(thinking: string, rolePrompt: string, task: string): string[] {
  return [
    '-p',
    '--no-session',
    '--no-model-fallback',
    '--thinking',
    thinking,
    '--permission-preset',
    'full-access',
    '--append-system-prompt',
    rolePrompt,
    task,
  ];
}

export type SenpiCapability = Readonly<{
  available: boolean;
  provider?: string;
  reason: string;
}>;

const PROVIDER_KEYS: Readonly<Record<string, readonly string[]>> = {
  anthropic: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_OAUTH_TOKEN'],
  openai: ['OPENAI_API_KEY'],
  google: ['GEMINI_API_KEY'],
  'openai-codex': [],
};

/**
 * Senpi remains installable, but it is never selected merely because a binary exists. The wrapper
 * requires a runnable binary plus current provider authentication and does not start an app-server
 * or bind a loopback port while probing.
 */
export function probeSenpiCapability(input: Readonly<{
  env?: NodeJS.ProcessEnv;
  binary?: string;
  home?: string;
  now?: number;
}> = {}): SenpiCapability {
  const env = input.env ?? process.env;
  const binary = input.binary ?? 'senpi';
  const version = spawnSync(binary, ['--version'], { encoding: 'utf8', env, timeout: 5_000 });
  if (version.error !== undefined || version.status !== 0 || version.signal !== null) {
    return { available: false, reason: 'binary-unavailable' };
  }
  const provider = env.PI_PROVIDER;
  if (provider === undefined || provider.trim() === '') return { available: false, reason: 'active-provider-unknown' };
  const keys = PROVIDER_KEYS[provider] ?? [`${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`];
  if (keys.some((key) => typeof env[key] === 'string' && env[key]!.trim() !== '')) {
    return { available: true, provider, reason: 'authenticated-environment' };
  }
  const home = resolve(input.home ?? env.SENPI_CODING_AGENT_DIR ?? join(homedir(), '.senpi', 'agent'));
  const authPath = join(home, 'auth.json');
  if (!existsSync(authPath)) return { available: false, provider, reason: 'authentication-missing' };
  try {
    const stat = lstatSync(authPath);
    if (!stat.isFile() || stat.isSymbolicLink()) return { available: false, provider, reason: 'authentication-ambiguous' };
    const auth = JSON.parse(readFileSync(authPath, 'utf8')) as Record<string, unknown>;
    const selected = auth[provider];
    if (typeof selected !== 'object' || selected === null || Array.isArray(selected)) return { available: false, provider, reason: 'provider-authentication-missing' };
    const value = selected as Record<string, unknown>;
    const expires = value.expires;
    const credential = value.access ?? value.apiKey ?? value.token;
    if (typeof credential !== 'string' || credential.trim() === '') return { available: false, provider, reason: 'provider-authentication-missing' };
    if (typeof expires === 'number' && (!Number.isSafeInteger(expires) || expires <= (input.now ?? Date.now()) + 60_000)) {
      return { available: false, provider, reason: 'provider-authentication-expired' };
    }
    return { available: true, provider, reason: 'authenticated-provider-store' };
  } catch {
    return { available: false, provider, reason: 'authentication-unreadable' };
  }
}

export function requireSenpiCapability(input: Parameters<typeof probeSenpiCapability>[0] = {}): SenpiCapability {
  const capability = probeSenpiCapability(input);
  if (!capability.available) throw new Error(`SENPI_CAPABILITY_UNAVAILABLE: ${capability.reason}`);
  return capability;
}
