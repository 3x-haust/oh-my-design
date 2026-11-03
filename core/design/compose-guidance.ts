import type { readPersistedRoute } from '../route/index.ts';
import { newSurface } from './new-surface-advisories.ts';

type Route = ReturnType<typeof readPersistedRoute>;

/**
 * The production step names the knowledge a designer reaches for while building this kind of surface. Without it
 * the agent opens only what the skill names unconditionally, and the copy, layout, colour, composition and motion
 * packs stay unread while the page fills with explanations.
 */
export function composeGuidance(route: Route): string {
  const korean = /[ㄱ-ㆎ가-힣]/.test(route.request);
  // A new page already has its system from the studied reference; building, looking and cutting is the work, not more reading.
  if (newSurface(route)) {
    return `${route.projectMode === 'greenfield' ? 'Start the source with omd scaffold. ' : ''}Build the page in the project as components on `
      + 'the system in .omd/studio/system.json. The key visual first: the one visual that carries the page, made in code at large size from the '
      + 'product\'s real look (for software, its own interface recreated crisply in its real colours, marked data-product), playing the product\'s '
      + 'real flow on its own (states change, rows arrive, a cursor works) and answering real input; a screen recording is not a key visual. Shoot it alone (omd render <page> --out <png>), look, and refine '
      + 'until it could sit on the reference\'s site. Then the sections at the reference\'s rhythm and depth: as many as the project\'s real '
      + 'material supports, one idea each at full size with its real demo (muted, looped, no player chrome), compositions varied (a full-bleed '
      + 'moment, a cropped detail, a pair, a typographic statement), never a grid of equal cells; the story unfolds over the scroll, never hidden in '
      + 'tabs, accordions or carousels; the header carries the project\'s real logo file at a size where its own detail reads, never beside a typed copy of its name. '
      + 'Motion is part of the system, as the reference moves: the first screen arrives (what leads, from what, how long, which curve), sections '
      + 'reveal on scroll with its curve and stagger, hover in its timing, everything at rest under prefers-reduced-motion; omd pack '
      + 'motion/recipes/hero-intro-sequence.md and motion/recipes/scroll-reveal.md. Subtract: omd studio check --page <build>/index.html, and cut arrow glyphs, small uppercase labels, tiny captions, tabs and badges that '
      + 'do no job. Compare: shoot the page (--full-page) and put it beside the reference\'s first-screen.png and full.png; fix the biggest '
      + 'differences in scale, whitespace, type, the visual, rhythm and finish, at most three passes. omd pack guides/landing-basics.md once for '
      + 'the basics a designer keeps (a header in reach, plain-word navigation, one primary action, real head metadata, no dead links or invented '
      + `proof). ${korean ? 'Korean text: omd pack theory/typography-korean.md. ' : ''}Then build and run omd lifecycle finish --json.`;
  }
  const marketing = route.sourceContract.referenceDiscovery.taskNeed === 'new-marketing';
  const start = route.projectMode === 'greenfield' ? 'Start the source with omd scaffold. ' : '';
  const words = marketing
    ? 'Write the words before the layout, from the brief: omd pack theory/web-copy.md (lead with the reader\'s decision) and '
      + 'omd pack theory/voice.md (one sentence, one job; write the content, never narrate the page\'s structure); no kicker, tag row '
      + 'or caption the visitor would not miss. '
    : 'Build the task flow first: omd pack theory/ux.md, theory/forms.md and theory/components.md (theory/ia-methods.md when the '
      + 'objects and their relations are unclear); labels and states from omd pack theory/microcopy.md. ';
  const structure = marketing
    ? 'Compose with omd pack theory/layout.md and theory/color.md; try a structure from omd pack composition/typographic-hero.md, '
      + 'composition/split-screen-hero.md, composition/section-inversion.md or composition/bento-grid.md as a hypothesis, not a template. '
      + 'Build the motion from the recipes the motion guidance names. Before building, read omd pack guides/landing-basics.md: the '
      + 'basics designers keep without being asked (a header that stays in reach with in-page links landing below it, plain-word '
      + 'navigation with no arrows, one primary action, real head metadata, no dead links, no invented proof), measured on 30 finished landings. '
    : 'Compose with omd pack theory/layout.md and theory/color.md; omd pack composition/app-shell-workbench.md, composition/crud-list-detail.md '
      + 'and composition/filterable-data-table.md are starting hypotheses; the states, targets and shipping basics in omd pack guides/landing-basics.md apply here too. ';
  const type = korean ? 'Korean text: omd pack theory/typography-korean.md beside theory/font-pairing.md. ' : '';
  // The hero sets the page's idea; reviewing it alone, before the rest exists, is cheaper than repairing a whole page.
  const order = marketing ? 'Build the header and hero first, run omd first-render check on them, settle the hero, then build the rest and check again. '
    + 'The hero carries the proof the brief names in heroProof: real output or the working product goes there, large enough to read; a built '
    + '3D graphic then serves the section whose claim it acts out, not the entry. Only a concept-graphic hero puts the graphic first.'
    : 'Then build and run omd first-render check --page dist/index.html --json.';
  return `${start}${words}${structure}${type}${order}`;
}

/** Said whenever the early reviewer asks for repair or a repair regressed: diagnose by cause before changing pixels. */
export const REPAIR_KNOWLEDGE = 'Diagnose by cause before changing pixels: omd pack guides/landing-basics.md for the basics a designer keeps, theory/craft.md (diagnose by cause) and '
  + 'theory/expressive.md (the tells of AI-made landings); open the designer case whose question matches the finding (omd pack cases '
  + 'lists them, for example over-containment and grey boxes) and repair the decision that produced it, not the symptom. Repair in '
  + 'order: what blocks the visitor\'s task or access, then missing states, then structure (hierarchy, layout, mobile), then type, '
  + 'colour and consistency, then motion, details last; polishing details on a broken structure keeps the cause.';
