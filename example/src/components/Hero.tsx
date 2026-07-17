import { useReveal } from "../hooks/useReveal";
import type { Locale } from "../data/content";
import { getCopy } from "../data/i18n";

// Copy verbatim from .omd/copy-deck.md Hero section. Focal hierarchy per
// composition.md: hero carries ~90% of first-viewport visual mass, no diagram.
export function Hero({ locale }: { locale: Locale }) {
  const t = getCopy(locale);
  // Gated on document.fonts.ready, not an immediate reveal — see useReveal.ts.
  const ref = useReveal<HTMLElement>(0.2, true);

  return (
    <section className="hero stagger" ref={ref} id="top">
      <h1>{t.hero.title}</h1>
      <p className="hero-body">{t.hero.body}</p>
      <a className="cta" href="#install">
        {t.hero.ctaPrefix}
        <code>npm install -g oh-my-design</code>
      </a>
    </section>
  );
}
