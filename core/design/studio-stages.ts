import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import type { readPersistedRoute } from '../route/index.ts';
import { requestSuppliesFigmaTarget } from './consulted-references.ts';
import { ideaImages, ideationUnavailable, type IdeaKind } from './idea-image.ts';
import { newSurface } from './new-surface-advisories.ts';
import { imageRecords } from './studio-floors.ts';
import { STUDIO_DIR, STUDIO_IMAGES } from './studio-paths.ts';
import { baselineScreens, readLedger } from './studio-redesign.ts';

type Route = ReturnType<typeof readPersistedRoute>;

/**
 * The asset-first stages every track passes before its screens are built, read from a designer's canvas: image-level
 * references pinned per screen and element (each for one job), several whole-product concept boards compared and one
 * direction chosen, then the product's own assets generated as several candidate sets, compared in pairs and the winner
 * cut out and shipped. Plain screens became designed when owned assets arrived and the screens were rebuilt around them.
 *
 * The designer's own records (board.json, direction.json, assets.json, skips.json) are written directly; the board
 * sheet, comparison sheets and the image provenance in images.json are CLI-published.
 */
export const STUDIO_BOARD_INPUT = `${STUDIO_DIR}/board.json`;
export const STUDIO_BOARD_IMAGE = `${STUDIO_DIR}/board.png`;
export const STUDIO_BOARD_RECORD = `${STUDIO_DIR}/board-sheet.json`;
export const STUDIO_SHEETS_DIR = `${STUDIO_DIR}/sheets`;
export const STUDIO_DIRECTION = `${STUDIO_DIR}/direction.json`;
export const STUDIO_ASSETS = `${STUDIO_DIR}/assets.json`;
export const STUDIO_SKIPS = `${STUDIO_DIR}/skips.json`;
/** Concept boards compared before a direction is chosen: two is a coin toss, three is a choice. */
export const STUDIO_CONCEPT_BOARDS = 3;
/** Candidate sets generated for each owned asset before one is picked. */
export const STUDIO_ASSET_CANDIDATES = 3;

const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const fileSha = (root: string, path: string): string | null => {
  try { return sha256(readFileSync(join(root, path))); } catch { return null; }
};
const text = (value: unknown, name: string): string => {
  const field: unknown = typeof value === 'object' && value !== null ? Reflect.get(value, name) : undefined;
  return typeof field === 'string' ? field.trim() : '';
};
const readJson = (root: string, path: string, code: string, guidance: string): unknown => {
  try { return JSON.parse(readFileSync(join(root, path), 'utf8')); } catch {
    throw Object.assign(new Error(`${code}: ${path} is not JSON. ${guidance}`), { code });
  }
};
const invalid = (code: string, path: string, reason: string, guidance: string): never => {
  throw Object.assign(new Error(`${code}: ${path} ${reason}. ${guidance}`), { code });
};
const projectPath = (path: string): string | null => {
  const clean = normalize(path).replace(/\\/g, '/').replace(/^\.\//, '');
  return clean.startsWith('..') || clean.startsWith('/') ? null : clean;
};

// --- Reference board -------------------------------------------------------------------------------------------------

export const STUDIO_BOARD_GUIDANCE = `Pin image-level references, one job each, and compose them into one sheet. Search the galleries per screen and per `
  + 'element in this brief\'s own words, no login needed: omd ref browse start --lane design --json, then omd ref browse search dribbble|behance|pinterest '
  + '"<one screen or element>" --session <id> --json (Dribbble and Behance first; Pinterest when its results load), shot --selector <the item\'s img>, '
  + 'keep --reason "<its one job>", end. One image, one job: a single screen\'s layout, an icon style, a map layout, a material, never a whole site. '
  + `Then write ${STUDIO_BOARD_INPUT}: {"items": [{"image": "<a kept PNG under .omd/refs or .omd/studio/refs, or a user-supplied image>", "for": `
  + '"<the screen or element it serves>", "job": "<the one thing you take from it>", "source": "<its page url>"}, ...]} and run omd studio board --json, '
  + 'which composes the sheet at .omd/studio/board.png grouped by screen and element. Look at the sheet and say back what you kept and what each is for. '
  + 'No count is required; keep what does a job.';

export type BoardItem = Readonly<{ image: string; for: string; job: string; source: string }>;

const BOARD_IMAGE = /\.(?:png|jpe?g|webp)$/i;

/** The authored board, validated; null before one is written. */
export function readBoardInput(root: string): readonly BoardItem[] | null {
  if (!existsSync(join(root, STUDIO_BOARD_INPUT))) return null;
  const fail = (reason: string): never => invalid('STUDIO_BOARD_INVALID', STUDIO_BOARD_INPUT, reason, STUDIO_BOARD_GUIDANCE);
  const value = readJson(root, STUDIO_BOARD_INPUT, 'STUDIO_BOARD_INVALID', STUDIO_BOARD_GUIDANCE);
  const items: unknown = typeof value === 'object' && value !== null ? Reflect.get(value, 'items') : undefined;
  if (!Array.isArray(items) || items.length === 0) return fail('needs "items": the images you kept, each with the screen or element it is for and its one job');
  const seen = new Set<string>();
  return items.map((item, index) => {
    const image = projectPath(text(item, 'image')), forWhat = text(item, 'for'), job = text(item, 'job');
    if (image === null || image === '') return fail(`item ${index + 1} needs "image": a path inside the project`);
    if (!BOARD_IMAGE.test(image)) return fail(`item ${index + 1} names ${image}; a board holds PNG, JPEG or WebP images`);
    if (!existsSync(join(root, image))) return fail(`item ${index + 1} names ${image}, which does not exist`);
    if (/^\.omd\/studio\/refs\/[^/]+\/full\.png$/.test(image)) return fail(`item ${index + 1} is a whole page (${image}); a board pins one screen or element per image`);
    if (image.startsWith('.omd/ideas/')) return fail(`item ${index + 1} is a generated image (${image}); the board holds other people's work you learn from`);
    if (seen.has(image)) return fail(`item ${index + 1} repeats ${image}`);
    seen.add(image);
    if (forWhat.length < 2) return fail(`item ${index + 1} needs "for": the screen or element it serves`);
    if (job.length < 8) return fail(`item ${index + 1} needs "job": the one thing you take from it, in a few words`);
    return { image, for: forWhat, job, source: text(item, 'source') || keptSource(root, image) };
  });
}

/** The page a kept image came from, read from the record beside it. */
function keptSource(root: string, image: string): string {
  try {
    const kept: unknown = JSON.parse(readFileSync(join(root, image.replace(extname(image), '.json')), 'utf8'));
    const source = typeof kept === 'object' && kept !== null ? Reflect.get(kept, 'sourceUrl') ?? Reflect.get(kept, 'source') ?? Reflect.get(kept, 'requested') : undefined;
    return typeof source === 'string' ? source : '';
  } catch { return ''; }
}

export type BoardRecord = Readonly<{ schema: 'studio-board-v1'; input: string; image: Readonly<{ path: string; sha256: string }>;
  items: readonly (BoardItem & Readonly<{ sha256: string }>)[] }>;

function readBoardRecord(root: string): BoardRecord | null {
  try {
    const value = JSON.parse(readFileSync(join(root, STUDIO_BOARD_RECORD), 'utf8')) as BoardRecord;
    return value.schema === 'studio-board-v1' && Array.isArray(value.items) ? value : null;
  } catch { return null; }
}

/** Why the reference board is not yet composed from the current input, or null when its sheet is current. */
export function boardIssue(root: string): string | null {
  const items = readBoardInput(root);
  if (items === null) return `no reference board is written yet (${STUDIO_BOARD_INPUT})`;
  const record = readBoardRecord(root);
  if (record === null || !existsSync(join(root, record.image.path))) return `${STUDIO_BOARD_INPUT} is not composed yet: run omd studio board --json`;
  if (record.input !== fileSha(root, STUDIO_BOARD_INPUT) || record.items.some(item => fileSha(root, item.image) !== item.sha256)) {
    return `${STUDIO_BOARD_INPUT} changed after the sheet was composed: run omd studio board --json again`;
  }
  return null;
}

/** The board sheet when it is current, for attaching to concept boards and comparison sheets. */
export function currentBoardImage(root: string): string | null {
  try { return boardIssue(root) === null ? readBoardRecord(root)!.image.path : null; } catch { return null; }
}

// --- Comparison sheets ---------------------------------------------------------------------------------------------

export type SheetMember = Readonly<{ label: string; source: string; sha256: string }>;
export type SheetRecord = Readonly<{ schema: 'studio-sheet-v1'; name: string; members: readonly SheetMember[]; board: string | null;
  image: Readonly<{ path: string; sha256: string }> }>;

export const sheetSlug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export function readSheet(root: string, name: string): SheetRecord | null {
  try {
    const value = JSON.parse(readFileSync(join(root, STUDIO_SHEETS_DIR, `${sheetSlug(name)}.json`), 'utf8')) as SheetRecord;
    return value.schema === 'studio-sheet-v1' && Array.isArray(value.members) ? value : null;
  } catch { return null; }
}

/** Candidates that are not on the named sheet as they are now. */
function offSheet(root: string, sheet: SheetRecord, paths: readonly string[]): readonly string[] {
  return paths.filter(path => !sheet.members.some(member => member.source === path && member.sha256 === fileSha(root, path)));
}

const ideaKind = (root: string, path: string): IdeaKind | null => ideaImages(root).find(idea => idea.path === path)?.kind ?? null;

// --- Concept boards and the chosen direction --------------------------------------------------------------------------

export const STUDIO_DIRECTION_GUIDANCE = `Before any screen, generate at least ${STUDIO_CONCEPT_BOARDS} whole-product concept boards from the idea and the `
  + 'reference board: omd imagegen --kind board --name concept-<a|b|c> --prompt "<the product, its key screens with real content, the palette, the type, '
  + 'the asset style>" --reference .omd/studio/board.png (add --viewport mobile for an app). Make them genuinely different directions (a different '
  + 'world of assets and composition, not a recolour). Set them side by side: omd studio sheet --name concepts <each board png> --json, look at the '
  + `sheet, choose one yourself and write ${STUDIO_DIRECTION}: {"sheet": "concepts", "chosen": "<the board png>", "because": "<what it does for this `
  + 'product that the others do not>", "lost": [{"board": "<png>", "because": "<why it lost>"}, ...], "carry": ["<what must survive into the screens>"]}. '
  + 'Sample the system\'s colours from the chosen board.';

export type StudioDirection = Readonly<{ sheet: string; chosen: string; because: string; lost: readonly Readonly<{ board: string; because: string }>[];
  carry: readonly string[] }>;

export function readDirection(root: string): StudioDirection | null {
  if (!existsSync(join(root, STUDIO_DIRECTION))) return null;
  const fail = (reason: string): never => invalid('STUDIO_DIRECTION_INVALID', STUDIO_DIRECTION, reason, STUDIO_DIRECTION_GUIDANCE);
  const value = readJson(root, STUDIO_DIRECTION, 'STUDIO_DIRECTION_INVALID', STUDIO_DIRECTION_GUIDANCE);
  const sheet = text(value, 'sheet'), chosen = text(value, 'chosen'), because = text(value, 'because');
  const lost: unknown = typeof value === 'object' && value !== null ? Reflect.get(value, 'lost') : undefined;
  const carry: unknown = typeof value === 'object' && value !== null ? Reflect.get(value, 'carry') : undefined;
  if (sheet === '') return fail('needs "sheet": the omd studio sheet the boards were compared on');
  if (because.length < 24) return fail('needs "because": what the chosen board does for this product that the others do not');
  if (!Array.isArray(lost)) return fail('needs "lost": every other board with why it lost');
  const losers = lost.map(item => ({ board: text(item, 'board'), because: text(item, 'because') }));
  if (losers.some(item => item.board === '' || item.because.length < 12)) return fail('needs every lost board as {"board", "because"}');
  return { sheet, chosen, because, lost: losers, carry: Array.isArray(carry) ? carry.filter((item): item is string => typeof item === 'string') : [] };
}

/** Why no direction is chosen among enough concept boards on one sheet, or null when one is (or generation is recorded unavailable). */
export function directionIssue(root: string): string | null {
  const direction = readDirection(root);
  if (direction === null) {
    if (ideationUnavailable(root)) return null;
    const drawn = ideaImages(root).filter(idea => idea.kind === 'board').length;
    return `${drawn} concept board${drawn === 1 ? '' : 's'} drawn and no direction chosen (${STUDIO_DIRECTION})`;
  }
  const boards = [...new Set([direction.chosen, ...direction.lost.map(item => item.board)])];
  if (direction.lost.some(item => item.board === direction.chosen)) return `${STUDIO_DIRECTION} lists the chosen board among the lost`;
  const notBoards = boards.filter(path => ideaKind(root, path) !== 'board');
  if (notBoards.length > 0) return `${notBoards.join(', ')} ${notBoards.length === 1 ? 'is' : 'are'} not a concept board made with omd imagegen --kind board`;
  if (boards.length < STUDIO_CONCEPT_BOARDS) return `${STUDIO_DIRECTION} compares ${boards.length} concept boards; choose among at least ${STUDIO_CONCEPT_BOARDS}`;
  const sheet = readSheet(root, direction.sheet);
  if (sheet === null) return `no sheet named ${direction.sheet}: run omd studio sheet --name ${direction.sheet} ${boards.join(' ')}`;
  const missing = offSheet(root, sheet, boards);
  if (missing.length > 0) return `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not on the ${direction.sheet} sheet as ${missing.length === 1 ? 'it is' : 'they are'} now: set every board side by side with omd studio sheet`;
  return null;
}

// --- Asset sets ----------------------------------------------------------------------------------------------------

export const STUDIO_ASSETS_GUIDANCE = 'Make the product\'s own assets in the chosen direction (its icon set, objects, characters, badges, the key visual), '
  + `one set per job. For each set generate at least ${STUDIO_ASSET_CANDIDATES} candidates, more when they are close: omd imagegen --kind asset --name <set> `
  + '--prompt "<the items, one per job, their one shared style, a plain flat background>" --reference <the chosen concept board>. Set the candidates beside '
  + 'the reference board: omd studio sheet --name <set> <each candidate png> --json, then compare them two at a time and keep the winner of each pair '
  + `until one is left. Write ${STUDIO_ASSETS}: {"sets": [{"name": "<set>", "for": "<the screens and elements it serves>", "sheet": "<set>", `
  + '"rounds": [{"a": "<png>", "b": "<png>", "winner": "<png>", "because": "<what decided it>"}, ...], "chosen": "<the winning png>"}]}. Ship the '
  + 'winner through the publisher, never by copying: omd studio asset <chosen png> --out <public/assets/name.png, or a folder with --split> --cut '
  + `[--split auto] --json cuts the background, splits the set into its items and records the prompt, tool and candidate in ${STUDIO_IMAGES}. `
  + `Only when no image tool works here, or the candidates lost to a code-rendered object, write ${STUDIO_SKIPS}: {"assets": {"instead": "rig"|"code", `
  + '"because": "<why>"}} and build the asset with omd studio rig.';

export type AssetRound = Readonly<{ a: string; b: string; winner: string; because: string }>;
export type AssetSet = Readonly<{ name: string; for: string; sheet: string; rounds: readonly AssetRound[]; chosen: string }>;

export function readAssets(root: string): readonly AssetSet[] | null {
  if (!existsSync(join(root, STUDIO_ASSETS))) return null;
  const fail = (reason: string): never => invalid('STUDIO_ASSETS_INVALID', STUDIO_ASSETS, reason, STUDIO_ASSETS_GUIDANCE);
  const value = readJson(root, STUDIO_ASSETS, 'STUDIO_ASSETS_INVALID', STUDIO_ASSETS_GUIDANCE);
  const sets: unknown = typeof value === 'object' && value !== null ? Reflect.get(value, 'sets') : undefined;
  if (!Array.isArray(sets) || sets.length === 0) return fail('needs "sets": one entry per asset set');
  return sets.map((set, index) => {
    const name = text(set, 'name'), forWhat = text(set, 'for'), sheet = text(set, 'sheet') || name, chosen = text(set, 'chosen');
    const rounds: unknown = typeof set === 'object' && set !== null ? Reflect.get(set, 'rounds') : undefined;
    if (name === '') return fail(`set ${index + 1} needs "name"`);
    if (forWhat.length < 8) return fail(`set ${name} needs "for": the screens and elements it serves`);
    if (!Array.isArray(rounds) || rounds.length === 0) return fail(`set ${name} needs "rounds": the pairwise comparisons that picked the winner`);
    const parsed = rounds.map(round => ({ a: text(round, 'a'), b: text(round, 'b'), winner: text(round, 'winner'), because: text(round, 'because') }));
    if (parsed.some(round => round.a === '' || round.b === '' || round.a === round.b || (round.winner !== round.a && round.winner !== round.b) || round.because.length < 12)) {
      return fail(`set ${name} needs every round as {"a", "b", "winner": a or b, "because"} between two different candidates`);
    }
    if (chosen === '') return fail(`set ${name} needs "chosen": the winning candidate`);
    return { name, for: forWhat, sheet, rounds: parsed, chosen };
  });
}

export type StudioSkip = Readonly<{ instead?: string; because: string }>;

/** Stages the designer recorded as not applying, with the reason. */
export function readSkips(root: string): Readonly<Record<string, StudioSkip>> {
  if (!existsSync(join(root, STUDIO_SKIPS))) return {};
  const guidance = `${STUDIO_SKIPS} holds {"assets": {"instead": "rig"|"code", "because": "<why>"}} or {"redesign": {"because": "<why this change is not a redesign>"}}`;
  const value = readJson(root, STUDIO_SKIPS, 'STUDIO_SKIP_INVALID', guidance);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalid('STUDIO_SKIP_INVALID', STUDIO_SKIPS, 'is not an object', guidance);
  const skips: Record<string, StudioSkip> = {};
  for (const [stage, entry] of Object.entries(value)) {
    if (stage !== 'assets' && stage !== 'redesign') return invalid('STUDIO_SKIP_INVALID', STUDIO_SKIPS, `names "${stage}"; only assets and redesign can be skipped`, guidance);
    const because = text(entry, 'because'), instead = text(entry, 'instead');
    if (because.length < 24) return invalid('STUDIO_SKIP_INVALID', STUDIO_SKIPS, `needs "because" for ${stage}: why the stage does not apply here`, guidance);
    if (stage === 'assets' && instead !== 'rig' && instead !== 'code') return invalid('STUDIO_SKIP_INVALID', STUDIO_SKIPS, 'needs "instead": "rig" or "code" for assets', guidance);
    skips[stage] = stage === 'assets' ? { instead, because } : { because };
  }
  return skips;
}

/** Why one set has not been picked by comparison and shipped through the publisher, or null when it has. */
function setIssue(root: string, set: AssetSet, shipped: boolean): string | null {
  const candidates = [...new Set(set.rounds.flatMap(round => [round.a, round.b]))];
  const notAssets = candidates.filter(path => { const kind = ideaKind(root, path); return kind !== 'asset' && kind !== 'graphic'; });
  if (notAssets.length > 0) return `set ${set.name}: ${notAssets.join(', ')} ${notAssets.length === 1 ? 'is' : 'are'} not an asset candidate made with omd imagegen --kind asset`;
  if (candidates.length < STUDIO_ASSET_CANDIDATES) return `set ${set.name} compares ${candidates.length} candidates; generate at least ${STUDIO_ASSET_CANDIDATES} and compare them in pairs`;
  const sheet = readSheet(root, set.sheet);
  if (sheet === null) return `set ${set.name}: no sheet named ${set.sheet}: run omd studio sheet --name ${set.sheet} ${candidates.join(' ')}`;
  const missing = offSheet(root, sheet, candidates);
  if (missing.length > 0) return `set ${set.name}: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not on the ${set.sheet} sheet as ${missing.length === 1 ? 'it is' : 'they are'} now`;
  if (!candidates.includes(set.chosen)) return `set ${set.name}: the chosen ${set.chosen} was never compared`;
  if (set.rounds.some(round => round.winner !== set.chosen && (round.a === set.chosen || round.b === set.chosen))) return `set ${set.name}: the chosen ${set.chosen} lost a round`;
  if (!set.rounds.some(round => round.winner === set.chosen)) return `set ${set.name}: the chosen ${set.chosen} won no round`;
  if (!shipped) return null;
  const published = imageRecords(root).some(row => row.generated?.candidate === set.chosen && existsSync(join(root, row.file)));
  return published ? null : `set ${set.name}: ${set.chosen} is chosen but not shipped: omd studio asset ${set.chosen} --out <path> --cut [--split auto] --json`;
}

/** Why the owned assets are not yet generated, compared, picked and shipped, or null when they are or a valid skip is recorded. */
export function assetsIssue(root: string): string | null {
  const sets = readAssets(root);
  const skip = readSkips(root).assets;
  if (skip !== undefined) {
    // Choosing the rig over generated candidates is a choice only once there were candidates to lose; without an image tool it is the fallback.
    if (ideationUnavailable(root)) return null;
    const compared = sets?.some(set => setIssue(root, set, false) === null) ?? false;
    return compared ? null : `${STUDIO_SKIPS} skips the assets, but image generation works here: generate the candidate sets and compare them first; `
      + 'choose the rig or code when they lose';
  }
  if (sets === null) {
    const drawn = ideaImages(root).filter(idea => idea.kind === 'asset').length;
    return `${drawn} asset candidate${drawn === 1 ? '' : 's'} drawn and no set picked (${STUDIO_ASSETS})`;
  }
  for (const set of sets) {
    const issue = setIssue(root, set, true);
    if (issue !== null) return issue;
  }
  return null;
}

// --- Redesign track ------------------------------------------------------------------------------------------------

/** A request to redo how an existing product looks or is organised, not a local fix. */
const REDESIGN_REQUEST = /\bre-?design|\brevamp|\boverhaul|\bnew look\b|리디자인|개편|리뉴얼|디자인을?\s*(?:새로|다시|전면|전부|싹)|새롭게\s*디자인/i;

export function redesignRequested(request: string): boolean {
  return REDESIGN_REQUEST.test(request);
}

/** Existing work asked to be redesigned (or already baselined as one), unless the designer recorded why it is not a redesign. */
export function redesignTrack(root: string, route: Route): boolean {
  const need = route.sourceContract.referenceDiscovery.taskNeed;
  if (newSurface(route) || need === 'copy-only-edit' || requestSuppliesFigmaTarget(route.request)) return false;
  if (!redesignRequested(route.request) && baselineScreens(root).length === 0) return false;
  return readSkips(root).redesign === undefined;
}

export type RedesignStage = 'baseline' | 'ledger' | 'board' | 'direction' | 'assets';

export function redesignPending(root: string): RedesignStage | null {
  if (baselineScreens(root).length === 0) return 'baseline';
  if (readLedger(root) === null) return 'ledger';
  if (boardIssue(root) !== null) return 'board';
  if (directionIssue(root) !== null) return 'direction';
  return assetsIssue(root) === null ? null : 'assets';
}
