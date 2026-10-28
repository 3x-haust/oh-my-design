import type { MeasureNode, MeasurementDom, RGBA, TextLine } from './types.ts';
import type { Box } from '../types.ts';

/** Serialized into Chromium. No runtime imports or closed-over values. Budgets fail closed. */
export function extractMeasurementInPage(input: { selectors: string[]; tokens: string[]; paintSelectors?: string[]; targetSelectors?: string[]; maxNodes: number; maxGraphemes: number }): MeasurementDom {
  const rect = (r: DOMRect): Box => ({ x: r.x, y: r.y, w: r.width, h: r.height });
  const intersection = (a: Box, b: Box): Box | null => { const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), w = Math.min(a.x + a.w, b.x + b.w) - x, h = Math.min(a.y + a.h, b.y + b.h) - y; return w > 0 && h > 0 ? { x, y, w, h } : null; };
  const rgba = (css: string): RGBA => { const m = /^rgba?\(([^)]+)\)$/.exec(css); if (!m) return [0, 0, 0, 0]; const p = m[1]!.split(',').map(Number); return [p[0]!, p[1]!, p[2]!, p[3] ?? 1]; };
  const composite = (f: RGBA, b: RGBA): RGBA => [f[0] * f[3] + b[0] * (1 - f[3]), f[1] * f[3] + b[1] * (1 - f[3]), f[2] * f[3] + b[2] * (1 - f[3]), 1];
  const locator = (el: Element): string => {
    const parts: string[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) {
      const siblings = n.parentElement ? Array.from(n.parentElement.children).filter(s => s.tagName === n!.tagName) : [n];
      parts.unshift(`${n.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(n) + 1})`);
    }
    return `top>${parts.join('>')}`;
  };
  const controlSelector = 'button,a[href],input,select,textarea,summary,[role="button"],[role="tab"],[role="checkbox"],[role="switch"]';
  const all = Array.from(document.querySelectorAll('*'));
  const emptyPaintClip = (s: CSSStyleDeclaration): boolean => {
    if (s.clipPath === 'inset(50%)') return true;
    if (s.position !== 'absolute' && s.position !== 'fixed') return false;
    const match = /^rect\(([-\d.]+)px,\s*([-\d.]+)px,\s*([-\d.]+)px,\s*([-\d.]+)px\)$/.exec(s.clip);
    return match !== null && (Number(match[2]) <= Number(match[4]) || Number(match[3]) <= Number(match[1]));
  };
  const visible = (el: Element): boolean => { const s = getComputedStyle(el), b = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility === 'visible' && Number(s.opacity) > 0 && !emptyPaintClip(s) && b.width > 0 && b.height > 0 && (!el.parentElement || visibleAncestor(el.parentElement)); };
  const visibleAncestor = (el: Element): boolean => { for (let p: Element | null = el; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) === 0 || emptyPaintClip(s)) return false; } return true; };
  const eligible = all.filter(visible);
  const selected = eligible.slice(0, input.maxNodes);
  const ids = new Map(selected.map((el, i) => [el, `m${i}`]));
  const excluded: MeasurementDom['excluded'] = [];
  for (const el of eligible.slice(input.maxNodes)) excluded.push({ subjectId: locator(el), reason: 'node-budget' });
  let graphemeCount = 0;
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  type Glyph = { text: string; box: Box; flow: Element };
  const glyphs = (el: Element, descendants: boolean): Glyph[] => {
    const result: Glyph[] = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let child = walker.nextNode(); child; child = walker.nextNode()) {
      if (!descendants && child.parentElement !== el || !child.parentElement || !visibleAncestor(child.parentElement)) continue;
      if (child.parentElement.closest('input,select,textarea')) continue;
      const text = child.textContent ?? '';
      let flow = child.parentElement;
      while (flow !== el) {
        const display = getComputedStyle(flow).display;
        if (display !== 'contents' && !display.startsWith('inline')) break;
        flow = flow.parentElement!;
      }
      for (const part of segmenter.segment(text)) {
        if (++graphemeCount > input.maxGraphemes) { excluded.push({ subjectId: ids.get(el)!, reason: 'grapheme-budget' }); return result; }
        const range = document.createRange(); range.setStart(child, part.index); range.setEnd(child, part.index + part.segment.length);
        const r = range.getClientRects()[0]; if (r && r.height > 0) result.push({ text: part.segment, box: rect(r), flow });
      }
    }
    return result;
  };
  const lines = (glyphs: Glyph[]): TextLine[] => {
    const result: TextLine[] = [];
    for (const g of glyphs) {
      let l = result.find(l => Math.abs(l.box.y - g.box.y) < 2);
      if (!l) { l = { box: { ...g.box }, graphemes: 0, text: '' }; result.push(l); }
      const right = Math.max(l.box.x + l.box.w, g.box.x + g.box.w), bottom = Math.max(l.box.y + l.box.h, g.box.y + g.box.h);
      l.box.x = Math.min(l.box.x, g.box.x); l.box.y = Math.min(l.box.y, g.box.y); l.box.w = right - l.box.x; l.box.h = bottom - l.box.y;
      l.text += g.text; if (g.text.trim()) l.graphemes++;
    }
    return result;
  };
  const viewport = { x: 0, y: 0, w: innerWidth, h: innerHeight };
  const nodes: MeasureNode[] = selected.map((el, rank) => {
    const s = getComputedStyle(el), box = rect(el.getBoundingClientRect());
    let visibleBox = intersection(box, viewport);
    const backgrounds: RGBA[] = [], unsupported: string[] = [], clipped: MeasureNode['clipped'] = [];
    const ownGlyphs = glyphs(el, false), ownLines = lines(ownGlyphs);
    const interactive = el.matches(controlSelector), control = el.closest(controlSelector);
    const descendants = interactive ? glyphs(el, true) : [];
    const contentText = el.hasAttribute('data-omd-content-id')
      ? (interactive ? descendants : glyphs(el, true)).map(g => g.text).join('').trim() : undefined;
    const textBoxes = (interactive ? descendants : ownGlyphs).map(g => g.box);
    let verticalScrollEscape = false;
    if (interactive && textBoxes.length) {
      const labelTop = Math.min(...textBoxes.map(t => t.y)), labelBottom = Math.max(...textBoxes.map(t => t.y + t.h));
      let scrollPort: Element | null = el;
      while (scrollPort) {
        const ps = getComputedStyle(scrollPort), pb = rect(scrollPort.getBoundingClientRect());
        if (ps.transform !== 'none' || ['absolute', 'fixed', 'sticky'].includes(ps.position)) break;
        if (scrollPort !== el && /auto|scroll/.test(ps.overflowY) && scrollPort.scrollHeight > scrollPort.clientHeight + 1) {
          let visibleTop = Math.max(0, pb.y + (scrollPort as HTMLElement).clientTop);
          let visibleBottom = Math.min(innerHeight, pb.y + (scrollPort as HTMLElement).clientTop + scrollPort.clientHeight);
          let outer = scrollPort.parentElement, unsupportedRecovery = false;
          while (outer) {
            const os = getComputedStyle(outer), ob = rect(outer.getBoundingClientRect());
            unsupportedRecovery ||= os.transform !== 'none' || ['absolute', 'fixed', 'sticky'].includes(os.position);
            if (/hidden|clip|auto|scroll/.test(os.overflowY)) {
              visibleTop = Math.max(visibleTop, ob.y + (outer as HTMLElement).clientTop);
              visibleBottom = Math.min(visibleBottom, ob.y + (outer as HTMLElement).clientTop + outer.clientHeight);
            }
            outer = outer.parentElement;
          }
          const minimum = Math.max(-scrollPort.scrollTop, labelBottom - visibleBottom);
          const maximum = Math.min(scrollPort.scrollHeight - scrollPort.clientHeight - scrollPort.scrollTop, labelTop - visibleTop);
          verticalScrollEscape = !unsupportedRecovery && visibleBottom > visibleTop && minimum <= maximum + 1;
          break;
        }
        if (/hidden|clip/.test(ps.overflowY) && (labelTop < pb.y - 1 || labelBottom > pb.y + pb.h + 1)) break;
        scrollPort = scrollPort.parentElement;
      }
    }
    for (let p: Element | null = el; p; p = p.parentElement) {
      const cs = getComputedStyle(p), pb = rect(p.getBoundingClientRect());
      backgrounds.push(rgba(cs.backgroundColor));
      if (Number(cs.opacity) !== 1) unsupported.push('ancestor-opacity');
      if (cs.backgroundImage !== 'none' || cs.mixBlendMode !== 'normal' || cs.filter !== 'none' || cs.backdropFilter !== 'none' || cs.backgroundClip === 'text') unsupported.push('complex-backdrop');
      // A pure translation (or the identity a settled reveal leaves behind) moves glyphs without distorting them, and the
      // measured box already includes it; only rotation, scale or skew changes what is measured.
      const matrix = /^matrix(3d)?\(([^)]+)\)$/.exec(cs.transform);
      const values = matrix ? matrix[2]!.split(',').map(Number) : [];
      const translateOnly = matrix !== null && (matrix[1] === '3d'
        ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15].every(index => Math.abs(values[index]! - (index % 5 === 0 ? 1 : 0)) < 1e-6)
        : Math.abs(values[0]! - 1) < 1e-6 && Math.abs(values[1]!) < 1e-6 && Math.abs(values[2]!) < 1e-6 && Math.abs(values[3]! - 1) < 1e-6);
      if (cs.transform !== 'none' && !translateOnly) unsupported.push('transformed-geometry');
      if (!/^rgba?\(/.test(cs.backgroundColor) || !/^rgba?\(/.test(cs.color)) unsupported.push('unsupported-color');
      if (p === document.documentElement || p === document.body) continue;
      const clipsX = /hidden|clip|auto|scroll/.test(cs.overflowX), clipsY = /hidden|clip|auto|scroll/.test(cs.overflowY);
      if (!clipsX && !clipsY) continue;
      const cb = { x: pb.x + (p as HTMLElement).clientLeft, y: pb.y + (p as HTMLElement).clientTop, w: p.clientWidth, h: p.clientHeight };
      const clipBox = { x: clipsX ? cb.x : -1e9, y: clipsY ? cb.y : -1e9, w: clipsX ? cb.w : 2e9, h: clipsY ? cb.h : 2e9 };
      if (visibleBox) visibleBox = intersection(visibleBox, clipBox);
      const sides = new Set<string>(); let amount = 0;
      for (const t of textBoxes) {
        for (const [side, n] of [['left', clipsX ? cb.x - t.x : 0], ['right', clipsX ? t.x + t.w - cb.x - cb.w : 0], ['top', clipsY ? cb.y - t.y : 0], ['bottom', clipsY ? t.y + t.h - cb.y - cb.h : 0]] as const) if (n > 1) { sides.add(side); amount = Math.max(amount, n); }
      }
      if (sides.size) clipped.push({ ancestor: locator(p), sides: [...sides].sort(), amount, scrollEscape: [...sides].every(side => side === 'top' || side === 'bottom' ? verticalScrollEscape || /auto|scroll/.test(cs.overflowY) : /auto|scroll/.test(cs.overflowX)) });
    }
    for (const pseudo of ['::before', '::after']) { const c = getComputedStyle(el, pseudo).content; if (c !== 'none' && c !== 'normal' && c !== '""') unsupported.push('pseudo-content'); }
    if (el.shadowRoot) unsupported.push('shadow-boundary');
    if (el.matches('iframe,canvas,svg')) unsupported.push('opaque-content');
    if (el.matches('input,select,textarea')) unsupported.push('native-control-text');
    if (el.matches('option') && el.closest('select')) unsupported.push('native-option-text');
    // The focused element drawn over other text (a skip link revealed on Tab, an opened menu) is the
    // state being shown, not an accidental overlap, so it does not make the text underneath unmeasured.
    const focused = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    // Once the page is scrolled, content passing under a sticky or fixed header is ordinary scrolling, not text hidden
    // by the design (at the top of the page a header covering text is still a defect); an anchor target landing under
    // the header is its own page-basics lead.
    const pinned = (node: Element | null): boolean => { for (let p = node; p; p = p.parentElement) { const position = getComputedStyle(p).position; if (position === 'fixed' || position === 'sticky') return true; } return false; };
    for (const l of ownLines) { const b = intersection(l.box, viewport); if (!b) continue; const hit = document.elementFromPoint(b.x + b.w / 2, b.y + b.h / 2); if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && !(focused && focused.contains(hit)) && !(scrollY > 0 && pinned(hit) && !pinned(el))) unsupported.push('occluded-text'); }
    const tokens: MeasureNode['tokens'] = [];
    let token: Glyph[] = [];
    const finish = () => { if (!token.length) return; const tops: number[] = []; const assignments = token.map(g => { let i = tops.findIndex(y => Math.abs(g.box.y - y) < 2); if (i < 0) { i = tops.length; tops.push(g.box.y); } return i; }); const text = token.map(g => g.text).join(''); tokens.push({ text, lines: assignments, split: /[가-힣]/.test(text) && tops.length > 1, oneSyllableTail: tops.length > 1 && assignments.filter(i => i === tops.length - 1).length === 1 }); token = []; };
    for (const g of descendants) { if (token.length && token[token.length - 1]!.flow !== g.flow) finish(); if (/\s/.test(g.text)) finish(); else token.push(g); } finish();
    const properties = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'row-gap', 'column-gap'];
    const role = el.closest('h1,h2,h3,h4,h5,h6') ? 'heading' : control ? 'control' : el.closest('[role="status"],[role="alert"]') ? 'status' : 'body';
    const paint = (names: string[]): RGBA[] | null => {
      const colors: RGBA[] = [];
      for (const name of names) {
        if (parseFloat(s.getPropertyValue(`${name}-width`)) <= 0 || s.getPropertyValue(`${name}-style`) === 'none') continue;
        const color = s.getPropertyValue(`${name}-color`);
        if (s.getPropertyValue(`${name}-style`) !== 'solid' || !/^rgba?\(/.test(color)) return null;
        colors.push(rgba(color));
      }
      return colors.length ? colors : null;
    };
    const paints = input.paintSelectors?.some(selector => el.matches(selector))
      ? { border: s.borderImageSource !== 'none' ? null : paint(['border-top', 'border-right', 'border-bottom', 'border-left']), outline: parseFloat(s.outlineOffset) < 0 ? null : paint(['outline']) } : undefined;
    let pointerProbe: MeasureNode['pointerProbe'];
    if (visibleBox && input.targetSelectors?.some(selector => el.matches(selector))) {
      const b = visibleBox, insetX = b.w / 4, insetY = b.h / 4;
      const points = [[b.x + b.w / 2, b.y + b.h / 2], [b.x + insetX, b.y + insetY],
        [b.x + b.w - insetX, b.y + insetY], [b.x + insetX, b.y + b.h - insetY],
        [b.x + b.w - insetX, b.y + b.h - insetY]];
      pointerProbe = { samples: points.length, hits: points.filter(([x, y]) => {
        const hit = document.elementFromPoint(x!, y!);
        return hit !== null && (hit === el || el.contains(hit));
      }).length };
    }
    return { id: ids.get(el)!, locator: locator(el), parent: ids.get(el.parentElement!) ?? null, rank, tag: el.tagName.toLowerCase(), role,
      contentId: el.closest('[data-omd-content-id]')?.getAttribute('data-omd-content-id') ?? null,
      ...(contentText === undefined ? {} : { contentText }),
      textStyleId: el.closest('[data-omd-text-style]')?.getAttribute('data-omd-text-style') ?? null,
      box, visibleBox, text: ownGlyphs.map(g => g.text).join('').trim(), lines: ownLines, graphemes: ownGlyphs.filter(g => g.text.trim()).length,
      size: parseFloat(s.fontSize), weight: Number(s.fontWeight), families: s.fontFamily.split(',').map(f => f.trim().replace(/^["']|["']$/g, '').toLowerCase()), leading: s.lineHeight === 'normal' ? 'normal' : parseFloat(s.lineHeight), tracking: parseFloat(s.letterSpacing) || 0,
      direction: s.direction, writingMode: s.writingMode, language: el.closest('[lang]')?.getAttribute('lang') ?? '', textTransform: s.textTransform,
      foreground: rgba(s.color), backgrounds, background: rgba(s.backgroundColor), unsupported: [...new Set(unsupported)],
      ...(paints ? { paints } : {}),
      ...(pointerProbe ? { pointerProbe } : {}),
      control: control ? ids.get(control) ?? locator(control) : null, interactive,
      disabled: el.matches(':disabled,[aria-disabled="true"]') || control !== null
        && (control.matches(':disabled') || control.closest('[aria-disabled="true"]') !== null),
      position: s.position, tabIndex: (el as HTMLElement).tabIndex ?? -1,
      spacing: properties.map(property => ({ property, value: parseFloat(s.getPropertyValue(property)) || 0 })), display: s.display, order: Number(s.order),
      scroll: { width: el.scrollWidth, height: el.scrollHeight, clientWidth: el.clientWidth, clientHeight: el.clientHeight }, clipped, tokens,
      assignments: input.selectors.filter(selector => el.matches(selector)), media: el.matches('img,video,canvas,svg,iframe'), semanticColorRole: el.getAttribute('data-omd-color-role'), customProperties: input.tokens.map(name => ({ name, value: s.getPropertyValue(name).trim() })) };
  });
  const html = rgba(getComputedStyle(document.documentElement).backgroundColor), body = rgba(getComputedStyle(document.body).backgroundColor);
  const rootCanvas = composite(html[3] > 0 ? html : body, [255, 255, 255, 1]);
  const gridStep = 16, paintSamples: MeasurementDom['paintSamples'] = [];
  // Hit testing skips pointer-events:none, but a decorative image that lets clicks through is still
  // painted; sample what is drawn, then restore the page's own setting.
  const paintedHits = document.createElement('style');
  paintedHits.textContent = '*, *::before, *::after { pointer-events: auto !important; }';
  document.head.append(paintedHits);
  try {
    for (let y = gridStep / 2; y < innerHeight; y += gridStep) for (let x = gridStep / 2; x < innerWidth; x += gridStep) {
      const hit = document.elementFromPoint(x, y); paintSamples.push({ x, y, subjectId: hit ? ids.get(hit) ?? null : null });
    }
  } finally { paintedHits.remove(); }
  return { nodes, viewport: { innerWidth, innerHeight, clientWidth: document.documentElement.clientWidth, clientHeight: document.documentElement.clientHeight, devicePixelRatio, visualViewportScale: visualViewport?.scale ?? 1, scrollX, scrollY }, rootCanvas, overflowX: Math.max(0, document.documentElement.scrollWidth - innerWidth), eligibleNodes: eligible.length, excluded,
    fonts: { ready: document.fonts.status === 'loaded', failedFamilies: Array.from(document.fonts).filter(f => f.status === 'error').map(f => f.family) }, accessibility: [], paintSamples, gridStep };
}
