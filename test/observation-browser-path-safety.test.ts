import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { BrowserObservationDecisionLinkError } from '../core/runtime/browser-observation.ts';
import { writeObservationV2 } from '../core/runtime/observation.ts';
import { nodeStableProjectFileSystem, readStableProjectFile, StableProjectFileReadError } from '../core/runtime/stable-project-file.ts';
import { browserFixturePng, writeBrowserDecisionFixture } from './helpers/browser-observation-decision-links.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

test('observation writer rejects a browser capture through an outside symlink ancestor before persistence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-browser-writer-path-'));
  const outside = mkdtempSync(join(tmpdir(), 'omd-browser-writer-outside-'));
  try {
    mkdirSync(join(directory, '.omd'), { recursive: true });
    const buildSha256 = sha256('current-build');
    const buildBytes = Buffer.from(`${JSON.stringify({ buildSha256 })}\n`);
    writeFileSync(join(directory, '.omd', 'build.json'), buildBytes);
    const fixture = writeBrowserDecisionFixture(directory);
    const capture = browserFixturePng(390, 844);
    writeFileSync(join(outside, 'hero.png'), capture);
    symlinkSync(outside, join(directory, '.omd', 'captures'));
    const evidence = fixture.evidence([{
      testedState: 'symlink-ancestor', path: '.omd/captures/hero.png', sha256: sha256(capture), viewport: { width: 390, height: 844 },
    }]);

    assert.throws(
      () => writeObservationV2(directory, {
        currentArtifact: { path: '.omd/build.json', sha256: sha256(buildBytes) }, buildSha256,
        observedAt: '2026-01-01T00:00:00.000Z', evidence,
      }, createTestProjectWriteAdapter(directory)),
      (error: unknown) => error instanceof BrowserObservationDecisionLinkError && error.code === 'INVALID_OBSERVATION_ARTIFACT',
    );
    assert.equal(existsSync(join(directory, '.omd', 'observation-v2.json')), false);
    assert.equal(existsSync(join(directory, '.omd', 'observation-v2')), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('stable project reads reject a deterministic ancestor swap during descriptor-backed reading', () => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-stable-project-race-'));
  try {
    const ancestor = join(directory, 'captures');
    const displaced = join(directory, 'captures-before-swap');
    mkdirSync(join(ancestor, 'nested'), { recursive: true });
    const path = join(ancestor, 'nested', 'hero.txt');
    writeFileSync(path, 'measured');
    let swapped = false;
    const fs = {
      ...nodeStableProjectFileSystem(),
      readFile(descriptor: string | number): Buffer {
        const bytes = readFileSync(descriptor);
        if (!swapped) {
          swapped = true;
          renameSync(ancestor, displaced);
          mkdirSync(ancestor);
        }
        return bytes;
      },
    };
    assert.throws(
      () => readStableProjectFile({ root: directory, path, label: 'racing capture', fs }),
      (error: unknown) => error instanceof StableProjectFileReadError && /stably|changed/.test(error.message),
    );
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
