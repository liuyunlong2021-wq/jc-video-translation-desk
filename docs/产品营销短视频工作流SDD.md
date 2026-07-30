# 产品营销短视频工作流 SDD

> 已废止：本文档只描述旧的“产品营销专用”方案。当前实施以 [单核心参考资产的单镜头媒体编排工作流 SDD](%E7%9F%AD%E8%A7%86%E9%A2%91%E5%B7%A5%E5%8E%82AI%E5%8E%9F%E7%94%9F%E5%88%9B%E4%BD%9C%E6%94%B9%E9%80%A0SDD.md) 为准。

> 版本：0.1
> 日期：2026-07-30
> 状态：待实施
> 适用仓库：`/Users/by3/Documents/short-video-factory`

## 1. 一句话目标

把短视频工厂收敛为一个可分段确认的产品营销工作流：用户提供真实产品资料和产品图，应用生成 10 秒、15 秒或 30 秒口播文稿，以同一产品参考资产生成逐镜头画面和视频，最后替换为统一 Qwen TTS 配音并合成为成片。

## 2. 设计原则

1. 第一版只做好产品营销，不增加科普、历史等文稿类型。
2. 文稿、配音、视觉、分镜图、视频、合成继续分段确认；任何付费媒体任务都不能自动提交。
3. 产品图是品牌身份资产，不是普通道具；出现产品的每个分镜都必须绑定产品参考图。
4. 角色、场景和辅助道具按需生成，不要求每条广告都建立全套资产。
5. Skill 只负责创作和结构化规划；文件选择、真实路径、模型合同、付费提交、轮询、下载和持久化由应用负责。
6. 复用韭菜盒子已验证的 GPT Image 2 参考图合同：无参考图走 `/v1/images/generations`，有参考图走 `/v1/images/edits` multipart。
7. 最终镜头数量与时长以真实 TTS 音频为准，目标广告时长只约束文稿生成。
8. 不承诺生成模型能像素级还原包装文字和 Logo；第一版以参考图一致性为验收目标，像素级商品合成另立专项。

## 3. 范围

### 3.1 第一阶段必须完成

- 单一“产品营销”文稿类型。
- 10 秒、15 秒、30 秒目标时长选择。
- 原创内置 `jc-product-marketing-script` Skill。
- 用户上传 1-4 张真实产品图并预览、移除、持久化。
- 产品图作为每张相关分镜图的参考输入。
- GPT Image 2 有参考图时切换到 `/v1/images/edits`。
- 产品图、文稿、配音、分镜图、视频和成片全部进入同一托管素材库。
- 保留现有 Qwen TTS、Veo 3.1、FFmpeg、恢复、重试和分段确认能力。
- 使用一个固定的干净商业广告视觉默认值，不增加风格选择界面。

### 3.2 后续阶段

- 使用项目内 `jc-film-style` 的产品广告模式生成 3 个视觉方向并由用户选择。
- 自动判断是否需要固定角色、固定场景和辅助道具。
- 按需调用项目内 `jc-character-prompt`、`jc-scene-prompt`、`jc-prop-prompt` 的应用运行模式。
- 生成角色、场景和辅助道具参考图，并绑定到对应分镜。
- 支持跨广告复用品牌、产品、角色和场景资产。

### 3.3 明确不做

- 不在第一阶段加入其他文稿分类。
- 不把产品交给 `jc-prop-prompt` 重新设计。
- 不要求 10-15 秒产品广告创建角色卡或场景设定图。
- 不让应用内 Skill 浏览 Pinterest、读任意本机文件或写 Wiki。
- 不让模型输出真实文件路径、URL、data URL 或自行发明素材 ID。
- 不复制没有明确商业授权的 GitHub Skill 原文进入发行包。
- 不自动生成多个文稿版本、自动 A/B 投放或自动发布。
- 不引入通用工作流 DAG、第二套媒体库或第二套任务 Store。

## 4. 当前实现与缺口

### 4.1 已有能力

当前项目已经具备：

- 文稿模型：`gemini-3.6-flash`。
- 图片模型：`gpt-image-2`。
- 视频模型：`veo-3.1-generate-preview`。
- 配音应用：`rh-aiapp-voice-design`。
- 文稿确认、声音方案确认、配音、逐镜头分镜图、逐镜头视频、FFmpeg 合成。
- 托管运行目录、相对路径持久化、历史运行归档、任务恢复与单步重试。

### 4.2 文稿缺口

`electron/cloud.ts` 的 `generateScript()` 当前只有一句通用系统提示词，没有产品资料合同、目标时长、营销结构、开头规则和事实边界，导致不同诉求输出趋同。

### 4.3 参考图缺口

`generateStoryboardImage()` 当前固定向 `/v1/images/generations` 发送 JSON：

```ts
{
  model: 'gpt-image-2',
  prompt,
  n: 1,
  size,
  response_format: 'url'
}
```

请求没有产品参考图，因此文本提示词无法保证生成的是用户的真实产品。

韭菜盒子现有实现已经验证：

- GPT Image 2 支持 0-8 张参考图。
- 无图使用 `/v1/images/generations`。
- 有图使用 `/v1/images/edits`。
- 编辑请求使用 multipart，包含 `model`、`prompt`、`size`、`response_format` 和一个或多个 `image` 文件字段。
- 用户选中的图片由应用持有，模型只选择受控引用 ID。

短视频工厂应移植这条已验证合同，不建立自定义上传协议。

### 4.4 现有资产 Skill 缺口

项目内以下 Skill 是影视项目交互版：

- `skills/jc-film-style/SKILL.md`
- `skills/jc-character-prompt/SKILL.md`
- `skills/jc-scene-prompt/SKILL.md`
- `skills/jc-prop-prompt/SKILL.md`

它们依赖浏览器搜图、`view_image`、多轮选择和写文件。应用当前的 `runSkill()` 只把单个 `SKILL.md` 作为系统提示词调用文本模型，没有浏览器、文件读取或写入工具，因此不能直接加入白名单执行。后续必须为应用定义单轮 JSON 合同，且只修改项目副本，不修改用户全局 Skill。

## 5. 用户流程

```text
填写产品资料 + 选择 10/15/30 秒 + 选择比例
  -> 可提前上传产品图
  -> 生成产品营销文稿
  -> 用户编辑并确认文稿
  -> 生成声音方案
  -> 用户确认并生成配音
  -> 获取真实音频时长
  -> 形成分镜草案和资产需求
  -> 生成分镜前强制检查产品图
  -> GPT Image 2 根据产品参考图生成逐镜头首帧
  -> 用户检查/单张重生
  -> Veo 3.1 逐镜头生成视频
  -> 用户检查/单段重生
  -> FFmpeg 丢弃视频原音轨，换入统一配音并合成
```

第一阶段不展示风格选择，使用固定默认视觉：

```text
现代商业产品摄影，画面干净，产品为唯一视觉主角；真实材质，高质量棚拍或克制的生活场景，品牌色作为点缀，避免无关装饰和夸张电影化处理。
```

## 6. 文稿输入与输出

### 6.1 产品资料

```ts
type AdTargetDuration = 10 | 15 | 30

interface ProductMarketingBrief {
  productName: string
  productCategory?: string
  verifiedFacts: string
  targetAudience?: string
  marketingGoal?: string
  callToAction?: string
  targetDuration: AdTargetDuration
  ratio: '9:16' | '16:9'
}
```

约束：

- `productName`、`verifiedFacts`、`targetDuration` 必填。
- `verifiedFacts` 是文稿可使用的唯一产品事实来源，包括功能、材料、价格、活动、数据、评价和功效。
- 未提供的信息不能由 Skill 补造。
- 用户仍可使用一个主诉求文本框；UI 可把结构化字段合并成输入 JSON，不要求用户理解 JSON。

### 6.2 文稿长度

以每分钟约 200 个汉字作为生成目标：

| 目标时长 | 理论字数 | 允许生成区间 |
| --- | ---: | ---: |
| 10 秒 | 33 字 | 28-38 字 |
| 15 秒 | 50 字 | 43-58 字 |
| 30 秒 | 100 字 | 85-115 字 |

区间只用于文稿生成和提示，不作为最终剪辑时长。实际配音完成后继续使用音频真实时长和 `ceil(actualDuration / 8)` 计算镜头数。

### 6.3 产品营销 Skill

新增：

```text
skills/jc-product-marketing-script/SKILL.md
```

Skill 必须自包含。当前 `runSkill()` 不会自动加载 `references/`，第一阶段不创建无效的引用文件。

文稿方法：

1. 开头独立说明话题，并用真实痛点、具体场景、产品反差或已提供事实形成 Hook。
2. 10 秒只讲一个核心卖点；15 秒最多两个；30 秒最多三个。
3. 把功能改写为消费者能感知的使用收益，但不能扩大原始事实。
4. 结尾根据用户提供的目标生成克制 CTA；没有 CTA 时自然收束。
5. 语言必须可直接口播，使用短句，不输出标题、标签、分析、镜头、表格或 Markdown。
6. 不虚构数据、价格、限时活动、库存、用户评价、认证、性能或医疗功效。
7. 不模仿名人、主播或受版权保护的固定表达风格。

输入：

```json
{
  "productName": "产品名称",
  "productCategory": "产品类别",
  "verifiedFacts": "用户提供的真实卖点和事实",
  "targetAudience": "目标用户",
  "marketingGoal": "本条广告目标",
  "callToAction": "期望行动",
  "targetDuration": 15,
  "ratio": "9:16"
}
```

输出：

```json
{
  "text": "可直接配音的完整产品营销文稿"
}
```

应用验证：

- 只接受 `text` 一个字段。
- `text` 必须非空。
- 超出目标字数区间时提示用户重新生成或继续手动编辑，不自动截断文稿。
- 用户确认后按现有 SHA-256 合同冻结文稿。

### 6.4 外部 Skill 许可边界

- GitHub `anbeime/skill` 的产品营销 Skill 未声明可分发许可证，不进入发行包。
- GitHub `dontbesilent2025/dbskill` 使用 CC BY-NC 4.0，不能用于商业产品发行。
- 新 Skill 只能使用通用营销概念重新原创编写，不能复制上述 Skill 的段落、示例库或完整表达。
- 如果未来取得明确商业授权，再单独记录来源、许可证、修改说明和归属。

## 7. 产品参考资产

### 7.1 产品不是普通道具

产品资产用于保持真实产品的形状、比例、材质、包装、Logo 和品牌识别。`jc-prop-prompt` 可能重新设计物体，不得用于创建或替换用户的真实产品。

`jc-prop-prompt` 后续只处理非产品的关键辅助道具，例如反复出现的杯子、手机、托盘或礼盒配件。

### 7.2 上传规则

- 文稿生成阶段允许没有产品图。
- 生成第一张分镜图前，至少需要 1 张产品图。
- 第一阶段最多选择 4 张产品图，推荐正面、45 度、背面/侧面和包装细节。
- 接受 PNG、JPEG、WebP；拒绝无法读取或非图片文件。
- 产品图进入当前运行托管目录，不长期依赖用户原始绝对路径。
- 删除或替换产品图前必须使依赖的分镜图、视频和成片失效。
- 上传素材显示在中栏素材库的“输入参考”区域，不与生成结果混淆。

### 7.3 应用拥有的引用

```ts
type AdAssetRole = 'product' | 'character' | 'scene' | 'prop'

interface AdReferenceAsset {
  id: string
  role: AdAssetRole
  label: string
  relativePath: string
  mimeType: string
  source: 'upload' | 'generated'
}
```

约束：

- `id` 和 `relativePath` 只能由应用创建。
- Skill 只看到 `id`、`role` 和 `label`，不能看到真实路径。
- 提交前由应用把 `id` 解析成当前运行目录内的文件。
- 找不到文件、越出运行目录、MIME 不匹配或数量超限时禁止付费提交。
- 每个包含产品的镜头都由应用强制加入全部产品引用 ID，不能依赖模型记得添加。

### 7.4 托管目录

```text
<userData>/media-runs/<runId>/
  state.json
  run.json
  inputs/
    product-01.png
    product-02.jpg
  references/
    character-01.png
    scene-01.png
    prop-01.png
  voice/
  storyboard/
  video/
  final/
```

持久化只保存相对路径。重新打开应用时，输入参考图和已生成素材必须一并恢复。

## 8. 参考图生图合同

### 8.1 无参考图

只允许用于后续生成角色、场景或辅助道具参考图，不允许生成真实产品广告分镜：

```http
POST /v1/images/generations
Content-Type: application/json
```

```json
{
  "model": "gpt-image-2",
  "prompt": "生图提示词",
  "size": "1152x2048",
  "response_format": "url"
}
```

### 8.2 有参考图

产品广告分镜使用：

```http
POST /v1/images/edits
Content-Type: multipart/form-data
```

字段：

| 字段 | 值 |
| --- | --- |
| `model` | `gpt-image-2` |
| `prompt` | 当前镜头提示词 + 一致性约束 |
| `size` | 按现有画幅映射 |
| `response_format` | `url` |
| `image` | 一个或多个图片文件 |

短视频工厂 Electron 端直接从托管运行目录创建文件流，不把大图转换后持久化为 data URL。

### 8.3 产品一致性提示词

每个出现产品的分镜提示词必须明确：

```text
参考图中的产品是唯一产品身份。保持产品外形、比例、结构、材质、包装、Logo 位置和品牌色一致；不得发明新按钮、新文字、新配件或改变包装版本。只允许改变机位、构图、光线、背景和符合文稿的使用状态。
```

这只是模型约束，不构成像素级还原保证。真实商业交付若要求包装文字完全准确，应增加抠图与确定性合成路线，不用继续堆提示词解决。

## 9. 分镜与资产判断

### 9.1 第一阶段

第一阶段只有产品参考资产：

- 所有出现产品的镜头都绑定产品图。
- 角色只写为不具名局部人物、手部或模糊背景人物，不建立固定角色资产。
- 场景由分镜提示词描述，不生成独立场景设定图。
- 不生成辅助道具设定图。

### 9.2 后续资产需求合同

```ts
interface AdAssetRequirement {
  role: 'character' | 'scene' | 'prop'
  key: string
  required: boolean
  reason: string
  appearsInShots: number[]
}

interface AdAssetPlan {
  productRequired: true
  requirements: AdAssetRequirement[]
}
```

判断规则：

| 情况 | 是否建立固定资产 |
| --- | --- |
| 产品在任意镜头出现 | 必须绑定产品参考图 |
| 一只手只出现一次 | 不建立角色资产 |
| 同一可识别人物出现两个及以上镜头 | 建立角色资产 |
| 普通棚拍背景或只出现一次的环境 | 不建立场景资产 |
| 同一可识别环境出现两个及以上镜头 | 建立场景资产 |
| 普通辅助物件只出现一次 | 不建立道具资产 |
| 辅助物件反复出现且参与叙事 | 建立道具资产 |

分镜草案先输出镜头和资产需求，再生成必要参考资产。最终生图提示词只消费已确认资产，不边生图边改变角色或场景设定。

### 9.3 分镜输出扩展

```ts
interface ProductStoryboardSegment extends StoryboardSegment {
  productVisible: boolean
  referenceAssetIds: string[]
}

interface ProductStoryboardPlan extends StoryboardPlan {
  assetPlan: AdAssetPlan
  segments: ProductStoryboardSegment[]
}
```

应用必须验证：

- `segments.length === ceil(actualDuration / 8)`。
- 每段 4-8 秒且覆盖完整文稿。
- `productVisible === true` 时必须包含全部产品资产 ID。
- 引用 ID 必须来自当前运行资产目录。
- 单镜头仍遵守“单一连续镜头、无切镜、无背景音乐”。
- 所有引用总数不能超过 GPT Image 2 注册能力。

## 10. 产品广告视觉风格

### 10.1 第一阶段固定值

第一阶段不让用户选择风格，使用第 5 节中的默认商业产品视觉，先验证产品参考一致性。

### 10.2 第二阶段

项目内 `jc-film-style` 增加单轮 `product-ad` 模式，不调用浏览器、不写文件、不要求导演作品或 Pinterest 色卡。

输入：文稿、产品类别、受众、营销目标、产品图摘要、画幅。

输出 3 个差异明确的视觉方向：

```ts
interface ProductAdStyleOption {
  id: string
  name: string
  rationale: string
  medium: 'live-action' | 'stylized'
  palette: string
  lighting: string
  environment: string
  cameraLanguage: string
  materialTreatment: string
}
```

推荐默认覆盖：

1. 干净棚拍商业：产品细节、材质和功能优先。
2. 真实生活方式：在目标用户的使用场景中展示收益。
3. 高质感叙事广告：通过情绪和镜头语言提升品牌感。

用户只能确认其中一个；确认结果成为全局视觉锚点。更改风格只使资产计划、分镜图、视频和成片失效，不使文稿或配音失效。

## 11. 状态机

```text
draft
  -> script-generating
  -> script-generated
  -> script-approved
  -> voice-plan-ready
  -> voice-generating
  -> voice-ready
  -> references-required | references-ready
  -> storyboard-planning
  -> storyboard-ready
  -> storyboards-generating
  -> storyboards-ready
  -> videos-generating
  -> videos-ready
  -> composing
  -> completed
```

第二阶段在 `script-approved` 后增加 `style-options-ready -> style-approved`；第三阶段在分镜规划后增加 `asset-plan-ready -> assets-ready`。

## 12. 失效与重试

| 变化 | 保留 | 失效 |
| --- | --- | --- |
| 产品资料或目标时长改变 | 产品图 | 文稿及全部下游 |
| 文稿编辑或重新生成 | 产品图 | 配音、风格、资产计划、分镜图、视频、成片 |
| 配音重新生成且真实时长改变 | 文稿、产品图、风格 | 分镜图、视频、成片 |
| 产品图增加、删除或替换 | 文稿、配音、风格 | 资产计划、分镜图、视频、成片 |
| 风格改变 | 文稿、配音、产品图 | 资产计划、分镜图、视频、成片 |
| 角色/场景/道具资产改变 | 文稿、配音、产品图、风格 | 引用该资产的分镜图、对应视频、成片 |
| 单张分镜图重生 | 其他镜头 | 对应视频、成片 |
| 单段视频重生 | 其他视频 | 成片 |

重新生成必须创建新文件名，不覆盖旧文件。已经成功的付费步骤不因同阶段其他任务失败而重复提交。

## 13. 界面要求

### 13.1 左栏

- 固定显示“产品营销”。第一阶段不显示内容类型菜单。
- 目标时长使用 10 秒、15 秒、30 秒分段控件。
- 保留 9:16、16:9 比例选择。
- 产品资料输入至少包含产品名和真实卖点。
- 产品图上传使用图片按钮和缩略图，不使用路径文本框。
- 显示“可先生成文稿，生成分镜前至少上传一张产品图”。
- 文稿可编辑，继续使用“确认文稿”。

### 13.2 中栏素材库

按当前运行展示：

1. 输入参考：产品图，后续为角色/场景/辅助道具图。
2. 配音：声音方案和音频。
3. 分镜图：提示词、绑定参考资产、状态和单张重试。
4. 视频：模型名、时长、状态和单段重试。
5. 成片：播放、定位和导出。

输入参考不能因重新打开应用、修改文稿或生成新素材而消失。

### 13.3 右栏

继续使用明确按钮推进：

- 生成声音方案
- 生成配音
- 生成分镜图
- 生成视频
- 合成视频

当缺少产品图时，“生成分镜图”禁用并显示准确原因。不能提交后才报错，也不能静默退回文生图。

## 14. 文件责任

| 文件/模块 | 责任 |
| --- | --- |
| `skills/jc-product-marketing-script/SKILL.md` | 产品文稿创作和 JSON 输出合同 |
| `electron/cloud.ts` | 加载新 Skill；增加带参考图的 GPT Image 2 multipart 请求；继续负责提交、轮询和下载 |
| `electron/media-workspace.ts` | 导入产品图到运行目录，校验运行边界，生成相对路径 |
| `electron/types.ts` | 产品资料、参考资产和带引用的生图参数类型 |
| `electron/ipc.ts`、`electron/preload.ts`、`electron/electron-env.d.ts` | 暴露选择产品图和参考图生图的最小 IPC 合同 |
| `src/store/mediaTask.ts` | 保存产品资料、目标时长、参考资产、风格和资产计划；实现失效规则 |
| `src/runtime/videoWorkflow.ts` | 解析产品文稿和带引用的分镜合同，验证时长、覆盖率和引用 ID |
| `src/runtime/mediaPersistence.ts` | 把参考资产路径转为运行目录相对路径并恢复 |
| `src/views/Home/components/TextGenerate.vue` | 产品资料、目标时长、产品图上传、文稿生成和确认 |
| `src/views/Home/components/VideoManage.vue` | 展示输入参考和每个分镜绑定的资产 |
| `src/views/Home/components/VideoRender.vue` | 阶段按钮可用性与缺图原因 |
| `src/views/Home/index.vue` | 编排 Skill、配音、引用解析、分镜图、视频和合成 |
| `locales/zh-CN/common.json`、`locales/en/common.json` | 新增界面文案 |
| `src/runtime/*.test.ts` | 合同、持久化、失效和接口回归测试 |

不得为本功能新增另一套 Store、HTTP 客户端或媒体任务系统。

## 15. 分期实施

### Phase 0：文稿合同

1. 新增原创 `jc-product-marketing-script`。
2. `generateScript()` 改为调用该 Skill，并传结构化产品资料。
3. 增加 10/15/30 秒选择和字数提示。
4. 增加解析、异常提示和测试。

完成标准：三个时长都能生成只含正文的可编辑文稿，模型不能添加不存在的产品数据。

### Phase 1：真实产品参考闭环

1. 增加 1-4 张产品图选择、预览、移除和托管目录导入。
2. Store 与历史快照保存产品参考资产。
3. 移植 `/v1/images/edits` multipart 合同。
4. 每个产品镜头由应用绑定产品参考图。
5. 中栏展示输入参考，缺图时禁止生成分镜图。
6. 完成一条 10 秒产品广告的真实付费人工验收。

完成标准：重新打开应用后产品图仍存在；所有生成分镜均使用同一真实产品参考；失败重试不重复提交已成功镜头。

### Phase 2：产品广告风格

1. 为项目内 `jc-film-style` 增加应用可执行的 `product-ad` JSON 模式。
2. 生成 3 个视觉方向，用户确认一个。
3. 风格进入全局视觉锚点和失效逻辑。
4. 不修改 `/Users/by3/.agents/skills/jc-film-style`。

完成标准：同一文稿选择不同风格时产品身份不变，光线、背景和镜头语言明确改变。

### Phase 3：条件资产

1. 分镜草案输出 `AdAssetPlan`。
2. 为项目内角色、场景、道具 Skill 增加单轮应用 JSON 模式。
3. 只为跨镜头复用资产生成参考图。
4. 把确认后的资产 ID 绑定到相关分镜。
5. 总参考图数量超过模型能力时阻止提交并要求精简。

完成标准：纯产品广告不产生多余资产；需要人物或固定场景的广告在多个镜头中保持可识别一致。

### Phase 4：质量增强

- 品牌资产跨运行复用。
- 产品抠图和确定性合成，解决包装文字与 Logo 精确还原。
- 生成前素材质量检查，例如分辨率、遮挡和视角覆盖。
- 基于用户选择和重生结果迭代 Skill，而不是预先堆更多风格和模板。

## 16. 自动测试

### 16.1 文稿

- 10/15/30 秒请求进入新 Skill。
- 新 Skill 在运行时白名单中。
- 输出只接受 `{ "text": string }`。
- 空文稿拒绝；超长或过短给出提示但不截断。
- 用户确认后文稿哈希继续稳定。

### 16.2 产品资产

- 只接受受支持图片类型。
- 外部产品图复制到当前运行目录。
- 持久化只保存相对路径。
- 重启恢复产品图。
- 删除、替换产品图触发正确下游失效。
- 越出运行目录和未知资产 ID 被拒绝。

### 16.3 GPT Image 2

- 无参考图仍使用 `/v1/images/generations` JSON。
- 有参考图使用 `/v1/images/edits` multipart。
- multipart 包含正确模型、提示词、尺寸和所有图片文件。
- 产品镜头缺少产品引用时在本地拒绝，不产生付费请求。
- 响应 URL、异步任务、轮询、下载和恢复继续通过原有合同。

### 16.4 工作流

- 真实配音决定镜头数量。
- 10、15、30 秒分别形成合法的 4-8 秒镜头组合。
- 文稿、配音、产品图、风格和单镜重生遵守失效表。
- 产品参考、分镜图、视频和成片都显示在素材库。
- 合成继续丢弃 Veo 原音轨，只使用 Qwen TTS 配音。
- 所有付费阶段都需要用户明确点击。

验证命令：

```bash
PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin pnpm test
pnpm exec vue-tsc --noEmit
```

当前默认 `/opt/homebrew/bin/node` 为 Node 25 时可能触发 Vue DevTools `localStorage.getItem` 环境错误；测试应使用项目兼容的 Node 24 或 package 声明的 Node 22，不用修改业务代码掩盖该环境问题。

## 17. 人工验收

1. 选择 10 秒，输入产品名和一个真实卖点，生成约 28-38 字文稿并手动确认。
2. 不上传产品图直接点“生成分镜图”，按钮不可用并提示至少上传一张产品图。
3. 上传一张产品正面图，中栏立即显示缩略图；生成分镜时请求使用 `/v1/images/edits`。
4. 上传 2-4 张不同角度产品图，确认全部作为参考提交且没有被写入模型提示文本。
5. 检查每张分镜中的产品形状、材质、包装和品牌色是否保持可识别一致。
6. 单张分镜不合格时只重生该图，已经成功的其他图和配音不重复扣费。
7. 生成视频后只重生一个失败视频，其他视频不重复提交。
8. 合成后成片长度跟随真实配音，Veo 背景音乐和原始人声不进入成片。
9. 重启应用，确认产品图、配音、分镜图、视频、成片和任务恢复状态都存在。
10. 修改产品图，确认旧分镜、视频和成片失效，但文稿和配音保留。
11. 分别完成 15 秒和 30 秒流程，确认镜头数量按真实配音计算。
12. 对包装文字要求严格的产品记录模型偏差，不把“看起来类似”写成像素级还原通过。

## 18. 完成标准

第一阶段只有同时满足以下条件才算完成：

1. 文稿生成不再使用一句通用提示词，而是走产品营销 Skill 和目标时长合同。
2. 用户真实产品图进入托管素材库，重启后不丢失。
3. 产品广告分镜有图必走 GPT Image 2 编辑接口，没有参考图不能付费生成。
4. 应用而不是模型决定真实资产路径和每镜引用。
5. 文稿、配音、分镜图、视频和合成继续分步确认和单步重试。
6. 自动测试、TypeScript 检查和 10/15/30 秒人工矩阵有真实证据。
7. 没有把无商业授权的外部 Skill 内容打入应用发行包。
8. 没有为了第一版提前实现角色、场景、道具全套资产系统。
