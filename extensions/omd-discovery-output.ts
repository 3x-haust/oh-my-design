type RecordValue = Readonly<Record<string, unknown>>;
type Receipt = Readonly<{ path: string; sha256: string }>;

function record(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function receipts(value: unknown): readonly Receipt[] | undefined {
  if (!Array.isArray(value)) return;
  const result: Receipt[] = [];
  for (const item of value) {
    if (!record(item) || !record(item.receipt)) return;
    const { path, sha256 } = item.receipt;
    if (typeof path !== 'string' || !path.startsWith('.omd/')
      || path.includes('\\') || path.includes('\0')
      || path.split('/').some(part => !part || part === '..' || part === '.')
      || typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) return;
    result.push({ path, sha256 });
  }
  return result;
}

/** Pi-only transport projection. Public CLI JSON and signed evidence are untouched. */
export function compactPiDiscoveryOutput(stdout: string, args: readonly string[]): string | undefined {
  if (args[0] !== 'ref' || !['work-next', 'advance', 'exclude'].includes(args[1] ?? '')
    || !args.includes('--json')) return;
  let parsed: unknown;
  try { parsed = JSON.parse(stdout); }
  catch (error) { if (error instanceof SyntaxError) return; throw error; }
  if (!record(parsed)) return;
  const direct = parsed.schema === 'reference-discovery-work-v1';
  if (!direct && parsed.schema !== 'reference-discovery-advance-v1'
    && parsed.schema !== 'reference-discovery-exclusion-publication-v1') return;
  const work = direct ? parsed : parsed.work;
  if (!record(work) || work.schema !== 'reference-discovery-work-v1'
    || typeof work.workSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(work.workSha256)
    || !['action', 'ready', 'exhausted'].includes(String(work.status))
    || !(work.action === null || record(work.action))
    || !Array.isArray(work.materialProgressIdentities) || !Array.isArray(work.circuits)
    || !record(work.progress)) return;
  const attempts = receipts(work.attempts);
  const exclusions = receipts(work.exclusions);
  if (attempts === undefined || exclusions === undefined) return;
  const { attempts: _attempts, exclusions: _exclusions, ...currentWork } = work;
  const { work: _work, ...result } = parsed;
  return JSON.stringify({
    schema: 'omd-discovery-summary-v1',
    ...(direct ? {} : { result }),
    work: currentWork,
    history: { attempts, exclusions },
    omittedFields: ['work.attempts', 'work.exclusions'],
    instruction: 'Use work.action and work.next directly; do not call work-next again unless state changed outside this result. Historical decisions remain at the exact history receipt paths. Read them when needed; this summary does not replace signed evidence or authorize admission.',
  });
}
