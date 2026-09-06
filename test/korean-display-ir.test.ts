import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import { extractIr } from '../core/render/index.ts';
import type { RawNode } from '../core/types.ts';

test('rendered IR records direct-text graphemes by line for Korean display roles', async (context) => {
  if (!existsSync(chromium.executablePath())) {
    context.skip(`Chromium is not preinstalled at ${chromium.executablePath()}`);
    return;
  }

  const temporary = mkdtempSync(join(tmpdir(), 'omd-korean-display-'));
  const fixture = join(temporary, 'display.html');
  try {
    writeFileSync(fixture, `<!doctype html>
      <meta charset="utf-8">
      <style>
        h1, blockquote p, [data-omd-display] {
          width: 100px;
          font: 32px/1 sans-serif;
          word-break: keep-all;
          text-wrap: balance;
        }
      </style>
      <h1>가나다 라마바 사아자<span>후손 제외</span></h1>
      <blockquote><p>인용문 역할 확인</p></blockquote>
      <p data-omd-display>명시 역할 확인</p>
      <p>본문 선택 유지</p>
      <h2 data-omd-korean-wrap="character" style="word-break:normal;text-wrap:balance">문맥 선택 확인</h2>`);

    const raw = await extractIr(fixture, { viewport: { width: 390, height: 844 } });
    const byText = (text: string): RawNode => {
      const node = raw.nodes.find((candidate) => candidate.text === text);
      assert.ok(node, `expected IR node for ${text}`);
      return node;
    };

    const heading = byText('가나다 라마바 사아자');
    assert.equal(heading.displayText, true);
    assert.ok(heading.textLines && heading.textLines.length >= 2, 'expected wrapped direct-text line geometry');
    assert.equal(
      heading.textLines.flatMap((line) => line.graphemes).map((grapheme) => grapheme.text).join(''),
      heading.text,
      'descendant span text must not enter the heading direct-text geometry',
    );
    for (const line of heading.textLines) {
      assert.ok(line.graphemes.length > 0);
      for (const grapheme of line.graphemes) {
        assert.ok(grapheme.box.w >= 0 && grapheme.box.h > 0);
        assert.ok(Number.isFinite(grapheme.box.x) && Number.isFinite(grapheme.box.y));
      }
    }

    assert.equal(byText('인용문 역할 확인').displayText, true, 'blockquote display role must reach direct-text descendants');
    assert.equal(byText('명시 역할 확인').displayText, true);
    assert.equal(byText('본문 선택 유지').displayText, undefined, 'ordinary body text remains contextual under KLREQ');
    assert.equal(byText('문맥 선택 확인').koreanWrap, 'character');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
