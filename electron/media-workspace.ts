import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { app, dialog, net } from 'electron'
import { parseBuffer } from 'music-metadata'
import { generateUniqueFileName } from './lib/tools.ts'
import { projectDirectorMarkdown } from '../src/runtime/projectDirector.ts'
import type {
  AssetVersion,
  CoreReferenceAsset,
  EpisodeSubtitleCue,
  ImportedMarkdown,
  ProjectManifest,
} from './types.ts'
import { DEFAULT_EPISODE_ID, type EditingTimeline } from '../src/runtime/productionContract.ts'
import { validateEditingTimeline } from '../src/runtime/editingTimeline.ts'

const RUN_ID = /^[A-Za-z0-9_-]+$/
const stateWrites = new Map<string, Promise<void>>()
const WIKI_VERSION = 2 as const
const PROJECT_SCHEMA_VERSION = 1 as const
const PROJECT_REGISTRY_VERSION = 1 as const
const creatingProjectRoots = new Map<string, string>()

type ProjectRegistry = {
  schemaVersion: typeof PROJECT_REGISTRY_VERSION
  lastOpenedProjectId?: string
  projects: Array<{ projectId: string; rootPath: string }>
}

const WIKI_DIRS = [
  '.raw/提交记录',
  '.raw/导入资料',
  'wiki/文稿',
  'wiki/项目',
  'wiki/声音',
  'wiki/制作',
  'wiki/分镜',
  'wiki/转录',
  'wiki/字幕',
  'wiki/字幕/素材',
  'wiki/资产/角色',
  'wiki/资产/场景',
  'wiki/资产/道具',
  'wiki/分镜图',
  'wiki/视频',
  'wiki/成片',
  'inputs',
  'assets',
] as const

const SHARED_STATE_KEYS = [
  'ratio',
  'styleId',
  'targetDuration',
  'shotPace',
  'voiceEngine',
  'localVoiceEngine',
  'voiceSource',
  'textModel',
  'videoModel',
  'referenceAssets',
  'assetPlanCompletedRoles',
] as const

function projectSettingsPath() {
  return path.join(app.getPath('userData'), 'media-projects.json')
}

function emptyProjectRegistry(): ProjectRegistry {
  return { schemaVersion: PROJECT_REGISTRY_VERSION, projects: [] }
}

function readProjectRegistry(): ProjectRegistry {
  try {
    const value = JSON.parse(fs.readFileSync(projectSettingsPath(), 'utf8'))
    if (value?.schemaVersion !== PROJECT_REGISTRY_VERSION || !Array.isArray(value.projects))
      return emptyProjectRegistry()
    return {
      schemaVersion: PROJECT_REGISTRY_VERSION,
      lastOpenedProjectId: RUN_ID.test(value.lastOpenedProjectId) ? value.lastOpenedProjectId : undefined,
      projects: value.projects
        .filter((item: any) => RUN_ID.test(item?.projectId) && path.isAbsolute(item?.rootPath || ''))
        .map((item: any) => ({ projectId: String(item.projectId), rootPath: path.resolve(item.rootPath) })),
    }
  } catch {
    return emptyProjectRegistry()
  }
}

async function writeProjectRegistry(registry: ProjectRegistry) {
  await writeAtomic(projectSettingsPath(), `${JSON.stringify(registry, null, 2)}\n`)
}

export function resolveProjectRoot(projectId: string) {
  if (!RUN_ID.test(projectId)) throw new Error('无效的项目 ID')
  const creatingRoot = creatingProjectRoots.get(projectId)
  if (creatingRoot) return creatingRoot
  const entry = readProjectRegistry().projects.find((item) => item.projectId === projectId)
  if (!entry) throw new Error('项目位置未注册，请重新打开项目目录')
  return entry.rootPath
}

export function getRunDir(runId: string) {
  return resolveProjectRoot(runId)
}

export function getEpisodeDir(projectId: string, episodeId: string) {
  if (!RUN_ID.test(episodeId)) throw new Error('无效的剧集 ID')
  return path.join(getRunDir(projectId), 'episodes', episodeId)
}

export async function ensureEpisodeDir(projectId: string, episodeId: string) {
  const dir = getEpisodeDir(projectId, episodeId)
  await Promise.all(
    ['inputs', 'storyboards', 'clips'].map((name) =>
      fs.promises.mkdir(path.join(dir, name), { recursive: true }),
    ),
  )
  return dir
}

function projectMarkdownPath(projectId: string, relativePath: string) {
  const normalized = path.posix.normalize(String(relativePath || '').replace(/\\/g, '/'))
  if (!normalized.startsWith('wiki/') || !normalized.endsWith('.md') || normalized.includes('..')) {
    throw new Error('只能访问当前项目 wiki 目录内的 Markdown 文件')
  }
  const root = path.resolve(getRunDir(projectId), 'wiki')
  const resolved = path.resolve(getRunDir(projectId), normalized)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error('Wiki 路径越界')
  return { normalized, resolved }
}

function markdownRevision(content: string) {
  return createHash('sha256').update(content).digest('hex')
}

export async function listProjectMarkdown(projectId: string) {
  const root = path.join(await ensureRunDir(projectId), 'wiki')
  const files: string[] = []
  const visit = async (dir: string) => {
    for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
      const child = path.join(dir, entry.name)
      if (entry.isDirectory()) await visit(child)
      else if (entry.isFile() && entry.name.endsWith('.md'))
        files.push(path.posix.join('wiki', path.relative(root, child).split(path.sep).join('/')))
    }
  }
  await visit(root)
  return files.sort()
}

export async function readProjectMarkdown(projectId: string, relativePath: string) {
  const target = projectMarkdownPath(projectId, relativePath)
  const content = await fs.promises.readFile(target.resolved, 'utf8')
  return { path: target.normalized, content, revision: markdownRevision(content) }
}

export async function writeProjectMarkdown(
  projectId: string,
  relativePath: string,
  content: string,
  expectedRevision?: string,
) {
  const target = projectMarkdownPath(projectId, relativePath)
  if (Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024) throw new Error('Markdown 不能超过 2 MB')
  if (content.includes('\u0000')) throw new Error('Markdown 包含无效字符')
  if (/^wiki\/文稿\/[^/]+\/确认文稿\.md$/.test(target.normalized) && !content.replace(/^# 确认文稿\s*/m, '').trim())
    throw new Error('确认文稿不能为空')
  let current = ''
  let exists = true
  try {
    current = await fs.promises.readFile(target.resolved, 'utf8')
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error
    exists = false
  }
  if (exists && expectedRevision === undefined)
    throw new Error('文件已存在，请先读取后使用 edit 按版本修改')
  if (expectedRevision && markdownRevision(current) !== expectedRevision)
    throw new Error('文件已被其他操作修改，请重新读取后再保存')
  const value = content.trimEnd() + '\n'
  await writeAtomic(target.resolved, value)
  return { path: target.normalized, content: value, revision: markdownRevision(value) }
}

export async function writeStoryboardMarkdownBatch(
  projectId: string,
  files: { path: string; content: string }[],
) {
  if (!Array.isArray(files) || !files.length || files.length > 100)
    throw new Error('批量写入必须包含 1 到 100 个 Markdown 文件')
  const paths = files.map((file) => projectMarkdownPath(projectId, file?.path).normalized)
  if (new Set(paths).size !== paths.length) throw new Error('批量写入包含重复路径')
  const documents = []
  for (let index = 0; index < files.length; index++) {
    const current = await readProjectMarkdown(projectId, paths[index]).catch((error: any) => {
      if (error?.code === 'ENOENT') return null
      throw error
    })
    documents.push(
      await writeProjectMarkdown(
        projectId,
        paths[index],
        String(files[index]?.content || ''),
        current?.revision,
      ),
    )
  }
  return documents
}

export async function finalizeStoryboardMarkdown(projectId: string, episodeId: string, writtenPaths: string[]) {
  const prefix = `wiki/分镜/${episodeId}/`
  if (writtenPaths.some((value) => !value.startsWith(prefix)))
    throw new Error('分镜提交包含其他剧集文件')
  const shotPaths = writtenPaths.filter((value) => value.startsWith(`${prefix}镜头/`))
  if (!writtenPaths.includes(`${prefix}导演总览.md`) || !shotPaths.length)
    throw new Error('本轮导演没有成功写入导演总览和单镜 Markdown')
  const keep = new Set(writtenPaths)
  const current = await listProjectMarkdown(projectId)
  await Promise.all(
    current
      .filter(
        (value) =>
          value.startsWith(`${prefix}镜头/`) && !keep.has(value),
      )
      .map((value) => fs.promises.unlink(projectMarkdownPath(projectId, value).resolved)),
  )
  return writtenPaths
}

function storyboardTransactionDir(projectId: string, transactionId: string) {
  if (!RUN_ID.test(transactionId)) throw new Error('无效的分镜事务 ID')
  return path.join(getRunDir(projectId), '.storyboard-transactions', transactionId)
}

export async function beginStoryboardMarkdownUpdate(projectId: string, episodeId: string) {
  getEpisodeDir(projectId, episodeId)
  const transactionId = randomUUID()
  const backup = storyboardTransactionDir(projectId, transactionId)
  const wiki = path.join(await ensureRunDir(projectId), 'wiki')
  await Promise.all([
    fs.promises.mkdir(backup, { recursive: true }),
    fs.promises.mkdir(path.join(wiki, '分镜', episodeId), { recursive: true }),
  ])
  await fs.promises.cp(path.join(wiki, '分镜', episodeId), path.join(backup, '分镜'), { recursive: true })
  return transactionId
}

export async function rollbackStoryboardMarkdownUpdate(projectId: string, episodeId: string, transactionId: string) {
  const backup = storyboardTransactionDir(projectId, transactionId)
  const wiki = path.join(getRunDir(projectId), 'wiki')
  await fs.promises.rm(path.join(wiki, '分镜', episodeId), { recursive: true, force: true })
  await fs.promises.cp(path.join(backup, '分镜'), path.join(wiki, '分镜', episodeId), { recursive: true })
  await fs.promises.rm(backup, { recursive: true, force: true })
}

export async function commitStoryboardMarkdownUpdate(
  projectId: string,
  episodeId: string,
  transactionId: string,
  writtenPaths: string[],
) {
  await finalizeStoryboardMarkdown(projectId, episodeId, writtenPaths)
  await fs.promises.rm(storyboardTransactionDir(projectId, transactionId), {
    recursive: true,
    force: true,
  })
  return writtenPaths
}

export async function ensureRunDir(runId: string) {
  const dir = getRunDir(runId)
  await Promise.all(
    WIKI_DIRS.map((relativePath) =>
      fs.promises.mkdir(path.join(dir, relativePath), { recursive: true }),
    ),
  )
  return dir
}

export async function writeEditingTimeline(runId: string, episodeId: string, timeline: EditingTimeline) {
  validateEditingTimeline(timeline)
  getEpisodeDir(runId, episodeId)
  const filePath = path.join(await ensureRunDir(runId), 'wiki', '剪辑', episodeId, 'editing-timeline.json')
  await writeAtomic(filePath, `${JSON.stringify(timeline, null, 2)}\n`)
  return relativeRunAsset(runId, filePath)
}

function srtTime(ms: number) {
  const value = Math.max(0, Math.round(ms))
  const hours = Math.floor(value / 3_600_000)
  const minutes = Math.floor((value % 3_600_000) / 60_000)
  const seconds = Math.floor((value % 60_000) / 1000)
  const millis = value % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`
}

export async function writeEpisodeSubtitles(
  runId: string,
  episodeId: string,
  language: 'zh' | 'en',
  cues: EpisodeSubtitleCue[],
) {
  if (!['zh', 'en'].includes(language)) throw new Error('字幕语言无效')
  for (const cue of cues) {
    if (!cue.shotId?.trim() || !cue.text?.trim() || cue.startMs < 0 || cue.endMs <= cue.startMs)
      throw new Error(`${cue.shotId || '未知镜头'} 字幕时间轴无效`)
  }
  const content = cues.map((cue, index) =>
    `${index + 1}\n${srtTime(cue.startMs)} --> ${srtTime(cue.endMs)}\n${cue.text.trim()}\n`,
  ).join('\n')
  getEpisodeDir(runId, episodeId)
  const filePath = path.join(await ensureRunDir(runId), 'wiki', '字幕', `${episodeId}-${language}.srt`)
  await writeAtomic(filePath, content)
  return relativeRunAsset(runId, filePath)
}

export async function writeFinalArtifacts(
  runId: string,
  episodeId: string,
  finalPath: string,
  audioMode: import('../src/runtime/productionContract.ts').AudioMode,
) {
  const relativeFinal = relativeRunAsset(runId, finalPath)
  const dir = await ensureRunDir(runId)
  await Promise.all([
    writeAtomic(
      path.join(dir, 'wiki', '成片', `${episodeId}.md`),
      managedPage(
        runId,
        'final-video',
        episodeId,
        `# ${episodeId} 成片\n\n- 制作索引：[[../制作/${episodeId}]]\n- 音频处理：[[../声音/${episodeId}/音频处理.json]]\n- 音频模式：${audioMode}\n- [打开成片](../../${relativeFinal})`,
      ),
    ),
    writeAtomic(
      path.join(dir, 'wiki', '制作', `${episodeId}.md`),
      managedPage(
        runId,
        'episode-production',
        episodeId,
        `# ${episodeId} 制作索引\n\n- [[../项目总监/${episodeId}]]\n- [[../文稿/${episodeId}/确认文稿]]\n- [[../分镜/${episodeId}/导演总览]]\n- [[../剪辑/${episodeId}/editing-timeline.json]]\n- [[../声音/${episodeId}/对白资产.json]]\n- [[../声音/${episodeId}/音频处理.json]]\n- [[../字幕/${episodeId}-zh.srt]]\n- [[../字幕/${episodeId}-en.srt]]\n- [[../成片/${episodeId}|最终成片]]`,
      ),
    ),
  ])
  return relativeFinal
}

function projectManifestPath(projectId: string) {
  return path.join(getRunDir(projectId), 'project.json')
}

async function writeAtomic(filePath: string, value: string) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${randomUUID()}.tmp`
  await fs.promises.writeFile(tempPath, value, 'utf8')
  await fs.promises.rename(tempPath, filePath)
}

async function readJson(filePath: string) {
  return JSON.parse(await fs.promises.readFile(filePath, 'utf8'))
}

async function ensureProjectManifest(projectId: string, stage = 'draft', name = '') {
  const filePath = projectManifestPath(projectId)
  try {
    const manifest = (await readJson(filePath)) as ProjectManifest
    if (
      manifest.schemaVersion === PROJECT_SCHEMA_VERSION &&
      manifest.projectId === projectId &&
      manifest.wikiVersion === WIKI_VERSION &&
      Array.isArray(manifest.episodes) &&
      RUN_ID.test(manifest.lastOpenedEpisodeId)
    ) return manifest
  } catch {
    // Create a fresh unreleased-project manifest below.
  }
  const createdAt = new Date().toISOString()
  const manifest: ProjectManifest = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId,
    name: name.trim() || path.basename(getRunDir(projectId)),
    createdAt,
    updatedAt: createdAt,
    episodes: [{
      episodeId: DEFAULT_EPISODE_ID,
      episodeNumber: 1,
      title: '第 1 集',
      stage,
      createdAt,
      updatedAt: createdAt,
    }],
    lastOpenedEpisodeId: DEFAULT_EPISODE_ID,
    wikiVersion: WIKI_VERSION,
  }
  await writeAtomic(filePath, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

function validateProjectRoot(rootPath: string) {
  const resolved = path.resolve(rootPath)
  if (!path.isAbsolute(resolved) || resolved === path.parse(resolved).root)
    throw new Error('请选择具体的项目文件夹')
  if (!path.basename(resolved).trim()) throw new Error('项目名称不能为空')
  return resolved
}

export async function registerProjectRoot(projectId: string, rootPath: string, makeCurrent = true) {
  const resolved = validateProjectRoot(rootPath)
  const registry = readProjectRegistry()
  registry.projects = [
    ...registry.projects.filter((item) => item.projectId !== projectId),
    { projectId, rootPath: resolved },
  ]
  if (makeCurrent) registry.lastOpenedProjectId = projectId
  await writeProjectRegistry(registry)
}

export async function createProjectAt(projectId: string, rootPath: string, stateValue: string) {
  const state = JSON.parse(stateValue)
  if (state?.runId !== projectId) throw new Error('项目状态与项目 ID 不匹配')
  if (state?.episodeId !== DEFAULT_EPISODE_ID) throw new Error('新项目必须从默认首集开始')
  const resolved = validateProjectRoot(rootPath)
  const rootExisted = fs.existsSync(resolved)
  if (rootExisted) {
    if (!fs.statSync(resolved).isDirectory()) throw new Error('请选择项目文件夹')
    const entries = await fs.promises.readdir(resolved)
    if (entries.includes('project.json')) throw new Error('该文件夹已经是项目，请使用“打开已有项目目录”')
    if (entries.length) throw new Error('请选择空文件夹作为新项目目录')
  }
  creatingProjectRoots.set(projectId, resolved)
  try {
    await ensureRunDir(projectId)
    const manifest = await ensureProjectManifest(projectId, state.stage, path.basename(resolved))
    await initializeWiki(projectId, manifest)
    if (state.approvedScript)
      await writeInitial(
        path.join(getRunDir(projectId), 'wiki', '文稿', state.episodeId, '确认文稿.md'),
        managedPage(projectId, 'script', 'approved-script', `# 确认文稿\n\n${state.approvedScript}`),
      )
    await saveMediaState(projectId, state.episodeId, stateValue)
    await registerProjectRoot(projectId, resolved)
    return manifest
  } catch (error) {
    if (rootExisted) {
      await Promise.all(
        ['project.json', 'shared-state.json', 'run.json', 'episodes', '.raw', 'wiki', 'inputs', 'assets']
          .map((entry) => fs.promises.rm(path.join(resolved, entry), { recursive: true, force: true })),
      )
    } else {
      await fs.promises.rm(resolved, { recursive: true, force: true })
    }
    throw error
  } finally {
    creatingProjectRoots.delete(projectId)
  }
}

export async function createProject(projectId: string, stateValue: string) {
  const result = await dialog.showOpenDialog({
    title: '选择或新建项目文件夹',
    buttonLabel: '创建项目',
    defaultPath: app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return createProjectAt(projectId, result.filePaths[0], stateValue)
}

export async function listProjects(): Promise<ProjectManifest[]> {
  const projects = await Promise.all(
    readProjectRegistry().projects.map(async (entry) => {
        try {
          const manifest = (await readJson(path.join(entry.rootPath, 'project.json'))) as ProjectManifest
          if (
            manifest.schemaVersion !== PROJECT_SCHEMA_VERSION ||
            manifest.projectId !== entry.projectId ||
            manifest.wikiVersion !== WIKI_VERSION
          )
            return null
          await initializeWiki(entry.projectId, manifest)
          return manifest
        } catch {
          return null
        }
      }),
  )
  return projects
    .filter((project): project is ProjectManifest => Boolean(project))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function loadProjectState(projectId: string, episodeId: string) {
  const episodeState = await readJson(path.join(getEpisodeDir(projectId, episodeId), 'state.json'))
  const sharedState = await readJson(path.join(getRunDir(projectId), 'shared-state.json'))
  const parsed = { ...episodeState, ...sharedState, runId: projectId, episodeId }
  if (episodeState?.runId !== projectId) throw new Error('项目状态与项目 ID 不匹配')
  if (episodeState?.episodeId !== episodeId) throw new Error('剧集状态与剧集 ID 不匹配')
  const manifest = await ensureProjectManifest(projectId)
  if (!manifest.episodes.some((episode) => episode.episodeId === episodeId))
    throw new Error('剧集不属于当前项目')
  manifest.lastOpenedEpisodeId = episodeId
  manifest.updatedAt = new Date().toISOString()
  await writeAtomic(projectManifestPath(projectId), `${JSON.stringify(manifest, null, 2)}\n`)
  await setLastOpenedProject(projectId)
  return JSON.stringify(parsed)
}

export async function renameProject(projectId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 80) throw new Error('项目名称需为 1 到 80 个字符')
  const manifest = await ensureProjectManifest(projectId)
  const updated = { ...manifest, name: trimmed, updatedAt: new Date().toISOString() }
  await writeAtomic(projectManifestPath(projectId), `${JSON.stringify(updated, null, 2)}\n`)
  const state = JSON.parse(await loadProjectState(projectId, updated.lastOpenedEpisodeId))
  await renderWiki(projectId, state, updated)
  return updated
}

export async function openProjectDirectory(rootPath?: string) {
  let selected = rootPath
  if (!selected) {
    const result = await dialog.showOpenDialog({
      title: '打开项目目录',
      buttonLabel: '打开项目',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    selected = result.filePaths[0]
  }
  const resolved = validateProjectRoot(selected)
  const manifest = (await readJson(path.join(resolved, 'project.json'))) as ProjectManifest
  if (
    manifest.schemaVersion !== PROJECT_SCHEMA_VERSION ||
    !RUN_ID.test(manifest.projectId) ||
    manifest.wikiVersion !== WIKI_VERSION ||
    !Array.isArray(manifest.episodes) ||
    !RUN_ID.test(manifest.lastOpenedEpisodeId)
  )
    throw new Error('所选目录不是有效的点一点项目')
  await registerProjectRoot(manifest.projectId, resolved)
  return manifest
}

export async function createEpisode(projectId: string, value: string) {
  const state = JSON.parse(value)
  if (state?.runId !== projectId) throw new Error('项目状态与项目 ID 不匹配')
  const manifest = await ensureProjectManifest(projectId)
  const usedIds = new Set(manifest.episodes.map((episode) => episode.episodeId))
  const episodeNumber = Math.max(0, ...manifest.episodes.map((episode) => episode.episodeNumber)) + 1
  let episodeId = `episode-${String(episodeNumber).padStart(3, '0')}`
  let suffix = 1
  while (usedIds.has(episodeId)) episodeId = `episode-${String(episodeNumber).padStart(3, '0')}-${suffix++}`
  const now = new Date().toISOString()
  await ensureEpisodeDir(projectId, episodeId)
  await writeAtomic(
    path.join(getEpisodeDir(projectId, episodeId), 'state.json'),
    `${JSON.stringify({ ...episodeStateOf(state), runId: projectId, episodeId, stage: 'draft' }, null, 2)}\n`,
  )
  const updated: ProjectManifest = {
    ...manifest,
    episodes: [
      ...manifest.episodes,
      { episodeId, episodeNumber, title: `第 ${episodeNumber} 集`, stage: 'draft', createdAt: now, updatedAt: now },
    ],
    lastOpenedEpisodeId: episodeId,
    updatedAt: now,
    wikiPending: false,
  }
  await writeAtomic(projectManifestPath(projectId), `${JSON.stringify(updated, null, 2)}\n`)
  return updated
}

export async function getLastOpenedProject() {
  const registry = readProjectRegistry()
  return registry.projects.some((item) => item.projectId === registry.lastOpenedProjectId)
    ? registry.lastOpenedProjectId || null
    : null
}

export async function setLastOpenedProject(projectId: string) {
  if (!RUN_ID.test(projectId)) throw new Error('无效的项目 ID')
  const registry = readProjectRegistry()
  if (!registry.projects.some((item) => item.projectId === projectId))
    throw new Error('项目位置未注册')
  registry.lastOpenedProjectId = projectId
  await writeProjectRegistry(registry)
}

const REFERENCE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
} as const

export async function importCoreReference(
  runId: string,
  sourcePath: string,
): Promise<CoreReferenceAsset> {
  const extension = path.extname(sourcePath).toLowerCase() as keyof typeof REFERENCE_TYPES
  const mimeType = REFERENCE_TYPES[extension]
  if (!mimeType) throw new Error('只支持 PNG、JPEG 或 WebP 参考图')
  const stat = await fs.promises.stat(sourcePath)
  if (!stat.isFile()) throw new Error('参考图不是可读文件')
  if (stat.size > 20 * 1024 * 1024) throw new Error('参考图不能超过 20 MB')
  await ensureRunDir(runId)
  const outputPath = generateUniqueFileName(
    path.join(getRunDir(runId), 'inputs', `core-reference${extension}`),
  )
  await fs.promises.copyFile(sourcePath, outputPath)
  return {
    id: `core-${randomUUID()}`,
    label: path.basename(sourcePath),
    relativePath: relativeRunAsset(runId, outputPath),
    mimeType,
    source: 'upload',
  }
}

export async function selectCoreReference(runId: string) {
  const result = await dialog.showOpenDialog({
    title: '选择核心参考图',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return importCoreReference(runId, result.filePaths[0])
}

export async function selectAssetImage(
  runId: string,
  assetId: string,
): Promise<AssetVersion | null> {
  if (!RUN_ID.test(assetId)) throw new Error('无效的资产 ID')
  const result = await dialog.showOpenDialog({
    title: '上传资产图',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  })
  const sourcePath = result.filePaths[0]
  if (result.canceled || !sourcePath) return null
  const extension = path.extname(sourcePath).toLowerCase() as keyof typeof REFERENCE_TYPES
  if (!REFERENCE_TYPES[extension]) throw new Error('只支持 PNG、JPEG 或 WebP 资产图')
  const stat = await fs.promises.stat(sourcePath)
  if (!stat.isFile() || stat.size > 20 * 1024 * 1024)
    throw new Error('资产图必须是小于 20 MB 的可读文件')
  const outputPath = generateUniqueFileName(
    path.join(await ensureRunDir(runId), 'assets', assetId, `upload${extension}`),
  )
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.promises.copyFile(sourcePath, outputPath)
  return {
    id: `version-${randomUUID()}`,
    source: 'upload',
    relativePath: relativeRunAsset(runId, outputPath),
    createdAt: new Date().toISOString(),
  }
}

export async function searchAssetImage(
  runId: string,
  assetId: string,
  searchQuery: string,
  rejectedPinIds: string[] = [],
): Promise<AssetVersion> {
  if (!RUN_ID.test(assetId)) throw new Error('无效的资产 ID')
  const query = searchQuery.trim()
  if (!query || query.length > 160) throw new Error('资产搜索词无效')
  const { capturePinterestReference } = await import('./pinterest-reference.ts')
  const result = await capturePinterestReference(query, rejectedPinIds)
  const outputPath = generateUniqueFileName(
    path.join(await ensureRunDir(runId), 'assets', assetId, 'search.png'),
  )
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.promises.writeFile(outputPath, result.png)
  await assertDownloadedImage(outputPath)
  return {
    id: `version-${randomUUID()}`,
    source: 'search',
    relativePath: relativeRunAsset(runId, outputPath),
    sourceUrl: result.sourceUrl,
    sourcePageUrl: result.sourcePageUrl,
    searchQuery: query,
    createdAt: new Date().toISOString(),
  }
}

async function assertDownloadedImage(filePath: string) {
  const bytes = await fs.promises.readFile(filePath)
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const webp = bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  if (!jpeg && !png && !webp) throw new Error('搜索结果不是可用图片')
}

function managedPage(projectId: string, entityType: string, entityId: string, body: string) {
  return `---\nprojectId: ${JSON.stringify(projectId)}\nentityType: ${JSON.stringify(entityType)}\nentityId: ${JSON.stringify(entityId)}\nmanagedBy: money-clips\nupdatedAt: ${JSON.stringify(new Date().toISOString())}\n---\n\n${body.trim()}\n`
}

async function writeInitial(filePath: string, value: string) {
  try {
    await fs.promises.access(filePath)
  } catch {
    await writeAtomic(filePath, value)
  }
}

async function initializeWiki(projectId: string, manifest: ProjectManifest) {
  const dir = await ensureRunDir(projectId)
  await Promise.all([
    writeInitial(
      path.join(dir, 'index.md'),
      `# ${manifest.name}\n\n- [[wiki/index|项目 Wiki]]\n- [Raw 原始提交](.raw/)\n- [媒体目录](storyboards/)\n`,
    ),
    writeInitial(path.join(dir, 'wiki/index.md'), `# ${manifest.name}\n\n[[项目]]\n`),
    writeInitial(path.join(dir, 'wiki/来源索引.md'), '# 来源索引\n'),
    writeInitial(path.join(dir, 'wiki/hot.md'), '# 当前状态\n\n阶段：draft\n'),
    writeInitial(path.join(dir, 'wiki/log.md'), '# 项目日志\n'),
  ])
}

function mediaPage(
  projectId: string,
  kind: string,
  id: string,
  title: string,
  relativePath: string,
) {
  const href = path.posix.relative(`wiki/${kind}`, relativePath)
  const embed = /\.(png|jpe?g|webp)$/i.test(relativePath)
    ? `![${title}](${href})`
    : `[打开文件](${href})`
  return managedPage(projectId, kind, id, `# ${title}\n\n${embed}`)
}

async function rawSourceRows(projectId: string) {
  const rows: string[] = []
  for (const folder of ['提交记录', '导入资料']) {
    const dir = path.join(getRunDir(projectId), '.raw', folder)
    for (const name of await fs.promises.readdir(dir).catch(() => [] as string[])) {
      const filePath = path.join(dir, name)
      const stat = await fs.promises.stat(filePath).catch(() => null)
      if (!stat?.isFile()) continue
      const content = await fs.promises.readFile(filePath)
      const hash = createHash('sha256').update(content).digest('hex')
      rows.push(`| ${name} | [查看](../.raw/${folder}/${encodeURIComponent(name)}) | \`${hash}\` |`)
    }
  }
  return rows
}

async function renderWiki(projectId: string, state: any, manifest: ProjectManifest) {
  const dir = getRunDir(projectId)
  const episodeId = String(state.episodeId || '')
  getEpisodeDir(projectId, episodeId)
  const pages = [
    '- [[项目|项目概览]]',
    '- [[来源索引]]',
    state.approvedScript ? `- [[文稿/${episodeId}/确认文稿|确认文稿]]` : '',
    state.projectDirectorPlan ? `- [[项目总监/${episodeId}|项目总监]]` : '',
    state.segments?.length ? `- [[分镜/${episodeId}/导演总览|导演分镜]]` : '',
    state.finalPath ? `- [[成片/${episodeId}|最终成片]]` : '',
  ].filter(Boolean)
  await writeAtomic(
    path.join(dir, 'index.md'),
    `# ${manifest.name}\n\n- [[wiki/index|项目 Wiki]]\n- [Raw 原始提交](.raw/)\n- [资产目录](assets/)\n- [分镜图目录](storyboards/)\n- [视频目录](clips/)\n`,
  )
  await writeAtomic(path.join(dir, 'wiki/index.md'), `# ${manifest.name}\n\n${pages.join('\n')}\n`)
  await writeAtomic(
    path.join(dir, 'wiki/项目.md'),
    managedPage(
      projectId,
      'project',
      projectId,
      `# ${manifest.name}\n\n- 项目 ID：\`${projectId}\`\n- 项目目录：${path.basename(dir)}\n- 阶段：${String(state.stage || 'draft')}\n- 比例：${String(state.ratio || '')}\n- 目标时长：${String(state.targetDuration || '')} 秒\n- 视觉风格：${String(state.styleId || '')}`,
    ),
  )
  await writeAtomic(
    path.join(dir, 'wiki/hot.md'),
    managedPage(
      projectId,
      'status',
      'hot',
      `# 当前状态\n\n阶段：${String(state.stage || 'draft')}`,
    ),
  )
  const sourceRows = await rawSourceRows(projectId)
  const directorSource = state.projectDirectorPlan
    ? `\n\n## 项目事实链\n\n- [[项目总监/${episodeId}]] ← [[文稿/${episodeId}/确认文稿]] + Raw 原始需求 + \`jc-film-style\`\n`
    : ''
  await writeAtomic(
    path.join(dir, 'wiki/来源索引.md'),
    managedPage(
      projectId,
      'index',
      'sources',
      `# 来源索引\n\n| Raw | 项目快照 | SHA-256 |\n| --- | --- | --- |\n${sourceRows.join('\n') || '| 暂无 | - | - |'}${directorSource}`,
    ),
  )
  if (state.projectDirectorPlan)
    await writeAtomic(
      path.join(dir, 'wiki', '项目总监', `${episodeId}.md`),
      managedPage(
        projectId,
        episodeId,
        'project-director',
        projectDirectorMarkdown(state.projectDirectorPlan, episodeId),
      ),
    )
  const referenceAssets = Array.isArray(state.referenceAssets) ? state.referenceAssets : []
  await Promise.all(
    referenceAssets.map((asset: any) => {
      const roleFolder = {
        character: '角色',
        scene: '场景',
        prop: '道具',
      }[asset.role as string]
      if (!roleFolder || !RUN_ID.test(String(asset.id))) return Promise.resolve()
      const shots = (state.segments || [])
        .filter((shot: any) => shot.referenceAssetIds?.includes(asset.id))
        .map(
          (shot: any) =>
            `- [[../../分镜/${episodeId}/镜头/shot-${String(shot.index).padStart(3, '0')}|镜头 ${shot.index}]]`,
        )
      const active = asset.versions?.find((version: any) => version.id === asset.activeVersionId)
      const image = active?.relativePath
        ? `\n\n![${asset.label}](${path.posix.relative(`wiki/资产/${roleFolder}`, active.relativePath)})`
        : ''
      const versions = (asset.versions || []).map((version: any) => {
        const source = { search: '搜索', upload: '上传', generated: 'AI 生成' }[version.source as string] || version.source
        return `| ${version.id} | ${source} | ${version.id === asset.activeVersionId ? '当前使用' : '参考/历史'} | \`${version.relativePath}\` | ${version.createdAt || '-'} |`
      })
      return writeAtomic(
        path.join(dir, `wiki/资产/${roleFolder}/${asset.id}.md`),
        managedPage(
          projectId,
          'asset',
          asset.id,
          `# ${asset.label}\n\n- 项目总监：[[../../项目总监/${episodeId}]]\n- 类型：${roleFolder}\n- 状态：${asset.status}\n- 当前使用版本：${asset.activeVersionId ? `\`${asset.activeVersionId}\`` : '未选择'}\n\n${asset.description || ''}${image}\n\n## 资产版本\n\n| 版本 ID | 来源 | 用途 | 项目相对路径 | 创建时间 |\n| --- | --- | --- | --- | --- |\n${versions.join('\n') || '| 暂无 | - | - | - | - |'}\n\n## 资产设计 JSON\n\n\`\`\`json\n${JSON.stringify(asset.design || {}, null, 2)}\n\`\`\`\n\n## 参考图搜索词\n\n${asset.searchQuery || ''}\n\n## 被引用\n\n${shots.join('\n') || '无'}`,
        ),
      )
    }),
  )
  const segments = Array.isArray(state.segments) ? state.segments : []
  if (segments.length) {
    const shotLinks = segments.map(
      (shot: any) =>
        `- [[镜头/shot-${String(shot.index).padStart(3, '0')}|镜头 ${shot.index}]]`,
    )
    await writeInitial(
      path.join(dir, 'wiki', '分镜', episodeId, '导演总览.md'),
      managedPage(
        projectId,
        'storyboard',
        'director-overview',
        `# 导演分镜\n\n- 项目总监：[[../../项目总监/${episodeId}]]\n\n## 全局视觉锚点\n\n${state.visualAnchor || ''}\n\n## 镜头\n\n${shotLinks.join('\n')}`,
      ),
    )
    await Promise.all(
      segments.flatMap((shot: any) => {
        const shotId = `shot-${String(shot.index).padStart(3, '0')}`
        const assetLinks = (shot.referenceAssetIds || [])
          .map((id: string) => {
            const asset = referenceAssets.find((item: any) => item.id === id)
            const roleFolder = {
              character: '角色',
              scene: '场景',
              prop: '道具',
            }[asset?.role as string]
            return roleFolder ? `[[资产/${roleFolder}/${id}|${asset.label}]]` : id
          })
          .join('、')
        const writes: Promise<void>[] = [
          writeInitial(
            path.join(dir, 'wiki', '分镜', episodeId, '镜头', `${shotId}.md`),
            managedPage(
              projectId,
              'shot',
              shotId,
              `# 镜头 ${shot.index}\n\n${shot.script || ''}\n\n- 画面：${shot.visualDescription || ''}\n- 资产：${assetLinks || '无'}\n\n## 分镜图提示词\n\n${shot.storyboardImagePrompt || ''}\n\n## 视频提示词\n\n${shot.videoPrompt || ''}`,
            ),
          ),
        ]
        if (shot.imagePath)
          writes.push(
            writeAtomic(
              path.join(dir, 'wiki', '分镜图', episodeId, `${shotId}.md`),
              mediaPage(projectId, '分镜图', shotId, `镜头 ${shot.index} 分镜图`, shot.imagePath),
            ),
          )
        if (shot.videoPath)
          writes.push(
            writeAtomic(
              path.join(dir, 'wiki', '视频', episodeId, `${shotId}.md`),
              mediaPage(projectId, '视频', shotId, `镜头 ${shot.index} 视频`, shot.videoPath),
            ),
          )
        return writes
      }),
    )
  }
  if (state.finalPath) {
    await writeAtomic(
      path.join(dir, 'wiki', '成片', `${episodeId}.md`),
      mediaPage(projectId, '成片', 'final', '最终成片', state.finalPath),
    )
  }
}

export async function saveRawSubmission(projectId: string, content: string) {
  const value = content.trim()
  if (!value) throw new Error('原始需求不能为空')
  if (Buffer.byteLength(value, 'utf8') > 512 * 1024) throw new Error('原始需求不能超过 512 KB')
  const dir = path.join(await ensureRunDir(projectId), '.raw', '提交记录')
  const count = (await fs.promises.readdir(dir)).filter((name) => name.endsWith('.md')).length + 1
  const fileName = `${String(count).padStart(4, '0')}-原始需求.md`
  await writeAtomic(path.join(dir, fileName), `${value}\n`)
  return `.raw/提交记录/${fileName}`
}

export async function importMarkdown(projectId: string): Promise<ImportedMarkdown | null> {
  const result = await dialog.showOpenDialog({
    title: '导入 Markdown',
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  const originalPath = result.filePaths[0]
  if (result.canceled || !originalPath) return null
  const stat = await fs.promises.stat(originalPath)
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024)
    throw new Error('Markdown 必须是小于 2 MB 的可读文件')
  const buffer = await fs.promises.readFile(originalPath)
  const content = buffer.toString('utf8')
  if (content.includes('\uFFFD')) throw new Error('Markdown 必须使用 UTF-8 编码')
  const dir = path.join(await ensureRunDir(projectId), '.raw', '导入资料')
  const originalName = path.basename(originalPath)
  const snapshotPath = generateUniqueFileName(path.join(dir, originalName))
  await fs.promises.copyFile(originalPath, snapshotPath)
  return {
    content,
    originalName,
    snapshotRelativePath: relativeRunAsset(projectId, snapshotPath),
    importedAt: new Date().toISOString(),
    contentHash: createHash('sha256').update(buffer).digest('hex'),
  }
}

function sharedStateOf(state: Record<string, unknown>) {
  return Object.fromEntries(
    SHARED_STATE_KEYS.filter((key) => key in state).map((key) => [key, state[key]]),
  )
}

function episodeStateOf(state: Record<string, unknown>) {
  const episodeState = { ...state }
  SHARED_STATE_KEYS.forEach((key) => delete episodeState[key])
  return episodeState
}

export async function saveMediaState(runId: string, episodeId: string, value: string) {
  const state = JSON.parse(value)
  if (state?.runId !== runId) throw new Error('任务状态与任务 ID 不匹配')
  getEpisodeDir(runId, episodeId)
  if (state?.episodeId !== episodeId) throw new Error('剧集 ID 不匹配')
  const writeKey = `${runId}:${episodeId}`
  const previous = stateWrites.get(writeKey) || Promise.resolve()
  const next = previous.then(async () => {
    await ensureRunDir(runId)
    const episodeDir = await ensureEpisodeDir(runId, episodeId)
    const sharedPath = path.join(getRunDir(runId), 'shared-state.json')
    const existingShared = await readJson(sharedPath).catch(() => ({}))
    await writeAtomic(
      sharedPath,
      `${JSON.stringify({ ...existingShared, ...sharedStateOf(state) }, null, 2)}\n`,
    )
    await writeAtomic(
      path.join(episodeDir, 'state.json'),
      `${JSON.stringify(episodeStateOf(state), null, 2)}\n`,
    )
    const manifest = await ensureProjectManifest(runId, state.stage)
    const now = new Date().toISOString()
    const currentEpisode = manifest.episodes.find((episode) => episode.episodeId === episodeId)
    if (currentEpisode) {
      currentEpisode.stage = String(state.stage || 'draft')
      currentEpisode.updatedAt = now
    } else {
      manifest.episodes.push({
        episodeId,
        episodeNumber: Math.max(0, ...manifest.episodes.map((episode) => episode.episodeNumber)) + 1,
        title: `第 ${manifest.episodes.length + 1} 集`,
        stage: String(state.stage || 'draft'),
        createdAt: now,
        updatedAt: now,
      })
    }
    const updated: ProjectManifest = {
      ...manifest,
      updatedAt: now,
      lastOpenedEpisodeId: episodeId,
      wikiPending: false,
    }
    try {
      await renderWiki(runId, state, updated)
    } catch {
      updated.wikiPending = true
    }
    await writeAtomic(projectManifestPath(runId), `${JSON.stringify(updated, null, 2)}\n`)
  })
  stateWrites.set(writeKey, next)
  try {
    await next
  } finally {
    if (stateWrites.get(writeKey) === next) stateWrites.delete(writeKey)
  }
}

export async function loadLatestMediaState() {
  const registry = readProjectRegistry()
  const candidates = await Promise.all(
    registry.projects.map(async (entry) => {
        const manifestPath = path.join(entry.rootPath, 'project.json')
        try {
          const manifest = (await readJson(manifestPath)) as ProjectManifest
          if (
            manifest.schemaVersion !== PROJECT_SCHEMA_VERSION ||
            manifest.projectId !== entry.projectId ||
            manifest.wikiVersion !== WIKI_VERSION ||
            !RUN_ID.test(manifest.lastOpenedEpisodeId)
          )
            return null
          return {
            projectId: entry.projectId,
            episodeId: manifest.lastOpenedEpisodeId,
            mtime: (await fs.promises.stat(manifestPath)).mtimeMs,
          }
        } catch {
          return null
        }
      }),
  )
  for (const candidate of candidates.filter(Boolean).sort((a, b) => b!.mtime - a!.mtime)) {
    try {
      return await loadProjectState(candidate!.projectId, candidate!.episodeId)
    } catch {
      // Try the next recoverable run.
    }
  }
  return null
}

export function getRunAssetPath(
  runId: string,
  episodeId: string,
  kind: 'voice' | 'storyboard' | 'clip' | 'picture-master' | 'final',
  index = 0,
) {
  const dir = getEpisodeDir(runId, episodeId)
  if (kind === 'voice') return path.join(dir, 'voice.mp3')
  if (kind === 'picture-master') return path.join(dir, 'picture-master.mp4')
  if (kind === 'final') return path.join(dir, 'final.mp4')
  if (!Number.isInteger(index) || index < 1) throw new Error('无效的素材序号')
  const name = String(index).padStart(3, '0')
  return path.join(
    dir,
    kind === 'storyboard' ? 'storyboards' : 'clips',
    `${name}.${kind === 'storyboard' ? 'png' : 'mp4'}`,
  )
}

export function assertRunAsset(runId: string, filePath: string) {
  const runDir = path.resolve(getRunDir(runId))
  const root = `${runDir}${path.sep}`
  const resolved = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(runDir, filePath)
  if (!resolved.startsWith(root)) throw new Error('素材不属于当前任务')
  return resolved
}

export function assertEpisodeAsset(runId: string, episodeId: string, filePath: string) {
  getEpisodeDir(runId, episodeId)
  const resolved = assertRunAsset(runId, filePath)
  const relative = relativeRunAsset(runId, resolved)
  const owned = relative.startsWith(`episodes/${episodeId}/`)
    || relative.startsWith(`wiki/声音/${episodeId}/`)
    || relative.startsWith(`wiki/转录/${episodeId}/`)
    || relative.startsWith(`wiki/字幕/素材/${episodeId}/`)
    || relative.startsWith(`wiki/剪辑/${episodeId}/`)
    || relative.startsWith(`wiki/字幕/${episodeId}-`)
  if (!owned) throw new Error('素材不属于当前剧集')
  return resolved
}

export function relativeRunAsset(runId: string, filePath: string) {
  return path.relative(getRunDir(runId), assertRunAsset(runId, filePath)).split(path.sep).join('/')
}

export async function downloadMedia(
  url: string,
  outputPath: string,
  signal?: AbortSignal,
  headers?: Record<string, string>,
) {
  assertHttpsMediaUrl(url)
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET', redirect: 'manual' })
    let redirects = 0
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve(outputPath)
    }
    const abort = () => {
      request.abort()
      finish(
        new Error(
          signal?.aborted ? '任务已停止；云端任务可能仍会继续并产生费用' : '媒体下载超时',
        ),
      )
    }
    const timeout = setTimeout(abort, 300_000)
    for (const [key, value] of Object.entries(headers || {})) request.setHeader(key, value)
    signal?.addEventListener('abort', abort, { once: true })
    request.on('redirect', (_status, _method, redirectUrl) => {
      try {
        assertHttpsMediaUrl(redirectUrl)
        if (++redirects > 3) throw new Error('媒体下载重定向过多')
        request.followRedirect()
      } catch (error) {
        request.abort()
        finish(error instanceof Error ? error : new Error(String(error)))
      }
    })
    request.on('response', (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        finish(new Error(`媒体下载失败 (HTTP ${response.statusCode})`))
        return
      }
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
      response.on('error', (error: Error) => finish(error))
      response.on('end', () => {
        void fs.promises
          .mkdir(path.dirname(outputPath), { recursive: true })
          .then(() => fs.promises.writeFile(outputPath, Buffer.concat(chunks)))
          .then(() => finish(), (error) => finish(error))
      })
    })
    request.on('error', (error) => finish(error))
    request.end()
  })
}

function assertHttpsMediaUrl(url: string) {
  if (new URL(url).protocol !== 'https:') throw new Error('媒体结果地址不安全')
}

export async function writeDataUrl(dataUrl: string, outputPath: string) {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/s)
  if (!match) throw new Error('媒体结果格式无效')
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.promises.writeFile(outputPath, Buffer.from(match[1], 'base64'))
  return outputPath
}

export async function mediaDuration(filePath: string) {
  const buffer = await fs.promises.readFile(filePath)
  const metadata = await parseBuffer(buffer)
  const duration = metadata.format.duration
  if (!duration || !Number.isFinite(duration)) throw new Error('无法读取媒体时长')
  return duration
}

export async function exportMedia(sourcePath: string) {
  const result = await dialog.showSaveDialog({
    defaultPath: path.basename(sourcePath),
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  })
  if (result.canceled || !result.filePath) return null
  await fs.promises.copyFile(sourcePath, result.filePath)
  return result.filePath
}
