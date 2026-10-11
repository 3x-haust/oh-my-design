import { parse } from 'parse5';
import { publicDiscoveryUrl } from './discovery-record.ts';
import type { ObservedSearchResult } from './search-result.ts';

type Node = { nodeName: string; value?: string; attrs?: Array<{ name: string; value: string }>; childNodes?: Node[] };
const excluded = new Set(['script', 'style', 'template', 'noscript', 'svg', 'footer', 'nav', 'header']);
const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

export function extractStaticHtml(html: string, url: string): Readonly<{
  observedText: string; taskText: string; links: string[]; linkLabels: ObservedSearchResult[]; shell: boolean;
}> {
  const document = parse(html) as Node;
  const all: string[] = []; const task: string[] = []; const labels: ObservedSearchResult[] = [];
  let base = url; let shell = false;
  const visit = (node: Node, chrome = false): string => {
    const tag = node.nodeName.toLowerCase();
    const attrs = Object.fromEntries((node.attrs ?? []).map(attr => [attr.name.toLowerCase(), attr.value]));
    if (tag === 'base' && attrs.href) {
      try { base = publicDiscoveryUrl(new URL(attrs.href, url).href); } catch { /* ignore unsafe base */ }
    }
    if (tag === 'script' || attrs.id === '__next' || /(?:^|\s)(?:app|root)(?:\s|$)/i.test(attrs.id ?? '') || /loading/i.test(attrs.class ?? '')) shell = true;
    if (attrs.hidden !== undefined || attrs['aria-hidden'] === 'true' || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attrs.style ?? '') || excluded.has(tag)) return '';
    if (tag === '#text') {
      const value = clean(node.value ?? '');
      if (value) { all.push(value); if (!chrome) task.push(value); }
      return value;
    }
    const childChrome = chrome || ['aside', 'form'].includes(tag);
    const content = clean((node.childNodes ?? []).map(child => visit(child, childChrome)).join(' '));
    if (tag === 'a' && attrs.href && content && labels.length < 2000) {
      try {
        const href = publicDiscoveryUrl(new URL(attrs.href, base).href.split('#')[0]!);
        if (!labels.some(label => label.url === href)) labels.push({ url: href, text: content.slice(0, 4096) });
      } catch { /* non-public link */ }
    }
    return content;
  };
  visit(document);
  return { observedText: clean(all.join(' ')).slice(0, 16384), taskText: clean(task.join(' ')).slice(0, 16384),
    links: labels.map(label => label.url), linkLabels: labels, shell };
}
