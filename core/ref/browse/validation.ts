import { browseFail, type BrowseAction, type BrowseObservation } from './contract.ts';
import { VISUAL_VECTOR_AXES } from '../../visual-vector.ts';

export function browseExactKeys(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) browseFail('BROWSE_SCHEMA', 'unknown or missing fields', 2);
}
const ACTION_KEYS: Record<BrowseAction['verb'], readonly string[]> = {
  start: ['lane', 'mode', 'cdpUrl', 'userOptIn', 'headed', 'allowAuthOrigins', 'allowPricing', 'budgetActions', 'budgetMinutes', 'viewport'],
  goto: ['url', 'reason', 'scope', 'sourceId', 'flowId', 'readySelector'],
  search: ['provider', 'query', 'queryParam', 'querySelector', 'submitSelector', 'scope', 'readySelector'],
  scroll: ['direction', 'amount', 'selector', 'readySelector'], click: ['selector', 'text', 'readySelector'], similar: ['selector', 'text', 'readySelector'],
  back: ['readySelector'], shot: ['selector', 'screenId', 'state', 'assertVisible', 'assertHidden'], crop: ['selector', 'reference', 'as', 'slot'],
  keep: ['sourceApp', 'capture', 'lane', 'reason', 'role', 'direction', 'rights', 'rightsNotes'], drop: ['keep', 'reason'],
  'contact-sheet': ['page', 'columns'], status: [], end: ['reason'], 'external-intervention': ['reason'],
};
export function validateRecordedBrowseAction(action: BrowseAction): void {
  if (!action || !Object.hasOwn(ACTION_KEYS, action.verb) || action.verb === 'status') browseFail('BROWSE_ACTION_SCHEMA', 'unknown/unrecordable action', 2);
  browseExactKeys(action, ['verb', ...ACTION_KEYS[action.verb]]);
  for (const [key, value] of Object.entries(action)) {
    if (value === null || typeof value === 'boolean' || typeof value === 'number' || key === 'viewport') continue;
    if (typeof value === 'string') { if (!value.trim() || value.length > 4096 || value.includes('\0')) browseFail('BROWSE_ACTION_SCHEMA', 'invalid bounded action value', 2); }
    else if (Array.isArray(value)) { if (value.length > 200 || value.some(item => typeof item !== 'string' || !item || item.length > 4096)) browseFail('BROWSE_ACTION_SCHEMA', 'invalid bounded action array', 2); }
    else browseFail('BROWSE_ACTION_SCHEMA', 'invalid action field type', 2);
  }
  if (action.verb === 'start') {
    browseExactKeys(action.viewport, ['width', 'height']);
    if (action.cdpUrl !== null || !['domain', 'design'].includes(action.lane) || !['headless', 'profile', 'cdp'].includes(action.mode)
      || ![action.viewport.width, action.viewport.height].every(n => Number.isInteger(n) && n >= 240 && n <= 2560)
      || !Number.isInteger(action.budgetActions) || action.budgetActions < 1 || action.budgetActions > 240
      || action.budgetMinutes < .5 || action.budgetMinutes > 30) browseFail('BROWSE_START_SCHEMA', 'invalid public start record', 2);
  }
  if (action.verb === 'keep' && (action.reason.length < 20 || action.reason.length > 500 || !['allowed', 'restricted', 'unknown'].includes(action.rights))) browseFail('BROWSE_KEEP_SCHEMA', 'invalid retention judgment', 2);
  if (action.verb === 'goto' && (action.sourceId === null) !== (action.flowId === null)) browseFail('BROWSE_FLOW_SCHEMA', 'source/flow identity must be paired', 2);
  if (action.verb === 'shot' && (action.screenId === null) !== (action.state === null)) browseFail('BROWSE_SCREEN_SCHEMA', 'screen/state identity must be paired', 2);
}
export function validateBrowseObservationShape(value: BrowseObservation): void {
  browseExactKeys(value, ['schema', 'url', 'documentId', 'httpStatus', 'renderSha256', 'title', 'text', 'taskText', 'linkClaims', 'controls', 'viewport', 'dpr', 'scroll', 'screenshot', 'masks', 'obstructions',
    'retainable', 'limitation', 'crop', 'selector', 'mediaUrl', 'kind', 'invariants', 'blueprint', 'wholeImage', 'measurement', 'vector']);
  if (!/^[a-f0-9]{64}$/.test(value.renderSha256) || !Array.isArray(value.linkClaims) || value.linkClaims.length > 2000 || typeof value.taskText !== 'string' || value.taskText.length > 24_000 || !Array.isArray(value.controls) || !Array.isArray(value.masks) || !Array.isArray(value.obstructions) || typeof value.text !== 'string' || typeof value.title !== 'string'
    || typeof value.retainable !== 'boolean' || !['page', 'component', 'image'].includes(value.kind)) browseFail('BROWSE_OBSERVATION_SCHEMA', 'invalid observation fields', 2);
  for (const control of value.controls) {
    browseExactKeys(control, ['selector', 'tag', 'role', 'label', 'href', 'type', 'expanded', 'controls', 'download', 'box']);
    browseExactKeys(control.box, ['x', 'y', 'width', 'height']);
    if (!Object.values(control.box).every(value => typeof value === 'number' && Number.isFinite(value)) || typeof control.box.width !== 'number' || control.box.width <= 0 || typeof control.box.height !== 'number' || control.box.height <= 0
      || typeof control.label !== 'string' || control.label.length > 200 || typeof control.selector !== 'string') browseFail('BROWSE_CONTROL_SCHEMA', 'invalid witnessed control', 2);
  }
  if (value.vector !== null) {
    browseExactKeys(value.vector, VISUAL_VECTOR_AXES);
    if (Object.values(value.vector).some(n => n !== null && (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1))) browseFail('BROWSE_VECTOR_SCHEMA', 'unmeasured axes must be null; measured axes must be finite', 2);
    if (['motionVoice', 'easingVoice', 'materialDensity', 'interactionCoverage', 'motionLoad', 'energyLoad'].some(axis => value.vector![axis as keyof typeof value.vector] !== null)) browseFail('BROWSE_VECTOR_COVERAGE', 'unrun dynamic probes cannot become measured zeros', 2);
  }
}
