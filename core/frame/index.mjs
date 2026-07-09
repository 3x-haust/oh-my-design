import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

function framePath(cwd) {
  return join(cwd, '.design', 'frame.md');
}

export function readFrame(cwd) {
  let text;
  try {
    text = readFileSync(framePath(cwd), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }

  if (!text.startsWith('---\n') && text !== '---') {
    return { approved: false, body: text };
  }

  const closeIndex = text.indexOf('\n---', 3);
  if (closeIndex === -1) {
    return { approved: false, body: text };
  }

  const yamlText = text.slice(4, closeIndex);
  const rest = text.slice(closeIndex + 4);
  const body = rest.startsWith('\n') ? rest.slice(1) : rest;
  const frontmatter = parse(yamlText) ?? {};

  return { ...frontmatter, body };
}

export function isApproved(cwd) {
  let frame;
  try {
    frame = readFrame(cwd);
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
  if (frame === null) return false;
  return frame.approved === true;
}
