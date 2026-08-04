import assert from 'node:assert/strict'
import test from 'node:test'
import {
  confirmProjectDirectorDraft,
  parseProjectDirectorDraft,
  productionRouteMarkdown,
  projectDirectorAssets,
  projectDirectorMarkdown,
} from './projectDirector.ts'

const base = {
  productionRoute: 'drama',
  routeReason: '角色行动和冲突推动剧情',
  project: { title: '点一点', format: '剧情广告', genre: '都市', countryRegion: '韩国', era: '当代', medium: '韩漫', aspectRatio: '9:16', visualStyle: '韩漫电影感' },
  direction: { director: '奉俊昊', referenceWork: '寄生虫', rationale: '空间叙事清楚', visualAnchor: '高反差韩漫', colorLanguage: '冷绿与暖黄', cameraLanguage: '稳定中景切近景' },
  assets: [{ role: 'character', label: '创作者', aliases: [], description: '使用产品完成创作的人', storyFunction: '剧情主体', identityTraits: ['青年男性', '黑色短发'], required: true, evidence: '原始需求明确一个创作者' }],
  completeness: { narrativeSubjectRequired: true, noCharacterReason: '', warnings: [] },
}

test('keeps an explicit narrative subject and assigns an app-owned asset id', () => {
  const draft = parseProjectDirectorDraft(base, '9:16', '韩漫电影感')
  assert.equal(draft.productionRoute, 'drama')
  const result = confirmProjectDirectorDraft(draft)
  assert.match(result.assets[0].id, /^asset-character-/)
  assert.match(projectDirectorMarkdown(result.plan), /创作者/)
  assert.equal(result.assets[0].sourceDocument, 'wiki/项目/项目总监.md')
})

test('accepts only a supported production route with a reason', () => {
  assert.equal(
    parseProjectDirectorDraft({ ...base, productionRoute: 'narration-promo' }, '9:16', '韩漫电影感').productionRoute,
    'narration-promo',
  )
  assert.throws(
    () => parseProjectDirectorDraft({ ...base, productionRoute: 'unknown' }, '9:16', '韩漫电影感'),
    /制作路线/,
  )
  assert.throws(
    () => parseProjectDirectorDraft({ ...base, routeReason: '' }, '9:16', '韩漫电影感'),
    /路线理由/,
  )
})

test('links the project director and production route Wiki pages', () => {
  const plan = confirmProjectDirectorDraft(parseProjectDirectorDraft(base, '9:16', '韩漫电影感')).plan
  assert.match(projectDirectorMarkdown(plan), /\[\[制作路线\|剧情片\]\]/)
  const route = productionRouteMarkdown(plan)
  assert.match(route, /\[\[项目总监\]\]/)
  assert.match(route, /角色行动和冲突推动剧情/)
})

test('treats project director asset ids as the ordered authority', () => {
  const plan = {
    assets: [{ id: 'asset-scene' }, { id: 'asset-character' }],
  } as any
  const assets = [
    { id: 'stale-asset' },
    { id: 'asset-character' },
    { id: 'asset-scene' },
  ]
  assert.deepEqual(
    projectDirectorAssets(plan, assets).map((asset) => asset.id),
    ['asset-scene', 'asset-character'],
  )
})

test('rejects a narrative plan that loses its required character', () => {
  assert.throws(
    () => parseProjectDirectorDraft({ ...base, assets: [] }, '9:16', '韩漫电影感'),
    /没有识别必需角色/,
  )
})

test('allows a deliberate no-character project only with a reason', () => {
  const draft = parseProjectDirectorDraft({
    ...base,
    assets: [{ role: 'scene', label: '海岸', aliases: [], description: '空旷海岸', storyFunction: '展示自然景观', identityTraits: ['黑色礁石'], required: true, evidence: '需求只要求无人风景' }],
    completeness: { narrativeSubjectRequired: false, noCharacterReason: '纯风景短片，没有人物', warnings: [] },
  }, '9:16', '韩漫电影感')
  assert.equal(draft.assets.some((asset) => asset.role === 'character'), false)
})
