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
    const marketingPage = route.sourceContract.referenceDiscovery.taskNeed === 'new-marketing';
    // A page is composed around its one idea; a product is many screens held to one system.
    const track = marketingPage
      ? 'The page is built around the idea in .omd/studio/concept.json (omd pack guides/marketing.md): the object it names is the key visual, type '
        + 'and graphic interlock around it, and it returns down the page in the places the record lists. When the idea is one authored object, omd '
        + 'studio rig installs a lit material stage for the mark\'s real path (omd pack guides/material-stage.md). omd studio blueprint gives the '
        + 'reference\'s skeleton to fill with this project\'s content. '
      : 'A product is many screens in one hand (omd pack guides/product.md): the object model and flows first, one system file every screen obeys, '
        + 'every screen with its empty, loading, error and success states on realistic data, then omd studio check --mode product <screen> <screen> '
        + '... until each role is built one way everywhere. ';
    return `${route.projectMode === 'greenfield' ? 'Start the source as a React + Vite + strict TypeScript project laid out per omd pack guides/code.md. ' : ''}${track}Build the page in the project as components on `
      + 'the system in .omd/studio/system.json. The key visual first: the one visual that carries the page, made in code at large size from the '
      + 'product\'s real look (for software, its own interface recreated crisply in its real colours, marked data-product), playing the product\'s '
      + 'real flow on its own (states change, rows arrive, a cursor works) and answering real input; a screen recording is not a key visual. A tool that makes pages shows a page it made for another, particular client, held to everything this page is: its own name chosen from several, words in the page\'s language, its own palette and art, nothing standing in for an image, no line calling it fictional. Shoot it alone (omd render <page> --out <png>), look, and refine '
      + 'until it could sit on the reference\'s site. Then the sections at the reference\'s rhythm and depth: the few stories that make the case '
      + '(the moments the project itself leads with), each at full size with its real demo (muted, looped, no player chrome) and a composition of '
      + 'its own, the remaining capabilities gathered densely in one place rather than each given the same block; compositions varied (a full-bleed '
      + 'moment, a cropped detail, a pair, a typographic statement), never a grid of equal cells; the story unfolds over the scroll, never hidden in '
      + 'tabs, accordions or carousels; the header carries the project\'s real logo file at a size where its own detail reads, never beside a typed copy of its name. '
      + 'Motion is part of the system, as the reference moves: the first screen arrives (what leads, from what, how long, which curve), sections '
      + 'reveal on scroll with its curve and stagger, hover in its timing, everything at rest under prefers-reduced-motion; omd pack '
      + 'motion/recipes/hero-intro-sequence.md and motion/recipes/scroll-reveal.md. Subtract: omd studio check --page <build>/index.html, and cut arrow glyphs, small uppercase labels, tiny captions, tabs and badges that '
      + 'do no job; it also sets your sections beside the reference\'s, measured (height, what leads each, words a screen), names defects, and lists the defaults the page leaves: follow each, or record a deviation with its reason in system.json when the idea needs it and apply it everywhere. Before subtracting, a pass that adds: hover, focus and pressed states, the motion\'s order and timing, type refinement (tracking, line breaks, optical alignment). Compare: omd studio look shoots the build screen by screen and sets it beside the reference; or shoot the '
      + 'page (--full-page) and put it beside the reference\'s first-screen.png and full.png; fix the biggest '
      + 'differences in scale, whitespace, type, the visual, rhythm and finish, at most three passes. omd pack guides/landing-basics.md once for '
      + 'the basics a designer keeps (a header in reach, plain-word navigation, one primary action, real head metadata, no dead links or invented '
      + 'proof). Words in the project\'s own voice (its README\'s claims, wording and humour): each headline names a concrete thing the product '
      + 'does or a real moment of using it, never a paired slogan of two parallel clauses or an abstract promise of ease, and the same cadence never '
      + `repeats from section to section. ${korean ? 'Korean text: omd pack theory/typography-korean.md. ' : ''}Then build and run omd lifecycle finish --json.`;
  }
  const marketing = route.sourceContract.referenceDiscovery.taskNeed === 'new-marketing';
  const start = route.projectMode === 'greenfield' ? 'Start the source as a React + Vite + strict TypeScript project laid out per omd pack guides/code.md. ' : '';
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
