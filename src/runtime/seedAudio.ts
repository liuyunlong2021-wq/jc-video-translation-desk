export type SeedAudioMode =
  | 'voice-profile'
  | 'dialogue-performance'
  | 'full-track'
  | 'timeline-voice'

export interface SeedAudioReference {
  speakerId: string
  referenceAudioPath: string
  voiceProfileId?: string
  voiceDesignPrompt?: string
  label?: string
}

export interface SeedAudioRequestReference {
  audio_data: string
}

export interface SeedAudioLine {
  speakerId?: string
  text: string
  emotion?: string
  startMs?: number
  endMs?: number
}

export interface SeedAudioArrangementInput {
  segmentId: string
  startMs: number
  endMs: number
  lines: SeedAudioLine[]
  references: SeedAudioReference[]
}

export interface SeedAudioTask {
  taskId: string
  segmentId: string
  mode: 'full-track' | 'timeline-voice'
  startMs: number
  endMs: number
  speakerIds: string[]
  references: SeedAudioReference[]
  lines: SeedAudioLine[]
  includeMusicAndEffects: boolean
}

export interface SeedAudioArrangement {
  schemaVersion: 1
  segmentId: string
  speakerIds: string[]
  references: SeedAudioReference[]
  tasks: SeedAudioTask[]
}

export interface SeedAudioPromptInput {
  mode: SeedAudioMode
  language: string
  durationMs: number
  prompt: string
  references?: SeedAudioRequestReference[]
}

export interface SeedScriptCharacter {
  id: string
  label: string
  aliases?: string[]
}

export interface SeedDialogueCue extends SeedAudioLine {
  cueId: string
  startMs: number
  endMs: number
}

export interface SeedAudioRequestPayload {
  model: 'seed-audio-1.0'
  input: string
  voice: 'alloy'
  response_format: 'mp3'
  references?: SeedAudioRequestReference[]
}

export function detectScriptLanguage(text: string): 'zh' | 'en' {
  const han = (text.match(/[\u3400-\u9fff]/g) || []).length
  const latin = (text.match(/[A-Za-z]/g) || []).length
  return latin > han ? 'en' : 'zh'
}

export function seedAudioErrorMessage(status: number | undefined, body: unknown) {
  const detail =
    typeof body === 'string'
      ? body
      : (body as any)?.error?.message ||
        (body as any)?.message ||
        (body as any)?.error_msg ||
        (body as any)?.error
  return `Seed Audio 请求失败 (${status || '网络错误'})${detail ? `：${String(detail).slice(0, 240)}` : ''}`
}

function cleanId(value: unknown, label: string) {
  const id = String(value || '').trim()
  if (!id) throw new Error(`${label}不能为空`)
  return id
}

function finiteMs(value: unknown, label: string) {
  const ms = Number(value)
  if (!Number.isFinite(ms) || ms < 0) throw new Error(`${label}时间无效`)
  return ms
}

export function buildSeedAudioRequest(input: SeedAudioPromptInput): SeedAudioRequestPayload {
  const mode = input.mode
  if (!['voice-profile', 'dialogue-performance', 'full-track', 'timeline-voice'].includes(mode))
    throw new Error('Seed Audio 模式无效')
  if (!String(input.prompt || '').trim()) throw new Error('Seed Audio 提示词不能为空')
  const durationMs = Number(input.durationMs)
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('Seed Audio 时长无效')
  const references = input.references?.map((item) => cleanId(item.audio_data, '参考音数据'))
  if (references && references.length > 3) throw new Error('Seed Audio 最多支持 3 个参考音')
  if (mode === 'voice-profile' && references?.length) throw new Error('基准音不能携带参考音')
  return {
    model: 'seed-audio-1.0',
    input: input.prompt.trim(),
    voice: 'alloy',
    response_format: 'mp3',
    ...(references?.length ? { references: references.map((item) => ({ audio_data: item })) } : {}),
  }
}

export function planSeedAudioArrangement(input: SeedAudioArrangementInput): SeedAudioArrangement {
  const segmentId = cleanId(input.segmentId, '段落 ID')
  const startMs = finiteMs(input.startMs, '段落起点')
  const endMs = finiteMs(input.endMs, '段落终点')
  if (endMs <= startMs) throw new Error('段落终点必须晚于起点')
  if (!Array.isArray(input.lines) || !input.lines.length) throw new Error('整段配音缺少台词')

  const lines = input.lines.map((line) => {
    const text = String(line.text || '').trim()
    if (!text) throw new Error('整段配音存在空台词')
    const speakerId = line.speakerId ? cleanId(line.speakerId, '说话者 ID') : undefined
    const lineStart = line.startMs == null ? undefined : finiteMs(line.startMs, '台词起点')
    const lineEnd = line.endMs == null ? undefined : finiteMs(line.endMs, '台词终点')
    if (lineStart != null && lineEnd != null && lineEnd <= lineStart)
      throw new Error('台词终点必须晚于起点')
    return { ...line, speakerId, text, startMs: lineStart, endMs: lineEnd }
  })
  const explicitSpeakerIds = [
    ...new Set(lines.map((line) => line.speakerId).filter(Boolean) as string[]),
  ]
  const speakerIds = explicitSpeakerIds.length
    ? explicitSpeakerIds
    : [...new Set(input.references.map((reference) => cleanId(reference.speakerId, '参考音角色')))]
  const referenceBySpeaker = new Map(
    input.references.map((reference) => [cleanId(reference.speakerId, '参考音角色'), reference]),
  )
  const references = speakerIds.map((speakerId) => {
    const reference = referenceBySpeaker.get(speakerId)
    if (!reference?.referenceAudioPath?.trim()) throw new Error(`${speakerId} 缺少绑定参考音`)
    return reference
  })
  const primaryIds = speakerIds.slice(0, 3)
  const primaryReferences = references.filter((reference) =>
    primaryIds.includes(reference.speakerId),
  )
  const primaryLines = lines.filter(
    (line) => !line.speakerId || primaryIds.includes(line.speakerId),
  )
  const tasks: SeedAudioTask[] = [
    {
      taskId: `${segmentId}:full-track`,
      segmentId,
      mode: 'full-track',
      startMs,
      endMs,
      speakerIds: primaryIds,
      references: primaryReferences,
      lines: primaryLines,
      includeMusicAndEffects: true,
    },
  ]
  const overflowIds = speakerIds.slice(3)
  for (let offset = 0; offset < overflowIds.length; offset += 3) {
    const taskSpeakerIds = overflowIds.slice(offset, offset + 3)
    tasks.push({
      taskId: `${segmentId}:timeline-voice-${Math.floor(offset / 3) + 1}`,
      segmentId,
      mode: 'timeline-voice',
      startMs,
      endMs,
      speakerIds: taskSpeakerIds,
      references: references.filter((reference) => taskSpeakerIds.includes(reference.speakerId)),
      lines: lines.filter((line) => line.speakerId && taskSpeakerIds.includes(line.speakerId)),
      includeMusicAndEffects: false,
    })
  }
  return { schemaVersion: 1, segmentId, speakerIds, references, tasks }
}

function escaped(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function seedLinesFromScript(
  script: string,
  characters: SeedScriptCharacter[],
): SeedAudioLine[] {
  const identities = characters.flatMap((character) =>
    [character.label, ...(character.aliases || [])]
      .filter(Boolean)
      .map((name) => ({ name, id: character.id })),
  )
  const speakerPattern = identities.length
    ? new RegExp(
        `^\\s*(?:[-*\\d.、]+\\s*)?(${identities.map((item) => escaped(item.name)).join('|')}|旁白|OS|画外音)\\s*[：:]\\s*(.+)$`,
      )
    : /^\s*(旁白|OS|画外音)\s*[：:]\s*(.+)$/
  const lines = script.split(/\r?\n/).flatMap((raw) => {
    const match = raw.match(speakerPattern)
    if (!match?.[2]?.trim()) return []
    const identity = identities.find((item) => item.name === match[1])
    return [{ speakerId: identity?.id, text: match[2].trim() }]
  })
  if (lines.length) return lines
  const narration = script
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*#>]|\d+[.、])\s*/, '').trim())
    .filter(Boolean)
    .join('\n')
  return narration ? [{ text: narration }] : []
}

export function alignSeedDialogue(
  lines: SeedAudioLine[],
  cues: Array<{ cueId: string; startMs: number; endMs: number }>,
): SeedDialogueCue[] {
  if (!lines.length) throw new Error('确认文稿没有可生成的台词或旁白')
  if (!cues.length) throw new Error('Seed 完整声音轨没有识别到人声')
  if (lines.length === cues.length) return lines.map((line, index) => ({ ...line, ...cues[index] }))
  const startMs = cues[0].startMs
  const endMs = cues.at(-1)!.endMs
  const totalWeight = lines.reduce((sum, line) => sum + Math.max(1, [...line.text].length), 0)
  let cursor = startMs
  return lines.map((line, index) => {
    const next =
      index === lines.length - 1
        ? endMs
        : Math.round(
            cursor + ((endMs - startMs) * Math.max(1, [...line.text].length)) / totalWeight,
          )
    const result = {
      ...line,
      cueId: `seed-dialogue-${String(index + 1).padStart(3, '0')}`,
      startMs: cursor,
      endMs: Math.max(cursor + 1, next),
    }
    cursor = result.endMs
    return result
  })
}
