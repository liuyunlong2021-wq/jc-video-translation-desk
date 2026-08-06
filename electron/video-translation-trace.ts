import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { getRunDir, relativeRunAsset } from './media-workspace.ts'

const writes = new Map<string, Promise<unknown>>()

function resultMarkdown(value: unknown, depth = 0): string {
  if (typeof value === 'string') return value.trim()
  if (value === null || value === undefined) return '无'
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value))
    return (
      value
        .map((item, index) => {
          const rendered = resultMarkdown(item, depth + 1)
          return `${'  '.repeat(depth)}${index + 1}. ${rendered.replace(/\n/g, `\n${'  '.repeat(depth + 1)}`)}`
        })
        .join('\n') || '无'
    )
  return (
    Object.entries(value)
      .map(([key, item]) => {
        const rendered = resultMarkdown(item, depth + 1)
        return `${'  '.repeat(depth)}- ${key}：${rendered.replace(/\n/g, `\n${'  '.repeat(depth + 1)}`)}`
      })
      .join('\n') || '无'
  )
}

async function atomicWrite(filePath: string, content: string) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${randomUUID()}.tmp`
  await fs.promises.writeFile(temporary, content)
  await fs.promises.rename(temporary, filePath)
}

export async function appendVideoTranslationTrace(
  runId: string,
  episodeId: string,
  title: string,
  model: string,
  inputs: Array<{ label: string; target: string; hash?: string }>,
  result: unknown,
) {
  if (!/^[A-Za-z0-9_-]+$/.test(episodeId)) throw new Error('剧集 ID 无效')
  const eventId = createHash('sha256')
    .update(JSON.stringify({ title, model, inputs, result }))
    .digest('hex')
    .slice(0, 16)
  const target = path.join(getRunDir(runId), 'wiki', '翻译', episodeId, '过程记录.md')
  const previous = writes.get(runId) || Promise.resolve()
  const action = async () => {
    const existing = await fs.promises
      .readFile(target, 'utf8')
      .catch((error: any) =>
        error?.code === 'ENOENT' ? `# ${episodeId} 视频翻译过程记录\n` : Promise.reject(error),
      )
    if (existing.includes(`<!-- event:${eventId} -->`)) return relativeRunAsset(runId, target)
    const block = `\n<!-- event:${eventId} -->\n## ${new Date().toISOString()} · ${title}\n\n- 事件 ID：${eventId}\n- 模型：${model}\n- 输入：${inputs.map((input) => `[[${input.target}|${input.label}]]${input.hash ? `（sha256: ${input.hash}）` : ''}`).join('、') || '无'}\n- 状态：成功\n\n### 结果\n\n${resultMarkdown(result)}\n`
    await atomicWrite(target, `${existing.trimEnd()}\n${block}`)
    return relativeRunAsset(runId, target)
  }
  const next = previous.then(action, action)
  writes.set(runId, next)
  try {
    return await next
  } finally {
    if (writes.get(runId) === next) writes.delete(runId)
  }
}

export async function writeVideoTranslationStage(
  runId: string,
  episodeId: string,
  filename: string,
  title: string,
  model: string,
  inputs: Array<{ label: string; target: string; hash?: string }>,
  result: string,
) {
  if (!/^[A-Za-z0-9_-]+$/.test(episodeId) || !/^0[1-4]-.+\.md$/.test(filename))
    throw new Error('翻译阶段文档路径无效')
  const target = path.join(getRunDir(runId), 'wiki', '翻译', episodeId, filename)
  const content = [
    `# ${title}`,
    '',
    `- 生成时间：${new Date().toISOString()}`,
    `- 模型：${model}`,
    `- 输入：${inputs.map((input) => `[[${input.target}|${input.label}]]${input.hash ? `（sha256: ${input.hash}）` : ''}`).join('、') || '无'}`,
    '',
    result.trim(),
    '',
  ].join('\n')
  await atomicWrite(target, content)
  return relativeRunAsset(runId, target)
}

export async function readVideoTranslationStage(
  runId: string,
  episodeId: string,
  filename: string,
  expectedHash?: string,
) {
  if (!/^[A-Za-z0-9_-]+$/.test(episodeId) || !/^0[1-4]-.+\.md$/.test(filename))
    throw new Error('翻译阶段文档路径无效')
  const target = path.join(getRunDir(runId), 'wiki', '翻译', episodeId, filename)
  const content = await fs.promises.readFile(target, 'utf8').catch((error: any) => {
    if (error?.code === 'ENOENT') return ''
    throw error
  })
  if (!content || (expectedHash && !content.includes(`sha256: ${expectedHash}`))) return null
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const inputIndex = lines.findIndex((line) => line.startsWith('- 输入：'))
  const result =
    inputIndex >= 0
      ? lines
          .slice(inputIndex + 2)
          .join('\n')
          .trim()
      : ''
  if (!result) return null
  return { path: relativeRunAsset(runId, target), result }
}
