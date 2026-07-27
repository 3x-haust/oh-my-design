// Locale contract and its copy binding.
//
// A second locale is not a second string table: it changes line length, control width, and what a
// visitor already believes. `protocol/locale-contract.md` states the obligations; this module
// validates the two that are mechanically checkable before a browser exists — that the declared
// contract is coherent, and that every Beat the page argues has real copy in every declared locale.

export const LOCALE_CONTRACT_SCHEMA = 'locale-contract-v1' as const;
export const LOCALE_MODES = ['language-only', 'regional', 'market-specific'] as const;
export const LOCALE_CONTRACT_KEYS = ['schema', 'mode', 'locales', 'primary'] as const;

export type LocaleMode = (typeof LOCALE_MODES)[number];

export type LocaleContract = {
  readonly schema: typeof LOCALE_CONTRACT_SCHEMA;
  readonly mode: LocaleMode;
  readonly locales: readonly string[];
  readonly primary: string;
};

export type LocaleFinding = { readonly id: string; readonly message: string };

const TAG = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|\d{3}))?$/;
const PLACEHOLDER = /^(tbd|todo|n\/a|-{1,3}|\.\.\.|…)$/i;

export function validateLocaleContract(value: unknown): LocaleContract {
  const fail = (message: string): never => { throw new Error(`LOCALE_CONTRACT_INVALID: ${message}`); };
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail(`contract must be an object with keys: ${LOCALE_CONTRACT_KEYS.join(', ')}`);
  const record = value as Record<string, unknown>;
  const missing = LOCALE_CONTRACT_KEYS.filter((key) => !Object.hasOwn(record, key));
  const unknown = Object.keys(record).filter((key) => !(LOCALE_CONTRACT_KEYS as readonly string[]).includes(key));
  if (missing.length > 0 || unknown.length > 0) {
    return fail(`contract must contain exactly ${LOCALE_CONTRACT_KEYS.join(', ')}${missing.length > 0 ? `; missing: ${missing.join(', ')}` : ''}${unknown.length > 0 ? `; unknown: ${unknown.join(', ')}` : ''}`);
  }
  if (record.schema !== LOCALE_CONTRACT_SCHEMA) return fail(`schema must be ${LOCALE_CONTRACT_SCHEMA}`);
  if (!(LOCALE_MODES as readonly unknown[]).includes(record.mode)) return fail(`mode must be one of ${LOCALE_MODES.join(', ')}`);
  const locales = record.locales;
  if (!Array.isArray(locales) || locales.length < 2 || locales.some((locale) => typeof locale !== 'string' || !TAG.test(locale))) {
    return fail('locales must be two or more BCP-47 tags such as ko-KR, en-US');
  }
  if (new Set(locales as string[]).size !== locales.length) return fail('locales must be unique');
  if (typeof record.primary !== 'string' || !(locales as string[]).includes(record.primary)) return fail('primary must be one of the declared locales');
  return { schema: LOCALE_CONTRACT_SCHEMA, mode: record.mode as LocaleMode, locales: Object.freeze([...(locales as string[])]), primary: record.primary };
}

type Table = { readonly header: readonly string[]; readonly rows: readonly (readonly string[])[] };

function parseTable(markdown: string, requiredColumn: string): Table | undefined {
  const rows = markdown.split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
  const headerIndex = rows.findIndex((cells) => cells.includes(requiredColumn));
  if (headerIndex === -1) return undefined;
  return {
    header: rows[headerIndex]!,
    rows: rows.slice(headerIndex + 1).filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell))),
  };
}

function section(deck: string, title: string): string | undefined {
  const pattern = new RegExp(`^##\\s+${title}\\s*$`, 'im');
  const match = pattern.exec(deck);
  if (match === null) return undefined;
  const rest = deck.slice(match.index + match[0].length);
  const next = /^##\s+/m.exec(rest);
  return next === null ? rest : rest.slice(0, next.index);
}

/**
 * Beats are locale-independent; their wording is not. Every Beat the art-direction contract names
 * must carry real copy for every declared locale — a blank or placeholder cell is a hole in the
 * page for that visitor, never a silent fallback to another language.
 */
export function checkLocaleCopyBinding(contract: LocaleContract, deck: string): readonly LocaleFinding[] {
  const findings: LocaleFinding[] = [];
  const artDirection = section(deck, 'Art direction contract');
  const localeCopy = section(deck, 'Locale copy');
  if (artDirection === undefined) return [{ id: 'LOCALE-DECK-SECTION', message: 'Copy deck has no `## Art direction contract` section to read Beat IDs from.' }];
  if (localeCopy === undefined) return [{ id: 'LOCALE-DECK-SECTION', message: 'A multi-locale deck needs a `## Locale copy` section with one column per declared locale.' }];

  const beats = parseTable(artDirection, 'Beat ID');
  const copy = parseTable(localeCopy, 'Beat ID');
  if (beats === undefined) return [{ id: 'LOCALE-DECK-SECTION', message: 'Art direction contract has no Beat ID table.' }];
  if (copy === undefined) return [{ id: 'LOCALE-DECK-SECTION', message: 'Locale copy section has no Beat ID table.' }];

  const beatColumn = copy.header.indexOf('Beat ID');
  const declared = new Set(beats.rows.map((cells) => cells[beats.header.indexOf('Beat ID')] ?? '').filter((id) => id !== ''));
  for (const locale of contract.locales) {
    if (!copy.header.includes(locale)) findings.push({ id: 'LOCALE-COLUMN-MISSING', message: `Locale copy table has no ${locale} column.` });
  }
  const covered = new Set<string>();
  for (const cells of copy.rows) {
    const beat = cells[beatColumn] ?? '';
    if (beat === '') continue;
    covered.add(beat);
    if (!declared.has(beat)) findings.push({ id: 'LOCALE-BEAT-UNKNOWN', message: `Locale copy row ${beat} is not a Beat the art-direction contract declares.` });
    for (const locale of contract.locales) {
      const column = copy.header.indexOf(locale);
      if (column === -1) continue;
      const text = cells[column] ?? '';
      if (text === '') findings.push({ id: 'LOCALE-COPY-MISSING', message: `Beat ${beat} has no ${locale} copy.` });
      else if (PLACEHOLDER.test(text)) findings.push({ id: 'LOCALE-COPY-PLACEHOLDER', message: `Beat ${beat} has placeholder ${locale} copy (${text}).` });
    }
  }
  for (const beat of declared) {
    if (!covered.has(beat)) findings.push({ id: 'LOCALE-BEAT-UNCOVERED', message: `Beat ${beat} has no row in the locale copy table.` });
  }
  return findings;
}
