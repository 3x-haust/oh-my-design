import { createServer } from 'node:http';
import type { Route } from 'playwright';

export async function browseFixture() {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    const url = new URL(request.url!, 'http://fixture');
    response.setHeader('content-type', 'text/html');
    if (url.pathname === '/ui.svg') { response.setHeader('content-type', 'image/svg+xml'); response.end('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="160"><rect width="300" height="160" fill="white"/><rect x="12" y="12" width="80" height="136" fill="#2155cc"/><text x="105" y="42" font-size="18">Service dashboard</text><rect x="105" y="65" width="170" height="60" fill="#ddd"/></svg>'); return; }
    const start = '<!doctype html><html><head><title>Fixture service</title><style>body{margin:16px;font:16px Arial;background:white}a,button{display:inline-block;margin:8px;padding:8px}#component{width:360px;padding:16px;background:#eef;border:1px solid #ccc}#component h2{font-size:24px}#component p{font-size:16px}#component button{font-size:14px}</style></head><body>';
    const pages: Record<string, string> = {
      '/search': '<h1>Search results</h1><a id="gallery" href="/gallery">Dashboard gallery</a><form method="get" action="/search"><input id="search" type="search" name="q"><button id="submit" type="submit">Search</button></form>',
      '/gallery': '<h1>Gallery</h1><a id="item" href="/item">Inspect service item</a><div style="height:1100px">Scroll for related UI</div><div id="lazy"></div><script>addEventListener("scroll",()=>{document.querySelector("#lazy").innerHTML="<a id=related href=/other>More like this</a>"},{once:true})</script>',
      '/item': '<h1>Service item</h1><div id="component"><h2>Account overview</h2><p id="overview">Visible overview content</p><button id="tab" type="button" role="tab" aria-controls="details">Details</button><p id="details" hidden>Selected details persist across commands</p></div><img id="ui" src="/ui.svg" width="150" height="80"><a id="similar" href="/other">More like this</a><a id="checkout" href="/checkout">Checkout</a><script>document.querySelector("#tab").onclick=()=>{document.querySelector("#overview").hidden=true;document.querySelector("#details").hidden=false;window.clicks=(window.clicks||0)+1;document.querySelector("#details").textContent="Selected details persist across commands; invocations: "+window.clicks;sessionStorage.setItem("tab","details")}</script>',
      '/other': '<h1>Related item</h1><div id="component"><h2>Compact task list</h2><p>Related visual direction with distinct content.</p><button type="button" aria-controls="list" aria-expanded="false">Expand</button></div><a id="back-item" href="/item">Original item</a>',
      '/cookie': '<h1>Obstructed page</h1><div id="component">Private component</div><div id="cookie" style="position:fixed;inset:0;background:white;z-index:100"><h2>Cookie consent</h2><button id="accept" type="submit">Accept all</button></div>',
      '/market': '<h1>Account support</h1><p>This service provides account support for residents of the United States.</p><p hidden>South Korea account services for local residents</p>',
      '/checkout': '<h1>This endpoint must not be reached</h1>',
      '/password': '<h1>Account login</h1><input type="password" value="never-record-me">',
    };
    response.end(start + (pages[url.pathname] ?? '<h1>Not found</h1>') + '</body></html>');
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('fixture bind');
  const transport = async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.endsWith('.fixture.test')) { await route.abort(); return; }
    const response = await fetch(`http://127.0.0.1:${address.port}${url.pathname}${url.search}`, { method: route.request().method(), redirect: 'manual' });
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  };
  return { requests, transport, async close() { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } };
}
