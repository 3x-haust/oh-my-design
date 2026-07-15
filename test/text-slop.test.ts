import test from 'node:test';
import assert from 'node:assert/strict';
import { scanTextSlop, type TextSlopCandidateId } from '../core/slop/text-slop.ts';

function ids(text: string): TextSlopCandidateId[] {
  return scanTextSlop(text).map((item) => item.candidateId);
}

const detectorCases: Array<{
  id: TextSlopCandidateId;
  positive: string;
  negative: string;
}> = [
  {
    id: 'fast-paced-world',
    positive: "In today's fast-paced world, teams need clarity fast.",
    negative: 'The world moves quickly for many teams today.',
  },
  {
    id: 'unlock-the-power',
    positive: 'Unlock the power of automation for your workflow.',
    negative: 'Turn on automation for your workflow.',
  },
  {
    id: 'elevate-your',
    positive: 'Elevate your morning routine with our new blend.',
    negative: 'Improve your morning routine with our new blend.',
  },
  {
    id: 'seamless-collocation',
    positive: 'Seamlessly integrate your calendar with the app.',
    negative: 'This is a seamless product that just works.',
  },
  {
    id: 'important-to-note',
    positive: "It's important to note that pricing may vary by region.",
    negative: 'Pricing may vary depending on region.',
  },
  {
    id: 'delve-into',
    positive: "Let's delve into the details of the API.",
    negative: "Let's look at the details of the API.",
  },
  {
    id: 'game-changer',
    positive: 'This feature is a total game-changer for our team.',
    negative: 'This feature changed our game plan for the season.',
  },
  {
    id: 'cutting-edge',
    positive: 'Our cutting-edge sensor array outperforms rivals.',
    negative: 'Our sensor has a sharp cutting edge blade.',
  },
  {
    id: 'revolutionize',
    positive: 'This approach will revolutionize how teams collaborate.',
    negative: 'This approach will change how teams collaborate.',
  },
  {
    id: 'end-of-the-day',
    positive: 'At the end of the day, users just want speed.',
    negative: 'By the end of the week, users just want speed.',
  },
  {
    id: 'ko-journey-metaphor',
    positive: '성장의 여정을 담아 이 사이트를 만들었습니다.',
    negative: '부산에서 서울까지 여정은 다섯 시간이 걸립니다.',
  },
  {
    id: 'ko-story-vessel',
    positive: '아홉 개 프로젝트의 이야기를 담았습니다.',
    negative: '프로젝트 이야기를 짧게 정리해 보여드립니다.',
  },
  {
    id: 'ko-melt-in',
    positive: '측정한 데이터를 코드로 녹여냈습니다.',
    negative: '얼음이 물에 천천히 녹습니다.',
  },
  {
    id: 'ko-craft-mold',
    positive: '장인의 손길로 빚어낸 결과물입니다.',
    negative: '반죽을 손으로 직접 빚습니다.',
  },
  {
    id: 'ko-bestow',
    positive: '사용자에게 특별한 경험을 선사합니다.',
    negative: '선사 시대의 유물을 전시합니다.',
  },
  {
    id: 'supercharge-your',
    positive: 'Supercharge your workflow with automation.',
    negative: 'This tool speeds up your deploy pipeline by caching builds.',
  },
  {
    id: 'work-smarter',
    positive: 'Work smarter, not harder, with our assistant.',
    negative: 'The team works in two-week iterations.',
  },
  {
    id: 'unlock-your',
    positive: 'Unlock your creativity with one prompt.',
    negative: 'Unlock the door with your badge at the north entrance.',
  },
  {
    id: 'ai-powered',
    positive: 'Your AI-powered assistant drafts replies for you.',
    negative: 'The dashboard is powered by a Postgres read replica.',
  },
  {
    id: 'ten-x-hype',
    positive: '10x your productivity this quarter.',
    negative: 'The office is 10x20 metres with room for forty desks.',
  },
  {
    id: 'no-code-required',
    positive: 'Build an app with no code required.',
    negative: 'The migration required a code review before merge.',
  },
  {
    id: 'the-future-of',
    positive: 'The future of work is autonomous agents.',
    negative: 'We shipped the feature ahead of the future release train.',
  },
  {
    id: 'next-generation',
    positive: 'A next-generation platform for teams.',
    negative: 'The next generator in the sequence produces prime numbers.',
  },
  {
    id: 'heavy-lifting',
    positive: 'Let AI do the heavy lifting for your inbox.',
    negative: 'The crane handles heavy loads on the north dock.',
  },
  {
    id: 'effortless-creation',
    positive: 'Effortless creation for every marketer.',
    negative: 'The onboarding took real effort but paid off.',
  },
];

for (const fixture of detectorCases) {
  test(`${fixture.id}: cliche phrase in copy is a candidate`, () => {
    assert.ok(ids(fixture.positive).includes(fixture.id));
  });

  test(`${fixture.id}: nearby but distinct phrasing stays clear`, () => {
    assert.ok(!ids(fixture.negative).includes(fixture.id));
  });

  test(`${fixture.id}: same phrase inside a fenced code block is masked`, () => {
    const text = ['Intro line.', '```', fixture.positive, '```', 'Outro line.'].join('\n');
    assert.ok(!ids(text).includes(fixture.id));
  });

  test(`${fixture.id}: same phrase inside inline code is masked`, () => {
    const text = `See \`${fixture.positive}\` for reference.`;
    assert.ok(!ids(text).includes(fixture.id));
  });
}

test('empty string returns an empty array', () => {
  assert.deepEqual(scanTextSlop(''), []);
});

test('detection is case-insensitive', () => {
  assert.ok(ids('CUTTING-EDGE performance for every release.').includes('cutting-edge'));
  assert.ok(ids('DELVE INTO the roadmap below.').includes('delve-into'));
});

test('a curly apostrophe variant still matches', () => {
  assert.ok(ids("In today\u2019s fast-paced world, speed wins.").includes('fast-paced-world'));
  assert.ok(ids("It\u2019s important to note that limits apply.").includes('important-to-note'));
});

test('every candidate is shaped as a non-gating writer-owned advisory', () => {
  const [candidate] = scanTextSlop('Unlock the power of automation for your workflow.');
  assert.ok(candidate);
  assert.equal(candidate!.owner, 'writer');
  assert.equal(candidate!.gating, false);
  assert.equal(typeof candidate!.reason, 'string');
  assert.ok(candidate!.reason.length > 0);
  assert.equal(typeof candidate!.reviewQuestion, 'string');
  assert.ok(candidate!.reviewQuestion.length > 0);
  assert.deepEqual(candidate!.signals, ['unlock-the-power']);
  assert.equal(candidate!.phrase, 'Unlock the power of');
});

test('line numbers are computed from the original, unmasked text', () => {
  const text = ['First line stays clean.', 'Second line has a game-changer moment.'].join('\n');
  const [candidate] = scanTextSlop(text);
  assert.ok(candidate);
  assert.equal(candidate!.candidateId, 'game-changer');
  assert.equal(candidate!.line, 2);
});

test('multiple distinct phrases in one text are all reported', () => {
  const text = "In today's fast-paced world, let's delve into cutting-edge tools.";
  const found = ids(text);
  assert.ok(found.includes('fast-paced-world'));
  assert.ok(found.includes('delve-into'));
  assert.ok(found.includes('cutting-edge'));
});
