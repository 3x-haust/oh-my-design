/**
 * Product footage: a recording of the real running product, not a redrawn scene.
 *
 * The page is driven through real browser input (pointer moves, clicks, typing, wheel) at twice
 * the viewport's pixel density, so the product behaves exactly as it ships. A visible cursor is
 * an overlay that ignores input and never changes layout. The camera — zooming toward the action
 * and back out — is applied afterwards to the recorded frames, so it can never move a click target
 * or alter the interface. Compositing and MP4 encoding run in the same Chromium that recorded, so
 * no external encoder, account or key is needed.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'playwright';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import type { Viewport } from './index.ts';
import { browserCallback } from '../ref/browser-evaluation.ts';
import { resolveRenderTarget } from './serve.ts';

export const PRODUCT_FOOTAGE_STEPS_SCHEMA = 'product-footage-steps-v1';

export type FootageStep = Readonly<{
  do: 'wait' | 'move' | 'hover' | 'click' | 'type' | 'press' | 'scroll';
  /** CSS selector of the element acted on (move, hover, click, type). */
  target?: string;
  text?: string;
  key?: string;
  /** wait: duration; other steps: how long to hold after acting. */
  ms?: number;
  /** scroll: pixels to scroll (negative scrolls up). */
  by?: number;
  /** Camera zoom toward the action; 1 keeps the full frame. */
  focus?: number;
}>;

export type CameraKey = Readonly<{ t: number; zoom: number; x: number; y: number }>;

export type ProductFootage = Readonly<{
  schema: 'product-footage-v1';
  target: string;
  viewport: Viewport;
  durationSeconds: number;
  camera: readonly CameraKey[];
  steps: readonly FootageStep[];
  files: readonly string[];
}>;

const ACTIONS = new Set(['wait', 'move', 'hover', 'click', 'type', 'press', 'scroll']);
const TARGETED = new Set(['move', 'hover', 'click', 'type']);
// Browser screencast frames arrive at CSS pixels, so a deeper zoom only enlarges softness.
const DEFAULT_FOCUS = 1.5;
/** Seconds the camera takes to move between framings. */
const CAMERA_EASE = 0.7;

function fail(reason: string): never { throw new Error(`PRODUCT_FOOTAGE: ${reason}`); }

export function parseFootageSteps(value: unknown): readonly FootageStep[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('steps file must be an object');
  const input = value as Record<string, unknown>;
  if (input.schema !== PRODUCT_FOOTAGE_STEPS_SCHEMA) fail(`steps.schema must be ${PRODUCT_FOOTAGE_STEPS_SCHEMA}`);
  if (!Array.isArray(input.steps) || input.steps.length === 0 || input.steps.length > 60) fail('steps must list 1-60 actions');
  return input.steps.map((raw, index): FootageStep => {
    const at = `steps[${index}]`;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) fail(`${at} must be an object`);
    const step = raw as Record<string, unknown>;
    const allowed = new Set(['do', 'target', 'text', 'key', 'ms', 'by', 'focus']);
    for (const key of Object.keys(step)) if (!allowed.has(key)) fail(`${at}.${key} is not a step field`);
    if (typeof step.do !== 'string' || !ACTIONS.has(step.do)) fail(`${at}.do must be one of ${[...ACTIONS].join(', ')}`);
    if (TARGETED.has(step.do) && (typeof step.target !== 'string' || step.target.trim() === '')) fail(`${at}.target is required for ${step.do}`);
    if (step.do === 'type' && typeof step.text !== 'string') fail(`${at}.text is required for type`);
    if (step.do === 'press' && typeof step.key !== 'string') fail(`${at}.key is required for press`);
    if (step.do === 'scroll' && (typeof step.by !== 'number' || !Number.isFinite(step.by))) fail(`${at}.by is required for scroll`);
    if (step.ms !== undefined && (typeof step.ms !== 'number' || step.ms < 0 || step.ms > 15_000)) fail(`${at}.ms must be 0-15000`);
    if (step.focus !== undefined && (typeof step.focus !== 'number' || step.focus < 1 || step.focus > 3)) fail(`${at}.focus must be 1-3`);
    return step as FootageStep;
  });
}

const ease = (s: number) => s * s * (3 - 2 * s);

/** Camera framing at time t: hold each key, then ease into the next over CAMERA_EASE seconds before it. */
export function cameraAt(keys: readonly CameraKey[], t: number): { zoom: number; x: number; y: number } {
  let current = keys[0] ?? { t: 0, zoom: 1, x: 0.5, y: 0.5 };
  for (const next of keys.slice(1)) {
    const start = next.t - CAMERA_EASE;
    if (t < start) return current;
    if (t < next.t) {
      const s = ease((t - start) / CAMERA_EASE);
      return { zoom: current.zoom + (next.zoom - current.zoom) * s,
        x: current.x + (next.x - current.x) * s, y: current.y + (next.y - current.y) * s };
    }
    current = next;
  }
  return current;
}

// A drawn pointer that follows real input. pointer-events:none and a fixed top layer mean it never
// receives events or changes layout; the product underneath is untouched.
const CURSOR_SOURCE = `(() => {
  const mount = () => {
    if (document.getElementById('__omd_cursor')) return;
    const cursor = document.createElement('div');
    cursor.id = '__omd_cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:scale 120ms ease-out;';
    cursor.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2l15 8.2-6.4 1.6L8.3 18z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(cursor);
    addEventListener('mousemove', e => { cursor.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)'; }, true);
    addEventListener('mousedown', e => {
      cursor.style.scale = '0.82';
      const ring = document.createElement('div');
      ring.setAttribute('aria-hidden', 'true');
      ring.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;width:36px;height:36px;border-radius:50%;border:2px solid rgba(17,17,17,.45);left:' + (e.clientX - 18) + 'px;top:' + (e.clientY - 18) + 'px;';
      document.documentElement.appendChild(ring);
      ring.animate([{ opacity: 1, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.4)' }], { duration: 420, easing: 'ease-out' }).finished.then(() => ring.remove());
    }, true);
    addEventListener('mouseup', () => { cursor.style.scale = '1'; }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mount); else mount();
})();`;

type Point = { x: number; y: number };
/** Small deterministic generator: the same steps record the same hand. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (const char of seed) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/**
 * A hand, not a tween: it lands a little off the exact centre, travels a gently curved and slightly unsteady path,
 * accelerates and settles with an uneven speed, overshoots and corrects on long moves, and takes a Fitts-like time
 * for the distance and target size with natural variation. Returns points with the delay before each one.
 */
export function humanPath(from: Point, box: { x: number; y: number; width: number; height: number }, random: () => number): { to: Point; points: { x: number; y: number; ms: number }[] } {
  const spread = (size: number) => (random() - 0.5) * size * 0.36;
  const to = { x: box.x + box.width / 2 + spread(box.width), y: box.y + box.height / 2 + spread(box.height) };
  const dx = to.x - from.x, dy = to.y - from.y, distance = Math.hypot(dx, dy);
  if (distance < 2) return { to, points: [{ ...to, ms: 16 }] };
  const width = Math.max(8, Math.min(box.width, box.height));
  const duration = (230 + 150 * Math.log2(distance / width + 1)) * (0.85 + random() * 0.3);
  const frames = Math.max(10, Math.round(duration / 16));
  // One bend to a random side, proportional to the distance.
  const bend = (random() < 0.5 ? -1 : 1) * distance * (0.06 + random() * 0.12);
  const control = { x: from.x + dx * (0.35 + random() * 0.2) - dy / distance * bend, y: from.y + dy * (0.35 + random() * 0.2) + dx / distance * bend };
  const overshoot = distance > 260 ? 0.02 + random() * 0.03 : 0;
  // Minimum-jerk progress, time-warped so the speed peaks early (a quicker start, a longer settle).
  const peak = 0.36 + random() * 0.12, warp = Math.log(0.5) / Math.log(peak);
  const progress = (u: number) => { const x = u ** warp; return 10 * x ** 3 - 15 * x ** 4 + 6 * x ** 5; };
  const reach = overshoot ? 0.88 : 1;
  const points: { x: number; y: number; ms: number }[] = [];
  let wobbleX = 0, wobbleY = 0;
  for (let index = 1; index <= frames; index += 1) {
    const u = index / frames;
    // Travel to just past the target, then correct back during the last frames.
    const s = u <= reach ? progress(u / reach) * (1 + overshoot) : 1 + overshoot * (1 - progress((u - reach) / (1 - reach)));
    const t = Math.min(1, s), past = Math.max(0, s - 1) * distance;
    const bx = (1 - t) ** 2 * from.x + 2 * (1 - t) * t * control.x + t * t * to.x;
    const by = (1 - t) ** 2 * from.y + 2 * (1 - t) * t * control.y + t * t * to.y;
    wobbleX = wobbleX * 0.7 + (random() - 0.5) * 1.2; wobbleY = wobbleY * 0.7 + (random() - 0.5) * 1.2;
    const steady = index === frames ? 0 : 1;
    points.push({ x: bx + dx / distance * past + wobbleX * steady, y: by + dy / distance * past + wobbleY * steady, ms: 16 * (0.8 + random() * 0.4) });
  }
  points.push({ ...to, ms: 40 + random() * 60 });
  return { to, points };
}

async function glide(page: Page, path: { points: readonly { x: number; y: number; ms: number }[] }): Promise<void> {
  for (const point of path.points) {
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(point.ms);
  }
}

async function record(page: Page, steps: readonly FootageStep[], viewport: Viewport, startedAt: number) {
  const clock = () => (Date.now() - startedAt) / 1000;
  const camera: CameraKey[] = [{ t: 0, zoom: 1, x: 0.5, y: 0.5 }];
  const wide = () => {
    const last = camera.at(-1);
    if (last && last.zoom !== 1) camera.push({ t: clock() + CAMERA_EASE, zoom: 1, x: 0.5, y: 0.5 });
  };
  let pointer = { x: viewport.width / 2, y: viewport.height * 0.62 };
  await page.mouse.move(pointer.x, pointer.y);
  for (const [index, step] of steps.entries()) {
    if (step.do === 'wait') { await page.waitForTimeout(step.ms ?? 800); continue; }
    if (step.do === 'press') { await page.keyboard.press(step.key ?? 'Enter'); await page.waitForTimeout(step.ms ?? 600); continue; }
    if (step.do === 'scroll') {
      wide();
      const ticks = Math.max(1, Math.round(Math.abs(step.by ?? 0) / 120));
      for (let tick = 0; tick < ticks; tick += 1) {
        await page.mouse.wheel(0, Math.sign(step.by ?? 0) * Math.abs(step.by ?? 0) / ticks);
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(step.ms ?? 700);
      continue;
    }
    const locator = page.locator(step.target ?? '').first();
    if (await locator.count() === 0) fail(`steps[${index}].target matched nothing: ${step.target}`);
    await locator.scrollIntoViewIfNeeded({ timeout: 5_000 });
    const box = await locator.boundingBox();
    if (box === null) fail(`steps[${index}].target is not visible: ${step.target}`);
    const path = humanPath(pointer, box, seededRandom(`${index}:${step.do}:${step.target}`));
    const to = path.to;
    const zoom = step.focus ?? (step.do === 'move' ? 1 : DEFAULT_FOCUS);
    const arrive = clock() + 0.45;
    if (zoom > 1) camera.push({ t: arrive, zoom, x: to.x / viewport.width, y: to.y / viewport.height });
    await glide(page, path);
    pointer = to;
    if (step.do === 'click') {
      await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up();
    } else if (step.do === 'type') {
      await page.mouse.down(); await page.mouse.up();
      await page.keyboard.type(step.text ?? '', { delay: 55 });
    }
    await page.waitForTimeout(step.ms ?? 900);
    const next = steps[index + 1];
    if (next === undefined || !TARGETED.has(next.do) || next.focus === 1) wide();
  }
  wide();
  await page.waitForTimeout(CAMERA_EASE * 1000 + 600);
  return { camera, duration: clock() };
}

// Plays the raw recording into a canvas with the camera applied and encodes it with MediaRecorder.
const COMPOSITE_PAGE = `<!doctype html><html><body style="margin:0;background:#000">
<video id="v" muted playsinline style="display:none"></video><canvas id="c"></canvas></body></html>`;

async function composite(rawPath: string, camera: readonly CameraKey[], output: Viewport): Promise<{ mp4: Buffer; poster: Buffer }> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
    const origin = 'http://omd-footage.local';
    await page.route(`${origin}/**`, route => route.request().url().endsWith('/raw.webm')
      ? route.fulfill({ body: readFileSync(rawPath), contentType: 'video/webm' })
      : route.fulfill({ body: COMPOSITE_PAGE, contentType: 'text/html' }));
    await page.goto(`${origin}/`);
    const encoded = await page.evaluate(browserCallback(async ({ keys, width, height, ease: easeSeconds }: {
      keys: readonly CameraKey[]; width: number; height: number; ease: number;
    }) => {
      const smooth = (s: number) => s * s * (3 - 2 * s);
      const frame = (t: number) => {
        let current = keys[0] ?? { t: 0, zoom: 1, x: 0.5, y: 0.5 };
        for (const next of keys.slice(1)) {
          const start = next.t - easeSeconds;
          if (t < start) return current;
          if (t < next.t) {
            const s = smooth((t - start) / easeSeconds);
            return { t, zoom: current.zoom + (next.zoom - current.zoom) * s,
              x: current.x + (next.x - current.x) * s, y: current.y + (next.y - current.y) * s };
          }
          current = next;
        }
        return current;
      };
      const video = document.getElementById('v') as HTMLVideoElement;
      const canvas = document.getElementById('c') as HTMLCanvasElement;
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('canvas unavailable');
      context.imageSmoothingQuality = 'high';
      video.src = '/raw.webm';
      await new Promise<void>((done, reject) => { video.onloadeddata = () => done(); video.onerror = () => reject(new Error('raw recording unreadable')); });
      const draw = () => {
        const { zoom, x, y } = frame(video.currentTime);
        const sw = video.videoWidth / zoom, sh = video.videoHeight / zoom;
        const sx = Math.min(Math.max(x * video.videoWidth - sw / 2, 0), video.videoWidth - sw);
        const sy = Math.min(Math.max(y * video.videoHeight - sh / 2, 0), video.videoHeight - sh);
        context.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
      };
      draw();
      const poster = canvas.toDataURL('image/png').split(',')[1] ?? '';
      const type = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.640028') ? 'video/mp4;codecs=avc1.640028' : 'video/mp4';
      const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 10_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size > 0) chunks.push(event.data); };
      const stopped = new Promise<void>(done => { recorder.onstop = () => done(); });
      const paint = () => { draw(); if (!video.ended) video.requestVideoFrameCallback(paint); };
      video.requestVideoFrameCallback(paint);
      recorder.start(250);
      await video.play();
      await new Promise<void>(done => { video.onended = () => done(); });
      draw();
      await new Promise(done => setTimeout(done, 120));
      recorder.stop();
      await stopped;
      const bytes = new Uint8Array(await new Blob(chunks, { type }).arrayBuffer());
      let binary = '';
      for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      return { mp4: btoa(binary), poster };
    }), { keys: camera, width: output.width, height: output.height, ease: CAMERA_EASE });
    return { mp4: Buffer.from(encoded.mp4, 'base64'), poster: Buffer.from(encoded.poster, 'base64') };
  } finally { await browser.close(); }
}

export async function recordProductFootage(
  target: string,
  opts: Readonly<{ viewport: Viewport; steps: readonly FootageStep[]; outDir: string; adapter: ProjectWriteAdapter }>,
): Promise<ProductFootage> {
  const { chromium } = await import('playwright');
  const resolved = await resolveRenderTarget(target);
  const scratch = mkdtempSync(join(tmpdir(), 'omd-footage-'));
  const scale = 2;
  try {
    const browser = await chromium.launch({ headless: true, timeout: 30_000 });
    let rawPath: string;
    let recorded: Awaited<ReturnType<typeof record>>;
    try {
      const context = await browser.newContext({
        viewport: opts.viewport, deviceScaleFactor: scale, serviceWorkers: 'block',
        recordVideo: { dir: scratch, size: { width: opts.viewport.width, height: opts.viewport.height } },
      });
      await context.addInitScript({ content: CURSOR_SOURCE });
      const page = await context.newPage();
      const startedAt = Date.now();
      await page.goto(resolved.url, { waitUntil: 'load', timeout: 30_000 });
      await page.waitForTimeout(700);
      recorded = await record(page, opts.steps, opts.viewport, startedAt);
      const video = page.video();
      await context.close();
      if (video === null) fail('the browser produced no recording');
      rawPath = await video.path();
    } finally { await browser.close(); }
    // Output keeps the viewport's size and aspect; deviceScaleFactor still sharpens text rasterisation.
    const width = Math.min(1920, opts.viewport.width);
    const output = { width, height: Math.round(width * opts.viewport.height / opts.viewport.width / 2) * 2 };
    const { mp4, poster } = await composite(rawPath, recorded.camera, output);
    const outDir = opts.outDir.replace(/\/+$/, '');
    opts.adapter.mkdir(outDir);
    const files = [
      opts.adapter.write(join(outDir, 'footage.mp4'), mp4),
      opts.adapter.write(join(outDir, 'poster.png'), poster),
    ];
    const footage: ProductFootage = { schema: 'product-footage-v1', target, viewport: opts.viewport,
      durationSeconds: Math.round(recorded.duration * 100) / 100, camera: recorded.camera, steps: opts.steps, files };
    files.push(opts.adapter.write(join(outDir, 'footage.json'), `${JSON.stringify(footage, null, 2)}\n`));
    return { ...footage, files };
  } finally {
    await resolved.close();
    rmSync(scratch, { recursive: true, force: true });
  }
}
