export function managedMediaUrl(runId: string, filePath: string) {
  const query = new URLSearchParams({ runId, path: filePath })
  return `short-video-media://asset?${query}`
}
