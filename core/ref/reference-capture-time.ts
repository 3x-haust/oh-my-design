export function referenceCaptureTimestamp(captured: Record<string, unknown>): unknown {
  if (captured.schemaVersion !== 'image-fragment-v1') return captured.capturedAt;
  const provenance = captured.provenance;
  return typeof provenance === 'object' && provenance !== null && !Array.isArray(provenance)
    ? Reflect.get(provenance, 'capturedAt') : undefined;
}
