import { useReveal } from "../hooks/useReveal";
import type { Locale } from "../data/content";
import { getContent } from "../data/content";
import { getCopy } from "../data/i18n";

// Highest density on the page, deliberately (composition.md density arc). Mobile
// recomposition stacks rows to blocks with ::before pseudo-labels (app.css).
export function EvidenceTable({ locale }: { locale: Locale }) {
  const t = getCopy(locale);
  const { evidenceRows } = getContent(locale);
  const ref = useReveal<HTMLTableSectionElement>();

  return (
    <section className="evidence" id="evidence">
      <h2>{t.evidence.heading}</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">{t.evidence.colStage}</th>
            <th scope="col">{t.evidence.colArtifact}</th>
            <th scope="col">{t.evidence.colBoundary}</th>
          </tr>
        </thead>
        <tbody className="stagger stagger--table" ref={ref}>
          {evidenceRows.map((row) => (
            <tr key={row.stage}>
              <td>{row.stage}</td>
              <td>
                <code>{row.artifact}</code>
              </td>
              <td>{row.boundary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
