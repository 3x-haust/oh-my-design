import { useEffect, useMemo, useRef, useState } from "react";
import { getContent, type StageState, type Locale } from "../data/content";
import { getCopy } from "../data/i18n";

// Candidate A (winner, .omd/.cache/sketch-selection.md): vertical scroll timeline,
// pinned stage anchor. The anchor column stays `position: sticky` (desktop) and
// shows the currently-active stage's number/label/state/artifact while the stage
// list scrolls past beside it — the pinned card is a literal embodiment of "the
// design loop made visible" (composition.md Candidate Axis A; .omd/decisions.md
// showpiece-motion decision).
//
// Required production fix carried from the blind selection (responsive hierarchy
// scored 2/4 on candidate A): on mobile the anchor must NOT float above/before the
// stage list. Instead of a single global sticky card, each stage item renders its
// own inline anchor restatement, shown only via CSS at narrow widths and only for
// the currently-active stage — so on mobile the "pinned" content is attached
// directly to the relevant list item in natural document flow, never a floating
// block ahead of the list. See .omd/motion-spec.md "loop anchor pin / release".
export function Loop({ locale }: { locale: Locale }) {
  const t = getCopy(locale);
  const { stages } = getContent(locale);
  const [currentIndex, setCurrentIndex] = useState(0);
  const stageRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    // IntersectionObserverEntry.boundingClientRect is a snapshot taken at the
    // moment a target last crossed the threshold — not a live position. With
    // several ~185px stages fitting inside the shrunk root margin at once, a
    // long scroll range can pass with zero threshold crossings, so a
    // callback-driven pick goes stale mid-scroll even with a persisted map.
    // "Closest stage to viewport center" is a continuous ranking, not a
    // boolean visibility event, so it's recomputed on every scroll frame from
    // live getBoundingClientRect() instead.
    let rafId: number | null = null;
    const recompute = () => {
      rafId = null;
      const vh = window.innerHeight;
      let bestIdx = -1;
      let bestDistance = Infinity;
      stageRefs.current.forEach((el, idx) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - vh / 2);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIdx = idx;
        }
      });
      if (bestIdx !== -1) setCurrentIndex(bestIdx);
    };
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(recompute);
    };

    recompute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  const stateOf = useMemo(
    () =>
      (index: number): StageState => {
        if (index < currentIndex) return "checked";
        if (index === currentIndex) return "current";
        return "pending";
      },
    [currentIndex],
  );

  const current = stages[currentIndex];

  return (
    <section className="loop" id="loop">
      <h2>{t.loop.heading}</h2>

      <div className="timeline">
        <div className="anchor-track" aria-hidden="true">
          <div className="anchor" role="note" aria-label="pinned stage anchor">
            <div className="anchor-swap" key={current.num}>
              <div className="anchor-num">{current.num}</div>
              <div className="anchor-label">{current.title}</div>
              <div className="anchor-state">{t.loop.current}</div>
              <div className="anchor-connector" />
              <code className="anchor-caption">{current.artifact}</code>
            </div>
          </div>
        </div>

        <ol className="stage-list">
          {stages.map((stage, index) => {
            const state = stateOf(index);
            return (
              <li
                className="stage"
                key={stage.num}
                data-state={state}
                ref={(el) => {
                  stageRefs.current[index] = el;
                }}
              >
                <div className="stage-node">
                  <span className="stage-num">{stage.num}</span>
                  <span className="stage-state" aria-hidden="true" />
                </div>
                <div className="stage-body">
                  <h3>{stage.title}</h3>
                  <p>{stage.body}</p>
                  <code className="chip">{stage.artifact}</code>

                  {/* Mobile-only inline anchor restatement — visible only for the
                      current stage, hidden at desktop via CSS (the sticky column
                      handles desktop instead). This is the required fix: the
                      "pinned" fact lives inline, attached to this exact item. */}
                  {state === "current" && (
                    <div className="anchor-inline" aria-label="current stage indicator">
                      <span className="anchor-inline-badge">{t.loop.current}</span>
                      <span className="anchor-inline-caption">{t.loop.inlineCaption}</span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
