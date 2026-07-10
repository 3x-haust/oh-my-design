# Colour — decision material

The question "what colour should this be" is not answered by preference. It is answered by
the domain the product sits in, the register the concept demands, and what the colour will
be required to do. Preference is the noise; these are the signal.

---

## Domain conventions and why they exist

Colour conventions are not arbitrary. They are residues of what worked — or what users
learned to expect — in each industry. Violating them requires a reason proportional to the
cost of breaking the expectation.

**Fintech and banking.** Blue, deployed consistently since the 1980s, carries a specific
claim: trustworthiness and institutional stability. Elliot & Maier (2014,
*Color-in-Context*) map blue to cognitive associations with calm, reliability, and
competence — properties banking literally sells. Navy amplifies authority; desaturated
mid-blue reads as honest and measured; bright cobalt reads as technology-forward. If your
fintech product is positioning *against* legacy banking (neobanks, crypto wallets), the
blue is exactly what you reject — but you are then making a claim and you must support it.
Breaking the convention is valid. Breaking it without knowing you broke it is not.

**Healthcare.** Green and white. White signals cleanliness — a hospital ceiling rather than
a brand choice, but one that research has made load-bearing. Green is associated with
healing and growth in Western contexts (Itten, *The Art of Color*, 1961). The danger zone
is red: Elliot & Maier's color-in-context research documents a reliable anxiety response to
red in evaluative contexts — patients waiting for results are already in an elevated state.
High-saturation red raises it further. Red is reserved for confirmed errors only; everything
else uses softer treatment.

**Education.** Warm palettes — orange, amber, warm yellow — encode approachability and
curiosity. IBM Design Language classifies warm hues as "energetic and optimistic," which
is correct for learning contexts where the interaction cost is effort. Blue appears in
formal educational contexts (universities, certifications) where authority is the value
being sold.

**Food and beverage.** Red and yellow reliably increase appetite and urgency — McDonald's
is not branding folklore, it is a tested outcome. Brown and warm earth tones signal
naturalness and craft (artisan bread, coffee, fermented anything). Green signals health and
freshness, especially in plant-based or organic positioning. Cold blues and purples suppress
appetite; avoid them unless the product is a diet tool and suppression is the point.

**Developer tools.** Dark backgrounds with green or blue accent are so established they
read as genre, not style. If you are building a developer tool, dark mode is not an
aesthetic option — it is the expected register. Material Design classifies this as a "dark
theme" preference, not a style preference, for productivity contexts. Deviating succeeds
only when the product is deliberately positioned at non-technical users who happen to use
developer tooling (Vercel's white marketing site, Linear's light mode). Colour the UI dark
and the marketing light.

**Luxury.** Black, deep navy, warm off-white, metallics. High contrast without brightness.
The signal is restraint: a luxury product does not shout. IBM Design Language codes the
"premium" register as low saturation, high value contrast, accents used sparingly. Any
saturated colour in a luxury context reads as a mistake unless it is the brand's exact
signature colour.

---

## Harmony schemes: when to use each

These are not visual preferences. Each scheme produces a different relationship between
elements, and the wrong scheme undermines the concept regardless of the individual colours.

**Complementary** (opposite on the hue wheel — blue/orange, red/green, purple/yellow):
high tension, high contrast, high energy. Use when the concept demands urgency or power.
Use for a single CTA accent against a neutral ground — never for large fields of both
colours simultaneously, which produces visual vibration that is measurably harder to read.

**Analogous** (adjacent hues — blue/blue-green/green): low tension, harmonious, cohesive.
Use when the concept demands calm, trust, or continuity. Fintech blue into teal is
analogous; its visual cohesion is the point, not the accident.

**Triadic** (three equally spaced hues): balanced energy, more complex than analogous but
less aggressive than complementary. Use when the product has genuinely distinct feature
areas that benefit from colour differentiation. Hard to execute; requires one dominant, one
secondary, one accent — not three equals competing for attention.

---

## The 60-30-10 distribution

60% dominant (backgrounds, large surfaces), 30% secondary (components, containers), 10%
accent (CTAs, active states, critical notifications). This is not aesthetic orthodoxy — it
is a reading law. Eye-tracking research (NN/g, "Visual Hierarchy and Attention") shows that
equal colour distribution eliminates hierarchy: the eye cannot rank what weighs the same.
The 60-30-10 split creates a reading order by making some things obviously heavier.

Invert it and you get AI slop: the accent colour used for backgrounds, the dominant colour
used for highlights. Everything reads as equally important, so nothing is important.

---

## Saturation and register

Saturation is a signal about urgency and authority. This relationship is consistent across
Itten's original colour theory and validated in Material Design's colour system (2023):

**High saturation** reads as urgent, energetic, playful. Appropriate for: alerts, primary
CTAs, food brands, entertainment, consumer apps targeting younger users. Inappropriate for:
banking, legal software, health monitoring, anything where the user is already in an
elevated state. Anxiety does not need more stimulation.

**Mid saturation** reads as friendly and accessible without aggression. The safe register
for most consumer products — present without shouting.

**Low saturation (muted)** reads as authoritative, mature, premium. Appropriate for:
enterprise tools, luxury brands, healthcare, editorial products. IBM Design Language
explicitly codes low-saturation palettes as "professional" and reserves high saturation for
interactive states only.

A colour decision without a saturation decision is half a decision. The hue is the genre;
the saturation is the register within that genre. Choosing green for a healthcare product
is a start; choosing muted sage green instead of saturated lime is the actual decision.

---

## Background temperature

Backgrounds are not neutral. A warm background (slightly yellow, cream, warm grey) creates
a different psychological environment than a cool one (blue-grey, neutral-white, near-black).

**Warm backgrounds**: approachable, organic, human. Appropriate for products where
connection and warmth are the value proposition — communication tools, creative tools,
consumer apps. The warmth carries even at very low saturation; a barely-tinted cream reads
differently from a cool white.

**Cool backgrounds**: crisp, precise, efficient. Appropriate for productivity tools,
fintech, developer tools. Signals that the environment is here to help you work, not to be
pleasant. Cool surfaces say "focus."

**True neutral** (pure white or near-black): no temperature signal. Appropriate when the
content itself must carry all the temperature — photography sites, portfolio tools, editorial
platforms. The absence of warmth or coolness is deliberate.

The background temperature sets the emotional register for every colour that sits on it.
A warm accent on a cool background reads as a guest; the same accent on a warm background
reads as native. Choose the temperature before choosing the accent, not after.

---

## Dark mode: the rules for colour adjustment

Dark mode is not "light mode inverted." It is a different palette built on different
physics. The three most common errors:

**Pure black (#000000) is the wrong dark background.** On OLED panels, pure black pixels
are off — the transition between lit and unlit pixels as you scroll produces a strobing
effect that users feel as discomfort without being able to name. More importantly, pure
black gives zero depth: every surface is on the same plane, so the elevation system
(cards, modals, tooltips) collapses. Google's Material Design dark theme specification uses
#121212 as the baseline surface; layers of elevation are expressed as white-tint overlays
at increasing opacity (4%, 8%, 12%, 16%, 24%). This preserves the depth system without
fighting the contrast requirements.

**Saturated accent colours vibrate on dark backgrounds.** A brand colour calibrated for
a white ground carries too much energy when placed over dark grey — the eye perceives it as
louder than intended, a phenomenon called simultaneous contrast. The fix is desaturation:
reduce the accent's saturation by 20–30% for the dark palette. The colour reads as the same
brand colour; it no longer shouts. Uxcel's dark mode guidelines and Material Design 3's
tonal palette system both prescribe this adjustment explicitly.

**Text hierarchy uses opacity, not grey values.** On dark surfaces, secondary text is not
a specific grey hex — it is white at reduced opacity. Material Design's dark theme
recommendation: primary text at 87% opacity, secondary text at 60%, disabled/hint text at
38%. The reason is practical: the surface colour changes across the elevation system, and
fixed hex values for text will fail the contrast requirements on the wrong surface. Opacity
scales with whatever it sits on; a fixed grey does not.

Condition → choice → reason: when the background lightness is below L\* 25 (very dark),
desaturate all chromatic accents and express text hierarchy through white-opacity tiers,
not through separate grey values.

---

## Accessibility contrast: APCA vs WCAG 2

The WCAG 2.x contrast ratio (minimum 4.5:1 for body text, 3:1 for large text) has been
the accessibility floor since 2008. It has a fundamental flaw: it computes contrast as a
static ratio between two colours, and treats a light-weight 12px label identically to a
bold 24px heading at the same colour values. The same contrast ratio on different text
produces radically different readability outcomes.

The Advanced Perceptual Contrast Algorithm (APCA), developed by Andrew Somers, corrects
this. APCA calculates a lightness contrast value (Lc) that accounts for font size and
weight simultaneously — a thin 14px label and a bold 32px heading require different
minimum contrast scores. The model is based on human visual perception of spatial frequency
and luminance, not arithmetic ratios. The W3C has confirmed APCA as the contrast model for
the forthcoming WCAG 3.0 standard.

The practical consequence today: WCAG 2.x compliance is required for legal accessibility
standards in most jurisdictions — it is the floor. APCA thinking is the ceiling: use it to
catch situations where a WCAG 2.x-passing colour combination still fails at small sizes or
light weights. A muted secondary label in a fintech dashboard might pass 4.5:1 against its
background while being genuinely difficult to read at 11px regular weight. APCA flags it;
WCAG 2.x does not.

Condition → choice → reason: when the design includes small text (below 16px) or thin
weights (300–400) in informational roles, verify not just the WCAG 2.x ratio but the Lc
score under APCA. The APCA Contrast Checker tool at git.apcacontrast.com provides the
calculation. Do not stop at compliance; stop at legibility.

---

## Cultural colour conventions: East Asian and Korean markets

Western colour psychology does not travel without adjustment. The two most commercially
significant divergences for Korean and East Asian markets:

**Red signals prosperity, not danger.** In Western UI convention, red is reserved for
errors, alerts, and destructive actions — a reliable association built on traffic signals,
fire, and blood. In Korean and broader East Asian contexts, red historically signals good
fortune, celebration, and vitality. Red envelopes (홍보봉투) carry money at celebrations;
red text appears in festive and auspicious contexts. A Korean e-commerce product using red
for a sale badge is following cultural convention, not violating the error-colour rule. The
consequence for product design: the error-state semantic for red must be established
explicitly through context (icon, label, placement) when designing for Korean audiences,
not assumed from the colour alone.

**White carries mourning associations.** In Western contexts, white is sterile, clean,
minimal. In traditional Korean and East Asian mourning customs, white is the colour of
death and funerals. Contemporary Korean design has largely absorbed the global white-equals-
clean convention for digital products, but white-dominant aesthetics in healthcare or
financial products touching elderly Korean users carry a risk of misread that does not
exist in Western markets. A warm off-white or a cream-tinted background removes the
ambiguity without sacrificing the clean register.

**Gold and yellow signal prestige.** Where luxury Western products typically reach for
black, navy, and restraint, East Asian luxury context extends to gold as a prestige signal
— associated with royalty, success, and premium quality across Korean, Chinese, and
Japanese markets. This legitimises gold accents in premium Korean product design in ways
that would read as garish in a Western luxury context.

Condition → choice → reason: when the primary market is Korean or East Asian, audit every
colour's semantic layer against the target culture's conventions before treating Western
colour psychology as ground truth.

---

## Data visualisation palettes vs UI palettes

These are different systems serving different purposes, and conflating them produces both
ugly charts and a broken UI colour system.

**UI palettes** are built for hierarchy. The accent is one colour, used at one saturation,
in one role. Introducing six distinct categorical colours into a UI palette creates visual
chaos: the eye cannot rank what cannot be compared. UI palettes need three to five tones
from one or two hue families, and one semantically loaded accent.

**Data visualisation palettes** are built for distinction. The primary requirement is that
every category is unambiguously different from every other under multiple viewing conditions
— colour blindness, screen glare, printout. The standard approach (Color Brewer, a research
project by Cynthia Brewer at Penn State) provides tested categorical palettes of 3–12
colours calibrated for perceptual distance. These palettes are deliberately non-hierarchical:
no one colour should read as more important than another in a categorical context.

The failure mode is using the UI brand colour as the first category colour in a chart and
the UI secondary as the second. The user reads the first bar as "primary action" and the
second bar as "secondary action" — a UI reading that corrupts the data reading. Separate
the systems. The chart's categorical blue is not the button's blue; they are different
tokens with different semantics.

Condition → choice → reason: when the product includes data visualisation, create and
maintain a separate visualisation token set. Borrow nothing from the UI palette except the
neutral surfaces and the background.

---

## Sources

- Itten, *The Art of Color* (1961) — hue relationships and the psychological force of colour
- Elliot & Maier, "Color-in-Context Theory" (2014) — empirical mapping of colour to
  psychological state in evaluative contexts
- IBM Design Language (2023) — enterprise colour system and saturation register
  classification
- Material Design 3 (2023) — dynamic colour system, role definitions, tonal palettes, dark
  theme surface specification (#121212 baseline, white overlay elevation)
- NN/g, "Visual Hierarchy and Attention" — eye-tracking evidence for the reading-order
  effect of colour weight distribution
- Uxcel, "12 Principles of Dark Mode Design" (2023) — desaturation guidelines for accent
  colours on dark surfaces
- APCA / Andrew Somers, git.apcacontrast.com — Advanced Perceptual Contrast Algorithm;
  the contrast model for forthcoming WCAG 3.0
- Brewer, Color Brewer (colorbrewer2.org) — perceptually calibrated categorical palettes
  for data visualisation
