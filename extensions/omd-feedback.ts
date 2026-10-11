import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PortablePiEvent } from './omd-runtime.ts';
import { parseOmdWorkflowPrompt } from './omd-request-prompt.ts';

/** User-authored feedback is separate from the immutable original route request and from tool output. */
export function explicitDesignFeedback(root: string, event: PortablePiEvent): Readonly<{ text: string; command: 'omd feedback translate' }> | null {
  if ((event.source !== 'interactive' && event.source !== 'rpc') || typeof event.text !== 'string' || !event.text.trim()) return null;
  if (!existsSync(join(root, '.omd/route.json')) || !existsSync(join(root, '.omd/observation-v2.json'))) return null;
  if (parseOmdWorkflowPrompt(event.text) !== null) return null;
  return { text: event.text, command: 'omd feedback translate' };
}
