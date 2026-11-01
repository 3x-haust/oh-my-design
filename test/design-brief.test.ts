import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DESIGN_BRIEF_SKELETON, parseDesignBrief, publishDesignBrief, readDesignBrief } from '../core/design/design-brief.ts';
import { publishAdaptiveRoute } from '../core/route/adaptive-route-persistence.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { createModelLedRouteContext, modelLedInput } from './helpers/model-led.ts';

const brief = {
  schema: 'design-brief-v1',
  audience: 'Developers who already use a coding agent and have seen its generic pages.',
  personas: [{ name: 'Minji, frontend lead', context: 'Desktop, between reviews, judging a tool in a minute', job: 'Decide whether OMD fixes generic agent pages',
    mustBelieveIn5s: 'The same request produces a page a designer would sign', dealBreaker: 'Claims without a before and after' }],
  visitorQuestions: ['What is it?', 'Does it really design better?', 'How do I start?'],
  message: 'Your coding agent designs like a designer, not like a template.',
  sections: [
    { name: 'hero', question: 'What is it?', says: 'One skill that makes the agent look before it builds.', shows: 'The OMD mark lit as the hero object.' },
    { name: 'proof', question: 'Does it really design better?', says: 'Same request, two results.', shows: 'The bakery page before and after, large.' },
    { name: 'install', question: 'How do I start?', says: 'Install and run one command.', shows: 'The install command.' },
  ],
  cut: [{ what: 'The internal review loop and its stages', why: 'Visitors need the result, not the pipeline.' }],
  concept: { source: 'The OMD mark: a square body with black-edged handles', idea: 'The mark becomes the handle that lifts a page out of the template', typeAndGraphic: 'The headline wraps the mark' },
  directions: { options: ['The mark as a selection handle that lifts a page out of the template',
    'A split screen where the same request becomes two pages', 'A terminal that renders the page it describes'],
    chosen: 'The mark as a selection handle that lifts a page out of the template', why: 'Only OMD owns the handle; the others fit any AI builder.' },
  onlyThisProduct: 'The square body with handles selecting the hero line; no other harness has that mark.',
  heroProof: { mode: 'real-output', shows: 'The bakery page OMD produced from a one-line request, beside the generic one.',
    because: 'Minji believes a result she can see, not a promise.' },
  decisions: {
    ground: { choice: 'white', because: 'The brand kit shows the mark on white; the oven-light orange needs a neutral ground.' },
    accent: { choice: '#ff4a1c', because: 'The oven-light gradient of the OMD mark.' },
    type: { choice: 'Geist display with Pretendard body', because: 'The lockup is set in Geist SemiBold; Korean body needs Pretendard.' },
    layout: { choice: 'one large statement per screen', because: 'Three visitor questions, each answered by one claim and one graphic.' },
  },
  motion: 'The before page lifts into the after page as the visitor scrolls.',
  voice: 'Plain, confident 합니다체.',
};

test('a brief names the visitor, one message, a section per question, its cuts and a concept', () => {
  assert.equal(parseDesignBrief(brief).sections.length, 3);
  assert.throws(() => parseDesignBrief(DESIGN_BRIEF_SKELETON), /placeholder/);
  assert.throws(() => parseDesignBrief({ ...brief, cut: [] }), /cut must list/);
  assert.throws(() => parseDesignBrief({ ...brief, sections: [...brief.sections, { name: 'loop', question: 'How does the loop work?', says: 'x', shows: 'y' }] }),
    /sections\[3\]\.question must repeat one of visitorQuestions/);
  assert.throws(() => parseDesignBrief({ ...brief, sections: undefined }), /sections must list/);
  assert.throws(() => parseDesignBrief({ ...brief, extra: true }), /unknown keys: extra/);
  // Go wide, then choose; and every visual decision names where it comes from.
  assert.throws(() => parseDesignBrief({ ...brief, directions: { ...brief.directions, options: brief.directions.options.slice(0, 2) } }), /three or more distinct/);
  assert.throws(() => parseDesignBrief({ ...brief, directions: { ...brief.directions, chosen: 'Something else' } }), /chosen must repeat/);
  for (const because of ['모던하고 깔끔하게', 'clean, modern and minimal']) {
    assert.throws(() => parseDesignBrief({ ...brief, decisions: { ...brief.decisions, accent: { choice: '#16a34a', because } } }), /chooses nothing/);
  }
  assert.throws(() => parseDesignBrief({ ...brief, sections: [brief.sections[0], { ...brief.sections[1], name: 'HERO' }] }), /name must be distinct/);
  // Named visitors with a job, at most three; the hero's proof is one of the named modes.
  assert.throws(() => parseDesignBrief({ ...brief, personas: [] }), /personas must list/);
  assert.throws(() => parseDesignBrief({ ...brief, personas: Array(4).fill(brief.personas[0]) }), /one to three/);
  assert.throws(() => parseDesignBrief({ ...brief, personas: [{ ...brief.personas[0], dealBreaker: '' }] }), /personas\[0\]\.dealBreaker/);
  assert.throws(() => parseDesignBrief({ ...brief, heroProof: { ...brief.heroProof, mode: 'stock-photo' } }), /heroProof\.mode must be one of/);
  assert.equal(parseDesignBrief({ ...brief, heroProof: { ...brief.heroProof, mode: 'working-product' } }).heroProof.mode, 'working-product');
});
