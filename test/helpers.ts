import { readFileSync } from 'node:fs';
import type { Emitted, HookFile } from '../core/types.ts';

/**
 * Assert-and-narrow. Tests know a lookup cannot miss; the compiler does not. Use this
 * rather than `!`, so that when the assumption breaks the test fails with a sentence
 * instead of a TypeError twenty lines later.
 */
export function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`expected ${what} to exist`);
  return value;
}

export const readText = (url: URL | string): string => readFileSync(url, 'utf8');

export const readJson = <T>(url: URL | string): T => JSON.parse(readText(url)) as T;

export const hookFile = (emitted: Emitted, path: string): HookFile =>
  must(emitted.files[path], path) as HookFile;

export const textFile = (emitted: Emitted, path: string): string =>
  must(emitted.files[path], path) as string;

export const jsonFile = <T>(emitted: Emitted, path: string): T =>
  must(emitted.files[path], path) as T;

/** The one hook command a matcher points at. */
export const firstCommand = (file: HookFile, event: string): string =>
  must(must(must(file.hooks[event], event)[0], `${event}[0]`).hooks[0], 'command').command;

export const matcherOf = (file: HookFile, event: string): string =>
  must(must(file.hooks[event], event)[0], `${event}[0]`).matcher;

/** smol-toml returns TomlValue; tests want plain records. */
export const asRecord = (v: unknown): Record<string, unknown> => v as Record<string, unknown>;

export const str = (v: unknown): string => {
  if (typeof v !== 'string') throw new Error(`expected string, got ${typeof v}`);
  return v;
};
