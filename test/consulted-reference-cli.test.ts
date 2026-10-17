import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PNG } from 'pngjs';
import { sha256 } from '../core/ref/board-artifacts.ts';
import { publishTestAdaptiveRoute } from './helpers/project-write.ts';

test('reference context CLI preserves scoped originals and refuses foreign requests without pointer mutation', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-consulted-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const route = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8'));
  publishTestAdaptiveRoute(root, route);
  const png = PNG.sync.write(new PNG({ width: 8, height: 8 }));
  writeFileSync(join(root, 'original.png'), png);
  const input = { schema: 'consulted-references-input-v2', requestSha256: sha256(route.request),
    images: [{ path: 'original.png', sha256: sha256(png), sourceUrl: 'https://example.com/portraits',
      role: 'primary', component: 'profile-card', state: 'hover' }] };
  const cli = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
  const run = () => spawnSync(process.execPath, [cli, 'ref', 'context', '--input', 'references.json', '--json'],
    { cwd: root, encoding: 'utf8', timeout: 30_000 });
  writeFileSync(join(root, 'references.json'), JSON.stringify(input));
  const accepted = run();
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(JSON.parse(accepted.stdout).authority, 'none');
  const pointerPath = join(root, '.omd/consulted-references.json');
  const pointer = readFileSync(pointerPath);
  assert.deepEqual(readFileSync(join(root, `.omd/consulted-references/images/${sha256(png)}.png`)), png);
  writeFileSync(join(root, 'references.json'), JSON.stringify({ ...input, requestSha256: '0'.repeat(64) }));
  const refused = run();
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /request scope/);
  assert.deepEqual(readFileSync(pointerPath), pointer);
});
