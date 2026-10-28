import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { PNG } from 'pngjs';
import { sha256 } from '../../core/ref/canonical-json.ts';

export function createPrivateDesignerCaseFixture(root: string): string {
  mkdirSync(join(root, 'media'), { recursive: true });
  const frames = [0, 1].map(atSeconds => {
    const png = new PNG({ width: 8, height: 8 });
    png.data.fill(atSeconds === 0 ? 64 : 192);
    const bytes = PNG.sync.write(png);
    const path = `media/fixture-${atSeconds}.png`;
    writeFileSync(join(root, path), bytes);
    return { path, sha256: sha256(bytes), atSeconds, width: 8, height: 8,
      role: 'synthetic-test-frame', observation: 'First-party generated test pixels, not a designer original.' };
  });
  for (const id of ['fixture-hierarchy', 'fixture-comparison']) {
    const cue = '00:00:00.000 --> 00:00:01.000\nSynthetic fixture caption, not a real creator quotation.';
    writeFileSync(join(root, `${id}.json`), JSON.stringify({
      schema: 'designer-source-case-v1', id, title: `Synthetic ${id}`,
      source: { author: `OMD test fixture ${id}`, title: 'First-party test fixture',
        url: `https://example.invalid/${id}`, language: 'en',
        videoSha256: sha256('synthetic test video identity'), captionSha256: sha256(cue) },
      quotes: [{ origin: 'original-auto-caption-cue', cue }], frames,
      analyst: { question: 'Synthetic test question.', context: 'Test-only, not design guidance.',
        observedChange: 'Synthetic fixture change.', limits: ['No real source or measured outcome.'] },
    }));
  }
  return root;
}

export function usePrivateDesignerCaseFixture(t: TestContext): string {
  const root = createPrivateDesignerCaseFixture(mkdtempSync(join(tmpdir(), 'omd-private-cases-')));
  const prior = process.env.OMD_DESIGNER_CASES_DIR;
  process.env.OMD_DESIGNER_CASES_DIR = root;
  t.after(() => {
    if (prior === undefined) delete process.env.OMD_DESIGNER_CASES_DIR;
    else process.env.OMD_DESIGNER_CASES_DIR = prior;
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}
