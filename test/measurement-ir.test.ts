import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { extractInPage } from '../core/ir/dom.ts';
import { browserEvaluationExpression } from '../core/render/index.ts';
import type { RawIr } from '../core/types.ts';

test('IR binds only an unambiguous committed action and measures borders and Korean body/control lines', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const font = readFileSync(new URL('./fixtures/visual-measurement/assets/geometry-hangul.ttf', import.meta.url)).toString('base64');
    await page.setContent(`<style>@font-face{font-family:Test;src:url(data:font/ttf;base64,${font})}button,p,a,label,[role=tab]{display:block;font:20px/1 Test;width:60px;word-break:break-all;border:0;padding:0;margin:0}#action{margin-top:900px;border-style:solid;border-width:1px 2px 3px 4px}</style><p>본문선택유지</p><button id="action">신청서확인하기</button><a href="#">가나다라마바</a><div role="tab">가나다라마바</div><label>레이블레이블</label>`);
    await page.evaluate(() => document.fonts.ready);
    const contract = { selector: '#action', contract: { path: '.omd/composition.md', sha256: 'a'.repeat(64), field: 'frequentAction' } };
    const raw = await page.evaluate(browserEvaluationExpression(extractInPage.toString(), `4000,null,${JSON.stringify({ frequentAction: contract })}`)) as RawIr;
    const action = raw.nodes.find(n => n.name === 'button')!;
    assert.deepEqual(action.borderWidths, [1, 2, 3, 4]);
    assert.equal(raw.meta!.frequentAction!.nodeId, action.id);
    assert.equal(raw.meta!.frequentAction!.status, 'matched');
    assert.equal(raw.meta!.frequentAction!.viewportHeight, 844);
    assert.ok(raw.meta!.frequentAction!.box!.y > 844);
    for (const n of raw.nodes.filter(n => n.type === 'TEXT')) {
      assert.ok(n.textLines && n.textLines.length >= 2);
      assert.equal(n.lineCount, n.textLines.length);
      assert.equal(n.textLines.flatMap(l => l.graphemes).map(g => g.text).join(''), n.text);
    }
    assert.equal(action.textContext, 'control');
    assert.equal(raw.nodes.find(n => n.name === 'p')!.textContext, 'body');
    await page.locator('#action').evaluate(el => el.after(el.cloneNode(true)));
    const ambiguous = await page.evaluate(browserEvaluationExpression(extractInPage.toString(), `4000,null,${JSON.stringify({ frequentAction: contract })}`)) as RawIr;
    assert.equal(ambiguous.meta!.frequentAction!.status, 'ambiguous');
    assert.equal(ambiguous.meta!.frequentAction!.nodeId, null);
  } finally { await browser.close(); }
});
