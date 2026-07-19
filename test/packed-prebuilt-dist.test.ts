import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { requirePrebuiltDist } from '../core/install/prebuilt-dist.ts';
import { expectedPrebuiltFiles } from '../core/install/prebuilt-payload.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stderr}`);
  return result.stdout;
}

test('Given a prepared prebuilt tree When the package is packed Then every Codex and Claude payload file is published', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'omd-packed-prebuilt-'));
  try {
    requirePrebuiltDist({
      distributionRoot: ROOT,
      sourceRoot: ROOT,
      hosts: [{ host: 'codex' }, { host: 'claude' }],
    });
    const destination = join(temporary, 'packs');
    mkdirSync(destination);
    const packed = JSON.parse(run(NPM, ['pack', '--json', '--ignore-scripts', '--pack-destination', destination])) as readonly { readonly filename: string }[];
    assert.equal(packed.length, 1, 'npm pack must create exactly one archive');
    const entry = packed[0];
    if (entry === undefined) throw new Error('npm pack must return an archive entry');
    const archive = join(destination, entry.filename);
    const entries = new Set(run('tar', ['-tzf', archive]).trim().split('\n'));

    for (const host of ['codex', 'claude'] as const) {
      const expected = expectedPrebuiltFiles(ROOT, host);
      assert.ok(expected.size > 0, `${host} must have generated payload`);
      for (const relative of expected.keys()) {
        assert.ok(entries.has(`package/dist/${host}/${relative}`), `archive must include ${host}/${relative}`);
      }
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
