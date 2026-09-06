import { failAdaptiveRoute } from './adaptive-flow-domain.ts';

export const COPY_REPAIR_WORKFLOW = Object.freeze([
  'writer',
  'copy-check',
  'copy-editor',
  'writer',
  'copy-recheck',
] as const);

export type CopyRepairStep = typeof COPY_REPAIR_WORKFLOW[number];

/** Accepts only the complete ordered copy-repair loop. */
export function validateCopyRepairWorkflow(value: unknown): typeof COPY_REPAIR_WORKFLOW {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) {
    return failAdaptiveRoute('COPY_REPAIR_WORKFLOW_INVALID');
  }
  const keys = Reflect.ownKeys(value);
  const expectedKeys = ['length', ...COPY_REPAIR_WORKFLOW.map((_, index) => String(index))];
  if (keys.length !== expectedKeys.length
    || keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))) {
    return failAdaptiveRoute('COPY_REPAIR_WORKFLOW_INVALID');
  }
  for (let index = 0; index < COPY_REPAIR_WORKFLOW.length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)
      || descriptor.value !== COPY_REPAIR_WORKFLOW[index]) {
      return failAdaptiveRoute('COPY_REPAIR_WORKFLOW_INVALID');
    }
  }
  return COPY_REPAIR_WORKFLOW;
}
