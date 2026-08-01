import assert from 'node:assert/strict'
import test from 'node:test'
import { renderMarkdown, resolveWikiLink } from './markdown.ts'

test('renders Markdown links safely and resolves project Wiki links', () => {
  const html = renderMarkdown('# 标题\n\n[[资产/角色/小红|小红]]\n\n<img src=x onerror=alert(1)>')
  assert.match(html, /<h1>标题<\/h1>/)
  assert.match(html, /href="wiki:/)
  assert.doesNotMatch(html, /onerror/)
  assert.equal(
    resolveWikiLink('wiki/分镜/镜头/shot-001.md', '../../资产/角色/小红'),
    'wiki/资产/角色/小红.md',
  )
})

test('maps project-relative Markdown media to the managed protocol', () => {
  const html = renderMarkdown(
    '![分镜](../../storyboards/001.png)',
    'run-1',
    'wiki/分镜图/shot-001.md',
  )
  assert.match(html, /src="short-video-media:\/\/asset\?runId=run-1&amp;path=storyboards%2F001.png"/)
})
