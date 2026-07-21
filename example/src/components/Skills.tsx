import { useReveal } from "../hooks/useReveal";
import type { Locale } from "../data/content";
import { getContent } from "../data/content";
import { getCopy } from "../data/i18n";

export function Skills({ locale }: { locale: Locale }) {
  const t = getCopy(locale);
  const { skills } = getContent(locale);
  const ref = useReveal<HTMLUListElement>();

  return (
    <section className="skills" id="skills">
      <h2>{t.skills.heading}</h2>
      <ul className="skill-list stagger stagger--list" ref={ref}>
        {skills.map((skill) => (
          <li key={skill.name}>
            <strong>{skill.name}</strong> — {skill.body}
          </li>
        ))}
      </ul>
    </section>
  );
}
