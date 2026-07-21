import { useEffect, useRef } from "react";

/**
 * Adds `is-visible` to an element once it crosses the viewport threshold, then
 * disconnects — entrance animations fire once on scroll-into-view, they never
 * replay (choreography rule). Honors prefers-reduced-motion implicitly: the CSS
 * in index.css strips the transition/opacity effect entirely under that media
 * query, so toggling the class is harmless either way.
 *
 * `waitForFonts` (used only by the hero, see Hero.tsx) defers the reveal until
 * `document.fonts.ready` instead of firing the instant the element intersects.
 * The hero is already in the viewport at mount, so an immediate reveal collapses
 * into the same frame as first paint — nothing to animate from. Self-hosted
 * Geist Sans/Mono are still being fetched at that point; gating the entrance on
 * font readiness is also the correct behavior for real users (no flash of a
 * fallback face mid-transition), not just a timing fix.
 */
export function useReveal<T extends HTMLElement>(threshold = 0.2, waitForFonts = false) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reveal = (target: Element) => {
      const fire = () => {
        // Double rAF: guarantees the hidden state has actually painted at
        // least one frame before the class flip, so the transition always
        // has something to animate from.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => target.classList.add("is-visible"));
        });
      };
      if (waitForFonts && "fonts" in document) {
        document.fonts.ready.then(fire);
      } else {
        fire();
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal(entry.target);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, waitForFonts]);

  return ref;
}
