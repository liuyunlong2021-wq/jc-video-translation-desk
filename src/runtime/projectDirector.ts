import type {
  ProjectDirectorAssetDraft,
  ProjectDirectorDraft,
  ProjectDirectorPlan,
  ReferenceAsset,
  VideoRatio,
} from '../../electron/types.ts'
import type { ProductionRoute } from './productionContract.ts'

function text(value: unknown, label: string) {
  const result = String(value || '').trim()
  if (!result) throw new Error(`项目总监缺少${label}`)
  return result
}

function list(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : []
}

export function parseProjectDirectorDraft(value: any, ratio: VideoRatio, visualStyle: string) {
  if (!value || typeof value !== 'object') throw new Error('项目总监没有返回有效 JSON')
  if (!['narration-promo', 'drama'].includes(value.productionRoute))
    throw new Error('项目总监制作路线无效')
  if (!Array.isArray(value.assets)) throw new Error('项目总监缺少资产清单')
  const assets: ProjectDirectorAssetDraft[] = value.assets.map((asset: any, index: number) => {
    if (!['character', 'scene', 'prop'].includes(asset?.role))
      throw new Error(`项目总监第 ${index + 1} 项资产类型无效`)
    const identityTraits = list(asset.identityTraits)
    if (!identityTraits.length) throw new Error(`项目总监第 ${index + 1} 项缺少身份特征`)
    return {
      role: asset.role,
      label: text(asset.label, `第 ${index + 1} 项资产名称`),
      aliases: list(asset.aliases),
      description: text(asset.description, `第 ${index + 1} 项资产说明`),
      storyFunction: text(asset.storyFunction, `第 ${index + 1} 项叙事职责`),
      identityTraits,
      required: asset.required !== false,
      evidence: text(asset.evidence, `第 ${index + 1} 项来源依据`),
    }
  })
  const keys = assets.map((asset) => `${asset.role}:${asset.label.toLocaleLowerCase()}`)
  if (new Set(keys).size !== keys.length) throw new Error('项目总监资产清单包含重复实体')
  const completeness = {
    narrativeSubjectRequired: Boolean(value.completeness?.narrativeSubjectRequired),
    noCharacterReason: String(value.completeness?.noCharacterReason || '').trim(),
    warnings: list(value.completeness?.warnings),
  }
  if (completeness.narrativeSubjectRequired && !assets.some((asset) => asset.role === 'character' && asset.required))
    throw new Error('项目存在行动主体，但项目总监没有识别必需角色')
  if (!assets.some((asset) => asset.role === 'character') && !completeness.noCharacterReason)
    throw new Error('无角色项目必须说明原因')
  if (String(value.project?.aspectRatio || '').trim() !== ratio)
    throw new Error('项目总监改变了已确认画面比例')
  if (String(value.project?.visualStyle || '').trim() !== visualStyle)
    throw new Error('项目总监改变了已确认视觉风格')
  return {
    productionRoute: value.productionRoute as ProductionRoute,
    routeReason: text(value.routeReason, '路线理由'),
    project: {
      title: text(value.project?.title, '项目标题'),
      format: text(value.project?.format, '项目形式'),
      genre: text(value.project?.genre, '题材'),
      countryRegion: text(value.project?.countryRegion, '国别'),
      era: text(value.project?.era, '时代'),
      medium: text(value.project?.medium, '媒介'),
      aspectRatio: ratio,
      visualStyle,
    },
    direction: {
      director: text(value.direction?.director, '导演'),
      referenceWork: text(value.direction?.referenceWork, '参考作品'),
      rationale: text(value.direction?.rationale, '导演选择理由'),
      visualAnchor: text(value.direction?.visualAnchor, '视觉锚点'),
      colorLanguage: text(value.direction?.colorLanguage, '色彩语言'),
      cameraLanguage: text(value.direction?.cameraLanguage, '镜头语言'),
    },
    assets,
    completeness,
  } satisfies ProjectDirectorDraft
}

export function confirmProjectDirectorDraft(
  draft: ProjectDirectorDraft,
  previous: ReferenceAsset[] = [],
): { plan: ProjectDirectorPlan; assets: ReferenceAsset[] } {
  const existing = new Map(previous.map((asset) => [`${asset.role}:${asset.label.toLocaleLowerCase()}`, asset]))
  const assets = draft.assets.map((asset) => {
    const prior = existing.get(`${asset.role}:${asset.label.toLocaleLowerCase()}`)
    const id = prior?.id || `asset-${asset.role}-${crypto.randomUUID().slice(0, 8)}`
    return {
      id,
      role: asset.role,
      label: asset.label,
      aliases: asset.aliases,
      description: asset.description,
      storyFunction: asset.storyFunction,
      evidence: asset.evidence,
      identityTraits: asset.identityTraits,
      styleRequirements: [draft.project.visualStyle, draft.direction.visualAnchor],
      required: asset.required,
      status: 'planned' as const,
      versions: prior?.versions || [],
      activeVersionId: prior?.activeVersionId,
      pendingVersionId: prior?.pendingVersionId,
      generatedBySkill: 'jc-film-style',
      sourceDocument: 'wiki/项目/项目总监.md',
    }
  })
  return {
    plan: { ...draft, assets: assets.map(({ id }, index) => ({ ...draft.assets[index], id })) },
    assets,
  }
}

export function projectDirectorAssets<T extends { id: string }>(
  plan: Pick<ProjectDirectorPlan, 'assets'> | null | undefined,
  assets: T[],
) {
  if (!plan) return assets
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  return plan.assets.flatMap((asset) => {
    const current = byId.get(asset.id)
    return current ? [current] : []
  })
}

export function projectDirectorMarkdown(plan: ProjectDirectorDraft | ProjectDirectorPlan) {
  const routeLabel = plan.productionRoute === 'narration-promo' ? '旁白宣传片' : '剧情片'
  const groups = [
    ['角色', 'character'],
    ['场景', 'scene'],
    ['道具', 'prop'],
  ] as const
  const assetSections = groups.map(([label, role]) => {
    const items = plan.assets.filter((asset) => asset.role === role)
    return `## ${label}\n\n${items.map((asset) => {
      const title = 'id' in asset ? `[[资产/${label}/${asset.id}|${asset.label}]]` : asset.label
      return `- ${title}：${asset.description}；职责：${asset.storyFunction}`
    }).join('\n') || `- 无（${role === 'character' ? plan.completeness.noCharacterReason : '本项目不需要'}）`}`
  })
  return `# 项目总监\n\n- 来源：[[文稿/确认文稿]]\n- 制作路线：[[制作路线|${routeLabel}]]\n- 项目：${plan.project.title}\n- 形式与题材：${plan.project.format} / ${plan.project.genre}\n- 国别与时代：${plan.project.countryRegion} / ${plan.project.era}\n- 媒介与比例：${plan.project.medium} / ${plan.project.aspectRatio}\n- 视觉风格：${plan.project.visualStyle}\n- 导演与参考作品：${plan.direction.director}《${plan.direction.referenceWork}》\n- 选择理由：${plan.direction.rationale}\n\n## 视觉总纲\n\n- 视觉锚点：${plan.direction.visualAnchor}\n- 色彩语言：${plan.direction.colorLanguage}\n- 镜头语言：${plan.direction.cameraLanguage}\n\n${assetSections.join('\n\n')}\n\n## 完整性检查\n\n- 行动主体：${plan.completeness.narrativeSubjectRequired ? '需要，已覆盖' : `不需要：${plan.completeness.noCharacterReason}`}\n- 警告：${plan.completeness.warnings.join('；') || '无'}\n`
}

export function productionRouteMarkdown(plan: ProjectDirectorDraft | ProjectDirectorPlan) {
  const routeLabel = plan.productionRoute === 'narration-promo' ? '旁白宣传片' : '剧情片'
  return `# 制作路线\n\n- 项目总监：[[项目总监]]\n- 路线：${routeLabel}\n- 路线代码：\`${plan.productionRoute}\`\n- 判断理由：${plan.routeReason}\n- 修改方式：在项目总监页切换路线并重新确认\n`
}
