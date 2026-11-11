import assert from 'node:assert/strict';
import test from 'node:test';
import { THIN_GALLERIES } from '../core/thin/capture.ts';
import { assertRobotsAllow, clearRobotsCache, parseRobots, robotsAllow } from '../core/thin/robots.ts';

const allow = (text: string, path: string) => robotsAllow(parseRobots(text), path);

test('an AI crawler group that disallows everything closes the site even when * is open', () => {
  const text = 'User-agent: ClaudeBot\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n';
  assert.equal(allow(text, '/search/projects?search=ui'), false);
});

test('a group for agents that fetch for a person speaks over the crawler group', () => {
  const text = 'User-agent: ClaudeBot\nDisallow: /\n\nUser-agent: Claude-User\nAllow: /\n';
  assert.equal(allow(text, '/search/elements/type'), true);
});

test('with no AI group, the * group decides by longest match', () => {
  const text = 'User-agent: *\nDisallow: /gallery\nAllow: /gallery/open$\n';
  assert.equal(allow(text, '/gallery/123'), false);
  assert.equal(allow(text, '/gallery/open'), true);
  assert.equal(allow(text, '/shots/1'), true);
  assert.equal(allow('User-agent: *\nDisallow: /*?*\n', '/search?q=x'), false);
  assert.equal(allow('User-agent: *\nDisallow:\n', '/anything'), true);
});

test('assertRobotsAllow refuses a closed URL, opens an allowed one, and never checks loopback', async () => {
  clearRobotsCache();
  const robots = new Map([
    ['https://closed.example/robots.txt', { status: 200, text: 'User-agent: GPTBot\nDisallow: /\n' }],
    ['https://open.example/robots.txt', { status: 200, text: 'User-agent: *\nDisallow: /private\n' }],
    ['https://missing.example/robots.txt', { status: 404, text: '' }],
  ]);
  const fetcher = async (url: string) => robots.get(url) ?? null;
  await assert.rejects(assertRobotsAllow('https://closed.example/search?q=a', fetcher), /asks AI agents not to open/);
  await assertRobotsAllow('https://open.example/shots/1', fetcher);
  await assert.rejects(assertRobotsAllow('https://open.example/private/x', fetcher), /asks AI agents not to open/);
  await assertRobotsAllow('https://missing.example/a', fetcher);
  await assert.rejects(assertRobotsAllow('https://down.example/a', fetcher), /could not be read/);
  await assertRobotsAllow('http://127.0.0.1:7170/', async () => { throw new Error('loopback must not be fetched'); });
});

test('the loop offers no gallery that asks AI agents to stay out', () => {
  assert.deepEqual([...THIN_GALLERIES].sort(), ['cosmos', 'dribbble', 'siteinspire']);
});
