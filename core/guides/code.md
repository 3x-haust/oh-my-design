# Code a team can keep

A new web project is source a product team will open next month, not a demo that only has to render.
Write it so a developer who has never seen it finds the part they need, changes it in one place, and
can add a section or a page without moving everything else. Build only what this request needs.

## Layout

Start with `omd scaffold`: it runs the official Vite React + TypeScript template in a temporary folder and
copies the files the route allows into the project, never replacing or deleting anything (`npm create vite`
with `--overwrite` empties a non-empty folder, material included). Do not hand-write `index.html`,
`vite.config.ts` or the tsconfig files. Then replace the template demo and keep its conventions:

```text
index.html
src/
  main.tsx              entry: mounts <App />, imports global styles
  App.tsx               page composition: the sections in order, nothing else
  sections/<Name>/      one folder per page section
    <Name>.tsx
    <Name>.module.css
    <Name>.test.tsx
  components/<Name>/    a part used by two or more sections (button, code block, tab list)
  content/              copy and facts as typed constants, so wording changes never touch markup
  styles/
    tokens.css          colour, type, spacing, radius, motion as CSS custom properties
    global.css          reset and base element styles only
  hooks/                only behaviour shared by two or more components (for example reduced motion)
  assets/               images and SVGs the code imports
public/                 files served as-is: favicon, fonts, social image
```

Leave out a folder the page has no file for. Name files after what they are (`InstallTabs.tsx`),
not after their role in the build (`utils2.ts`, `helpers.ts`).

## Rules that keep it maintainable

- One component per file. Extract a component when a second place needs it or when a section file
  stops reading top to bottom; three similar lines are not yet an abstraction.
- Styles live beside their component as CSS Modules and read values from `tokens.css`; a colour or
  size written twice becomes a token. No inline style objects for static styling.
- Copy and verified facts live in `content/`, typed. A section receives what it shows; it does not
  hard-code product claims.
- Props are typed and minimal. Prefer plain props and local state; add context only when three or
  more levels would otherwise pass the same value.
- Motion respects `prefers-reduced-motion` in one shared place, not per component.
- Tests render components and drive them like a user (Vitest with Testing Library): the install tab
  switches, the copy button copies, the menu opens. Never assert on the source text.
- Scripts call the toolchain: `dev` (vite), `build` (`tsc -b && vite build`), `typecheck`,
  `test` (vitest run), `lint` (the template's linter), `format` (prettier). TypeScript is strict.
- Every file is formatted by the project's formatter; `omd lifecycle finish` refuses packed source
  and files that carry several components.

## Do not build ahead of the request

No router for a single page, no state library, no i18n framework, no CMS layer, no design-system
package, no barrel files re-exporting everything, no generic `Section`/`Card` abstraction with ten
props. Add one when the request or a second real use needs it, and say why in the report.
