# Finding and using references

Read `omd pack protocol/reference-assembly.md` for capture rules when needed.

- Match references to the requested surface: populated task screens for product UI, finished
  service websites for marketing, populated reading/browsing surfaces for content. Gallery
  thumbnails, pattern libraries and design-system docs are discovery leads, not visual references.
- Use `omd ref browse`/`ref add` to inspect and keep complete originals: native-resolution images
  and complete 2x viewport captures, never pixel crops. Describe regions of interest on the whole image.
- Domain research (`ref navigate <url> --lane domain`) is about functions, content and flows of
  comparable services; it does not need screenshots and never substitutes for visual direction.
- Interaction states are references too. When the reference's hover, focus, pressed or open
  states carry its craft (buttons, rows, tabs, menus, inputs), capture each state as its own
  whole capture and label it. Never click anything that submits, purchases, signs in, deletes,
  downloads or navigates away to reach a state.
- Choose one coherent primary direction; supplemental references get limited named jobs.
- Record what you actually consulted with `omd ref context` (see the ultradesign skill). Unknown
  or restricted rights mean the pixels are comparison material only; never ship reference pixels,
  copy or branding as product assets.

Report what was consulted, which source supplied which quality, and honest gaps. Never infer
quality or approval from a reference having been retained.
