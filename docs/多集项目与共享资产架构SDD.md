# 多集项目与共享资产架构 SDD

> 日期：2026-08-04
> 状态：已对齐，待按 TDD 串行实施
> 关联设计：`docs/资产图工作区与Markdown双链创作图谱升级SDD.md`、`docs/导演分镜时间轴与角色配音编排SDD.md`、`docs/音色库整理与角色声音Wiki索引SDD.md`

## 1. 目标

把当前“一项目一集”的实现升级为“一项目多集”：项目持有长期复用的角色、场景、道具、视觉设定和角色音色；每一集独立持有文稿、项目总监方案、分镜、媒体、剪辑时间轴、配音字幕和成片。

本设计同时修复顶部项目改名按钮无响应的问题。产品尚未发布，本轮只实现新结构，不设计旧项目迁移、兼容层或双写方案。

## 2. 已确认产品决策

1. `projectId` 继续是整个创作项目、共享资产库和项目 Wiki 的所有权边界。
2. 一个项目可以包含 1 到 100 集以上，每集拥有稳定 `episodeId`。
3. 新建项目时自动创建 `episode-001`；“新建集”只在当前项目内创建下一集，不存在“绑定集”按钮。
4. 角色、场景、道具和角色音色属于项目共享资产，不随新建集复制。
5. 文稿、项目总监本集方案、分镜、分镜图、视频、SRT、剪辑时间轴、逐句配音、字幕和成片属于当前集。
6. 项目总监是本集文稿与项目共享资产建立绑定的唯一入口。
7. 项目总监提出“复用已有资产 / 创建新资产 / 需要确认”，程序完成确定性校验，用户确认后才写入正式本集绑定。
8. 下游只读取已确认的稳定资产 ID，不再根据人名、场景名或道具名重新识别。
9. 同一个角色后续集数默认复用既有 `speakerId -> voiceProfileId`；更换项目级音色不得改写历史已生成配音。
10. 所有异步媒体任务和所有本集产物都必须带 `episodeId`，切换集不能改变任务原始写入目标。
11. 已完成集固定使用当时确认的资产版本和配音产物；项目共享资产出现新版本时，不自动使历史集失效。
12. 保持现有七阶段和三栏工作区，不增加“剧集工作台”、第四栏或第二套制作流程。

## 3. 所有权层级

```text
Project
├── 项目身份、名称和共享制作基线
├── 共享资产目录
│   ├── 角色 entityId、别名、资产版本
│   ├── 场景 entityId、别名、资产版本
│   ├── 道具 entityId、别名、资产版本
│   └── speakerId -> voiceProfileId
└── Episodes
    ├── episode-001
    │   ├── 文稿与本集项目总监方案
    │   ├── 本集资产绑定与采用版本
    │   ├── 分镜、媒体和剪辑时间轴
    │   ├── 配音、字幕和音频处理
    │   └── 成片
    ├── episode-002
    └── episode-003
```

完整业务身份为：

```text
项目：projectId
本集：projectId + episodeId
本集镜头：projectId + episodeId + shotId
共享资产：projectId + entityId
共享声音：projectId + speakerId + voiceProfileId
```

`shotId` 只需在当前集内唯一；`entityId` 必须在整个项目内稳定且唯一。

## 4. 用户流程

### 4.1 新建项目

```text
点击“新建项目”
  -> 创建 projectId、项目共享状态和固定 Wiki
  -> 自动创建 episode-001
  -> 当前集切换为第 1 集
  -> 用户输入第 1 集文稿并进入原七阶段流程
```

### 4.2 新建后续集

```text
点击“新建集”
  -> 保存当前集
  -> 创建下一个不重复 episodeId
  -> 继承项目模型默认值、画面比例、视觉基线和镜头节奏默认值
  -> 读取项目共享资产目录与角色声音绑定
  -> 当前集进入空白文稿阶段
```

不继承上一集文稿、项目总监本集结论、分镜、媒体、时间轴、配音、字幕或成片。

### 4.3 后续集资产绑定

```text
确认当前集文稿
  -> 项目总监读取项目共享基线、共享资产目录、别名和声音绑定
  -> 提取本集角色、场景、道具及文稿证据
  -> 为每项输出 reuse / create / review
  -> 程序校验 ID、类型、唯一性和冲突
  -> 项目总监页面展示本集资产绑定
  -> 用户修改或确认
  -> 正式写入本集 assetBindings
  -> 新资产进入项目共享资产目录
  -> 下游只使用确认后的 entityId 与采用版本
```

## 5. 项目总监绑定合同

### 5.1 输入

项目总监每集必须同时读取：

- 当前集确认文稿；
- 项目共享制作基线：国别、导演、整体视觉风格和长期约束；
- 项目全部共享角色、场景、道具的 `entityId`、类型、正式名称、别名和简短区分特征；
- 角色已有 `speakerId` 和音色绑定状态；
- 当前集用户明确指定的新增、复用或排除意见。

不把全部历史分镜、全部历史媒体或完整声音文件发送给文本模型。

第 1 集运行项目总监时，如果项目还没有共享制作基线，则同时生成基线草稿并由用户确认；后续集默认继承已确认基线，模型不得因新文稿静默改写国别、导演或整体视觉风格。用户主动修改共享基线时，必须作为独立的项目级修改明确确认。

### 5.2 输出

```ts
type EpisodeAssetBinding = {
  mention: string
  role: 'character' | 'scene' | 'prop'
  resolution: 'reuse' | 'create' | 'review'
  entityId?: string
  proposedEntityId?: string
  canonicalName: string
  aliases: string[]
  evidence: string
  reason: string
}

type EpisodeDirectorPlan = {
  projectId: string
  episodeId: string
  productionRoute: 'narration-promo' | 'drama'
  routeReason: string
  assetBindings: EpisodeAssetBinding[]
}
```

`reuse` 必须引用已有 `entityId`；`create` 必须提供新的、尚未占用的 `proposedEntityId`；`review` 不得进入下游。

### 5.3 匹配规则

1. 正式名称或别名在同类型资产中唯一精确命中时，可以自动提出 `reuse`。
2. 名称相同但存在多个候选、类型不一致或人物区分事实冲突时，必须输出 `review`。
3. 没有唯一已有对象时才输出 `create`，不能为同一对象重复创建不同 ID。
4. 模型可以根据人物关系、场景地点和道具用途提出候选，但不能越过程序校验直接改写项目共享资产。
5. 同一文稿里的不同称呼可以绑定同一 `entityId`；同名不同人不得因为名称相同而合并。
6. 用户在项目总监页修改映射后，用户选择优先于模型建议。

### 5.4 确定性校验

确认项目前，程序必须拒绝：

- `reuse` 引用了不存在的 ID；
- 角色提到了场景或道具 ID；
- 新 ID 与现有项目资产或本集其他新资产冲突；
- 同一文稿实体同时绑定多个资产 ID；
- 必需实体仍为 `review`；
- 项目总监返回白名单外资产但没有明确 `create` 记录；
- 模型试图修改已有资产图片、资产版本或 `voiceProfileId`。

项目总监方案确认成功后，`assetBindings` 成为本集资产白名单。资产、分镜、分镜图、视频、配音和成片阶段只能消费这份白名单。

## 6. 共享资产与版本固定

本集绑定不复制共享资产，但必须记录当时采用的版本：

```ts
type ConfirmedEpisodeAssetRef = {
  entityId: string
  role: 'character' | 'scene' | 'prop'
  assetVersionId?: string
  speakerId?: string
  voiceProfileId?: string
}
```

- `entityId` 决定“是谁 / 是什么”。
- `assetVersionId` 决定本集生图和视频实际参考哪个版本。
- `voiceProfileId` 在生成本集对白资产时写入配音记录，保证成片可复盘。
- 新集默认采用共享资产当前已确认版本。
- 后续更换共享资产当前版本，只影响尚未固定版本的新集或用户明确选择升级的当前集。
- 已完成历史集不自动重新生成，不因共享资产更新变成待处理。

## 7. 状态合同

### 7.1 项目清单

```ts
type EpisodeManifest = {
  episodeId: string
  episodeNumber: number
  title: string
  stage: WorkflowStage
  createdAt: string
  updatedAt: string
}

type ProjectManifest = {
  projectId: string
  name: string
  createdAt: string
  updatedAt: string
  episodes: EpisodeManifest[]
  lastOpenedEpisodeId: string
  wikiVersion: 2
}
```

`episodeNumber` 创建后不重排、不复用；删除和季管理不在本轮范围。

### 7.2 项目共享状态

项目共享状态只保存：

- 项目制作基线和默认模型配置；
- 项目共享角色、场景、道具及版本；
- 资产正式名称与别名；
- 角色 `speakerId -> voiceProfileId`；
- 项目级 Wiki 与资产索引状态。

### 7.3 本集状态

现有制作状态移入当前集，至少包括：

- 文稿、项目总监草稿和确认方案；
- `assetBindings` 与本集固定资产版本；
- 分镜和分镜媒体；
- 转录、剪辑时间轴和画面母版；
- 中英文配音、字幕和音频处理；
- 最终成片、当前阶段和错误状态。

渲染进程只加载“项目共享状态 + 当前集状态”，不把 100 集的完整镜头和媒体状态同时塞入 Pinia。

## 8. 物理目录

```text
<userData>/media-runs/<projectId>/
├── project.json
├── shared-state.json
├── .raw/
├── assets/                         # 项目共享资产文件
├── episodes/
│   ├── episode-001/
│   │   ├── state.json
│   │   ├── inputs/
│   │   ├── storyboards/
│   │   ├── clips/
│   │   ├── picture-master.mp4
│   │   └── final.mp4
│   └── episode-002/
└── wiki/
```

所有本集主进程写入接口必须显式接收 `projectId` 和 `episodeId`。共享资产接口只接收 `projectId + entityId`；本集媒体接口必须接收 `projectId + episodeId`，不得读取“当前 UI 正在显示哪一集”来决定写入位置。

## 9. Wiki 架构

### 9.1 项目共享页面

```text
wiki/index.md
wiki/项目/项目设定.md
wiki/资产/角色/<entityId>.md
wiki/资产/场景/<entityId>.md
wiki/资产/道具/<entityId>.md
wiki/声音/角色/<speakerId>.md
wiki/制作/index.md
```

### 9.2 本集页面与产物

```text
wiki/文稿/<episodeId>/确认文稿.md
wiki/项目总监/<episodeId>.md
wiki/分镜/<episodeId>/导演总览.md
wiki/分镜/<episodeId>/镜头/<shotId>.md
wiki/分镜图/<episodeId>/<shotId>.md
wiki/视频/<episodeId>/<shotId>.md
wiki/转录/<episodeId>/<mediaId>-whisper.json
wiki/剪辑/<episodeId>/editing-timeline.json
wiki/声音/<episodeId>/对白资产.json
wiki/声音/<episodeId>/音频处理.json
wiki/字幕/<episodeId>-zh.srt
wiki/字幕/<episodeId>-en.srt
wiki/成片/<episodeId>.md
wiki/制作/<episodeId>.md
```

`wiki/制作/<episodeId>.md` 是本集总索引，正向链接本集全部产物和使用的共享资产。共享角色、场景、道具和角色声音页面的“被引用”列表由应用根据全部本集 `assetBindings` 计算，反链使用它们的各集，不由模型重复维护。

## 10. 前端 UI

### 10.1 顶部项目与集选择

顶部保持一行：

```text
[新建项目] [项目选择器 ▼] [改项目名] | [新建集] [第 01 集 · 集标题 ▼]
```

- 新建项目自动创建第 1 集。
- 新建集自动保存当前集、创建下一集并切换过去。
- 集选择器支持按集数或标题检索，显示当前阶段。
- 切换集先保存当前集，再加载目标集；存在付费任务时允许切换，但任务仍写回原集。
- 不增加“绑定集”、复制集、删除集、拖动排序或季管理。

### 10.2 项目改名

当前前端使用 `window.prompt()`，Electron 中不会可靠显示。改为现有 Vuetify `v-dialog`：

- 点击铅笔打开项目名称输入框并自动填入当前名称；
- `Enter` 或“确认”调用现有 `renameProject(projectId, name)`；
- `Esc` 或“取消”关闭且不修改；
- 继续沿用后端 1 到 80 字符校验；
- 改名只更新 `project.json`、项目 Wiki 标题和 UI，不移动项目物理目录。

### 10.3 项目总监页

项目总监页面在现有内容下增加“本集资产绑定”，按三组显示：

```text
复用已有：陈大发 -> character-001（角色图与音色已绑定）
本集新增：地下诊所 -> scene-008
需要确认：老王 -> [候选角色 A / 候选角色 B / 创建新角色]
```

用户直接修改映射，然后使用现有“确认项目总监方案”按钮一次确认；不增加第二个“确认资产绑定”按钮。

### 10.4 资产页

资产页默认展示“本集使用”的共享资产，同时提供“项目全部”筛选。共享资产卡显示被哪些集引用；本集新增资产确认后立即进入项目共享目录。声音仍绑定在共享角色卡上，不在每集重复绑定。

## 11. 异步任务安全

所有本集任务创建时必须固定：

```ts
type EpisodeTaskOwner = {
  projectId: string
  episodeId: string
}
```

- 分镜图、视频、SRT、Gemini 时间轴、逐句配音、音频处理和成片任务必须携带 `episodeId`。
- 用户切换项目或集不取消任务，也不修改其所有权。
- 轮询成功后按任务记录的 `projectId + episodeId` 写入，不使用当前 Store 的选择值。
- 顶部任务抽屉默认显示当前集任务，并可看到同项目其他集仍在运行的数量；本轮不增加跨项目总任务中心。
- 共享资产图片任务归属 `projectId + entityId`，完成后更新共享资产版本，不直接改写任一集的固定版本。

## 12. 失效规则

| 变化 | 失效范围 |
| --- | --- |
| 修改当前集文稿 | 只失效当前集项目总监方案及下游 |
| 修改当前集资产绑定 | 只失效当前集引用变化相关镜头及下游 |
| 新建集 | 不失效任何已有集 |
| 切换集 | 不失效任何数据 |
| 新增共享资产 | 不失效已有集 |
| 共享资产新增版本 | 不自动失效已固定版本的集 |
| 用户明确升级当前集资产版本 | 只失效当前集引用该资产的镜头及下游 |
| 更换项目角色音色 | 不删除历史 WAV；尚未生成或用户明确重配的集使用新音色 |
| 项目改名 | 不失效任何制作数据或媒体 |

任何跨集批量失效、自动重生成历史成片或静默升级资产版本都不允许。

## 13. 明确不做

- 不做旧项目迁移或兼容。
- 不做跨项目共享角色、场景、道具或声音绑定。
- 不做季、卷、番外等第三层级。
- 不做集复制、删除、拖动排序或批量生成 100 集。
- 不做仅凭字符串名称的无校验绑定。
- 不让模型修改现有共享资产 ID、当前资产版本或音色绑定。
- 不把所有剧集完整状态放进一个 `state.json`。
- 不新增项目总监之外的资产识别步骤或确认按钮。

## 14. 串行实施建议

### TDD-08：项目与剧集数据边界

- 新 `ProjectManifest`、共享状态、本集状态和 episode 路径解析。
- 新项目自动创建 `episode-001`。
- 所有本集产物去除硬编码 `episode-001`，显式消费 `episodeId`。
- 验证 100 个集清单只加载当前集完整状态。

### TDD-09：顶部项目/集 UI 与项目改名

- Vuetify 项目改名对话框。
- 新建集、集选择器、保存与切换。
- 验证切集不串状态、不覆盖媒体。

### TDD-10：项目总监资产复用与新增

- 项目总监输入共享资产目录与别名。
- `reuse/create/review` 合同、确定性校验和用户修改。
- 确认后写本集资产白名单及固定版本。
- 下游只消费确认绑定。

### TDD-11：多集 Wiki、反链与异步归属

- 本集 Wiki 路径和制作总索引。
- 共享资产、角色声音到各集的计算反链。
- 全部本集异步任务固定 `projectId + episodeId`。
- 验证切集后晚返回任务仍写回原集。

以上 TDD 必须串行执行：先建立所有权和路径，再做 UI，再接项目总监绑定，最后补齐 Wiki 和异步验收。

## 15. 验收标准

1. 新建项目后顶部显示第 1 集；新建第 2 集不复制或覆盖第 1 集制作状态。
2. 项目改名对话框可打开、确认、取消，重启 APP 后名称仍存在。
3. 第 2 集能读取第 1 集已经确认的共享角色、场景、道具和音色绑定。
4. 项目总监对唯一已有角色自动提出复用同一 `entityId`，用户确认后下游保持该 ID。
5. 同名多个角色时必须要求确认，不能静默绑定或重复创建。
6. 新角色确认后只创建一个项目共享 ID，并能被第 3 集继续复用。
7. 第 1 集和第 2 集的文稿、分镜、媒体、SRT、剪辑时间轴、配音、字幕和成片物理隔离。
8. 修改第 2 集文稿不得清空第 1 集任何状态或产物。
9. 第 1 集任务在用户切到第 2 集后完成，结果仍只写回第 1 集。
10. 每集 `wiki/制作/<episodeId>.md` 完整链接本集产物和共享资产，共享资产页能反查使用它的集。
11. 所有业务写入路径不再硬编码 `episode-001`。
12. 全量测试、TypeScript 类型检查、`git diff --check` 和桌面真实切集验收通过。
