import type { InputSkeleton } from './inputs.ts';

export const DESIGN_JUDGMENT_INPUT: InputSkeleton = {
  name: 'design-judgment', path: '.omd/.cache/design-judgment-input.json',
  command: 'omd judgment publish --input .omd/.cache/design-judgment-input.json --json',
  keys: ['schema', 'referenceBoardSha256', 'hypothesis', 'judgments'],
  constraints: [
    'Coordinator interprets the current reference observations before Composer or Sketch consumes them. Scout publishes observations, not this interpretation.',
    'Read omd judgment input --json for the current resolved board and referenceBoardSha256. This canonical evidence digest is not omd hash of the storage manifest.',
    'Replace every placeholder with your actual interpretation of the inspected evidence. Publishing this record does not attest independent or human review.',
    'After publishing run omd judgment check --json, then stage next. Any board change needs a new interpretation, not an updated hash on the old judgment.',
  ],
  skeleton: {
    schema: 'design-judgment-v1', referenceBoardSha256: '<from omd judgment input --json>',
    hypothesis: {
      schema: 'design-judgment-v1', feelsLike: '<specific task-grounded character, not generic adjectives>',
      dominantObject: '<named work object>', subordinate: ['<supporting element>'],
      densityIntent: '<task-specific density decision>', trustSource: '<visible evidence of trust>',
      twoSecondRead: '<what the user should understand in two seconds>',
    },
    judgments: [{ id: '<reference or slot id>', observation: '<what is visibly present>',
      whyItWorksThere: '<why that structure serves the source task>', relevance: 'high',
      adopt: ['<mechanism relevant to the destination>'], reject: ['<source feature not to transfer>'],
      interpretation: '<specific content-to-form decision>', scope: 'surface' }],
  },
};
