import type { Locale } from "../data/content";
import { getCopy } from "../data/i18n";

// Persistent nav + CTA, reachable at every scroll depth — composition.md's
// Experience spine names this as the persistent element; it is also the direct
// answer to the frame's uxFrequentAction (reach/activate the primary CTA at any
// scroll depth). Citations: supabase.com.supabase-homepage.json,
// warp.dev.warp-nav-anatomy.json.
export function Nav({ locale }: { locale: Locale }) {
  const t = getCopy(locale);
  return (
    <header className="site-nav">
      <span className="nav-word">OMD</span>
      <nav className="nav-links" aria-label="Section navigation">
        <a href="#loop">{t.nav.loop}</a>
        <a href="#evidence">{t.nav.evidence}</a>
        <a href="#skills">{t.nav.skills}</a>
      </nav>
      <a className="nav-cta" href="#install">
        {t.nav.install}
      </a>
      <a className="nav-lang" href={t.nav.langHref} lang={locale === "en" ? "ko" : "en"}>
        {t.nav.langLabel}
      </a>
    </header>
  );
}
