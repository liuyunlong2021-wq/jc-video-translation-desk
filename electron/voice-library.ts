import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { app } from 'electron'
import { parseFile } from 'music-metadata'

export type VoiceRights = 'commercial-cleared' | 'local-only' | 'unknown' | 'rejected'
export interface VoiceProfile {
  voiceProfileId: string
  displayName: string
  sourceGroup: string
  sourceRelativePath: string
  sourceSha256: string
  referenceRelativePath?: string
  format: 'wav' | 'mp3' | 'other'
  durationMs: number
  sampleRate?: number
  channels?: number
  tags: string[]
  roleTags: string[]
  emotionTags: string[]
  autoTags: string[]
  language?: string
  dialect?: string
  quality: 'pending' | 'approved' | 'rejected'
  cloneReady: boolean
  rights: VoiceRights
  notes?: string
}

export interface VoiceCatalog { version: 1; profiles: VoiceProfile[] }
const AUDIO = new Set(['.wav', '.mp3', '.m4a', '.flac', '.ogg', '.aac'])

function libraryDir() { return process.env.VOICE_LIBRARY_DIR || path.join(app.getPath('userData'), 'voice-library') }
function catalogPath() { return path.join(libraryDir(), 'catalog.json') }
function sourcePath() { return path.join(libraryDir(), 'source.json') }
function isInside(root: string, child: string) { return child === root || child.startsWith(`${root}${path.sep}`) }
function normalize(relativePath: string) { return relativePath.split(path.sep).join('/') }
function sourceGroup(relativePath: string) { return relativePath.split('/')[0] || '未分类' }
function autoTags(relativePath: string) {
  const value = relativePath.toLowerCase()
  return [
    ['男', '男声'], ['女', '女声'], ['青年', '青年'], ['中年', '中年'], ['老年', '老年'], ['孩童', '儿童'],
    ['旁白', '旁白'], ['广告', '广告'], ['方言', '方言'], ['情绪', '情绪参考'], ['影视', '影视特征'], ['角色', '角色化'],
  ].filter(([needle]) => value.includes(needle)).map(([, tag]) => tag)
}

async function files(root: string): Promise<string[]> {
  const result: string[] = []
  const visit = async (dir: string) => {
    for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name)
      if (entry.isDirectory()) await visit(target)
      else if (entry.isFile() && AUDIO.has(path.extname(entry.name).toLowerCase())) result.push(target)
    }
  }
  await visit(root)
  return result.sort()
}

async function loadCatalog(): Promise<VoiceCatalog> {
  try { return JSON.parse(await fs.promises.readFile(catalogPath(), 'utf8')) } catch { return { version: 1, profiles: [] } }
}
async function write(filePath: string, content: string) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(`${filePath}.tmp`, content, 'utf8')
  await fs.promises.rename(`${filePath}.tmp`, filePath)
}
async function sourceRoot() {
  const { root } = JSON.parse(await fs.promises.readFile(sourcePath(), 'utf8'))
  if (!root || typeof root !== 'string') throw new Error('请先扫描音色源目录')
  return path.resolve(root)
}
function tags(value: unknown, name: string) {
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== 'string' || !tag.trim())) throw new Error(`${name} 必须是非空字符串数组`)
  return [...new Set(value.map((tag) => tag.trim()))]
}
async function saveCatalog(catalog: VoiceCatalog) { await write(catalogPath(), `${JSON.stringify(catalog, null, 2)}\n`) }

export async function scanVoiceLibrary(sourceRoot: string) {
  const root = path.resolve(sourceRoot)
  if (!(await fs.promises.stat(root)).isDirectory()) throw new Error('音色源目录不可读')
  const old = await loadCatalog()
  const existing = new Map(old.profiles.map((profile) => [profile.sourceSha256, profile]))
  const scanned = new Map<string, VoiceProfile>()
  const present = new Set<string>()
  const duplicates = new Map<string, string[]>()
  const profiles: VoiceProfile[] = []
  for (const filePath of await files(root)) {
    const relativePath = normalize(path.relative(root, filePath))
    if (!isInside(root, path.resolve(filePath))) throw new Error('音色源路径越界')
    const sourceSha256 = createHash('sha256').update(await fs.promises.readFile(filePath)).digest('hex')
    present.add(sourceSha256)
    const group = sourceGroup(relativePath)
    const previous = existing.get(sourceSha256)
    if (previous) {
      if (group === '英语人物音色' && !previous.language) previous.language = 'English'
      duplicates.set(sourceSha256, [...(duplicates.get(sourceSha256) || [previous.sourceRelativePath]), relativePath])
      continue
    }
    const first = scanned.get(sourceSha256)
    if (first) {
      duplicates.set(sourceSha256, [...(duplicates.get(sourceSha256) || [first.sourceRelativePath]), relativePath])
      continue
    }
    let metadata: Awaited<ReturnType<typeof parseFile>> | undefined
    try { metadata = await parseFile(filePath, { duration: true }) } catch { /* Keep unreadable metadata as a pending profile. */ }
    const ext = path.extname(filePath).slice(1).toLowerCase()
    const localOnly = group === '马宝国'
    const profile: VoiceProfile = {
      voiceProfileId: `voice-${sourceSha256.slice(0, 16)}`,
      displayName: path.basename(filePath, path.extname(filePath)), sourceGroup: group, sourceRelativePath: relativePath, sourceSha256,
      format: ext === 'wav' || ext === 'mp3' ? ext : 'other', durationMs: Math.round((metadata?.format.duration || 0) * 1000),
      sampleRate: metadata?.format.sampleRate, channels: metadata?.format.numberOfChannels,
      tags: [], roleTags: [], emotionTags: [], autoTags: autoTags(relativePath), language: group === '英语人物音色' ? 'English' : undefined, quality: 'pending', cloneReady: false,
      rights: localOnly ? 'local-only' : 'unknown', notes: localOnly ? '真实人物语音，仅本地测试。' : undefined,
    }
    scanned.set(sourceSha256, profile)
    profiles.push(profile)
  }
  const catalog: VoiceCatalog = { version: 1, profiles: [...existing.values(), ...profiles].sort((a, b) => a.voiceProfileId.localeCompare(b.voiceProfileId)) }
  await saveCatalog(catalog)
  await write(sourcePath(), `${JSON.stringify({ root }, null, 2)}\n`)
  await renderVoiceLibrary(catalog)
  const report = { sourceFileCount: (await files(root)).length, profileCount: catalog.profiles.length, duplicateGroups: [...duplicates.values()].filter((paths) => paths.length > 1), missingSourceProfiles: catalog.profiles.filter((profile) => !present.has(profile.sourceSha256)).map((profile) => profile.voiceProfileId), generatedAt: new Date().toISOString() }
  await write(path.join(libraryDir(), '盘点报告.json'), `${JSON.stringify(report, null, 2)}\n`)
  return report
}

export function searchVoiceProfiles(
  catalog: VoiceCatalog,
  query: Partial<Pick<VoiceProfile, 'roleTags' | 'tags' | 'emotionTags' | 'cloneReady' | 'rights' | 'sourceGroup' | 'language'>> & { includeNonCommercial?: boolean } = {},
) {
  const includes = (values: string[], expected?: string[]) => !expected?.length || expected.every((tag) => values.includes(tag))
  return catalog.profiles.filter((profile) =>
    (query.includeNonCommercial || profile.rights === 'commercial-cleared') &&
    (!query.sourceGroup || profile.sourceGroup === query.sourceGroup) &&
    (!query.language || profile.language === query.language) &&
    (query.cloneReady === undefined || profile.cloneReady === query.cloneReady) &&
    (!query.rights || profile.rights === query.rights) &&
    includes(profile.roleTags, query.roleTags) && includes(profile.tags, query.tags) && includes(profile.emotionTags, query.emotionTags),
  )
}

export async function listVoiceProfiles(query?: Parameters<typeof searchVoiceProfiles>[1]) {
  return searchVoiceProfiles(await loadCatalog(), query)
}

export async function reviewVoiceProfile(
  voiceProfileId: string,
  patch: Pick<VoiceProfile, 'displayName' | 'tags' | 'roleTags' | 'emotionTags' | 'quality' | 'rights' | 'cloneReady'> & Partial<Pick<VoiceProfile, 'language' | 'dialect' | 'notes'>>,
) {
  const catalog = await loadCatalog()
  const profile = catalog.profiles.find((item) => item.voiceProfileId === voiceProfileId)
  if (!profile) throw new Error('不存在的 voiceProfileId')
  if (!['pending', 'approved', 'rejected'].includes(patch.quality) || !['commercial-cleared', 'local-only', 'unknown', 'rejected'].includes(patch.rights)) throw new Error('无效的审核状态')
  Object.assign(profile, { ...patch, displayName: patch.displayName.trim(), tags: tags(patch.tags, 'tags'), roleTags: tags(patch.roleTags, 'roleTags'), emotionTags: tags(patch.emotionTags, 'emotionTags') })
  if (!profile.displayName) throw new Error('显示名称不能为空')
  if (profile.quality !== 'approved') profile.cloneReady = false
  await saveCatalog(catalog)
  await renderVoiceLibrary(catalog)
  return profile
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const process = spawn('ffmpeg', ['-y', ...args], { stdio: 'ignore' })
    process.once('error', () => reject(new Error('ffmpeg 不可用，无法生成标准化参考音频')))
    process.once('exit', (code) => code === 0 ? resolve() : reject(new Error('参考音频标准化失败')))
  })
}

export async function standardizeVoiceProfile(voiceProfileId: string) {
  const catalog = await loadCatalog()
  const profile = catalog.profiles.find((item) => item.voiceProfileId === voiceProfileId)
  if (!profile) throw new Error('不存在的 voiceProfileId')
  if (profile.quality !== 'approved') throw new Error('只能标准化已审核声音档案')
  const root = await sourceRoot()
  const input = path.resolve(root, profile.sourceRelativePath)
  if (!isInside(root, input)) throw new Error('音色源路径越界')
  const output = path.join(libraryDir(), 'reference', `${profile.voiceProfileId}.wav`)
  try {
    await fs.promises.access(input)
    await fs.promises.mkdir(path.dirname(output), { recursive: true })
    await runFfmpeg(['-i', input, '-vn', '-ac', '1', '-ar', '16000', '-af', 'silenceremove=start_periods=1:start_duration=0.1:start_threshold=-50dB:stop_periods=1:stop_duration=0.1:stop_threshold=-50dB', output])
    profile.referenceRelativePath = `reference/${profile.voiceProfileId}.wav`
    profile.cloneReady = true
  } catch (error) {
    profile.cloneReady = false
    await saveCatalog(catalog)
    throw error
  }
  await saveCatalog(catalog)
  await renderVoiceLibrary(catalog)
  return profile.referenceRelativePath
}

export async function renderVoiceLibrary(catalog?: VoiceCatalog) {
  catalog ||= await loadCatalog()
  const approved = catalog.profiles.filter((profile) => profile.quality === 'approved')
  const dir = libraryDir()
  await write(path.join(dir, '音色索引.md'), `# 音色索引\n\n已审核：${approved.length}；待审核：${catalog.profiles.length - approved.length}\n\n- [[分类/英语人物音色]]\n- [[分类/男性青年]]\n- [[分类/女性青年]]\n- [[分类/老年]]\n- [[分类/旁白与广告]]\n- [[分类/角色化]]\n`)
  const english = approved.filter((profile) => profile.language === 'English').map((profile) => `- [[音色/${profile.voiceProfileId}|${profile.displayName}]]`).join('\n') || '暂无已审核英语音色。'
  await write(path.join(dir, '分类', '英语人物音色.md'), `# 英语人物音色\n\n${english}\n`)
  for (const [name, tag] of [['男性青年', '男声'], ['女性青年', '女声'], ['老年', '老年'], ['旁白与广告', '旁白'], ['角色化', '角色化']] as const) {
    const rows = approved.filter((profile) => profile.tags.includes(tag) || profile.roleTags.includes(tag)).map((profile) => `- [[音色/${profile.voiceProfileId}|${profile.displayName}]]`).join('\n') || '暂无已审核音色。'
    await write(path.join(dir, '分类', `${name}.md`), `# ${name}\n\n${rows}\n`)
  }
  for (const profile of approved) await write(path.join(dir, '音色', `${profile.voiceProfileId}.md`), await profileMarkdown(profile))
}

async function profileMarkdown(profile: VoiceProfile) {
  const root = path.join(app.getPath('userData'), 'media-runs')
  const uses: string[] = []
  for (const projectId of await fs.promises.readdir(root).catch(() => [] as string[])) {
    const roleDir = path.join(root, projectId, 'wiki', '声音', '角色')
    for (const name of await fs.promises.readdir(roleDir).catch(() => [] as string[])) {
      const content = await fs.promises.readFile(path.join(roleDir, name), 'utf8').catch(() => '')
      if (content.includes(`voiceProfileId: ${profile.voiceProfileId}`)) uses.push(`- ${projectId}: [[声音/角色/${path.basename(name, '.md')}]]`)
    }
  }
  return `---\nvoiceProfileId: ${profile.voiceProfileId}\nsourceGroup: ${JSON.stringify(profile.sourceGroup)}\nrights: ${profile.rights}\n---\n\n# ${profile.displayName}\n\n- 来源：${profile.sourceRelativePath}\n- 语言：${profile.language || '待人工确认'}\n- SHA-256：\`${profile.sourceSha256}\`\n- 标签：${profile.tags.join('、') || '待人工确认'}\n- 参考音频：${profile.referenceRelativePath ? `[[${profile.referenceRelativePath}]]` : '未生成'}\n\n## 使用关系\n\n${uses.join('\n') || '暂无。'}\n`
}

export async function bindProjectVoice(projectId: string, speakerId: string, voiceProfileId: string, taskId?: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(speakerId)) throw new Error('无效的角色 ID')
  const profile = (await loadCatalog()).profiles.find((item) => item.voiceProfileId === voiceProfileId)
  if (!profile) throw new Error('不存在的 voiceProfileId')
  if (profile.quality !== 'approved' || profile.rights !== 'commercial-cleared') throw new Error('只能绑定已审核且已授权的声音档案')
  await write(path.join(libraryDir(), '音色', `${profile.voiceProfileId}.md`), await profileMarkdown(profile))
  const { listProjectMarkdown, readProjectMarkdown, writeProjectMarkdown } = await import('./media-workspace.ts')
  const narrator = speakerId.startsWith('narrator-')
  if (narrator) {
    const shots = (await listProjectMarkdown(projectId)).filter((item) => item.startsWith('wiki/分镜/镜头/'))
    const confirmed = await Promise.all(shots.map((item) => readProjectMarkdown(projectId, item)))
    if (!confirmed.some((item) => new RegExp(`说话者ID[：:]?\\s*${speakerId}(?:\\s|$)`).test(item.content)))
      throw new Error('旁白声音只能绑定当前确认分镜实际使用的 narrator ID')
  } else {
    const asset = await readProjectMarkdown(projectId, `wiki/资产/角色/${speakerId}.md`).catch(() => null)
    if (!asset || !new RegExp(`^entityId:\\s*${speakerId}\\s*$`, 'm').test(asset.content))
      throw new Error('声音绑定必须引用项目内已确认的角色 entityId')
  }
  const voicePath = `wiki/声音/角色/${speakerId}.md`
  const taskLink = taskId ? `\n当前配音任务：[[声音/配音任务/${taskId}]]` : ''
  const content = `---\nentityType: ${narrator ? 'narrator-voice' : 'character-voice'}\nspeakerId: ${speakerId}\nvoiceProfileId: ${voiceProfileId}\nstatus: approved\n---\n\n# ${speakerId} 的${narrator ? '旁白' : '角色'}声音\n\n声音档案：[[声音库/音色/${voiceProfileId}]]${narrator ? '' : `\n角色页面：[[资产/角色/${speakerId}]]`}${taskLink}\n`
  const current = await readProjectMarkdown(projectId, voicePath).catch(() => null)
  await writeProjectMarkdown(projectId, voicePath, content, current?.revision)
  if (taskId) {
    const taskPath = `wiki/声音/配音任务/${taskId}.md`
    const task = await readProjectMarkdown(projectId, taskPath).catch(() => null)
    await writeProjectMarkdown(projectId, taskPath, `# ${taskId}\n\n角色声音：[[声音/角色/${speakerId}]]\n声音档案：[[声音库/音色/${voiceProfileId}]]\n`, task?.revision)
  }
  await write(path.join(libraryDir(), '音色', `${profile.voiceProfileId}.md`), await profileMarkdown(profile))
  return { voicePath, libraryPath: path.join(libraryDir(), '音色', `${voiceProfileId}.md`) }
}

export function getVoiceLibraryDir() { return libraryDir() }
export function getVoicePackDir(voiceProfileId: string) {
  if (!/^voice-[A-Za-z0-9_-]+$/.test(voiceProfileId)) throw new Error('无效的 voiceProfileId')
  return path.join(libraryDir(), 'packs', voiceProfileId)
}
