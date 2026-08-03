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
  ImportedMarkdown,
  ProjectManifest,
} from './types.ts'

const RUN_ID = /^[A-Za-z0-9_-]+$/
const stateWrites = new Map<string, Promise<void>>()
const WIKI_VERSION = 1 as const

const WIKI_DIRS = [
  '.raw/提交记录',
  '.raw/导入资料',
  'wiki/文稿',
  'wiki/项目',
  'wiki/声音',
  'wiki/分镜/镜头',
  'wiki/字幕',
  'wiki/资产/角色',
  'wiki/资产/场景',
  'wiki/资产/道具',
  'wiki/分镜图',
  'wiki/视频',
  'wiki/成片',
  'inputs',
  'assets',
  'storyboards',
  'clips',
] as const

export function getRunDir(runId: string) {
  if (!RUN_ID.test(runId)) throw new Error('无效的任务 ID')
  return path.join(app.getPath('userData'), 'media-runs', runId)
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
  if (target.normalized === 'wiki/文稿/确认文稿.md' && !content.replace(/^# 确认文稿\s*/m, '').trim())
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

export async function finalizeStoryboardMarkdown(projectId: string, writtenPaths: string[]) {
  const shotPaths = writtenPaths.filter((value) => value.startsWith('wiki/分镜/镜头/'))
  if (!writtenPaths.includes('wiki/分镜/导演总览.md') || !shotPaths.length)
    throw new Error('本轮导演没有成功写入导演总览和单镜 Markdown')
  const keep = new Set(writtenPaths)
  const current = await listProjectMarkdown(projectId)
  await Promise.all(
    current
      .filter(
        (value) =>
          value.startsWith('wiki/分镜/镜头/') && !keep.has(value),
      )
      .map((value) => fs.promises.unlink(projectMarkdownPath(projectId, value).resolved)),
  )
  return writtenPaths
}

function storyboardTransactionDir(projectId: string, transactionId: string) {
  if (!RUN_ID.test(transactionId)) throw new Error('无效的分镜事务 ID')
  return path.join(getRunDir(projectId), '.storyboard-transactions', transactionId)
}

export async function beginStoryboardMarkdownUpdate(projectId: string) {
  const transactionId = randomUUID()
  const backup = storyboardTransactionDir(projectId, transactionId)
  const wiki = path.join(await ensureRunDir(projectId), 'wiki')
  await fs.promises.mkdir(backup, { recursive: true })
  await fs.promises.cp(path.join(wiki, '分镜'), path.join(backup, '分镜'), { recursive: true })
  return transactionId
}

export async function rollbackStoryboardMarkdownUpdate(projectId: string, transactionId: string) {
  const backup = storyboardTransactionDir(projectId, transactionId)
  const wiki = path.join(getRunDir(projectId), 'wiki')
  await Promise.all(
    ['分镜'].map((folder) =>
      fs.promises.rm(path.join(wiki, folder), { recursive: true, force: true }),
    ),
  )
  await fs.promises.cp(path.join(backup, '分镜'), path.join(wiki, '分镜'), { recursive: true })
  await fs.promises.rm(backup, { recursive: true, force: true })
}

export async function commitStoryboardMarkdownUpdate(
  projectId: string,
  transactionId: string,
  writtenPaths: string[],
) {
  await finalizeStoryboardMarkdown(projectId, writtenPaths)
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

function projectManifestPath(projectId: string) {
  return path.join(getRunDir(projectId), 'project.json')
}

async function writeAtomic(filePath: string, value: string) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(`${filePath}.tmp`, value, 'utf8')
  await fs.promises.rename(`${filePath}.tmp`, filePath)
}

async function readJson(filePath: string) {
  return JSON.parse(await fs.promises.readFile(filePath, 'utf8'))
}

function defaultProjectName(createdAt: string) {
  return `未命名项目 ${createdAt.slice(0, 16).replace('T', ' ')}`
}

async function ensureProjectManifest(projectId: string, stage = 'draft') {
  const filePath = projectManifestPath(projectId)
  try {
    const manifest = (await readJson(filePath)) as ProjectManifest
    if (manifest.projectId === projectId) return manifest
  } catch {
    // Legacy runs are adopted in place below.
  }
  const createdAt = new Date().toISOString()
  const manifest: ProjectManifest = {
    projectId,
    name: defaultProjectName(createdAt),
    createdAt,
    updatedAt: createdAt,
    stage,
    wikiVersion: WIKI_VERSION,
  }
  await writeAtomic(filePath, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

export async function createProject(projectId: string, stateValue: string) {
  const state = JSON.parse(stateValue)
  if (state?.runId !== projectId) throw new Error('项目状态与项目 ID 不匹配')
  await ensureRunDir(projectId)
  const manifest = await ensureProjectManifest(projectId, state.stage)
  await initializeWiki(projectId, manifest)
  if (state.approvedScript)
    await writeInitial(
      path.join(getRunDir(projectId), 'wiki/文稿/确认文稿.md'),
      managedPage(projectId, 'script', 'approved-script', `# 确认文稿\n\n${state.approvedScript}`),
    )
  await saveMediaState(projectId, stateValue)
  await setLastOpenedProject(projectId)
  return manifest
}

export async function listProjects(): Promise<ProjectManifest[]> {
  const root = path.join(app.getPath('userData'), 'media-runs')
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true })
  } catch (error: any) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const projects = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && RUN_ID.test(entry.name))
      .map(async (entry) => {
        try {
          const state = await readJson(path.join(root, entry.name, 'state.json'))
          const manifest = await ensureProjectManifest(entry.name, String(state?.stage || 'draft'))
          await initializeWiki(entry.name, manifest)
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

export async function loadProjectState(projectId: string) {
  const state = await fs.promises.readFile(path.join(getRunDir(projectId), 'state.json'), 'utf8')
  const parsed = JSON.parse(state)
  if (parsed?.runId !== projectId) throw new Error('项目状态与项目 ID 不匹配')
  await setLastOpenedProject(projectId)
  return JSON.stringify(parsed)
}

export async function renameProject(projectId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 80) throw new Error('项目名称需为 1 到 80 个字符')
  const manifest = await ensureProjectManifest(projectId)
  const updated = { ...manifest, name: trimmed, updatedAt: new Date().toISOString() }
  await writeAtomic(projectManifestPath(projectId), `${JSON.stringify(updated, null, 2)}\n`)
  const state = await readJson(path.join(getRunDir(projectId), 'state.json'))
  await renderWiki(projectId, state, updated)
  return updated
}

function projectSettingsPath() {
  return path.join(app.getPath('userData'), 'media-projects.json')
}

export async function getLastOpenedProject() {
  try {
    const value = await readJson(projectSettingsPath())
    return RUN_ID.test(value?.lastOpenedProjectId) ? String(value.lastOpenedProjectId) : null
  } catch {
    return null
  }
}

export async function setLastOpenedProject(projectId: string) {
  if (!RUN_ID.test(projectId)) throw new Error('无效的项目 ID')
  await writeAtomic(
    projectSettingsPath(),
    `${JSON.stringify({ lastOpenedProjectId: projectId }, null, 2)}\n`,
  )
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
  const pages = [
    '- [[项目|项目概览]]',
    '- [[来源索引]]',
    state.approvedScript ? '- [[文稿/确认文稿|确认文稿]]' : '',
    state.projectDirectorPlan ? '- [[项目/项目总监|项目总监]]' : '',
    state.segments?.length ? '- [[分镜/导演总览|导演分镜]]' : '',
    state.finalPath ? '- [[成片/成片|最终成片]]' : '',
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
      `# ${manifest.name}\n\n- 阶段：${String(state.stage || 'draft')}\n- 比例：${String(state.ratio || '')}\n- 目标时长：${String(state.targetDuration || '')} 秒\n- 视觉风格：${String(state.styleId || '')}`,
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
    ? '\n\n## 项目事实链\n\n- [[项目/项目总监]] ← [[文稿/确认文稿]] + Raw 原始需求 + `jc-film-style`\n'
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
      path.join(dir, 'wiki/项目/项目总监.md'),
      managedPage(
        projectId,
        'project-director',
        'project-director',
        projectDirectorMarkdown(state.projectDirectorPlan),
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
            `- [[分镜/镜头/shot-${String(shot.index).padStart(3, '0')}|镜头 ${shot.index}]]`,
        )
      const active = asset.versions?.find((version: any) => version.id === asset.activeVersionId)
      const image = active?.relativePath
        ? `\n\n![${asset.label}](${path.posix.relative(`wiki/资产/${roleFolder}`, active.relativePath)})`
        : ''
      return writeInitial(
        path.join(dir, `wiki/资产/${roleFolder}/${asset.id}.md`),
        managedPage(
          projectId,
          'asset',
          asset.id,
          `# ${asset.label}\n\n- 项目总监：[[../../项目/项目总监]]\n- 类型：${roleFolder}\n- 状态：${asset.status}\n\n${asset.description || ''}${image}\n\n## 资产设计 JSON\n\n\`\`\`json\n${JSON.stringify(asset.design || {}, null, 2)}\n\`\`\`\n\n## 参考图搜索词\n\n${asset.searchQuery || ''}\n\n## 被引用\n\n${shots.join('\n') || '无'}`,
        ),
      )
    }),
  )
  const segments = Array.isArray(state.segments) ? state.segments : []
  if (segments.length) {
    const shotLinks = segments.map(
      (shot: any) =>
        `- [[分镜/镜头/shot-${String(shot.index).padStart(3, '0')}|镜头 ${shot.index}]]`,
    )
    await writeInitial(
      path.join(dir, 'wiki/分镜/导演总览.md'),
      managedPage(
        projectId,
        'storyboard',
        'director-overview',
        `# 导演分镜\n\n- 项目总监：[[../项目/项目总监]]\n\n## 全局视觉锚点\n\n${state.visualAnchor || ''}\n\n## 镜头\n\n${shotLinks.join('\n')}`,
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
            path.join(dir, `wiki/分镜/镜头/${shotId}.md`),
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
              path.join(dir, `wiki/分镜图/${shotId}.md`),
              mediaPage(projectId, '分镜图', shotId, `镜头 ${shot.index} 分镜图`, shot.imagePath),
            ),
          )
        if (shot.videoPath)
          writes.push(
            writeAtomic(
              path.join(dir, `wiki/视频/${shotId}.md`),
              mediaPage(projectId, '视频', shotId, `镜头 ${shot.index} 视频`, shot.videoPath),
            ),
          )
        return writes
      }),
    )
  }
  if (state.finalPath) {
    await writeAtomic(
      path.join(dir, 'wiki/成片/成片.md'),
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
    originalPath,
    snapshotRelativePath: relativeRunAsset(projectId, snapshotPath),
    importedAt: new Date().toISOString(),
    contentHash: createHash('sha256').update(buffer).digest('hex'),
  }
}

export async function saveMediaState(runId: string, value: string) {
  const state = JSON.parse(value)
  if (state?.runId !== runId) throw new Error('任务状态与任务 ID 不匹配')
  const previous = stateWrites.get(runId) || Promise.resolve()
  const next = previous.then(async () => {
    await ensureRunDir(runId)
    const filePath = path.join(getRunDir(runId), 'state.json')
    await writeAtomic(filePath, `${JSON.stringify(state, null, 2)}\n`)
    const manifest = await ensureProjectManifest(runId, state.stage)
    const updated: ProjectManifest = {
      ...manifest,
      updatedAt: new Date().toISOString(),
      stage: String(state.stage || 'draft'),
      wikiPending: false,
    }
    try {
      await renderWiki(runId, state, updated)
    } catch {
      updated.wikiPending = true
    }
    await writeAtomic(projectManifestPath(runId), `${JSON.stringify(updated, null, 2)}\n`)
  })
  stateWrites.set(runId, next)
  try {
    await next
  } finally {
    if (stateWrites.get(runId) === next) stateWrites.delete(runId)
  }
}

export async function loadLatestMediaState() {
  const root = path.join(app.getPath('userData'), 'media-runs')
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true })
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && RUN_ID.test(entry.name))
      .map(async (entry) => {
        const filePath = path.join(root, entry.name, 'state.json')
        try {
          return { filePath, mtime: (await fs.promises.stat(filePath)).mtimeMs }
        } catch {
          return null
        }
      }),
  )
  for (const candidate of candidates.filter(Boolean).sort((a, b) => b!.mtime - a!.mtime)) {
    try {
      const value = await fs.promises.readFile(candidate!.filePath, 'utf8')
      const state = JSON.parse(value)
      if (RUN_ID.test(state?.runId)) return JSON.stringify(state)
    } catch {
      // Try the next recoverable run.
    }
  }
  return null
}

export function getRunAssetPath(
  runId: string,
  kind: 'voice' | 'storyboard' | 'clip' | 'picture-master' | 'final',
  index = 0,
) {
  const dir = getRunDir(runId)
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
