import { PiReviewerError, piRecord, piText } from './pi-reviewer-contract.ts';

export type SourceStudyWorkState = Readonly<{
  triggerSelector: string | null;
  readySelector: string;
}>;

export function parseSourceStudyWorkState(value: unknown): SourceStudyWorkState {
  const row = piRecord(value, 'study-work-state');
  if (Object.keys(row).sort().join() !== 'readySelector,triggerSelector') {
    throw new PiReviewerError('study-work-state-fields');
  }
  const readySelector = piText(row.readySelector, 'study-work-ready');
  const triggerSelector = row.triggerSelector === null ? null : piText(row.triggerSelector, 'study-work-trigger');
  if (readySelector.length > 300 || (triggerSelector !== null && triggerSelector.length > 300)) {
    throw new PiReviewerError('study-work-selector-size');
  }
  return { readySelector, triggerSelector };
}
