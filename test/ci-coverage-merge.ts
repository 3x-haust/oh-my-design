import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeCoverage } from '../scripts/ci/merge-coverage.ts';

test('merges overlapping LCOV identities before checking full-suite thresholds', () => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-coverage-'));
  try {
    const first = join(directory, 'first.info');
    const second = join(directory, 'second.info');
    writeFileSync(first, 'TN:\nSF:core/a.ts\nFN:1,a\nFNDA:1,a\nFNF:1\nFNH:1\nBRDA:1,0,0,1\nBRDA:2,1,0,0\nBRF:2\nBRH:1\nDA:1,1\nDA:2,0\nLF:2\nLH:1\nend_of_record\n');
    writeFileSync(second, 'TN:\nSF:core/a.ts\nFN:1,a\nFNDA:1,a\nFNF:1\nFNH:1\nBRDA:1,0,0,0\nBRDA:2,1,0,1\nBRF:2\nBRH:1\nDA:1,0\nDA:2,1\nLF:2\nLH:1\nend_of_record\n');
    const { lcov, summary } = mergeCoverage([first, second]);
    assert.match(lcov, /FNDA:2,a\nFNH:1\nFNF:1\nBRDA:1,0,0,1\nBRDA:2,1,0,1\nBRH:2\nBRF:2\nDA:1,1\nDA:2,1\nLH:2\nLF:2/);
    assert.match(summary, /\| Lines \| 2 \| 2 \| 100\.00%/);
    assert.match(summary, /\| Branches \| 2 \| 2 \| 100\.00%/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('fails closed if combined coverage is below a threshold or a shard is missing', () => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-coverage-'));
  try {
    const report = join(directory, 'report.info');
    writeFileSync(report, 'TN:\nSF:core/a.ts\nFN:1,a\nFNDA:1,a\nFNF:1\nFNH:1\nBRDA:1,0,0,1\nBRDA:2,1,0,0\nBRF:2\nBRH:1\nDA:1,1\nDA:2,1\nLF:2\nLH:2\nend_of_record\n');
    assert.throws(() => mergeCoverage([report]), /Branches coverage 50\.00% is below 72%/);
    assert.throws(() => mergeCoverage([report, join(directory, 'missing.info')]), /ENOENT/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
