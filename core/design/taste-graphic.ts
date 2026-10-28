import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, normalize, posix } from 'node:path';
import { canonicalJson } from '../ref/canonical-json.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { loadRefs } from '../ref/store.ts';
import { verifyBrowseRetention } from '../ref/browse/retention.ts';
import { withBrowser } from '../render/index.ts';
import { RASTER_DOMINANT_SHARE, readGraphicRenderRecord, WEBGL_GRAPHIC_SHARE } from '../render/graphic-render-record.ts';
import { readPersistedRoute } from '../route/index.ts';
import { motionRequired } from './new-surface-advisories.ts';
import { ideaImages, ideationRecorded } from './idea-image.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { getNativePiRun } from '../runtime/native-pi-run.ts';
import { verifySignedPiEyeRoleResult } from '../runtime/pi-role-receipt.ts';
import { acquireProjectMutationLock, createProjectWriteAdapter } from '../runtime/project-write.ts';
import { signNativeObservation } from '../runtime/self-signed-activation.ts';
import { runPiTasteComparisonReviewers } from '../../adapters/pi-reviewer-runtime.ts';
import { piParse } from '../../adapters/pi-reviewer-contract.ts';
import {
  TASTE_COMPARISON_REVIEW_HANDBACK, TASTE_COMPARISON_REVIEW_TRANSPORT, TASTE_GRAPHIC_REVIEW_TASK, TASTE_LABELS, TASTE_VIEWPORTS,
  parseTasteComparisonReview, tasteRenderBinding, type TasteComparisonReviewBindings, type TasteLabel,
} from './taste-comparison-contract.ts';
import { informativeRate, TASTE_DISTINGUISHABLE_RATE, type TasteTrialOrder } from './taste-comparison-record.ts';
import { TASTE_REPAIR_ROUNDS } from './taste-comparison.ts';
import { countedRounds, graphicThumb, TASTE_GRAPHIC_DIRECTORY, TASTE_GRAPHIC_RECORD_SCHEMA } from './taste-graphic-decision.ts';
export { TASTE_GRAPHIC_DIRECTORY, TASTE_GRAPHIC_RECORD_SCHEMA } from './taste-graphic-decision.ts';

/**
 * One rendered graphic judged blind against graphics the agent kept from real galleries. A single
 * reviewer passes AI-made art; set beside human work, the same reviewer can tell them apart.
 */
const MAX_ANCHORS = 3;
const CANVAS = TASTE_VIEWPORTS.desktop;
const ORDERS = Object.freeze(['project-first', 'anchor-first'] as const);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const fail = (reason: string): never => { throw new Error(`TASTE_GRAPHIC_REFUSED: ${reason}`); };

type Image = Readonly<{ path: string; sha256: string; bytes: Buffer }>;
export type TasteGraphicTrial = Readonly<{
  anchorPath: string; anchorSha256: string; order: TasteTrialOrder; projectLabel: TasteLabel; human: TasteLabel;
  projectJudgedAi: boolean; confidence: number; aiTells: readonly string[]; humanSignals: readonly string[];
  bindings: TasteComparisonReviewBindings; packetSha256: string; roleResult: unknown;
}>;
export type TasteGraphicSummary = Readonly<{ judgedAi: number; trials: number; rate: number;
  verdict: 'distinguishable' | 'not-distinguishable'; recurringTells: readonly string[] }>;
export type TasteGraphicResult = Readonly<{ path: string; sha256: string; id: string; graphic: string;
  anchors: readonly string[]; summary: TasteGraphicSummary;
  trials: readonly Omit<TasteGraphicTrial, 'bindings' | 'packetSha256' | 'roleResult'>[]; round: number; next: string }>;

function relativePath(value: string, label: string): string {
  const path = normalize(value).split('\\').join('/');
  if (path.startsWith('/') || path.startsWith('../') || path === '..') return fail(`${label} must be a path inside the project`);
  return posix.normalize(path);
}

function png(root: string, path: string, label: string): Image {
  const bytes = readContainedRegularFile(root, path, label);
  if (!bytes.subarray(0, 8).equals(PNG)) return fail(`${label} ${path} is not a PNG`);
  return { path, sha256: sha256(bytes), bytes };
}

/** The art the page ships: a rendered PNG in the project, never a design record. */
function projectGraphic(root: string, value: string, requireWebgl = false): Image {
  const path = relativePath(value, 'graphic');
  if (path.startsWith('.omd/')) return fail('graphic must be the rendered image the page uses, not a design record');
  const image = png(root, path, 'graphic');
  const rendered = readGraphicRenderRecord(root, image.sha256);
  if (rendered === null) return fail(`${path} was not rendered by omd render --graphic; build the graphic in code and render it with omd render --graphic --out ${path}`);
  if (rendered.largestRaster !== null && rendered.largestRaster.share >= RASTER_DOMINANT_SHARE) {
    return fail(`${rendered.largestRaster.src} covers ${Math.round(rendered.largestRaster.share * 100)}% of ${path}: a screenshot or photo placed in a frame `
      + 'is an image, not a graphic. Build the explanation in code: one moment of the mechanism, large and lit, that reads before the words do.');
  }
  if (requireWebgl && (rendered.loadedRasters ?? []).length) {
    return fail(`${path} maps ${rendered.loadedRasters!.join(', ')} onto its scene: a screenshot or photo on a 3D card is still a screenshot `
      + 'in a frame. Build the protagonist from geometry and material (the thing the product works on or turns out, mid-change) so the graphic acts out '
      + 'the claim itself, and render it again with omd render --graphic.');
  }
  if (requireWebgl && (rendered.webglShare ?? 0) < WEBGL_GRAPHIC_SHARE) {
    return fail(`${path} is drawn with HTML and CSS: cards, sheets, borders and labels make a diagram, not a graphic. Build the section's `
      + 'protagonist as a lit object in three.js (omd pack theory/imagegen.md, Objects in 3D: the thing the product works on or turns out, '
      + 'modelled from rounded geometry and caught mid-change, MeshPhysicalMaterial with clearcoat or transmission, RoomEnvironment light, one key light, a '
      + 'contact shadow), set window.__ready after the first frame, and render it again with omd render --graphic.');
  }
  return image;
}

/** Only an image the reference browser captured and content-addressed can stand for human work. */
export function keptAnchor(root: string, value: string): Image {
  const path = relativePath(value, 'anchor');
  // A sealed session's keeps live in .omd/refs; the record binds them to the signed capture.
  const retained = path.startsWith('.omd/refs/')
    ? loadRefs(root, { includeDomain: true }).find(reference => reference.imagePath === path && reference.browse !== undefined) : undefined;
  if (retained) {
    try { verifyBrowseRetention(root, retained); } catch { return fail(`anchor ${path} changed after capture`); }
    return png(root, path, 'anchor');
  }
  const image = path.startsWith('.omd/discovery/browse/') ? png(root, path, 'anchor')
    : fail(`--against ${value} is not a reference capture; pass the image.path of a graphic kept with omd ref browse keep, or its .omd/refs copy`);
  if (basename(path) !== `${image.sha256}.png`) return fail(`anchor ${path} changed after capture`);
  // A page merely opened in the browser is not a kept human graphic: the image must be one of the session's keeps.
  const seals = join(root, path.split('/').slice(0, 4).join('/'), 'seals');
  const kept = existsSync(seals) && readdirSync(seals).some(name => {
    try { return (JSON.parse(readFileSync(join(seals, name), 'utf8')) as { keeps?: { image?: { sha256?: unknown } }[] }).keeps
      ?.some(keep => keep.image?.sha256 === image.sha256) === true; } catch { return false; }
  });
  return kept ? image : fail(`anchor ${path} was never kept; keep a graphic with omd ref browse keep --reason "...", end the session, then pass its image.path`);
}

/** Both sides are fitted to one canvas on one ground, so size and background say nothing about the maker. */
async function fitToCanvas(images: readonly Image[]): Promise<Map<string, Buffer>> {
  const fitted = new Map<string, Buffer>();
  await withBrowser(async browser => {
    const page = await browser.newPage({ viewport: CANVAS });
    try {
      for (const image of images) {
        if (fitted.has(image.sha256)) continue;
        await page.setContent(`<!doctype html><body style="margin:0;width:${CANVAS.width}px;height:${CANVAS.height}px;background:#ececec;display:grid;place-items:center">`
          + `<img style="width:${CANVAS.width - 128}px;height:${CANVAS.height - 90}px;object-fit:contain;display:block" src="data:image/png;base64,${image.bytes.toString('base64')}"></body>`,
        { waitUntil: 'load' });
        fitted.set(image.sha256, await page.screenshot({ fullPage: false }));
      }
    } finally { await page.close(); }
  });
  return fitted;
}

export function tasteGraphicTrialSha256(input: Readonly<{ graphicSha256: string; anchorSha256: string; order: TasteTrialOrder }>): string {
  return sha256(canonicalJson({ subject: 'graphic', ...input }));
}

function trialPacket(invocation: ProjectRunInvocation, graphic: Image, anchor: Image, order: TasteTrialOrder, fitted: Map<string, Buffer>) {
  const renders = (order === 'project-first' ? [graphic, anchor] : [anchor, graphic]).map((image, index) => {
    const bytes = fitted.get(image.sha256)!;
    return { label: TASTE_LABELS[index]!, ...CANVAS, captureSha256: sha256(bytes), pngBase64: bytes.toString('base64') };
  });
  const evidence = { subject: 'graphic', renders };
  const bindings: TasteComparisonReviewBindings = {
    buildSha256: invocation.current.buildSha256, briefSha256: invocation.current.briefSha256,
    evidenceSha256: sha256(canonicalJson(evidence)), browserSha256: tasteRenderBinding(renders),
    trialSha256: tasteGraphicTrialSha256({ graphicSha256: graphic.sha256, anchorSha256: anchor.sha256, order }),
  };
  const packet = Buffer.from(canonicalJson({
    schema: TASTE_COMPARISON_REVIEW_TRANSPORT, evidenceSha256: bindings.evidenceSha256, evidence,
    outputContract: {
      lane: 'tasteComparison', schema: TASTE_COMPARISON_REVIEW_HANDBACK, fixedBindings: bindings,
      responseTemplate: { schema: TASTE_COMPARISON_REVIEW_HANDBACK, fixedBindings: bindings, human: null, confidence: null, aiTells: [], humanSignals: [] },
      requiredKeys: ['schema', 'fixedBindings', 'human', 'confidence', 'aiTells', 'humanSignals'],
      labels: TASTE_LABELS, confidenceRange: [0.5, 1], itemsPerList: [1, 6],
      rules: 'human is the label of the graphic a human designer made. confidence is a number from 0.5 to 1. aiTells describe the other graphic and humanSignals describe the chosen one; each item says where in the graphic it appears. Copy schema and fixedBindings exactly.',
    },
  }));
  return { anchor, order, bindings, packet };
}

export function summarizeTasteGraphicTrials(trials: readonly Pick<TasteGraphicTrial, 'anchorSha256' | 'order' | 'projectJudgedAi' | 'aiTells'>[]): TasteGraphicSummary {
  const judgedAi = trials.filter(trial => trial.projectJudgedAi).length;
  const rate = trials.length === 0 ? 0 : informativeRate(trials, trial => trial.anchorSha256);
  return { judgedAi, trials: trials.length, rate, verdict: rate >= TASTE_DISTINGUISHABLE_RATE ? 'distinguishable' : 'not-distinguishable',
    recurringTells: trials.filter(trial => trial.projectJudgedAi).flatMap(trial => trial.aiTells) };
}

/** Counted rounds of this graphic file for this brief, and whether the latest comparison counted as a new one. */
function graphicRound(root: string, briefSha256: string, graphicPath: string): Readonly<{ round: number; counted: boolean }> {
  const dir = join(root, TASTE_GRAPHIC_DIRECTORY);
  if (!existsSync(dir)) return { round: 1, counted: true };
  const records = readdirSync(dir).filter(name => name.endsWith('.json')).flatMap(name => {
    try {
      const record = JSON.parse(readFileSync(join(dir, name), 'utf8')) as { briefSha256?: unknown; graphic?: { path?: unknown }; createdAt?: unknown; thumb?: unknown };
      return record.briefSha256 === briefSha256 && record.graphic?.path === graphicPath
        ? [{ createdAt: String(record.createdAt ?? ''), ...(Array.isArray(record.thumb) ? { thumb: record.thumb.map(Number) } : {}) }] : [];
    } catch { return []; }
  });
  const round = countedRounds(records) || 1;
  return { round, counted: countedRounds(records.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, -1)) < round || records.length <= 1 };
}

export function tasteGraphicNext(verdict: TasteGraphicSummary['verdict'], round: number, graphic: string, ideas: readonly string[] = []): string {
  if (verdict === 'not-distinguishable') return `Not reliably told apart from the kept human graphics; keep ${graphic} and continue.`;
  if (round >= TASTE_REPAIR_ROUNDS) return `Round ${round} of ${TASTE_REPAIR_ROUNDS}: still told apart. Stop reworking ${graphic} for taste and report the remaining tells honestly.`;
  // The maker's own idea image usually already has what the build lost; closing that gap is the cheapest rework.
  const idea = ideas.length ? `Open your idea image (${ideas.join(', ')}) beside the render and name what the build lost — form, `
    + 'thickness, bevels, the bend of a sheet, printed surface detail, soft light and shadow — then build that back: rounded or bevelled '
    + 'geometry instead of bare boxes, a finely segmented sheet bent along its length, surface content drawn into a CanvasTexture, a '
    + 'soft contact shadow under the object rather than a hard cast shadow across the ground. ' : '';
  return `Round ${round} of ${TASTE_REPAIR_ROUNDS}: told apart. ${idea}When the tells name the composition itself — a document or card panel, `
    + `headings and captions inside the art, screenshots side by side, boxes and arrows — polishing keeps the cause: rebuild ${graphic} around `
    + 'a different single protagonist with form — one real interface element, an object or the brand\'s own material — at several times '
    + 'body-text scale, lit and layered, with the section\'s words left in the page; type alone is not a graphic. Otherwise rework the '
    + 'recurring tells — light, crop and scale. Do not copy the reference. Render it again with omd render --graphic, then run omd taste graphic again.';
}

export async function runTasteGraphic(root: string, invocation: ProjectRunInvocation,
  options: Readonly<{ graphic: string; against: readonly string[]; signal?: AbortSignal }>): Promise<TasteGraphicResult> {
  const run = getNativePiRun(invocation, root);
  // A new landing's section graphics are lit objects; elsewhere a coded diagram may be the right graphic.
  const landing = (() => { try { return motionRequired(readPersistedRoute(run.projectRoot, invocation)); } catch { return false; } })();
  if (landing && !ideationRecorded(run.projectRoot)) {
    return fail('explore the graphic before building it: generate a few idea images with omd imagegen --name <section> --prompt "<claim, '
      + 'protagonist object, material, light>" --reference <kept image path> (ideation only), choose the strongest, then build it in three.js');
  }
  const graphic = projectGraphic(run.projectRoot, options.graphic, landing);
  const against = [...new Set(options.against)];
  if (against.length === 0) return fail('pass --against <image.path> of a graphic you kept with omd ref browse keep (up to three)');
  if (against.length > MAX_ANCHORS) return fail(`at most ${MAX_ANCHORS} --against images`);
  const anchors = against.map(value => keptAnchor(run.projectRoot, value));
  if (anchors.some(anchor => anchor.sha256 === graphic.sha256)) return fail('the graphic cannot be its own anchor');
  const fitted = await fitToCanvas([graphic, ...anchors]);
  const plans = anchors.flatMap(anchor => ORDERS.map(order => trialPacket(invocation, graphic, anchor, order, fitted)));
  const roleResults = await runPiTasteComparisonReviewers({
    root: run.projectRoot, invocation, subject: 'graphic', ...(options.signal === undefined ? {} : { signal: options.signal }),
    trials: plans.map(plan => ({ packet: plan.packet,
      validateHandback: (final: string) => { parseTasteComparisonReview(piParse(final, 'taste-handback'), plan.bindings); } })),
  });
  const trials = plans.map((plan, index): TasteGraphicTrial => {
    const roleResult = roleResults[index];
    const verified = verifySignedPiEyeRoleResult(roleResult, run.projectRoot);
    if (verified.receipt.taskSha256 !== sha256(TASTE_GRAPHIC_REVIEW_TASK)
      || verified.receipt.reviewerEvidence.packetSha256 !== sha256(plan.packet)
      || verified.receipt.reviewerEvidence.evidenceSha256 !== plan.bindings.evidenceSha256
      || verified.receipt.provider !== run.host.provider || verified.receipt.model !== run.host.model) return fail('review execution binding');
    const review = parseTasteComparisonReview(piParse(verified.finalMessage, 'taste-handback'), plan.bindings);
    const projectLabel: TasteLabel = plan.order === 'project-first' ? 'A' : 'B';
    return { anchorPath: plan.anchor.path, anchorSha256: plan.anchor.sha256, order: plan.order, projectLabel, human: review.human,
      projectJudgedAi: review.human !== projectLabel, confidence: review.confidence, aiTells: review.aiTells,
      humanSignals: review.humanSignals, bindings: plan.bindings, packetSha256: sha256(plan.packet), roleResult };
  });
  const summary = summarizeTasteGraphicTrials(trials);
  const createdAt = new Date().toISOString();
  const id = `${createdAt.replace(/\D/g, '').slice(0, 14)}-${sha256(`${createdAt}\n${canonicalJson(trials.map(trial => trial.packetSha256))}`).slice(0, 8)}`;
  const body = { schema: TASTE_GRAPHIC_RECORD_SCHEMA, id, createdAt,
    buildSha256: invocation.current.buildSha256, briefSha256: invocation.current.briefSha256,
    graphic: { path: graphic.path, sha256: graphic.sha256 }, thumb: graphicThumb(readFileSync(join(run.projectRoot, graphic.path))),
    anchors: anchors.map(anchor => ({ path: anchor.path, sha256: anchor.sha256 })), trials, summary };
  const release = acquireProjectMutationLock(run.projectRoot, invocation);
  try {
    if (projectGraphic(run.projectRoot, graphic.path).sha256 !== graphic.sha256) return fail('the graphic changed during comparison');
    const bytes = Buffer.from(`${canonicalJson({ ...body,
      signature: signNativeObservation(run.projectRoot, TASTE_GRAPHIC_RECORD_SCHEMA, sha256(canonicalJson(body))) })}\n`);
    const path = `${TASTE_GRAPHIC_DIRECTORY}/${id}.json`;
    createProjectWriteAdapter(run.projectRoot, invocation).write(path, bytes);
    const { round, counted } = graphicRound(run.projectRoot, body.briefSha256, graphic.path);
    return { path, sha256: sha256(bytes), id, graphic: graphic.path, anchors: anchors.map(anchor => anchor.path), summary,
      round, next: counted || summary.verdict === 'not-distinguishable'
        ? tasteGraphicNext(summary.verdict, round, graphic.path, ideaImages(run.projectRoot).filter(idea => idea.kind === 'graphic').slice(-2).map(idea => idea.path))
        : `This render barely differs from the last compared one, so it is not a new round (still round ${round} of ${TASTE_REPAIR_ROUNDS}). `
          + 'Rework the graphic itself, not a nudge: a different protagonist, material, light or crop, then render and compare again.',
      trials: trials.map(({ bindings: _bindings, packetSha256: _packet, roleResult: _role, ...trial }) => trial) };
  } finally { release(); }
}

