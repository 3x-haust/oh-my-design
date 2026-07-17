import type { Locale } from "../data/content";
import { getCopy } from "../data/i18n";

export function Footer({ locale }: { locale: Locale }) {
  const t = getCopy(locale);
  return (
    <footer className="site-footer">
      <h2>{t.footer.heading}</h2>
      <p>{t.footer.body}</p>
      <div className="footer-actions">
        <a className="cta" href="#install">
          <code>npm install -g oh-my-design</code>
        </a>
        {/* Wrapped in a non-flex span so these stay true inline text links (computed
            display: inline), not flex items blockified by .footer-actions. WCAG
            2.5.5/2.5.8 exempt inline text links from the 44x44 target minimum —
            core/rules/builtin/hit-area.yaml encodes the same exception via
            `!node.inline`. Keeping them inline also keeps the hero .cta as this
            page's one filled primary action: these two read as footnote links, not
            competing buttons (theory/ux.md UX-TWO-PRIMARIES). */}
        <span className="footer-links">
          <a href="https://github.com/anthropics/oh-my-design" target="_blank" rel="noreferrer">
            {t.footer.sourceLink}
          </a>
          <a href={t.footer.langHref} lang={locale === "en" ? "ko" : "en"} className="i18n-ko">
            {t.footer.langLink}
          </a>
        </span>
      </div>
    </footer>
  );
}
