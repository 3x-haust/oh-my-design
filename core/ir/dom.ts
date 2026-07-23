import type { RawIr } from '../types.ts';

/**
 * Runs inside the page. Stringified and injected, so it must stay self-contained:
 * no imports, no closure over module scope, and nothing that survives type stripping
 * as a runtime construct.
 */
export function extractInPage(maxNodes: number, selector?: string | null): RawIr {
  const toHex = (css: string): string | null => {
    const m = /^rgba?\(([^)]+)\)$/.exec(css);
    if (!m || !m[1]) return null;
    const parts = m[1].split(',').map((v) => parseFloat(v));
    const [r, g, b, a] = parts as [number, number, number, number?];
    if (a === 0) return null;
    const h = (n: number): string => Math.round(n).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
  };

  // A minifier (e.g. Vite/esbuild in a production build) shortens a 6-digit hex custom
  // property to its 3-digit form when the channels repeat (#ffffff -> #fff). The computed
  // background-color of a consumer always resolves to the full 6-digit form via toHex, so
  // comparing the two without expanding the shorthand first produces a false token mismatch.
  const expandHex = (v: string): string => {
    const m = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(v);
    return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : v;
  };

  // A design token is a CSS custom property on :root. Inverting value -> name is what
  // lets us tell `background: var(--surface)` apart from a hand-typed #FEFEFE.
  const tokenByValue: Record<string, string> = {};
  const rootStyle = getComputedStyle(document.documentElement);
  for (const prop of Array.from(rootStyle)) {
    if (!prop.startsWith('--')) continue;
    const raw = rootStyle.getPropertyValue(prop).trim();
    const value = raw.startsWith('rgb') ? toHex(raw) : expandHex(raw).toUpperCase();
    if (value && !(value in tokenByValue)) tokenByValue[prop.slice(2)] = value;
  }
  const nameOf = (value: string): string | null =>
    Object.keys(tokenByValue).find((k) => tokenByValue[k] === value) ?? null;

  // A browser's default button padding is 1px 6px. Reporting that as an off-grid defect
  // is noise: nobody wrote it. Only properties the author actually declared count as
  // design decisions.
  const authorRules: CSSStyleRule[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRule[];
    try {
      rules = Array.from(sheet.cssRules);
    } catch {
      continue;
    }
    for (const rule of rules) {
      const styleRule = rule as CSSStyleRule;
      if (styleRule.selectorText && styleRule.style) authorRules.push(styleRule);
    }
  }
  const authoredProps = (el: Element): Set<string> => {
    const props = new Set<string>();
    for (const rule of authorRules) {
      let matches = false;
      try {
        matches = el.matches(rule.selectorText);
      } catch {
        matches = false;
      }
      if (matches) for (const p of Array.from(rule.style)) props.add(p);
    }
    for (const p of Array.from((el as HTMLElement).style)) props.add(p);
    return props;
  };
  const declares = (props: Set<string>, prefix: string): boolean =>
    Array.from(props).some((p) => p.startsWith(prefix));

  const INTERACTIVE = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY']);
  const isInteractive = (el: Element): boolean =>
    INTERACTIVE.has(el.tagName) || el.getAttribute('role') === 'button' || el.hasAttribute('onclick');

  // NATIVELY_FOCUSABLE: elements whose default tabIndex is 0 (in tab order by spec).
  // <a> without href is NOT focusable by default; <a href="..."> is. We check tabIndex
  // directly rather than duplicating the browser's focusability rules.
  const NATIVELY_FOCUSABLE = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'DETAILS']);

  /**
   * Returns the focusable state for an element:
   *   true  — in the tab order (tabIndex >= 0, either natively or via tabindex attr)
   *   false — interactive but explicitly removed with tabindex="-1"
   *   null  — static element, no focusability data to record
   *
   * Cannot capture: dynamic tabindex mutations via JS, focus() calls, or CSS :focus-visible
   * ring visibility (that is measured by the interaction probe in core/render/).
   */
  const focusableState = (el: Element): boolean | null => {
    const htmlEl = el as HTMLElement;
    const tabIdx = htmlEl.tabIndex;
    if (tabIdx >= 0) return true;
    // tabIndex < 0 — only flag as false when the element is otherwise interactive,
    // so we don't record false on every non-interactive div that has no tabindex.
    if (isInteractive(el) || NATIVELY_FOCUSABLE.has(el.tagName)) return false;
    return null;
  };

  const hasOwnText = (el: Element): boolean =>
    Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0);

  // Own text only — a container's descendants speak for themselves as their own nodes.
  const ownText = (el: Element): string | undefined => {
    const joined = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return joined ? joined.slice(0, 200) : undefined;
  };

  const HEADING_RE = /^H([1-6])$/;
  const headingOf = (el: Element): number | undefined => {
    const m = HEADING_RE.exec(el.tagName);
    return m && m[1] ? Number(m[1]) : undefined;
  };

  const px = (v: string): number => Math.round(parseFloat(v) || 0);

  const pathOf = (el: Element): string => {
    const parts: string[] = [];
    for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
      const cls = n.classList[0] ? `.${n.classList[0]}` : '';
      parts.unshift(`${n.tagName.toLowerCase()}${cls}`);
    }
    return parts.join('/');
  };

  type RenderedBeat = {
    id: string;
    tag: string;
    path: string;
    box: { x: number; y: number; w: number; h: number };
    boundary: boolean;
    distinctRegions: number;
    responsiveDuplicate: boolean;
    viewport: string | null;
    ancestorBeatIds: string[];
    rendered: boolean;
  };

  const viewportRange = (value: string | null): string | null => value?.trim() || null;
  const isRendered = (el: Element): boolean => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const hasRepeatedAnatomy = (el: Element): boolean => {
    const counts = new Map<string, number>();
    for (const child of Array.from(el.children)) {
      const key = `${child.tagName}:${child.getAttribute('class') ?? ''}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.values()).some((count) => count >= 2);
  };
  const segmentBoundary = (el: Element): boolean => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const tag = el.tagName;
    const role = el.getAttribute('role') ?? '';
    const landmark = new Set(['HEADER', 'MAIN', 'NAV', 'ASIDE', 'FOOTER', 'SECTION', 'ARTICLE']).has(tag)
      || new Set(['banner', 'navigation', 'main', 'complementary', 'contentinfo', 'region', 'form', 'search']).has(role);
    const fullWidth = rect.width >= window.innerWidth * 0.9;
    const viewportSized = rect.height >= window.innerHeight * 0.75;
    const painted = style.backgroundColor !== 'rgba(0, 0, 0, 0)'
      || style.backgroundImage !== 'none'
      || Number.parseFloat(style.borderTopWidth) > 0
      || Number.parseFloat(style.borderBottomWidth) > 0;
    const separated = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom) >= 32
      || Number.parseFloat(style.marginTop) + Number.parseFloat(style.marginBottom) >= 32;
    const band = /(?:cta|install|proof|footer)/i.test(`${el.className} ${el.id} ${el.textContent ?? ''}`)
      && (fullWidth || separated);
    return landmark || hasRepeatedAnatomy(el) || fullWidth || viewportSized || painted || separated || band;
  };
  const distinctRegions = (el: Element): number => {
    const regions: Element[] = [];
    const visit = (candidate: Element): void => {
      if (candidate !== el && segmentBoundary(candidate)) {
        regions.push(candidate);
        return;
      }
      for (const child of Array.from(candidate.children)) visit(child);
    };
    for (const child of Array.from(el.children)) visit(child);
    return regions.length;
  };
  const renderedBeats: RenderedBeat[] = Array.from(document.querySelectorAll('[data-omd-beat]')).map((el) => {
    const rect = el.getBoundingClientRect();
    const ancestorBeatIds: string[] = [];
    for (let ancestor = el.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const beatId = ancestor.getAttribute('data-omd-beat');
      if (beatId) ancestorBeatIds.push(beatId.trim());
    }
    return {
      id: el.getAttribute('data-omd-beat')?.trim() ?? '',
      tag: el.tagName.toLowerCase(),
      path: pathOf(el),
      box: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      boundary: segmentBoundary(el),
      distinctRegions: distinctRegions(el),
      responsiveDuplicate: el.hasAttribute('data-omd-responsive-duplicate'),
      viewport: viewportRange(el.getAttribute('data-omd-viewport')),
      ancestorBeatIds,
      rendered: isRendered(el),
    };
  });

  const nodes: RawIr['nodes'] = [];
  const walk = (el: Element, parentId: string | null): void => {
    if (nodes.length >= maxNodes) return;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (rect.width === 0 || rect.height === 0 || cs.display === 'none' || cs.visibility === 'hidden') return;

    const id = `n${nodes.length}`;
    const bg = toHex(cs.backgroundColor);
    const radius = px(cs.borderTopLeftRadius);
    const isText = hasOwnText(el);
    const authored = authoredProps(el);

    const node: RawIr['nodes'][number] = {
      id,
      name: el.tagName.toLowerCase() + (el.classList[0] ? `.${el.classList[0]}` : ''),
      type: isText ? 'TEXT' : 'FRAME',
      path: pathOf(el),
      parent: parentId,
      box: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      children: [],
    };

    if (bg) node.fill = { value: bg, token: nameOf(bg), authored: declares(authored, 'background') };
    if (isText) {
      const color = toHex(cs.color);
      if (color) node.color = color;
    }
    if (radius > 0) node.radius = { value: radius, token: nameOf(String(radius) + 'PX') };
    // A divider: a visible rule on the top and/or bottom edge, but not a full four-side box (that is a
    // card, not a rule). Captures the "a line between every row" pattern (SLOP-DIVIDER-SPAM).
    const edge = (w: string, s: string, c: string): boolean => (parseFloat(w) || 0) > 0 && s !== 'none' && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
    const et = edge(cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor);
    const eb = edge(cs.borderBottomWidth, cs.borderBottomStyle, cs.borderBottomColor);
    const el2 = edge(cs.borderLeftWidth, cs.borderLeftStyle, cs.borderLeftColor);
    const er = edge(cs.borderRightWidth, cs.borderRightStyle, cs.borderRightColor);
    if ((et || eb) && !(el2 && er)) node.divider = true;
    if (isInteractive(el)) node.interactive = true;
    if (cs.display === 'inline') node.inline = true;

    // Focusability — tab-order membership, one DOM read per node.
    const fs = focusableState(el);
    if (fs !== null) node.focusable = fs;

    // Explicit ARIA role attribute. Only the declared attribute value — implicit roles
    // derived from tag semantics (e.g. <input> → role='textbox') are NOT captured here.
    const explicitRole = el.getAttribute('role');
    if (explicitRole) node.role = explicitRole;

    // aria-invalid: present and not "false" → field is in an error state per ARIA spec.
    const ariaInvalid = el.getAttribute('aria-invalid');
    if (ariaInvalid && ariaInvalid !== 'false') node.ariaInvalid = true;

    if (isText) {
      const family = cs.fontFamily.split(',')[0]?.trim().replace(/^["']|["']$/g, '').toLowerCase();
      if (family) node.fontFamily = family;
      node.fontSize = px(cs.fontSize);
      node.fontWeight = Number(cs.fontWeight) || 0;
      const fontSize = parseFloat(cs.fontSize) || 0;
      if (cs.lineHeight === 'normal') {
        node.lineHeight = 1.2;
      } else {
        const lh = parseFloat(cs.lineHeight);
        node.lineHeight = fontSize > 0 && !Number.isNaN(lh) ? Math.round((lh / fontSize) * 100) / 100 : 1.2;
      }
      // word-break is well-supported; always capture on text nodes.
      if (cs.wordBreak) node.wordBreak = cs.wordBreak;
      // text-wrap (CSS text-wrap shorthand) landed in Chrome 114 / Firefox 121.
      // Access via bracket notation to avoid TypeScript complaints on older lib versions.
      const tw = (cs as unknown as Record<string, string>)['textWrap'];
      if (tw) node.textWrap = tw;
    }
    // Capture overflow when non-default so SYS-TEXT-CLIP can identify clipping parents.
    // Skip 'visible' (the CSS default) to keep the IR sparse.
    if (cs.overflow && cs.overflow !== 'visible') node.overflow = cs.overflow;

    // Motion: non-zero transition-durations, non-zero animation-durations, and any named
    // animation. `transition-duration`/`transition-timing-function` and
    // `animation-duration`/`animation-timing-function` are each parallel comma-separated
    // lists per the spec. Both duration kinds land in one list — a page's motion rhythm
    // does not care whether a duration came from `transition` or `@keyframes`.
    //
    // The duration and timing-function lists are parallel by index (cycling the shorter
    // one per spec), so a timing function is only "in play" when its own transition's
    // duration survives the >0 filter — a `transition: a .3s, b 0s` must not credit the
    // page with `b`'s easing when `b` never actually transitions (F6).
    const transitionDurationsRaw = cs.transitionDuration
      .split(',')
      .map((v) => Math.round((parseFloat(v) || 0) * 1000));
    const transitionDurations = transitionDurationsRaw.filter((ms) => ms > 0);
    const timingFns = cs.transitionTimingFunction.split(',').map((v) => v.trim()).filter((v) => v.length > 0);
    const transitionEasings = timingFns.length > 0
      ? transitionDurationsRaw
        .map((ms, i) => (ms > 0 ? (timingFns[i % timingFns.length] ?? null) : null))
        .filter((v): v is string => v !== null && v.length > 0)
      : [];
    // CSS properties being transitioned, indexed parallel to transitionDurationsRaw.
    // 'all' and 'none' are excluded so MOTION-LAYOUT-THRASH can match named layout
    // properties (width/height/top/left/margin) without false-positives from 'all'.
    const transitionPropsRaw = cs.transitionProperty
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && v !== 'none' && v !== 'all');
    const transitionProperties = transitionPropsRaw.length > 0
      ? transitionDurationsRaw
        .map((ms, i) => (ms > 0 ? (transitionPropsRaw[i % transitionPropsRaw.length] ?? null) : null))
        .filter((v): v is string => v !== null && v.length > 0)
      : [];
    const animationNames = cs.animationName
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && v !== 'none');
    const animationDurations = animationNames.length > 0
      ? cs.animationDuration.split(',').map((v) => Math.round((parseFloat(v) || 0) * 1000)).filter((ms) => ms > 0)
      : [];
    const animationEasings = animationNames.length > 0
      ? cs.animationTimingFunction.split(',').map((v) => v.trim()).filter((v) => v.length > 0)
      : [];
    const allDurations = [...transitionDurations, ...animationDurations];
    const easings = Array.from(new Set([
      ...transitionEasings,
      ...animationEasings,
    ]));
    if (allDurations.length > 0 || animationNames.length > 0) {
      // Renamed from `transitionDurations` (F5): this list holds animation durations too.
      node.motion = {
        durations: allDurations,
        animationNames,
        easings,
        ...(transitionProperties.length > 0 ? { properties: transitionProperties } : {}),
      };
    }

    const text = ownText(el);
    if (text) node.text = text;
    const heading = headingOf(el);
    if (heading) node.heading = heading;
    if (cs.boxShadow && cs.boxShadow !== 'none') node.shadow = { value: cs.boxShadow, token: nameOf(cs.boxShadow) };
    if (cs.backgroundImage && cs.backgroundImage.includes('gradient')) {
      // The browser reports stops as rgb(); normalise to hex so a rule can read the colour
      // instead of parsing two notations, and so the IR stays byte-stable across engines.
      node.gradient = cs.backgroundImage.replace(/rgba?\([^)]+\)/g, (m) => toHex(m) ?? m);
    }
    // background-clip: text is the gradient-text tell. The browser may prefix this as
    // -webkit-background-clip in some engines; check both. Only set when a gradient is also
    // present — a clipped solid colour is a different pattern entirely.
    const bgClip = cs.backgroundClip || (cs as unknown as Record<string, string>)['webkitBackgroundClip'];
    if (node.gradient && (bgClip === 'text' || bgClip === '-webkit-text')) node.clipText = true;

    // backdrop-filter is the glassmorphism tell: blur + translucent surface. The browser
    // may prefix this as -webkit-backdrop-filter. Absent when 'none' or not declared.
    const bf = cs.backdropFilter || (cs as unknown as Record<string, string>)['webkitBackdropFilter'];
    if (bf && bf !== 'none') node.backdropFilter = bf;
    if (cs.textAlign === 'left' || cs.textAlign === 'center' || cs.textAlign === 'right' || cs.textAlign === 'justify') {
      node.textAlign = cs.textAlign;
    }

    const isFlex = cs.display.includes('flex') || cs.display.includes('grid');
    if (isFlex || declares(authored, 'padding')) {
      node.layout = {
        mode: cs.flexDirection === 'column' ? 'VERTICAL' : 'HORIZONTAL',
        gap: px(cs.rowGap === 'normal' ? '0' : cs.rowGap),
        padding: [px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft)],
      };
    }

    nodes.push(node);
    if (parentId) nodes.find((n) => n.id === parentId)?.children.push(id);
    for (const child of Array.from(el.children)) walk(child, id);
  };

  let root: Element = document.body;
  if (selector) {
    const found = document.querySelector(selector);
    if (!found) throw new Error(`no element matches selector: ${selector}`);
    root = found;
  }
  walk(root, null);

  // Contrast needs a real backdrop, not `transparent`. Inherit the nearest painted fill.
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const node of nodes) {
    if (node.fill) continue;
    for (let p = node.parent; p; p = byId.get(p)?.parent ?? null) {
      const ancestor = byId.get(p);
      if (ancestor?.fill) {
        node.fill = { ...ancestor.fill, inherited: true };
        break;
      }
    }
    if (!node.fill) {
      // The captured root itself may have no painted fill within the walk (it's
      // transparent, or a scoped selector cut it off from the page's own background).
      // Defaulting to white would poison contrast math with a backdrop nobody painted;
      // walk the root's live-DOM ancestors (its own parent up through documentElement,
      // same climb the whole-page path always used since root there IS document.body)
      // for the first actually-painted backgroundColor.
      let paintedHex: string | null = null;
      for (let anc: Element | null = root.parentElement; anc; anc = anc.parentElement) {
        const ancBg = toHex(getComputedStyle(anc).backgroundColor);
        if (ancBg) {
          paintedHex = ancBg;
          break;
        }
      }
      node.fill = paintedHex
        ? { value: paintedHex, token: nameOf(paintedHex), inherited: true }
        : { value: '#FFFFFF', token: null, inherited: true };
    }
  }

  // Page-level scroll/viewport dimensions. scrollHeight is the total scrollable height
  // of the document (including content below the fold). viewportHeight is the current
  // window inner height — together they let rules determine whether elements are above
  // or below the fold without needing to know the URL or viewport preset.
  //
  // Cannot capture: viewport dimensions when the page is rendered inside an iframe
  // (window.innerHeight reflects the frame, not the outer viewport). The capture is
  // correct for top-level documents, which is the only case omd check operates on.
  const scrollHeight = document.documentElement.scrollHeight;
  const viewportHeight = window.innerHeight;
  const fontFaces = Array.from(document.fonts).map((face) => ({
    family: face.family,
    status: face.status,
    style: face.style,
    weight: face.weight,
    stretch: face.stretch,
    source: null,
    glyphIdentity: null,
  }));

  return {
    meta: { source: 'dom', url: location.href, scrollHeight, viewportHeight, fontFaces, renderedBeats },
    tokens: tokenByValue,
    nodes,
  };
}
