// Shipped-photo provenance and licence validation.
//
// The composer/hand guidance and human-design-loop already permit a lawful path: for a zone where a
// real photograph is the right carrier and none is supplied, a mood-matched photo may be sourced from a
// free-licence library and recorded with its source, licence, and attribution. That guidance had no
// machine-checkable schema — provenance was a freeform `omd decision`, so a shipped photo could skip the
// attribution a CC-BY licence legally requires, or ship under an unpermitted licence (Pinterest, Getty,
// all-rights-reserved) with nothing to catch it. This module is that schema: it validates that a shipped
// photograph carries a permitted free licence, the attribution that licence requires, a real source page,
// a local path, and alt text. It never fetches, scrapes, hotlinks, or downloads — the agent/user supplies
// a lawfully obtained local image; this records and validates its provenance.

/** Free licences OMD permits for a SHIPPED photograph, and whether each legally requires attribution. */
export const PERMITTED_PHOTO_LICENSES = {
  'CC0': { requiresAttribution: false },
  'PDM': { requiresAttribution: false }, // Public Domain Mark
  'CC-BY': { requiresAttribution: true },
  'CC-BY-SA': { requiresAttribution: true },
  'Unsplash': { requiresAttribution: false }, // Unsplash Licence: attribution appreciated, not required
  'Pexels': { requiresAttribution: false }, // Pexels Licence: attribution appreciated, not required
} as const;

export type PhotoLicense = keyof typeof PERMITTED_PHOTO_LICENSES;
export type PhotoSemanticRole = 'content' | 'decorative' | 'functional';

export type PhotoProvenance = {
  /** The free-licence library or origin: Unsplash, Pexels, Openverse, Wikimedia Commons, or the user. */
  readonly source: string;
  /** The exact source page the photo was obtained from (https URL). */
  readonly sourcePage: string;
  readonly license: PhotoLicense;
  /** The photographer/creator credit; required when the licence requires attribution. */
  readonly photographer?: string;
  /** The rendered attribution string; required when the licence requires attribution. */
  readonly attribution?: string;
  /** Project-relative path to the locally stored, lawfully obtained image. */
  readonly localPath: string;
  /** Defaults to content for backward compatibility with records written before semantic roles. */
  readonly semanticRole: PhotoSemanticRole;
  /** Content describes the image, decorative is exactly empty, functional names the action. */
  readonly altText: string;
};

export class PhotoLicenseError extends Error {
  override readonly name = 'PhotoLicenseError';
  readonly reason: string;
  constructor(reason: string) {
    super(`shipped-photo provenance is invalid: ${reason}`);
    this.reason = reason;
  }
}

const fail = (reason: string): never => { throw new PhotoLicenseError(reason); };
const nonEmpty = (v: unknown, reason: string): string =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : fail(reason);

function httpsUrl(value: unknown, reason: string): string {
  const text = nonEmpty(value, reason);
  let url: URL;
  try { url = new URL(text); } catch { return fail(`${reason} — not a URL`); }
  if (url.protocol !== 'https:') fail(`${reason} — must be an https URL`);
  return text;
}

function projectRelativePath(value: unknown, reason: string): string {
  const text = nonEmpty(value, reason);
  if (text.startsWith('/') || /^[A-Za-z]:[\\/]/.test(text) || text.includes('\0') || text.includes('\\')
    || text.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    fail(`${reason} — must be a safe project-relative path`);
  }
  return text;
}

/**
 * Validates a shipped-photo provenance record. Throws `PhotoLicenseError` on any violation.
 * A record is valid only when it names a real source and https source page, a permitted free licence,
 * a local project-relative image path, and role-correct alt text — and, when the licence requires
 * attribution (the CC-BY family), a non-empty photographer credit and rendered attribution string.
 * Records without semanticRole remain valid and default to content.
 * A factual carrier (a real team photo, product screenshot, real person, or logo) is out of scope here:
 * those come from the user, never a stock library, and are never AI-generated.
 */
export function validatePhotoProvenance(value: unknown): PhotoProvenance {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('record must be an object');
  const record = value as Record<string, unknown>;
  const allowed = ['source', 'sourcePage', 'license', 'photographer', 'attribution', 'localPath', 'semanticRole', 'altText'];
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) fail(`unknown field: ${key}`);
  }

  const source = nonEmpty(record.source, 'source is required');
  const sourcePage = httpsUrl(record.sourcePage, 'sourcePage is required');
  const localPath = projectRelativePath(record.localPath, 'localPath is required');
  const semanticRoleValue = record.semanticRole === undefined ? 'content' : record.semanticRole;
  if (semanticRoleValue !== 'content' && semanticRoleValue !== 'decorative' && semanticRoleValue !== 'functional') {
    fail('semanticRole must be one of content, decorative, functional');
  }
  const semanticRole = semanticRoleValue as PhotoSemanticRole;
  if (typeof record.altText !== 'string') fail('altText is required');
  let altText: string;
  if (semanticRole === 'decorative') {
    if (record.altText !== '') fail('decorative photos require altText="" so assistive technology ignores them');
    altText = '';
  } else {
    altText = nonEmpty(record.altText, semanticRole === 'functional'
      ? 'functional photo altText must describe the action'
      : 'content photo altText must describe the image');
    if (/\.(png|jpe?g|webp|gif|avif|svg)$/i.test(altText)) fail('altText must describe the image or action, not be a filename');
    if (semanticRole === 'functional'
      && !/^(?:open|view|show|play|pause|download|upload|zoom|close|go to|visit|select|choose|save|share|print|copy|delete|remove|add|start|stop|toggle|expand|collapse)\b|(?:열기|보기|재생|정지|다운로드|확대|닫기|선택|저장|공유|삭제|추가)$/iu.test(altText)) {
      fail('functional photo altText must describe the action rather than the image');
    }
  }

  const license = record.license;
  if (typeof license !== 'string' || !(license in PERMITTED_PHOTO_LICENSES)) {
    fail(`license must be one of ${Object.keys(PERMITTED_PHOTO_LICENSES).join(', ')} — an unpermitted or unknown licence (Pinterest, Getty, all-rights-reserved) is never shipped`);
  }
  const licenseKey = license as PhotoLicense;

  const result: PhotoProvenance = { source, sourcePage, license: licenseKey, localPath, semanticRole, altText };
  if (PERMITTED_PHOTO_LICENSES[licenseKey].requiresAttribution) {
    const photographer = nonEmpty(record.photographer, `${license} legally requires attribution — photographer credit is required`);
    const attribution = nonEmpty(record.attribution, `${license} legally requires attribution — a rendered attribution string is required`);
    return { ...result, photographer, attribution };
  }
  // For non-attribution licences, carry the optional credit through when supplied.
  return {
    ...result,
    ...(typeof record.photographer === 'string' && record.photographer.trim() !== '' ? { photographer: record.photographer.trim() } : {}),
    ...(typeof record.attribution === 'string' && record.attribution.trim() !== '' ? { attribution: record.attribution.trim() } : {}),
  };
}
