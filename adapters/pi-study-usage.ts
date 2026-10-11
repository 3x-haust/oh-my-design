import { PiReviewerError, piInteger, piRecord } from './pi-reviewer-contract.ts';

const KEYS = ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens'] as const;
export type SourceStudyUsage = Readonly<Record<(typeof KEYS)[number], number> & {
  assistantMessages: number;
}>;

export function parseSourceStudyUsage(value: unknown): SourceStudyUsage | null {
  if (value === null) return null;
  const row = piRecord(value, 'study-usage');
  if (Object.keys(row).sort().join() !== [...KEYS, 'assistantMessages'].sort().join()) {
    throw new PiReviewerError('study-usage-fields');
  }
  return {
    assistantMessages: piInteger(row.assistantMessages, 'study-assistant-messages'),
    input: piInteger(row.input, 'study-usage-input'),
    output: piInteger(row.output, 'study-usage-output'),
    cacheRead: piInteger(row.cacheRead, 'study-usage-cache-read'),
    cacheWrite: piInteger(row.cacheWrite, 'study-usage-cache-write'),
    totalTokens: piInteger(row.totalTokens, 'study-usage-total'),
  };
}

export function observeSourceStudyUsage(response: Record<string, unknown>): SourceStudyUsage | null {
  const data = piRecord(response.data, 'study-messages');
  if (!Array.isArray(data.messages)) throw new PiReviewerError('study-messages-empty');
  const messages = data.messages.map(value => piRecord(value, 'study-message'))
    .filter(message => message.role === 'assistant');
  if (messages.length === 0) return null;
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };
  for (const message of messages) {
    if (typeof message.usage !== 'object' || message.usage === null || Array.isArray(message.usage)) return null;
    const usage = piRecord(message.usage, 'study-message-usage');
    for (const key of KEYS) {
      const value = usage[key];
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null;
      totals[key] += value;
      if (!Number.isSafeInteger(totals[key])) return null;
    }
  }
  return { assistantMessages: messages.length, ...totals };
}
