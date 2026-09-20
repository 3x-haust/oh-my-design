import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

test('native navigation CLI cannot silently ignore an invalid direct-entry purpose', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-direct-cli-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<main><h1>Public services</h1><p>${'Inspect the service index and follow its actual public links. '.repeat(14)}</p><a href="https://domain.example/service">Service</a></main>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_TEST_CONTEXT'));
  await assert.rejects(promisify(execFile)(process.execPath, [cli, 'ref', 'navigate',
    `http://127.0.0.1:${address.port}/`, '--lane', 'domain', '--entry', 'invented-root', '--json'], { cwd, env, timeout: 30000 }),
  /REFERENCE_DISCOVERY_ENTRY_KIND/);
  assert.equal(existsSync(join(cwd, '.omd/discovery')), false);
  assert.equal(existsSync(join(cwd, '.omd/refs')), false);
});
