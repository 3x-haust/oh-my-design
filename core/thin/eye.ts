import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { COLD_EYE_QUESTION, packetImages } from './packet.ts';
import { ThinError } from './state.ts';

/**
 * The cold eye on Pi: a separate, ephemeral Pi process on the session's own provider and model, with no tools, skills,
 * extensions, context files or session history. It receives the packet images (copied to a neutral temporary folder)
 * and the one question, and nothing else. Claude Code and Codex spawn the omd-cold-eye agent on the same packet instead.
 */
export type PiHost = Readonly<{ node: string; cli: string; provider: string; model: string }>;

export function coldEyeArgs(host: PiHost, files: readonly string[]): string[] {
  return [host.cli, '-p', '--no-session', '--no-tools', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes',
    '--no-context-files', '--provider', host.provider, '--model', host.model, '--thinking', 'high',
    ...files.map(file => `@${file}`), COLD_EYE_QUESTION];
}

const TIMEOUT_MS = 15 * 60_000;

export async function runPiColdEye(host: PiHost, packet: string, signal?: AbortSignal): Promise<string> {
  const images = packetImages(packet);
  if (images.length === 0) throw new ThinError(`${packet} holds no result/ or reference/ images`);
  const neutral = realpathSync(mkdtempSync(join(tmpdir(), 'cold-eye-')));
  try {
    const files = images.map(image => {
      const target = join(neutral, basename(dirname(image)), basename(image));
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(image, target);
      return target;
    });
    return await new Promise<string>((resolve, reject) => {
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_OPTIONS'));
      const child = spawn(host.node, coldEyeArgs(host, files), { cwd: neutral, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      const stop = (): void => { child.kill('SIGTERM'); };
      const timer = setTimeout(stop, TIMEOUT_MS);
      signal?.addEventListener('abort', stop, { once: true });
      child.stdout.on('data', chunk => { stdout += String(chunk); });
      child.stderr.on('data', chunk => { stderr = `${stderr}${String(chunk)}`.slice(-4_000); });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', stop);
        const answer = stdout.trim();
        if (code === 0 && answer) resolve(answer);
        else reject(new ThinError(`the cold eye did not answer (exit ${code ?? 'signal'}): ${stderr.trim() || 'no output'}`));
      });
    });
  } finally {
    rmSync(neutral, { recursive: true, force: true });
  }
}
