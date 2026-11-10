# A multi-screen product

A product is judged across screens: whether a person can do the job, and whether every screen is visibly
made by one hand. A beautiful first screen with drifting inner screens is an unfinished product.

1. **Objects and flows first.** Before any pixel, write in `.omd/studio/brief.md`: the objects (what a person
   creates, sees, changes), how they relate, and the three or four flows that make up the job, step by step.
   Navigation comes from the objects, not from a list of features.
2. **Study populated task screens.** References are real product screens full of real data (a table with 40
   rows, a form mid-edit, an empty state), not marketing pages about products. Measure density: row height,
   type sizes, how much fits on one screen, how states are shown. `omd studio refs <url>...` on screens you
   can reach; saved screenshots when they are behind a login.
3. **Reference board, direction, owned assets** (`guides/assets.md`). Pin single screens and elements per
   screen of this product, each for one job (`omd studio board`); generate concept boards of the whole app at
   phone size and choose one; generate the product's own assets (icon set, objects, characters, badges) as
   several candidate sets, pick by pairwise comparison and ship the winner with `omd studio asset`.
4. **One system file.** `.omd/studio/system.json` and `system.md` hold the type steps, weights, colours,
   spacing scale, radii, and each component's one anatomy (button, field, table row, card, dialog). Tokens
   live in one source file; every screen imports them. No screen invents a size.
5. **Screen inventory with states.** List every screen and, for each, its empty, loading, error and success
   states. Build all of them, on realistic data: real-length names, long numbers, a row that wraps, a list
   of zero and a list of two hundred. A state that is not built does not exist.
6. **Key screens around the assets.** Plain card-and-list screens are the first pass. Rebuild the key screens
   so the assets change their structure (a lesson list becomes a path of blocks you climb), in several
   structurally different variants per key screen, set side by side with `omd studio sheet --viewport mobile`,
   then pick one.
7. **Consistency across screens.** `omd studio check --mode product <screen> <screen> ...` (URLs or built
   files, every screen and state) fails when the page title, section titles, body text, the primary button
   or fields are built two ways, when type leaves the system, or when a screen scrolls sideways on a phone.
   Fix the component, not the screen.
8. **Look at them together.** Shoot every screen and lay them out as one sheet; what does not belong is
   obvious at that distance.

The marketing defaults about hero scale and scroll motion do not apply here; density, legibility and
predictable components do.
