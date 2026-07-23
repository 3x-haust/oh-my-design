# Licensed real-photography sourcing

The placeholder policy is the floor: a grey box is a defect; a CSS/SVG carrier (typographic block,
pattern, gradient, generative system) beats a generic stock photo. This document is the step *above*
that floor — the case where a real photograph is genuinely the right carrier (a human face, a real
environment, a physical product context that CSS cannot represent and no product asset was supplied),
and the lawful way to source and record it. It never replaces the placeholder policy; a generic stock
photo or a 3D blob is still worse than a committed CSS/SVG carrier.

OMD never fetches, scrapes, hotlinks, or downloads a remote image. The agent or user obtains a lawfully
licensed image and stores it locally; this protocol records and validates its provenance
(`core/graphics/photo-license.ts`, `validatePhotoProvenance`).

## When a real photo is the right carrier

- A human face, a real place, a real physical context, a texture, or a mood a CSS/SVG system cannot
  honestly represent, AND no user asset covers it, AND the register is `confident`/`showpiece` where a
  real image is a first-class deliverable (`theory/imagegen.md`).
- Not for a factual carrier — a real team photo, a real product screenshot, a specific real person, or a
  logo. Those come only from the user, never a stock library, and are never AI-generated.
- Not when a CSS/SVG carrier already carries the concept: reach for a photo because the concept needs a
  real image, never because the page "needs more".

## Permitted sources and licences

Shipped photographs come only from free-licence libraries or the user:

- **Unsplash**, **Pexels** — Unsplash/Pexels Licence (attribution appreciated, not legally required).
- **Openverse**, **Wikimedia Commons** — the item's own licence: **CC0**, **Public Domain Mark (PDM)**,
  **CC-BY**, or **CC-BY-SA**.

`core/graphics/photo-license.ts` enumerates the permitted set. The **CC-BY family requires attribution**
by licence: a shipped CC-BY / CC-BY-SA photo without a photographer credit and a rendered attribution
string is invalid and does not ship. CC0, PDM, Unsplash, and Pexels do not legally require attribution,
but the source and source page are always recorded.

## Never shipped

- **Mood-reference boards** — Pinterest, Dribbble, Mobbin, Behance — are studied for mood only and never
  lifted verbatim; their images are third-party copyrighted.
- Any **all-rights-reserved**, unknown-licence, or paywalled/watermarked (Getty, Shutterstock preview)
  image. An unpermitted or unknown licence is never shipped.

## Provenance record

Every shipped photograph carries a validated record (`validatePhotoProvenance`) with, at minimum:

```json
{
  "source": "Unsplash",
  "sourcePage": "https://unsplash.com/photos/<id>",
  "license": "Unsplash",
  "photographer": "Jane Doe",
  "attribution": "Photo by Jane Doe on Unsplash",
  "localPath": "assets/hero-portrait.jpg",
  "altText": "A ceramicist shaping a bowl on a wheel, warm side light"
}
```

`sourcePage` is an https URL; `localPath` is a safe project-relative path to the locally stored image;
`altText` describes the image (never a filename) because a shipped photograph is content and needs an
accessible description. When the licence requires attribution, `photographer` and `attribution` are
mandatory. Record it alongside the run's other provenance (`omd decision` and `.omd/attribution.md`).
