import type { ArtifactStatus } from './productionContract.ts'
import type { SeedAudioReference } from './seedAudio.ts'

export type WorkspaceEntry = 'content-create' | 'video-translate'

export interface TranslationRole {
  translationRoleId: string
  displayName: string
  aliases: string[]
  description?: string
  linkedCreativeRoleId?: string
  voiceProfileId?: string
  sourceEpisodeIds: string[]
  status: 'confirmed'
}

export interface VideoTranslationCue {
  cueId: string
  startMs: number
  endMs: number
  recognizedText: string
  sourceText: string
  translatedText: string
  translationRoleId?: string
  proposedName?: string
  confidence?: number
  evidence?: string
  ocrText?: string
  needsReview: boolean
  voicePath?: string
  suspectedMissing?: boolean
}

export interface VideoTranslationState {
  sourceVideoPath?: string
  sourceFingerprint?: string
  finalMasterVideoPath?: string
  finalMasterFingerprint?: string
  sourceLanguage: string
  targetLanguage: string
  durationMs: number
  hasAudio: boolean
  sourceTranscriptPath?: string
  sourceSrtPath?: string
  contextPath?: string
  confirmedDialoguePath?: string
  seedArrangementPath?: string
  seedPromptPath?: string
  seedPromptText?: string
  seedPromptGeneratedBySkill?: boolean
  voiceVersions: VideoTranslationVoiceVersion[]
  activeVoiceVersionId?: string
  targetVoicePath?: string
  vocalPath?: string
  instrumentPath?: string
  mixedPath?: string
  finalVideoPath?: string
  cues: VideoTranslationCue[]
  transcriptStatus: ArtifactStatus
  speakerStatus: ArtifactStatus
  translationStatus: ArtifactStatus
  reviewStatus: ArtifactStatus
  arrangementStatus: ArtifactStatus
  voiceStatus: ArtifactStatus
  separationStatus: ArtifactStatus
  mixStatus: ArtifactStatus
  finalStatus: ArtifactStatus
  originalVocalRemoved: boolean
  error?: string
}

export interface VideoTranslationVoiceVersion {
  versionId: string
  kind: 'timeline' | 'continuous'
  createdAt: string
  prompt: string
  previewPath: string
  targetVoicePath: string
  blockAudioPaths: string[]
  durationMs: number
  model?: string
}

export interface VideoTranslationDialogueLine {
  cueId: string
  speakerId: string
  text: string
  performanceEvidence?: string
  expectedStartMs: number
  expectedEndMs: number
}

export interface VideoTranslationDialogueBlock {
  blockId: string
  cueIds: string[]
  speakerIds: string[]
  references: SeedAudioReference[]
  lines: VideoTranslationDialogueLine[]
}

export interface VideoTranslationDialogueArrangement {
  schemaVersion: 1
  episodeId: string
  targetLanguage: string
  durationMs: number
  blocks: VideoTranslationDialogueBlock[]
}

export interface VideoTranslationDialoguePlan {
  arrangement: VideoTranslationDialogueArrangement
  promptMarkdown: string
}

export interface DialogueWord {
  word: string
  start: number
  end: number
}

export interface DialogueCueAlignment {
  cueId: string
  observedStartMs: number
  observedEndMs: number
  matchedWords: number
}

export function insertVideoTranslationCueAt(
  cues: VideoTranslationCue[],
  durationMs: number,
  playheadMs: number,
  cueId: string,
) {
  const sorted = cues.map((cue) => ({ ...cue })).sort((a, b) => a.startMs - b.startMs)
  const at = Math.max(0, Math.min(durationMs, Math.round(playheadMs)))
  const containing = sorted.find((cue) => cue.startMs < at && at < cue.endMs)
  if (containing) {
    const oldEnd = containing.endMs
    containing.endMs = at
    const created: VideoTranslationCue = {
      cueId,
      startMs: at,
      endMs: oldEnd,
      recognizedText: '',
      sourceText: '',
      translatedText: '',
      translationRoleId: containing.translationRoleId,
      proposedName: containing.proposedName,
      confidence: 0,
      evidence: '人工从播放头拆分',
      needsReview: true,
    }
    sorted.push(created)
    return {
      cues: sorted.sort((a, b) => a.startMs - b.startMs),
      cue: created,
      mode: 'split' as const,
    }
  }
  const previous = sorted.filter((cue) => cue.endMs <= at).at(-1)
  const next = sorted.find((cue) => cue.startMs >= at)
  const endMs = Math.min(next?.startMs ?? durationMs, at + 2000)
  if (endMs <= at) throw new Error('当前位置没有可新增字幕的时间空隙')
  const neighbor = previous || next
  const created: VideoTranslationCue = {
    cueId,
    startMs: at,
    endMs,
    recognizedText: '',
    sourceText: '',
    translatedText: '',
    translationRoleId: neighbor?.translationRoleId,
    proposedName: neighbor?.proposedName,
    confidence: 0,
    evidence: '人工在播放头新增',
    needsReview: true,
  }
  sorted.push(created)
  return {
    cues: sorted.sort((a, b) => a.startMs - b.startMs),
    cue: created,
    mode: 'insert' as const,
  }
}

export function setVideoTranslationCueBoundary(
  cues: VideoTranslationCue[],
  cueId: string,
  boundary: 'start' | 'end',
  playheadMs: number,
) {
  const sorted = cues.map((cue) => ({ ...cue })).sort((a, b) => a.startMs - b.startMs)
  const index = sorted.findIndex((cue) => cue.cueId === cueId)
  if (index < 0) throw new Error('请先选择字幕行')
  const cue = sorted[index]
  const at = Math.round(playheadMs)
  if (boundary === 'start') {
    if (at < (sorted[index - 1]?.endMs ?? 0) || at >= cue.endMs)
      throw new Error('开始时间必须位于上一条字幕结束后、当前字幕结束前')
    cue.startMs = at
  } else {
    if (at <= cue.startMs || at > (sorted[index + 1]?.startMs ?? Number.POSITIVE_INFINITY))
      throw new Error('结束时间必须位于当前字幕开始后、下一条字幕开始前')
    cue.endMs = at
  }
  return sorted
}

export function findUncoveredSpeechIntervals(
  cues: Array<Pick<VideoTranslationCue, 'startMs' | 'endMs'>>,
  speech: Array<{ startMs: number; endMs: number; recognizedText: string }>,
  minimumMs = 300,
) {
  const covered = cues.slice().sort((a, b) => a.startMs - b.startMs)
  return speech.flatMap((item) => {
    let cursor = item.startMs
    const gaps: Array<{ startMs: number; endMs: number; recognizedText: string }> = []
    for (const cue of covered) {
      if (cue.endMs <= cursor || cue.startMs >= item.endMs) continue
      if (cue.startMs - cursor >= minimumMs)
        gaps.push({ startMs: cursor, endMs: cue.startMs, recognizedText: item.recognizedText })
      cursor = Math.max(cursor, cue.endMs)
      if (cursor >= item.endMs) break
    }
    if (item.endMs - cursor >= minimumMs)
      gaps.push({ startMs: cursor, endMs: item.endMs, recognizedText: item.recognizedText })
    return gaps
  })
}

const SUBTITLE_BREAKS = new Set([',', '.', '?', '!', ';', '，', '。', '？', '；', '！', ' '])
const SUBTITLE_PUNCTUATION = new Set([',', '.', '?', '!', ';', '，', '。', '？', '；', '！', '…'])
const SUBTITLE_CLOSERS = new Set(['"', "'", '”', '’', ')', ']', '）', '】'])

export function splitTimedSubtitleText(
  text: string,
  startMs: number,
  endMs: number,
  language = 'auto',
) {
  const normalized = text.replace(/\r?(?:\n|\\n)/gi, ' ').trim()
  const characters = Array.from(normalized)
  const isCjk =
    /^(?:zh|ja|jp|ko|yu)/i.test(language) ||
    /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff]/u.test(normalized)
  const maxLength = isCjk ? 15 : 40
  const offset = Math.min(isCjk ? 2 : 8, Math.floor(maxLength / 2))
  const punctuationParts: string[] = []
  let punctuationPart = ''
  for (let index = 0; index < characters.length; index++) {
    const character = characters[index]
    punctuationPart += character
    const decimalPoint =
      character === '.' &&
      /\d/.test(characters[index - 1] || '') &&
      /\d/.test(characters[index + 1] || '')
    if (!SUBTITLE_PUNCTUATION.has(character) || decimalPoint) continue
    while (
      index + 1 < characters.length &&
      (SUBTITLE_PUNCTUATION.has(characters[index + 1]) ||
        SUBTITLE_CLOSERS.has(characters[index + 1]))
    )
      punctuationPart += characters[++index]
    punctuationParts.push(punctuationPart.trim())
    punctuationPart = ''
  }
  if (punctuationPart.trim()) punctuationParts.push(punctuationPart.trim())

  const lines = punctuationParts.flatMap((part) => {
    const partCharacters = Array.from(part)
    if (partCharacters.length < maxLength + 4) return [part]
    const wrapped: string[] = []
    let current = ''
    let index = 0
    while (index < partCharacters.length) {
      current = current.trimStart()
      if (index >= partCharacters.length - offset) {
        current += partCharacters.slice(index).join('')
        break
      }
      if (Array.from(current).length < maxLength - offset) {
        current += partCharacters[index++]
        continue
      }
      const currentLength = Array.from(current).length
      if (currentLength <= maxLength && SUBTITLE_BREAKS.has(partCharacters[index])) {
        wrapped.push(current + partCharacters[index++])
        current = ''
        continue
      }
      let breakAt = index
      for (let step = 1; step <= offset && index + step < partCharacters.length; step++) {
        if (SUBTITLE_BREAKS.has(partCharacters[index + step])) {
          breakAt = index + step + 1
          break
        }
      }
      if (breakAt !== index) {
        wrapped.push(current + partCharacters.slice(index, breakAt).join(''))
        current = ''
        index = breakAt
        continue
      }
      current += partCharacters[index++]
      if (Array.from(current).length >= maxLength) {
        wrapped.push(current)
        current = ''
      }
    }
    if (current && Array.from(current).length < maxLength / 3 && wrapped.length)
      wrapped[wrapped.length - 1] += current
    else if (current) wrapped.push(current)
    return wrapped
  })
  if (lines.length < 2 || endMs - startMs < lines.length)
    return [{ startMs, endMs, text: normalized }]

  const weights = lines.map((line) => Math.max(1, Array.from(line.replace(/\s+/g, '')).length))
  const totalWeight = weights.reduce((total, weight) => total + weight, 0)
  const durationMs = endMs - startMs
  let cursor = startMs
  let cumulativeWeight = 0
  return lines.map((line, lineIndex) => {
    cumulativeWeight += weights[lineIndex]
    const remaining = lines.length - lineIndex - 1
    const next =
      lineIndex === lines.length - 1
        ? endMs
        : Math.max(
            cursor + 1,
            Math.min(
              endMs - remaining,
              startMs + Math.round((durationMs * cumulativeWeight) / totalWeight),
            ),
          )
    const result = { startMs: cursor, endMs: next, text: line.trim() }
    cursor = next
    return result
  })
}

export type VideoTranslationAction =
  | 'upload-video'
  | 'upload-final-master'
  | 'reverse-video'
  | 'translate-all-subtitles'
  | 'open-voice-workspace'
  | 'arrange-doubao-voice'
  | 'generate-target-voice'
  | 'separate-source-audio'
  | 'remove-original-vocal'
  | 'mix-background-audio'
  | 'burn-subtitles-and-voice'

export type VideoTranslationChange =
  | 'source-video'
  | 'final-master-video'
  | 'source-dialogue'
  | 'translation'
  | 'role-binding'
  | 'language'
  | 'voice-binding'
  | 'voice-prompt'
  | 'target-voice'
  | 'separation'

export function createVideoTranslationState(): VideoTranslationState {
  return {
    sourceLanguage: 'auto',
    targetLanguage: 'en',
    durationMs: 0,
    hasAudio: false,
    cues: [],
    voiceVersions: [],
    transcriptStatus: 'idle',
    speakerStatus: 'idle',
    translationStatus: 'idle',
    reviewStatus: 'idle',
    arrangementStatus: 'idle',
    voiceStatus: 'idle',
    separationStatus: 'idle',
    mixStatus: 'idle',
    finalStatus: 'idle',
    originalVocalRemoved: false,
  }
}

export function validateVideoTranslationDialoguePrompt(
  prompt: string,
  block: VideoTranslationDialogueBlock,
) {
  const paragraphs = prompt
    .split(/\n\s*\n/)
    .map((value) => value.trim())
    .filter(Boolean)
  block.references.forEach((reference, index) => {
    const label = reference.label?.split('·')[0]?.trim() || reference.speakerId
    if (
      !prompt
        .split('\n')
        .some((line) => line.includes(label) && line.includes(`饰演者为@音频${index + 1}`))
    )
      throw new Error(`${block.blockId} 缺少${label}的独立角色定义与参考音映射`)
  })
  if (/固定音色|固定声线|不能串音|声音身份|情绪变化不能改变|参考音只锁定/.test(prompt))
    throw new Error(`${block.blockId} 含有压制自然表演的角色约束`)
  if (
    /\[\s*\d+(?:\.\d+)?s?\s*:\s*\d+(?:\.\d+)?s?\s*\]|\b(?:low|medium|high)\b\s*(?:intensity|strength|level|强度|档位)|(?:intensity|strength|level|强度|档位)\s*(?:[:：为是]\s*)?\b(?:low|medium|high)\b|高中低强度/i.test(
      prompt,
    )
  )
    throw new Error(`${block.blockId} 不得包含时间戳或强度档位`)
  let cursor = 0
  for (const line of block.lines) {
    const offset = prompt.indexOf(line.text, cursor)
    if (offset < 0) throw new Error(`${block.blockId} 未按顺序逐字保留确认台词`)
    const label = block.references
      .find((item) => item.speakerId === line.speakerId)
      ?.label?.split('·')[0]
      ?.trim()
    const paragraph = paragraphs.find((value) => value.includes(line.text))
    if (!paragraph || (label && !paragraph.includes(label)))
      throw new Error(`${block.blockId} 的台词缺少角色和自然表演说明：${line.cueId}`)
    cursor = offset + line.text.length
  }
}

function actionable(status: ArtifactStatus) {
  return status === 'idle' || status === 'failed' || status === 'stale'
}

function invalidate(status: ArtifactStatus): ArtifactStatus {
  if (status === 'ready') return 'stale'
  if (status === 'running' || status === 'failed') return 'idle'
  return status
}

export function availableVideoTranslationActions(
  state: VideoTranslationState,
  roles: TranslationRole[],
): VideoTranslationAction[] {
  const actions: VideoTranslationAction[] = ['upload-video']
  if (!state.sourceVideoPath) return actions
  actions.push('upload-final-master')
  if (!state.hasAudio) return actions
  actions.push('reverse-video')
  if (state.speakerStatus !== 'ready') return actions
  if (
    state.speakerStatus === 'ready' &&
    state.cues.every((cue) => cue.sourceText.trim()) &&
    actionable(state.translationStatus)
  )
    actions.push('translate-all-subtitles')
  if (
    state.speakerStatus === 'ready' &&
    state.translationStatus === 'ready' &&
    state.reviewStatus !== 'running'
  )
    actions.push('open-voice-workspace')
  if (state.reviewStatus !== 'ready') return actions
  const roleById = new Map(roles.map((role) => [role.translationRoleId, role]))
  const dialogueReady = state.cues.every(
    (cue) =>
      cue.sourceText.trim() &&
      cue.translatedText.trim() &&
      cue.translationRoleId &&
      roleById.get(cue.translationRoleId)?.voiceProfileId,
  )
  if (dialogueReady && (actionable(state.arrangementStatus) || state.voiceStatus === 'failed'))
    actions.push('arrange-doubao-voice')
  if (state.arrangementStatus === 'ready' && actionable(state.voiceStatus))
    actions.push('generate-target-voice')
  if (actionable(state.separationStatus)) actions.push('separate-source-audio')
  else if (state.separationStatus === 'ready' && !state.originalVocalRemoved)
    actions.push('remove-original-vocal')
  else if (
    state.originalVocalRemoved &&
    state.voiceStatus === 'ready' &&
    actionable(state.mixStatus)
  )
    actions.push('mix-background-audio')
  if (state.mixStatus === 'ready' && actionable(state.finalStatus))
    actions.push('burn-subtitles-and-voice')
  return actions
}

export function invalidateVideoTranslation(
  state: VideoTranslationState,
  change: VideoTranslationChange,
): VideoTranslationState {
  const next = { ...state, cues: state.cues.map((cue) => ({ ...cue })) }
  if (change === 'source-video') {
    const fresh = createVideoTranslationState()
    fresh.sourceLanguage = state.sourceLanguage
    fresh.targetLanguage = state.targetLanguage
    return fresh
  }
  if (change === 'final-master-video') {
    next.separationStatus = invalidate(next.separationStatus)
    next.mixStatus = invalidate(next.mixStatus)
    next.finalStatus = invalidate(next.finalStatus)
    next.vocalPath = undefined
    next.instrumentPath = undefined
    next.mixedPath = undefined
    next.finalVideoPath = undefined
    next.originalVocalRemoved = false
    return next
  }
  if (change === 'source-dialogue') {
    next.translationStatus = invalidate(next.translationStatus)
    next.reviewStatus = invalidate(next.reviewStatus)
    next.cues.forEach((cue) => {
      cue.translatedText = ''
    })
  } else if (change === 'translation') {
    next.reviewStatus = invalidate(next.reviewStatus)
  } else if (change === 'role-binding') {
    next.reviewStatus = invalidate(next.reviewStatus)
  } else if (change === 'language') {
    next.translationStatus = invalidate(next.translationStatus)
    next.reviewStatus = invalidate(next.reviewStatus)
    next.cues.forEach((cue) => {
      cue.translatedText = ''
    })
  }
  if (
    [
      'source-dialogue',
      'translation',
      'role-binding',
      'language',
      'voice-binding',
      'voice-prompt',
    ].includes(change)
  )
    next.arrangementStatus = invalidate(next.arrangementStatus)
  if (
    [
      'source-dialogue',
      'translation',
      'role-binding',
      'language',
      'voice-binding',
      'voice-prompt',
    ].includes(change)
  )
    next.voiceStatus = invalidate(next.voiceStatus)
  if (change !== 'separation') next.mixStatus = invalidate(next.mixStatus)
  if (change === 'target-voice' || change === 'separation')
    next.mixStatus = invalidate(next.mixStatus)
  next.finalStatus = invalidate(next.finalStatus)
  return next
}

export function validateConfirmedTranslation(
  cues: VideoTranslationCue[],
  roles: TranslationRole[],
) {
  if (!cues.length) throw new Error('没有可确认的字幕')
  const roleIds = new Set(roles.map((role) => role.translationRoleId))
  let previousEnd = 0
  const cueIds = new Set<string>()
  for (const cue of cues) {
    if (
      !cue.cueId?.trim() ||
      cueIds.has(cue.cueId) ||
      !Number.isFinite(cue.startMs) ||
      !Number.isFinite(cue.endMs) ||
      cue.startMs < previousEnd ||
      cue.endMs <= cue.startMs ||
      !cue.sourceText?.trim() ||
      !cue.translatedText?.trim() ||
      !cue.translationRoleId ||
      !roleIds.has(cue.translationRoleId)
    )
      throw new Error('角色与字幕确认内容无效')
    cueIds.add(cue.cueId)
    previousEnd = cue.endMs
  }
  return cues
}

export function planVideoTranslationDialogueBlocks(
  episodeId: string,
  durationMs: number,
  targetLanguage: string,
  cues: VideoTranslationCue[],
  roles: TranslationRole[],
  references: SeedAudioReference[],
): VideoTranslationDialoguePlan {
  validateConfirmedTranslation(cues, roles)
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('原片时长无效')
  const referenceBySpeaker = new Map(references.map((item) => [item.speakerId, item]))
  const blocks: VideoTranslationDialogueBlock[] = []
  let current: VideoTranslationDialogueBlock | undefined
  for (const cue of cues) {
    const speakerId = cue.translationRoleId!
    const reference = referenceBySpeaker.get(speakerId)
    if (!reference?.referenceAudioPath?.trim()) throw new Error(`${speakerId} 缺少绑定参考音`)
    if (current && !current.speakerIds.includes(speakerId) && current.speakerIds.length === 3)
      current = undefined
    if (!current) {
      current = {
        blockId: `dialogue-block-${String(blocks.length + 1).padStart(3, '0')}`,
        cueIds: [],
        speakerIds: [],
        references: [],
        lines: [],
      }
      blocks.push(current)
    }
    if (!current.speakerIds.includes(speakerId)) {
      current.speakerIds.push(speakerId)
      current.references.push(reference)
    }
    current.cueIds.push(cue.cueId)
    current.lines.push({
      cueId: cue.cueId,
      speakerId,
      text: cue.translatedText.trim(),
      ...(cue.evidence?.trim() ? { performanceEvidence: cue.evidence.trim() } : {}),
      expectedStartMs: cue.startMs,
      expectedEndMs: cue.endMs,
    })
  }
  const arrangement: VideoTranslationDialogueArrangement = {
    schemaVersion: 1,
    episodeId,
    targetLanguage,
    durationMs,
    blocks,
  }
  const promptMarkdown = [
    '# 连续对白导演稿',
    ...blocks.map((block) => `\n## ${block.blockId}\n`),
  ].join('\n')
  return { arrangement, promptMarkdown }
}

function dialogueTokens(text: string) {
  return (text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).map((token) =>
    token.toLocaleLowerCase().replace(/['’]/g, ''),
  )
}

export function alignDialogueBlockWords(
  lines: VideoTranslationDialogueLine[],
  words: DialogueWord[],
  durationMs: number,
): DialogueCueAlignment[] {
  const targets = lines.flatMap((line, cueIndex) =>
    dialogueTokens(line.text).map((token) => ({ token, cueIndex })),
  )
  const observed = words.flatMap((word, wordIndex) =>
    dialogueTokens(word.word).map((token) => ({ token, wordIndex })),
  )
  if (!targets.length || !observed.length) throw new Error('连续对白没有可对齐的识别单词')
  const rows = targets.length + 1
  const columns = observed.length + 1
  const scores = Array.from({ length: rows }, () => new Uint16Array(columns))
  for (let target = 1; target < rows; target++)
    for (let word = 1; word < columns; word++)
      scores[target][word] =
        targets[target - 1].token === observed[word - 1].token
          ? scores[target - 1][word - 1] + 1
          : Math.max(scores[target - 1][word], scores[target][word - 1])
  const matches: Array<{ cueIndex: number; wordIndex: number }> = []
  let target = targets.length
  let word = observed.length
  while (target && word) {
    if (targets[target - 1].token === observed[word - 1].token) {
      matches.push({
        cueIndex: targets[target - 1].cueIndex,
        wordIndex: observed[word - 1].wordIndex,
      })
      target--
      word--
    } else if (scores[target - 1][word] >= scores[target][word - 1]) target--
    else word--
  }
  matches.reverse()
  if (!matches.length || matches.length / targets.length < 0.4)
    throw new Error('连续对白识别结果与确认台词不匹配')
  const byCue = lines.map((_, cueIndex) => matches.filter((item) => item.cueIndex === cueIndex))
  return lines.map((line, cueIndex) => {
    const cueMatches = byCue[cueIndex]
    if (!cueMatches.length) throw new Error(`${line.cueId} 没有可靠的识别单词`)
    const first = words[cueMatches[0].wordIndex]
    const last = words[cueMatches.at(-1)!.wordIndex]
    return {
      cueId: line.cueId,
      observedStartMs: Math.max(0, Math.round(first.start * 1000) - 80),
      observedEndMs: Math.min(durationMs, Math.round(last.end * 1000) + 120),
      matchedWords: cueMatches.length,
    }
  })
}
