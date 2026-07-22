// Stub used in the single-file "artifact" build where the PWA plugin is absent.
export function registerSW(_opts?: unknown): () => Promise<void> {
  return async () => {};
}
