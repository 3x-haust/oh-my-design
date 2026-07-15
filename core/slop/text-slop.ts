export type TextSlopCandidateId =
  | 'fast-paced-world'
  | 'unlock-the-power'
  | 'elevate-your'
  | 'seamless-collocation'
  | 'important-to-note'
  | 'delve-into'
  | 'game-changer'
  | 'cutting-edge'
  | 'revolutionize'
  | 'end-of-the-day'
  | 'ko-journey-metaphor'
  | 'ko-story-vessel'
  | 'ko-melt-in'
  | 'ko-craft-mold'
  | 'ko-bestow'
  | 'supercharge-your'
  | 'work-smarter'
  | 'unlock-your'
  | 'ai-powered'
  | 'ten-x-hype'
  | 'no-code-required'
  | 'the-future-of'
  | 'next-generation'
  | 'heavy-lifting'
  | 'effortless-creation';

export interface TextSlopCandidate {
  candidateId: TextSlopCandidateId;
  line: number;
  phrase: string;
  signals: string[];
  reason: string;
  reviewQuestion: string;
  owner: 'writer';
  gating: false;
}

const REASONS: Record<TextSlopCandidateId, Pick<TextSlopCandidate, 'reason' | 'reviewQuestion'>> = {
  'fast-paced-world': {
    reason: '"In today\'s fast-paced world" is a stock AI-copy scene-setter that rarely carries product-specific meaning.',
    reviewQuestion: 'Does this opener say anything a reader could not have guessed, or can it be cut entirely?',
  },
  'unlock-the-power': {
    reason: '"Unlock the power of" is a generic marketing template phrase used regardless of the underlying feature.',
    reviewQuestion: 'What specific capability is being unlocked, and can the copy name it directly instead?',
  },
  'elevate-your': {
    reason: '"Elevate your" is a filler verb pairing that substitutes for a concrete benefit statement.',
    reviewQuestion: 'What measurable outcome does this actually elevate, and can that be stated plainly?',
  },
  'seamless-collocation': {
    reason: '"Seamlessly integrate/experience" is a stock collocation that asserts smoothness without evidence.',
    reviewQuestion: 'Is there a concrete detail (setup step, latency, compatibility) that demonstrates seamlessness?',
  },
  'important-to-note': {
    reason: '"It\'s important to note" is a throat-clearing hedge that delays the actual point.',
    reviewQuestion: 'Can this sentence lead with the point directly instead of announcing its own importance?',
  },
  'delve-into': {
    reason: '"Delve into" is a well-known LLM tic used as a generic transition into any topic.',
    reviewQuestion: 'Can this transition be replaced with a specific verb describing what actually happens next?',
  },
  'game-changer': {
    reason: '"Game-changer" is an inflated superlative asserted without supporting evidence.',
    reviewQuestion: 'What specific change does this cause, and does the evidence support calling it a game-changer?',
  },
  'cutting-edge': {
    reason: '"Cutting-edge" is a vague technology claim that says nothing about what is actually new.',
    reviewQuestion: 'What specific technique or capability makes this cutting-edge, and can that be named instead?',
  },
  'revolutionize': {
    reason: '"Revolutionize" is an inflated claim of category-level change rarely backed by the surrounding copy.',
    reviewQuestion: 'Does the surrounding evidence support a claim this strong, or would a narrower verb be accurate?',
  },
  'end-of-the-day': {
    reason: '"At the end of the day" is a filler idiom that pads a sentence without adding meaning.',
    reviewQuestion: 'Can this idiom be removed so the sentence states its conclusion directly?',
  },
  'ko-journey-metaphor': {
    reason: '"여정(journey)" as a growth/experience metaphor ("여정을 담다/그리다/시작하다") is a stock AI-portfolio flourish that adds no concrete fact.',
    reviewQuestion: 'What concrete project, date, or outcome does this stand in for, and can the copy state that instead of the journey metaphor?',
  },
  'ko-story-vessel': {
    reason: '"이야기를 담다" (to contain a story) is an AI marketing collocation that asserts narrative without naming it.',
    reviewQuestion: 'What is the specific story or fact, and can the copy show it rather than announce that it holds one?',
  },
  'ko-melt-in': {
    reason: '"녹여내다" (to melt/dissolve in) is overwrought AI-purple prose standing in for "included" or "expressed".',
    reviewQuestion: 'Can this be replaced with the plain verb (담다/구현하다/설명하다) for what actually happened?',
  },
  'ko-craft-mold': {
    reason: '"빚어내다" (to craft/mold) is decorative AI-purple prose rarely grounded in a real making process.',
    reviewQuestion: 'Was something literally shaped, or is this an inflated verb for "만들다/구축하다" a plainer word states better?',
  },
  'ko-bestow': {
    reason: '"선사하다" (to bestow/present) is stock Korean marketing copy that inflates a plain "제공하다/보여주다".',
    reviewQuestion: 'What is actually provided, and can the copy say 제공/보여줌 plainly instead of the gift-giving flourish?',
  },
  'supercharge-your': {
    reason: '"Supercharge your <noun>" is a stock AI-SaaS landing headline that promises intensity without a concrete mechanism.',
    reviewQuestion: 'What specifically gets faster or better, by how much, and can the copy state that instead of "supercharge"?',
  },
  'work-smarter': {
    reason: '"Work smarter, not harder" is a decades-old motivational cliché recycled by AI marketing copy.',
    reviewQuestion: 'What concrete step does the product remove, and can the copy name it instead of the slogan?',
  },
  'unlock-your': {
    reason: '"Unlock your creativity/potential/productivity" is a generic AI-SaaS template promise with no specific claim.',
    reviewQuestion: 'What was actually blocked before, and what unblocks it — can the copy say that plainly?',
  },
  'ai-powered': {
    reason: '"AI-powered" is a category label, not a benefit; it says the tech, not what the user gets.',
    reviewQuestion: 'What does the AI actually do here that a reader cares about, and can the copy lead with that outcome?',
  },
  'ten-x-hype': {
    reason: '"10x your/faster" is an unverifiable order-of-magnitude hype figure typical of AI landing pages.',
    reviewQuestion: 'Is there a measured before/after that supports a multiplier, or should the copy drop the number?',
  },
  'no-code-required': {
    reason: '"No code required" is a stock no-code/AI marketing tag that rarely reflects the actual workflow.',
    reviewQuestion: 'What does setup actually take, and can the copy describe the real first step instead?',
  },
  'the-future-of': {
    reason: '"The future of <domain>" is an empty futurist frame common to AI product copy.',
    reviewQuestion: 'What does the product do today, concretely, that the copy can state instead of gesturing at the future?',
  },
  'next-generation': {
    reason: '"Next-generation / next-gen" asserts novelty without naming what is actually new.',
    reviewQuestion: 'What specific capability is new here, and can the copy name it instead of the generation claim?',
  },
  'heavy-lifting': {
    reason: '"Let AI do the heavy lifting" is a stock AI-assistant phrase that hides what the tool actually automates.',
    reviewQuestion: 'What specific task is automated, and can the copy name that task instead of the idiom?',
  },
  'effortless-creation': {
    reason: '"Effortless creation/design/automation" is an AI-SaaS filler pairing that asserts ease without evidence.',
    reviewQuestion: 'What concrete step is removed to make it easier, and can the copy show that rather than assert "effortless"?',
  },
};

interface PatternRule {
  id: TextSlopCandidateId;
  pattern: RegExp;
}

const PATTERNS: PatternRule[] = [
  { id: 'fast-paced-world', pattern: /\bin today['’]s fast-paced world\b/gi },
  { id: 'unlock-the-power', pattern: /\bunlock the power of\b/gi },
  { id: 'elevate-your', pattern: /\belevate your\b/gi },
  { id: 'seamless-collocation', pattern: /\bseamlessly? (?:integrat\w*|experience\w*)\b/gi },
  { id: 'important-to-note', pattern: /\bit['’]s important to note\b/gi },
  { id: 'delve-into', pattern: /\bdelve into\b/gi },
  { id: 'game-changer', pattern: /\bgame-?changers?\b/gi },
  { id: 'cutting-edge', pattern: /\bcutting-edge\b/gi },
  { id: 'revolutionize', pattern: /\brevolutioniz(?:e|es|ed|ing)\b/gi },
  { id: 'end-of-the-day', pattern: /\bat the end of the day\b/gi },
  { id: 'ko-journey-metaphor', pattern: /여정을?\s*(담|그리|시작|떠나|함께|이어)/g },
  { id: 'ko-story-vessel', pattern: /이야기를\s*담(아|았|는|고|은)/g },
  { id: 'ko-melt-in', pattern: /녹여\s*(내|낸|냈)/g },
  { id: 'ko-craft-mold', pattern: /빚어\s*(내|낸|냈)/g },
  { id: 'ko-bestow', pattern: /선사(합니다|한다|하는|했|해\s?드리)/g },
  { id: 'supercharge-your', pattern: /\bsupercharge your\b/gi },
  { id: 'work-smarter', pattern: /\bwork smarter,? not harder\b/gi },
  { id: 'unlock-your', pattern: /\bunlock your (?:creativity|potential|productivity|workflow|ideas)\b/gi },
  { id: 'ai-powered', pattern: /\bAI[-\s]powered\b/gi },
  { id: 'ten-x-hype', pattern: /\b10x (?:your|faster|the|more)\b/gi },
  { id: 'no-code-required', pattern: /\bno[-\s]code required\b/gi },
  { id: 'the-future-of', pattern: /\bthe future of (?:work|design|creativity|productivity|content|building|software)\b/gi },
  { id: 'next-generation', pattern: /\bnext[-\s]gen(?:eration)?\b/gi },
  { id: 'heavy-lifting', pattern: /\b(?:do|does|let\w*|doing) .{0,20}the heavy lifting\b/gi },
  { id: 'effortless-creation', pattern: /\beffortless(?:ly)? (?:creation|design|automation|workflow|editing)\b/gi },
];

function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

function maskRange(chars: string[], start: number, end: number): void {
  for (let i = start; i < end; i++) if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
}

/** Mask fenced ```...``` blocks and inline `...` spans so their contents cannot trigger phrase matches. */
function maskCode(text: string): string {
  const chars = text.split('');
  for (const match of text.matchAll(/```[\s\S]*?```/g)) {
    maskRange(chars, match.index!, match.index! + match[0].length);
  }
  const withoutFences = chars.join('');
  for (const match of withoutFences.matchAll(/`[^`\n]*`/g)) {
    maskRange(chars, match.index!, match.index! + match[0].length);
  }
  return chars.join('');
}

/** Scan copy-deck / rendered plain-or-markdown text for narrow AI-cliche phrases. Non-gating and advisory only. */
export function scanTextSlop(text: string): TextSlopCandidate[] {
  if (!text) return [];
  // Narrow by design: literal phrase patterns. Zero-width / invisible-unicode splits
  // inserted inside a phrase can evade matching; acceptable for a non-gating advisory.
  const masked = maskCode(text);
  const found: TextSlopCandidate[] = [];
  for (const rule of PATTERNS) {
    for (const match of masked.matchAll(rule.pattern)) {
      const index = match.index!;
      found.push({
        candidateId: rule.id,
        line: lineAt(text, index),
        phrase: text.slice(index, index + match[0].length),
        signals: [rule.id],
        ...REASONS[rule.id],
        owner: 'writer',
        gating: false,
      });
    }
  }
  return found.sort((a, b) => a.line - b.line || a.candidateId.localeCompare(b.candidateId));
}
