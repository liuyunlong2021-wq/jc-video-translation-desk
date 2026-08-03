import type { AssetRole, AssetVersion, ReferenceAsset } from '~/electron/types'
import { generationDurationFor, parseStoryboardPlan, type StoryboardPlan, type StoryboardSegment } from './videoWorkflow.ts'

export interface MarkdownSource {
  path: string
  content: string
}

const IMAGE_INPUTS: (keyof StoryboardSegment)[] = [
  'storyBeat', 'shotRole', 'editTreatment', 'script', 'referenceAssetIds', 'shotSize',
  'cameraAngle', 'cameraMovement', 'startState', 'actionProgression', 'endState',
  'storyboardImagePrompt',
]

function sameInputs(a: StoryboardSegment, b: StoryboardSegment, keys: (keyof StoryboardSegment)[]) {
  return keys.every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]))
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    )
  return value
}

export function sameJsonValue(a: unknown, b: unknown) {
  return JSON.stringify(stableValue(a)) === JSON.stringify(stableValue(b))
}

export function assetVersionMatches(asset: ReferenceAsset, version: AssetVersion) {
  if (version.source !== 'generated' || !version.designFingerprint) return false
  try {
    return (
      sameJsonValue(JSON.parse(version.designFingerprint), asset.design) &&
      (version.referenceRevision || 0) === (asset.referenceRevision || 0)
    )
  } catch {
    return false
  }
}

export function mergeStoryboardMedia(
  parsed: StoryboardSegment[],
  existing: StoryboardSegment[],
  visualAnchorChanged = false,
) {
  const previous = new Map(existing.map((segment) => [segment.index, segment]))
  return parsed.map((segment) => {
    const old = previous.get(segment.index)
    if (!old) return segment
    const imageUnchanged = !visualAnchorChanged && sameInputs(segment, old, IMAGE_INPUTS)
    const videoUnchanged = imageUnchanged && sameInputs(segment, old, ['videoPrompt', 'generationDuration'])
    return {
      ...segment,
      imageVersions: old.imageVersions,
      videoVersions: old.videoVersions,
      ...(imageUnchanged
        ? { imagePath: old.imagePath, imageStatus: old.imageStatus }
        : { imagePath: '', imageStatus: 'pending' as const }),
      ...(videoUnchanged
        ? {
            videoPath: old.videoPath,
            videoStatus: old.videoStatus,
            editingStatus: old.editingStatus,
            editingAnalysis: old.editingAnalysis,
            editingError: old.editingError,
            error: old.error,
          }
        : {
            videoPath: '',
            videoStatus: 'pending' as const,
            editingStatus: 'pending' as const,
            editingAnalysis: undefined,
            editingError: '',
          }),
    }
  })
}

export function assetGenerationChanged(next: ReferenceAsset, previous: ReferenceAsset) {
  return ['identityTraits', 'styleRequirements', 'design', 'searchQuery'].some(
    (key) => !sameJsonValue(next[key as keyof ReferenceAsset], previous[key as keyof ReferenceAsset]),
  )
}

export function withProjectDesign(
  design: ReferenceAsset['design'],
  visualStyle: string,
  aspectRatio: string,
) {
  return { ...(design || {}), project: { visualStyle, aspectRatio } }
}

export function isLegacyStoryboardMarkdown(content: string) {
  return !field(content, '最终节奏')
}

function section(markdown: string, title: string) {
  const match = markdown.match(
    new RegExp(`^## ${title}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'),
  )
  return match?.[1]?.trim() || ''
}

function jsonSection(markdown: string, title: string) {
  const value = section(markdown, title).replace(/^```json\s*|\s*```$/g, '')
  if (!value) return undefined
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    throw new Error(`${title} 不是合法 JSON`)
  }
}

function field(markdown: string, label: string) {
  const match = markdown.match(new RegExp(`^- ${label}：\\s*(.+)$`, 'm'))
  return match?.[1]?.trim() || ''
}

function bullet(markdown: string, label: string) {
  const match = markdown.match(new RegExp(`^- ${label}：\\s*(.+)$`, 'm'))
  return match?.[1]?.trim() || ''
}

function frontmatter(markdown: string, key: string) {
  const match = markdown.match(new RegExp(`^${key}:\\s*["']?([^\\n"']+)["']?$`, 'm'))
  return match?.[1]?.trim() || ''
}

function wikiLinks(markdown: string) {
  return [...markdown.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((match) => match[1])
}

function roleFromPath(value: string): AssetRole | null {
  if (value.includes('/产品/')) return 'prop'
  if (value.includes('/角色/')) return 'character'
  if (value.includes('/场景/')) return 'scene'
  if (value.includes('/道具/')) return 'prop'
  return null
}

function speakerName(value: string) {
  return value.replace(/[（(](?:OS|心声|内心|自言自语|旁白)[）)]/gi, '').trim()
}

export function resolveSpeakerEntityId(value: string, assets: ReferenceAsset[]) {
  const raw = speakerName(value)
  if (!raw || /^无$/.test(raw)) return undefined
  if (/^narrator-[A-Za-z0-9_-]+$/.test(raw)) return raw
  const characters = assets.filter((asset) => asset.role === 'character')
  if (raw === '我' && characters.length === 1) return characters[0].id
  const matches = assets.filter((asset) => {
    const aliases = [asset.label, ...(asset.aliases || [])]
    return asset.id === raw || aliases.some((name) => speakerName(name) === raw)
  })
  if (matches.length > 1) throw new Error(`说话者“${value}”存在多个角色匹配，请选择角色 entityId`)
  if (!matches.length) throw new Error(`说话者“${value}”未匹配到角色 entityId`)
  return matches[0].id
}

export function parseStoryboardMarkdown(
  director: MarkdownSource,
  shots: MarkdownSource[],
  assets: MarkdownSource[],
  approvedScript: string,
  timelineDuration: number,
  selectedPace: 'auto' | 'slow' | 'medium' | 'fast',
) {
  if (!shots.length) throw new Error('导演没有写入单镜 Markdown')
  const assetsById = new Map<string, ReferenceAsset>()
  for (const source of assets) {
    const id = frontmatter(source.content, 'entityId') || source.path.split('/').pop()!.replace(/\.md$/, '')
    const role = (frontmatter(source.content, 'assetRole') as AssetRole) || roleFromPath(source.path)
    const label = source.content.match(/^#\s+(.+)$/m)?.[1]?.trim() || ''
    if (!id || !role || !label) throw new Error(`${source.path} 缺少资产 ID、类型或名称`)
    assetsById.set(id, {
      id,
      planKey: id,
      role,
      label,
      aliases: section(source.content, '别名').split('\n').map((line) => line.replace(/^[-*]\s*/, '').trim()).filter(Boolean),
      description: section(source.content, '说明') || label,
      identityTraits: section(source.content, '身份特征').split('\n').map((line) => line.replace(/^-\s*/, '').trim()).filter(Boolean),
      styleRequirements: section(source.content, '风格要求').split('\n').map((line) => line.replace(/^-\s*/, '').trim()).filter(Boolean),
      required: true,
      status: 'planned',
      design: jsonSection(source.content, '资产设计 JSON'),
      searchQuery: section(source.content, '参考图搜索词'),
      versions: [],
      sourceDocument: source.path,
    })
  }
  const segments = shots
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((source, offset) => {
      const content = source.content
      const playDuration = Number.parseFloat(field(content, '播放时长'))
      const linkedAssetIds = wikiLinks(field(content, '资产'))
        .map((link) => link.split('/').pop() || '')
        .filter((id) => id && assetsById.has(id))
      const soundSection = section(content, '声音与时间轴')
      const soundType = bullet(soundSection, '类型').includes('画面内')
        ? 'onscreen'
        : /旁白|画外音/.test(bullet(soundSection, '类型'))
          ? 'voiceover'
          : 'none'
      const namedSpeaker = bullet(soundSection, '说话者ID') || bullet(soundSection, '对白角色')
      const speakerId = soundType === 'voiceover' && !namedSpeaker
        ? 'narrator-001'
        : resolveSpeakerEntityId(namedSpeaker, [...assetsById.values()])
      return {
        index: offset + 1,
        storyBeat: field(content, '叙事作用'),
        shotRole: field(content, '镜头职责'),
        editTreatment: field(content, '剪辑处理'),
        playDuration,
        generationDuration: Number.parseFloat(field(content, '生成时长')) || generationDurationFor(playDuration),
        script: section(content, '对应原文') || section(content, '对应台词'),
        timelineType: soundType === 'none' ? 'action' : 'dialogue',
        soundType,
        speakerId,
        dialogueCharacter: namedSpeaker || (speakerId?.startsWith('narrator-') ? '旁白' : '无'),
        dialogueText: bullet(soundSection, '对应台词'),
        dialogueEmotion: bullet(soundSection, '声音情绪') || '无',
        emotionIntensity: bullet(soundSection, '情绪强度') || '无',
        speechRate: bullet(soundSection, '语速') || '无',
        pauseEmphasis: bullet(soundSection, '停顿/重音') || '无',
        dialogueDuration: Number.parseFloat(bullet(soundSection, '对白时长')) || 0,
        lipSyncRequired: /需要口型/.test(bullet(soundSection, '口型/动作配合')),
        soundDesign: bullet(soundSection, '环境音/动作音') || '无',
        referenceAssetIds: linkedAssetIds,
        shotSize: field(content, '景别'),
        cameraAngle: field(content, '机位'),
        cameraMovement: field(content, '运镜'),
        startState: section(content, '起始状态'),
        actionProgression: section(content, '动作过程'),
        endState: section(content, '结束状态'),
        storyboardImagePrompt: section(content, '画面提示词'),
        videoPrompt: `${section(content, '视频提示词')}\n\n单一连续镜头，无切镜，无转场，无背景音乐。`,
      }
    })
  const pace = field(director.content, '最终节奏') as 'slow' | 'medium' | 'fast'
  const plan = parseStoryboardPlan(
    {
      creativeIdentity: field(director.content, '导演身份'),
      sceneReference: field(director.content, '参考场景'),
      rhythmArchive: field(director.content, '节奏档案'),
      distributionIntent: field(director.content, '分发意图'),
      resolvedPace: pace,
      referenceShotCount: Number.parseInt(field(director.content, '参考镜头数')) || undefined,
      finalShotCount: Number.parseInt(field(director.content, '最终镜头数')) || segments.length,
      shotCountRationale: field(director.content, '数量理由'),
      visualAnchor: section(director.content, '全局视觉锚点'),
      segments,
    },
    approvedScript,
    timelineDuration,
    selectedPace,
  )
  return { plan: plan as StoryboardPlan, assets: [...assetsById.values()] }
}
