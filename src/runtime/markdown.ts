import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { managedMediaUrl } from './managedMediaUrl.ts'

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderMarkdown(content: string, projectId = '', currentPath = '') {
  const withoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n?/, '')
  const linked = withoutFrontmatter.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => {
    const href = `wiki:${encodeURIComponent(String(target).replace(/\.md$/, ''))}`
    return `[${label || target}](${href})`
  })
  const renderer = new marked.Renderer()
  renderer.html = ({ text }) => escapeHtml(text)
  renderer.link = ({ href, title, tokens }) => {
    const safeHref = mediaHref(href, projectId, currentPath)
    return `<a href="${escapeHtml(safeHref)}"${title ? ` title="${escapeHtml(title)}"` : ''}>${renderer.parser.parseInline(tokens)}</a>`
  }
  renderer.image = ({ href, title, text }) => {
    const safeHref = mediaHref(href, projectId, currentPath)
    return `<img src="${escapeHtml(safeHref)}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ''}>`
  }
  const html = marked.parse(linked, { gfm: true, breaks: true, renderer }) as string
  const purify = DOMPurify as typeof DOMPurify & { default?: typeof DOMPurify }
  const sanitize = purify.sanitize || purify.default?.sanitize
  if (typeof sanitize === 'function') {
    return sanitize(html, {
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|wiki|short-video-media):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    })
  }
  return html
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:href|src)\s*=\s*(?:"|')?javascript:[^\s>]*/gi, '')
}

function mediaHref(href: string, projectId: string, currentPath: string) {
  if (/^(wiki:|https?:|mailto:|short-video-media:)/i.test(href)) return href
  if (!projectId || !currentPath || href.startsWith('#')) return '#'
  const wikiDir = currentPath.split('/').slice(0, -1)
  const parts = [...wikiDir, ...decodeURIComponent(href).split('/')]
  const resolved: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') resolved.pop()
    else resolved.push(part)
  }
  if (resolved[0] === 'wiki' || !resolved.length) return '#'
  return managedMediaUrl(projectId, resolved.join('/'))
}

export function resolveWikiLink(currentPath: string, target: string) {
  const clean = decodeURIComponent(target).replace(/^wiki\//, '').replace(/\.md$/, '')
  const base = currentPath.slice('wiki/'.length).split('/').slice(0, -1)
  const parts = clean.startsWith('.') ? [...base, ...clean.split('/')] : clean.split('/')
  const resolved: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') resolved.pop()
    else resolved.push(part)
  }
  return `wiki/${resolved.join('/')}.md`
}
