import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Script } from 'node:vm';
import { parse } from 'yaml';
import type { Category, Ir, Layer, Node, Rule, RuleValue, Violation } from '../types.ts';

export function loadRules(dirPath: string): Rule[] {
  const rules: Rule[] = [];
  const seen = new Set<string>();

  for (const file of readdirSync(dirPath).filter((f) => f.endsWith('.yaml'))) {
    const parsed: unknown = parse(readFileSync(join(dirPath, file), 'utf8'));
    for (const rule of (Array.isArray(parsed) ? parsed : [parsed]) as Rule[]) {
      if (seen.has(rule.id)) throw new Error(`duplicate rule id "${rule.id}" found in ${file}`);
      seen.add(rule.id);
      if (!rule.category) throw new Error(`rule "${rule.id}" is missing category`);
      rules.push(rule);
    }
  }
  return rules;
}

type Compiled = Script;

const cache = new Map<string, Compiled>();

function compile(ruleId: string, expr: string): Compiled {
  const key = ruleId + ' ' + expr;
  let script = cache.get(key);
  if (!script) {
    // Rule files are repository-owned. Keep evaluation isolated from host globals
    // and bound execution so a malformed rule cannot hang the caller.
    script = new Script('(' + expr + ')', { filename: 'omd-rule-' + ruleId });
    cache.set(key, script);
  }
  return script;
}

function evalExpr(ruleId: string, expr: string, node: Node, ir: Ir, value: RuleValue): unknown {
  try {
    const context = { node: structuredClone(node), ir: structuredClone(ir), value: structuredClone(value) };
    return compile(ruleId, expr).runInNewContext(context, { timeout: 100, contextCodeGeneration: { strings: false, wasm: false } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`rule ${ruleId}: error evaluating "${expr}": ${message}`);
  }
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function interpolate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => formatValue(ctx[key]));
}

export function check(ir: Ir, rules: Rule[], opts: { layers?: Layer[]; categories?: Category[] } = {}): Violation[] {
  const violations: Violation[] = [];

  for (const rule of rules) {
    if (opts.layers && !opts.layers.includes(rule.layer)) continue;
    if (opts.categories && !opts.categories.includes(rule.category)) continue;

    for (const node of ir.nodes) {
      if (!evalExpr(rule.id, rule.when, node, ir, null)) continue;

      const value = (rule.value ? evalExpr(rule.id, rule.value, node, ir, null) : null) as RuleValue;
      if (evalExpr(rule.id, rule.assert, node, ir, value)) continue;

      violations.push({
        id: rule.id,
        severity: rule.severity,
        layer: rule.layer,
        category: rule.category,
        nodeId: node.id,
        path: node.path,
        value,
        message: interpolate(rule.message, { id: rule.id, value }),
      });
    }
  }

  // Code-unit order, not localeCompare: the same rules must yield byte-identical output
  // under any ICU locale, on any host. That equivalence is the product.
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  violations.sort((a, b) => cmp(a.path, b.path) || cmp(a.id, b.id));
  return violations;
}

