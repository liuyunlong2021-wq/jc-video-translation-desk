export function fixedVideoTranslationSlicePlan(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('音频时长无效')
  const plan: Array<{ startMs: number; endMs: number }> = []
  for (let startMs = 0; startMs < durationMs; startMs += 10_000)
    plan.push({ startMs, endMs: Math.min(durationMs, startMs + 10_000) })
  return plan
}
