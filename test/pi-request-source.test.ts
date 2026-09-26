import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalRouteJson } from '../core/route/adaptive-source-contract.ts';
import { capturePiRequest, readPiRequest, requestDigest } from '../extensions/omd-request-source.ts';
import { PiRequestBindings } from '../extensions/omd-request-binding.ts';
import { classifyPiWrite } from '../extensions/omd-guard.ts';

function project(t: { after(fn: () => void): void }): string {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-request-source-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  return cwd;
}

test('self-authored replacement content and matching hashes cannot forge a native input observation', t => {
  const cwd = project(t);
  capturePiRequest(cwd, 'original user app request');
  const pointer = JSON.parse(readFileSync(join(cwd, '.omd/request-source.json'), 'utf8'));
  const record = JSON.parse(readFileSync(join(cwd, pointer.record), 'utf8'));
  record.request = 'forged shorter request';
  record.requestSha256 = requestDigest(record.request);
  const bytes = `${canonicalRouteJson(record)}\n`;
  const sha256 = requestDigest(bytes);
  const path = `.omd/request-sources/sha256-${sha256}.json`;
  writeFileSync(join(cwd, path), bytes);
  writeFileSync(join(cwd, '.omd/request-source.json'), JSON.stringify({ ...pointer, record: path, sha256 }));
  assert.throws(() => readPiRequest(cwd), /source signature is invalid/);
});

test('missing persisted input cannot fall back after a host restart', t => {
  const cwd = project(t);
  capturePiRequest(cwd, 'original user app request');
  unlinkSync(join(cwd, '.omd/request-source.json'));
  assert.throws(() => readPiRequest(cwd), /captured source pointer is missing/);
});

test('Pi write classification protects input source records and activation keys', t => {
  const cwd = project(t);
  for (const path of ['.omd/request-source.json', '.omd/request-sources/sha256-x.json', '.omd/activation/project.key']) {
    assert.equal(classifyPiWrite(cwd, path).kind, 'blocked');
  }
});

test('a stale queued route command cannot materialize a superseded request', t => {
  const cwd = project(t), bindings = new PiRequestBindings();
  const args = ['route', 'classify', '--input', '.omd/.cache/route.json'];
  capturePiRequest(cwd, 'first request');
  const pinned = bindings.pin(cwd, args);
  capturePiRequest(cwd, 'second request');
  assert.throws(() => bindings.materialize(cwd, args, pinned), /queued command belongs to a stale request/);
});

test('failed native capture poisons route binding even if the host swallows the event error', t => {
  const cwd = project(t), bindings = new PiRequestBindings();
  const target = project(t);
  mkdirSync(join(cwd, '.omd'));
  symlinkSync(target, join(cwd, '.omd/request-sources'));
  const prompt = '/skill:omd-ultradesign Build a weather app.';
  bindings.receive(cwd, { source: 'interactive', text: prompt });
  assert.throws(() => bindings.activate(cwd, prompt), /source directory must not be a symlink/);
  unlinkSync(join(cwd, '.omd/request-sources'));
  assert.throws(() => bindings.pin(cwd, ['route', 'classify', '--input', 'input.json']), /OMD_REQUEST_BINDING/);
  assert.equal(existsSync(join(cwd, '.omd/route.json')), false);
});
