import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitSenpiAgentFile } from '../adapters/senpi.ts';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { senpiSpawnArgs, senpiThinking, probeSenpiCapability } from '../adapters/senpi-runtime.ts';

test('Senpi roles launch through the isolated OMD process wrapper', () => {
  const emitted = emitSenpiAgentFile({
    name: 'omd-framer',
    description: 'Frames the work.',
    reasoning: 'high',
    instructions: 'Own only the frame.',
  });
  assert.match(emitted, /omd host senpi run --agent omd-framer --input <task\.md>/);
  assert.doesNotMatch(emitted, /spawn_agent|--model\b|gpt-|claude-|gemini-/i);
});

test('Senpi child args preserve the user model and change only effort', () => {
  const args = senpiSpawnArgs(senpiThinking('high'), 'ROLE', 'TASK');
  assert.deepEqual(args, [
    '-p', '--no-session', '--no-model-fallback', '--thinking', 'high',
    '--permission-preset', 'full-access', '--append-system-prompt', 'ROLE', 'TASK',
  ]);
  assert.equal(args.includes('--model'), false);
});

test('Senpi remains unavailable until binary and current authentication capability both pass', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-senpi-capability-'));
  const binary = join(root, 'senpi');
  writeFileSync(binary, '#!/bin/sh\nprintf "senpi fixture\\n"\n');
  chmodSync(binary, 0o755);
  try {
    assert.deepEqual(probeSenpiCapability({
      binary, home: join(root, 'missing'), env: { PI_PROVIDER: 'openai-codex' }, now: 1_000,
    }), { available: false, provider: 'openai-codex', reason: 'authentication-missing' });

    const home = join(root, 'authenticated');
    mkdirSync(home);
    writeFileSync(join(home, 'auth.json'), JSON.stringify({
      'openai-codex': { access: 'fixture-token', expires: 120_000 },
    }));
    assert.deepEqual(probeSenpiCapability({
      binary, home, env: { PI_PROVIDER: 'openai-codex' }, now: 1_000,
    }), { available: true, provider: 'openai-codex', reason: 'authenticated-provider-store' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Senpi capability probing never starts an app-server or loopback listener', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-senpi-no-loopback-'));
  const binary = join(root, 'senpi');
  const argsPath = join(root, 'args.txt');
  writeFileSync(binary, `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(argsPath)}\nprintf 'senpi fixture\\n'\n`);
  chmodSync(binary, 0o755);
  try {
    probeSenpiCapability({ binary, home: join(root, 'missing'), env: { PI_PROVIDER: 'openai-codex' } });
    assert.deepEqual(readFileSync(argsPath, 'utf8').trim().split('\n'), ['--version']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
