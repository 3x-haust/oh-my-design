import "./app.css";
import type { Locale } from "./data/content";
import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { Loop } from "./components/Loop";
import { EvidenceTable } from "./components/EvidenceTable";
import { Skills } from "./components/Skills";
import { Install } from "./components/Install";
import { Footer } from "./components/Footer";

export default function App({ locale = "en" }: { locale?: Locale }) {
  return (
    <>
      <Nav locale={locale} />
      <main>
        <Hero locale={locale} />
        <Loop locale={locale} />
        <EvidenceTable locale={locale} />
        <Skills locale={locale} />
        <Install locale={locale} />
      </main>
      <Footer locale={locale} />
    </>
  );
}
