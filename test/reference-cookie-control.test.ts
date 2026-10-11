import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withBrowser } from '../core/render/index.ts';
import { browserProfilePath, writeBrowserConsent } from '../core/ref/browser-consent.ts';
import { runReferenceCookieControl } from '../core/ref/cookie-control.ts';
import { clearReferenceNotices } from '../core/ref/notice-overlay.ts';
import { releaseControlOnVisibleWait } from './helpers/deferred-control.ts';

const url = 'https://reference.example/';
const html = (button = '<button id="necessary" type="button">Only necessary</button>') => `<!doctype html><html><body>
<main id="content">Actual reference content</main>
<div role="dialog" aria-modal="true" style="position:fixed;inset:0;background:white;z-index:10">
  <p>Cookie preferences</p>${button}
</div><script>
  if (localStorage.getItem('choice') === 'necessary') document.querySelector('[role=dialog]').remove();
  document.querySelector('#necessary')?.addEventListener('click', () => {
    document.cookie = 'choice=necessary;path=/'; localStorage.setItem('choice', 'necessary'); document.querySelector('[role=dialog]').remove();
  });
</script></body></html>`;

function fixture(t: import('node:test').TestContext, consent: boolean) {
  const home = mkdtempSync(join(tmpdir(), 'omd-cookie-control-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  if (consent) writeBrowserConsent('consented', home);
  return home;
}

async function serve(browser: import('playwright').Browser, body: string, deferredSelector?: string) {
  const context = await browser.newContext();
  const newPage = context.newPage.bind(context);
  context.newPage = async () => {
    const page = await newPage();
    await page.route('https://reference.example/**', route => route.fulfill({ status: 200, contentType: 'text/html', body }));
    if (deferredSelector) releaseControlOnVisibleWait(page, deferredSelector);
    return page;
  };
  return context;
}

test('a consented cookie control waits for asynchronously rendered choices before clicking', async t => {
  const home = fixture(t, true);
  const body = html().replace('<button id="necessary" type="button">Only necessary</button>', '')
    .replace("document.querySelector('#necessary')?.addEventListener", `document.addEventListener('control-ready', () => {
      document.querySelector('[role=dialog]').insertAdjacentHTML('beforeend', '<button id="necessary" type="button">Only necessary</button>');
      document.querySelector('#necessary').addEventListener`)
    .replace("});\n</script>", "});\n}, {once:true});\n</script>");
  const result = await withBrowser(async browser => {
    await serve(browser, body, '#necessary');
    const result = await runReferenceCookieControl(browser, { url, selector: '#necessary', text: 'Only necessary' }, home);
    assert.equal((await (await browser.newContext()).cookies(url))[0]?.value, 'necessary');
    return result;
  }, undefined, { reference: true, config: { mode: 'profile', profilePath: browserProfilePath(home) } });
  assert.equal(result.status, 'cleared');
});

test('consented profile clicks an exact observed cookie button and persists an unobscured page', async t => {
  const home = fixture(t, true);
  const config = { mode: 'profile' as const, profilePath: browserProfilePath(home) };
  const result = await withBrowser(async browser => {
    await serve(browser, html());
    const result = await runReferenceCookieControl(browser, { url, selector: '#necessary', text: 'Only necessary' }, home);
    assert.equal((await (await browser.newContext()).cookies(url))[0]?.value, 'necessary');
    return result;
  }, undefined, { reference: true, config });
  assert.equal(result.status, 'cleared');
  assert.equal(result.text, 'Only necessary');
  assert.equal(result.url, url);
  await withBrowser(async browser => {
    await serve(browser, html());
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      assert.equal(await page.locator('[role="dialog"]').count(), 0);
      assert.equal(await page.locator('main').innerText(), 'Actual reference content');
      assert.deepEqual(await clearReferenceNotices(page), []);
    } finally { await page.close(); }
  }, undefined, { reference: true, config });
});

test('cookie clearance checks the visible part of a main element taller than the viewport', async t => {
  const home = fixture(t, true);
  const result = await withBrowser(async browser => {
    await serve(browser, html().replace('<main id="content">', '<main id="content" style="height:2400px">'));
    return runReferenceCookieControl(browser, { url, selector: '#necessary', text: 'Only necessary' }, home);
  }, undefined, { reference: true, config: { mode: 'profile', profilePath: browserProfilePath(home) } });
  assert.equal(result.status, 'cleared');
});

test('cookie clearance accepts caller-selected content without a main tag', async t => {
  const home = fixture(t, true);
  const body = html().replace('<main id="content">', '<section id="content">').replace('</main>', '</section>');
  const input = { url, selector: '#necessary', text: 'Only necessary', contentSelector: '#content' };
  const result = await withBrowser(async browser => {
    await serve(browser, body);
    return runReferenceCookieControl(browser, input, home);
  }, undefined, { reference: true, config: { mode: 'profile', profilePath: browserProfilePath(home) } });
  assert.equal(result.status, 'cleared');
});

test('caller-selected content remains refused when hidden, empty, ambiguous or obstructed', async t => {
  const base = html().replace('<main id="content">', '<section id="content">').replace('</main>', '</section>');
  const bodies = [
    base.replace('<section id="content">', '<section id="content" style="opacity:0">'),
    base.replace('Actual reference content', ''),
    base.replace('</section>', '</section><section id="content">Other content</section>'),
    base.replace('</body>', '<div style="position:fixed;inset:0;background:white;z-index:20">Uncleared overlay</div></body>')
      .replace('z-index:10', 'z-index:30'),
  ];
  for (const body of bodies) {
    const home = fixture(t, true);
    await withBrowser(async browser => {
      await serve(browser, body);
      const input = { url, selector: '#necessary', text: 'Only necessary', contentSelector: '#content' };
      await assert.rejects(runReferenceCookieControl(browser, input, home), /NOT_CLEARED/);
    }, undefined, { reference: true, config: { mode: 'profile', profilePath: browserProfilePath(home) } });
  }
});

test('document roots cannot substitute for caller-selected reference content', async t => {
  const home = fixture(t, true);
  await withBrowser(async browser => {
    await serve(browser, html());
    const input = { url, selector: '#necessary', text: 'Only necessary', contentSelector: 'body' };
    await assert.rejects(runReferenceCookieControl(browser, input, home), /NOT_CLEARED/);
  }, undefined, { reference: true, config: { mode: 'profile', profilePath: browserProfilePath(home) } });
});

test('a tall main element remains refused when the selected cookie dialog still obscures it', async t => {
  const home = fixture(t, true);
  const body = html().replace('<main id="content">', '<main id="content" style="height:2400px">')
    .replace("localStorage.setItem('choice', 'necessary'); document.querySelector('[role=dialog]').remove();",
      "localStorage.setItem('choice', 'necessary');");
  await withBrowser(async browser => {
    await serve(browser, body);
    await assert.rejects(runReferenceCookieControl(browser, { url, selector: '#necessary', text: 'Only necessary' }, home),
      /NOT_CLEARED/);
  }, undefined, { reference: true, config: { mode: 'profile', profilePath: browserProfilePath(home) } });
});

test('a consent button with no form can reveal content from a fixed banner after clicking', async t => {
  const home = fixture(t, true);
  const config = { mode: 'profile' as const, profilePath: browserProfilePath(home) };
  const body = `<!doctype html><html><body>
    <div id="app"></div>
    <div style="position:fixed;inset:auto 0 0;height:200px;background:white;z-index:10">
      <div role="dialog" aria-label="Privacy">
        <button id="necessary" type="submit">Only necessary</button>
      </div>
    </div>
    <script>
      document.querySelector('#necessary').addEventListener('click', () => {
        document.cookie = 'choice=necessary;path=/';
        document.querySelector('#app').innerHTML = '<main>Actual reference content</main>';
        document.querySelector('[role=dialog]').parentElement.remove();
      });
    </script></body></html>`;
  const result = await withBrowser(async browser => {
    await serve(browser, body);
    return runReferenceCookieControl(browser, { url, selector: '#necessary', text: 'Only necessary' }, home);
  }, undefined, { reference: true, config });
  assert.equal(result.status, 'cleared');
});

test('unconsented profile refuses before opening a page or mutating profile', async t => {
  const home = fixture(t, false);
  let opened = false;
  await assert.rejects(runReferenceCookieControl({ newPage: async () => { opened = true; throw new Error('opened'); } } as never,
    { url, selector: '#necessary', text: 'Only necessary' }, home), /CONSENT_REQUIRED/);
  assert.equal(opened, false);
});

test('unsafe, ambiguous, and mismatched controls refuse without invoking handlers', async t => {
  const home = fixture(t, true);
  const cases = [
    ['link', '<a id="necessary" href="/login">Only necessary</a>'],
    ['submit bound to a form', '<button id="necessary" type="submit" form="external">Only necessary</button>'],
    ['form', '<form><button id="necessary" type="button">Only necessary</button></form>'],
    ['duplicate', '<button id="necessary" type="button">Only necessary</button><button id="necessary" type="button">Only necessary</button>'],
    ['modal form', '<input aria-label="Account"/><form><input type="password"/></form><button id="necessary" type="button">Only necessary</button>'],
  ];
  for (const [name, button] of cases) {
    await t.test(name!, async () => {
      await withBrowser(async browser => {
        await serve(browser, html(button));
        await assert.rejects(runReferenceCookieControl(browser, { url, selector: '#necessary', text: 'Only necessary' }, home), /TARGET_INVALID/);
        assert.equal((await (await browser.newContext()).cookies()).length, 0);
      }, undefined, { reference: true, config: { mode: 'profile', profilePath: browserProfilePath(home) } });
    });
  }
  await withBrowser(async browser => {
    await serve(browser, html());
    await assert.rejects(runReferenceCookieControl(browser, { url, selector: '#necessary', text: 'Accept all' }, home), /TARGET_INVALID/);
    assert.equal((await (await browser.newContext()).cookies()).length, 0);
  }, undefined, { reference: true, config: { mode: 'profile', profilePath: browserProfilePath(home) } });
});

test('CLI rejects unconsented profile without opening a desktop browser', t => {
  const home = fixture(t, false);
  const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'ref', 'cookie-control', '--url', url,
    '--selector', '#necessary', '--text', 'Only necessary', '--json'], {
    env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /REFERENCE_COOKIE_CONTROL_CONSENT_REQUIRED/);
});

test('CLI caller-selected content retains the consent refusal boundary', t => {
  const home = fixture(t, false);
  const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'ref', 'cookie-control', '--url', url,
    '--selector', '#necessary', '--text', 'Only necessary', '--content-selector', '#content', '--json'], {
    env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /REFERENCE_COOKIE_CONTROL_CONSENT_REQUIRED/);
});

test('a cross-origin write attempt is blocked and cannot produce a successful receipt', async t => {
  const home = fixture(t, true);
  await withBrowser(async browser => {
    const body = html().replace("document.cookie = 'choice=necessary;path=/';", "fetch('https://other.example/collect', {method:'POST',mode:'no-cors'}); document.cookie = 'choice=necessary;path=/';");
    await serve(browser, body);
    await assert.rejects(runReferenceCookieControl(browser, { url, selector: '#necessary', text: 'Only necessary' }, home), /DOCUMENT_CHANGED/);
  }, undefined, { reference: true, config: { mode: 'profile', profilePath: browserProfilePath(home) } });
});

test('a control that attempts navigation cannot produce a successful cookie receipt', async t => {
  const home = fixture(t, true);
  await withBrowser(async browser => {
    const body = html().replace("document.cookie = 'choice=necessary;path=/';", "location.href = '/login'; document.cookie = 'choice=necessary;path=/';");
    await serve(browser, body);
    await assert.rejects(runReferenceCookieControl(browser, { url, selector: '#necessary', text: 'Only necessary' }, home), /DOCUMENT_CHANGED/);
  }, undefined, { reference: true, config: { mode: 'profile', profilePath: browserProfilePath(home) } });
});
